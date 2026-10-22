export const SAVED_BATCH_SIZE = 100;
export const SAVED_BODY_BYTES = 32768;
export const validSavedId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
export function parseSavedIds(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ids = (value as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.length > SAVED_BATCH_SIZE || !ids.every(validSavedId)) return null;
  return [...new Set(ids)];
}
