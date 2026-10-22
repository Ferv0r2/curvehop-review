import { readFileSync } from "node:fs";
import type { ResearchPack } from "../../lib/research";

/*
 * The live data's own time, for tests that read the mini PC worker's files (data/jobs.json,
 * data/company-research.json, ...). The worker runs `pnpm test` on newer data than main has,
 * so such a test must not evaluate the data at the wall clock (it would pass or fail with the
 * day) nor at a fixed date (newer evidence would be "in the future"). It evaluates at the time
 * the data itself records instead (A1, scripts/data-perturbation-check.ts checks this).
 */

/** The day the newest evidence in the pack was checked, at 00:00 UTC: research validation at this time accepts every check the pack records. */
export function researchTime(pack: { companies: readonly { evidence: readonly { checkedOn: string }[] }[] }): Date {
  let newest = "";
  for (const company of pack.companies) for (const evidence of company.evidence) if (evidence.checkedOn > newest) newest = evidence.checkedOn;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newest)) throw new Error("리서치 자료에 확인 날짜가 없습니다.");
  return new Date(`${newest}T00:00:00.000Z`);
}

/** `researchTime` of the live data/company-research.json. */
export const liveResearchTime = () => researchTime(JSON.parse(readFileSync("data/company-research.json", "utf8")) as ResearchPack);

/** The newest successful collection in a jobs snapshot (its sources' lastSuccessAt): the time the postings were last seen. */
export function snapshotTime(snapshot: { sources: { lastSuccessAt?: string | null }[] }): Date {
  const times = snapshot.sources.map((source) => Date.parse(source.lastSuccessAt ?? "")).filter(Number.isFinite);
  if (!times.length) throw new Error("공고 자료에 마지막 성공 수집 시각이 없습니다.");
  return new Date(Math.max(...times));
}
