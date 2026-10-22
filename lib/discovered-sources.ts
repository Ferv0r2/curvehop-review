/*
 * data/discovered-sources.json: job sources the mini PC discovered and proved
 * (phase 3, user approval 2026-10-08 "증명되면 자동 등록"). The file only ever
 * grows by proven additions (lib/data-gate.ts discoveredSourcesDecision); code
 * sources (lib/sources.ts, data/greeting-sources.json) win on any overlap.
 *
 *   { version: 1, sources: DiscoveredSource[], retired?: RetiredSource[] }   both sorted by id, canonical bytes
 *
 * `retired` (Codex on 9a58fb4) holds every source a person took out of `sources`, by a code PR only:
 * a discovered entry removed for being wrong, or moved into the code sources. It is append-only, the
 * worker never edits it, and discovery never registers that board, that id or that company again.
 * Omitted while empty, so a file without it is still version 1.
 *
 * Nothing here touches the network or the file system.
 */
import { isJobPlatformUrl } from "./job-platforms";
import type { Source } from "./sources";

export const COMPANY_REGISTRY_FORMAT = 1;
export const DISCOVERED_SOURCES_FILE = "data/discovered-sources.json";
/** Providers with a collector today (lib/collection.ts). NineHire, Recruiter and own sites are not registered automatically. */
export const DISCOVERED_PROVIDERS = ["greeting", "greenhouse", "lever", "workday"] as const;
export type DiscoveredProvider = (typeof DISCOVERED_PROVIDERS)[number];
export const DISCOVERED_SCOPES = ["it", "telecom", "fintech", "semiconductor"] as const;
/** Additions one data PR may carry (spec §3.2). */
export const MAX_DISCOVERED_ADDITIONS = 40;
/** The colour every discovered company gets until someone picks one (the Greeting sources' default). */
export const DISCOVERED_COLOR = "#e8edf5";

export type DiscoveredSource = {
  id: string;
  provider: DiscoveredProvider;
  board: string;
  /** Greeting: https://<host>/; Workday: https://<tenant>.wdN.myworkdayjobs.com/<site>. Absent for Greenhouse and Lever. */
  careerUrl?: string;
  /** Greeting only. */
  greetingWorkspaceId?: number;
  name: string;
  /** The canonical legal name DART (corp_name) or FSC (corpNm) gave: never a seed-row alias. */
  legalName: string;
  /** All ten digits of the business number DART or FSC gave: the company's identity (one company, one source). */
  businessNumber: string;
  businessPrefix: string;
  homepage: string;
  scope: (typeof DISCOVERED_SCOPES)[number];
  receipt: { runId: string; hash: string };
  addedOn: string;
};
/** A source taken out of `sources` by a person (code PR): what it was, and why. */
export type DiscoveredCompany = Omit<DiscoveredSource, "id" | "provider" | "board" | "careerUrl" | "greetingWorkspaceId" | "scope"> & { id: `company-${string}`; scope: DiscoveredSource["scope"] | "requested" };
export type DiscoveredRegistration = DiscoveredSource | DiscoveredCompany;
export type RetiredSource = {
  /** Omitted retains the legacy company-wide retirement. */
  scope?: "board" | "company";
  id: string;
  provider: DiscoveredProvider;
  board: string;
  careerUrl?: string;
  greetingWorkspaceId?: number;
  businessNumber: string;
  retiredOn: string;
  reason: string;
};
export type DiscoveredFile = { version: 1; sources: DiscoveredSource[]; companies?: DiscoveredCompany[]; retired?: RetiredSource[] };

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BOARD = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const RUN_ID = /^\d{8}T\d{6}Z$/;
const HASH = /^[a-f0-9]{64}$/;
const KEYS = ["id", "provider", "board", "careerUrl", "greetingWorkspaceId", "name", "legalName", "businessNumber", "businessPrefix", "homepage", "scope", "receipt", "addedOn"];
const COMPANY_KEYS = KEYS.filter(key => !["provider", "board", "careerUrl", "greetingWorkspaceId"].includes(key));
const RETIRED_KEYS = ["scope", "id", "provider", "board", "careerUrl", "greetingWorkspaceId", "businessNumber", "retiredOn", "reason"];
const WORKDAY = /^https:\/\/([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com\/([A-Za-z0-9_]+)$/;

export const emptyDiscoveredFile = (): DiscoveredFile => ({ version: 1, sources: [] });
/**
 * The only bytes the file may have: two-space JSON, each list sorted by id with keys in its order
 * (KEYS, RETIRED_KEYS), `retired` left out while empty, newline.
 */
export function serializeDiscovered(file: DiscoveredFile): string {
  // Ids compared only as text: an untrusted entry's id may be any value.
  const id = (entry: unknown) => (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id : "");
  const ordered = (list: readonly unknown[], keys: readonly string[]) => [...list]
    .sort((a, b) => (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0))
    .map((entry: unknown) => (isRecord(entry) ? Object.fromEntries(keys.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]])) : entry));
  const retired: unknown = file.retired;
  // An untrusted `retired` that is not a list is kept as it is (validation refuses it).
  const kept = Array.isArray(retired) ? (retired.length ? { retired: ordered(retired, RETIRED_KEYS) } : {}) : retired === undefined ? {} : { retired };
  const companies: unknown = file.companies;
  const identities = Array.isArray(companies) ? (companies.length ? { companies: ordered(companies, COMPANY_KEYS) } : {}) : companies === undefined ? {} : { companies };
  return JSON.stringify({ version: 1, sources: ordered(file.sources, KEYS), ...identities, ...kept }, null, 2) + "\n";
}
/** Parsed JSON, or null when the text is not JSON at all. Shape is checked by validateDiscoveredSources. */
export function parseDiscovered(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const plain = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f�]/.test(value);
const isDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // An impossible date ("2026-13-01") parses to NaN; never call toISOString on it (that throws and would stop every worker task).
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const httpsOrigin = (value: unknown, httpAllowed = false) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    // origin === value also rules out userinfo (an origin never carries it) and paths.
    return (url.protocol === "https:" || (httpAllowed && url.protocol === "http:")) && !url.port && url.origin === value && url.hostname.includes(".");
  } catch {
    return false;
  }
};

