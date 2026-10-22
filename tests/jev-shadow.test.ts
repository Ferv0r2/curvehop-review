import test from 'node:test';
import assert from 'node:assert/strict';
import { caseHash, decisionChecks, evaluateResponse, requestFor, summarize, validateCase, type ShadowCase, type SummaryRow } from '../lib/jev-shadow';

const sample: ShadowCase = {
  id: 'pension-count', companyId: 'example', questionId: 'company.changes', facetId: 'changes.workforce',
  claim: '국민연금 가입자가 56명에서 51명으로 감소했다.', limitation: '전체 직원이나 퇴사자 수와 다르다.',
  scope: { entity: null, geography: null, role: null, jobId: null, referenceOn: '2026-08' },
  evidence: [{ id: 'pension', title: '가입자 관측', publisher: '국민연금공단', url: 'https://example.com/pension',
    kind: 'official', access: 'page', publishedOn: null, checkedOn: '2026-10-14', excerpt: '7월 가입자 56명, 8월 가입자 51명.' }],
  baseline: { kind: 'fixture', status: 'hand-authored', reference: 'unit-fixture' },
};
function answer(choice = 'supported', confidence = 0.9) {
  const top = (1 + 2 * confidence) / 3;
  return { type: 'choice', choice, confidence, probabilities: Object.fromEntries(
    ['supported', 'unsupported', 'insufficient'].map(k => [k, k === choice ? top : (1 - top) / 2])) };
}
function response(a = answer()) {
  return { model: 'jev-1.13.0', answers: Object.fromEntries(decisionChecks.map(k => [k, structuredClone(a)])),
    usage: { input_tokens: 100, output_tokens: 0 } };
}

test('0.75 confidence is inclusive, but a selected probability of 0.75 is not enough', () => {
  assert.equal(evaluateResponse(response(answer('supported', 0.75))).verdict, 'pass');
  assert.equal(evaluateResponse(response(answer('supported', 0.749))).verdict, 'abstain');
  assert.equal(evaluateResponse(response(answer('supported', 0.625))).verdict, 'abstain');
});
test('confident uncertainty abstains and one confident unsupported dimension flags', () => {
  assert.equal(evaluateResponse(response(answer('insufficient', 1))).verdict, 'abstain');
  const r = response(); r.answers['evidence.scope'] = answer('unsupported', 0.8);
  assert.equal(evaluateResponse(r).verdict, 'flag');
  r.answers['evidence.scope'] = answer('unsupported', 0.6);
  assert.equal(evaluateResponse(r).verdict, 'abstain');
});
test('malformed and mismatched responses never count as valid judgments', () => {
  for (const mutate of [
    (r: any) => { delete r.answers['evidence.scope']; },
    (r: any) => { r.model = 'jev-latest'; },
    (r: any) => { r.answers['evidence.support'].confidence = 1; },
    (r: any) => { r.answers['evidence.support'].probabilities.unsupported = -1; },
    (r: any) => { r.answers['evidence.support'].choice = 'unsupported'; },
    (r: any) => { r.answers['evidence.support'].probabilities.other = 0; },
    (r: any) => { r.usage.input_tokens = -1; },
  ]) { const r = response(); mutate(r); assert.throws(() => evaluateResponse(r), /JEV_RESPONSE/); }
});
test('reported rounded confidence cannot lift a below-threshold distribution over the boundary', () => {
  const r = response(answer('supported', 0.749));
  for (const a of Object.values(r.answers)) a.confidence = 0.75;
  assert.equal(evaluateResponse(r).verdict, 'abstain');
});
test('request binds the existing question contract but never sends reference labels or baseline decisions', () => {
  const c: ShadowCase = { ...sample, expected: { 'evidence.support': 'supported', 'evidence.scope': 'supported', 'evidence.causality': 'supported' } };
  const req = requestFor(c);
  assert.equal(req.model, 'jev-1.13.0');
  assert.equal(req.state.claim, sample.claim);
  assert.equal(req.state.facetId, 'changes.workforce');
  assert.ok(!JSON.stringify(req).includes('hand-authored'));
  assert.ok(!Object.hasOwn(req.state, 'expected'));
  assert.deepEqual(Object.keys(req.questions), [...decisionChecks]);
  assert.notEqual(caseHash(c), caseHash({ ...c, claim: '직원 5명이 퇴사했다.' }));
  assert.notEqual(caseHash(c), caseHash({ ...c, evidence: [{ ...c.evidence[0], excerpt: '수정된 원문' }] }));
});
test('unknown facets, dangling or duplicate evidence, empty claims and oversized packets are rejected', () => {
  assert.doesNotThrow(() => validateCase(sample));
  for (const c of [
    { ...sample, facetId: 'made.up' }, { ...sample, questionId: 'role.work' },
    { ...sample, evidence: [] }, { ...sample, evidence: [...sample.evidence, ...sample.evidence] },
    { ...sample, claim: '' }, { ...sample, evidence: [{ ...sample.evidence[0], access: 'search-index' }] },
    { ...sample, evidence: [{ ...sample.evidence[0], excerpt: '가'.repeat(30000) }] },
  ]) assert.throws(() => validateCase(c), /JEV_CASE/);
});
test('unlabeled real cases never become accuracy evidence and abstentions stay in the denominator', () => {
  const rows: SummaryRow[] = [
    { id: 'wrong-pass', outcome: 'pass', expected: 'flag', latencyMs: 10, inputTokens: 10 },
    { id: 'held-good', outcome: 'abstain', expected: 'pass', latencyMs: 20, inputTokens: 20 },
    { id: 'unlabeled', outcome: 'pass', expected: null, latencyMs: 30, inputTokens: 30 },
    { id: 'failed', outcome: 'error', expected: 'flag', latencyMs: 40, inputTokens: null },
  ];
  const report = summarize(rows);
  assert.equal(report.total, 4);
  assert.equal(report.labeled, 3);
  assert.equal(report.falsePass.count, 1);
  assert.equal(report.falsePass.denominator, 2);
  assert.equal(report.abstained, 1);
  assert.equal(report.errors, 1);
  assert.equal(report.inputTokens, 60);
  assert.equal(report.modelAccuracyClaim, 'not_established');
  assert.equal(report.publicationAuthority, false);
});
