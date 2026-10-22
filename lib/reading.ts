import { companies } from "./companies";
import { readingEditorial, withoutContentChange } from "./reading-editorial";
import { roleLabels } from "./jobs";
import { additionalReadingConfiguration, additionalReadingConnections } from "./reading-expansion";
import { sameProblemLinks } from "./reading-same-problem";
import type { CompanyResearch, Evidence, ResearchPack, StorySection } from "./research";
import pins from "../data/reading-pins.json";
import { answerHash } from "./card-summary";
import { parseSizes } from "./company-size-bands";
import { parseNewDay } from "./new-arrivals";

export const readingTopics = {
  vision: "비전과 제품",
  culture: "인재상과 팀",
  work: "하는 일",
  process: "채용 과정",
  business: "회사 변화",
} as const;
export type ReadingTopic = keyof typeof readingTopics;
export type Reading = {
  id: string;
  companyId: string;
  companyName: string;
  companyColor: string;
  topic: ReadingTopic;
  question: string;
  preview: string;
  answer: string;
  limitation: string;
  evidence: Evidence[];
  company: CompanyResearch;
  sections?: StorySection[];
};

// Editorial navigation is deliberately separate from source-backed answers.
// A new guide needs an explicit topic and connection review before publication.
const configuration: Record<
  string,
  { companyId: string; topic: ReadingTopic; preview: string }
> = {
  ...additionalReadingConfiguration,
};
export const readingIds: readonly string[] = Object.keys(configuration);

export type StoryComparison = {
  /** The concrete problem both sides' own sources describe, in terms both support (one sentence). */
  problem?: string;
  common: string;
  difference: string;
  /** Scope and date limits of the comparison: whose description, which year, which team (one sentence). */
  limit?: string;
  evidenceIds: { from: string[]; to: string[] };
};
/** A comparison that may carry the "같은 문제" invitation: it names the shared problem and its limits. */
export type SameProblemComparison = StoryComparison & { problem: string; limit: string };
export const isSameProblem = (comparison?: StoryComparison): comparison is SameProblemComparison =>
  !!comparison?.problem?.trim() && !!comparison.limit?.trim();
/** "같은 문제를 채널톡은 …" / "센드버드는 …": the topic particle follows the name's last syllable. */
export function sameProblemInvitation(companyName: string): string {
  const spoken = companyName.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const last = spoken.at(-1) ?? "";
  const syllable = last.charCodeAt(0) - 0xac00;
  const particle = syllable >= 0 && syllable < 11172
    ? (syllable % 28 ? "은" : "는")
    : /[bcklmnpt]$/i.test(last) ? "은" : "는";
  return `같은 문제를 ${companyName}${particle} 어떻게 풀고 있을까요?`;
}
type Connection = { id: string; reason: string; comparison?: StoryComparison };
/**
 * Curated previews and comparison sentences are written outside the research
 * record. Each is pinned to what it was written from (data/reading-pins.json,
 * scripts/reading-pins.ts): when the guide or a cited source changes, the
 * preview falls back to a sentence without facts and the comparison is not shown.
 * A comparison pin covers its own copy (problem, common, difference, limit) as
 * well as the cited sources, so an edited sentence also waits for a re-pin.
 */
const UNPINNED_PREVIEW = "회사가 공개한 자료로 정리한 이야기예요.";
export const guidePin = (guide: unknown) => answerHash(JSON.stringify(withoutContentChange(guide)));
export const comparisonPin = (comparison: StoryComparison, sources: unknown[]) => answerHash(JSON.stringify({
  problem: comparison.problem, common: comparison.common, difference: comparison.difference, limit: comparison.limit, sources,
}));
const pinned = pins as { previews: Record<string, string>; comparisons: Record<string, string> };
/** Attach the reading-loop pilot's same-problem comparisons to their curated links (new links are appended). */
function withSameProblemLinks(base: Record<string, Connection[]>): Record<string, Connection[]> {
  const result: Record<string, Connection[]> = Object.fromEntries(Object.entries(base).map(([id, items]) => [id, [...items]]));
  for (const { from, to, reason, comparison } of sameProblemLinks) {
    const items = (result[from] ??= []);
    const at = items.findIndex(item => item.id === to);
    if (at >= 0) items[at] = { ...items[at], comparison };
    else if (reason) items.push({ id: to, reason, comparison });
  }
  return result;
}
const connections: Record<string, Connection[]> = withSameProblemLinks({ ...additionalReadingConnections });

