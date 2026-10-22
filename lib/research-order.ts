import type { CompanyResearch, Headcount, ResearchFact } from "./research";
import { resolveFactTimes, type ResolvedTime } from "./time-axis";

/** Dates already validated by the research reader: YYYY, YYYY-MM or YYYY-MM-DD.
 * Keep partial dates intact ("2020" sorts below "2020-05"), unknown dates last,
 * and ties in their input order. A recently checked source must not look newly published. */
export function newestFirst<T>(items: readonly T[], date: (item: T) => string | null): T[] {
  return items.toSorted((a, b) => (date(b) ?? "").localeCompare(date(a) ?? ""));
}

type TimelineEntry =
  | { kind: "headcount"; value: Headcount }
  | { kind: "fact"; value: ResearchFact };

/**
 * Headcount and facts mixed newest first: a fact by its time-axis sort key
 * (`resolveFactTimes`), a headcount record by its `referenceOn`. A fact with
 * no time role or several dates in its text (timeless, composite) goes last.
 * Pass `times` resolved on the whole company when `company` is a filtered view.
 */
export function companyResearchTimeline(company: CompanyResearch, times: ReadonlyMap<string, ResolvedTime> = resolveFactTimes(company)): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...company.headcount.map(value => ({ kind: "headcount" as const, value })),
    ...company.facts.map(value => ({ kind: "fact" as const, value })),
  ];
  return newestFirst(entries, item => {
    const time = item.kind === "fact" ? times.get(item.value.id) : undefined;
    return time ? time.sortKey : item.value.referenceOn;
  });
}
