import test from "node:test";
import assert from "node:assert/strict";
import { measureCounts } from "./helpers/ssr-measure.mjs";
test("a disconnected read probe cannot pass as zero warm reads", async () => {
  let requests = 0;
  await assert.rejects(() => measureCounts({ events: async () => [], get: async () => { requests++; return { status: 200 }; } }), /Probe must observe startup reads/);
  assert.equal(requests, 0);
});

test("an active probe with a warm read fails; a calibrated zero-read run passes", async () => {
  function runtime(extraRead) {
    const events = [{file:"company-research.json",method:"open"}];
    let requests = 0;
    return {events:async()=>[...events], get:async()=>{
      requests++;
      if (extraRead && requests===2) events.push({file:"jobs.json",method:"readFile"});
      return {status:200};
    }};
  }
  await assert.rejects(()=>measureCounts(runtime(true)),/Warm full-request file invocations/);
  const results = await measureCounts(runtime(false));
  assert.equal(results.length,3);
  assert.deepEqual(results.map(r=>r.counts),[{},{},{}]);
});
