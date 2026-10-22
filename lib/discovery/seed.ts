/**
 * Seed for source discovery: the National Pension workplace file
 * (data.go.kr 15083277). Columns are read by header name, not position,
 * because the portal has changed the file's layout before; the header seen is
 * reported with every run. Only aggregates leave this module: a company
 * candidate is one business-number prefix plus one normalized name.
 */
import { industryTier, isTechIndustry } from "./industry";

export type SeedField =
  | "month" | "name" | "prefix" | "status" | "roadAddress" | "lotAddress" | "sido" | "sigungu"
  | "industryCode" | "industryName" | "subscribers" | "entityType";

type FieldRule = { exact: string[]; pattern?: RegExp; exclude?: RegExp };
const compact = (text: string) => text.normalize("NFKC").replace(/^﻿/, "").replace(/\s+/g, "").toLowerCase();

// Exact names first (the 2026-09 layout and the API's field names), then a
// pattern for renamed columns. A pattern never matches a column another field
// already owns exactly ("상실가입자수" is not "가입자수").
const RULES: Record<SeedField, FieldRule> = {
  month: { exact: ["자료생성년월", "기준년월", "datacrtym"], pattern: /생성년월|기준년월|기준월/ },
  name: { exact: ["사업장명", "wkplnm"], pattern: /^사업장(명|이름)/ },
  prefix: { exact: ["사업자등록번호", "bzowrrgstno"], pattern: /사업자(등록)?번호/ },
  status: { exact: ["사업장가입상태코드1등록2탈퇴", "wkpljnngstcd"], pattern: /가입상태/ },
  roadAddress: { exact: ["사업장도로명상세주소", "wkplroadnmdtladdr"], pattern: /도로명.*주소/ },
  lotAddress: { exact: ["사업장지번상세주소"], pattern: /지번.*주소/ },
  sido: { exact: ["법정동주소광역시도코드", "ldongaddrmgplcdpcd"], pattern: /시도코드$/ },
  sigungu: { exact: ["법정동주소광역시시군구코드", "ldongaddrmgplcsggucd"], pattern: /시군구코드$/, exclude: /읍면동/ },
  industryCode: { exact: ["사업장업종코드", "wkpltpcd"], pattern: /업종코드$/ },
  industryName: { exact: ["사업장업종코드명", "vldtvbsiznm"], pattern: /업종(코드)?명$/ },
  subscribers: { exact: ["가입자수", "jnngpcnt"], pattern: /^(현재)?가입자수(\(명\))?$/ },
  entityType: { exact: ["사업장형태구분코드1법인2개인"], pattern: /사업장형태/ },
};
const REQUIRED: SeedField[] = ["name", "prefix", "status", "industryCode", "subscribers"];

export type HeaderMapping = { header: string[]; columns: Partial<Record<SeedField, number>>; unmapped: string[] };

export class SeedSchemaError extends Error {
  constructor(readonly header: string[], readonly missing: string[]) {
    super(`SEED_SCHEMA_UNSUPPORTED: 필요한 열(${missing.join(", ")})을 찾지 못했습니다. 본 헤더: ${header.join(" | ")}`);
  }
}

export function mapHeader(header: string[]): HeaderMapping {
  const keys = header.map(compact);
  const columns: Partial<Record<SeedField, number>> = {};
  const taken = new Set<number>();
  for (const [field, rule] of Object.entries(RULES) as [SeedField, FieldRule][]) {
    const index = keys.findIndex((key, i) => !taken.has(i) && rule.exact.includes(key));
    if (index >= 0) { columns[field] = index; taken.add(index); }
  }
  for (const [field, rule] of Object.entries(RULES) as [SeedField, FieldRule][]) {
    if (columns[field] !== undefined || !rule.pattern) continue;
    const matches = keys.flatMap((key, i) => !taken.has(i) && rule.pattern!.test(key) && !rule.exclude?.test(key) ? [i] : []);
    if (matches.length === 1) { columns[field] = matches[0]; taken.add(matches[0]); }
  }
  const missing: string[] = REQUIRED.filter(field => columns[field] === undefined);
  if (columns.roadAddress === undefined && columns.lotAddress === undefined && columns.sido === undefined)
    missing.push("주소 또는 시도코드");
  if (missing.length) throw new SeedSchemaError(header, missing);
  return { header, columns, unmapped: header.filter((_, i) => !taken.has(i)) };
}

