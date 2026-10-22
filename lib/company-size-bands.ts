/**
 * Company size bands for browsing, by the latest same-workplace National
 * Pension subscriber count. Kept free of imports so client code (job filters,
 * the preference panel) can share the ids and labels.
 */
export const SIZE_BANDS = [
  { id: "under-50", label: "50명 미만", min: 0, max: 49 },
  { id: "50-299", label: "50–299명", min: 50, max: 299 },
  { id: "300-999", label: "300–999명", min: 300, max: 999 },
  { id: "1000-plus", label: "1,000명 이상", min: 1000, max: Infinity },
] as const;
export type SizeBand = (typeof SIZE_BANDS)[number]["id"];
/** `unknown` selects companies without a usable count; it is a list choice, never a saved preference. */
export type SizeFilter = SizeBand | "unknown";
export const UNKNOWN_SIZE_LABEL = "규모 자료 없음";

const ORDER: readonly SizeFilter[] = [...SIZE_BANDS.map(band => band.id), "unknown"];

export const isSizeBand = (value: unknown): value is SizeBand => SIZE_BANDS.some(band => band.id === value);

/** Known ids only, once each, in band order. */
export function parseSizes(value: unknown, { allowUnknown = true } = {}): SizeFilter[] {
  const values = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");
  return ORDER.filter(id => values.includes(id) && (allowUnknown || id !== "unknown"));
}

export function bandFor(value: number): SizeBand {
  return SIZE_BANDS.find(band => value >= band.min && value <= band.max)!.id;
}

export function sizeLabel(id: SizeFilter) {
  return id === "unknown" ? UNKNOWN_SIZE_LABEL : SIZE_BANDS.find(band => band.id === id)!.label;
}

/** "50–299명", "50명 미만·1,000명 이상" — every selected band, never a summary count. */
export const sizesLabel = (sizes: readonly SizeFilter[]) => sizes.map(sizeLabel).join("·");
