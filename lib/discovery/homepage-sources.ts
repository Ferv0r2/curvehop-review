/**
 * Homepages for candidates DART does not give one (approved 2026-10-08 on the
 * same data.go.kr key):
 *
 * 1. FSC 기업기본정보 (getCorpOutline_V2), searched by the core company name.
 *    A company matches only when its business number (bzno) starts with the
 *    pension prefix AND its normalized name matches, the same rule as DART.
 *    One company has several snapshot rows; the homepage is the non-empty one
 *    with the latest lastOpegDt.
 * 2. FTC 통신판매사업자 등록상세 (getMllBsInfoDetail_3), queried by the full
 *    business number FSC returned (brno; bzmnNm does not filter). Domains are
 *    used only while the business is active, and never shared shops,
 *    marketplaces, social pages or job platforms.
 * 3. A found homepage counts only when the page itself shows the business
 *    number (first six digits, hyphens optional) or the company name.
 *
 * Responses are cached under the state dir; calls are counted per API with a
 * per-run budget and stop on the portal's limit or key errors. The key is read
 * from DATA_GO_KR_API_KEY or <stateDir>/config/data-go-kr-api-key and never
 * written anywhere.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { atomicWrite } from "./files";
import { asciiLower } from "../ascii";
import { renderedText, visibleText } from "./html";
import { join } from "node:path";
import { registrableDomain } from "./careers";
import { MAX_NAME, keySet, parentName } from "./names";
import { COLLECTOR_UA, isPlatformUrl, readCapped, safeUrl, type Receipt } from "./http";
import { coreNameKey, nameKey, withoutBracketed } from "./seed";

export type FscRow = { crno: string; corpNm: string; corpEnsnNm: string; bzno: string; enpHmpgUrl: string; lastOpegDt: string; fssCorpUnqNo: string; enpBsadr: string; sicNm?: string };
export type FtcRow = { brno: string; bzmnNm: string; domnCn: string; operSttusCdNm: string; lctnRnAddr: string; crno: string };

export type FscMatch =
  | { status: "matched"; crno: string; corpNm: string; corpEnsnNm: string; bzno: string; homepage: string | null; lastOpegDt: string; fssCorpUnqNo: string; sicNm: string; rows: number }
  | { status: "no-match" | "ambiguous"; rows: number; companies: number };

/** Search terms for the FSC name filter (a substring match): the name without corporate markers, then without spaces. */
export function fscSearchTerms(names: string[]): string[] {
  const terms: string[] = [];
  // A branch or division name searches by its legal entity first.
  const short = names.map(name => name.slice(0, MAX_NAME));
  for (const name of [...short.map(parentName).filter((n): n is string => !!n), ...short]) {
    const core = withoutBracketed(name.normalize("NFKC"), " ")
      .replace(/주식회사|유한책임회사|유한회사|㈜|\(\s*주\s*\)|\(\s*유\s*\)/g, " ")
      .replace(/\s+/g, " ").trim();
    if (core.length >= 2) terms.push(core);
    const compact = core.replace(/\s+/g, "");
    if (compact.length >= 2) terms.push(compact);
  }
  return [...new Set(terms)].slice(0, 2);
}

/** The single company among FSC rows whose bzno prefix and normalized name both match. */
export function decideFsc(rows: FscRow[], prefix: string, names: string[], english: string[] = []): FscMatch {
  const wanted = keySet(names, { english });
  const hits = rows.filter(row => String(row.bzno ?? "").replace(/\D/g, "").slice(0, 6) === prefix
    && [...keySet([row.corpNm], { division: false, english: row.corpEnsnNm ? [row.corpEnsnNm] : [] })].some(key => wanted.has(key)));
  const companies = [...new Set(hits.map(row => row.crno || row.bzno))];
  if (companies.length !== 1) return { status: companies.length ? "ambiguous" : "no-match", rows: rows.length, companies: companies.length };
  const latest = [...hits].sort((a, b) => String(b.lastOpegDt).localeCompare(String(a.lastOpegDt)));
  const withHomepage = latest.find(row => String(row.enpHmpgUrl ?? "").trim());
  const top = latest[0];
  return { status: "matched", crno: top.crno, corpNm: top.corpNm, corpEnsnNm: top.corpEnsnNm ?? "", bzno: String(top.bzno).replace(/\D/g, ""),
    homepage: withHomepage ? String(withHomepage.enpHmpgUrl).trim() : null, lastOpegDt: (withHomepage ?? top).lastOpegDt,
    fssCorpUnqNo: latest.find(row => /^\d{8}$/.test(String(row.fssCorpUnqNo ?? "")))?.fssCorpUnqNo ?? "", sicNm: latest.find(row => String(row.sicNm ?? "").trim())?.sicNm ?? "", rows: rows.length };
}

