import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Job } from "./jobs";

/**
 * R0-8 (research pipeline redesign, phase 0 follow-up): the research input carries a company's postings in full only
 * while they are few. A large board (coupang 256 postings made a 2.2 MB prompt, and the same list went into the review
 * prompt) is shown as a representative sample with a summary of all postings. The sample is what the run saw, so it is
 * also the frozen posting context (jobs-context.json) the candidate is validated and reviewed against.
 *
 * Runs before R0-8 have no sample record and replay exactly as before.
 */
export const POSTING_SAMPLE = { maxPostings: 24, maxChars: 120_000, descriptionChars: 4_000, fullDescriptionChars: 12_000 } as const;
/** Facets whose answer is about postings (lib/question-assessment.ts job-specific sufficiency). */
export const POSTING_SCOPED_FACETS: readonly string[] = ["conditions.pay", "conditions.workplace", "work.responsibility", "process.stages", "process.preparation", "direction.hiring"];
export const ABSENCE_OUTCOMES: readonly string[] = ["not_found_in_scope", "verified_absence"];
const SAMPLE_FILE = "jobs-sample.json";

export type PostingSample = { total: number; shown: string[] };
export type PostingSummary = { total: number; shown: number; byRole: Record<string, number>; byLocation: Record<string, number>; withSalary: number; newestUpdatedAt: string | null };
type PromptRow = { jobId: string; title: string; role: string; location: string; locationLabel: string; sourceUrl: string; salary: unknown; experience: unknown; updatedAt: string | null; fetchedAt: string; description: string };

export const promptRow = (job: Job, descriptionChars: number = POSTING_SAMPLE.fullDescriptionChars): PromptRow => ({ jobId: job.id, title: job.title, role: job.role, location: job.location,
  locationLabel: job.locationLabel, sourceUrl: job.sourceUrl, salary: job.salary, experience: job.experience, updatedAt: job.updatedAt, fetchedAt: job.fetchedAt, description: job.description.slice(0, descriptionChars) });

const counts = (values: string[]) => Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
const newestFirst = (a: Job, b: Job) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.fetchedAt.localeCompare(a.fetchedAt) || a.id.localeCompare(b.id);

/**
 * The postings a research run is shown. All of them, with descriptions cut at 12,000 characters, while that fits
 * `maxPostings` and `maxChars` (JSON characters); otherwise a deterministic sample: roles by size, then one posting per role in turn,
 * newest first, descriptions cut at 4,000 characters, stopping at either limit. `sampled` is false when all are shown.
 */
export function postingInput(jobs: readonly Job[]) {
  const full = jobs.map(job => promptRow(job));
  if (jobs.length <= POSTING_SAMPLE.maxPostings && JSON.stringify(full).length <= POSTING_SAMPLE.maxChars)
    return { sampled: false as const, jobs: [...jobs], rows: full, summary: null };
  const groups = new Map<string, Job[]>();
  for (const job of [...jobs].sort(newestFirst)) groups.set(job.role, [...(groups.get(job.role) ?? []), job]);
  const queues = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([, list]) => [...list]);
  const shown: Job[] = [], rows: PromptRow[] = [];
  let chars = 2;
  while (shown.length < POSTING_SAMPLE.maxPostings && queues.some(queue => queue.length)) {
    for (const queue of queues) {
      const job = queue.shift();
      if (!job || shown.length >= POSTING_SAMPLE.maxPostings) continue;
      const row = promptRow(job, POSTING_SAMPLE.descriptionChars), size = JSON.stringify(row).length + 1;
      if (chars + size > POSTING_SAMPLE.maxChars) { queue.length = 0; continue; }
      shown.push(job); rows.push(row); chars += size;
    }
  }
  const summary: PostingSummary = { total: jobs.length, shown: shown.length, byRole: counts(jobs.map(job => job.role)), byLocation: counts(jobs.map(job => job.location)),
    withSalary: jobs.filter(job => job.salary !== null && job.salary !== undefined).length, newestUpdatedAt: [...jobs].sort(newestFirst)[0]?.updatedAt ?? null };
  return { sampled: true as const, jobs: shown, rows, summary };
}

