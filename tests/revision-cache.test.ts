import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rename, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { revisionCache, fileRevision } from "../lib/revision-cache";
import { prepareJob, projectJob, queryJobs } from "../lib/jobs";
import { readSnapshot } from "../lib/store";

test("revision cache observes replacements, same-size/mtime-restored edits, deletion and rollback", async t => {
  const dir = await mkdtemp(join(tmpdir(), "seeker-revisions-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "data.json"); await writeFile(file, "aaa");
  let reads = 0; const { readFile } = await import("node:fs/promises");
  const load = revisionCache(() => fileRevision([file]), async () => { reads++; return readFile(file, "utf8"); });
  assert.deepEqual(await Promise.all([load(), load(), load()]), ["aaa", "aaa", "aaa"]); assert.equal(reads, 1);
  const original = await stat(file); await writeFile(file, "bbb"); await utimes(file, original.atime, original.mtime);
  assert.equal(await load(), "bbb");
  await writeFile(join(dir, "next"), "ccc"); await rename(join(dir, "next"), file); assert.equal(await load(), "ccc");
  await rm(file); await assert.rejects(load(), /ENOENT/);
  await writeFile(file, "aaa"); assert.equal(await load(), "aaa"); assert.equal(await load(), "aaa"); assert.equal(reads, 5);
});
test("projection revision includes both files and the current day; bad results and rejected promises are not retained", async () => {
  let revision = "researchA:relationsA:day1", reads = 0, invalid = false, fail = false;
  const load = revisionCache(async () => revision, async () => { reads++; if (fail) throw Error("broken"); return { ok: !invalid, revision }; }, result => result.ok);
  await load(); await load(); assert.equal(reads, 1);
  revision = "researchA:relationsB:day1"; assert.equal((await load()).revision, revision);
  revision = "researchA:relationsB:day2"; assert.equal((await load()).revision, revision); assert.equal(reads, 3);
  invalid = true; revision = "bad"; await load(); await load(); assert.equal(reads, 5);
  invalid = false; assert.equal((await load()).ok, true);
  fail = true; revision = "error"; await assert.rejects(load(), /broken/); fail = false; assert.equal((await load()).ok, true);
});
test("an older in-flight reader cannot overwrite or return a newer revision as old data", async () => {
  let revision = "A", calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const load = revisionCache(async () => revision, async () => { calls++; const value = revision; if (value === "A") await gate; return value; });
  const older = load(); await new Promise(resolve => setImmediate(resolve));
  revision = "B"; assert.equal(await load(), "B"); release();
  assert.equal(await older, "B"); assert.equal(await load(), "B"); assert.equal(calls, 2);
});
test("continuously changing input fails boundedly instead of serving a mixed revision", async () => {
  let revision = 0, calls = 0;
  const load = revisionCache(async () => String(revision), async () => { calls++; revision++; return revision; });
  await assert.rejects(load(), /갱신되는 중/); assert.equal(calls, 3);
});
test("only prepared immutable jobs skip analysis; stored insights are recomputed and query semantics agree", async () => {
  const snapshot = await readSnapshot();
  const raw = snapshot.jobs.slice(0, 60), prepared = raw.map(prepareJob);
  assert.equal(projectJob(prepared[0]), prepared[0]);
  assert.ok(Object.isFrozen(prepared[0]) && Object.isFrozen(prepared[0].insights));
  const forged = { ...raw[0], insights: { bogus: true } };
  assert.notDeepEqual(projectJob(forged as unknown as typeof raw[0]).insights, forged.insights);
  for (const params of [{}, { role: "frontend" }, { role: "backend", page: "2" }, { q: "Engineer", location: "seoul" }])
    assert.deepEqual(queryJobs(prepared, params), queryJobs(raw, params));
});

test("published immutable jobs retain analysis through company joins without hiding malformed raw rows", async () => {
  const { joinCompanyJobs } = await import("../lib/research");
  const { companies } = await import("../lib/companies");
  const { freezeData } = await import("../lib/immutable-data");
  const snapshot = freezeData(await readSnapshot());
  const company = companies.find(c => c.id === "demo-orbit")!;
  const hiring = joinCompanyJobs(company, snapshot);
  assert.ok(hiring.jobs.length);
  const job = hiring.jobs[0];
  assert.equal(projectJob(job), job);
  assert.equal(joinCompanyJobs(company, snapshot).jobs[0], job);
  const raw = snapshot.jobs.find(j => j.id === job.id)!;
  assert.equal(projectJob(raw), job, "list and company paths share the projection");
  for (const broken of [{ ...raw, id: "", locationLabel: "San Francisco" }, { ...raw, roleLabel: "" }]) {
    const invalid = freezeData({ ...snapshot, jobs: [...snapshot.jobs, broken] });
    assert.equal(joinCompanyJobs(company, invalid).status, "unavailable");
    assert.equal(joinCompanyJobs(company, invalid).currentCount, null);
  }
});

test("projection helpers never freeze caller-owned nested values", async () => {
  const snapshot = await readSnapshot();
  for (const shallowFrozen of [false, true]) {
    const links = [{text:"source",url:"https://example.com"}];
    const input = {...snapshot.jobs[0], links};
    if (shallowFrozen) Object.freeze(input);
    const result = shallowFrozen ? projectJob(input) : prepareJob(input);
    assert.equal(Object.isFrozen(links), false);
    links.push({text:"later",url:"https://example.com/later"});
    if (!shallowFrozen) assert.equal(result.links!.length, 1, "prepared output owns its clone");
  }
});