export function curatedComparisons(): { from: string; to: string; comparison: StoryComparison }[] {
  return Object.entries(connections).flatMap(([from, items]) => items.flatMap(item => item.comparison ? [{ from, to: item.id, comparison: item.comparison }] : []));
}
/** Guides whose preview comes from code rather than the record's publication, for regenerating their pins. */
export const curatedPreviewIds: readonly string[] = Object.keys(configuration);

export function protectedReadingEvidenceIds(): string[] {
  return Object.values(connections).flatMap(items=>items.flatMap(c=>c.comparison ? [...c.comparison.evidenceIds.from,...c.comparison.evidenceIds.to] : []));
}

/**
 * The newest check of the sources the reading itself cites: the date its
 * statements were last confirmed, the same "자료 확인" as the reading page.
 * Not the research run's date (a run may reuse an older source when a page
 * fails to open) and not when the jobs were collected.
 */
export function readingCheckedOn(reading: Reading): string | undefined {
  return reading.evidence.map((e) => e.checkedOn).sort().at(-1);
}

export function readingItems(pack: ResearchPack): Reading[] {
  const groups = pack.companies.map((company) => {
    const identity = companies.find((candidate) => candidate.id === company.id);
    if (!identity) return [];
    const evidenceById = new Map(
      company.evidence.map((evidence) => [evidence.id, evidence]),
    );
    return [...(company.guides ?? [])].sort((a,b) => Number(!!b.sections) - Number(!!a.sections)).flatMap((guide): Reading[] => {
      const config = guide.publication ? { ...guide.publication, companyId: company.id }
        : Object.hasOwn(configuration, guide.id) ? configuration[guide.id] : undefined;
      if (!config || config.companyId !== company.id) return [];
      const evidence = [...new Set(guide.evidenceIds)].flatMap((id) => {
        const source = evidenceById.get(id);
        return source ? [source] : [];
      });
      if (!evidence.length) return [];
      if (guide.sections && (evidence.length !== guide.evidenceIds.length || !guide.sections.length || guide.sections.some(section =>
        !section.evidenceIds.length || section.evidenceIds.some(id => !evidence.some(e => e.id === id))))) return [];
      const editorial = readingEditorial(guide);
      return [
        {
          id: guide.id,
          companyId: company.id,
          companyName: identity.name,
          companyColor: identity.color,
          topic: config.topic,
          question: editorial?.title ?? guide.question,
          preview: editorial?.preview ?? (guide.publication || pinned.previews[guide.id] === guidePin(guide) ? config.preview : UNPINNED_PREVIEW),
          answer: guide.answer,
          limitation: guide.limitation,
          evidence,
          company,
          sections: guide.sections,
        },
      ];
    });
  });
  const result: Reading[] = [];
  for (let index = 0; groups.some((group) => index < group.length); index++) {
    for (const group of groups) if (group[index]) result.push(group[index]);
  }
  return result;
}

export function getReading(
  pack: ResearchPack,
  id: string,
): Reading | undefined {
  return readingItems(pack).find((reading) => reading.id === id);
}

/**
 * How a company page places the company's readings: the first culture reading in `#talent-summary`,
 * every other one in `#guides`. With no other reading the page has no `#guides`, so a link meaning
 * "this company's readings" goes to `#talent-summary`, which a researched company always shows.
 */
