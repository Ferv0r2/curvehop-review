import type { Job } from "./jobs";
import type { Reading } from "./reading";

/** Navigation, not an assessment of fit. A role/process story needs this
 * posting's exact source; topic membership alone cannot establish relevance.
 * Other stories remain available from the company page. No prose classifiers. */
export function jobReadings(readings: readonly Reading[], companyId: string, job: Pick<Job, "sourceUrl">) {
  const company = readings.filter(reading => reading.companyId === companyId);
  const posting = company.filter(reading => reading.evidence.some(e => e.url === job.sourceUrl));
  const postingIds = new Set(posting.map(reading => reading.id));
  const general = company.filter(reading => !postingIds.has(reading.id) &&
    (reading.topic === "vision" || reading.topic === "business" || reading.topic === "culture"));
  // Keep the immediate choice short without silently deleting company material.
  return { posting, selected: [...posting, ...general].slice(0, 5) };
}