/**
 * Values from the file are untrusted: never converted to text unchecked (an object whose toString is
 * missing or throws would stop the process). `describe` names a value for a message without converting it.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const describe = (value: unknown) => (typeof value === "string" ? value.slice(0, 60) : value === null ? "null" : Array.isArray(value) ? "배열" : `${typeof value} 값`);
const idOf = (value: unknown) => (isRecord(value) && typeof value.id === "string" ? value.id : null);
/** Plain-object entries of a file's sources (null, arrays and primitives dropped). */
const recordsOf = (file: DiscoveredFile | null) => (file?.sources ?? []).filter((entry): entry is DiscoveredSource => isRecord(entry));

/** A legal name without corporate markers, spaces or punctuation (주식회사 테스트랩 = (주)테스트랩 = 테스트랩). */
export const legalKey = (name: string) =>
  name.normalize("NFKC").toLowerCase().replace(/주식회사|유한책임회사|유한회사|㈜|\(\s*주\s*\)|\(\s*유\s*\)/g, "").replace(/[^a-z0-9가-힣]/g, "");

/**
 * Board identities: two sources that share any of these collect the same postings.
 * Code sources without a provider are Greenhouse (lib/sources.ts sourceKey).
 * A discovered entry also carries its company: one company registers one board
 * (audit P3). The company is its full ten-digit business number from DART/FSC
 * (second audit P2-1); prefix + legal name only if a number were ever missing.
 * The prefix alone is not a company: its six digits are a tax office, an entity
 * type and one serial digit, shared by many unrelated companies.
 */
export function boardIdentities(source: Partial<Pick<Source, "provider" | "board" | "careerUrl" | "greetingWorkspaceId">> & { businessNumber?: string; businessPrefix?: string; legalName?: string }): string[] {
  // Every field is type-checked before it is put in a string (the file is untrusted input).
  const provider = typeof source.provider === "string" ? source.provider : "greenhouse";
  const out = typeof source.board === "string" ? [`key:${provider}:${source.board.toLowerCase()}`] : [];
  if (typeof source.businessNumber === "string" && /^\d{10}$/.test(source.businessNumber)) out.push(`company:${source.businessNumber}`);
  else if (typeof source.businessPrefix === "string" && typeof source.legalName === "string" && legalKey(source.legalName))
    out.push(`company:${source.businessPrefix}:${legalKey(source.legalName)}`);
  let url: URL | null = null;
  try {
    url = typeof source.careerUrl === "string" ? new URL(source.careerUrl) : null;
  } catch {
    url = null;
  }
  if (provider === "greeting") {
    if (url) out.push(`greeting-host:${url.hostname.toLowerCase()}`);
    if (Number.isSafeInteger(source.greetingWorkspaceId)) out.push(`greeting-workspace:${source.greetingWorkspaceId}`);
  }
  if (provider === "workday" && url) {
    const site = url.pathname.split("/").filter((s) => s && !/^[a-z]{2}-[A-Z]{2}$/.test(s))[0] ?? "";
    out.push(`workday-site:${url.hostname.toLowerCase()}/${site.toLowerCase()}`);
  }
  return out;
}

