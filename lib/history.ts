import type { Manifest } from "./archive";

/*
 * Pure replay of archived runs into events. Safe to delete and recompute:
 * the manifests are the source of truth.
 *
 *   per source:  ok ──▶ diff jobs, reset empty streak
 *                empty ──▶ streak++; gone(empty) once streak ≥ 4 AND
 *                          ≥ 24h since the first empty observation
 *                error ──▶ nothing (could not observe ≠ closed)
 *                missing from configuredSources ──▶ source_retired
 */
export const EMPTY_MIN_RUNS = 4;
export const EMPTY_MIN_MS = 24 * 60 * 60 * 1000;

export type HistoryEvent = {
  type: "seen" | "changed" | "scope_changed" | "gone" | "source_retired";
  at: string;
  runId: string;
  source: string;
  jobId?: string;
  contentHash?: string;
  inScope?: boolean;
  reason?: "removed" | "empty" | "source_retired";
  backfill?: true;
  /** The two observations used different normalization; the diff may be formatting. */
  crossVersion?: true;
};
type OpenJob = {
  contentHash: string;
  inScope: boolean;
  version: Manifest["normalizationVersion"];
};
type SourceState = {
  open: Map<string, OpenJob>;
  emptyCount: number;
  firstEmptyAt: string | null;
  closedByEmpty: boolean;
  retired: boolean;
};

export function deriveEvents(manifests: Manifest[]): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const sources = new Map<string, SourceState>();
  const stateFor = (key: string) => {
    let state = sources.get(key);
    if (!state) {
      state = {
        open: new Map(),
        emptyCount: 0,
        firstEmptyAt: null,
        closedByEmpty: false,
        retired: false,
      };
      sources.set(key, state);
    }
    return state;
  };
  const closeAll = (
    key: string,
    state: SourceState,
    at: string,
    runId: string,
    reason: HistoryEvent["reason"],
  ) => {
    for (const jobId of [...state.open.keys()].sort())
      events.push({ type: "gone", at, runId, source: key, jobId, reason });
    state.open.clear();
  };

  for (const manifest of manifests) {
    const { runId, observedAt: at } = manifest;
    const backfill = manifest.backfill ? ({ backfill: true } as const) : {};
    for (const observed of manifest.sources) {
      const state = stateFor(observed.key);
      state.retired = false;
      if (observed.status === "error") continue;
      if (observed.status === "empty") {
        state.emptyCount++;
        state.firstEmptyAt ??= at;
        const elapsed = Date.parse(at) - Date.parse(state.firstEmptyAt);
        if (
          !state.closedByEmpty &&
          state.emptyCount >= EMPTY_MIN_RUNS &&
          elapsed >= EMPTY_MIN_MS
        ) {
          closeAll(observed.key, state, state.firstEmptyAt, runId, "empty");
          state.closedByEmpty = true;
        }
        continue;
      }
      state.emptyCount = 0;
      state.firstEmptyAt = null;
      state.closedByEmpty = false;
      const listed = new Set<string>();
      for (const job of observed.jobs) {
        listed.add(job.id);
        const before = state.open.get(job.id);
        const base = { at, runId, source: observed.key, jobId: job.id, ...backfill };
        if (!before)
          events.push({ type: "seen", ...base, contentHash: job.contentHash, inScope: job.inScope });
        else {
          if (before.contentHash !== job.contentHash)
            events.push({
              type: "changed",
              ...base,
              contentHash: job.contentHash,
              ...(before.version !== manifest.normalizationVersion ? { crossVersion: true as const } : {}),
            });
          if (before.inScope !== job.inScope)
            events.push({ type: "scope_changed", ...base, inScope: job.inScope });
        }
        state.open.set(job.id, {
          contentHash: job.contentHash,
          inScope: job.inScope,
          version: manifest.normalizationVersion,
        });
      }
      for (const jobId of [...state.open.keys()].sort())
        if (!listed.has(jobId)) {
          events.push({ type: "gone", at, runId, source: observed.key, jobId, reason: "removed", ...backfill });
          state.open.delete(jobId);
        }
    }
    // Backfill snapshots lack the configured source list; never retire from them.
    if (manifest.backfill) continue;
    const configured = new Set(manifest.configuredSources);
    for (const [key, state] of sources)
      if (!configured.has(key) && !state.retired) {
        events.push({ type: "source_retired", at, runId, source: key });
        closeAll(key, state, at, runId, "source_retired");
        state.retired = true;
      }
  }
  // An empty-list close is decided runs later but dated to the first empty
  // run; keep the stream chronological (sort is stable, so same-time order holds).
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
