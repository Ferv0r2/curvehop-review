import "server-only";
import { readPreferences } from "./preference-store";
import { withPreferredRole, withPreferredSize } from "./preferences";
import { readRenderResearch, readRenderSnapshot } from "./render-data";
import { companySizes } from "./company-size";
import { isVacancy } from "./eligibility";
import { queryJobs, projectJob, type SearchParams } from "./jobs";
import { companyListing, listedJobs } from "./company-listing";
import { discoveryArrivals } from "./discovery-arrivals";
export { parseFilters } from "./jobs";

export async function listJobs(params: SearchParams) {
  const [snapshot, preferences, research] = await Promise.all([readRenderSnapshot(), readPreferences(), readRenderResearch()]);
  if (research.status !== "ok") throw new Error("Company research unavailable for browsing");
  const listing = companyListing(research.pack);
  const sizes = companySizes(research.pack);
  return { ...queryJobs(listedJobs(snapshot.jobs, listing.eligibleIds), withPreferredSize(withPreferredRole(params, preferences), preferences), sizes), sources: snapshot.sources };
}
/** Source states, for the per-job freshness line on the detail page. */
export async function getJobSources() {
  return (await readRenderSnapshot()).sources;
}
export async function getJob(id: string) {
  const job = (await readRenderSnapshot()).jobs.find(
    (job) => job.id === id && isVacancy(job),
  );
  return job ? projectJob(job) : undefined;
}
/** No snapshot-only cache: corrected research changes browse eligibility too. */
export async function boardArrivals(now = new Date()) {
  const [research, snapshot] = await Promise.all([readRenderResearch(), readRenderSnapshot().catch(() => null)]);
  return research.status === "ok" ? discoveryArrivals(companyListing(research.pack), snapshot?.jobs ?? null, now) : null;
}