/** Streaming RFC 4180 reader: quoted fields may hold commas, quotes and newlines. */
export class CsvReader {
  private field = "";
  private record: string[] = [];
  private quoted = false;
  private afterQuote = false;
  push(text: string, emit: (record: string[]) => void) {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (this.quoted) {
        if (c === '"') { this.quoted = false; this.afterQuote = true; }
        else this.field += c;
        continue;
      }
      if (c === '"') {
        if (this.afterQuote) { this.field += '"'; this.quoted = true; this.afterQuote = false; }
        else if (!this.field) this.quoted = true;
        else this.field += c;
        continue;
      }
      this.afterQuote = false;
      if (c === ",") { this.record.push(this.field); this.field = ""; }
      else if (c === "\n") { this.record.push(this.field.replace(/\r$/, "")); this.field = ""; emit(this.record); this.record = []; }
      else this.field += c;
    }
  }
  end(emit: (record: string[]) => void) {
    if (this.field || this.record.length) { this.record.push(this.field.replace(/\r$/, "")); emit(this.record); }
    this.field = ""; this.record = []; this.quoted = false; this.afterQuote = false;
  }
}

/** UTF-8 (with or without BOM) or CP949, judged on whole lines of the first chunk. */
export function detectEncoding(head: Uint8Array): "utf-8" | "euc-kr" {
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return "utf-8";
  const end = head.lastIndexOf(0x0a);
  const sample = end > 0 ? head.subarray(0, end) : head;
  try { new TextDecoder("utf-8", { fatal: true }).decode(sample); return "utf-8"; }
  catch { return "euc-kr"; }
}

export type SeedRow = {
  month: string | null;
  name: string;
  prefix: string;
  registered: boolean;
  roadAddress: string;
  lotAddress: string;
  sido: string;
  sigungu: string;
  industryCode: string;
  industryName: string;
  subscribers: number | null;
  entityType: string;
};

export type SeedScan = {
  encoding: "utf-8" | "euc-kr";
  header: string[];
  mapping: Record<string, string>;
  unmapped: string[];
  rows: number;
  invalidRows: number;
};

const cell = (record: string[], index: number | undefined) => (index === undefined ? "" : (record[index] ?? "").trim());
const toRow = (record: string[], c: HeaderMapping["columns"]): SeedRow => {
  const status = cell(record, c.status);
  const subscribers = cell(record, c.subscribers).replace(/,/g, "");
  const month = cell(record, c.month);
  return {
    month: /^\d{4}-?\d{2}$/.test(month) ? month.replace(/^(\d{4})-?(\d{2})$/, "$1-$2") : null,
    name: cell(record, c.name),
    prefix: cell(record, c.prefix).replace(/\D/g, "").slice(0, 6),
    registered: status === "1" || status === "등록",
    roadAddress: cell(record, c.roadAddress),
    lotAddress: cell(record, c.lotAddress),
    sido: cell(record, c.sido),
    sigungu: cell(record, c.sigungu),
    industryCode: cell(record, c.industryCode),
    industryName: cell(record, c.industryName),
    subscribers: /^\d+$/.test(subscribers) ? Number(subscribers) : null,
    entityType: cell(record, c.entityType),
  };
};

/** Reads every data row once. Rows whose cell count differs from the header are counted, not guessed. */
export async function scanSeed(chunks: AsyncIterable<Uint8Array>, visit: (row: SeedRow) => void): Promise<SeedScan> {
  const reader = new CsvReader();
  let decoder: TextDecoder | null = null;
  let encoding: SeedScan["encoding"] = "utf-8";
  let mapping: HeaderMapping | null = null;
  let rows = 0, invalidRows = 0;
  const emit = (record: string[]) => {
    if (!mapping) { mapping = mapHeader(record.map(h => h.replace(/^﻿/, "").trim())); return; }
    if (record.length === 1 && !record[0].trim()) return;
    rows++;
    if (record.length !== mapping.header.length) { invalidRows++; return; }
    const row = toRow(record, mapping.columns);
    if (!row.name || row.prefix.length !== 6) { invalidRows++; return; }
    visit(row);
  };
  for await (const chunk of chunks) {
    if (!decoder) {
      encoding = detectEncoding(chunk);
      decoder = new TextDecoder(encoding, { ignoreBOM: false });
    }
    reader.push(decoder.decode(chunk, { stream: true }), emit);
  }
  if (decoder) reader.push(decoder.decode(), emit);
  reader.end(emit);
  if (!mapping) throw new SeedSchemaError([], ["헤더"]);
  const m: HeaderMapping = mapping;
  return {
    encoding,
    header: m.header,
    mapping: Object.fromEntries(Object.entries(m.columns).map(([field, index]) => [field, m.header[index as number]])),
    unmapped: m.unmapped,
    rows,
    invalidRows,
  };
}