/**
 * Since 2026-10-14 a shown posting may be cited without opening it. The research model can only search (no shell), so
 * "open the official source" left every posting facet inaccessible although the collected text was in front of it
 * (10-14 greeting-teamsparta). The automatic review checks such a citation against the archived body
 * (lib/verified-sources.ts, docs/research-auto-publication.md '수집한 회사 공고').
 */
export const COLLECTED_POSTINGS_LABEL = "collected by the service from the company's own careers site or applicant tracking system and archived; each description is that posting page's text, so a shown posting is not inaccessible: cite it without opening, url = its exact sourceUrl, kind official, access page, excerpt copied verbatim from its description; preserve exact jobId; fetchedAt is not a posting/reference date";

/** The prompt block for the postings a run is shown. Unsampled runs keep their layout (label, then every row). */
export function postingPrompt(input: ReturnType<typeof postingInput>) {
  const data = `\nCOLLECTED_POSTINGS_DATA (${COLLECTED_POSTINGS_LABEL}): ${JSON.stringify(input.rows)}`;
  if (!input.sampled) return data;
  const { total, shown } = input.summary;
  const extent = shown < total
    ? `only ${shown} are shown below, chosen across roles, newest first; the other ${total - shown} exist but are not shown`
    : `all ${shown} are shown below, but each description is cut to ${POSTING_SAMPLE.descriptionChars} characters`;
  return `\nCOLLECTED_POSTINGS_SUMMARY (this company has ${total} collected postings; ${extent}): ${JSON.stringify(input.summary)}` +
    `\nPOSTING_SAMPLE_RULE: cite only jobIds shown below. For the posting-scoped facets (${POSTING_SCOPED_FACETS.join(", ")}), never mark not_found_in_scope or verified_absence about the company's postings in general from this sample: an absence verdict must name one shown posting in scope.jobId. Hidden postings and cut descriptions are not evidence of absence.` + data;
}

export const samplePath = (dir: string) => join(dir, SAMPLE_FILE);
export const sampleRecord = (input: ReturnType<typeof postingInput>) => input.sampled
  ? { version: 1, rule: "roles by size, one per role in turn, newest first", limits: POSTING_SAMPLE, total: input.summary.total, shown: input.jobs.map(job => job.id), summary: input.summary }
  : null;

/** The sample a run was shown, or undefined for a run that saw every posting (and every run before R0-8). */
export async function loadPostingSample(dir: string): Promise<PostingSample | undefined> {
  let raw: string;
  try { raw = await readFile(samplePath(dir), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  const value: unknown = JSON.parse(raw);
  const record = value as { version?: unknown; total?: unknown; shown?: unknown };
  if (!value || typeof value !== "object" || record.version !== 1 || !Number.isInteger(record.total) || !Array.isArray(record.shown) || !record.shown.every(id => typeof id === "string") ||
      (record.shown as string[]).length > Number(record.total)) throw new Error("POSTING_SAMPLE_INVALID");
  return { total: Number(record.total), shown: record.shown as string[] };
}

/**
 * Why a facet cannot stand on a sampled posting context; null when it can. A run has a sample record whenever its
 * postings were not shown whole: fewer postings, or all of them with descriptions cut. Runs that saw every posting in
 * full (and every run before R0-8) have none.
 */
export function sampledFacetProblem(facet: { facetId: unknown; evidenceOutcome: unknown; scope: { jobId: unknown } }, sample?: PostingSample): string | null {
  if (!sample) return null;
  if (typeof facet.scope.jobId === "string" && !sample.shown.includes(facet.scope.jobId)) return "a posting the run was not shown";
  if (POSTING_SCOPED_FACETS.includes(String(facet.facetId)) && ABSENCE_OUTCOMES.includes(String(facet.evidenceOutcome)) && !facet.scope.jobId)
    return sample.shown.length < sample.total ? `absence for all postings while only ${sample.shown.length} of ${sample.total} were shown` : `absence for all postings while their descriptions were cut`;
  return null;
}
