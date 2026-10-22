import { parseNewDay } from "./new-arrivals";
import { parseSizes } from "./company-size-bands";

/**
 * The company list a company page returns to: `/companies` with only its own
 * search, registration-day and size keys. The address is rebuilt from the
 * validated values, so nothing unchecked (another path, a fragment, a nested
 * `from`) survives; anything else falls back to the plain list.
 */
export function companyListReturn(value: unknown): string {
  const fallback = "/companies";
  if (typeof value !== "string" || value.length > 1000 || !value.startsWith("/companies") || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, "https://nextstep.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://nextstep.invalid" || url.pathname !== "/companies" || url.hash) return fallback;
  const params = url.searchParams;
  if (![...params.keys()].every((key) => key === "q" || key === "new" || key === "size")) return fallback;
  const [q, ...moreQ] = params.getAll("q");
  const [day, ...moreDays] = params.getAll("new");
  if (moreQ.length || moreDays.length || (q !== undefined && q.length > 100)) return fallback;
  const sizeValues = params.getAll("size");
  const sizes = parseSizes(sizeValues);
  // `size=` alone clears a saved size; otherwise every value must be a known band, once.
  const clearsSize = sizeValues.length === 1 && sizeValues[0] === "";
  if (sizeValues.length && !clearsSize && (sizes.length !== sizeValues.length)) return fallback;
  if (day !== undefined && day !== "" && parseNewDay(day) !== day) return fallback;
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (day) query.set("new", day);
  if (clearsSize) query.set("size", "");
  for (const size of sizes) query.append("size", size);
  return query.size ? `${fallback}?${query}` : fallback;
}
