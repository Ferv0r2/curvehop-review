import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const dataNames = ["jobs.json", "company-research.json", "company-relations.json"];
export const routes = ["/jobs", "/jobs/demo-orbit-job-1", "/read/demo-orbit-work"];
// Current contract: warm Proxy + render reuse the current public revision.
export const expectedCounts = routes.map(() => ({}));
export async function loadData() {
  const files = Object.fromEntries(await Promise.all(dataNames.map(async name => [`data/${name}`, await readFile(`data/${name}`, "utf8")])));
  const data = dataNames.map(name => ({ name, bytes: Buffer.byteLength(files[`data/${name}`]), sha256: createHash("sha256").update(files[`data/${name}`]).digest("hex") }));
  return { files, data };
}
export function countEvents(events) {
  return events.reduce((counts, event) => { const key = `${event.file}:${event.method}`; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {});
}
export async function measureCounts(runtime, { baseline = false } = {}) {
  const results = [];
  const calibration = await runtime.events();
  assert.ok(calibration.some(event => event.file === "company-research.json" && event.method === "open"), "Probe must observe startup reads; zero warm reads alone are not evidence.");
  for (const [index, route] of routes.entries()) {
    const before = (await runtime.events()).length;
    const result = await runtime.get(route);
    assert.equal(result.status, 200, `Representative route ${route} must exist in the fixture (update routes deliberately when retired).`);
    const counts = countEvents((await runtime.events()).slice(before));
    const warmStart = (await runtime.events()).length;
    const warm = await runtime.get(route);
    assert.equal(warm.status, 200);
    const warmCounts = countEvents((await runtime.events()).slice(warmStart));
    if (!baseline) assert.deepEqual(warmCounts, expectedCounts[index], `Warm full-request file invocations: ${route}`);
    results.push({ route, firstCounts: counts, counts: warmCounts });
  }
  return results;
}
export function timingSummary(samples, key) {
  const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
  const mid = values.length / 2;
  return { min: values[0], median: Number.isInteger(mid) ? (values[mid - 1] + values[mid]) / 2 : values[Math.floor(mid)], max: values.at(-1) };
}
