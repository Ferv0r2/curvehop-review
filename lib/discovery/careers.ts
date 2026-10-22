/**
 * Pure helpers for finding a company's careers page and naming the system
 * behind it. No network here: links, URLs and HTML in, classifications out.
 */
import { asciiLower } from "../ascii";
import { anchors, baseHref, elements, scriptBlocks, xmlValues } from "./html";
import { MAX_URL_LENGTH, isPlatformUrl as isJobPlatformUrl, safeUrl } from "./http";

export type Provider =
  | "greeting" | "ninehire" | "recruiter" | "roundhr" | "greenhouse" | "lever" | "workday" | "ashby"
  | "other-ats" | "custom" | "none-found" | "blocked" | "error";
export const ATS_PROVIDERS = ["greeting", "ninehire", "recruiter", "roundhr", "greenhouse", "lever", "workday", "ashby", "other-ats"] as const;

export type Board = { provider: Provider; name?: string; board: string | null; url: string };

const first = (url: URL) => url.pathname.split("/").filter(Boolean)[0] ?? null;
// Known applicant tracking systems by host. Board-less marketing hosts
// (greetinghr.com, ninehire.com, …) are not boards and are not listed.
const KNOWN: { provider: Provider; name?: string; host: RegExp; path?: RegExp; board: (url: URL) => string | null }[] = [
  { provider: "greeting", host: /\.career\.greetinghr\.com$/, board: url => url.hostname.split(".")[0] },
  { provider: "ninehire", host: /\.ninehire\.site$/, board: url => url.hostname.split(".")[0] },
  { provider: "recruiter", host: /^(?!www\.)[a-z0-9-]+\.recruiter\.co\.kr$/, board: url => url.hostname.split(".")[0] },
  { provider: "roundhr", host: /\.recruit\.roundhr\.com$/, board: url => url.hostname.split(".")[0] },
  { provider: "greenhouse", host: /^(?:job-)?boards(?:\.eu)?\.greenhouse\.io$/, board: url => url.searchParams.get("for") ?? (first(url) === "embed" ? null : first(url)) },
  { provider: "lever", host: /^jobs(?:\.eu)?\.lever\.co$/, board: first },
  { provider: "workday", host: /\.myworkdayjobs\.com$/, board: url => `${url.hostname.split(".")[0]}/${url.pathname.split("/").filter(s => !/^[a-z]{2}-[A-Z]{2}$/.test(s))[1] ?? ""}`.replace(/\/$/, "") },
  { provider: "ashby", host: /^jobs\.ashbyhq\.com$/, board: first },
  { provider: "other-ats", name: "flex", host: /^(?!www\.)[a-z0-9-]+\.careers\.team$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "workable", host: /^apply\.workable\.com$/, board: first },
  { provider: "other-ats", name: "smartrecruiters", host: /^(?:jobs|careers)\.smartrecruiters\.com$/, board: first },
  { provider: "other-ats", name: "recruitee", host: /\.recruitee\.com$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "teamtailor", host: /\.teamtailor\.com$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "bamboohr", host: /\.bamboohr\.com$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "breezy", host: /\.breezy\.hr$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "jobvite", host: /^jobs\.jobvite\.com$/, board: first },
  { provider: "other-ats", name: "icims", host: /\.icims\.com$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "successfactors", host: /(?:successfactors\.(?:com|eu)|\.sapsf\.(?:com|eu))$/, board: url => url.searchParams.get("company") },
  { provider: "other-ats", name: "taleo", host: /\.taleo\.net$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "oracle-hcm", host: /\.oraclecloud\.com$/, path: /\/hcmUI\/CandidateExperience/i, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "personio", host: /\.jobs\.personio\.(?:de|com)$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "join", host: /^join\.com$/, board: url => url.pathname.split("/").filter(Boolean)[1] ?? null },
  { provider: "other-ats", name: "zoho-recruit", host: /\.zohorecruit\.(?:com|eu|in)$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "rippling", host: /^ats\.rippling\.com$/, board: first },
  { provider: "other-ats", name: "applyin", host: /\.applyin\.co\.kr$/, board: url => url.hostname.split(".")[0] },
  { provider: "other-ats", name: "notion", host: /(?:\.notion\.site|^(?:www\.)?notion\.so|\.oopy\.io)$/, board: url => url.hostname.split(".")[0] },
];

