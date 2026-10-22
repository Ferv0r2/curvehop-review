/** Presentation only. Stored claims, caveats, evidence and receipt hashes remain untouched.
 * Translate only known diagnostic phrases; never drop a sentence or its qualification. */
const translations = [
  ['sufficient로 판정하지 않았어요', '충분히 확인하지 못했어요'],
  ['scope는', '확인한 범위는'],
  ['열람 금지 대상인', '본문을 확인하지 못한'],
] as const;

export function publicResearchCaveat(text: string): string {
  return translations.reduce((result, [before, after]) => result.replaceAll(before, after), text);
}

export const PUBLIC_RESEARCH_COPY_V1 = `PUBLIC_RESEARCH_COPY_V1:
All published prose, including live facet limitation, is for job seekers. Describe the missing date, employer, role, team or evidence directly in Korean, not your assessment decision. Do not write enum/field diagnostics such as "sufficient로 판정", "scope는", or collection-policy labels such as "열람 금지 대상". Preserve material uncertainty and attribution. A source whose body was not read cannot support a claim. In stored assessment only, limitation remains internal and publicCaveat is public. Do not fill gaps or remove qualifications to pass this check.
`;

const internalCopy = /\b(?:sufficient|insufficient|not_assessed)(?:로|으로|라고|\s*(?:판정|평가))|\bscope(?:는|은|가|를|\s*[:=])|열람\s*금지\s*대상/;

/** New output only, before review. Never called by candidate/receipt replay. */
export function assertPublicResearchCopy(input: unknown): void {
  if (!input || typeof input !== 'object') return; // Structural validation owns malformed output.
  const draft = input as { storedMaterial?: unknown; answers?: unknown; questionContract?: { questions?: unknown } };
  const check = (value: unknown, path: string) => {
    if (typeof value === 'string' && internalCopy.test(value)) throw Error(`PUBLIC_RESEARCH_COPY: ${path}`);
  };
  if (!draft.storedMaterial && Array.isArray(draft.answers)) draft.answers.forEach((answer, i) => {
    if (!answer || typeof answer !== 'object') return;
    // Unavailable topics are internal gap records and do not publish an article.
    if (answer.state === 'unavailable') return;
    for (const field of ['fact', 'analysis', 'limitation']) check(answer[field], `answers[${i}].${field}`);
    for (const field of ['title', 'preview', 'analysisTitle']) check(answer.editorial?.[field], `answers[${i}].editorial.${field}`);
  });
  const questions = draft.questionContract?.questions;
  if (Array.isArray(questions)) questions.forEach((q, i) => {
    if (!Array.isArray(q?.facets)) return;
    q.facets.forEach((f: Record<string, unknown>, j: number) => {
      if (!f || !['partial', 'sufficient'].includes(String(f.status))) return;
      const path = `questions[${i}].facets[${j}]`;
      check(f.claim, `${path}.claim`);
      check(f.publicCaveat ?? (draft.storedMaterial ? '' : f.limitation), `${path}.caveat`);
    });
  });
}
