import { answerHash } from "./card-summary";
import type { CompanyResearch } from "./research";

type Guide = NonNullable<CompanyResearch["guides"]>[number];

// Legacy publications predate editorial titles/previews. Keep their research and
// publication receipts intact. These presentation edits expire when ANY part of
// the guide changes, so a later investigation cannot inherit an outdated promise.
// A title-only edit keeps the record's own preview. Titles name what the guide's
// answer and sources say (company statements stay attributed), never a new claim.
const legacyEditorial: Record<string, { guideHash: string; title: string; preview?: string }> = {};

export function readingEditorial(guide: Guide): { title: string; preview?: string } | undefined {
  const entry = legacyEditorial[guide.id];
  if (!entry || entry.guideHash !== answerHash(JSON.stringify(withoutContentChange(guide)))) return undefined;
  return { title: entry.title, preview: entry.preview };
}

/** Preserve the exact old hash input for every pre-extension guide. No other field is ignored. */
export function withoutContentChange<T>(guide: T): T {
  if (!guide || typeof guide !== 'object' || Array.isArray(guide) || !Object.hasOwn(guide, 'contentChange')) return guide;
  const result = { ...guide } as T & {contentChange?: unknown};
  delete result.contentChange;
  return result;
}
