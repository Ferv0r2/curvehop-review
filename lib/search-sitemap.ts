import { companyListing, listedJobs } from "./company-listing";
import { isVacancy } from "./eligibility";
import { readingItems } from "./reading";
import type { ResearchPack } from "./research";
import type { Job } from "./jobs";

/** Derived from the same corrected pack and listing floor as the public UI. */
export function searchPaths(pack: ResearchPack, jobs: readonly Job[]): string[] {
  const { eligibleIds } = companyListing(pack);
  const paths = ["/about", "/discover", "/companies", "/jobs"];
  for (const id of eligibleIds) paths.push(`/companies/${encodeURIComponent(id)}`);
  for (const item of readingItems(pack)) if (eligibleIds.has(item.companyId)) paths.push(`/read/${encodeURIComponent(item.id)}`);
  for (const job of listedJobs(jobs.filter(isVacancy), eligibleIds)) paths.push(`/jobs/${encodeURIComponent(job.id)}`);
  return [...new Set(paths)];
}