/** The lib/sources.ts Source a discovered entry collects as. */
export function toSource(entry: DiscoveredSource): Source {
  return {
    provider: entry.provider,
    board: entry.board,
    company: entry.name,
    color: DISCOVERED_COLOR,
    ...(entry.careerUrl ? { careerUrl: entry.careerUrl } : {}),
    ...(entry.greetingWorkspaceId !== undefined ? { greetingWorkspaceId: entry.greetingWorkspaceId } : {}),
  };
}

/** Problems of the board fields (id, provider, board, careerUrl, greetingWorkspaceId) a source and a retired record share. */
function boardIssues(entry: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const provider = typeof entry.provider === "string" ? entry.provider : null;
  if (provider === null || !(DISCOVERED_PROVIDERS as readonly string[]).includes(provider)) issues.push(`지원하지 않는 제공자: ${describe(entry.provider)}`);
  if (typeof entry.board !== "string" || !BOARD.test(entry.board)) issues.push("board는 영문 소문자·숫자·하이픈이어야 합니다.");
  if (typeof entry.id !== "string" || !ID.test(entry.id) || provider === null || typeof entry.board !== "string" || entry.id !== `${provider}-${entry.board}`)
    issues.push("id는 `${provider}-${board}`여야 합니다.");
  if (provider === "greeting") {
    if (typeof entry.careerUrl !== "string" || !httpsOrigin(entry.careerUrl.replace(/\/$/, "")) || !entry.careerUrl.endsWith("/"))
      issues.push("그리팅 careerUrl은 https://<호스트>/ 형식이어야 합니다.");
    if (!Number.isSafeInteger(entry.greetingWorkspaceId) || (entry.greetingWorkspaceId as number) <= 0) issues.push("그리팅 greetingWorkspaceId가 필요합니다.");
  } else if (entry.greetingWorkspaceId !== undefined) issues.push("greetingWorkspaceId는 그리팅에만 씁니다.");
  if (provider === "workday") {
    if (typeof entry.careerUrl !== "string" || !WORKDAY.test(entry.careerUrl)) issues.push("Workday careerUrl은 https://<tenant>.wdN.myworkdayjobs.com/<site> 형식이어야 합니다.");
  } else if (provider !== "greeting" && entry.careerUrl !== undefined) issues.push("careerUrl은 그리팅·Workday에만 씁니다.");
  if (typeof entry.businessNumber !== "string" || !/^\d{10}$/.test(entry.businessNumber)) issues.push("businessNumber는 사업자번호 10자리여야 합니다.");
  return issues;
}

/** Problems of one entry on its own (no overlap checks). */
export function entryIssues(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["항목이 객체가 아닙니다."];
  const entry = raw as Record<string, unknown>;
  const issues: string[] = [];
  const unknown = Object.keys(entry).filter((key) => !KEYS.includes(key));
  if (unknown.length) issues.push(`알 수 없는 필드: ${unknown.join(", ")}`);
  issues.push(...boardIssues(entry));
  if (!plain(entry.name, 60)) issues.push("name이 비었거나 형식이 올바르지 않습니다.");
  if (!plain(entry.legalName, 120)) issues.push("legalName이 비었거나 형식이 올바르지 않습니다.");
  if (typeof entry.businessPrefix !== "string" || !/^\d{6}$/.test(entry.businessPrefix) || (typeof entry.businessNumber === "string" && entry.businessNumber.slice(0, 6) !== entry.businessPrefix))
    issues.push("businessPrefix는 사업자번호 앞 6자리여야 합니다.");
  if (!httpsOrigin(entry.homepage, true)) issues.push("homepage는 공식 홈페이지 origin이어야 합니다.");
  if (typeof entry.scope !== "string" || !(DISCOVERED_SCOPES as readonly string[]).includes(entry.scope)) issues.push(`범위가 올바르지 않습니다: ${describe(entry.scope)}`);
  const receipt = entry.receipt as Record<string, unknown> | undefined;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || Object.keys(receipt).sort().join(",") !== "hash,runId" ||
      typeof receipt.runId !== "string" || !RUN_ID.test(receipt.runId) || typeof receipt.hash !== "string" || !HASH.test(receipt.hash))
    issues.push("receipt는 { runId, hash }여야 합니다.");
  if (!isDate(entry.addedOn)) issues.push("addedOn은 YYYY-MM-DD여야 합니다.");
  for (const field of ["homepage", "careerUrl"] as const)
    if (typeof entry[field] === "string" && isJobPlatformUrl(entry[field] as string)) issues.push(`${field}가 채용 플랫폼 도메인입니다.`);
  return issues;
}

