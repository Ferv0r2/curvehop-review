import { open } from "node:fs/promises";
import { join } from "node:path";
// The JSON `lib/dart-registry.ts` imports, read directly: that module throws at import on a registry
// mismatch, and a registry problem must hide relations, not break the company page.
import dartSnapshot from "../data/dart-identities.json";
import { PENSION_IDENTITIES, pensionRosterReview } from "./pension-registry";
import type { Issue, ResearchPack } from "./research";
import { RESEARCH_MAX_BYTES } from "./research-store";
import {
  assembleRelations, emptyRelationsFile, identityRelations, parseRelationsFile, resolveRelations, validateRelations,
  type IdentityRelations, type RelationsFile, type RelationsPack,
} from "./relations";

export { visibleRelationsForCompany, type CompanyRelations } from "./relations";

/**
 * Read path for `data/company-relations.json`. The site, the wiki and the
 * builder read the same bytes the same way: size limit, JSON, version and
 * top-level shape decide whether the file is usable at all; everything else is
 * a per-company issue from `validateRelations`. Nothing here throws on a bad
 * file, and identity relations never come from the file.
 */
export type RelationsFileRead =
  | { status: "ok"; file: RelationsFile; text: string }
  | { status: "missing" }
  | { status: "unavailable" | "invalid"; code: string; issues: Issue[] };
export type RelationsRead = {
  status: "ok" | "invalid";
  pack: RelationsPack;
  issuesByCompany: Record<string, Issue[]>;
  /** Corrections the validator rejected (indexes into `pack.corrections`): they hide and retract nothing. */
  invalidCorrections: number[];
  /** Why the file could not be used (empty when ok). */
  fileIssues: Issue[];
};
export type WikiRelationsRead =
  | { status: "ok"; file: RelationsFile; missing?: true }
  | { status: "unavailable" | "invalid"; file?: undefined; issues: Issue[] };

export const RELATIONS_FILE = "data/company-relations.json";

export async function readRelationsFile(path: string): Promise<RelationsFileRead> {
  const failure = (status: "unavailable" | "invalid", code: string, message: string): RelationsFileRead => ({ status, code, issues: [{ path: "$", message }] });
  let raw: string;
  try {
    const file = await open(path, "r");
    try {
      if (!(await file.stat()).isFile()) return failure("unavailable", "FILE_READ", "일반 파일이 아닙니다.");
      const buffer = Buffer.alloc(RESEARCH_MAX_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await file.read(buffer, size, buffer.length - size, null);
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      if (size > RESEARCH_MAX_BYTES) return failure("invalid", "FILE_TOO_LARGE", `관계 파일은 최대 ${RESEARCH_MAX_BYTES / 1024 / 1024}MB입니다.`);
      raw = buffer.subarray(0, size).toString("utf8");
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return failure("unavailable", "FILE_READ", "관계 파일을 읽지 못했습니다. 경로와 권한을 확인하세요.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure("invalid", "JSON_PARSE", "관계 파일의 JSON 구문이 잘못됐습니다.");
  }
  const parsed = parseRelationsFile(value);
  if (!parsed.file) return { status: "invalid", code: "SCHEMA_INVALID", issues: parsed.issues };
  return { status: "ok", file: parsed.file, text: raw };
}

/** Identity relations from the committed registries (`lib/pension-registry.ts`, `lib/dart-registry.ts` inputs). */
export function registryIdentityRelations(research: ResearchPack): IdentityRelations {
  return identityRelations(pensionRosterReview, PENSION_IDENTITIES, dartSnapshot, research);
}

/** Identity (from the registries) ∪ file, validated against `research`: what the wiki compiles from a `readWikiRelations` file. */
export function resolveRegistryRelations(file: RelationsFile | null, research: ResearchPack, now = new Date()) {
  return resolveRelations(file, registryIdentityRelations(research), research, now);
}

/**
 * Relations for the site. Missing file: identity only, ok. A file-level
 * failure: `invalid` (the identity pack is still returned for internal use;
 * the UI hides every relation block). Otherwise issues group by owner.
 */
export async function readRelations(
  research: ResearchPack,
  path = join(process.cwd(), "data", "company-relations.json"),
  now = new Date(),
): Promise<RelationsRead> {
  const identity = registryIdentityRelations(research);
  const fallback = (fileIssues: Issue[]): RelationsRead => {
    const pack = assembleRelations(null, identity), { issuesByCompany, invalidCorrections } = validateRelations(pack, research, now);
    return { status: "invalid", pack, issuesByCompany, invalidCorrections, fileIssues };
  };
  let read: RelationsFileRead;
  try { read = await readRelationsFile(path); }
  catch { return fallback([{ path: "$", message: "관계 파일을 읽지 못했습니다." }]); }
  if (read.status === "invalid" || read.status === "unavailable") return fallback(read.issues);
  const { pack, fileIssues, issuesByCompany, invalidCorrections } = resolveRelations(read.status === "ok" ? read.file : null, identity, research, now);
  if (fileIssues.length) return fallback(fileIssues);
  return { status: "ok", pack, issuesByCompany, invalidCorrections, fileIssues: [] };
}

/**
 * The relations input every wiki compile site passes beside its in-memory
 * research (brief §8). File-level checks only; `compileWiki` validates against
 * the research it compiles. Missing file = an empty file (identity relations
 * still derive). Never throws.
 */
export async function readWikiRelations(root: string): Promise<WikiRelationsRead> {
  try {
    const read = await readRelationsFile(join(root, RELATIONS_FILE));
    if (read.status === "ok") return { status: "ok", file: read.file };
    if (read.status === "missing") return { status: "ok", file: emptyRelationsFile(), missing: true };
    return { status: read.status, issues: read.issues };
  } catch {
    return { status: "unavailable", issues: [{ path: "$", message: "관계 파일을 읽지 못했습니다." }] };
  }
}
