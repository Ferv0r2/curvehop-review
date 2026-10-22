import { companies, companiesAddedOn, type Identity } from "./companies";
import { latestArrivals } from "./new-arrivals";
import { listedJobs, type CompanyListing } from "./company-listing";
import { isVacancy } from "./eligibility";
import type { Job } from "./jobs";

/** Each tile uses its own latest KST day. Dates remain registration/first sighting,
 * not publication time or an invented first-qualified time. Unknown jobs hide
 * only their tile. Eligibility and counts use the same corrected research view.
 */
export function discoveryArrivals(
  listing: CompanyListing, jobs: readonly Job[] | null, now: Date,
  roster: readonly Identity[] = companies, addedOn: ReadonlyMap<string, string> = companiesAddedOn,
) {
  const identities = roster.filter(company => listing.eligibleIds.has(company.id));
  const companyDay = latestArrivals({ jobFirstSeen: [], companyAddedOn: identities.map(company => addedOn.get(company.id)) }, now);
  const jobDay = jobs && latestArrivals({ jobFirstSeen: listedJobs(jobs, listing.eligibleIds).filter(isVacancy).map(job => job.firstSeenAt), companyAddedOn: [] }, now);
  if (!companyDay && !jobDay) return null;
  return {
    companies: companyDay ? {
      day: companyDay.day, today: companyDay.today, count: companyDay.companies,
      logos: identities.filter(company => addedOn.get(company.id) === companyDay.day).slice(0, 3)
        .map(company => ({ companyId: company.id, name: company.name, color: company.color })),
    } : undefined,
    jobs: jobDay ? { day: jobDay.day, today: jobDay.today, count: jobDay.jobs } : undefined,
  };
}
