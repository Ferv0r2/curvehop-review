/**
 * Polite fetching for discovery. Every request goes through one queue per
 * host: one request at a time, at least `spacingMs` between them, the
 * collector's user agent, a timeout and a size cap enforced while streaming.
 *
 * - Hosts are canonical before any check (lowercase, punycode, no trailing
 *   dot, no credentials, default ports only), so "www.wanted.co.kr." is the
 *   platform "www.wanted.co.kr" and shares its host state.
 * - Job platforms are never requested, not even through a redirect.
 * - robots.txt is consulted for every hop (RFC 9309: other 4xx means no rules,
 *   5xx or an unreachable file means stay out). Only the public job-board
 *   APIs in ROBOTS_EXEMPT skip it, and only while a hop stays on them.
 * - 429 ends the host as soon as the status line arrives; 401/403 end it as
 *   forbidden; a bot-protection page ends it as blocked. Nothing retries
 *   around them in the same run.
 * - Every receipt says which robots.txt (hash, time) allowed it.
 * - The real network goes through pinned-fetch.ts: the socket connects only to
 *   an address vetted as public at connect time (no private, loopback,
 *   link-local, CGNAT, ULA or multicast; a lookup failure is a refusal).
 * - A robots.txt whose body cannot be read whole leaves its origin unvisited.
 */
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { createPinnedFetch, isPrivateAddress } from "./pinned-fetch";

export { isPrivateAddress };
import { isJobPlatformUrl } from "../job-platforms";
import { robotsAllows } from "../greeting";

export const COLLECTOR_UA = "NextstepJobBoard/0.1";

export type RobotsVerdict = {
  /** allowed: rules allow the path; no-rules: robots.txt answered 4xx; exempt-api: an allowlisted public API; robots-file: this is robots.txt itself. */
  state: "allowed" | "no-rules" | "exempt-api" | "robots-file";
  robotsUrl: string | null;
  sha256: string | null;
  checkedAt: string | null;
};

export type Receipt = {
  url: string;
  status: number | null;
  sha256: string | null;
  bytes: number;
  contentType: string | null;
  fetchedAt: string;
  ms: number;
  truncated?: boolean;
  location?: string;
  error?: string;
  robots?: RobotsVerdict;
};

export type Outcome =
  | "ok" | "http-error" | "robots-disallowed" | "robots-unreachable" | "robots-unreadable" | "platform" | "blocked" | "forbidden" | "rate-limited"
  | "host-ended" | "network-error" | "invalid-url" | "private-address" | "too-many-redirects" | "not-text"
  /** Not fetched: the company already refused this run (see CompanySession). */
  | "refused";

export type Page = { outcome: Outcome; url: string; finalUrl: string; status: number | null; text: string; receipts: Receipt[]; detail?: string; robots?: RobotsVerdict;
  /** Where a robots refusal was decided when that is another host (a robots.txt redirect): the refusal belongs there. */
  decidedBy?: { host: string; url: string };
  /** The final response's bytes as received (an "ok" page only): what its receipt's sha256 hashes, kept for proofs (phase 3). */
  body?: Buffer };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type HostState = { chain: Promise<unknown>; last: number; ended: string | null; requests: number };
/** A robots decision and every receipt it was made from (each redirect hop, the final one last). */
type RobotsState = ({ kind: "rules"; text: string } | { kind: "allow-all" } | { kind: "disallow-all"; reason: Outcome }) & {
  receipts: Receipt[];
  /** The host whose answer decided it (after robots.txt redirects), and that answer's URL. */
  decidedBy: { host: string; url: string };
};

// Challenge and block pages from common bot-protection services. Seeing one
// ends the host: discovery reads only what a site serves without a challenge.
const BLOCK_MARKERS = /cf-chl-|challenge-platform|<title>\s*(?:Just a moment|Attention Required|Vercel Security Checkpoint)|_Incapsula_Resource|px-captcha|captcha-delivery\.com|awswaf|<title>\s*Access Denied\s*<\/title>|Request unsuccessful\. Incapsula/i;

export function looksBlocked(status: number | null, text: string) {
  return (status === 401 || status === 403 || status === 429 || status === 503 || status === 202 || status === 200) && text.length < 200_000 && BLOCK_MARKERS.test(text);
}

