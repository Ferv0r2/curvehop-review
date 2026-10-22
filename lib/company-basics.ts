import { companyAge } from "./company-age";
import { companyOverview, LISTED_VALUE } from "./company-overview";
import type { CompanyResearch } from "./research";
import { industryLabel } from "./company-fact-presentation";

/** `foundedAge` comes from the header's full founding date, so a year-only chip shows the header's tenure. */
export type CompanyBasics = { domain: string | null; founded: string | null; foundedAge: string | null; stage: string | null };

/**
 * The company header's verified basics as short chips: domain, founding year,
 * funding stage. Built from the same fields as the header, so a chip never
 * shows what the header would call unconfirmed; unknown values are null and
 * the chip is simply left out.
 */
// A chip is a label, not a sentence: long domains keep their first part.
const chipText = (text: string) => (text.length > 16 && text.includes("·") ? text.split("·")[0].trim() : text);

export function companyBasics(company?: CompanyResearch): CompanyBasics {
  const [founded, domain, , funding] = companyOverview(company);
  const year = (text: string) => text.match(/(\d{4})/)?.[1] ?? null;
  const foundedYear = founded.value !== "미확인" ? founded.value.match(/(\d{4})년/)?.[1] : undefined;
  let stage: string | null = null;
  if (funding.value === LISTED_VALUE) stage = "상장 이력";
  else if (/^(?:Pre[- ]?)?Series /i.test(funding.value)) {
    const at = year(funding.note);
    stage = at ? `${funding.value} · ${at}` : funding.value;
  }
  return {
    domain: industryLabel(domain.value) ? chipText(domain.value.split(" · ")[0].trim()) : null,
    // The header's fact says when the year is a foreign or parent entity's.
    founded: foundedYear ? `${foundedYear}년 설립${/모회사|글로벌|미국|해외|본사/.test(founded.value) ? "(해외 본사)" : ""}` : null,
    foundedAge: foundedYear ? companyAge(founded.value) : null,
    stage,
  };
}
