/**
 * DART filing wording, in one place: the published fact sentences
 * (`lib/dart-publication.ts`), the company page's 종속기업 지분 변화 block
 * (`components/company-relations.tsx`) and the wiki's relation records
 * (`lib/wiki.ts`) all read a filing through these helpers, so the block, the
 * wiki and the fact they repeat cannot drift apart.
 */
import { DART_PUBLISHER } from "./research-labels";

/** Fiscal period `YYYY-MM` as the fact sentence names it: 2025년 / 2025년 3월 결산. */
export const dartYear = (period: string) =>
  period.endsWith("-12") ? `${period.slice(0, 4)}년` : `${period.slice(0, 4)}년 ${Number(period.slice(5, 7))}월 결산`;
/** The end of a fiscal period: 2025년 말 / 2025년 3월 말. */
export const dartPeriodEnd = (period: string) =>
  period.endsWith("-12") ? `${period.slice(0, 4)}년 말` : `${period.slice(0, 4)}년 ${Number(period.slice(5, 7))}월 말`;
/** The same month a year earlier: 2025-12 → 2024-12. */
export const dartPriorPeriod = (period: string) => `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
/** Stored floats as written, without trailing zeros (71.8 → "71.8%", 100 → "100%"); null is the report's blank. */
export const dartStakeText = (value: number | null) => (value === null ? "없음(-)" : `${value}%`);

/** A DART report name or evidence title ("[기재정정]사업보고서 (2025.12) · …") → its document name and whether it is an amendment. */
export function dartDocument(reportName: string): { name: string; corrected: boolean } {
  return { name: reportName.replace(/^\[[^\]]+\]\s*/, "").split(" ")[0], corrected: /^\[/.test(reportName) };
}

/** `<co>-dart-<rceptNo>`: the filing an evidence ID names, or null for anything else. */
export function dartFilingNumber(companyId: string, evidenceId: string): string | null {
  const rest = evidenceId.startsWith(`${companyId}-dart-`) ? evidenceId.slice(companyId.length + 6) : "";
  return /^\d{14}$/.test(rest) ? rest : null;
}

export type DartFactShape = "annual" | "subsidiaries" | "event";
/** The fact IDs `dartCandidate` writes, by ID alone: `<co>-dart-<YYYYMM>`, `<co>-dart-subsidiaries-<YYYYMM>`, `<co>-dart-event-<rceptNo>`. */
export function dartFactIdShape(companyId: string, factId: unknown): DartFactShape | null {
  if (typeof factId !== "string" || !factId.startsWith(`${companyId}-dart-`)) return null;
  const rest = factId.slice(companyId.length + 6);
  return /^\d{6}$/.test(rest) ? "annual" : /^subsidiaries-\d{6}$/.test(rest) ? "subsidiaries" : /^event-\d{14}$/.test(rest) ? "event" : null;
}
/**
 * A fact as `dartCandidate` (`lib/dart-publication.ts`) writes it: the ID form,
 * and every cited source a `<co>-dart-<rceptNo>` filing by the DART publisher.
 * Null for anything else, a DART-shaped ID citing another source included.
 */
export function dartFactShape(companyId: string, fact: { id?: unknown; evidenceIds?: unknown }, evidence: ReadonlyMap<string, { publisher?: unknown }>): DartFactShape | null {
  const shape = dartFactIdShape(companyId, fact.id), ids = fact.evidenceIds;
  return shape && Array.isArray(ids) && ids.length > 0 &&
    ids.every(id => typeof id === "string" && dartFilingNumber(companyId, id) !== null && evidence.get(id)?.publisher === DART_PUBLISHER) ? shape : null;
}

/**
 * Title of one subsidiaries filing, as the page's group header and the wiki
 * sentence both write it: "2025년 감사보고서", "2025년 사업보고서",
 * "2025년 정정 사업보고서". The collector reads only audit and business
 * reports, so any other stored title reads as the audit report.
 */
export function subsidiaryFilingTitle(period: string, evidenceTitle: string | undefined): string {
  const { name, corrected } = dartDocument(evidenceTitle ?? "");
  return `${dartYear(period)} ${corrected ? "정정 " : ""}${name === "사업보고서" ? name : "감사보고서"}`;
}

export type SubsidiaryFilingRef = { evidenceId: string; rceptNo: string; period: string; title: string };
/**
 * The filing a `subsidiary_of` row repeats: its first `<co>-dart-<rceptNo>`
 * evidence the company holds, with the period and title the page and the wiki
 * show. Null when the row has no period or names no such filing.
 */
export function subsidiaryFiling(
  companyId: string,
  relation: { asOf: string | null; evidenceIds: readonly string[] },
  evidence: ReadonlyMap<string, { title: string }>,
): SubsidiaryFilingRef | null {
  if (typeof relation.asOf !== "string" || !Array.isArray(relation.evidenceIds)) return null;
  const evidenceId = relation.evidenceIds.find(id => typeof id === "string" && evidence.has(id) && dartFilingNumber(companyId, id));
  if (!evidenceId) return null;
  const period = relation.asOf.slice(0, 7);
  return { evidenceId, rceptNo: dartFilingNumber(companyId, evidenceId)!, period, title: subsidiaryFilingTitle(period, evidence.get(evidenceId)?.title) };
}