/**
 * The canonical public http(s) URL, or null: no credentials, default ports
 * only, no IP literals or local names. The WHATWG parser lowercases and
 * punycodes the host; a trailing root dot is removed here.
 */
/** URLs longer than this are never fetched or followed (untrusted sitemaps and links can carry megabytes). */
export const MAX_URL_LENGTH = 2048;

export function safeUrl(raw: string, base?: string): URL | null {
  if (raw.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(raw, base);
    if (url.href.length > MAX_URL_LENGTH) return null;
    // Userinfo ("name:…@host") shows in the parsed href's authority; such URLs and explicit ports are refused.
    if (!["https:", "http:"].includes(url.protocol) || /^https?:\/\/[^/?#]*@/i.test(url.href) || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/\.+$/, "");
    if (!host || host.startsWith(".") || host.includes("..")) return null;
    if (!host.includes(".") || isIP(host.replace(/^\[|\]$/g, "")) || /^[\d.]+$/.test(host) || host.includes(":") || host.includes("[")) return null;
    if (/(?:^|\.)(?:localhost|local|internal|lan|home|corp|localdomain|test|invalid|example)$/.test(host)) return null;
    url.hostname = host;
    url.hash = "";
    return url;
  } catch { return null; }
}

/** Platform check on the canonical URL (a trailing dot or capitals do not hide a platform). */
export function isPlatformUrl(raw: string, base?: string): boolean {
  const url = safeUrl(raw, base);
  if (url) return isJobPlatformUrl(url.href);
  try { const loose = new URL(raw, base); loose.hostname = loose.hostname.replace(/\.+$/, ""); return isJobPlatformUrl(loose.href); } catch { return false; }
}

/** Public job-board APIs that answer programs by design. robots.txt is not consulted while a hop stays on these. */
// The public-data and DART APIs are called by their own clients (homepage-sources.ts, dart.ts), never through
// PoliteClient, so they are not listed: a company page redirecting there gets no exemption.
export const ROBOTS_EXEMPT: readonly { origin: string; path: string }[] = [
  { origin: "https://boards-api.greenhouse.io", path: "/v1/boards/" },
  { origin: "https://api.lever.co", path: "/v0/postings/" },
  { origin: "https://api.ashbyhq.com", path: "/posting-api/" },
];
/**
 * Whether a hop may skip robots.txt. Paths with encoded dots or slashes,
 * backslashes, dot segments or doubled slashes never qualify, so a path that a
 * server might normalize out of the API prefix cannot borrow the exemption.
 */
export function isRobotsExempt(url: URL) {
  const path = url.pathname;
  if (/%2e|%2f|%5c/i.test(url.href) || /\\/.test(url.href) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path) || /\/\//.test(path)) return false;
  return ROBOTS_EXEMPT.some(rule => url.origin === rule.origin && path.startsWith(rule.path));
}

/** A response body read with a byte cap, stopping and cancelling the stream on overflow. */
export async function readCapped(response: Response, maxBytes: number, onOverflow: "throw" | "truncate" = "throw"): Promise<{ bytes: Buffer; truncated: boolean }> {
  if (!response.body) return { bytes: Buffer.alloc(0), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > maxBytes) {
        if (onOverflow === "throw") throw new Error("RESPONSE_TOO_LARGE");
        chunks.push(value.subarray(0, maxBytes - size)); size = maxBytes; truncated = true; break;
      }
      size += value.byteLength; chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return { bytes: Buffer.concat(chunks), truncated };
}

/** A body's text the way discovery reads it: the header charset, else a meta charset, else UTF-8. The data gate decodes archived bodies with it too. */
export function decodeBody(contentType: string | null, bytes: Uint8Array) {
  return charsetOf(contentType, bytes).decode(bytes);
}

function charsetOf(contentType: string | null, head: Uint8Array) {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const sniff = new TextDecoder("latin1").decode(head.subarray(0, 4096));
  const fromMeta = sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const label = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try { return new TextDecoder(label === "ks_c_5601-1987" ? "euc-kr" : label); } catch { return new TextDecoder("utf-8"); }
}

export class PoliteClient {
  private hosts = new Map<string, HostState>();
  private robotsCache = new Map<string, Promise<RobotsState>>();
  readonly endedHosts = new Map<string, string>();
  requests = 0;
  constructor(private readonly options: {
    fetcher?: Fetcher;
    spacingMs?: number;
    timeoutMs?: number;
    maxBytes?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {}) {}

  private pinned: Fetcher | null = null;
  private get fetcher(): Fetcher {
    if (this.options.fetcher) return this.options.fetcher;
    if (process.env.NODE_TEST_CONTEXT) throw new Error("NETWORK_DISABLED_IN_TEST");
    return (this.pinned ??= createPinnedFetch());
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  private sleep(ms: number) { return this.options.sleep?.(ms) ?? new Promise(resolve => setTimeout(resolve, ms)); }
  private state(host: string) {
    let state = this.hosts.get(host);
    if (!state) { state = { chain: Promise.resolve(), last: -Infinity, ended: null, requests: 0 }; this.hosts.set(host, state); }
    return state;
  }
  hostEnded(host: string) { return this.hosts.get(host)?.ended ?? null; }
  /** Ends a host for the run. A later bot-protection finding may replace a status-line reason. */
  endHost(host: string, reason: string, replace = false) {
    const state = this.state(host);
    if (!state.ended || replace) { state.ended = reason; this.endedHosts.set(host, reason); }
  }
  /** Runs `task` when the host is free and the spacing has passed; one at a time per host. */
  private schedule<T>(host: string, task: () => Promise<T>): Promise<T> {
    const state = this.state(host);
    const run = state.chain.then(async () => {
      const wait = state.last + (this.options.spacingMs ?? 1000) - this.now();
      if (wait > 0) await this.sleep(wait);
      try { return await task(); } finally { state.last = this.now(); state.requests++; }
    });
    state.chain = run.catch(() => {});
    return run;
  }

  /** One request, no redirect following. 429/401/403 end the host and are returned without reading the body. */
  private async once(url: URL, accept: string, maxBytes: number, timeoutMs?: number, robots?: RobotsVerdict, deadline?: number): Promise<{ receipt: Receipt; text: string; location: string | null; bytes?: Buffer }> {
    const host = url.hostname;
    return this.schedule(host, async () => {
      const startedAt = this.now(), fetchedAt = new Date().toISOString();
      const receipt: Receipt = { url: url.href, status: null, sha256: null, bytes: 0, contentType: null, fetchedAt, ms: 0, ...(robots ? { robots } : {}) };
      if (this.state(host).ended) { receipt.error = "host-ended"; return { receipt, text: "", location: null }; }
      if (deadline !== undefined && Date.now() >= deadline) { receipt.error = "timeout"; return { receipt, text: "", location: null }; }
      this.requests++;
      try {
        const response = await this.fetcher(url.href, {
          headers: { "User-Agent": COLLECTOR_UA, Accept: accept, "Accept-Language": "ko,en;q=0.8" },
          redirect: "manual",
          signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs ?? this.options.timeoutMs ?? 20_000, deadline === undefined ? Infinity : deadline - Date.now()))),
        });
        receipt.status = response.status;
        receipt.contentType = response.headers.get("content-type");
        if (response.status === 429 || response.status === 401 || response.status === 403) {
          this.endHost(host, response.status === 429 ? "rate-limited" : "forbidden");
          await response.body?.cancel().catch(() => {});
          return { receipt, text: "", location: null };
        }
        const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
        if (location) receipt.location = location;
        let bytes: Buffer = Buffer.alloc(0);
        if (response.body && !location) {
          try {
            const read = await readCapped(response, maxBytes, "truncate");
            bytes = read.bytes;
            if (read.truncated) receipt.truncated = true;
          } catch (error) {
            // The status arrived but the body did not: the response is unusable, not empty.
            receipt.error = `body-read-failed: ${error instanceof Error ? ((error as NodeJS.ErrnoException).code ?? error.message).slice(0, 80) : "error"}`;
            return { receipt, text: "", location: null };
          }
        } else await response.body?.cancel().catch(() => {});
        receipt.bytes = bytes.length;
        receipt.sha256 = createHash("sha256").update(bytes).digest("hex");
        const text = charsetOf(receipt.contentType, bytes).decode(bytes);
        if (looksBlocked(response.status, text)) this.endHost(host, "blocked", true);
        return { receipt, text, location, bytes };
      } catch (error) {
        const code = error instanceof Error ? (error.name === "TimeoutError" ? "timeout" : (error as NodeJS.ErrnoException).code ?? (error.cause as { code?: string })?.code ?? error.message.slice(0, 120)) : "network-error";
        if (code === "EPRIVATEADDR") { receipt.error = "private-address"; this.endHost(host, "private-address"); }
        else receipt.error = code;
        return { receipt, text: "", location: null };
      } finally { receipt.ms = this.now() - startedAt; }
    });
  }

  /** robots.txt of an origin, fetched once per run; the state carries every receipt it was decided from. */
  private robotsFor(origin: string, allowedHost?: string, timeoutMs?: number, deadline?: number, allowedOrigin?: string, noRedirects = false): Promise<RobotsState> {
    const cacheKey = `${allowedHost ? `${origin}|host=${allowedHost}` : origin}${allowedOrigin ? `|origin=${allowedOrigin}` : ""}${noRedirects ? "|noRedirects" : ""}`;
    let cached = this.robotsCache.get(cacheKey);
    if (!cached) {
      cached = (async (): Promise<RobotsState> => {
        let url = safeUrl("/robots.txt", origin);
        const receipts: Receipt[] = [];
        const verdict: RobotsVerdict = { state: "robots-file", robotsUrl: null, sha256: null, checkedAt: null };
        let decidedBy = { host: url?.hostname ?? "", url: url?.href ?? origin };
        const deny = (reason: Outcome): RobotsState => ({ kind: "disallow-all", reason, receipts, decidedBy });
        for (let hop = 0; url && hop < 5; hop++) {
          decidedBy = { host: url.hostname, url: url.href };
          if ((allowedHost && url.hostname !== allowedHost) || (allowedOrigin && url.origin !== allowedOrigin)) return deny("invalid-url");
          if (isJobPlatformUrl(url.href)) return deny("platform");
          const { receipt, text, location } = await this.once(url, "text/plain,*/*;q=0.5", 512 * 1024, timeoutMs, verdict, deadline);
          receipts.push(receipt);
          // A hop to a host this run already ended carries that host's reason (forbidden, rate-limited, blocked, …).
          const ended = this.hostEnded(url.hostname);
          if (receipt.error === "host-ended" || receipt.error === "private-address") return deny((ended ?? receipt.error) as Outcome);
          if (ended === "blocked" || ended === "rate-limited" || ended === "forbidden") return deny(ended as Outcome);
          // Unreachable host (DNS, TLS, timeout): the page is unreachable too; nothing is fetched.
          if (receipt.status === null) return deny("network-error");
          // A robots.txt that could not be read whole is not "no rules": the origin stays unvisited this run.
          if (receipt.error || receipt.truncated) return deny("robots-unreadable");
          if (location) { if (noRedirects) return deny("invalid-url"); url = safeUrl(location, url.href); continue; }
          if (receipt.status >= 500) return deny("robots-unreachable");
          if (receipt.status >= 400) return { kind: "allow-all", receipts, decidedBy };
          if (receipt.status >= 200 && receipt.status < 300) return { kind: "rules", text, receipts, decidedBy };
          return deny("robots-unreachable");
        }
        return deny("robots-unreachable");
      })();
      this.robotsCache.set(cacheKey, cached);
    }
    return cached;
  }

  /** robots.txt text of an origin, when it has one; fetched once per run. Its receipts are returned to every caller. */
  async robotsText(origin: string): Promise<RobotsText> {
    const state = await this.robotsFor(origin);
    return { text: state.kind === "rules" ? state.text : null, state: state.kind, receipts: [...state.receipts], decidedBy: state.decidedBy, ...(state.kind === "disallow-all" ? { reason: state.reason } : {}) };
  }

  /**
   * GET with redirects followed by hand: every hop is canonicalized and
   * checked for platforms, private addresses and robots.txt of the hop's
   * origin. `robots: false` asks for the API exemption, which is granted only
   * to hops on ROBOTS_EXEMPT.
   */
  async get(raw: string, options: { robots: boolean; accept?: string; maxBytes?: number; timeoutMs?: number; binary?: "image/png"; allowedHost?: string; allowedOrigin?: string; noRedirects?: boolean; deadline?: number } = { robots: true }): Promise<Page> {
    const receipts: Receipt[] = [];
    const accept = options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5";
    let url = safeUrl(raw);
    const first = url?.href ?? raw;
    let verdict: RobotsVerdict | undefined;
    const done = (outcome: Outcome, status: number | null, text = "", detail?: string, body?: Buffer): Page =>
      ({ outcome, url: first, finalUrl: url?.href ?? raw, status, text, receipts, ...(detail ? { detail } : {}), ...(verdict ? { robots: verdict } : {}), ...(body ? { body } : {}) });
    if (!url && isPlatformUrl(raw)) return done("platform", null);
    for (let hop = 0; hop < 6; hop++) {
      if (!url || (options.allowedHost && url.hostname !== options.allowedHost) || (options.allowedOrigin && url.origin !== options.allowedOrigin)) return done("invalid-url", null);
      if (isJobPlatformUrl(url.href)) return done("platform", null);
      const ended = this.hostEnded(url.hostname);
      if (ended) return done("host-ended", null, "", ended);
      if (!options.robots && isRobotsExempt(url)) verdict = { state: "exempt-api", robotsUrl: null, sha256: null, checkedAt: null };
      else {
        const robots = await this.robotsFor(url.origin, options.allowedHost, options.timeoutMs, options.deadline, options.allowedOrigin, options.noRedirects);
        for (const receipt of robots.receipts) if (!receipts.includes(receipt)) receipts.push(receipt);
        const decisive = robots.receipts.at(-1) ?? null;
        verdict = { state: robots.kind === "rules" ? "allowed" : "no-rules", robotsUrl: decisive?.url ?? null, sha256: decisive?.sha256 ?? null, checkedAt: decisive?.fetchedAt ?? null };
        if (robots.kind === "disallow-all") {
          verdict = undefined;
          const page = done(robots.reason, null, "", robots.reason === "network-error" || robots.reason === "robots-unreadable" ? decisive?.error : undefined);
          return robots.decidedBy.host && robots.decidedBy.host !== url.hostname ? { ...page, decidedBy: robots.decidedBy } : page;
        }
        if (robots.kind === "rules" && !robotsAllows(robots.text, url.pathname + url.search)) return done("robots-disallowed", null);
      }
      const { receipt, text, location, bytes } = await this.once(url, accept, options.maxBytes ?? 3 * 1024 * 1024, options.timeoutMs, verdict, options.deadline);
      receipts.push(receipt);
      if (receipt.error === "host-ended") return done("host-ended", null, "", this.hostEnded(url.hostname) ?? undefined);
      if (receipt.error === "private-address") return done("private-address", null);
      if (receipt.status === null) return done("network-error", null, "", receipt.error);
      if (receipt.error) return done("network-error", receipt.status, "", receipt.error); // the body did not arrive
      const now = this.hostEnded(url.hostname);
      if (now === "blocked") return done("blocked", receipt.status);
      if (now === "rate-limited") return done("rate-limited", receipt.status);
      if (now === "forbidden") return done("forbidden", receipt.status);
      if (location) { if (options.noRedirects) return done("invalid-url", receipt.status); url = safeUrl(location, url.href); if (!url && isPlatformUrl(location, receipt.url)) return done("platform", null); continue; }
      if (receipt.status >= 400) return done("http-error", receipt.status);
      if (options.binary) {
        if (receipt.contentType?.split(";")[0].trim().toLowerCase() !== options.binary) return done("not-text", receipt.status);
      } else if (receipt.contentType && !/text|html|xml|json|javascript/i.test(receipt.contentType)) return done("not-text", receipt.status);
      return done("ok", receipt.status, text, undefined, bytes);
    }
    return done("too-many-redirects", null);
  }

  hostRequests() { return Object.fromEntries([...this.hosts].map(([host, state]) => [host, state.requests])); }
}

/** What kind of failure an outcome is, for reporting: dns, tls, timeout, connection, http-<status>, … */
export function errorClass(page: Pick<Page, "outcome" | "status" | "detail">): string {
  if (page.outcome === "http-error") return `http-${page.status ?? "?"}`;
  if (page.outcome !== "network-error") return page.outcome;
  const detail = page.detail ?? "";
  if (/ENOTFOUND|EAI_AGAIN|ENODATA/i.test(detail)) return "dns";
  if (/CERT|TLS|SSL|UNABLE_TO_VERIFY|SELF_SIGNED|DEPTH_ZERO|ERR_SSL|EPROTO/i.test(detail)) return "tls";
  if (/timeout|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT/i.test(detail)) return "timeout";
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|UND_ERR_SOCKET|EPIPE/i.test(detail)) return "connection";
  return "network";
}

