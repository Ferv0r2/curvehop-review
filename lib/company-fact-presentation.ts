import { dartFactShape, dartPeriodEnd, dartPriorPeriod, dartYear, subsidiaryFilingTitle } from "./dart-wording";
import { DART_PUBLISHER } from "./research-labels";
import type { Evidence, ResearchFact } from "./research";

/** Presentation only: prose stays prose; never cut a description into a guessed industry. */
export function industryLabel(text: string): string | null {
  const value = text.trim();
  return !value || value === "미확인" || value.length > 48 || /[.!?。\n]|(?:해요|이에요|예요|합니다|입니다|한다|있다|하는|위한|통해|에서는|회사는|기업은)/.test(value) ? null : value;
}

export type FinancialPresentation = {
  title: string;
  document: string;
  basis: "별도 재무제표";
  publishedOn: string;
  sources: Evidence[];
  metrics: { label: string; value: string }[];
  equity: { period: string; value: string }[];
  caveat: string | null;
};

const amount = "-?\\d[\\d,]*(?:조(?: \\d[\\d,]*억)?|억(?: \\d[\\d,]*만)?|만)?원";
const annual = new RegExp(`^(\\d{4}-\\d{2}-\\d{2}) ${DART_PUBLISHER}에 공시된 (.+?)\\(별도 재무제표\\)에 따르면 (매출|영업수익)은 (${amount}), (영업손실|영업이익)은 (${amount}), (당기순손실|당기순이익)은 (${amount})이에요\\. 자본총계는 (.+?)이에요\\.( 자본총계가 음수인 이유는 이 공시 숫자만으로 알 수 없어요\\.)?$`);

/**
 * Decode only the exact annual sentence dartFactText already publishes. This
 * keeps historic receipt hashes and future collector runs unchanged. The
 * full sentence, period, source and document must agree; otherwise the caller
 * shows the original prose. Amounts stay verbatim: no rounding, deltas or risk
 * judgments are calculated from the truncated presentation strings.
 */
export function financialPresentation(companyId: string, fact: ResearchFact, sources: Evidence[]): FinancialPresentation | null {
  if (fact.text.length > 2000 || fact.kind !== "milestone" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(fact.referenceOn ?? "") ||
    sources.length !== 1 || sources[0].access !== "page" || sources[0].kind !== "official" ||
    dartFactShape(companyId, fact, new Map(sources.map(source => [source.id, source]))) !== "annual" ||
    fact.id !== `${companyId}-dart-${fact.referenceOn!.replace("-", "")}`) return null;
  const match = annual.exec(fact.text);
  if (!match || match[0] !== fact.text) return null;
  const [, publishedOn, title, revenue, revenueValue, operating, operatingValue, net, netValue, equityText, caveat] = match;
  const period = fact.referenceOn!;
  // subsidiaryFilingTitle is a display helper, not validation: it substitutes
  // the supplied period and defaults unknown document names to 감사보고서.
  const sourceDocument = /^(?:\[[^\]]+\]\s*)?(감사보고서|사업보고서) \((\d{4})\.(\d{2})\)(?: · 금융감독원 전자공시)?$/.exec(sources[0].title);
  if (!sourceDocument || `${sourceDocument[2]}-${sourceDocument[3]}` !== period) return null;
  if (sources[0].publishedOn !== publishedOn || title !== subsidiaryFilingTitle(period, sources[0].title)) return null;
  const currentEnd = dartPeriodEnd(period), priorEnd = dartPeriodEnd(dartPriorPeriod(period));
  const equityMatch = new RegExp(`^(?:${priorEnd} (${amount})에서 )?${currentEnd} (${amount})$`).exec(equityText);
  if (!equityMatch) return null;
  return {
    title: `${dartYear(period)} 재무 현황`, document: title.slice(dartYear(period).length + 1), basis: "별도 재무제표", publishedOn, sources,
    metrics: [{ label: revenue, value: revenueValue }, { label: operating, value: operatingValue }, { label: net, value: netValue }],
    equity: [...(equityMatch[1] ? [{ period: priorEnd, value: equityMatch[1] }] : []), { period: currentEnd, value: equityMatch[2] }],
    caveat: caveat?.trim() ?? null,
  };
}
