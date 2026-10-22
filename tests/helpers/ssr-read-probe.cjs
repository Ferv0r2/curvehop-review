// Test-only preload. Synchronous logging makes this unsuitable for latency measurement.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");
const files = new Set(["jobs.json", "company-research.json", "company-relations.json"]);
if (!process.env.SEEKER_SSR_READ_LOG) throw new Error("SSR probe needs a temporary SEEKER_SSR_READ_LOG.");
for (const method of ["readFile", "open"]) {
  const original = fsp[method];
  fsp[method] = async function (file, ...args) {
    const name = typeof file === "string" && path.dirname(path.resolve(file)) === path.join(process.cwd(), "data") && path.basename(file);
    if (files.has(name)) fs.appendFileSync(process.env.SEEKER_SSR_READ_LOG, JSON.stringify({ file: name, method, pid: process.pid }) + "\n");
    return original.call(this, file, ...args);
  };
}
syncBuiltinESMExports();
