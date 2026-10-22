import type { JobInsights } from "./job-insights";

export type Tenure = { min: number | null; max: number | null };

/** "3년 이상 또는 이에 준하는 실력": the years are one way to qualify, not a floor. */
export const allowsEquivalent = (text: string) =>
  !sharedDegreeTenure(text) && /이에\s*준하는|그에\s*준하는|동등한?\s*(?:수준의?\s*)?(?:실력|역량|경험)|or\s+equivalent|equivalent\s+(?:experience|skills?|practical)/i.test(text);

/**
 * The stated duration of an experience condition. Ranges keep both ends;
 * "N년 이하/미만" is an upper bound only. A board's open-ended upper bound
 * ("3~30년") reads as "3년 이상".
 */
export function tenureRange(text: string): Tenure | null {
  const range = text.match(/(\d{1,2})\s*(?:년\s*)?[~\-–]\s*(\d{1,2})\s*(?:년|years?)/i);
  if (range) {
    const [min, max] = [Number(range[1]), Number(range[2])];
    return max >= 20 ? { min, max: null } : { min, max };
  }
  const ko = text.match(/(\d{1,2})\s*년\s*(?:차\s*)?(이상|이하|미만)?/);
  if (ko) return ko[2] === "이하" || ko[2] === "미만" ? { min: null, max: Number(ko[1]) } : { min: Number(ko[1]), max: null };
  const en = text.match(/(\d{1,2})\s*\+?\s*years?/i);
  if (en) return { min: Number(en[1]), max: null };
  return null;
}

const degree = /학사|석사|박사|학위|\b(?:bachelor[’']?s?|master[’']?s?|doctorate|doctoral|ph\.?d\.?)\b/i;
const degreeName = /학위|\bdegree\b|\b(?:doctorate|ph\.?d\.?)\b/i;
const career = /경력|경험|연구원|\bexperience\b/i;
const alternativeConnector = /또는|혹은|\bor\b/i;
type DegreeAlternative = { floor: number | null; stated: number | null };

/** The tenure after "degree or equivalent, and …" applies to both routes. */
function sharedDegreeTenure(text: string): Tenure | null {
  if (!degree.test(text)) return null;
  const shared = text.match(/(?:또는|혹은|\bor\b)[^\n]*?(?:이에\s*준하는|그에\s*준하는|equivalent)[^\n]*?(?:함께\s*[,，]?|,\s*and\b|\band\b)(.+)$/i);
  return shared && career.test(shared[1]) ? tenureRange(shared[1]) : null;
}

/**
 * Keep degree/tenure paths intact instead of turning one path into a minimum.
 * Only complete qualification paths count: "Bachelor's or Master's degree and
 * 2 years" and "degree and Python or Java experience" are not two paths.
 * Unquantified experience in a degree path stays unknown, never zero years.
 */
export function degreeAlternative(text: string): DegreeAlternative | null {
  if (!degree.test(text) || !alternativeConnector.test(text)) return null;
  if (sharedDegreeTenure(text)) return null;
  // A separately coordinated requirement applies after either qualification
  // route. Split once, then find the shared suffix without reparsing prefixes.
  // At most two non-recursive path parses are needed, regardless of length.
  const independent = /[,，;]\s*(?:그리고|and)\s+/gi;
  const boundaries = [...text.matchAll(independent)];
  const clauses = text.split(independent);
  let suffix = clauses.length;
  while (suffix > 1 && !degree.test(clauses[suffix - 1]) && !alternativeConnector.test(clauses[suffix - 1])) suffix--;
  if (suffix < clauses.length) {
    const alternative = degreeAlternativePaths(text.slice(0, boundaries[suffix - 1].index));
    if (alternative) {
      let floor = alternative.floor;
      for (const clause of clauses.slice(suffix)) {
        // A preference following a required qualification is still optional.
        if (/\b(?:preferably|preferred|ideally)\b|우대/i.test(clause)) continue;
        const minimum = career.test(clause) ? tenureRange(clause)?.min : null;
        if (minimum != null) floor = Math.max(floor ?? 0, minimum);
      }
      return { floor, stated: floor == null ? alternative.stated : Math.max(floor, alternative.stated ?? 0) };
    }
  }
  return degreeAlternativePaths(text);
}