export function companyReadingGroups(items: readonly Reading[], companyId: string) {
  const all = items.filter((reading) => reading.companyId === companyId);
  const culture = all.find((reading) => reading.topic === "culture");
  const others = all.filter((reading) => reading.id !== culture?.id);
  return { all, culture, others, anchor: others.length ? ("#guides" as const) : ("#talent-summary" as const) };
}

export type NextReading = {
  reading: Reading;
  reason: string;
  relationship: "deepen" | "compare";
  /** Present only while both sides' cited evidence exists and the pin matches. */
  comparison?: StoryComparison;
  /** The one slot kept for the first valid comparison with another company (curated order). */
  reserved?: true;
};
export const NEXT_READING_LIMIT = 3;

export type ReadingConnectionOrigin = "editorial" | "related_ids" | "same_company";
export type ReadingConnectionOutcome = "source_unavailable" | "target_unavailable" | "topic_filtered" |
  "duplicate" | "company_not_listed" | "comparison_invalid" | "limit" | "selected";
export type ReadingConnectionCandidate = Connection & {
  origin: ReadingConnectionOrigin;
  outcome: ReadingConnectionOutcome;
  comparisonPinStatus: "not_present" | "not_checked" | "sources_missing" | "stale" | "current";
};

/** Configured source IDs include unavailable stories, so an audit can explain dormant links. */
export const configuredConnectionSourceIds = (): string[] => Object.keys(connections);
/** Diagnostic fingerprint inputs, not a publication receipt or semantic approval. */
export const readingConnectionConfiguration = () => ({ policyVersion: 1, configuration, connections, pins, limit: NEXT_READING_LIMIT });

/**
 * Curated links first, then same-company follow-ups, at most three. When a
 * valid comparison with another company survives, one of the three slots is
 * kept for the first such link in curated order, so same-company follow-ups
 * cannot crowd it out. Without one the list is exactly the first three.
 */
export function nextReadings(
  pack: ResearchPack,
  id: string,
  allowedCompanyIds?: ReadonlySet<string>,
): NextReading[] {
  return readingConnectionTrace(pack, id, allowedCompanyIds).next;
}

/** The existing selector with a diagnostic trace, not a semantic quality assessment.
 * Preserve first-candidate precedence, including an invalid comparison shadowing
 * a later duplicate. Audit and UI must never disagree about the selected links.
 */