/** The ATS a URL belongs to, from its host alone; null for company sites and unknown hosts. */
export function classifyUrl(raw: string): Board | null {
  const url = safeUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (/^(?:login|signin|sso|auth)[.-]/.test(host)) return null;
  for (const rule of KNOWN)
    if (rule.host.test(host) && (!rule.path || rule.path.test(url.pathname))) return { provider: rule.provider, ...(rule.name ? { name: rule.name } : {}), board: rule.board(url), url: url.href };
  return null;
}

const SECOND_LEVEL = new Set(["co", "or", "ne", "go", "ac", "re", "pe", "com", "net", "org", "gov", "edu"]);
/** example.co.kr, example.com: the part a company registers. */
export function registrableDomain(host: string) {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length >= 3 && labels.at(-1)!.length === 2 && SECOND_LEVEL.has(labels.at(-2)!)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}
export const sameSite = (a: string, b: string) => registrableDomain(a) === registrableDomain(b);
/** Whether a canonical host is the domain itself or a subdomain of it (never "domain.evil.com"). */
export const onDomain = (host: string, domain: string) => {
  const h = host.toLowerCase().replace(/\.+$/, ""), d = domain.toLowerCase().replace(/\.+$/, "");
  return !!d && (h === d || h.endsWith(`.${d}`));
};

export type Link = { url: string; text: string };
const decode = (text: string) => text
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d{1,7});/g, (whole, n) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : whole));
const squash = (text: string) => decode(text).replace(/\s+/g, " ").trim();

const MAX_LINKS = 5000;
/**
 * Anchor and area links (the first `limit`, 5,000 by default), resolved and de-duplicated. Images' alt
 * and aria labels count as text. One linear pass (html.ts). The registration proof counts boards over
 * every anchor (`limit: Infinity`): a hub cannot hide a second board past the cap.
 */