/** Company-only entries reuse identity field validation without inventing a collector. */
export function companyEntryIssues(raw: unknown): string[] {
  if (!isRecord(raw)) return ["회사 항목이 객체가 아닙니다."];
  const issues = entryIssues({ ...raw, ...(raw.scope === "requested" ? {scope:"it"} : {}), id: "lever-validation", provider: "lever", board: "validation" })
    .filter(message => !message.startsWith("알 수 없는 필드:"));
  if (Object.keys(raw).some(key => !COMPANY_KEYS.includes(key))) issues.push("회사 항목에 알 수 없는 필드가 있습니다.");
  if (typeof raw.businessNumber !== "string" || !/^\d{10}$/.test(raw.businessNumber) || raw.id !== `company-${raw.businessNumber}`)
    issues.push("회사 id는 company-사업자번호10자리여야 합니다.");
  return issues;
}
export function companyIdForDiscoveredSource(source: DiscoveredSource, entries: readonly DiscoveredCompany[]): string {
  const owners = entries.filter(entry => !companyEntryIssues(entry).length && entry.businessNumber === source.businessNumber);
  return owners.length === 1 ? owners[0].id : source.id;
}
export function usableDiscoveredCompanies(raw: unknown, codeSources: readonly Source[] = [], reservedIds?: ReadonlySet<string>): DiscoveredCompany[] {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.sources) || (raw.companies !== undefined && !Array.isArray(raw.companies))) return [];
  const blocks = retiredBlocks(raw);
  if (blocks.broken) return [];
  const taken = new Set(codeSources.flatMap(boardIdentities));
  const ids = new Set<string>();
  const out: DiscoveredCompany[] = [];
  for (const value of (raw.companies as unknown[] | undefined) ?? []) {
    if (companyEntryIssues(value).length) continue;
    const entry = value as DiscoveredCompany;
    if (ids.has(entry.id) || reservedIds?.has(entry.id) || taken.has(`company:${entry.businessNumber}`) || retiredMatch(entry, blocks)) continue;
    ids.add(entry.id); taken.add(`company:${entry.businessNumber}`); out.push(entry);
  }
  return out;
}
/** A single preparation identity per company; attached boards do not create a second identity. */
export function registeredCompanies(file: DiscoveredFile): DiscoveredRegistration[] {
  const companies = usableDiscoveredCompanies(file);
  const numbers = new Set(companies.map(entry => entry.businessNumber));
  return [...companies, ...usableDiscoveredSources(file, []).filter(entry => !numbers.has(entry.businessNumber))];
}

/** Problems of one retired record on its own. */
export function retiredIssues(raw: unknown): string[] {
  if (!isRecord(raw)) return ["retired 기록이 객체가 아닙니다."];
  const issues: string[] = [];
  const unknown = Object.keys(raw).filter((key) => !RETIRED_KEYS.includes(key));
  if (unknown.length) issues.push(`retired 기록에 알 수 없는 필드: ${unknown.join(", ")}`);
  issues.push(...boardIssues(raw));
  if (raw.scope !== undefined && raw.scope !== "board" && raw.scope !== "company") issues.push("retired scope은 board 또는 company여야 합니다.");
  if (!isDate(raw.retiredOn)) issues.push("retiredOn은 YYYY-MM-DD여야 합니다.");
  if (!plain(raw.reason, 200)) issues.push("reason(뺀 이유)이 비었거나 형식이 올바르지 않습니다.");
  return issues;
}

/**
 * What `retired` blocks: its ids and every board identity of its records, the company (all ten
 * digits of the business number) included. Read from any object record, valid or not: blocking
 * more is the safe side. `broken` when `retired` is present but not a list.
 */
