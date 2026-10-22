import { createHash } from "node:crypto";
import type { Reading } from "./reading";
import { validContentChange, type ContentChange } from "./reading-changes";

/** Shared by the server-rendered shelf and the read-only delivery verifier. */
export const RECENT_READING_DAYS = 14;

/** Ordinary topic browsing, not a claim of similarity or a reviewed question edge.
 * Caller supplies current public readings; never invent a connection to fill three slots. */
export function otherCompanyReadings(readings: readonly Reading[], current: Reading, allowed: ReadonlySet<string>, linkedIds: ReadonlySet<string> = new Set()): Reading[] {
  return diverseReadings(readings.filter(r => r.companyId !== current.companyId && allowed.has(r.companyId)), [current.topic], 3, linkedIds);
}
/** Empty recent filters return to the same evergreen topic; an empty catalog offers companies. */
export function discoveryEmptyState(topic: Reading["topic"] | "", recentOnly: boolean) {
  if (recentOnly) return { heading: "최근 14일 동안 추가·수정한 이야기가 없어요.", href: `/discover${topic ? `?topic=${topic}` : ""}`, label: "이야기 둘러보기" };
  if (topic) return { heading: "이 주제에 공개된 이야기가 없어요.", href: "/discover", label: "다른 질문 살펴보기" };
  return { heading: "아직 공개된 이야기가 없어요.", href: "/companies", label: "회사 둘러보기" };
}
export type RecentReading = {
  reading: Reading;
  id: string;
  /** Current public reading projection, distinct from the source guide digest. */
  contentHash: string;
  change: ContentChange;
};
type RecentOptions = {
  excludedGuideIds?: ReadonlySet<string>;
  limit?: number;
  perCompany?: number;
  kind?: ContentChange["kind"];
};
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const compareId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Public semantics only: no retrieval dates, execution state or connection metadata. */
export function readingContentHash(reading: Reading): string {
  return digest({
    version: 1,
    id: reading.id,
    companyId: reading.companyId,
    companyName: reading.companyName,
    topic: reading.topic,
    question: reading.question,
    preview: reading.preview,
    answer: reading.answer,
    limitation: reading.limitation,
    sections: (reading.sections ?? []).map(section => ({
      id: section.id, title: section.title, text: section.text, kind: section.kind, evidenceIds: section.evidenceIds,
    })),
    evidence: reading.evidence.map(source => ({
      id: source.id, title: source.title, url: source.url, publisher: source.publisher,
      kind: source.kind, access: source.access, publishedOn: source.publishedOn, excerpt: source.excerpt,
    })),
  });
}

/** Callers supply the current, listing-eligible projection, never the raw research pack. */
export function selectRecentReadings(readings: readonly Reading[], now: Date = new Date(), options: RecentOptions = {}): RecentReading[] {
  const at = now.getTime();
  if (!Number.isFinite(at)) return [];
  const cutoff = at - RECENT_READING_DAYS * 86_400_000;
  const { excludedGuideIds = new Set<string>(), limit = 6, perCompany = 2 } = options;
  if (!(limit > 0) || !(perCompany > 0)) return [];
  const candidates: RecentReading[] = [];
  const seen = new Set<string>();
  for (const reading of readings) {
    if (seen.has(reading.id) || excludedGuideIds.has(reading.id)) continue;
    seen.add(reading.id);
    const guide = reading.company.guides?.find(item => item.id === reading.id);
    const change = guide && validContentChange(guide, now);
    if (!change || Date.parse(change.recordedAt) < cutoff || (options.kind && change.kind !== options.kind)) continue;
    candidates.push({ reading, id: reading.id, contentHash: readingContentHash(reading), change });
  }
  candidates.sort((a, b) => Date.parse(b.change.recordedAt) - Date.parse(a.change.recordedAt) || compareId(a, b));
  const counts = new Map<string, number>();
  const selected: RecentReading[] = [];
  for (const entry of candidates) {
    const count = counts.get(entry.reading.companyId) ?? 0;
    if (count >= perCompany) continue;
    selected.push(entry);
    counts.set(entry.reading.companyId, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

/** Canonical overview evidence is independent of route filters and relative-age labels. */
export function discoveryDelivery(readings: readonly Reading[], now: Date, pendingGuideIds: ReadonlySet<string> | readonly string[] = new Set()) {
  const current = readings.map(reading => ({ id: reading.id, contentHash: readingContentHash(reading) })).sort(compareId);
  const recent = selectRecentReadings(readings, now, { excludedGuideIds: new Set(pendingGuideIds), kind: "added", limit: 3, perCompany: 1 });
  const hash = digest({ version: 2, current, recent: recent.map(({ id, contentHash, change }) => ({ id, contentHash, change })) });
  return { hash, recent, current };
}

/** Presentation groups reuse existing topic IDs, not a second editorial taxonomy. */
export const discoveryShelves = [
  { id: "direction", title: "사업과 방향", description: "무엇을 만들고, 어떤 변화를 거쳐 어디로 가는 회사인지 살펴봐요.", topics: ["vision", "business"] },
  { id: "team", title: "팀과 일하는 방식", description: "어떤 동료와 함께, 어떻게 결정하고 협업하는지 읽어봐요.", topics: ["culture"] },
  { id: "role", title: "역할과 지원", description: "맡게 될 일과 지원 조건, 전형에서 알아둘 내용을 살펴봐요.", topics: ["work", "process"] },
] as const;

/** Round-robin topics and distinct companies keep one batch from filling a shelf.
 * Input order is editorial order; no randomness, check dates or invented scores. */
export function diverseReadings(readings: readonly Reading[], topics: readonly Reading["topic"][], limit: number, excluded: ReadonlySet<string> = new Set()): Reading[] {
  const queues = topics.map(topic => readings.filter(r => r.topic === topic && !excluded.has(r.id)));
  const companies = new Set<string>();
  const ids = new Set<string>();
  const result: Reading[] = [];
  while (result.length < limit) {
    let progressed = false;
    for (const queue of queues) {
      const candidate = queue.find(r => !companies.has(r.companyId) && !ids.has(r.id));
      if (!candidate) continue;
      result.push(candidate);
      companies.add(candidate.companyId);
      ids.add(candidate.id);
      progressed = true;
      if (result.length >= limit) break;
    }
    if (!progressed) break;
  }
  return result;
}

/** New publications enter automatically. Edits remain accessible in the change
 * list but do not displace the opening just because their body hash changed. */
export function discoveryOpening(readings: readonly Reading[], recent: readonly RecentReading[], pending: ReadonlySet<string> = new Set()): Reading[] {
  const opening = recent.map(entry => entry.reading);
  const companies = new Set(opening.map(r => r.companyId));
  const fallback = readings.filter(r => !companies.has(r.companyId) && !pending.has(r.id));
  return [...opening, ...diverseReadings(fallback, ["vision", "culture", "work", "process", "business"], Math.max(0, 3 - opening.length))];
}