export function readingConnectionTrace(
  pack: ResearchPack,
  id: string,
  allowedCompanyIds?: ReadonlySet<string>,
): { candidates: ReadingConnectionCandidate[]; next: NextReading[] } {
  const items = readingItems(pack);
  const current = items.find((reading) => reading.id === id);
  const tagged = (rows: Connection[], origin: ReadingConnectionOrigin): ReadingConnectionCandidate[] =>
    rows.map(row => ({ ...row, origin, outcome: "source_unavailable", comparisonPinStatus: row.comparison ? "not_checked" : "not_present" }));
  const guide = (current?.company ?? pack.companies.find(c => c.guides?.some(g => g.id === id)))?.guides?.find(g=>g.id===id);
  const editorial = tagged(connections[id] ?? [], "editorial");
  const dynamic = guide?.publication?.relatedIds.map(target=>({id:target,reason:"같은 회사의 다른 이야기를 이어서 읽어요."})) ?? [];
  if (!current) return { candidates: [...editorial, ...tagged(dynamic, "related_ids")], next: [] };
  const incoming = items.filter(item=>item.companyId===current.companyId && item.id!==id && item.company.guides?.find(g=>g.id===item.id)?.publication)
    .map(item=>({id:item.id,reason:"이 회사에 대해 새로 확인한 이야기를 읽어요."}));
  // The same approved snapshot drives list, detail, related links and return validation.
  const isGeneral = (topic: ReadingTopic) => ["vision", "culture", "business"].includes(topic);
  const candidates = [...editorial, ...tagged(dynamic, "related_ids"), ...tagged(incoming, "same_company")];
  const seen = new Set<string>();
  const surviving = candidates.flatMap((connection): NextReading[] => {
      const reading = items.find((candidate) => candidate.id === connection.id);
      // Follow-ups were filtered before deduplication in the original selector.
      if (connection.origin !== "editorial") {
        if (!reading) { connection.outcome = "target_unavailable"; return []; }
        if (isGeneral(current.topic) && !isGeneral(reading.topic)) { connection.outcome = "topic_filtered"; return []; }
      }
      if (seen.has(connection.id)) { connection.outcome = "duplicate"; return []; }
      seen.add(connection.id);
      if (reading && allowedCompanyIds && !allowedCompanyIds.has(reading.companyId)) {
        connection.outcome = "company_not_listed"; return [];
      }
      const comparison = connection.comparison;
      if (comparison) {
        if (!reading || !comparison.evidenceIds.from.length || !comparison.evidenceIds.to.length ||
          !comparison.evidenceIds.from.every(id => current.evidence.some(e => e.id === id)) ||
          !comparison.evidenceIds.to.every(id => reading.evidence.some(e => e.id === id))) {
          connection.comparisonPinStatus = "sources_missing";
        } else {
          connection.comparisonPinStatus = pinned.comparisons[`${current.id}>${reading.id}`] === comparisonPin(comparison,
            [...comparison.evidenceIds.from.map(id => current.evidence.find(e => e.id === id)), ...comparison.evidenceIds.to.map(id => reading.evidence.find(e => e.id === id))]) ? "current" : "stale";
        }
        if (connection.comparisonPinStatus !== "current") { connection.outcome = "comparison_invalid"; return []; }
      }
      if (!reading) { connection.outcome = "target_unavailable"; return []; }
      connection.outcome = "limit";
      return [
            {
              reading,
              reason: connection.reason,
              comparison,
              relationship:
                reading.companyId === current.companyId
                  ? ("deepen" as const)
                  : ("compare" as const),
            },
          ];
    });
  const best = surviving.findIndex(item => item.comparison && item.relationship === "compare");
  let next = surviving.slice(0, NEXT_READING_LIMIT);
  if (best >= 0) {
    const reserved: NextReading = { ...surviving[best], reserved: true };
    next = best < NEXT_READING_LIMIT ? next.map((item, index) => index === best ? reserved : item)
      : [...surviving.filter((_, index) => index !== best).slice(0, NEXT_READING_LIMIT - 1), reserved];
  }
  const selected = new Set(next.map(item => item.reading.id));
  for (const candidate of candidates) if (candidate.outcome === "limit" && selected.has(candidate.id)) candidate.outcome = "selected";
  return { candidates, next };
}

/**
 * Where the reserved comparison is shown: a story with two or more sections
 * carries it in the body after the second section (and the sidebar leaves it
 * out); any other reading keeps it in the sidebar list.
 */
export function comparisonPlacement(reading: Reading, next: NextReading[]): {
  bridge?: { reading: Reading; comparison: StoryComparison };
  sidebar: NextReading[];
} {
  const reserved = next.find(item => item.reserved && item.comparison);
  const bridge = reserved?.comparison && reading.sections && reading.sections.length >= 2
    ? { reading: reserved.reading, comparison: reserved.comparison } : undefined;
  return { bridge, sidebar: bridge ? next.filter(item => item.reading.id !== bridge.reading.id) : next };
}

// The one role list; a copy here once rejected every role added later.
const roles = new Set(Object.keys(roleLabels));
const companyIds = new Set(companies.map((company) => company.id));

/** Validate a decoded `from` value. Only bounded, known local routes are accepted;
 * nested `from` parameters cannot recursively grow return URLs. */