export type RetiredBlocks = { ids: ReadonlySet<string>; identities: ReadonlyMap<string, string>; broken: boolean };
export function retiredBlocks(file: unknown): RetiredBlocks {
  const raw = isRecord(file) ? file.retired : undefined;
  const ids = new Set<string>();
  const identities = new Map<string, string>();
  if (raw !== undefined && !Array.isArray(raw)) return { ids, identities, broken: true };
  for (const record of raw ?? []) {
    if (!isRecord(record)) continue;
    const id = idOf(record);
    if (id !== null) ids.add(id);
    for (const identity of boardIdentities(record as Parameters<typeof boardIdentities>[0])) {
      if (record.scope === "board" && identity.startsWith("company:")) continue;
      identities.set(identity, id ?? "(id 없음)");
    }
  }
  return { ids, identities, broken: false };
}
/** The retired record a source (or candidate) matches by id, board or company, or null. */
export function retiredMatch(entry: Parameters<typeof boardIdentities>[0] & { id?: unknown }, blocks: RetiredBlocks): string | null {
  if (typeof entry.id === "string" && blocks.ids.has(entry.id)) return `retired ${entry.id}(같은 id)`;
  for (const identity of boardIdentities(entry)) {
    const owner = blocks.identities.get(identity);
    if (owner) return `retired ${owner}(${identity.startsWith("company:") ? "같은 회사" : identity})`;
  }
  return null;
}

export type DiscoveredIssue = { id: string | null; message: string };

/**
 * Every problem of a parsed file: shape, order, entries, and overlaps with the
 * code sources, reserved company ids and each other. An empty list means valid.
 */
export function validateDiscoveredSources(
  raw: unknown,
  context: { codeSources: readonly Source[]; reservedIds?: ReadonlySet<string> },
): DiscoveredIssue[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [{ id: null, message: "파일이 객체가 아닙니다." }];
  const file = raw as Record<string, unknown>;
  const issues: DiscoveredIssue[] = [];
  if (file.version !== 1) issues.push({ id: null, message: "version은 1이어야 합니다." });
  if (Object.keys(file).some((key) => !["version", "sources", "companies", "retired"].includes(key))) issues.push({ id: null, message: "최상위 필드는 version, sources, companies, retired뿐이어야 합니다." });
  if (!Array.isArray(file.sources)) return [...issues, { id: null, message: "sources 배열이 필요합니다." }];
  if (file.retired !== undefined && !Array.isArray(file.retired)) issues.push({ id: null, message: "retired는 배열이어야 합니다." });
  const retired = Array.isArray(file.retired) ? (file.retired as unknown[]) : [];
  let previousRetired = "";
  const retiredIds = new Set<string>();
  for (const record of retired) {
    const id = idOf(record);
    for (const message of retiredIssues(record)) issues.push({ id, message });
    if (id === null) continue;
    if (id <= previousRetired) issues.push({ id, message: retiredIds.has(id) ? "retired id가 중복됩니다." : "retired는 id 순으로 정렬돼야 합니다." });
    previousRetired = id > previousRetired ? id : previousRetired;
    retiredIds.add(id);
  }
  const blocks = retiredBlocks(file);
  const taken = new Map<string, string>();
  for (const source of context.codeSources) for (const identity of boardIdentities(source)) taken.set(identity, "코드 출처");
  const ids = new Set<string>();
  let previous = "";
  for (const raw of file.sources as unknown[]) {
    const id = idOf(raw);
    const own = entryIssues(raw);
    for (const message of own) issues.push({ id, message });
    if (id === null) continue;
    if (id <= previous) issues.push({ id, message: ids.has(id) ? "id가 중복됩니다." : "id 순으로 정렬돼야 합니다." });
    previous = id > previous ? id : previous;
    ids.add(id);
    if (context.reservedIds?.has(id)) issues.push({ id, message: "등록 회사 ID와 겹칩니다." });
    // Overlaps are judged on well-formed entries only (an invalid one is already refused).
    if (own.length) continue;
    const entry = raw as DiscoveredSource;
    const gone = retiredMatch(entry, blocks);
    if (gone) issues.push({ id, message: `사람이 뺀 출처(${gone})와 겹칩니다. retired에 있는 출처·회사는 다시 등록하지 않습니다.` });
    for (const identity of boardIdentities(entry)) {
      const owner = taken.get(identity);
      if (owner)
        issues.push({ id, message: identity.startsWith("company:")
          ? `같은 회사(사업자번호 10자리)의 출처가 이미 있습니다(${owner}). 한 회사에 보드 하나만 등록합니다.`
          : `보드가 ${owner}와 겹칩니다(${identity}).` });
      else taken.set(identity, `데이터 출처 ${id}`);
    }
  }
  if (file.companies !== undefined && !Array.isArray(file.companies)) issues.push({id:null,message:"companies는 배열이어야 합니다."});
  const companyNumbers = new Set<string>();
  let previousCompany = "";
  for (const raw of Array.isArray(file.companies) ? file.companies : []) {
    const id = idOf(raw), own = companyEntryIssues(raw);
    for (const message of own) issues.push({id,message});
    if (id === null) continue;
    if (id <= previousCompany) issues.push({id,message:"companies는 중복 없는 id 순으로 정렬돼야 합니다."});
    previousCompany = id;
    if (ids.has(id) || context.reservedIds?.has(id)) issues.push({id,message:"등록 회사 ID와 겹칩니다."});
    if (own.length) continue;
    const entry = raw as DiscoveredCompany;
    if (companyNumbers.has(entry.businessNumber)) issues.push({id,message:"회사 사업자번호가 중복됩니다."});
    companyNumbers.add(entry.businessNumber);
    const gone = retiredMatch(entry, blocks);
    if (gone) issues.push({id,message:`사람이 뺀 회사와 겹칩니다: ${gone}`});
    if (context.codeSources.some(source => boardIdentities(source).includes(`company:${entry.businessNumber}`))) issues.push({id,message:"코드 회사와 겹칩니다."});
  }
  return issues;
}

