import type { CompanyResearch, Headcount, Issue, ResearchFact } from "./research";
import type { Relation } from "./relations";
import { dartFactIdShape, dartFactShape } from "./dart-wording";
import { DART_PUBLISHER } from "./research-labels";

/**
 * Time axis, phase 1: what a date on a record means.
 *
 *   event      occurredOn                the day something happened
 *   state      asOf | validFrom~validTo  true at one point, or over the span the source states
 *   timeless                             describes the company; no time role
 *   composite                            several dates inside one text
 *
 * Publication (`publishedOn`) and our reading (`checkedOn`) stay on the cited
 * evidence. A value keeps the source's precision: YYYY, YYYY-MM or YYYY-MM-DD.
 * An end is written only when the source states one; absence is never an end.
 *
 * Invariant: validateFactTime only loosens. Tighten a rule only after
 * versioning the rules first: receipts keep `before` packs that may hold `time`,
 * and their replay runs this validation again (docs/time-axis.md).
 *
 * Pure: no clock, no I/O. research.ts and relations.ts are imported for types only.
 */
export type TimeValue = string;
export type FactTime =
  | { kind: "event"; occurredOn: TimeValue | null }
  | { kind: "state"; asOf: TimeValue | null; validFrom: TimeValue | null; validTo: TimeValue | null; supersedes?: string[] }
  | { kind: "timeless" }
  | { kind: "composite" };
export const FACT_TIME_KEYS = {
  event: ["kind", "occurredOn"], state: ["kind", "asOf", "validFrom", "validTo", "supersedes"], timeless: ["kind"], composite: ["kind"],
} as const;
export type TimeOrigin = "stored" | "dart-annual" | "dart-subsidiaries" | "dart-event" | "pipeline"
  | "founded" | "domain" | "scale" | "funding" | "legacy" | "headcount" | "relation" | "correction";
export type PlaceBasis = "filing" | "occurred" | "funding" | "reference";
export type ResolvedTime = {
  kind: FactTime["kind"] | "unclassified"; origin: TimeOrigin;
  occurredOn: TimeValue | null; asOf: TimeValue | null; validFrom: TimeValue | null; validTo: TimeValue | null;
  /** Earliest `publishedOn` of the cited sources (not the fact's own publication). */
  publishedOn: string | null;
  /** Earliest `checkedOn` of the cited sources (conservative). */
  checkedOn: string | null;
  supersedes: string[]; supersededBy: string[];
  /** The original value string, for newest-first ordering. */
  sortKey: string | null;
  placeOn: string | null; placeBasis: PlaceBasis | null;
};
export type WikiTime = Omit<ResolvedTime, "origin" | "placeOn" | "placeBasis">;

type Span = { asOf: TimeValue | null; validFrom: TimeValue | null; validTo: TimeValue | null };
type FactLike = { id?: unknown; kind?: unknown; referenceOn?: unknown; scale?: unknown; evidenceIds?: unknown; time?: unknown };
type CompanyLike = { pipeline?: unknown; facts?: unknown };
type SourceLike = { publisher?: unknown; publishedOn?: unknown; checkedOn?: unknown };
type Sources = ReadonlyMap<string, SourceLike>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const DATE_KEYS = { event: ["occurredOn"], state: ["asOf", "validFrom", "validTo"], timeless: [], composite: [] } as const;

/**
 * A real calendar YYYY, YYYY-MM or YYYY-MM-DD as a UTC [first day, last day]
 * range. Months and days give exactly `validateResearch`'s range.
 */
