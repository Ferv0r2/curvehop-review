import type { Manifest } from "./archive";
import { deriveEvents } from "./history";

export const TREND_DAYS = 30;

export type SourceTrend = {
  /** First KST day this source was observed; counts before it are unknown. */
  since: string;
  /** In-scope openings at the end of each KST day, oldest first. */
  days: { date: string; open: number }[];
  /** Postings first seen after the baseline observation, within the window. */
  opened: number;
  /** Postings that disappeared from the official page, within the window. */
  closed: number;
};
export type HiringTrend = {
  generatedAt: string;
  windowDays: number;
  sources: Record<string, SourceTrend>;
};

const kstDay = (iso: string) =>
  new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Per-source openings over the last `windowDays` KST days, replayed from the
 * archive's live runs. Only what the employer's page did counts:
 * - the baseline is a source's first successful (non-empty) list;
 * - a posting is "new" only the first time its id is ever seen, so a list
 *   that recovers after an outage, a partial list, or a re-added source does
 *   not count its existing postings again;
 * - a close stands only if the posting never comes back, and retiring a
 *   source on our side is not a close;
 * - scope changes move the count but are neither, since they follow our
 *   location rules, not the employer.
 * Days end at the last ok/empty observation; failed fetches are not data.
 */
export function hiringTrend(
  manifests: Manifest[],
  now: Date,
  windowDays = TREND_DAYS,
): HiringTrend {
  // Backfilled snapshots were classified by older code (scope, normalization),
  // so a jump between them and live runs is ours, not the employer's.
  const live = manifests.filter((manifest) => !manifest.backfill);
  const events = deriveEvents(live);
  const baseline = new Map<string, string>();
  const lastObserved = new Map<string, string>();
  for (const manifest of live)
    for (const source of manifest.sources) {
      if (source.status === "ok" && !baseline.has(source.key)) baseline.set(source.key, manifest.runId);
      if (source.status !== "error") lastObserved.set(source.key, manifest.observedAt);
    }
  const configured = new Set(live.at(-1)?.configuredSources ?? []);
  const today = kstDay(now.toISOString());
  const windowStart = addDays(today, -(windowDays - 1));
  const runAt = new Map(live.map((manifest) => [manifest.runId, manifest.observedAt]));
  const sources: Record<string, SourceTrend> = {};
  for (const [key, baseRun] of baseline) {
    if (!configured.has(key)) continue;
    const since = kstDay(runAt.get(baseRun)!);
    const until = kstDay(lastObserved.get(key)!);
    const list = events.filter((event) => event.source === key);
    const open = new Set<string>();
    const everSeen = new Set<string>();
    const closedOn = new Map<string, string>();
    const endOfDay = new Map<string, number>();
    let opened = 0;
    // Decided by time: a baseline list with no in-scope jobs emits no events.
    const baseAt = runAt.get(baseRun)!;
    endOfDay.set(since, 0);
    for (const event of list) {
      const started = event.at >= baseAt;
      const day = kstDay(event.at);
      const id = event.jobId!;
      if (event.type === "seen") {
        closedOn.delete(id);
        if (event.inScope) open.add(id);
        if (started && event.runId !== baseRun && !everSeen.has(id) && event.inScope && day >= windowStart) opened++;
        everSeen.add(id);
      } else if (event.type === "scope_changed") {
        if (event.inScope) open.add(id);
        else open.delete(id);
      } else if (event.type === "gone") {
        const wasOpen = open.delete(id);
        if (started && wasOpen && event.reason !== "source_retired") closedOn.set(id, day);
      }
      if (started) endOfDay.set(day, open.size);
    }
    const closed = [...closedOn.values()].filter((day) => day >= windowStart).length;
    const days: SourceTrend["days"] = [];
    let last: number | null = null;
    for (let day = since; day <= until; day = addDays(day, 1)) {
      last = endOfDay.get(day) ?? last;
      if (day >= windowStart && last !== null) days.push({ date: day, open: last });
    }
    sources[key] = { since, days, opened, closed };
  }
  return { generatedAt: now.toISOString(), windowDays, sources };
}