/**
 * What a change from `previous` (main's parsed file) to `next` may do to people's decisions:
 * a source leaves `sources` only with a retired record of the same board and company, and
 * `retired` is append-only (every earlier record kept byte for byte). Checked by the data gate
 * against main and, for code PRs, by tests/discovered-sources.test.ts against the merge base.
 */
export function retirementIssues(previous: unknown, next: unknown): DiscoveredIssue[] {
  const listOf = (file: unknown, key: "sources" | "retired" | "companies") => (isRecord(file) && Array.isArray(file[key]) ? (file[key] as unknown[]).filter(isRecord) : []);
  const issues: DiscoveredIssue[] = [];
  const nextIds = new Set(listOf(next, "sources").map(idOf));
  const nextRetired = new Map(listOf(next, "retired").map((record) => [idOf(record), record] as const));
  for (const entry of listOf(previous, "sources")) {
    const id = idOf(entry);
    if (id === null || nextIds.has(id)) continue;
    const record = nextRetired.get(id);
    if (!record) issues.push({ id, message: "sources에서 빠졌는데 retired 기록이 없습니다. 출처를 빼려면 코드 PR에서 retired로 옮깁니다." });
    else if (["provider", "board", "careerUrl", "greetingWorkspaceId", "businessNumber"].some((key) => record[key] !== entry[key]))
      issues.push({ id, message: "retired 기록의 provider·board·careerUrl·greetingWorkspaceId·businessNumber가 뺀 출처와 다릅니다." });
  }
  const nextCompanies = new Map(listOf(next, "companies").map(entry => [idOf(entry), entry]));
  for (const entry of listOf(previous, "companies")) {
    if (JSON.stringify(nextCompanies.get(idOf(entry))) !== JSON.stringify(entry)) issues.push({id:idOf(entry),message:"회사 등록은 추가만 합니다. 기존 회사가 빠지거나 바뀌었습니다."});
  }
  for (const record of listOf(previous, "retired")) {
    const id = idOf(record);
    const kept = nextRetired.get(id);
    if (!kept || JSON.stringify(kept) !== JSON.stringify(record)) issues.push({ id, message: "retired 기록이 빠지거나 바뀌었습니다. retired는 추가만 합니다." });
  }
  return issues;
}

/**
 * The entries a reader may use: each valid on its own and not overlapping a
 * code source, a reserved id or an earlier entry. A broken file yields none.
 */
export function usableDiscoveredSources(raw: unknown, codeSources: readonly Source[], reservedIds?: ReadonlySet<string>): DiscoveredSource[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { sources?: unknown }).sources) || (raw as { version?: unknown }).version !== 1) return [];
  const blocks = retiredBlocks(raw);
  if (blocks.broken) return [];
  const taken = new Set(codeSources.flatMap(boardIdentities));
  const ids = new Set<string>();
  const usable: DiscoveredSource[] = [];
  for (const entry of (raw as { sources: unknown[] }).sources) {
    if (entryIssues(entry).length) continue;
    const source = entry as DiscoveredSource;
    if (ids.has(source.id) || reservedIds?.has(source.id) || retiredMatch(source, blocks)) continue;
    const identities = boardIdentities(source);
    if (identities.some((identity) => taken.has(identity))) continue;
    identities.forEach((identity) => taken.add(identity));
    ids.add(source.id);
    usable.push(source);
  }
  return usable;
}

/** Entries of a text as a file, or null when it is not even a version-1 object with a sources array. */
export function readDiscovered(text: string | null): DiscoveredFile | null {
  if (text === null) return emptyDiscoveredFile();
  const raw = parseDiscovered(text) as DiscoveredFile | null;
  if (!raw || typeof raw !== "object" || raw.version !== 1 || !Array.isArray(raw.sources)) return null;
  return raw;
}

