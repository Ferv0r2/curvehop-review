/**
 * Third-party job boards and company-review platforms. Their terms restrict
 * automated access, so the pipeline neither fetches nor cites them: a search
 * result there only says a posting or page exists. The source is the company's
 * own posting, on its careers site or its applicant tracking system.
 * (2026-10-06 user decision: leave no access record on these platforms.)
 */
export const JOB_PLATFORM_DOMAINS = [
  "wanted.co.kr", "jobkorea.co.kr", "saramin.co.kr", "incruit.com", "rocketpunch.com", "catch.co.kr",
  "jobplanet.co.kr", "teamblind.com", "linkedin.com", "kreditjob.com", "peoplenjob.com", "albamon.com",
  "alba.co.kr", "indeed.com", "career.programmers.co.kr", "jumpit.co.kr",
] as const;

export function isJobPlatformUrl(raw: string) {
  try {
    return isJobPlatformHost(new URL(raw).hostname);
  } catch { return false; }
}

/** A hostname on the platform list; a trailing dot ("wanted.co.kr.") is the same host. */
function isJobPlatformHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return JOB_PLATFORM_DOMAINS.some(domain => host === domain || host.endsWith("." + domain));
}

/** What a hidden platform address reads as in a posting's text. */
export const HIDDEN_PLATFORM_LINK = "(채용 플랫폼 링크 생략)";

/**
 * A posting's own text with job-platform addresses replaced (2026-10-11 user decision: hide what the
 * policy keeps out). A company's posting sometimes links a platform event or listing; the site shows
 * the posting, never the platform address. Display only: stored text and archive hashes are unchanged.
 */
export function withoutPlatformUrls(text: string): string {
  // One linear pass, no backtracking. Whitespace (any Unicode space), brackets and quotes always end a word.
  // A comma, semicolon, pipe or colon ends one only where a new address starts after it and the word so far has no
  // query or fragment, so "…/wd/1;https://company.com" keeps the company address and a company URL's
  // "?tag=a,b" stays whole.
  let out = "", start = 0, query = false;
  const flush = (end: number) => { if (end > start) out += hidePlatformWord(text.slice(start, end)); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // A colon also ends a label before an address ("지원링크:https://…"), but never a scheme's own "://".
    const boundary = /[\s\u200b]/.test(ch) || WORD_BREAKS.has(ch)
      || ((LIST_BREAKS.has(ch) || ((ch === ":" || ch === "：") && !text.startsWith("//", i + 1))) && !query && startsAddress(text, i + 1));
    if (!boundary) {
      if (ch === "?" || ch === "#") query = true;
      continue;
    }
    flush(i);
    out += ch;
    start = i + 1;
    query = false;
  }
  flush(text.length);
  return out;
}

/** Characters that always end an address in prose: brackets and quotes. */
const WORD_BREAKS = new Set(Array.from("<>\"'`()[]{}「」『』"));
/** List punctuation, which ends an address only before another one. */
const LIST_BREAKS = new Set(Array.from(",;|，、"));
/** Whether an address (scheme, scheme-relative, www., email or bare host) starts at `at`. */
function startsAddress(text: string, at: number) {
  return /^(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|www\.|[^\s/?#@,;|]+@|[a-z0-9-]+\.[a-z]{2,})/i.test(text.slice(at, at + 64));
}

/** One word: hidden when it is an address on a platform host. Sentence punctuation after it stays. */
function hidePlatformWord(word: string): string {
  let end = word.length;
  while (end > 0 && ".!?:：,;|，、".includes(word[end - 1])) end--;
  const address = word.slice(0, end);
  const relative = address.startsWith("//"), scheme = relative ? -1 : address.indexOf("://");
  // An email is not a link (recruit@wanted.co.kr).
  if (scheme < 0 && !relative && address.includes("@")) return word;
  if (scheme >= 0 && !/^[a-z][a-z0-9+.-]*$/i.test(address.slice(0, scheme))) return word;
  const rest = relative ? address.slice(2) : scheme >= 0 ? address.slice(scheme + 3) : address;
  let hostEnd = rest.length;
  for (const mark of "/?#") { const at = rest.indexOf(mark); if (at >= 0 && at < hostEnd) hostEnd = at; }
  let host = rest.slice(0, hostEnd);
  host = host.slice(host.lastIndexOf("@") + 1);
  const port = host.indexOf(":");
  if (port >= 0) host = host.slice(0, port);
  try { host = decodeURIComponent(host); } catch { /* a malformed escape is compared as written */ }
  return host.includes(".") && isJobPlatformHost(host) ? HIDDEN_PLATFORM_LINK + word.slice(end) : word;
}

/** The platform names a prompt lists, so model instructions follow the same list. */
export const JOB_PLATFORM_NAMES = "원티드, 잡코리아, 사람인(점핏), 인크루트, 로켓펀치, 캐치, 잡플래닛, 블라인드, 링크드인, 크레딧잡, 피플앤잡, 알바몬, 알바천국, 인디드, 프로그래머스 채용";

/** Evidence that cites a platform, as companyId/evidenceId. Current data must have none (fail closed). */
export function platformEvidence(pack: { companies?: { id: string; evidence?: { id: string; url: string }[] }[] }) {
  return (pack.companies ?? []).flatMap(company => (company.evidence ?? []).filter(item => isJobPlatformUrl(item.url)).map(item => `${company.id}/${item.id}`));
}
