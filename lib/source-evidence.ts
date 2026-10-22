import type { CompanyResearch, Evidence } from "./research";
import { readingItems } from "./reading";
import { assessmentForCompany } from "./question-assessment";

import { EVIDENCE_ORIGINS, type EvidenceOrigin } from "./evidence-origin";
export { EVIDENCE_ORIGINS, EVIDENCE_ORIGIN_LABELS, EVIDENCE_ORIGIN_DESCRIPTIONS, type EvidenceOrigin } from "./evidence-origin";
export function evidenceOrigin(source: Evidence): EvidenceOrigin {
  let host = "";
  try { host = new URL(source.url).hostname.toLowerCase(); } catch { /* validated inputs normally have a URL */ }
  if (/(^|\.)(?:go\.kr|dart\.fss\.or\.kr|opendart\.fss\.or\.kr|nps\.or\.kr)$/.test(host)) return "public-record";
  return source.kind === "official" ? "company-original" : source.kind === "press" ? "reporting" : "republication";
}

/** Current service projection only: stored, historical, unreferenced and search-only records do not count. */
export function citedEvidenceByCompany(research: readonly CompanyResearch[]): Map<string, Evidence[]> {
  const readings = readingItems({ version: 1, companies: [...research] });
  return new Map(research.map(company => {
    const refs = new Set([
      ...company.identityEvidence,
      ...company.facts.flatMap(fact => fact.evidenceIds),
      ...company.headcount.flatMap(point => point.evidenceIds),
      ...readings.filter(reading => reading.companyId === company.id).flatMap(reading => [
        ...reading.evidence.map(source => source.id), ...(reading.sections ?? []).flatMap(section => section.evidenceIds),
      ]),
      ...assessmentForCompany(company).questions.flatMap(question => question.facets
        .filter(facet => (facet.status === "partial" || facet.status === "sufficient") && facet.claim.trim())
        .flatMap(facet => facet.evidenceIds)),
    ]);
    return [company.id, company.evidence.filter(source => refs.has(source.id) && source.access === "page")];
  }));
}

export type EvidenceOriginCount = { origin: EvidenceOrigin; companies: number; records: number };
export function evidenceOriginCounts(cited: ReadonlyMap<string, readonly Evidence[]>): EvidenceOriginCount[] {
  return EVIDENCE_ORIGINS.map(origin => ({
    origin,
    companies: [...cited.values()].filter(sources => sources.some(source => evidenceOrigin(source) === origin)).length,
    records: [...cited.values()].reduce((total, sources) => total + sources.filter(source => evidenceOrigin(source) === origin).length, 0),
  })).filter(row => row.records > 0);
}
