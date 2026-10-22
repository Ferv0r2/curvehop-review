import { shareMetadata } from "@/lib/share-metadata";
import { searchRobots } from "@/lib/search-indexing";
import { readPreferences } from "@/lib/preference-store";
import { withPreferredRole, withPreferredSize } from "@/lib/preferences";
import { parseFilters } from "@/lib/repository";
import type { SearchParams } from "@/lib/jobs";
import { CsrJobs } from "@/components/csr-jobs";

export const metadata = { title: "채용 공고", ...shareMetadata("채용 공고", undefined, "/jobs"), robots: searchRobots(false) };
export default async function CsrPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const preferences = await readPreferences();
  return <CsrJobs filters={parseFilters(withPreferredSize(withPreferredRole(await searchParams, preferences), preferences))} />;
}
