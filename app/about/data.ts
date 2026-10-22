import { companies } from "@/lib/companies";
import { companyListing, listedJobs } from "@/lib/company-listing";
import { codeSources, discoveredCompanies, discoveredEntries, sourceKey } from "@/lib/sources";
import { publishedRelations } from "@/lib/published-data";
import { buildProductGraph, layoutProductGraph, type GraphLayout } from "@/lib/product-graph";
import { graphCompanies, productStats, type ProductStats } from "@/lib/product-intro";
import type { ServiceResearchRead } from "@/lib/service-research";
import type { Snapshot } from "@/lib/store";
import { companySubsidiaries } from "@/components/company-relations";

/**
 * The service's real numbers and graph for /about (DESIGN.md 제품 소개). Every
 * number, the explorer graph, the floating chips and the numbers band count
 * only the companies that pass the browse floor (`companyListing`,
 * lib/company-listing.ts) and their postings (`listedJobs`), like the other
 * browse pages. When the research cannot be read nothing is listed: postings,
 * research and sources read 미확인.
 *
 * These derivations do not depend on the clock, so they are cached per
 * (research, snapshot) object, i.e. once per data revision. Relative dates are
 * rendered per request by RelDate as everywhere else. The hero and preview
 * mockups are the fictional example of lib/about-mockup.ts, not data.
 */
export type About = { stats: ProductStats; layout: GraphLayout };

const cache = new WeakMap<object, WeakMap<object, About>>();
const noSnapshot = {};

function derive(research: ServiceResearchRead, snapshot: Snapshot | null): About {
  const byResearch = cache.get(research) ?? cache.set(research, new WeakMap()).get(research)!;
  const hit = byResearch.get(snapshot ?? noSnapshot);
  if (hit) return hit;
  const ok = research.status === "ok" ? research : null;
  const eligible = ok ? companyListing(ok.pack).eligibleIds : new Set<string>();
  const visibleResearch = ok?.pack.companies.filter((company) => eligible.has(company.id)) ?? null;
  const visibleSnapshot = ok && snapshot ? { ...snapshot, jobs: listedJobs(snapshot.jobs, eligible) } : null;
  // Career sources counted are the listed companies' own; with nothing listable the count is unknown, not 0.
  const listedKeys = new Set(companies.filter((company) => eligible.has(company.id)).flatMap((company) => company.sourceKeys));
  const reviewedSources = ok ? codeSources.filter((source) => listedKeys.has(sourceKey(source))).length : null;
  const discoveredSources = ok ? discoveredEntries.filter((entry) => listedKeys.has(sourceKey(entry))).length : null;
  const relations = ok ? publishedRelations(ok) : null;
  // The subsidiary rows each company page shows, with the same visibility rules.
  const shown = new Map(ok?.rawPack.companies.map((raw) => [raw.id, companySubsidiaries(raw, relations)]) ?? []);
  const graph = graphCompanies({
    companies: companies.filter((company) => eligible.has(company.id)), snapshot: visibleSnapshot, research: visibleResearch, discovered: discoveredEntries, companyEntries: discoveredCompanies,
    subsidiaries: (id) => shown.get(id)?.filings.flatMap((filing) => filing.rows.map((row) => ({ name: row.name, filing: filing.title }))) ?? [],
  });
  const result = {
    stats: productStats({ graph, reviewedSources, discoveredSources, research: visibleResearch, snapshot: visibleSnapshot }),
    layout: layoutProductGraph(buildProductGraph(graph)),
  };
  byResearch.set(snapshot ?? noSnapshot, result);
  return result;
}

const unread: ServiceResearchRead = { status: "error", code: "ABOUT_DERIVE_FAILED", issues: [] };

/** A failure while deriving degrades to 미확인, never an error page: first without the postings, then without the research as well. */
export function aboutData(research: ServiceResearchRead, snapshot: Snapshot | null): About {
  try { return derive(research, snapshot); }
  catch {
    try { return derive(research, null); }
    catch { return derive(unread, null); }
  }
}
