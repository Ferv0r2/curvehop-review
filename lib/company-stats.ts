import { allowsEquivalent, conditionFloor } from "./experience-brief";
import { answerSentences } from "./card-summary";
import { ABOUT_RESEARCH_BROAD } from "./research-process-sentences";
import { projectJob, roleLabels, type Job, type Role } from "./jobs";
import type { CompanyResearch } from "./research";

export type RoleCount = { role: Role; label: string; count: number };

/**
 * A company's openings by role, most first (ties keep the first role seen).
 * Accepts stored or projected jobs; roles always come from projectJob so every
 * view counts with the same taxonomy.
 */
export function roleCounts(jobs: Job[]): RoleCount[] {
  const counts = new Map<Role, number>();
  for (const job of jobs) {
    const role = (job.insights ? job : projectJob(job)).role;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts]
    .map(([role, count]) => ({ role, label: roleLabels[role], count }))
    .sort((a, b) => b.count - a.count);
}

export const topRoles = (jobs: Job[], n = 3): RoleCount[] => roleCounts(jobs).slice(0, n);

export type RequiredYears = {
  /** Median of the postings' required minimum years; null when none states one. */
  median: number | null;
  /** Postings whose required conditions state a hard minimum (the median's basis). */
  counted: number;
  total: number;
};

/**
 * A posting's strictest stated minimum among its *required* conditions only.
 * Board metadata or a title ("공고 표기"), preferred conditions and "N년 이상
 * 또는 동등 실력" set no requirement here, so they are left out, not guessed.
 */
function requiredMinimum(job: Job): number | null {
  const insights = (job.insights ? job : projectJob(job)).insights!;
  const mins = insights.experience
    .filter((e) => e.kind === "required" && !allowsEquivalent(e.text))
    .map((e) => conditionFloor(e.text))
    .filter((n): n is number => n != null);
  return mins.length ? Math.max(...mins) : null;
}

/**
 * The middle required minimum across a company's postings. Callers show
 * `counted` beside the median so a figure from 3 of 70 postings does not read
 * as typical, and say so when no posting states one.
 */
export function medianRequiredYears(jobs: Job[]): RequiredYears {
  const floors = jobs
    .map(requiredMinimum)
    .filter((floor): floor is number => floor !== null)
    .sort((a, b) => a - b);
  const mid = floors.length >> 1;
  const median = !floors.length ? null : floors.length % 2 ? floors[mid] : (floors[mid - 1] + floors[mid]) / 2;
  return { median, counted: floors.length, total: jobs.length };
}

/*
 * One sentence that says what the company does, quoted verbatim from the
 * research data (never paraphrased). Sentences about our own research process
 * ("…살펴봐요", "…확인했어요") are skipped (ABOUT_RESEARCH_BROAD,
 * lib/research-process-sentences.ts); with no such sentence the row shows none
 * rather than a made-up line.
 */
const firstSentence = (text: string | undefined) => (text ? answerSentences(text)[0] : undefined);
export function businessLine(
  company: Pick<CompanyResearch, "id" | "summary" | "facts"> | undefined,
  /** The company's overview reading answer, the last fallback. */
  overviewAnswer?: string,
): string | null {
  if (!company) return null;
  const fact = (suffix: string) => company.facts.find((f) => f.id === `${company.id}-${suffix}`)?.text;
  const candidates = [firstSentence(company.summary), firstSentence(fact("pipeline-business-fact")), fact("business"), firstSentence(overviewAnswer)];
  return candidates.find((s): s is string => !!s && s.length >= 12 && !ABOUT_RESEARCH_BROAD.test(s)) ?? null;
}
