/*
 * Research-process sentences: sentences about our own research (what was checked, how, what to read next)
 * rather than about the company (DESIGN 제품 문구 기준). This module is the one home of the concept, with
 * two rules for two uses:
 *
 * - ABOUT_RESEARCH_BROAD: "not usable as a business-description line" (lib/company-stats.ts businessLine).
 *   Broad on purpose: it also refuses present-tense reading guidance ("…를 살펴봐요", "…를 확인해요",
 *   "…구분해서 봐야 합니다", "…읽어야 합니다"), unknowns ("미확인") and a company's records ("기록했"),
 *   since a one-line business description should state what the company does and nothing else.
 *
 * - isResearchProcessSentence (narrow, plan 2026-10-12 D4): the sentences removed from a displayed company
 *   summary. Only past-tense research actions and check-list tags; present-tense guidance and reading cautions
 *   stay so summaries do not empty out and limits the reader needs are kept. The stored summary is never
 *   edited: the screen drops these sentences whole (no clause is rewritten, the rest stays verbatim) and
 *   researchProcessCompanyIds names the companies to nominate for a new research run. A sentence is one when it
 *    1. reports our own research action in the past tense: 확인했(습니다|어요|고), 보강했…, 구분해 기록했…
 *       ("법인 설립일과 상장 이력은 공식 자료로 확인했습니다"). Reported speech is the company's, not ours
 *       ("…를 확인했다고 밝혔어요"), a company's own record is not ours ("최대 매출을 기록했어요"), and a
 *       concession states a limit the reader needs ("공개 제도는 확인했지만 … 자료는 아니에요"); or
 *    2. is a checklist label rather than a sentence: "공식 회사 소개 확인 · 현재 직원 수 미확인".
 *   Sentences that state the company's facts with their source stay ("공식 소개에 설립일이 … 기재되어
 *   있습니다", "공식 자료는 2010년 창업과 … 설명합니다"). Every narrow match is also a broad match.
 *
 * Summaries are our own sentences (company claims are attributed, "밝혔어요/소개해요"), so a bare
 * "확인했습니다" is our voice. Nothing here reads the network or the file system.
 */
import { answerSentences } from "./card-summary";
import type { ResearchPack } from "./research";

/** Not usable as a business-description line (see the module comment); no `g` flag, so `.test` is stateless. */
export const ABOUT_RESEARCH_BROAD = /살펴봐요|확인해요|확인했|기록했|구분해|보강했|읽어야|봐야|미확인|확인 ·/;

const PAST_RESEARCH_ACTION = /(?:확인|보강)했(?!다|지만)|구분해(?:서)? 기록했(?!다|지만)/;
const CHECKLIST_LABEL = / 확인 · |· [^·]*미확인$/;

export function isResearchProcessSentence(sentence: string): boolean {
  const text = sentence.trim();
  return PAST_RESEARCH_ACTION.test(text) || CHECKLIST_LABEL.test(text);
}

/** The research-process sentences of a summary, verbatim and in order. */
export function researchProcessSentences(summary: string): string[] {
  return answerSentences(summary).filter(isResearchProcessSentence);
}

/**
 * A summary as the screen shows it: without its research-process sentences, the others verbatim and in
 * order. Unchanged when it has none; "" when every sentence was one (the screen then shows no summary).
 */
export function withoutResearchProcess(summary: string): string {
  const sentences = answerSentences(summary);
  const kept = sentences.filter((sentence) => !isResearchProcessSentence(sentence));
  return kept.length === sentences.length ? summary : kept.join(" ");
}

/** Companies whose stored summary has a research-process sentence: research candidates for a later PR. */
export function researchProcessCompanyIds(pack: Pick<ResearchPack, "companies">): string[] {
  return pack.companies.filter((company) => researchProcessSentences(company.summary).length > 0).map((company) => company.id);
}
