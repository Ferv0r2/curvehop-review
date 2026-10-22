import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionChecks, type ShadowCase } from '../lib/jev-shadow';
import { makeBundle, runCases, replayReport } from '../lib/jev-shadow-run';

const example: ShadowCase = {
  id: 'review-headcount', companyId: 'demo-orbit', questionId: 'company.changes', facetId: 'changes.workforce',
  claim: '가입자 수가 40명에서 46명으로 늘었다.', limitation: '실제 입사자 수와는 다르다.',
  scope: { entity: null, geography: null, role: null, jobId: null, referenceOn: '2026-08' },
  evidence: [{ id: 'demo-count', title: '가상 관측 기록', publisher: '가상 자료', url: 'https://demo-orbit.example/count', kind: 'official', access: 'page', publishedOn: null, checkedOn: '2026-10-22', excerpt: '7월 가입자 40명, 8월 가입자 46명.' }],
  baseline: { kind: 'fixture', status: 'hand-authored', reference: 'synthetic-review-fixture' },
};
function successfulResponse() {
  return Response.json({ model: 'jev-1.13.0', answers: Object.fromEntries(decisionChecks.map(k => [k, { type: 'choice', choice: 'supported', probabilities: { supported: 1, unsupported: 0, insufficient: 0 }, confidence: 1 }])), usage: { input_tokens: 10, output_tokens: 0 } });
}
const batch = () => makeBundle(['a','b','c'].map(id => ({...example, id, claim: `${id}: ${example.claim}`})));
test('evaluation transport is replayable and has no publication authority', async () => {
  let calls = 0;
  const fetchImpl = (async (_url, init) => {
    calls++;
    assert.equal(init?.redirect, 'error');
    assert.ok(!String(init?.body).includes('hand-authored'));
    return successfulResponse();
  }) as typeof fetch;
  const report = await runCases(makeBundle([example]), { apiKey: 'fixture-only', limit: 1, fetchImpl });
  assert.equal(calls, 1);
  assert.equal(report.publicationAuthority, false);
  assert.equal(report.rows[0].outcome, 'pass');
  let replayCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { replayCalls++; throw new Error('unexpected replay network request'); }) as typeof fetch;
  try {
    assert.deepEqual(replayReport(report).summary, report.summary);
    const tampered = structuredClone(report);
    tampered.rows[0].caseHash = 'different-case';
    assert.throws(() => replayReport(tampered), /JEV_REPLAY: case binding mismatch/);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(replayCalls, 0, 'both successful and rejected replay must stay offline');
});
test('missing keys and network/protocol failures do not retry or advance the batch', async () => {
  let calls = 0;
  const never = (async () => { calls++; return successfulResponse(); }) as typeof fetch;
  await assert.rejects(() => runCases(batch(), { apiKey: '', limit: 3, fetchImpl:never }), /JEV_KEY/);
  assert.equal(calls, 0);
  const failures: [string, () => Response, string][] = [
    ['network', () => {throw new Error('private-response');}, 'JEV_NETWORK'],
    ['rate limit', () => new Response('private-response', {status:429}), 'JEV_HTTP_429'],
    ['invalid JSON', () => new Response('private-response'), 'JEV_RESPONSE'],
    ['invalid schema', () => Response.json({model:'private-response'}), 'JEV_RESPONSE'],
  ];
  for (const [name, failure, code] of failures) {
    calls = 0;
    const fetchImpl = (async () => {calls++;return failure();}) as typeof fetch;
    const report = await runCases(batch(), {apiKey:'fixture-only',limit:3,fetchImpl});
    assert.equal(calls,1,name);
    assert.equal(report.rows.length,1,name); assert.equal(report.notRun,2,name);
    assert.equal(report.rows[0].outcome,'error',name); assert.equal(report.rows[0].error,code,name);
    assert.ok(!JSON.stringify(report).includes('private-response'),name);
  }
});

test('batch limit bounds transport and persisted rows, preserving selected case order', async () => {
  const bundle = batch(), claims: string[] = [], order: string[] = [];
  const report = await runCases(bundle, {apiKey:'fixture-only',limit:2,
    beforeCall:async c => {order.push(`persist:${c.id}`);},
    beforeRequest:c => {order.push(`ready:${c.id}`);},
    fetchImpl:(async (_url, init) => {
      const claim = JSON.parse(String(init?.body)).state.claim;
      claims.push(claim); order.push(`request:${claim[0]}`); return successfulResponse();
    }) as typeof fetch,
  });
  assert.deepEqual(claims,bundle.cases.slice(0,2).map(c=>c.claim));
  assert.deepEqual(report.rows.map(r=>[r.id,r.outcome]),[['a','pass'],['b','pass']]);
  assert.equal(report.plannedCalls,2); assert.equal(report.notRun,0);
  assert.deepEqual(order,['persist:a','ready:a','request:a','persist:b','ready:b','request:b']);
});

test('failed persistence or last preflight prevents the next request', async () => {
  for (const gate of ['checkpoint','beforeCall','beforeRequest'] as const) {
    let calls = 0, entered = 0;
    const fail = () => {entered++; throw new Error('fixture gate failure');};
    await assert.rejects(() => runCases(batch(), {apiKey:'fixture-only',limit:3,
      [gate]:fail, fetchImpl:(async () => {calls++;return successfulResponse();}) as typeof fetch,
    }),/fixture gate failure/,gate);
    assert.equal(entered,1,gate); assert.equal(calls,0,gate);
  }
  let calls = 0;
  await assert.rejects(() => runCases(batch(), {apiKey:'fixture-only',limit:3,
    checkpoint:async report => {if(report.rows.length===1) throw new Error('checkpoint full');},
    fetchImpl:(async () => {calls++;return successfulResponse();}) as typeof fetch,
  }),/checkpoint full/);
  assert.equal(calls,1,'a failed checkpoint after one result prevents the second request');
});