export type RobotsText = { text: string | null; state: "rules" | "allow-all" | "disallow-all"; receipts: Receipt[]; reason?: Outcome; decidedBy?: { host: string; url: string } };

/** Why a company is left alone for the rest of the run. */
export type RefusalReason = "forbidden" | "rate-limited" | "robots-disallowed" | "blocked" | "robots-unreadable";
export type Refusal = { host: string; reason: RefusalReason; url: string; at: string };
const REFUSALS = new Set<string>(["forbidden", "rate-limited", "robots-disallowed", "blocked", "robots-unreadable"]);
/**
 * Public job-board APIs serve every company: a 429 from them on an exempt API
 * path is the API's rate limit, not one company's refusal. Anything else from
 * those hosts (401/403, a block page, a robots refusal, any non-API path)
 * refuses the company like any other host.
 */
export function sharedRateLimit(url: string, reason: string) {
  const parsed = safeUrl(url);
  return reason === "rate-limited" && !!parsed && isRobotsExempt(parsed);
}

/** What a company-scoped step fetches through: a CompanySession, or a PoliteClient (wrapped into one per call). */
export type CompanyClient = Pick<CompanySession, "get" | "robotsText" | "refused">;

/**
 * One company's view of the network for one run. The first refusal from any
 * of the company's hosts (403/401, 429, a bot-protection page, robots.txt
 * disallowing the path, an unreadable robots.txt) is recorded and every later
 * request for the company returns "refused" without touching the network.
 * Network errors (DNS, TLS, timeout) are not refusals. Every company-scoped
 * step takes this one object, so the stop holds on every path.
 */