export function extractLinks(html: string, baseUrl: string, limit = MAX_LINKS): Link[] {
  // URLs longer than this are dropped: a huge <base href> times thousands of links would otherwise fill the heap.
  const base = baseHref(html);
  const baseText = base && base.length <= MAX_URL_LENGTH ? decode(base.trim()) : "";
  const resolvedBase = (baseText && safeUrl(baseText, baseUrl)?.href) || baseUrl;
  const links = new Map<string, Link>();
  const resolved = new Map<string, URL | null>(); // the same href is resolved once
  // A careers search needs the first few thousand links; a page with more is not read further.
  for (const anchor of Number.isFinite(limit) ? anchors(html).slice(0, limit) : anchors(html)) {
    if (anchor.href.length > MAX_URL_LENGTH) continue;
    const raw = decode(anchor.href.trim());
    if (!raw || /^(?:javascript:|mailto:|tel:|#|data:)/i.test(raw)) continue;
    let url = resolved.get(raw);
    if (url === undefined) {
      const candidate = safeUrl(raw, resolvedBase);
      url = candidate && candidate.href.length <= MAX_URL_LENGTH ? candidate : null;
      resolved.set(raw, url);
    }
    if (!url) continue;
    const label = [squash(anchor.text), ...anchor.labels.map(decode)].filter(Boolean).join(" ").slice(0, 200);
    const previous = links.get(url.href);
    if (!previous || previous.text.length < label.length) links.set(url.href, { url: url.href, text: label });
  }
  return [...links.values()];
}

const TEXT_WORDS = /채용|인재\s*영입|인재\s*채용|커리어|입사\s*지원|채용\s*공고|함께\s*(?:할|일할)\s*(?:동료|사람|분)|recruit|careers?\b|\bjobs?\b|hiring|join\s+(?:us|our\s+team)|work\s+with\s+us|open\s+positions?/i;
const PATH_WORDS = /^(?:careers?|recruit(?:ment|ing|s)?|jobs?|hiring|joinus|join-us|join_us|talent|채용|인재영입|apply)$/i;
const HOST_WORDS = /^(?:careers?|recruit(?:ment)?|jobs|hiring|talent|join)(?:[-.]|$)/i;
const NOT_CAREERS = /log-?in|sign-?in|sign-?up|register|member|회원\s*가입|newsletter|\/join\.(?:do|php|jsp|aspx?)|joinform|\/user\/join|cart|privacy|terms/i;
const NOT_CAREERS_TEXT = /회원\s*가입|로그인|sign\s*up|log\s*in|뉴스레터|newsletter|개인정보/i;

export type ScoredLink = Link & { score: number; board: Board | null };
/** Links that lead to a careers page or an ATS, best first. Platform links are returned separately and never followed. */
export function careersLinks(links: Link[], pageUrl: string): { ranked: ScoredLink[]; platform: string[] } {
  const host = new URL(pageUrl).hostname;
  const ranked: ScoredLink[] = [];
  const platform: string[] = [];
  for (const link of links) {
    if (isJobPlatformUrl(link.url)) { if (TEXT_WORDS.test(link.text) || /recruit|career|job/i.test(link.url)) platform.push(link.url); continue; }
    const url = new URL(link.url);
    if (/\.(?:pdf|hwpx?|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|svg|webp|mp4)$/i.test(url.pathname)) continue;
    const board = classifyUrl(link.url);
    const segments = url.pathname.split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
    const pathHit = segments.some(s => PATH_WORDS.test(s.replace(/\.(?:html?|do|php|jsp|aspx?)$/i, "")));
    const hostHit = HOST_WORDS.test(url.hostname) || /\.(?:career|careers|recruit)\./.test(`.${url.hostname}`);
    const textHit = TEXT_WORDS.test(link.text);
    if (NOT_CAREERS.test(url.pathname + url.search) || (NOT_CAREERS_TEXT.test(link.text) && !textHit)) continue;
    let score = 0;
    if (board && board.provider !== "other-ats") score += 100;
    else if (board) score += board.name === "notion" ? (textHit ? 50 : 0) : 80;
    if (hostHit) score += 60;
    if (pathHit) score += 40;
    if (textHit) score += /채용|careers?|recruit/i.test(link.text) ? 50 : 40;
    if (!score) continue;
    if (sameSite(url.hostname, host)) score += 5;
    else if (!board && !hostHit) score -= 30; // an unknown outside site needs a careers-like host to be followed
    if (score > 0) ranked.push({ ...link, score, board });
  }
  ranked.sort((a, b) => b.score - a.score || a.url.length - b.url.length || a.url.localeCompare(b.url));
  return { ranked, platform: [...new Set(platform)] };
}

/** A URL whose path has a careers segment (/careers, /recruit, /jobs, /채용 …), for sitemap fallbacks. */
export function isCareersPath(raw: string) {
  const url = safeUrl(raw);
  if (!url || isJobPlatformUrl(url.href) || NOT_CAREERS.test(url.pathname)) return false;
  return url.pathname.split("/").filter(Boolean).some(s => { try { return PATH_WORDS.test(decodeURIComponent(s).replace(/\.(?:html?|do|php|jsp|aspx?)$/i, "")); } catch { return false; } });
}

/** The URL a script assigns to (window.|document.|top.)location(.href) = "…" or passes to location.replace("…"); one forward scan. */
function scriptLocation(text: string): string | null {
  const unclosed = new Set<string>(); // a quote with no later match: never search for it again (keeps this linear)
  let at = text.indexOf("location");
  while (at >= 0) {
    let p = at + "location".length;
    if (text.startsWith(".href", p)) p += 5;
    const replace = text.startsWith(".replace", p);
    if (replace) p += 8;
    while (p < text.length && /\s/.test(text[p])) p++;
    if (replace ? text[p] === "(" : text[p] === "=" && text[p + 1] !== "=") {
      p++;
      while (p < text.length && /\s/.test(text[p])) p++;
      const quote = text[p];
      if ((quote === '"' || quote === "'") && !unclosed.has(quote)) {
        const end = text.indexOf(quote, p + 1);
        if (end < 0) unclosed.add(quote);
        if (end > p + 1) {
          const value = text.slice(p + 1, end);
          if (!/["']/.test(value)) return value;
        }
      }
    }
    at = text.indexOf("location", at + 1);
  }
  return null;
}

/** Where a forwarding page sends the browser: meta refresh or a top-level location assignment. Small pages only. */
export function scriptRedirect(html: string, baseUrl: string): string | null {
  if (html.length > 30_000 || extractLinks(html, baseUrl).length > 5) return null;
  const refresh = elements(html, ["meta"]).find(meta => (meta.attrs["http-equiv"] ?? "").trim().toLowerCase() === "refresh")?.attrs.content ?? "";
  const fromMeta = refresh.match(/^\s*\d+\s*;\s*url\s*=\s*['"]?([^"'\s>]+)/i)?.[1] ?? null;
  const target = fromMeta ?? scriptLocation(html);
  return target ? safeUrl(decode(target), baseUrl)?.href ?? null : null;
}

/** ATS evidence inside a page served from the company's own domain (custom-domain boards, embeds). */
export function detectInHtml(html: string): { provider: Provider; name?: string; detail: string; workspaceId?: number } | null {
  const next = scriptBlocks(html, { id: "__NEXT_DATA__" })[0];
  if (next && next.includes("careerBaseInfo")) {
    try {
      const id = JSON.parse(next)?.props?.pageProps?.careerBaseInfo?.workspace?.id;
      return { provider: "greeting", detail: "__NEXT_DATA__.careerBaseInfo", ...(Number.isSafeInteger(id) ? { workspaceId: id } : {}) };
    } catch { return { provider: "greeting", detail: "__NEXT_DATA__.careerBaseInfo" }; }
  }
  // Marker substrings, looked up with indexOf on one ASCII-lowercased copy (same offsets as the page; no regex).
  const lower = asciiLower(html);
  const rules: [string[], Provider, string?, ((at: number, marker: string) => boolean)?][] = [
    [["static.greetinghr.com", "image.greetinghr.com", "opening-attachments.greetinghr.com", "profiles.greetinghr.com"], "greeting"],
    [["boards.greenhouse.io/embed", "job-boards.greenhouse.io/embed", "boards.eu.greenhouse.io/embed", "job-boards.eu.greenhouse.io/embed", "grnhse_app", "boards-api.greenhouse.io"], "greenhouse"],
    [["jobs.lever.co/", "api.lever.co/v0/postings"], "lever", undefined, (at, marker) => marker !== "jobs.lever.co/" || /[a-z0-9-]/.test(lower[at + marker.length] ?? "")],
    [["jobs.ashbyhq.com/", "ashby_embed", "api.ashbyhq.com"], "ashby", undefined, (at, marker) => marker !== "jobs.ashbyhq.com/" || /[a-z0-9-]/.test(lower[at + marker.length] ?? "")],
    [[".myworkdayjobs.com"], "workday"],
    [["ninehire"], "ninehire"],
    [[".recruiter.co.kr"], "recruiter", undefined, at => /[a-z0-9-]/.test(lower[at - 1] ?? "")],
    [["roundhr"], "roundhr"],
    [["static.flex.team", ".careers.team"], "other-ats", "flex"],
  ];
  for (const [markers, provider, name, accept] of rules)
    for (const marker of markers) {
      let at = lower.indexOf(marker);
      while (at >= 0 && accept && !accept(at, marker)) at = lower.indexOf(marker, at + 1);
      if (at >= 0) return { provider, ...(name ? { name } : {}), detail: html.slice(at, at + marker.length) };
    }
  return null;
}

/** schema.org @type values in the page's JSON-LD blocks, including @graph members. */
export function jsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    const record = value as Record<string, unknown>;
    const type = record["@type"];
    for (const t of Array.isArray(type) ? type : [type]) if (typeof t === "string") types.add(t.replace(/^https?:\/\/schema\.org\//, ""));
    for (const key of ["@graph", "itemListElement", "item", "mainEntity"]) if (key in record) visit(record[key], depth + 1);
  };
  for (const block of scriptBlocks(html, { type: "application/ld+json" })) {
    try { visit(JSON.parse(block.trim()), 0); } catch { /* malformed block: ignore */ }
  }
  return [...types];
}
export const hasJobPosting = (html: string) => jsonLdTypes(html).includes("JobPosting");

export function sitemapLocs(xml: string): { kind: "index" | "urlset" | "unknown"; locs: string[] } {
  const lower = asciiLower(xml), head = lower.slice(0, 4096);
  const kind = head.includes("<sitemapindex") ? "index" : head.includes("<urlset") ? "urlset" : lower.includes("<sitemapindex") ? "index" : lower.includes("<urlset") ? "urlset" : "unknown";
  const locs = xmlValues(xml, "loc").map(value => {
    let v = value.trim();
    if (v.startsWith("<![CDATA[")) v = v.slice(9);
    if (v.endsWith("]]>")) v = v.slice(0, -3);
    return decode(v.trim());
  }).filter(v => v && !v.includes("<") && !v.includes("]"));
  return { kind, locs };
}
/** Sitemap lines of a robots.txt, line by line. */
export function robotsSitemaps(robots: string): string[] {
  const found: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.slice(0, 7).toLowerCase() !== "sitemap") continue;
    const rest = trimmed.slice(7).trimStart();
    if (!rest.startsWith(":")) continue;
    const value = rest.slice(1).trim().split(/\s/)[0];
    if (value) found.push(value);
  }
  return found;
}

const POSTING_SEGMENT = /^(?:careers?|recruit(?:ment|s)?|jobs?|positions?|openings?|postings?|job-?descriptions?|apply|notice|rcrt|채용|공고|o)$/i;
const GENERIC = /^(?:list|index|search|all|about|culture|benefits?|welfare|faq|process|team|teams|life|people|story|stories|values?|ko|en|kr|main|home|intro|guide|apply|jobs?|careers?|recruit)$/i;
/** A URL that looks like one posting (an id after a careers segment, or an id parameter), not a listing. */
export function isPostingUrl(raw: string, siteHost?: string): boolean {
  const url = safeUrl(raw);
  if (!url || (siteHost && !sameSite(url.hostname, siteHost))) return false;
  if (isJobPlatformUrl(url.href)) return false;
  const segments = url.pathname.split("/").filter(Boolean).map(s => s.replace(/\.(?:html?|do|php|jsp|aspx?)$/i, ""));
  const at = segments.findIndex(s => POSTING_SEGMENT.test(s));
  const careersContext = at >= 0 || HOST_WORDS.test(url.hostname) || /recruit|career|job/i.test(url.pathname);
  if (!careersContext) return false;
  const idParam = [...url.searchParams].some(([key, value]) => /^(?:id|jobid|job_id|seq|no|annoid|recruitid|postingid|positionid|gh_jid|idx|rcrtno)$/i.test(key) && /^[\w-]{2,40}$/.test(value));
  if (idParam) return true;
  const tail = segments.slice(at >= 0 ? at + 1 : 0);
  return tail.some(s => !GENERIC.test(s) && (/\d{3,}/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || (s.split("-").length >= 3 && s.length >= 12)));
}

/** Board names to try on a public ATS API, from the official domain and the DART English name. */
export function slugGuesses(homepageHost: string, englishName = ""): string[] {
  const label = registrableDomain(homepageHost).split(".")[0].toLowerCase();
  const guesses = [label, label.replace(/-/g, ""), label.replace(/(?:corp|inc|company|group|official|korea|kr)$/, "")];
  const english = englishName.toLowerCase().replace(/\b(?:co|corp|corporation|inc|incorporated|ltd|limited|llc|company|korea)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
  if (english) guesses.push(english);
  return [...new Set(guesses.filter(g => /^[a-z0-9][a-z0-9-]{1,40}$/.test(g)))].slice(0, 2);
}

/** Names compared with whitespace, punctuation and corporate suffixes removed. */
export function looseName(text: string) {
  return text.normalize("NFKC").toLowerCase()
    .replace(/주식회사|\(주\)|㈜|유한회사|\b(?:co|corp|corporation|inc|incorporated|ltd|limited|llc|company|korea|careers?|jobs)\b\.?/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
