import { createHash, randomUUID } from "node:crypto";
import { isInScope } from "./eligibility";
import type { Observation } from "./collection";
import type { Job } from "./jobs";

/*
 * Immutable record of one collection run. Events (seen/changed/gone) are
 * derived from these later, so a derivation bug can be fixed and re-run;
 * a missed observation cannot.
 *
 *   manifest (one per run)            content (one per distinct hash)
 *   ├ runId, observedAt, codeSha       { id, title, description,
 *   ├ configuredSources[]                locationLabel, workplaceType,
 *   └ sources[] ── jobs[] ──hash──▶      experience, salary, links }
 *        status ok|empty|error           (sourceUrl lives on the manifest job:
 *                                         it follows our config, not the employer)
 */
export const NORMALIZATION_VERSION = 1;

export type ArchivedJob = {
  id: string;
  sourceUrl: string;
  contentHash: string;
  inScope: boolean;
  updatedAt: string | null;
};
export type ArchivedSource = {
  key: string;
  status: Observation["status"];
  error?: string;
  jobs: ArchivedJob[];
};
export type Manifest = {
  version: 1;
  runId: string;
  observedAt: string;
  codeSha: string;
  /** A number for live runs; "backfill:<code>" for imported snapshots. */
  normalizationVersion: number | `backfill:${string}`;
  configuredSources: string[];
  sources: ArchivedSource[];
  backfill?: true;
};
export type ArchivedContent = {
  id: string;
  title: string;
  description: string;
  locationLabel: string;
  workplaceType: string | null;
  experience: string | null;
  salary: string | null;
  links: { text: string; url: string }[];
};

// Whitespace, Unicode form, bullet line-wrapping, paragraph spacing and
// markdown heading markers come from our HTML-to-text step, not from a change
// the employer made.
const tidy = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/([•▪◦●])\n+/g, "$1 ")
    .replace(/^#{1,6} +/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

/** Fields a reader sees. fetchedAt/updatedAt are excluded so re-fetches are not changes. */
export function archivedContent(job: Job): ArchivedContent {
  return {
    id: job.id,
    title: tidy(job.title),
    description: tidy(job.description),
    locationLabel: tidy(job.locationLabel),
    workplaceType: job.workplaceType ?? null,
    experience: job.experience === null ? null : tidy(job.experience),
    salary: job.salary === null ? null : tidy(job.salary),
    links: (job.links ?? []).map((link) => ({
      text: tidy(link.text),
      url: link.url,
    })),
  };
}

export const contentHash = (content: ArchivedContent) =>
  createHash("sha256").update(JSON.stringify(content)).digest("hex");

export const newRunId = (observedAt: string) =>
  `${observedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;

/**
 * Build the run record. Content is kept only for jobs in Seoul/Pangyo scope
 * at observation time; out-of-scope jobs keep id, hash and scope only.
 */
export function buildManifest(input: {
  runId: string;
  observedAt: string;
  codeSha: string;
  configuredSources: string[];
  observations: Observation[];
}): { manifest: Manifest; contents: Map<string, ArchivedContent> } {
  const contents = new Map<string, ArchivedContent>();
  const sources = input.observations.map((observation) => ({
    key: observation.key,
    status: observation.status,
    ...(observation.error ? { error: observation.error } : {}),
    jobs: observation.jobs.map((job) => {
      const content = archivedContent(job);
      const hash = contentHash(content);
      const inScope = isInScope(job);
      if (inScope) contents.set(hash, content);
      return {
        id: job.id,
        sourceUrl: job.sourceUrl,
        contentHash: hash,
        inScope,
        updatedAt: job.updatedAt,
      };
    }),
  }));
  return {
    manifest: {
      version: 1,
      runId: input.runId,
      observedAt: input.observedAt,
      codeSha: input.codeSha,
      normalizationVersion: NORMALIZATION_VERSION,
      configuredSources: [...input.configuredSources].sort(),
      sources,
    },
    contents,
  };
}