export function timeRange(value: unknown): [number, number] | null {
  if (typeof value !== "string") return null;
  if (/^\d{4}$/.test(value)) {
    const start = Date.parse(`${value}-01-01T00:00:00Z`), end = Date.parse(`${value}-12-31T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end) ? [start, end] : null;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value)) return null;
  const start = Date.parse(`${value.length === 7 ? value + "-01" : value}T00:00:00Z`);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, value.length) !== value) return null;
  return [start, value.length === 10 ? start : Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)];
}

/** The one point a state is placed at, at its own precision. */
export const stateAnchor = (t: Span): TimeValue | null => t.asOf ?? t.validTo ?? t.validFrom;

/** The `referenceOn` a stored time implies: its month or day value, else null (a year is not a reference date). */
export function legacyReferenceOn(t: FactTime): string | null {
  const value = t.kind === "event" ? t.occurredOn : t.kind === "state" ? stateAnchor(t) : null;
  return value !== null && /^\d{4}-\d{2}/.test(value) ? value : null;
}

/** Written by a collector or the research runner, never by a person: DART-shaped by ID alone, or owned by the pipeline. */
export function isMachineOwnedFact(companyId: string, fact: { id?: unknown }, company: { pipeline?: unknown }): boolean {
  if (dartFactIdShape(companyId, fact.id)) return true;
  const owned = record(company.pipeline) ? company.pipeline.factIds : undefined;
  return Array.isArray(owned) && owned.includes(fact.id);
}

/** Every cited source, or none unless every ID resolves (like `citedSources`). */
function cited(fact: FactLike, sources: Sources): SourceLike[] {
  const ids = Array.isArray(fact.evidenceIds) ? fact.evidenceIds : [];
  const found = ids.map(id => (typeof id === "string" ? sources.get(id) : undefined));
  return ids.length > 0 && found.every(Boolean) ? (found as SourceLike[]) : [];
}
const earliest = (values: unknown[]) => values.filter((value): value is string => typeof value === "string" && !!value).sort()[0] ?? null;

/** The structural conventions below a stored time (spec §4). Null time: unclassified. */
function structural(companyId: string, company: CompanyLike, fact: FactLike, sources: Sources): { origin: TimeOrigin; time: FactTime | null } {
  const reference = typeof fact.referenceOn === "string" ? fact.referenceOn : null;
  const scaleAsOf = record(fact.scale) && typeof fact.scale.asOf === "string" ? fact.scale.asOf : null;
  const state = (asOf: string | null): FactTime => ({ kind: "state", asOf, validFrom: null, validTo: null });
  const shape = dartFactShape(companyId, fact, sources);
  if (shape === "annual") return { origin: "dart-annual", time: state(reference) };
  if (shape === "subsidiaries") return { origin: "dart-subsidiaries", time: state(reference) };
  if (shape === "event") return { origin: "dart-event", time: { kind: "event", occurredOn: reference } };
  const owned = record(company.pipeline) && Array.isArray(company.pipeline.factIds) && company.pipeline.factIds.includes(fact.id);
  if (owned) return { origin: "pipeline", time: typeof fact.id === "string" && fact.id.endsWith("-pipeline-scale-fact") ? state(scaleAsOf) : { kind: "composite" } };
  if (fact.id === `${companyId}-founded` && fact.kind === "context" && reference !== null) return { origin: "founded", time: { kind: "event", occurredOn: reference } };
  if (fact.id === `${companyId}-domain`) return { origin: "domain", time: { kind: "timeless" } };
  if (fact.scale !== undefined) return { origin: "scale", time: state(scaleAsOf) };
  if (fact.kind === "funding") return { origin: "funding", time: { kind: "event", occurredOn: reference } };
  return { origin: "legacy", time: null };
}

/**
 * V1–V7 for one fact's stored `time` (paths `<fact>.time…`). Only a person's
 * fact may hold one; its dates are real, not after the sources were read, and
 * its `referenceOn` is the one the time implies. Loose input: this runs inside
 * `validateResearch` on untrusted JSON.
 */
export function validateFactTime(companyId: string, fact: FactLike, company: { pipeline?: unknown }, sources: Sources, path: string): Issue[] {
  if (fact.time === undefined) return [];
  const at = path + ".time", time = fact.time, issues: Issue[] = [];
  const fail = (where: string, message: string) => { issues.push({ path: where, message }); return issues; };
  // V1: shape.
  if (!record(time)) return fail(at, "시간 정보는 객체여야 합니다(null은 쓰지 않아요).");
  if (typeof time.kind !== "string" || !Object.hasOwn(FACT_TIME_KEYS, time.kind)) return fail(at + ".kind", "event/state/timeless/composite 종류가 필요합니다.");
  const kind = time.kind as FactTime["kind"], allowed: readonly string[] = FACT_TIME_KEYS[kind];
  for (const key of Object.keys(time)) if (!allowed.includes(key)) issues.push({ path: `${at}.${key}`, message: `${kind} 시간 정보에 없는 항목입니다.` });
  for (const key of allowed) if (key !== "supersedes" && !(key in time)) issues.push({ path: `${at}.${key}`, message: "필수 항목이 없습니다." });
  if (kind === "state" && "supersedes" in time && !(Array.isArray(time.supersedes) && time.supersedes.length > 0))
    issues.push({ path: at + ".supersedes", message: "대체하는 사실 ID를 하나 이상 적거나 항목을 빼세요." });
  if (issues.length) return issues;
  // V2: only a person's fact.
  if (isMachineOwnedFact(companyId, fact, company) || fact.scale !== undefined)
    return fail(at, "공시·파이프라인이 만든 사실과 규모 사실에는 시간 정보를 적지 않습니다.");
  // V3: real calendar values.
  for (const key of DATE_KEYS[kind] as readonly string[])
    if (time[key] !== null && !timeRange(time[key])) issues.push({ path: `${at}.${key}`, message: "YYYY, YYYY-MM 또는 YYYY-MM-DD 날짜 또는 null이 필요합니다." });
  if (issues.length) return issues;
  const t = time as FactTime;
  // V4: nothing starts after the sources were read; an end is one that already happened.
  const checked = (Array.isArray(fact.evidenceIds) ? fact.evidenceIds : [])
    .map(id => (typeof id === "string" ? sources.get(id)?.checkedOn : undefined))
    .flatMap(value => (typeof value === "string" && value.length === 10 && timeRange(value) ? [timeRange(value)![0]] : []));
  if (checked.length) {
    const first = checked.reduce((a, b) => Math.min(a, b)); // no spread: evidenceIds may be very long
    const starts: [string, TimeValue | null][] = t.kind === "event" ? [["occurredOn", t.occurredOn]] : t.kind === "state" ? [["asOf", t.asOf], ["validFrom", t.validFrom]] : [];
    for (const [key, value] of starts) if (value !== null && timeRange(value)![0] > first) issues.push({ path: `${at}.${key}`, message: "근거 확인일보다 뒤에 시작하는 날짜는 쓸 수 없습니다." });
    if (t.kind === "state" && t.validTo !== null && timeRange(t.validTo)![1] > first)
      issues.push({ path: at + ".validTo", message: "끝(validTo)은 근거 확인일까지 실제로 끝난 날짜만 씁니다. 예정된 끝은 쓰지 않습니다." });
  }
  // V5: a span is ordered and holds its point.
  if (t.kind === "state") {
    const from = t.validFrom === null ? null : timeRange(t.validFrom)!, to = t.validTo === null ? null : timeRange(t.validTo)!;
    const point = t.asOf === null ? null : timeRange(t.asOf)!;
    if (from && to && from[0] > to[1]) issues.push({ path: at + ".validFrom", message: "시작(validFrom)은 끝(validTo)보다 늦을 수 없습니다." });
    if (point && ((from && point[0] < from[0]) || (to && point[1] > to[1]))) issues.push({ path: at + ".asOf", message: "기준 시점(asOf)은 시작과 끝 사이여야 합니다." });
  }
  // V6: `referenceOn` stays the value older readers use.
  const expected = t.kind === "event" || t.kind === "state" ? legacyReferenceOn(t) : null;
  if (fact.referenceOn !== expected)
    issues.push({ path: at, message: expected === null ? "월·일 날짜가 없는 시간 정보의 기준일(referenceOn)은 null이어야 합니다." : `기준일(referenceOn)은 시간 정보의 날짜 ${expected}와 같아야 합니다.` });
  // V7: kinds that cannot hold some roles.
  if (fact.kind === "funding" && t.kind !== "event") issues.push({ path: at + ".kind", message: "투자(funding) 사실은 사건(event)으로만 적습니다." });
  if (fact.kind === "milestone" && t.kind === "timeless") issues.push({ path: at + ".kind", message: "이정표(milestone) 사실은 시점 없는 설명(timeless)이 될 수 없습니다." });
  return issues;
}

/**
 * V8, once per company after the fact loop: each `supersedes` target is another
 * person's fact of the same company that resolves to a state, and its anchor
 * ends before this fact's anchor starts. A fact whose own time fails V1–V7
 * resolves as if it had none, so a broken target fails here too.
 */
export function validateSupersedes(companyId: string, company: CompanyLike, sources: Sources, path: string): Issue[] {
  const facts = Array.isArray(company.facts) ? company.facts : [];
  const linking = facts.some(fact => record(fact) && record(fact.time) && "supersedes" in fact.time);
  if (!linking) return [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const fact of facts) if (record(fact) && typeof fact.id === "string" && !byId.has(fact.id)) byId.set(fact.id, fact);
  const valid = new Map<unknown, boolean>();
  const timeOf = (fact: Record<string, unknown>): FactTime | null => {
    if (!valid.has(fact)) valid.set(fact, fact.time !== undefined && !validateFactTime(companyId, fact, company, sources, "").length);
    return valid.get(fact) ? (fact.time as FactTime) : structural(companyId, company, fact, sources).time;
  };
  const issues: Issue[] = [];
  facts.forEach((fact, index) => {
    if (!record(fact) || !record(fact.time) || !Array.isArray(fact.time.supersedes)) return;
    const own = timeOf(fact);
    if (own?.kind !== "state" || own !== fact.time) return;
    const anchor = stateAnchor(own), seen = new Set<unknown>();
    (fact.time.supersedes as unknown[]).forEach((target, j) => {
      const at = `${path}.facts[${index}].time.supersedes[${j}]`, fail = (message: string) => issues.push({ path: at, message });
      if (typeof target !== "string" || seen.has(target)) return fail("중복 없는 사실 ID가 필요합니다.");
      seen.add(target);
      if (target === fact.id) return fail("자기 자신을 대체할 수 없습니다.");
      const other = byId.get(target);
      if (!other) return fail(`같은 회사에 없는 사실입니다: ${target}`);
      if (isMachineOwnedFact(companyId, other, company)) return fail("공시·파이프라인이 만든 사실은 대체하지 않습니다.");
      const theirs = timeOf(other);
      if (theirs?.kind !== "state") return fail("상태(state)로 해석되는 사실만 대체할 수 있습니다.");
      const before = stateAnchor(theirs);
      if (anchor === null || before === null) return fail("양쪽 모두 기준 시점이 있어야 대체할 수 있습니다.");
      // A malformed anchor (e.g. a structural target's scale.asOf) is reported, never dereferenced.
      const theirRange = timeRange(before), ourRange = timeRange(anchor);
      if (!theirRange || !ourRange) return fail("양쪽 기준 시점이 올바른 날짜여야 대체할 수 있습니다.");
      if (theirRange[1] >= ourRange[0]) return fail("대체 대상의 기준 시점은 이 사실의 기준 시점이 시작하기 전에 끝나야 합니다.");
    });
  });
  return issues;
}

// Built per call: resolution depends only on the company passed in, never on an earlier call.
function sourcesOf(company: Pick<CompanyResearch, "evidence">) {
  return new Map(company.evidence.map(item => [item.id, item]));
}

/**
 * How every fact of a company reads in time: its stored time (a person's fact
 * only), else the structural convention, else unclassified. Resolve the whole
 * company, facts hidden by corrections included; visibility filters are for
 * rendering and links only.
 */
export function resolveFactTimes(company: CompanyResearch): Map<string, ResolvedTime> {
  const sources = sourcesOf(company), out = new Map<string, ResolvedTime>();
  for (const fact of company.facts) {
    const stored = fact.time !== undefined && !validateFactTime(company.id, fact, company, sources, "").length ? fact.time : undefined;
    const { origin, time } = stored ? { origin: "stored" as const, time: stored } : structural(company.id, company, fact, sources);
    out.set(fact.id, resolvedFact(fact, origin, time, cited(fact, sources)));
  }
  for (const [id, resolved] of out) for (const target of resolved.supersedes) out.get(target)?.supersededBy.push(id);
  return out;
}

function resolvedFact(fact: ResearchFact, origin: TimeOrigin, time: FactTime | null, sources: SourceLike[]): ResolvedTime {
  const span: Span = time?.kind === "state" ? time : { asOf: null, validFrom: null, validTo: null };
  const kind = time?.kind ?? "unclassified";
  let placeOn: string | null = null, placeBasis: PlaceBasis | null = null;
  if (fact.kind === "milestone" || fact.kind === "funding") {
    // A filing sits where it was filed; other facts keep their own date (lib/headcount-timeline.ts).
    const filed = sources.length > 0 && sources.every(source => source.publisher === DART_PUBLISHER && source.publishedOn) ? earliest(sources.map(source => source.publishedOn)) : null;
    if (filed) [placeOn, placeBasis] = [filed, "filing"];
    else if (fact.referenceOn) [placeOn, placeBasis] = [fact.referenceOn, fact.kind === "funding" ? "funding" : kind === "event" ? "occurred" : "reference"];
  }
  return {
    kind, origin,
    occurredOn: time?.kind === "event" ? time.occurredOn : null, asOf: span.asOf, validFrom: span.validFrom, validTo: span.validTo,
    publishedOn: earliest(sources.map(source => source.publishedOn)), checkedOn: earliest(sources.map(source => source.checkedOn)),
    supersedes: time?.kind === "state" ? [...(time.supersedes ?? [])] : [], supersededBy: [],
    sortKey: time === null ? fact.referenceOn : time.kind === "event" ? time.occurredOn : time.kind === "state" ? stateAnchor(time) : null,
    placeOn, placeBasis,
  };
}

/** The earliest publication and check dates of the cited sources (none unless every ID resolves), aggregated as on a fact. */
export function citedTimes(company: Pick<CompanyResearch, "evidence">, evidenceIds: readonly string[]): { publishedOn: string | null; checkedOn: string | null } {
  const sources = cited({ evidenceIds }, sourcesOf(company));
  return { publishedOn: earliest(sources.map(source => source.publishedOn)), checkedOn: earliest(sources.map(source => source.checkedOn)) };
}

/** A headcount record: an observation is a state at its count date; a publication-dated one has no known count date. */
export function headcountTime(company: Pick<CompanyResearch, "evidence">, h: Headcount): ResolvedTime {
  const sources = cited(h, sourcesOf(company)), observation = h.referenceBasis === "observation";
  return {
    kind: "state", origin: "headcount", occurredOn: null, asOf: observation ? h.referenceOn : null, validFrom: null, validTo: null,
    publishedOn: observation ? earliest(sources.map(source => source.publishedOn)) : h.referenceOn, checkedOn: earliest(sources.map(source => source.checkedOn)),
    supersedes: [], supersededBy: [], sortKey: h.referenceOn, placeOn: null, placeBasis: null,
  };
}

/** A relation: a structured or curated one is a state (reported on `reportedOn`); an identity relation has no time role. */
export function relationTime(relation: Pick<Relation, "origin" | "asOf" | "reportedOn" | "checkedOn"> & Partial<Pick<Relation, "validFrom" | "validTo">>): ResolvedTime {
  const base = { origin: "relation" as const, occurredOn: null, supersedes: [], supersededBy: [], checkedOn: relation.checkedOn ?? null, placeOn: null, placeBasis: null };
  if (relation.origin?.source === "identity") return { ...base, kind: "timeless", asOf: null, validFrom: null, validTo: null, publishedOn: null, sortKey: null };
  const span: Span = { asOf: relation.asOf ?? null, validFrom: relation.validFrom ?? null, validTo: relation.validTo ?? null };
  return { ...base, kind: "state", ...span, publishedOn: relation.reportedOn ?? null, sortKey: stateAnchor(span) };
}
