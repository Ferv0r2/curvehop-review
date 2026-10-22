import { companies, companyForJob, type Identity } from "./companies";
import { companyLogos } from "./company-logos";
import { companyOverview } from "./company-overview";
import { readingItems } from "./reading";
import type { CompanyResearch, ResearchPack } from "./research";
import type { Job } from "./jobs";
import { verifyCompanyIcon } from "./company-icon-collector";

export const listingRequirements = {
  logo: "공식 로고",
  identity: "공식 페이지로 연결된 회사 신원",
  business: "출처가 있는 사업 설명",
  reading: "본문과 원문 근거가 있는 발행 글",
} as const;
export type ListingGap = keyof typeof listingRequirements;
const logoIds = new Set(Object.keys(companyLogos));

/**
 * 출처가 있는 사업 설명: a summary plus a domain the overview verified from opened sources. The listing
 * floor and the job page's '어떤 회사일까요?' use this one definition.
 */
export function hasSourcedBusiness(company: CompanyResearch | undefined): company is CompanyResearch {
  const domain = companyOverview(company)[1];
  return !!company?.summary.trim() && domain.sources.length > 0 && !!domain.value.trim();
}

/** Browse floor, not a research sufficiency score. Pass the corrected service pack.
 * Logo files are checked by CI and the audit CLI, never by a live network probe.
 * No stored ready flag, no changes to collectors, wiki, direct URLs or bookmarks.
 */
export function companyListing(pack: ResearchPack, roster: readonly Identity[] = companies, availableLogos: ReadonlySet<string> = logoIds) {
  const readings = readingItems(pack);
  const rows = roster.map(identity => {
    const company = pack.companies.find(item => item.id === identity.id);
    const own = readings.filter(item => item.companyId === identity.id);
    const missing: ListingGap[] = [];
    const collectedLogo = company?.icon && company.onboarding?.discoveryReceiptHash === company.icon.discoveryReceiptHash && verifyCompanyIcon(company.icon);
    if (!availableLogos.has(identity.id) && !collectedLogo) missing.push("logo");
    if (!company?.identityEvidence.some(id => company.evidence.some(e => e.id === id && e.kind === "official" && e.access === "page"))) missing.push("identity");
    if (!hasSourcedBusiness(company)) missing.push("business");
    if (!own.some(story => story.question.trim() && story.preview.trim() && story.answer.trim()
      && story.evidence.length && story.evidence.every(e => e.access === "page")
      && (!story.sections || story.sections.every(section => section.text.trim())))) missing.push("reading");
    return { id: identity.id, eligible: missing.length === 0, missing };
  });
  return { rows, eligibleIds: new Set(rows.filter(row => row.eligible).map(row => row.id)) };
}
export type CompanyListing = ReturnType<typeof companyListing>;

/** Filter before querying/pagination, using the registered board identity. */
export function listedJobs(jobs: readonly Job[], eligibleIds: ReadonlySet<string>): Job[] {
  return jobs.filter(job => {
    const identity = companyForJob(job);
    return !!identity && eligibleIds.has(identity.id);
  });
}
