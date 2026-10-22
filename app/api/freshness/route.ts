import { readPublishedResearch, readPublishedSnapshotState } from "@/lib/published-data";
import { companyListing, listedJobs } from "@/lib/company-listing";
import { isVacancy } from "@/lib/eligibility";
import { dataFreshness } from "@/lib/data-freshness";

// Production data age for the alert outside the mini PC (.github/workflows/freshness.yml).
// Reads the bundled data like /api/jobs, so it works on Vercel and Cloudflare alike
// (not data/release.json, which only the Cloudflare bundle has). No auth: aggregates only.
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const unavailable = (error: string) => Response.json({ error }, { status: 503, headers });

export async function GET() {
  const now = new Date();
  let state: Awaited<ReturnType<typeof readPublishedSnapshotState>>;
  try {
    state = await readPublishedSnapshotState();
  } catch {
    return unavailable("snapshot-unreadable");
  }
  if (!state.available) return unavailable("snapshot-missing");
  const research = await readPublishedResearch().catch(() => null);
  // The listing filter needs research; without it the site cannot list jobs either.
  if (research?.status !== "ok") return unavailable("research-unavailable");
  let report: ReturnType<typeof dataFreshness>;
  try {
    // readSnapshot checks only the top-level arrays; a malformed entry must still answer 503.
    const listed = listedJobs(state.snapshot.jobs, companyListing(research.pack).eligibleIds).filter(isVacancy);
    report = dataFreshness(state.snapshot.sources, listed, now);
  } catch {
    return unavailable("snapshot-unreadable");
  }
  if (!report) return unavailable("no-successful-collection");
  return Response.json(report, { headers });
}