/** Seoul (시도 11) or Seongnam Bundang-gu (41135, which includes Pangyo). Address text and codes both count. */
export function regionOf(row: Pick<SeedRow, "sido" | "sigungu" | "roadAddress" | "lotAddress">): "seoul" | "bundang" | null {
  const address = `${row.roadAddress} ${row.lotAddress}`;
  if (row.sido === "11" || /^\s*서울/.test(row.roadAddress) || /^\s*서울/.test(row.lotAddress)) return "seoul";
  if ((row.sido === "41" && row.sigungu === "135") || /성남시\s*분당구/.test(address)) return "bundang";
  return null;
}

/** Corporate markers, spaces and punctuation removed; the same rule the DART and pension collectors use. */
export function nameKey(text: string) {
  return text
    .normalize("NFKC")
    .replace(/주식회사|유한책임회사|유한회사|\(\s*주\s*\)|\(\s*유\s*\)|㈜|\(\s*사\s*\)|사단법인|재단법인/g, "")
    .replace(/[\s,.·'"`]/g, "")
    .toLowerCase();
}
/**
 * `text` with "(…)" (and, when asked, "[…]") parts replaced, like
 * `/\([^)]*\)|\[[^\]]*\]/g` but by a forward scan: an opener with no closer
 * after it stays, and once a closer is missing no later opener of that kind is
 * searched again (the regex rescanned to the end from every opener).
 */
export function withoutBracketed(text: string, replacement = "", squareToo = true): string {
  const pairs: [string, string][] = squareToo ? [["(", ")"], ["[", "]"]] : [["(", ")"]];
  // Each opener's next position is remembered (-1: none left, or no closer after it),
  // so an absent opener is not searched for again on every pair ("()()()…" stays linear).
  const next = pairs.map(([open]) => text.indexOf(open));
  const parts: string[] = [];
  let kept = 0, pos = 0;
  for (;;) {
    let start = -1, which = -1;
    for (let i = 0; i < pairs.length; i++) {
      if (next[i] >= 0 && next[i] < pos) next[i] = text.indexOf(pairs[i][0], pos);
      if (next[i] >= 0 && (start < 0 || next[i] < start)) { start = next[i]; which = i; }
    }
    if (start < 0) break;
    const end = text.indexOf(pairs[which][1], start + 1);
    if (end < 0) { next[which] = -1; pos = start + 1; continue; }
    parts.push(text.slice(kept, start), replacement);
    kept = pos = end + 1;
  }
  parts.push(text.slice(kept));
  return parts.join("");
}

/** The same key without a parenthesized part, e.g. an English name the file appends. */
export function coreNameKey(text: string) {
  return nameKey(withoutBracketed(text.normalize("NFKC")));
}

const LETTERS: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이", j: "제이", k: "케이", l: "엘", m: "엠",
  n: "엔", o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "지",
};
/**
 * A name key with short Latin runs spelled as Korean letter names, so the
 * pension file's "엘지씨엔에스" meets DART's "LG씨엔에스" and "에스케이쉴더스"
 * meets "SK쉴더스". Only runs of up to four letters (acronyms such as LG, SK,
 * NHN, KTis); words like NAVER are left alone. Null when there is no such run.
 */
export function spelledKey(text: string): string | null {
  const key = nameKey(text);
  if (!/(?:^|[^a-z])[a-z]{1,4}(?![a-z])/.test(key)) return null;
  return key.replace(/[a-z]+/g, run => (run.length <= 4 ? [...run].map(c => LETTERS[c]).join("") : run));
}

export type Workplace = { name: string; roadAddress: string; region: "seoul" | "bundang"; industryCode: string; industryName: string; subscribers: number; month: string | null;
  /** 시도·시군구 as the file states them (absent in reports written before 2026-10-08 phase 3). */
  sido?: string; sigungu?: string };
export type Candidate = {
  key: string;
  prefix: string;
  nameKey: string;
  names: string[];
  subscribers: number;
  maxWorkplaceSubscribers: number;
  regions: ("seoul" | "bundang")[];
  industryCodes: string[];
  /** "tech" when any workplace has a TECH code; "review" needs DART's KSIC to confirm. */
  tier: "tech" | "review";
  workplaces: Workplace[];
};

export type SeedFunnel = {
  rows: number;
  invalidRows: number;
  latestMonth: string | null;
  registered: number;
  inRegion: number;
  techIndustry: number;
  rowsAtLeastThreshold: number;
  companiesBeforeThreshold: number;
  companies: number;
};

/** 2026-10-16: company size is descriptive, not an admission requirement. */
export const DEFAULT_DISCOVERY_THRESHOLD = 0;

/**
 * Registered, in-region, tech-coded workplaces of the latest month, grouped by
 * business-number prefix + normalized name. Subscribers are the SUM of those
 * workplaces; the threshold applies to that sum.
 */
export class SeedFilter {
  private funnel = { registered: 0, inRegion: 0, techIndustry: 0 };
  private kept: (Workplace & { prefix: string })[] = [];
  private months = new Map<string, number>();
  readonly industryStats = new Map<string, { name: string; rows: number; subscribers: number; tech: boolean }>();
  constructor(private readonly isTech: (code: string, name: string) => boolean = isTechIndustry, private readonly requestedKeys: ReadonlySet<string> = new Set()) {}
  visit = (row: SeedRow) => {
    if (row.month) this.months.set(row.month, (this.months.get(row.month) ?? 0) + 1);
    if (!row.registered) return;
    this.funnel.registered++;
    const region = regionOf(row);
    if (!region) return;
    this.funnel.inRegion++;
    const tech = this.isTech(row.industryCode, row.name);
    const stat = this.industryStats.get(row.industryCode) ?? { name: row.industryName, rows: 0, subscribers: 0, tech };
    stat.rows++; stat.subscribers += row.subscribers ?? 0;
    this.industryStats.set(row.industryCode, stat);
    if ((!tech && !this.requestedKeys.has(`${row.prefix}:${nameKey(row.name)}`)) || row.subscribers === null) return;
    if (tech) this.funnel.techIndustry++;
    this.kept.push({ prefix: row.prefix, name: row.name, roadAddress: row.roadAddress || row.lotAddress, region, industryCode: row.industryCode,
      industryName: row.industryName, subscribers: row.subscribers, month: row.month, sido: row.sido, sigungu: row.sigungu });
  };
  result(scan: Pick<SeedScan, "rows" | "invalidRows">, threshold = DEFAULT_DISCOVERY_THRESHOLD): { funnel: SeedFunnel; candidates: Candidate[] } {
    const latestMonth = [...this.months.keys()].sort().at(-1) ?? null;
    const current = this.kept.filter(w => !latestMonth || w.month === latestMonth);
    const groups = new Map<string, Candidate>();
    // Membership sets per group keep this linear when one company key has many spelling variants.
    const seen = new Map<string, { names: Set<string>; regions: Set<string>; codes: Set<string> }>();
    for (const w of current) {
      const key = `${w.prefix}:${nameKey(w.name)}`;
      const group = groups.get(key) ?? { key, prefix: w.prefix, nameKey: nameKey(w.name), names: [], subscribers: 0, maxWorkplaceSubscribers: 0, regions: [], industryCodes: [], tier: "review" as Candidate["tier"], workplaces: [] };
      const { prefix: _prefix, ...workplace } = w;
      void _prefix;
      group.workplaces.push(workplace);
      group.subscribers += w.subscribers;
      group.maxWorkplaceSubscribers = Math.max(group.maxWorkplaceSubscribers, w.subscribers);
      let sets = seen.get(key);
      if (!sets) seen.set(key, (sets = { names: new Set(), regions: new Set(), codes: new Set() }));
      if (!sets.names.has(w.name)) { sets.names.add(w.name); group.names.push(w.name); }
      if (!sets.regions.has(w.region)) { sets.regions.add(w.region); group.regions.push(w.region); }
      if (!sets.codes.has(w.industryCode)) { sets.codes.add(w.industryCode); group.industryCodes.push(w.industryCode); }
      if (industryTier(w.industryCode) === "tech") group.tier = "tech";
      groups.set(key, group);
    }
    const candidates = [...groups.values()].filter(c => c.subscribers >= threshold).sort((a, b) => b.subscribers - a.subscribers || a.key.localeCompare(b.key));
    return {
      funnel: { rows: scan.rows, invalidRows: scan.invalidRows, latestMonth, ...this.funnel,
        rowsAtLeastThreshold: current.filter(w => w.subscribers >= threshold).length,
        companiesBeforeThreshold: groups.size, companies: candidates.length },
      candidates,
    };
  }
}
