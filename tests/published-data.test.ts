import test from "node:test";
import assert from "node:assert/strict";
import { readPublishedResearch, readPublishedSnapshot } from "../lib/published-data";
import { liveResearchTime } from "./helpers/live-data";

test("actual published reader expires its derived research at UTC midnight without file edits", async () => {
  // The fake clock starts at the live research's own time, not the wall clock.
  const RealDate = Date;
  const day = liveResearchTime().toISOString().slice(0, 10);
  let clock = Date.parse(`${day}T14:59:59.999Z`);
  class ClockDate extends RealDate {
    constructor(value?: string | number | Date) { super(value === undefined ? clock : value); }
    static now() { return clock; }
  }
  globalThis.Date = ClockDate as DateConstructor;
  try {
    const before = await readPublishedResearch();
    assert.equal(before.status, "ok");
    assert.equal(await readPublishedResearch(), before);
    clock += 1; // Korea midnight is not the UTC revision boundary.
    assert.equal(await readPublishedResearch(), before);
    clock = Date.parse(`${day}T23:59:59.999Z`);
    assert.equal(await readPublishedResearch(), before);
    clock += 1; // One millisecond crosses UTC midnight; no file changed.
    const after = await readPublishedResearch();
    assert.equal(after.status, "ok");
    assert.notEqual(after, before, "time-sensitive corrections and knowledge must be revalidated");
    assert.equal(await readPublishedResearch(), after);
    const snapshot = await readPublishedSnapshot();
    assert.equal(await readPublishedSnapshot(), snapshot);
    assert.ok(Object.isFrozen(snapshot.jobs[0]));
  } finally { globalThis.Date = RealDate; }
});
