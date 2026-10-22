import { postJev } from './jev-client';
import { caseHash, digest, evaluatorHash, evaluatorContract, evaluateResponse, expectedVerdict, requestFor, summarize,
  validateCase, type ShadowCase, type SummaryRow } from './jev-shadow';

export type Bundle = { version: 1; contractHash: string; cases: ShadowCase[]; hash: string };
/** Calls per explicit `live` run when no --limit is given; also the daily cap of the regular shadow run (lib/jev-shadow-steps.ts). */
export const LIVE_DEFAULT_CALLS = 3;
export function makeBundle(cases: ShadowCase[]): Bundle {
  cases.forEach(validateCase);
  if (!cases.length || cases.length > 100 || new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('JEV_BUNDLE: requires 1–100 uniquely identified cases');
  const body = { version: 1 as const, contractHash: evaluatorHash(), cases };
  return { ...body, hash: digest(body) };
}
export function validateBundle(value: unknown): asserts value is Bundle {
  try {
    const b = value as Bundle;
    if (b.version !== 1 || b.contractHash !== evaluatorHash() || makeBundle(b.cases).hash !== b.hash) throw new Error();
  } catch { throw new Error('JEV_BUNDLE: missing, stale or edited input; prepare a fresh bundle'); }
}
type Evaluated = ReturnType<typeof evaluateResponse>;
export type ShadowRow = SummaryRow & { caseHash: string; response?: Evaluated; error?: string };
export type ShadowReport = { version: 1; mode: 'shadow'; publicationAuthority: false; bundle: Bundle;
  contract: ReturnType<typeof evaluatorContract>; rows: ShadowRow[]; plannedCalls: number; notRun: number;
  summary: ReturnType<typeof summarize>; startedAt: string };
function report(bundle: Bundle, rows: ShadowRow[], plannedCalls: number, startedAt: string): ShadowReport {
  return { version: 1, mode: 'shadow', publicationAuthority: false, bundle, contract: evaluatorContract(), rows,
    plannedCalls, notRun: plannedCalls - rows.length, summary: summarize(rows), startedAt };
}
/** One explicit call per case, no retry/fallback. First error stops the batch. */
export async function runCases(bundle: Bundle, options: {
  apiKey: string; limit: number; fetchImpl?: typeof fetch;
  checkpoint?: (report: ShadowReport) => Promise<void>;
  /** Persists the attempt before its request. A failure rejects the run before that request is sent. */
  beforeCall?: (c: ShadowCase) => Promise<void>;
  /** Synchronous last check, with no await between it and the request. A throw rejects the run; nothing is sent. */
  beforeRequest?: (c: ShadowCase) => void;
}) {
  validateBundle(bundle);
  if (!options.apiKey?.trim() || /[\r\n]/.test(options.apiKey)) throw new Error('JEV_KEY: set TYPESAFE_API_KEY in the process environment; do not put it in arguments or reports');
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 10) throw new Error('JEV_LIMIT: choose 1–10 calls per explicit run');
  const fetchImpl = options.fetchImpl ?? fetch, rows: ShadowRow[] = [], startedAt = new Date().toISOString();
  const selected = bundle.cases.slice(0, options.limit), plannedCalls = selected.length;
  // Persist intention before the first paid call. A failed checkpoint prevents further calls.
  await options.checkpoint?.(report(bundle, rows, plannedCalls, startedAt));
  for (const c of selected) {
    const row: ShadowRow = { id: c.id, caseHash: caseHash(c), outcome: 'error', expected: expectedVerdict(c), latencyMs: 0, inputTokens: null };
    const request = requestFor(c);
    await options.beforeCall?.(c);
    options.beforeRequest?.(c);
    const start = performance.now();
    try {
      const raw = await postJev(request, options.apiKey, fetchImpl);
      let evaluated: Evaluated;
      try { evaluated = evaluateResponse(raw); } catch { throw new Error('JEV_RESPONSE'); }
      row.response = evaluated; row.outcome = evaluated.verdict; row.inputTokens = evaluated.usage.input_tokens;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      row.error = /^JEV_(NETWORK|RESPONSE|HTTP_\d{3})$/.test(code) ? code : 'JEV_RESPONSE';
    }
    row.latencyMs = Math.round(performance.now() - start); rows.push(row);
    await options.checkpoint?.(report(bundle, rows, plannedCalls, startedAt));
    if (row.outcome === 'error') break;
  }
  return report(bundle, rows, plannedCalls, startedAt);
}
/** Offline recomputation is not proof a provider actually issued the stored response. */
export function replayReport(value: unknown): ShadowReport {
  const r = value as ShadowReport;
  validateBundle(r?.bundle);
  if (r.version !== 1 || r.mode !== 'shadow' || r.publicationAuthority !== false || digest(r.contract) !== evaluatorHash() ||
    !Array.isArray(r.rows) || !Number.isInteger(r.plannedCalls) || r.plannedCalls < 1 || r.plannedCalls > Math.min(10, r.bundle.cases.length) ||
    r.rows.length > r.plannedCalls || !Number.isFinite(Date.parse(r.startedAt))) throw new Error('JEV_REPLAY: invalid report');
  const rows = r.rows.map((row, i): ShadowRow => {
    const c = r.bundle.cases[i];
    if (row.id !== c.id || row.caseHash !== caseHash(c) || !Number.isFinite(row.latencyMs) || row.latencyMs < 0) throw new Error('JEV_REPLAY: case binding mismatch');
    if (row.outcome === 'error') {
      if (row.response || i !== r.rows.length - 1 || !/^JEV_(NETWORK|RESPONSE|HTTP_\d{3})$/.test(row.error ?? '')) throw new Error('JEV_REPLAY: invalid error');
      return { id: c.id, caseHash: caseHash(c), expected: expectedVerdict(c), outcome: 'error', inputTokens: null, latencyMs: row.latencyMs, error: row.error };
    }
    const evaluated = evaluateResponse(row.response);
    return { id: c.id, caseHash: caseHash(c), expected: expectedVerdict(c), outcome: evaluated.verdict,
      response: evaluated, inputTokens: evaluated.usage.input_tokens, latencyMs: row.latencyMs };
  });
  return report(r.bundle, rows, r.plannedCalls, r.startedAt);
}