/**
 * Worker sync (spec §4): the file is carried across the reset to main and
 * merged three ways. Additions only, so the merge is a union:
 *   - main's entries always (main wins on the same id),
 *   - the worker's entries main does not have, unless main removed them since
 *     the last sync (in `base` but not in `theirs`), a main entry or code
 *     source now collects the same board, a code company now has the id, or
 *     main's `retired` names its id, board or company.
 * `retired` is always main's. Returns the canonical text, or null when neither side has entries and main has no file.
 */
export function mergeDiscoveredSources(
  base: string | null,
  ours: string | null,
  theirs: string | null,
  codeSources: readonly Source[],
  reservedIds?: ReadonlySet<string>,
): { text: string | null; kept: string[]; dropped: string[] } {
  const main = readDiscovered(theirs);
  const worker = readDiscovered(ours);
  const previous = readDiscovered(base);
  const workerIds = () => [...(worker?.sources ?? []), ...(Array.isArray(worker?.companies) ? worker.companies : [])].map((entry) => idOf(entry) ?? "(id 없음)");
  // A main file that does not parse, or holds non-object entries or a broken retired list, is main's problem: serve it as it is, without worker additions.
  const blocks = retiredBlocks(main);
  if (!main || recordsOf(main).length !== main.sources.length || blocks.broken || (main.companies !== undefined && (!Array.isArray(main.companies) || main.companies.some(entry => !isRecord(entry) || idOf(entry) === null)))) return { text: theirs, kept: [], dropped: workerIds() };
  const mainIds = new Set(main.sources.map(idOf).filter((id): id is string => id !== null));
  // Base and worker entries that are not objects with an id are dropped (reported), never read.
  const removed = new Set(recordsOf(previous).map(idOf).filter((id): id is string => id !== null && !mainIds.has(id)));
  const taken = new Set([...codeSources.flatMap(boardIdentities), ...main.sources.flatMap((entry) => (typeof entry.board === "string" ? boardIdentities(entry) : []))]);
  const kept: DiscoveredSource[] = [];
  const dropped: string[] = [];
  for (const entry of worker?.sources ?? []) {
    const id = idOf(entry);
    if (id !== null && mainIds.has(id)) continue;
    if (id === null || entryIssues(entry).length) { dropped.push(id ?? `(잘못된 항목: ${describe(entry)})`); continue; }
    const identities = boardIdentities(entry);
    if (removed.has(id) || reservedIds?.has(id) || retiredMatch(entry, blocks) || identities.some((identity) => taken.has(identity))) {
      dropped.push(id);
      continue;
    }
    identities.forEach((identity) => taken.add(identity));
    kept.push(entry);
  }
  const companyKept: DiscoveredCompany[] = [];
  const mainCompanies = main.companies ?? [];
  const companyIds = new Set(mainCompanies.map(entry => entry.id));
  const removedCompanies = new Set((Array.isArray(previous?.companies) ? previous.companies : []).filter(entry => !companyIds.has(entry.id)).map(entry => entry.id));
  const companyNumbers = new Set(mainCompanies.map(entry => entry.businessNumber));
  for (const entry of Array.isArray(worker?.companies) ? worker.companies : []) {
    const id = idOf(entry);
    if (id !== null && companyIds.has(id as DiscoveredCompany["id"])) continue;
    if (id === null || companyEntryIssues(entry).length || removedCompanies.has(entry.id) || reservedIds?.has(id) || retiredMatch(entry, blocks) || companyNumbers.has(entry.businessNumber) || codeSources.some(source => boardIdentities(source).includes(`company:${entry.businessNumber}`)) || main.sources.some(source => source.businessNumber === entry.businessNumber && !mainCompanies.some(company => company.businessNumber === entry.businessNumber))) { dropped.push(id ?? "(잘못된 회사 항목)"); continue; }
    companyNumbers.add(entry.businessNumber); companyKept.push(entry);
  }
  if (theirs === null && !kept.length && !companyKept.length) return { text: null, kept: [], dropped };
  if (!kept.length && !companyKept.length) return { text: theirs, kept: [], dropped };
  return { text: serializeDiscovered({ version: 1, sources: [...main.sources, ...kept], companies: [...mainCompanies, ...companyKept], retired: main.retired }), kept: [...kept, ...companyKept].map(entry => entry.id), dropped };
}

/**
 * A carried copy with its unreadable entries removed (non-objects, no text id), and their
 * descriptions: what a recovery may use in main's role of a union. Null text stays null.
 */
