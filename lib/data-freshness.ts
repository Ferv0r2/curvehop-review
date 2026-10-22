import { keyOf, sourceOf, type Job, type SourceState } from "./jobs";

/** A source whose last successful collection is older than this is "not confirmed" for the freshness alert. */
export const STALE_SOURCE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `/api/freshness` body. The endpoint has no auth, so it carries aggregates only
 * (no source names, no job ids). Read by `.github/workflows/freshness.yml`.
 */
export type DataFreshness = {
  /** Request time. */
  asOf: string;
  /** asOf − newestSuccessAt, in hours. */
  dataAgeHours: number;
  /** Newest `lastSuccessAt` across sources. Not `checkedAt`: an all-failed run refreshes that. */
  newestSuccessAt: string;
  /** Sources with no `lastSuccessAt`, or one older than 7 days. */
  staleSourceCount: number;
  /** Listed jobs (the site's own listing filter, passed in) whose source is stale. */
  staleListedJobCount: number;
};

const successTime = (state: SourceState) => (state.lastSuccessAt ? Date.parse(state.lastSuccessAt) : NaN);

/**
 * Production data age for the alert outside the mini PC. `listed` must already be
 * the site's listing (`listedJobs` + `isVacancy`). Null when no source ever
 * succeeded: there is no age to report, and the caller answers 503.
 */
export function dataFreshness(sources: readonly SourceState[], listed: readonly Job[], now: Date): DataFreshness | null {
  // A malformed entry is unreadable data, not "never succeeded": throw so the route answers 503.
  if (sources.some((state) => !state || typeof state !== "object")) throw new TypeError("malformed source entry");
  let newest: SourceState | null = null;
  for (const state of sources) {
    const time = successTime(state);
    if (Number.isFinite(time) && (!newest || time > successTime(newest))) newest = state;
  }
  if (!newest?.lastSuccessAt) return null;
  const stale = sources.filter((state) => {
    const time = successTime(state);
    return !Number.isFinite(time) || now.getTime() - time > STALE_SOURCE_MS;
  });
  const staleKeys = new Set(stale.map(keyOf));
  return {
    asOf: now.toISOString(),
    // Three decimals (about 4 seconds): the alert compares against whole-hour bands.
    dataAgeHours: Math.round((now.getTime() - successTime(newest)) / 3_600) / 1_000,
    newestSuccessAt: newest.lastSuccessAt,
    staleSourceCount: stale.length,
    staleListedJobCount: listed.filter((job) => staleKeys.has(sourceOf(job))).length,
  };
}
