import type { MetadataRoute } from "next";
import { readPublishedResearch, readPublishedSnapshotState } from "@/lib/published-data";
import { searchPaths } from "@/lib/search-sitemap";
import { searchIsPublic } from "@/lib/search-indexing";
import { siteUrl } from "@/lib/share-metadata";

// Re-read published revisions, without cookies or a separately maintained URL list.
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!searchIsPublic()) return [];
  const [research, state] = await Promise.all([readPublishedResearch(), readPublishedSnapshotState()]);
  if (research.status !== "ok" || !state.available) throw new Error("Published search data unavailable");
  // No fabricated lastModified: request/check time is not a content update time.
  return searchPaths(research.pack, state.snapshot.jobs).map(path => ({ url: `${siteUrl}${path}` }));
}
