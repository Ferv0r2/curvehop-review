import picks from "../data/card-summaries.json";

/** FNV-1a: ties a sentence pick to the exact answer it was made from. */
export function answerHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Sentences end at "요." / "다." (decimals such as "16.0%" and "Inc." stay inside). */
export function answerSentences(answer: string): string[] {
  return answer.split(/(?<=[요다]\.)\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The card shows whole sentences of the answer, verbatim, picked for the
 * question: no paraphrase, so no attribution, source or qualifier can drift.
 * Without a pick (short answers) or with a stale one, the whole answer shows.
 */
export function cardSummary(id: string, answer: string): string | null {
  const entry = (picks as Record<string, { sentences: number[]; answerHash: string }>)[id];
  if (!entry || entry.answerHash !== answerHash(answer)) return null;
  const all = answerSentences(answer);
  if (entry.sentences.some((i) => !all[i])) return null;
  return entry.sentences.map((i) => all[i]).join(" ");
}
