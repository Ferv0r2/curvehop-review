import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, access, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, sep } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

/** Run the current production build against disposable data, never the checkout. */
export async function isolatedRuntime(files, { probe = false, delayedJobs = false, publicAssets = false } = {}) {
  const root = process.cwd();
  try { await access(join(root, ".next/BUILD_ID")); }
  catch { throw new Error("Production build missing. Run pnpm build before the isolated HTTP tests or SSR measurement."); }
  const dir = await mkdtemp(join(tmpdir(), "nextstep-runtime-"));
  let server, exited, logs = "", spawnError;
  const log = chunk => { logs = (logs + chunk).slice(-16000); };
  const local = path => {
    const target = resolve(dir, path);
    if (!target.startsWith(dir + sep)) throw new Error(`Fixture path must stay inside temporary directory: ${path}`);
    return target;
  };
  const write = async (path, text) => {
    await mkdir(dirname(local(path)), { recursive: true });
    await writeFile(local(path), text);
  };
  const stop = async () => {
    if (server && server.exitCode === null && server.signalCode === null && server.pid) {
      server.kill("SIGTERM");
      const stopped = await Promise.race([exited.then(() => true), delay(3000, false, { ref: false })]);
      if (!stopped) {
        server.kill("SIGKILL");
        const killed = await Promise.race([exited.then(() => true), delay(3000, false, { ref: false })]);
        if (!killed) throw new Error(`Temporary server did not stop; files retained at ${dir}`);
      }
    }
    await rm(dir, { recursive: true, force: true });
  };
  try {
    const socket = createServer();
    await new Promise((done, fail) => { socket.once("error", fail); socket.listen(0, "127.0.0.1", done); });
    const port = socket.address().port;
    await new Promise(done => socket.close(done));
    const origin = `http://127.0.0.1:${port}`;
    const get = async (path, options = {}) => {
      const start = performance.now();
      const response = await fetch(new URL(path, origin), { ...options, signal: options.signal ?? AbortSignal.timeout(15000) });
      const headersMs = performance.now() - start;
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, headersMs, totalMs: performance.now() - start,
        html: text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "") };
    };
    await symlink(join(root, ".next"), join(dir, ".next"), "dir");
    await symlink(join(root, "node_modules"), join(dir, "node_modules"), "dir");
    // Browser fixtures need the actual static assets; mutable data stays isolated.
    if (publicAssets) await cp(join(root, "public"), join(dir, "public"), { recursive: true });
    await write("package.json", await readFile(join(root, "package.json")));
    for (const [path, text] of Object.entries(files)) await write(path, text);
    const args = probe ? ["--require", join(root, "tests/helpers/ssr-read-probe.cjs")] : [];
    if (delayedJobs) args.push("--require", join(root, "tests/helpers/ssr-delay-jobs.cjs"));
    args.push(join(root, "node_modules/next/dist/bin/next"), "start", dir, "--hostname", "127.0.0.1", "--port", String(port));
    // No inherited preload can turn the timing run into an instrumented one.
    const { NODE_OPTIONS, SEEKER_SSR_READ_LOG, NEXTSTEP_DISCORD_WEBHOOK, ...env } = process.env;
    server = spawn(process.execPath, args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"],
      env: { ...env, NEXTSTEP_STATE_DIR: join(dir, "state"), ...(probe ? { SEEKER_SSR_READ_LOG: join(dir, "reads.jsonl") } : {}) } });
    exited = new Promise(done => { server.once("exit", done); server.once("error", error => { spawnError = error; done(); }); });
    server.stdout.setEncoding("utf8").on("data", log);
    server.stderr.setEncoding("utf8").on("data", log);
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (spawnError || server.exitCode !== null || server.signalCode !== null) break;
      try { await get("/companies", { signal: AbortSignal.timeout(1000) }); ready = true; }
      catch { await delay(100); }
    }
    if (!ready) throw new Error(`Temporary Next server failed to start. Rebuild with pnpm build.\n${spawnError?.message ?? ""}\n${logs}`);
    return { origin, get, write, stop, logs: () => logs, remove: path => rm(local(path), { force: true }),
      events: async () => {
        if (!probe) throw new Error("Read counters require probe: true (do not use for timing).");
        const lines = await readFile(join(dir, "reads.jsonl"), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
        return lines.trim() ? lines.trim().split("\n").map(line => JSON.parse(line)) : [];
      } };
  } catch (error) { await stop(); throw error; }
}