// Hosts many businesses share: a page there shows a seller's details, not a company homepage.
const SHARED_HOSTS = /(?:^|\.)(?:naver\.com|naver\.me|coupang\.com|11st\.co\.kr|gmarket\.co\.kr|auction\.co\.kr|interpark\.com|ssg\.com|lotteon\.com|wemakeprice\.com|tmon\.co\.kr|kakao\.com|instagram\.com|facebook\.com|youtube\.com|tistory\.com|blogspot\.com|cafe24\.com|cafe24shop\.com|imweb\.me|sixshop\.com|modoo\.at|wixsite\.com|godomall\.com|makeshop\.co\.kr|musinsa\.com|29cm\.co\.kr|kurly\.com|zigzag\.kr|a-bly\.com|idus\.com|wadiz\.kr|tumblbug\.com|amazon\.com|apple\.com|google\.com|linktr\.ee|notion\.site|oopy\.io|github\.io|band\.us|twitter\.com|x\.com)$/i;
export function isSharedHost(host: string) { return SHARED_HOSTS.test(host.toLowerCase()); }

/** A homepage field ("www.x.co.kr", "https://x.com/") as a URL, or null for shared, platform or malformed values. */
export function homepageCandidate(raw: string): string | null {
  const value = raw.trim().replace(/[\s,;]+$/, "");
  if (!value || /^(?:n\/?a|-|없음|null)$/i.test(value)) return null;
  const url = safeUrl(/^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`);
  if (!url || isPlatformUrl(url.href) || isSharedHost(url.hostname)) return null;
  return url.href;
}

const ACTIVE = /^(?:정상영업|영업|영업중|정상)$/;
/** Company domains from FTC rows of exactly this business number while it is active. */
export function ftcDomains(rows: FtcRow[], bzno: string): { domains: string[]; dropped: string[]; inactive: boolean } {
  const own = rows.filter(row => String(row.brno ?? "").replace(/\D/g, "") === bzno);
  const active = own.filter(row => ACTIVE.test(String(row.operSttusCdNm ?? "").replace(/\s/g, "")));
  const domains: string[] = [], dropped: string[] = [];
  for (const row of active)
    // Values are free text: several domains separated by spaces or commas, sometimes glued together ("a.co.krhttps://b.com").
    for (const token of String(row.domnCn ?? "").split(/[\s,;|]+|(?=https?:\/\/)/).filter(Boolean)) {
      // The field names a domain: keep only the site root, never a listing page under someone else's site.
      const url = homepageCandidate(token);
      if (url) domains.push(new URL(url).origin + "/"); else if (!/^(?:n\/?a|-)$/i.test(token)) dropped.push(token);
    }
  const seen = new Set<string>();
  return { domains: domains.filter(d => { const key = registrableDomain(new URL(d).hostname); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3),
    dropped, inactive: own.length > 0 && active.length === 0 };
}

// Visible text in one linear pass (html.ts), whitespace collapsed so the number scan below needs no unbounded `\s*`.
const plain = (html: string) => visibleText(html)
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");
/**
 * Ten digits that could be a business number (3-2-5, hyphen, dash, dot or spaces optional) in collapsed
 * text. Matching a number already known (`verifyHomepage`) only: any ten-digit run reads as one.
 */
const BUSINESS_NUMBER = /(?<!\d)(\d{3}) ?[-–.]? ?(\d{2}) ?[-–.]? ?(\d{5})(?!\d)/g;
const numbersIn = (text: string) => [...text.matchAll(BUSINESS_NUMBER)].map(m => ({ digits: m[1] + m[2] + m[3], shown: m[0].trim() }));
/** Ten digits right after a business-number label ("사업자등록번호 : 2148174186", "Business Registration No. 214-81-74186"). Hyphen, any dash, minus or dot between groups. */
const LABELED_NUMBER = /(?:사업자 ?등록 ?번호|사업자 ?번호|business registration (?:number|no\.?))[ :#.]{0,4}(\d{3}) ?[-\u2010-\u2015\u2212.]? ?(\d{2}) ?[-\u2010-\u2015\u2212.]? ?(\d{5})(?!\d)/gi;
/** Ten digits written 3-2-5 with a hyphen (any dash or minus) at both breaks, not inside a longer number, word, path, query or fragment. */
const HYPHENATED_NUMBER = /(?<![\w/.=#?&%+\-\u2010-\u2015\u2212])(\d{3}) ?[-\u2010-\u2015\u2212] ?(\d{2}) ?[-\u2010-\u2015\u2212] ?(\d{5})(?![\w\-\u2010-\u2015\u2212]|\.\d)/g;
/**
 * What counts as a URL in rendered text (fifth audit P2 on aba3035; one forward scan since the seventh audit
 * on 6f9e7ac). The text is cut at spaces into runs; inside one run a URL starts at the first of
 *
 *   1. a scheme: the first letter of the `[A-Za-z0-9+.-]` run right before a `://`;
 *   2. the first `www.` (any letter case);
 *   3. a host start: a run of `[A-Za-z0-9.-]` that is a host (a dotted name with no empty label whose last
 *      label starts with a letter, or an IPv4 address), or a bracketed IPv6 address, followed by an optional
 *      `:port` (1–5 digits) and then `/`, `?` or `#`; it starts at the host, or, when the host follows `@`,
 *      at an optional userinfo (`user[:pass]@`). The start is never inside a host or a word: the character
 *      before it is no ASCII letter, digit, `_`, `.`, `@` or `-` (a userinfo may also follow `~`, `%`, `+`
 *      or `:`);
 *
 * and runs to the end of that run. Korean, parentheses, colons and percent escapes inside belong to it; an
 * e-mail address alone (no path, query or fragment) is not one. Nothing inside a URL is a declaration.
 * Every character is looked at a bounded number of times (each backward look stops at the previous
 * `://`, `@` or terminator), so the scan is linear in the text.
 */
const isLetter = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isDigit = (c: number) => c >= 48 && c <= 57;
const isHostChar = (c: number) => isLetter(c) || isDigit(c) || c === 45 || c === 46;
const isSchemeChar = (c: number) => isHostChar(c) || c === 43;
const isUserChar = (c: number) => isHostChar(c) || c === 95 || c === 126 || c === 37 || c === 43;
const isHexOrColon = (c: number) => isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102) || c === 58 || c === 46;
const isTerminator = (c: number) => c === 47 || c === 63 || c === 35;
/** A character a URL may not start right after: ASCII letter, digit, `_`, `.`, `@`, `-`. */
const joinsStart = (c: number) => isLetter(c) || isDigit(c) || c === 95 || c === 46 || c === 64 || c === 45;
/** `run[from, to)`: a dotted name (labels non-empty, last label starting with a letter) or an IPv4 address. */
function isHost(run: string, from: number, to: number): boolean {
  let dots = 0, label = 0, lastLabel = from, allDigits = true, groupOk = true;
  for (let i = from; i < to; i++) {
    const c = run.charCodeAt(i);
    if (c === 46) {
      if (label === 0) return false;
      if (label > 3) groupOk = false;
      dots++; label = 0; lastLabel = i + 1;
    } else { label++; if (!isDigit(c)) allDigits = false; }
  }
  if (label === 0 || dots === 0) return false;
  if (isLetter(run.charCodeAt(lastLabel))) return true;
  return allDigits && dots === 3 && groupOk && label <= 3;
}
/** After a host ending at `end`: an optional `:port` then `/`, `?` or `#`. */
function portThenTerminator(run: string, end: number): boolean {
  if (end < run.length && run.charCodeAt(end) === 58) {
    let digits = 0;
    while (digits < 6 && isDigit(run.charCodeAt(end + 1 + digits))) digits++;
    return digits >= 1 && digits <= 5 && isTerminator(run.charCodeAt(end + 1 + digits));
  }
  return end < run.length && isTerminator(run.charCodeAt(end));
}
/** The start of a userinfo (`user[:pass]`) ending at the `@` at `at`, or -1. */
function userinfoStart(run: string, at: number): number {
  let from = at, colons = 0, secondColon = -1;
  while (from > 0) {
    const c = run.charCodeAt(from - 1);
    if (c === 58) { colons++; if (colons === 2) secondColon = from - 1; }
    else if (!isUserChar(c)) break;
    from--;
  }
  for (let s = Math.max(from, secondColon + 1); s < at; s++) {
    if (!isUserChar(run.charCodeAt(s))) continue;
    const before = s > 0 ? run.charCodeAt(s - 1) : -1;
    if (before < 0 || !joinsStart(before)) return s;
  }
  return -1;
}
/** Where a URL starts in one space-free run (the definition above), or -1. */
function urlStart(run: string): number {
  let best = -1;
  const take = (at: number) => { if (at >= 0 && (best < 0 || at < best)) best = at; };
  for (let k = run.indexOf("://"); k >= 0; k = run.indexOf("://", k + 3)) {
    let from = k;
    while (from > 0 && isSchemeChar(run.charCodeAt(from - 1))) from--;
    while (from < k && !isLetter(run.charCodeAt(from))) from++;
    if (from < k) { take(from); break; }
  }
  const lower = asciiLower(run);
  take(lower.indexOf("www."));
  for (let i = 0; i < run.length; ) {
    const c = run.charCodeAt(i);
    let end = -1;
    if (c === 91) {
      let j = i + 1;
      while (j < run.length && isHexOrColon(run.charCodeAt(j))) j++;
      if (j > i + 1 && run.charCodeAt(j) === 93) end = j + 1;
    } else if (isHostChar(c)) {
      let j = i;
      while (j < run.length && isHostChar(run.charCodeAt(j))) j++;
      end = isHost(run, i, j) ? j : -1;
      if (end < 0) { i = j; continue; }
    }
    if (end < 0) { i++; continue; }
    if (portThenTerminator(run, end)) {
      const before = i > 0 ? run.charCodeAt(i - 1) : -1;
      const start = before === 64 ? userinfoStart(run, i - 1) : before < 0 || !joinsStart(before) ? i : -1;
      if (start >= 0) { take(start); break; }
    }
    i = c === 91 ? i + 1 : end;
  }
  return best;
}
/** The text with every URL (the definition above) cut out, each replaced by a space. One forward pass. */
function withoutUrls(text: string): string {
  return text.split(" ").map((run) => { const at = urlStart(run); return at < 0 ? run : `${run.slice(0, at)} `; }).join(" ");
}

/**
 * The business numbers a page declares in its text as rendered (`renderedText`: character references
 * resolved, Unicode spaces one space, inline elements run together; sixth audit on b4b5a1d), after a
 * business-number label or written 3-2-5 with hyphens, outside any URL. Strict on purpose, for refusing a
 * board that names another company's number (lib/discovery/proof.ts boardNumberConflict): a URL's digits
 * (path, query or fragment), a posting id, a phone number or a bare ten-digit run is no business number.
 * Scripts and JSON data are not text. `verifyHomepage` keeps its own reading.
 */
export function businessNumbersDeclared(html: string): { digits: string; shown: string }[] {
  const text = withoutUrls(renderedText(html)), found = new Map<string, string>();
  for (const m of [...text.matchAll(LABELED_NUMBER), ...text.matchAll(HYPHENATED_NUMBER)])
    // Shown as written, without its label.
    if (!found.has(m[1] + m[2] + m[3])) found.set(m[1] + m[2] + m[3], m[0].slice(m[0].search(/\d/)).trim());
  return [...found].map(([digits, shown]) => ({ digits, shown }));
}

/**
 * Whether a fetched page belongs to the company: the business number shown on
 * the page (usually the footer) matches all ten digits of the number DART or
 * FSC gave, or the company's name appears. The six-digit prefix alone never
 * counts (2026-10-08 audit P1-1): its digits are a tax office, an entity type
 * and one serial digit, shared by many companies. Names shorter than three
 * characters are too common to count.
 */
export function verifyHomepage(html: string, company: { prefix: string; bzno?: string; names: string[]; englishName?: string }): { check: "business-number" | "company-name"; detail: string } | null {
  const text = plain(html);
  const bzno = /^\d{10}$/.test(company.bzno ?? "") ? company.bzno : null;
  const shown = bzno ? numbersIn(text).find(number => number.digits === bzno) : undefined;
  if (shown) return { check: "business-number", detail: shown.shown };
  const compact = nameKey(text);
  // Names come from registry files and APIs: capped like every other name path (names.ts MAX_NAME).
  for (const name of company.names.map(value => value.slice(0, MAX_NAME))) {
    const key = coreNameKey(name);
    if (key.length >= 3 && compact.includes(key)) return { check: "company-name", detail: name };
  }
  const english = (company.englishName ?? "").slice(0, MAX_NAME).toLowerCase().replace(/\b(?:co|corp|corporation|inc|ltd|limited|llc|company)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
  if (english.length >= 5 && text.toLowerCase().replace(/[^a-z0-9]/g, "").includes(english)) return { check: "company-name", detail: company.englishName! };
  return null;
}

export async function readDataGoKrKey(state: string) {
  let key = (process.env.DATA_GO_KR_API_KEY ?? "").trim();
  if (!key) {
    const path = join(state, "config/data-go-kr-api-key");
    try {
      if ((await stat(path)).mode & 0o077) throw new Error("DATA_GO_KR_KEY_FILE_PERMISSIONS");
      key = (await readFile(path, "utf8")).trim();
    } catch (error) {
      if (error instanceof Error && error.message === "DATA_GO_KR_KEY_FILE_PERMISSIONS") throw error;
      throw new Error("DATA_GO_KR_KEY_MISSING: DATA_GO_KR_API_KEY 환경변수나 키 파일이 없습니다.");
    }
  }
  if (key.includes("%")) { try { key = decodeURIComponent(key); } catch { throw new Error("DATA_GO_KR_KEY_INVALID"); } }
  if (key.length < 20 || key.length > 200 || /\s/.test(key)) throw new Error("DATA_GO_KR_KEY_INVALID");
  return key;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const ENDPOINTS = {
  fsc: "https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2",
  ftc: "https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3",
} as const;
type Api = keyof typeof ENDPOINTS;

/** Items of either API's JSON (response.body.items.item or body.items.item), or an error code. */
export function parseGovResponse(text: string): { items: Record<string, unknown>[]; total: number } | { error: string } {
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch {
    const code = text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/)?.[1] ?? text.match(/<resultCode>(\w+)<\/resultCode>/)?.[1];
    return { error: `GOV_API_${code ?? "INVALID_RESPONSE"}` };
  }
  const header = (body.OpenAPI_ServiceResponse as { cmmMsgHeader?: { returnReasonCode?: string } } | undefined)?.cmmMsgHeader;
  if (header) return { error: `GOV_API_${header.returnReasonCode ?? "ERROR"}` };
  const response = (body.response ?? body) as Record<string, unknown>;
  const head = (response.header ?? response) as { resultCode?: string };
  if (head.resultCode && !["00", "0", "000", "INFO-0", "NORMAL_CODE"].includes(String(head.resultCode))) return { error: `GOV_API_${head.resultCode}` };
  const content = (response.body ?? response) as { items?: unknown; totalCount?: unknown };
  const raw = (content.items as { item?: unknown } | undefined)?.item ?? content.items ?? [];
  const items = (Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : []) as Record<string, unknown>[];
  return { items, total: Number(content.totalCount ?? items.length) || 0 };
}

/**
 * Sequential client for apis.data.go.kr (both APIs share the host): one call at
 * a time, `spacingMs` apart, a budget per API, cached answers.
 */
export class GovApiClient {
  readonly calls: Record<Api, number> = { fsc: 0, ftc: 0 };
  readonly cacheHits: Record<Api, number> = { fsc: 0, ftc: 0 };
  /** Set by key or daily-limit errors: every API stops. */
  stopped: string | null = null;
  /** Set by a 429 from one API: that API stops for the run, the other continues. */
  readonly stoppedApi: Record<Api, string | null> = { fsc: null, ftc: null };
  private last = -Infinity;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: { cacheDir: string; key: string; budget: Record<Api, number>; spacingMs?: number; fetcher?: Fetcher; ttlDays?: number }) {}

  private get fetcher(): Fetcher {
    if (!this.options.fetcher && process.env.NODE_TEST_CONTEXT) throw new Error("NETWORK_DISABLED_IN_TEST");
    return this.options.fetcher ?? fetch;
  }

  /** Items for one query, from cache when fresh. Errors are values. */
  async query(api: Api, params: Record<string, string>): Promise<{ items: Record<string, unknown>[]; total: number; receipt: Receipt; cached: boolean; text: string } | { error: string }> {
    const id = createHash("sha256").update(`${api}?${new URLSearchParams(params)}`).digest("hex").slice(0, 32);
    const path = join(this.options.cacheDir, api, `${id}.json`);
    try {
      if (Date.now() - (await stat(path)).mtimeMs < (this.options.ttlDays ?? 30) * 86_400_000) {
        const cached = JSON.parse(await readFile(path, "utf8")) as { text: string; receipt: Receipt };
        const parsed = parseGovResponse(cached.text);
        if (!("error" in parsed)) { this.cacheHits[api]++; return { ...parsed, receipt: cached.receipt, cached: true, text: cached.text }; }
      }
    } catch { /* not cached */ }
    const run = this.chain.then(async () => {
      if (this.stopped) return { error: this.stopped };
      if (this.stoppedApi[api]) return { error: this.stoppedApi[api]! };
      if (this.calls[api] >= this.options.budget[api]) return { error: `GOV_API_BUDGET_${api.toUpperCase()}` };
      const wait = this.last + (this.options.spacingMs ?? 1000) - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.calls[api]++;
      const receipt: Receipt = { url: `${ENDPOINTS[api]}?${new URLSearchParams(params)}`, status: null, sha256: null, bytes: 0, contentType: null, fetchedAt: new Date().toISOString(), ms: 0,
        robots: { state: "exempt-api", robotsUrl: null, sha256: null, checkedAt: null } };
      const started = Date.now();
      try {
        const response = await this.fetcher(`${ENDPOINTS[api]}?${new URLSearchParams({ serviceKey: this.options.key, ...params })}`, {
          headers: { "User-Agent": COLLECTOR_UA, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
        receipt.status = response.status;
        receipt.contentType = response.headers.get("content-type");
        // A refusal (429, 401, 403) stops this API for the run on the status line, before the body is read.
        if (response.status === 429 || response.status === 401 || response.status === 403) {
          this.stoppedApi[api] = `GOV_API_HTTP_${response.status}`;
          await response.body?.cancel().catch(() => {});
          receipt.error = this.stoppedApi[api]!;
          return { error: receipt.error };
        }
        // Only a 2xx answer is parsed (and only a parsed 2xx answer is ever cached).
        if (response.status < 200 || response.status > 299) {
          await response.body?.cancel().catch(() => {});
          receipt.error = `GOV_API_HTTP_${response.status}`;
          return { error: receipt.error };
        }
        let bytes: Buffer;
        try { bytes = (await readCapped(response, 5 * 1024 * 1024)).bytes; }
        catch (error) { receipt.error = (error as Error).message === "RESPONSE_TOO_LARGE" ? "GOV_API_RESPONSE_TOO_LARGE" : "GOV_API_NETWORK_ERROR"; return { error: receipt.error }; }
        const text = bytes.toString("utf8");
        receipt.bytes = bytes.length;
        receipt.sha256 = createHash("sha256").update(bytes).digest("hex");
        const parsed = parseGovResponse(text);
        if ("error" in parsed) {
          // 22: daily limit, 20/30/31/32: key not allowed or expired. Stop every further call.
          if (/_(?:20|22|30|31|32)$/.test(parsed.error)) this.stopped = parsed.error;
          receipt.error = parsed.error;
          return parsed;
        }
        await mkdir(join(this.options.cacheDir, api), { recursive: true });
        await atomicWrite(path, JSON.stringify({ text, receipt }) + "\n");
        return { ...parsed, receipt, cached: false, text };
      } catch (error) {
        receipt.error = error instanceof Error ? error.message.slice(0, 80) : "GOV_API_NETWORK_ERROR";
        return { error: receipt.error };
      } finally { receipt.ms = Date.now() - started; this.last = Date.now(); }
    });
    this.chain = run.catch(() => {});
    return run;
  }

  /** FSC company for a candidate: up to two name searches, the first that matches wins. `text` is the matching response (for proofs). */
  async fsc(prefix: string, names: string[], requestedBusinessNumber?: string): Promise<{ match: FscMatch; receipts: Receipt[]; terms: string[]; error?: string; text?: string }> {
    const receipts: Receipt[] = [];
    const terms = fscSearchTerms(names);
    if (requestedBusinessNumber !== undefined && (!/^\d{10}$/.test(requestedBusinessNumber) || !requestedBusinessNumber.startsWith(prefix)))
      return { match: { status: "no-match", rows: 0, companies: 0 }, receipts, terms, error: "BZNO_INVALID" };
    let last: FscMatch = { status: "no-match", rows: 0, companies: 0 };
    for (const term of terms) {
      const result = await this.query("fsc", { pageNo: "1", numOfRows: "100", resultType: "json", corpNm: term });
      if ("error" in result) return { match: last, receipts, terms, error: result.error };
      receipts.push(result.receipt);
      const rows = result.items as unknown as FscRow[];
      if (requestedBusinessNumber === undefined) last = decideFsc(rows, prefix, names);
      else {
        const selected = requestedFscRow(rows, prefix, names, requestedBusinessNumber);
        const hasExactNumber = rows.some(row => String(row?.bzno ?? "").replace(/\D/g, "") === requestedBusinessNumber);
        last = selected ? decideFsc([selected], prefix, names)
          : { status: hasExactNumber ? "ambiguous" : "no-match", rows: rows.length, companies: hasExactNumber ? 1 : 0 };
      }
      if (last.status === "matched") return { match: last, receipts, terms, text: result.text };
    }
    return { match: last, receipts, terms };
  }

  async ftc(bzno: string): Promise<{ rows: FtcRow[]; receipts: Receipt[]; error?: string; text?: string }> {
    if (!/^\d{10}$/.test(bzno)) return { rows: [], receipts: [], error: "BZNO_INVALID" };
    const result = await this.query("ftc", { pageNo: "1", numOfRows: "20", resultType: "json", brno: bzno });
    if ("error" in result) return { rows: [], receipts: [], error: result.error };
    return { rows: result.items as unknown as FtcRow[], receipts: [result.receipt], text: result.text };
  }
}

/** New company admission binds all FSC facts to one exact-number row, never a crno group. Legacy decideFsc replay is unchanged. */
export function strictFscRow(rows: readonly FscRow[], prefix: string, names: readonly string[]): FscRow | null {
  const wanted = keySet([...names]);
  const hits = rows.filter(row => row && typeof row === "object" && /^\d{10}$/.test(String(row.bzno ?? "").replace(/\D/g, ""))
    && String(row.bzno).replace(/\D/g, "").startsWith(prefix)
    && typeof row.corpNm === "string" && [...keySet([row.corpNm], {division:false,english:row.corpEnsnNm ? [row.corpEnsnNm] : []})].some(key => wanted.has(key)));
  if (new Set(hits.map(row => String(row.bzno).replace(/\D/g, ""))).size !== 1) return null;
  // Do not borrow an older row's homepage/industry/address. A complete older row may be selected,
  // but every fact and date is from that single row and a conflicting latest row is not hidden.
  const sorted = [...hits].sort((a,b) => String(b.lastOpegDt).localeCompare(String(a.lastOpegDt)));
  const top = sorted[0];
  if (!top || sorted.some(row => row.lastOpegDt === top.lastOpegDt && JSON.stringify(row) !== JSON.stringify(top))) return null;
  return {...top,bzno:String(top.bzno).replace(/\D/g, "")};
}

/** Explicit company requests bind the latest official snapshot to the requested full number.
 * Historical crno differences do not widen identity; conflicting latest rows still fail closed.
 * Both the live client and company-only proof replay use this selector. */
export function requestedFscRow(rows: readonly FscRow[], prefix: string, names: readonly string[], businessNumber: unknown): FscRow | null {
  if (typeof businessNumber !== "string" || !/^\d{10}$/.test(businessNumber) || !businessNumber.startsWith(prefix)) return null;
  // Select the latest exact-number snapshot before checking the name. Otherwise a
  // renamed or conflicting latest company could silently fall back to an old row.
  const exact = rows.filter(row => String(row?.bzno ?? "").replace(/\D/g, "") === businessNumber)
    .sort((a, b) => String(b.lastOpegDt).localeCompare(String(a.lastOpegDt)));
  const latest = exact[0];
  if (!latest || exact.some(row => row.lastOpegDt === latest.lastOpegDt && JSON.stringify(row) !== JSON.stringify(latest))) return null;
  return strictFscRow([latest], prefix, names);
}
