import { roleLabels } from "./jobs";
import { parseSizes, type SizeBand } from "./company-size-bands";

export const navigationMemoryKey = "nextstep-navigation-v1";
export const historyEntryKey = "nextstepEntry";
export type PagePosition = {
  id: string;
  url: string;
  route: string;
  x: number;
  y: number;
  details: Record<string, boolean>;
  /** Horizontal offsets of in-page rows ([data-scroll-row]), by row key. */
  rows?: Record<string, number>;
  savedAt: number;
};
export type NavigationMemory = {
  entries: PagePosition[];
  returning?: { route: string; id: string; expires: number };
};

// Reading provenance does not change the article. Actual search filters do.
// Missing role means the browser preference, while role= explicitly means all.
export function navigationRoute(href: string, preferredRole = "", preferredSizes: readonly SizeBand[] = []): string {
  const url = new URL(href, "https://nextstep.invalid");
  for (const name of ["from", "origin", "readFrom", "readOrigin"]) url.searchParams.delete(name);
  if (/^\/(jobs|csr|companies\/[a-z0-9-]+)$/.test(url.pathname)) {
    const role = url.searchParams.get("role") ?? preferredRole;
    url.searchParams.set("role", Object.hasOwn(roleLabels, role) ? role : "");
  }
  // List links make size explicit, while a direct visit inherits preferences.
  // Treat equivalent filters as the same position without mixing a cleared
  // filter with the saved size preference.
  if (["/jobs", "/csr", "/companies"].includes(url.pathname)) {
    const sizes = parseSizes(url.searchParams.has("size") ? url.searchParams.getAll("size") : preferredSizes);
    url.searchParams.delete("size");
    for (const size of sizes) url.searchParams.append("size", size);
  }
  if (url.searchParams.get("page") === "1") url.searchParams.delete("page");
  url.searchParams.sort();
  return url.pathname + url.search;
}

export function parseNavigationMemory(raw: string | null): NavigationMemory {
  try {
    const data = JSON.parse(raw ?? "null");
    if (!data || !Array.isArray(data.entries)) return { entries: [] };
    const entries = data.entries.filter((e: PagePosition) =>
      e && typeof e.id === "string" && typeof e.url === "string" &&
      typeof e.route === "string" && Number.isFinite(e.savedAt) &&
      Number.isFinite(e.x) && Number.isFinite(e.y) && e.x >= 0 && e.y >= 0 &&
      e.x < 5e6 && e.y < 5e6 && e.details && typeof e.details === "object" &&
      !Array.isArray(e.details) && Object.keys(e.details).length <= 100 &&
      Object.values(e.details).every(value => typeof value === "boolean") &&
      (e.rows === undefined || (typeof e.rows === "object" && e.rows !== null && !Array.isArray(e.rows) &&
        Object.keys(e.rows).length <= 50 &&
        Object.values(e.rows).every(value => Number.isFinite(value) && value >= 0 && value < 5e6)))
    ).slice(-40);
    const r = data.returning;
    return { entries, ...(r && typeof r.route === "string" && typeof r.id === "string" && Number.isFinite(r.expires) ? { returning: r } : {}) };
  } catch { return { entries: [] }; }
}