export function safeReturnPath(
  value: string | undefined,
  fallback: string,
  pack?: ResearchPack,
): string {
  if (
    !value ||
    value.length > 1000 ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return fallback;
  // Check before URL normalization: dot segments, encoded slashes and controls
  // must not turn a rejected path into a seemingly permitted one.
  if (
    /[\\\u0000-\u0020\u007f]/.test(value) ||
    /%25|%2f|%5c|%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(value)
  )
    return fallback;
  let url: URL;
  try {
    // URLSearchParams otherwise tolerates malformed escapes and encoded controls.
    if (/[\u0000-\u001f\u007f-\u009f\\]/.test(decodeURIComponent(value)))
      return fallback;
    url = new URL(value, "https://nextstep.invalid");
  } catch {
    return fallback;
  }
  const rawPath = value.split(/[?#]/, 1)[0];
  if (
    rawPath !== url.pathname ||
    rawPath.includes("%") ||
    rawPath.includes("..")
  )
    return fallback;
  const params = url.searchParams;
  const keys = [...params.keys()];
  // Only `size` repeats (one per band); a route that does not list it still rejects it.
  const single = keys.filter((key) => key !== "size");
  if (single.length !== new Set(single).size) return fallback;
  const only = (...allowed: string[]) =>
    keys.every((key) => allowed.includes(key));
  const roleValid = () => !params.has("role") || params.get("role") === "" || roles.has(params.get("role")!);
  if (url.pathname === "/discover") {
    return !url.hash &&
      only("topic", "sort") &&
      (!params.has("sort") || params.get("sort") === "recent") &&
      (!params.has("topic") ||
        Object.hasOwn(readingTopics, params.get("topic")!))
      ? value
      : fallback;
  }
  const company = /^\/companies\/([a-z0-9-]+)$/.exec(url.pathname);
  if (company) {
    return companyIds.has(company[1]) &&
      only("role") &&
      roleValid() &&
      (!url.hash || /^#[a-z][a-z0-9-]{0,79}$/.test(url.hash))
      ? value
      : fallback;
  }
  const reading = /^\/read\/([a-z0-9-]+)$/.exec(url.pathname);
  if (reading)
    return (pack ? !!getReading(pack,reading[1]) : readingIds.includes(reading[1])) && !url.hash && only("edge") && (!params.has("edge") || /^[a-f0-9]{64}$/.test(params.get("edge")!))
      ? value
      : fallback;
  if (/^\/jobs\/[a-zA-Z0-9_-]+$/.test(url.pathname))
    return !url.hash && !keys.length ? value : fallback;
  if (url.pathname === "/saved") return !url.hash && !keys.length ? value : fallback;
  if (url.pathname === "/jobs" || url.pathname === "/csr") {
    const page = params.get("page");
    // List links always carry size: each band once, or a lone `size=` for every size.
    const sizes = params.getAll("size");
    return !url.hash &&
      only("q", "role", "location", "page", "size", "new") &&
      roleValid() &&
      ((sizes.length === 1 && sizes[0] === "") || parseSizes(sizes).length === sizes.length) &&
      (!params.has("new") || parseNewDay(params.get("new")!) === params.get("new")) &&
      (!params.has("location") ||
        ["seoul", "pangyo"].includes(params.get("location")!)) &&
      (!params.has("q") || params.get("q")!.length <= 100) &&
      (page === null ||
        (/^[1-9]\d*$/.test(page) && Number.isSafeInteger(Number(page))))
      ? value
      : fallback;
  }
  return fallback;
}

/** Keep the previous question and starting topic alongside a job return path.
 * Each path is independently validated; no recursive return URL is accepted. */
export function readingJobReturn(back: string, rawFrom: unknown, rawOrigin: unknown, pack?: ResearchPack): string {
  if (!back.startsWith("/read/")) return back;
  const from = safeReturnPath(typeof rawFrom === "string" ? rawFrom : undefined, "", pack);
  const origin = safeReturnPath(typeof rawOrigin === "string" ? rawOrigin : undefined, "", pack);
  const trail = new URLSearchParams();
  if (from) trail.set("from", from);
  if (origin && !origin.startsWith("/read/")) trail.set("origin", origin);
  return back + (trail.size ? `${back.includes("?") ? "&" : "?"}${trail}` : "");
}