/** Qualification alternatives only; shared trailing requirements are handled above. */
function degreeAlternativePaths(text: string): DegreeAlternative | null {
  const parts = text.split(/\s*(?:또는|혹은|\bor\b)\s*/i);
  if (parts.length < 2) return null;
  // "degree or higher" describes an academic level, not an experience path.
  if (parts.some((part) => /^(?:higher|above|그\s*이상)(?:\s|$)/i.test(part))) return null;
  const paths = parts.map((part) => ({
    text: part,
    degree: degree.test(part),
    tenure: career.test(part) ? tenureRange(part.replace(/\d+\s*년제/g, "")) : null,
  })).filter((part) => part.degree || part.tenure);
  if (paths.length < 2 || !paths.some((p) => p.tenure)) return null;
  // Only explicit shared wording joins degree levels to one tenure. "With"
  // attaches tenure to its own degree path; an explicitly experience-free
  // degree path must remain available regardless of the order of the paths.
  const last = paths.at(-1)!;
  if (paths.every((p) => p.degree) && last.tenure &&
      paths.slice(0, -1).every((p) => !p.tenure && !/경력\s*무관|\bno\s+experience\b/i.test(p.text)) &&
      /소지자로|보유자로|\band\b/i.test(last.text) && !/\bwith\b/i.test(last.text)) return null;
  // Bare degree names before another degree qualify that degree's level, not
  // an alternative to its following experience requirement.
  if (paths.some((p) => p.degree && !p.tenure && !degreeName.test(p.text))) return null;
  // A sole degree plus an unfinished conjunction names a shared prerequisite
  // ("degree and Python or Java experience"), not a degree-only option.
  if (paths.filter((p) => p.degree).length === 1) {
    const academic = paths.find((p) => p.degree)!;
    const afterDegree = academic.text.slice((academic.text.match(degreeName)?.index ?? 0));
    if (!academic.tenure && /[,，;]|\b(?:and|with)\b|및|그리고|와\s|과\s/i.test(afterDegree)) return null;
    // "degree in X or Y and 3 years" coordinates the fields, then requires
    // experience independently; it does not offer a degree-only route.
    if (!academic.tenure && /\bdegree\s+in\b/i.test(academic.text) && paths.some((p) =>
      !p.degree && p.tenure && /\band\b/i.test(p.text.split(/\d/)[0]))) return null;
  }
  const floors = paths.map((p) => p.tenure?.min ?? null);
  const stated = floors.filter((n): n is number => n !== null);
  return {
    floor: floors.every((n) => n !== null) ? Math.min(...floors as number[]) : null,
    stated: stated.length ? Math.max(...stated) : null,
  };
}

/** "신입 또는 3년 이상", "신입/경력 3년 이상": new graduates qualify as well. */
export const opensToNewcomers = (text: string) => /신입\s*(?:또는|혹은|or|\/)/i.test(text);

/** The least experience a condition accepts: 0 when it also takes new graduates. */
export function conditionFloor(text: string): number | null {
  const alternative = degreeAlternative(text);
  if (alternative) return alternative.floor;
  const tenure = tenureRange(text);
  if (!tenure) return null;
  return opensToNewcomers(text) ? 0 : tenure.min;
}

export function tenurePhrase(text: string): string | null {
  const t = tenureRange(text);
  if (!t) return null;
  if (t.min !== null && t.max !== null) return `${t.min}~${t.max}년`;
  if (t.min !== null) return `${t.min}년 이상`;
  return `${t.max}년 ${/미만/.test(text) ? "미만" : "이하"}`;
}

/** Particles and connectives a real subject never starts with. */
const STOP = /^(?:의|이상|이하|및|과|와|을|를|이|가|은|는|등|또는|혹은|그리고|이나|총|최소|최대|약|해당)(?:\s|$)/;