export class CompanySession {
  refused: Refusal | null = null;
  /**
   * With `keepPages`, every "ok" page this company fetched, bodies included, until `release()`: the
   * registration proof (proof.ts) is rebuilt from exactly these responses. Off by default (memory).
   */
  readonly pages: Page[] = [];
  constructor(readonly client: PoliteClient, readonly options: { keepPages?: boolean } = {}) {}
  release() { this.pages.length = 0; }

  /** Records the first refusal. `url` is where it happened (the robots host after a robots redirect). */
  private note(url: string, outcome: string, detail?: string) {
    if (this.refused) return;
    const reason = outcome === "host-ended" ? detail ?? "" : outcome;
    if (!REFUSALS.has(reason) || sharedRateLimit(url, reason)) return;
    const host = safeUrl(url)?.hostname ?? "";
    this.refused = { host, reason: reason as RefusalReason, url, at: new Date().toISOString() };
  }

  async get(raw: string, options: Parameters<PoliteClient["get"]>[1] = { robots: true }): Promise<Page> {
    if (this.refused) return { outcome: "refused", url: raw, finalUrl: raw, status: null, text: "", receipts: [], detail: this.refused.reason };
    const page = await this.client.get(raw, options);
    this.note(page.decidedBy?.url ?? (page.finalUrl || raw), page.outcome, page.detail);
    if (this.options.keepPages && page.outcome === "ok" && page.body) this.pages.push(page);
    return page;
  }

  async robotsText(origin: string): Promise<RobotsText> {
    if (this.refused) return { text: null, state: "disallow-all", receipts: [], reason: "refused" };
    const robots = await this.client.robotsText(origin);
    if (robots.reason) this.note(robots.decidedBy?.url ?? `${origin}/robots.txt`, robots.reason);
    return robots;
  }
}

/** The session a company-scoped step works in: the given one, or a new one around a bare client. */
export function sessionOf(client: PoliteClient | CompanyClient): CompanyClient {
  return client instanceof PoliteClient ? new CompanySession(client) : client;
}
