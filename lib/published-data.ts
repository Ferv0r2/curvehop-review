import { stat } from "node:fs/promises";
import { join } from "node:path";
import { readSnapshot, snapshotPath, type Snapshot } from "./store";
import { resolveRegistryRelations, type RelationsRead } from "./relations-store";
import type { ServiceResearchRead } from "./service-research";
import { readServiceResearch } from "./service-research";
import { researchPath } from "./research-store";
import { fileRevision, revisionCache } from "./revision-cache";
import { freezeData } from "./immutable-data";
import type { Job } from "./jobs";
import { isVacancy } from "./eligibility";
import { readingItems } from "./reading";

// Public data only. Workers keep using strict, uncached readers. A deployment
// creates new module instances; file revisions invalidate warm local instances.
export const readPublishedSnapshotState = revisionCache(
  () => fileRevision([snapshotPath()]),
  async () => {
    const available = await stat(snapshotPath()).then(() => true).catch(error => { if (error.code === "ENOENT") return false; throw error; });
    return freezeData({ snapshot: await readSnapshot(), available });
  },
);
export async function readPublishedSnapshot() { return (await readPublishedSnapshotState()).snapshot; }
export const readPublishedResearch = revisionCache(
  () => fileRevision([researchPath(), join(process.cwd(), "data/company-relations.json")], new Date().toISOString().slice(0, 10)),
  async () => freezeData(await readServiceResearch(undefined, { factTime: "lenient" })),
  result => result.status === "ok" && result.relationsInput.status === "ok",
);
// Preserve raw entries for joinCompanyJobs validation; analysis is memoized by
// immutable job identity only after that consumer's validity/eligibility checks.
export const readPublishedCatalog = readPublishedSnapshot;
// Proxy and RSC may have separate instances; each builds its own public index
// once per revision. Warm checks do stat calls, not full-file reads/analysis.
const jobIndexes = new WeakMap<Snapshot, Map<string, Job[]>>();
export async function publishedJobExists(id: string) {
  const snapshot = await readPublishedSnapshot();
  let index = jobIndexes.get(snapshot);
  if (!index) {
    index = new Map();
    for (const job of snapshot.jobs) {
      if (!job || typeof job.id !== "string") continue;
      const rows = index.get(job.id) ?? [];
      rows.push(job);
      index.set(job.id, rows);
    }
    jobIndexes.set(snapshot, index);
  }
  // Validate eligibility only for this ID, just like the original .some path.
  // A malformed unrelated row must not poison every valid detail and 404.
  return index.get(id)?.some(isVacancy) ?? false;
}
const readingIndexes = new WeakMap<object, Set<string>>();
export async function publishedReadingState(id: string): Promise<"exists" | "missing" | "unavailable"> {
  const research = await readPublishedResearch();
  if (research.status !== "ok") return "unavailable";
  let ids = readingIndexes.get(research);
  if (!ids) { ids = new Set(readingItems(research.pack).map(reading => reading.id)); readingIndexes.set(research, ids); }
  return ids.has(id) ? "exists" : "missing";
}

const relationViews = new WeakMap<object, RelationsRead>();
export function publishedRelations(research: Extract<ServiceResearchRead, { status: "ok" }>): RelationsRead {
  let view = relationViews.get(research);
  if (!view) {
    const input = research.relationsInput;
    const resolved = resolveRegistryRelations(input.status === "ok" ? input.file : null, research.rawPack);
    view = { ...resolved, status: input.status === "ok" && !resolved.fileIssues.length ? "ok" : "invalid",
      fileIssues: input.status === "ok" ? resolved.fileIssues : input.issues };
    freezeData(view);
    relationViews.set(research, view);
  }
  return view;
}