export function cleanDiscovered(text: string | null): { text: string | null; dropped: string[] } {
  if (text === null) return { text: null, dropped: [] };
  const file = readDiscovered(text);
  if (!file) return { text: null, dropped: ["(읽을 수 없는 파일)"] };
  const kept = file.sources.filter((entry) => idOf(entry) !== null);
  const dropped = file.sources.filter((entry) => idOf(entry) === null).map((entry) => `(잘못된 항목: ${describe(entry)})`);
  const companies = Array.isArray(file.companies) ? file.companies.filter(entry => idOf(entry) !== null) : file.companies;
  if (Array.isArray(file.companies)) dropped.push(...file.companies.filter(entry => idOf(entry) === null).map(() => "(잘못된 회사 항목)"));
  return { text: serializeDiscovered({ version: 1, sources: kept, companies, retired: file.retired }), dropped };
}

/** Source keys (`provider:board`) of the worker's entries main does not have: collected, not yet published. */
export function unpublishedKeys(base: string | null, head: string | null): string[] {
  const main = new Set(recordsOf(readDiscovered(base)).map(idOf));
  return recordsOf(readDiscovered(head))
    .filter((entry) => !main.has(idOf(entry)) && typeof entry.provider === "string" && typeof entry.board === "string")
    .map((entry) => `${entry.provider}:${entry.board}`);
}
/** `provider:board` of a posting or source state, or null when its fields are not text. */
const keyOf = (provider: unknown, board: unknown) =>
  typeof board === "string" && (provider === undefined || provider === null || typeof provider === "string") ? `${provider ?? "greenhouse"}:${board}` : null;

/**
 * data/jobs.json without the postings, source states and trend of the given
 * sources: what a data PR may publish while those sources are held. Same
 * formatting as lib/store.ts writeSnapshot.
 */
export function stripSourcesFromJobs(text: string, keys: readonly string[]): string {
  if (!keys.length) return text;
  const drop = new Set(keys);
  const snapshot = JSON.parse(text) as {
    jobs?: { source?: string; sourceBoard?: string }[];
    sources?: { provider?: string; board?: string }[];
    trend?: { sources?: Record<string, unknown> };
  };
  const dropped = (key: string | null) => key !== null && drop.has(key);
  const next = {
    ...snapshot,
    ...(Array.isArray(snapshot.jobs) ? { jobs: snapshot.jobs.filter((job) => !isRecord(job) || !dropped(keyOf(job.source, job.sourceBoard))) } : {}),
    ...(Array.isArray(snapshot.sources) ? { sources: snapshot.sources.filter((source) => !isRecord(source) || !dropped(keyOf(source.provider, source.board))) } : {}),
  };
  if (isRecord(snapshot.trend) && isRecord(snapshot.trend.sources))
    next.trend = { ...snapshot.trend, sources: Object.fromEntries(Object.entries(snapshot.trend.sources).filter(([name]) => !drop.has(name))) };
  return JSON.stringify(next, null, 2) + "\n";
}

/**
 * Source keys in a jobs.json (postings, source states, trend) that `registered` does not hold:
 * sources pruned, held or retired. Publication strips them instead of holding the PR (second
 * audit P2-3). Nothing for a file that is not a snapshot.
 */
export function orphanSourceKeys(text: string, registered: ReadonlySet<string>): string[] {
  let snapshot: { jobs?: unknown; sources?: unknown; trend?: { sources?: unknown } } | null = null;
  try {
    snapshot = JSON.parse(text);
  } catch {
    return [];
  }
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.jobs) || !Array.isArray(snapshot.sources)) return [];
  const keys = new Set<string>();
  for (const job of snapshot.jobs as unknown[]) { const key = isRecord(job) ? keyOf(job.source, job.sourceBoard) : null; if (key) keys.add(key); }
  for (const source of snapshot.sources as unknown[]) { const key = isRecord(source) ? keyOf(source.provider, source.board) : null; if (key) keys.add(key); }
  const trend = isRecord(snapshot.trend) ? snapshot.trend.sources : undefined;
  if (trend && typeof trend === "object" && !Array.isArray(trend)) for (const key of Object.keys(trend)) keys.add(key);
  return [...keys].filter((key) => !registered.has(key)).sort();
}
/** `provider:board` of every entry in a discovered-sources text (none when unreadable). */
export function discoveredKeys(text: string | null): string[] {
  return recordsOf(readDiscovered(text))
    .filter((entry) => typeof entry.provider === "string" && typeof entry.board === "string")
    .map((entry) => `${entry.provider}:${entry.board}`);
}
