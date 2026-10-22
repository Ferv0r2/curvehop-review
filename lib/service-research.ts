import { dirname, resolve } from "node:path";
import { readResearch, researchPath, type ResearchRead, type ResearchReadOptions } from "./research-store";
import { readWikiRelations, type WikiRelationsRead } from "./relations-store";
import { resolveCurrentKnowledge } from "./current-knowledge";
import { readingKnowledgeReady } from "./reading-journey";
import type { ResearchPack } from "./research";

export type ServiceResearchRead =
  | (Extract<ResearchRead, { status: "ok" }> & {
      rawPack: ResearchPack;
      readingConnectionsReady: boolean;
      relationsInput: WikiRelationsRead;
      suppressedGuideIds: string[];
      pendingGuideIds: string[];
    })
  | Exclude<ResearchRead, { status: "ok" }>;

/**
 * Site-only projection. Keep raw references for relation validation and temporal links.
 * `validationTime` (unset for the site: the wall clock) also dates correction checks, so a
 * caller with a fixed clock (scripts/content-metrics.ts --now) sees one consistent view.
 */
export async function readServiceResearch(
  path = researchPath(),
  options: ResearchReadOptions = {},
): Promise<ServiceResearchRead> {
  const read = await readResearch(path, options);
  if (read.status !== "ok") return read;
  const relationsInput = await readWikiRelations(dirname(dirname(resolve(path))));
  const readingConnectionsReady = readingKnowledgeReady(read.pack, relationsInput, options.validationTime);
  const current = resolveCurrentKnowledge(read.pack, relationsInput, options.validationTime);
  return { ...read, pack: current.pack, rawPack: read.pack, relationsInput, readingConnectionsReady,
    suppressedGuideIds: current.suppressedGuideIds, pendingGuideIds: current.pendingGuideIds };
}