/** A Korean noun phrase that starts on a word boundary and isn't a fragment. */
function koreanSubject(text: string, match: RegExpExecArray | null, group: number): string | null {
  if (!match) return null;
  const raw = match[group];
  const at = match.index + match[0].indexOf(raw);
  const subject = raw.replace(/^(?:최소|총|약)\s+/, "").trim();
  const startsClean = at === 0 || /[\s,(·/]/.test(text[at - 1]);
  // A lone leading syllable is the tail of the previous clause ("2-10년 간 로펌…").
  if (!startsClean || STOP.test(subject) || /^[A-Za-z]/.test(subject) || /^[가-힣]\s/.test(subject)) return null;
  // Bounds, degrees and possessives inside mean the match spans two clauses.
  if (/이상|이하|이내|미만|학사|석사|학위|준하는|^및|^(?:경력|경험)의|^\S+의\s/.test(subject)) return null;
  // What remains besides generic words must name a field, not a bare verb ("종사한 경력").
  const core = subject.replace(/(?:관련|유관|실무|업무|총|전체|해당)\s*/g, "").replace(/\s*(?:경력|경험)$/, "").trim();
  if ((core.match(/[가-힣]/g) ?? []).length < 2 || /^[가-힣]+(?:한|된|던|는|은)$/.test(core)) return null;
  return subject;
}

/**
 * "정보보호 및 컴플라이언스 관련 경력 10년 이상": what the duration is of,
 * only when a clean Korean noun phrase states it. English conditions and any
 * fragment fall back to "경력 N년 이상" rather than a garbled subject.
 */
export function conditionClause(text: string): string | null {
  if (degreeAlternative(text)) return text.replace(/^[•·\-*\s]+/, "").trim();
  const phrase = tenurePhrase(text);
  if (!phrase) return null;
  const subject = (
    koreanSubject(text, /\d{1,2}\s*년\s*(?:차\s*)?(?:이상|이하|미만)?\s*(?:의|이상의)?\s+([가-힣][^,.;()]{1,30}?(?:경력|경험))/.exec(text), 1) ??
    koreanSubject(text, /([가-힣][가-힣A-Za-z/·&\s]{1,24}?(?:경력|경험))\s*\d{1,2}\s*년/.exec(text), 1)
  )?.replace(/^신입\s*(?:또는|혹은|or|\/)\s*/i, ""); // "신입/경력": the newcomer part leads the clause instead
  const clause = subject && !/^(?:경력|경험)$/.test(subject) ? `${subject} ${phrase}` : `경력 ${phrase}`;
  const newcomers = opensToNewcomers(text) ? "신입 또는 " : "";
  const or = allowsEquivalent(text) ? " 또는 동등 실력" : "";
  return newcomers + (clause.length <= 36 ? clause : `경력 ${phrase}`) + or;
}

type Condition = JobInsights["experience"][number];

/**
 * One line of the stated experience: the strictest required condition with
 * its subject, plus how many more there are. Conditions are never merged
 * into one number; the tagged digest lines carry the rest. A tenure stated in
 * the title leads when no body condition states a floor as high, and always
 * over preferred ones: it is the posting's own minimum, not a preference.
 */
export function experienceBrief(insights: Pick<JobInsights, "experience">): string {
  const dated = (pick: (e: Condition) => boolean) =>
    insights.experience
      .filter(pick)
      .map((e) => ({ clause: conditionClause(e.text), floor: conditionFloor(e.text), stated: degreeAlternative(e.text)?.stated ?? conditionFloor(e.text) }))
      .filter((c): c is { clause: string; floor: number | null; stated: number | null } => !!c.clause)
      .sort((a, b) => (b.floor ?? -1) - (a.floor ?? -1));
  const title = dated((e) => !!e.fromTitle)[0];
  for (const [kind, label] of [["required", "필수"], ["preferred", "우대"], ["unspecified", "공고 표기"]] as const) {
    const list = dated((e) => e.kind === kind && !e.fromTitle);
    if (!list.length) continue;
    if (title && (kind === "preferred" || (title.floor ?? -1) > Math.max(...list.map((c) => c.stated ?? -1))))
      return `공고 표기 · ${title.clause}${kind === "preferred" ? "" : ` 외 ${list.length}개`}`;
    return `${label} · ${list[0].clause}${list.length > 1 ? ` 외 ${list.length - 1}개` : ""}`;
  }
  return title ? `공고 표기 · ${title.clause}` : "경력 기간 미확인";
}

/** The lowest experience a posting states as required (its strictest lower bound). */
export function requiredFloor(insights: Pick<JobInsights, "experience">): { floor: number | null; upperOnly: boolean; equivalent: boolean; degreeAlternative?: true } {
  const dated = (pick: (e: Condition) => boolean) =>
    insights.experience.filter(pick).map((e) => ({ tenure: tenureRange(e.text), floor: conditionFloor(e.text), equivalent: allowsEquivalent(e.text), degree: degreeAlternative(e.text) })).filter((c): c is { tenure: Tenure; floor: number | null; equivalent: boolean; degree: ReturnType<typeof degreeAlternative> } => !!c.tenure);
  const required = dated((e) => e.kind === "required");
  const body = required.length ? required : dated((e) => e.kind === "unspecified" && !e.fromTitle);
  // As in the brief, the title's tenure counts only when it is higher than every body floor.
  const title = dated((e) => !!e.fromTitle).filter((c) => (c.floor ?? -1) > Math.max(-1, ...body.map((b) => (b.degree?.stated ?? b.floor) ?? -1)));
  const all = [...body, ...title];
  // Conditions that also accept equivalent skill set no hard floor.
  const strict = all.filter((c) => !c.equivalent);
  const mins = strict.map((c) => c.floor).filter((n): n is number => n !== null);
  return {
    floor: mins.length ? Math.max(...mins) : null,
    upperOnly: !mins.length && strict.some((c) => !c.degree && c.tenure.max !== null),
    equivalent: !mins.length && all.some((c) => c.equivalent),
    ...(!mins.length && all.some((c) => c.degree) ? { degreeAlternative: true as const } : {}),
  };
}
