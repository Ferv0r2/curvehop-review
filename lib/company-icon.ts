/** Small canonical raster only; safe to import in browser-facing schema modules. */
export const COMPANY_ICON_MAX_BYTES = 16 * 1024;
export type CompanyIcon = {
  version: 1;
  mime: "image/png";
  base64: string;
  sha256: string;
  width: number;
  height: number;
  sourceUrl: string;
  homepageUrl: string;
  discoveryReceiptHash: string;
};
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function iconUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.port && !url.hash ? url : null;
  } catch { return null; }
}
/** WordPress image CDN: the declared URL must bind the exact official host. */
export function wordpressIcon(url: URL, home: URL): boolean {
  if (home.protocol !== "https:" || url.origin !== "https://i0.wp.com" || url.hash
    || !url.pathname.startsWith(`/${home.hostname}/wp-content/uploads/`) || !url.pathname.endsWith(".png")) return false;
  if (/%(?:2f|5c|2e|25)/i.test(url.pathname) || url.pathname.includes("\\")) return false;
  const keys = [...url.searchParams.keys()];
  const fit = url.searchParams.get("fit")?.match(/^(\d{1,3}),(\d{1,3})$/);
  return keys.length === 2 && new Set(keys).size === 2 && keys.every(key => ["fit", "ssl"].includes(key))
    && url.searchParams.get("ssl") === "1" && !!fit && fit.slice(1).every(n => Number(n) >= 16 && Number(n) <= 256);
}

/** Shape only. Collector, publication replay and image responses also verify bytes. */
export function validCompanyIcon(value: unknown): value is CompanyIcon {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const icon = value as CompanyIcon, source = iconUrl(icon.sourceUrl), home = iconUrl(icon.homepageUrl);
  return Object.keys(icon).sort().join(",") === "base64,discoveryReceiptHash,height,homepageUrl,mime,sha256,sourceUrl,version,width"
    && icon.version === 1 && icon.mime === "image/png" && hash(icon.sha256) && hash(icon.discoveryReceiptHash)
    && [icon.width, icon.height].every(n => Number.isInteger(n) && n >= 16 && n <= 256)
    && typeof icon.base64 === "string" && icon.base64.length > 0 && icon.base64.length <= Math.ceil(COMPANY_ICON_MAX_BYTES / 3) * 4
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(icon.base64)
    && icon.base64.length * 3 / 4 - (icon.base64.endsWith("==") ? 2 : icon.base64.endsWith("=") ? 1 : 0) <= COMPANY_ICON_MAX_BYTES
    && !!source && !!home && (source.hostname === home.hostname || wordpressIcon(source, home));
}
