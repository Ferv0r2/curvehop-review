import { open } from "node:fs/promises";
import { join } from "node:path";
import { validateResearch, type ResearchPack, type Issue } from "./research";
export type ResearchRead =
  /** `timeIssues`: lenient reads only, the fact `time` paths dropped to show the rest. */
  | { status: "ok"; pack: ResearchPack; timeIssues?: string[] }
  | { status: "missing" | "invalid" | "error"; code: string; issues: Issue[] };
/**
 * `strict` (default): any issue fails the read. `lenient` is for the site's
 * routes only: when every issue is a fact `time` path, those times are dropped
 * and the rest is shown. Worker, CLI, relation builder, wiki compile and the
 * data gate stay strict.
 */
export type ResearchReadOptions = { factTime?: "strict" | "lenient"; validationTime?: Date };
export const researchPath = () =>
  join(process.cwd(), "data", "company-research.json");
/**
 * Largest research pack the site reads and the pipeline writes. Monthly pension
 * history and DART filings grow the pack every week (about 1MB on 2026-10-06).
 */
export const RESEARCH_MAX_BYTES = 4 * 1024 * 1024;
const FACT_TIME_PATH = /^companies\[(\d+)\]\.facts\[(\d+)\]\.time(?:[.[]|$)/;
/**
 * The pack without the fact times that fail, repeated while dropping one breaks another (a `supersedes` target), at most 3 times.
 * Shallow copies only: a dropped time is never traversed, however deep it is.
 */
function withoutInvalidTimes(value: unknown, issues: Issue[], now: Date): { pack: ResearchPack; timeIssues: string[] } | null {
  type Raw = { companies: { facts: Record<string, unknown>[] }[] };
  if (!issues.every(issue => FACT_TIME_PATH.test(issue.path))) return null;
  const copy: Raw = { ...(value as Raw), companies: (value as Raw).companies.slice() }, dropped = new Set<string>();
  let found = issues;
  for (let round = 0; round < 3; round++) {
    if (!found.every(issue => FACT_TIME_PATH.test(issue.path))) return null;
    for (const issue of found) {
      const [, c, f] = FACT_TIME_PATH.exec(issue.path)!;
      const company = (copy.companies[Number(c)] = { ...copy.companies[Number(c)], facts: copy.companies[Number(c)].facts.slice() });
      const { time: _dropped, ...fact } = company.facts[Number(f)];
      company.facts[Number(f)] = fact;
      dropped.add(issue.path);
    }
    found = validateResearch(copy, now);
    if (!found.length) return { pack: copy as unknown as ResearchPack, timeIssues: [...dropped] };
  }
  return null;
}
export async function readResearch(
  path = researchPath(),
  options: ResearchReadOptions = {},
): Promise<ResearchRead> {
  const failure = (
    status: "missing" | "invalid" | "error",
    code: string,
    message: string,
  ): ResearchRead => ({ status, code, issues: [{ path: "$", message }] });
  let raw: string;
  try {
    const file = await open(path, "r");
    try {
      if (!(await file.stat()).isFile())
        return failure("error", "FILE_READ", "일반 파일을 지정하세요.");
      const buffer = Buffer.alloc(RESEARCH_MAX_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await file.read(
          buffer,
          size,
          buffer.length - size,
          null,
        );
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      if (size > RESEARCH_MAX_BYTES)
        return failure(
          "invalid",
          "FILE_TOO_LARGE",
          "자료는 최대 1MB입니다. 근거 전문 대신 짧은 발췌와 링크를 보관하세요.",
        );
      raw = buffer.subarray(0, size).toString("utf8");
    } finally {
      await file.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT")
      return failure(
        "missing",
        "FILE_MISSING",
        "파일이 없습니다. --file 경로를 확인하거나 자료 백업을 복원하세요.",
      );
    if (code === "EACCES" || code === "EPERM")
      return failure(
        "error",
        "FILE_PERMISSION",
        "파일을 읽을 권한이 없습니다. 실행 사용자와 읽기 권한을 확인하세요.",
      );
    return failure(
      "error",
      "FILE_READ",
      "파일을 읽지 못했습니다. 경로와 파일 상태를 확인하세요.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure(
      "invalid",
      "JSON_PARSE",
      "JSON 구문이 잘못됐습니다. 쉼표·따옴표·괄호를 확인하세요.",
    );
  }
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version !== 1
  ) {
    const version =
      typeof value.version === "number" ? String(value.version) : "잘못된 값";
    return failure(
      "invalid",
      "UNSUPPORTED_VERSION",
      `지원 버전은 1, 입력은 ${version}입니다. 호환 코드나 문서화된 마이그레이션을 사용하세요. 버전 숫자만 바꾸지 마세요.`,
    );
  }
  const now = options.validationTime ?? new Date();
  if (!Number.isFinite(now.getTime())) return failure("invalid", "VALIDATION_TIME_INVALID", "검사 기준 시각이 유효하지 않습니다.");
  const issues = validateResearch(value, now);
  if (issues.length) {
    const lenient = options.factTime === "lenient" ? withoutInvalidTimes(value, issues, now) : null;
    if (lenient) return { status: "ok", ...lenient };
    return { status: "invalid", code: "SCHEMA_INVALID", issues };
  }
  return { status: "ok", pack: value as ResearchPack };
}
