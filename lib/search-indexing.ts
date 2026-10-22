import type { Metadata } from "next";

/** Public release only. Preview and local development remain out of search. */
export function searchIsPublic(env: { NODE_ENV?: string; VERCEL_ENV?: string } = process.env): boolean {
  return false; // Synthetic hiring-review edition must never be indexed.
}
export function searchRobots(eligible = true): Metadata["robots"] {
  return { index: searchIsPublic() && eligible, follow: searchIsPublic() };
}
/** Filter/search result variants have no independent search landing page. */
export function unfilteredSearchPage(params: Record<string, string | string[] | undefined>): boolean {
  return !["q", "role", "location", "size", "new", "page", "topic"].some(key => {
    const value = params[key];
    return (Array.isArray(value) ? value : [value]).some(item => !!item?.trim());
  });
}
