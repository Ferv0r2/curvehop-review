import { companyForJob } from "./companies";
import { postingCompanyLabel } from "./posting-company";
import { isVacancy } from "./eligibility";
import type { Job } from "./jobs";
import type { SavedJob } from "./bookmarks";

export function savedCards(jobs: Job[], ids: string[]): SavedJob[] {
  const selected = new Set(ids);
  return jobs.filter(job => selected.has(job.id) && isVacancy(job)).map(job => ({
    id: job.id, company: postingCompanyLabel(job) ?? job.company, companyId: companyForJob(job)?.id,
    color: job.color, title: job.title, locationLabel: job.locationLabel,
  })).sort((a, b) => a.company.localeCompare(b.company, "ko") || a.title.localeCompare(b.title, "ko"));
}
