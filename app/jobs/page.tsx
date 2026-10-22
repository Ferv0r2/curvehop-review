import { shareMetadata } from "@/lib/share-metadata";
import { searchRobots, unfilteredSearchPage } from "@/lib/search-indexing";
import { connection } from "next/server";
import { boardArrivals, listJobs } from "@/lib/repository";
import { parseFilters, type SearchParams } from "@/lib/jobs";
import { JobsView } from "@/components/jobs-view";
import { readRenderResearch } from "@/lib/render-data";
import { companyBasics } from "@/lib/company-basics";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return { title: "채용 공고", ...shareMetadata("채용 공고", "서울·판교의 공식 채용 공고를 회사 이야기와 함께 살펴보세요.", "/jobs"), robots: searchRobots(unfilteredSearchPage(await searchParams)) };
}
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const params = await searchParams;
  const [data, research, arrivals] = await Promise.all([
    listJobs(params),
    readRenderResearch(),
    boardArrivals().catch(() => null),
  ]);
  const basics = Object.fromEntries(
    research.status === "ok" ? research.pack.companies.map((company) => [company.id, companyBasics(company)]) : [],
  );
  return (
    <JobsView
      data={data}
      filters={data.filters}
      mode="ssr"
      basics={basics}
      arrivals={arrivals}
      requestedRole={parseFilters(params).role}
      renderedAt={new Date().toISOString()}
    />
  );
}
