import type { CompanyResearch, Evidence, Headcount } from "./research";

/**
 * Rules every view applies to research records — the company header, the
 * timeline and the wiki — so one record never reads differently between them.
 */
export const HEADCOUNT_SCOPE: Record<Headcount["scope"], string> = { "legal-entity": "해당 법인", domestic: "국내", consolidated: "연결" };
export const headcountMeasurement = (record: Pick<Headcount, "measurement">) => record.measurement === "pension-subscribers" ? "국민연금 가입자" : "보고 인원";
/** Publisher of every filing the DART collector records. */
export const DART_PUBLISHER = "금융감독원 전자공시";

/** The cited sources, or none unless every ID resolves. */
export function citedSources(company: Pick<CompanyResearch, "evidence"> | undefined, ids: readonly string[]): Evidence[] {
  const sources = ids.flatMap(id => company?.evidence.filter(item => item.id === id) ?? []);
  return ids.length > 0 && sources.length === ids.length ? sources : [];
}

/** Every cited source resolves and its page was opened, not only seen in a search index. */
export function openedSources(company: Pick<CompanyResearch, "evidence"> | undefined, ids: readonly string[]) {
  const sources = citedSources(company, ids);
  return sources.length > 0 && sources.every(source => source.access === "page");
}
