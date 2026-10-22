import { roleLabels, type Role, type SearchParams } from "./jobs";
import { parseSizes, type SizeBand } from "./company-size-bands";

export const preferenceCookie = "nextstep-preferences-v1";
/** `sizes` are company size bands to browse; empty means every size. Older cookies have none. */
export type Preferences = { role: Role | ""; years: number | null; sizes: SizeBand[] };
export const emptyPreferences: Preferences = { role: "", years: null, sizes: [] };
export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...emptyPreferences, sizes: [] };
  const { role, years, sizes } = value as Record<string, unknown>;
  return {
    role: typeof role === "string" && Object.hasOwn(roleLabels, role) ? role as Role : "",
    years: typeof years === "number" && Number.isInteger(years) && years >= 0 && years <= 30 ? years : null,
    sizes: Array.isArray(sizes) ? parseSizes(sizes, { allowUnknown: false }) as SizeBand[] : [],
  };
}
export function decodePreferences(raw?: string): Preferences {
  try { return parsePreferences(JSON.parse(raw ?? "null")); }
  catch { return { ...emptyPreferences, sizes: [] }; }
}
export function experienceLabel(years: number) {
  return years === 0 ? "신입" : years === 30 ? "경력 30년 이상" : `경력 ${years}년`;
}
// Explicit page filters win, including an empty role (view all).
export function withPreferredRole(params: SearchParams, preferences: Preferences): SearchParams {
  return params.role === undefined ? { ...params, role: preferences.role } : params;
}
// Like role: an explicit `size` in the URL wins, and `size=` alone means every size.
export function withPreferredSize(params: SearchParams, preferences: Preferences): SearchParams {
  return params.size === undefined ? { ...params, size: preferences.sizes } : params;
}
// After editing the browsing preference, discard only the old role, size and page.
// Keep the search, reading trail, topic and fragment; never redirect off-site.
export function preferenceReturn(value: unknown): string {
  return cleanPreferenceReturn(value, 0);
}
function cleanPreferenceReturn(value: unknown, depth: number): string {
  if (typeof value !== "string" || value.length > 4000 || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/discover";
  const url = new URL(value, "https://nextstep.local");
  if (url.origin !== "https://nextstep.local" || !/^\/(?:discover|companies(?:\/[a-z0-9-]+)?|read\/[a-z0-9-]+|jobs(?:\/[a-zA-Z0-9_-]+)?|csr)$/.test(url.pathname)) return "/discover";
  url.searchParams.delete("role");
  url.searchParams.delete("size");
  url.searchParams.delete("page");
  for (const key of ["from", "origin", "readFrom", "readOrigin"]) {
    const nested = url.searchParams.get(key);
    if (nested) {
      if (depth >= 1) url.searchParams.delete(key);
      else url.searchParams.set(key, cleanPreferenceReturn(nested, depth + 1));
    }
  }
  return url.pathname + url.search + url.hash;
}
