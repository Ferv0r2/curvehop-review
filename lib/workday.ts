import { htmlToText, postingFields } from "./greenhouse";
import { robotsAllows } from "./greeting";
import { EmptyListError } from "./source-errors";
import { asciiLower } from "./ascii";
import type { Job } from "./jobs";
import type { Source } from "./sources";

/*
 * Workday public career sites. Only the paths robots.txt explicitly allows
 * are used: {origin}/{site}/siteMap.xml lists postings, and each posting page
 * embeds a schema.org JobPosting (JSON-LD). The undocumented /wday/cxs JSON
 * API is deliberately not used.
 *
 *   robots.txt ─▶ siteMap.xml ─▶ /{site}/job/... ─▶ JSON-LD JobPosting ─▶ Job
 */
export function workdaySite(source: Source) {
  const url = new URL(source.careerUrl ?? "");
  const site = url.pathname.match(/^\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_]+)\/?$/)?.[1];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(url.hostname) ||
    !site
  )
    throw new Error("검증된 Workday 채용 사이트 주소가 필요합니다.");
  return { origin: url.origin, site };
}

/**
 * What `/<loc>\s*([^<]+?)\s*<\/loc>/g` captured, by a forward scan: the text
 * between `<loc>` and the next '<', which must open `</loc>`, trimmed (all
 * whitespace keeps its last character, as the lazy group did). The regex
 * backtracked quadratically on long whitespace without a closing tag.
 */
export function workdayLocValues(xml: string): string[] {
  const values: string[] = [];
  for (let start = xml.indexOf("<loc>"); start >= 0; ) {
    const lt = xml.indexOf("<", start + 5);
    if (lt < 0) break;
    if (lt > start + 5 && xml.startsWith("</loc>", lt)) {
      const raw = xml.slice(start + 5, lt);
      values.push(raw.trim() || raw[raw.length - 1]);
      start = xml.indexOf("<loc>", lt + 6);
    } else start = xml.indexOf("<loc>", lt);
  }
  return values;
}

/**
 * Bodies of the scripts `/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi`
 * matched, in order, by forward scans over an ASCII-lowercased copy (same
 * offsets as the page): the tag runs to the first '>', must contain the type
 * text anywhere in it, and the body ends at the first `</script>`. Each '>',
 * type text and `</script>` position is found once and reused, so a page of
 * unclosed tags no longer costs a rescan to the end per tag.
 */
export function ldJsonScripts(html: string): string[] {
  const lower = asciiLower(html), bodies: string[] = [];
  const TYPE = "application/ld+json";
  let gt = -1, typeAt = -1, typeFrom = 0, close = -1;
  // First `type="application/ld+json"` (either quote at each end) starting at or after `from`.
  const typeText = (from: number) => {
    if (typeAt >= from || typeAt === -2) return typeAt;
    for (let at = lower.indexOf(TYPE, Math.max(from + 6, typeFrom)); ; at = lower.indexOf(TYPE, at + 1)) {
      if (at < 0) return (typeAt = -2);
      typeFrom = at + 1;
      const q1 = lower[at - 1], q2 = lower[at + TYPE.length];
      if ((q1 === '"' || q1 === "'") && (q2 === '"' || q2 === "'") && lower.startsWith("type=", at - 6) && at - 6 >= from) return (typeAt = at - 6);
    }
  };
  for (let start = lower.indexOf("<script"); start >= 0; ) {
    if (/\w/.test(html[start + 7] ?? "")) { start = lower.indexOf("<script", start + 1); continue; }
    if (gt < start + 7) gt = html.indexOf(">", start + 7);
    if (gt < 0) break;
    const at = typeText(start + 7);
    if (at < 0 || at >= gt) { start = lower.indexOf("<script", start + 1); continue; }
    if (close < gt + 1) close = lower.indexOf("</script>", gt + 1);
    if (close < 0) break;
    bodies.push(html.slice(gt + 1, close));
    start = lower.indexOf("<script", close + 9);
  }
  return bodies;
}

export function workdayJobUrls(xml: string, source: Source): string[] {
  if (!/<urlset\b/.test(xml) || !/<\/urlset>/.test(xml))
    throw new Error("Workday 공고 사이트맵을 확인하지 못했습니다.");
  const { origin, site } = workdaySite(source);
  const urls = new Set<string>();
  for (const value of workdayLocValues(xml)) {
    const url = new URL(value.replaceAll("&amp;", "&"));
    if (url.origin === origin && url.pathname.startsWith(`/${site}/job/`))
      urls.add(url.href);
  }
  if (urls.size > 1000)
    throw new Error("사이트맵 공고가 1,000건 제한을 넘었습니다.");
  return [...urls];
}

type JobPosting = {
  "@type"?: string;
  title?: unknown;
  description?: unknown;
  identifier?: { value?: unknown };
  jobLocation?: { address?: { addressLocality?: unknown; addressCountry?: unknown } } | unknown[];
  employmentType?: unknown;
};

export function normalizeWorkday(
  html: string,
  source: Source,
  pageUrl: string,
  now: string,
): Job {
  const { origin, site } = workdaySite(source);
  const url = new URL(pageUrl);
  if (url.origin !== origin || !url.pathname.startsWith(`/${site}/job/`))
    throw new Error("허용되지 않은 공고 페이지입니다.");
  const posting = ldJsonScripts(html)
    .map((body) => {
      try {
        return JSON.parse(body) as JobPosting;
      } catch {
        return null;
      }
    })
    .find((value) => value?.["@type"] === "JobPosting");
  if (!posting) throw new Error("Workday 공고 페이지의 구조가 변경됐습니다.");
  const id = typeof posting.identifier?.value === "string" ? posting.identifier.value.trim() : "";
  const title = typeof posting.title === "string" ? htmlToText(posting.title).trim() : "";
  const description =
    typeof posting.description === "string" ? htmlToText(posting.description).trim() : "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !title || !description || description.length > 250000)
    throw new Error("공고 ID·제목·본문을 확인하지 못했습니다.");
  const places = (Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation])
    .map((place) => (place as { address?: { addressLocality?: unknown } } | undefined)?.address?.addressLocality)
    .filter((value): value is string => typeof value === "string" && !!value.trim())
    .map((value) => value.trim());
  // Office names are mapped only through aliases backed by an evidence URL;
  // the company address is never used to fill in a job's workplace.
  const locationLabel = [...new Set(places.map((place) => source.locationAliases?.[place]?.label ?? place))].join("; ");
  return {
    id: `workday-${source.board}-${id}`,
    source: "workday",
    sourceBoard: source.board,
    sourceJobId: id,
    sourceUrl: url.href,
    company: source.company,
    links: [],
    initial: source.company[0],
    color: source.color,
    ...postingFields(title, description, locationLabel),
    experience: null,
    salary: null,
    updatedAt: null,
    fetchedAt: now,
  };
}

export async function collectWorkday(
  source: Source,
  request: (url: string) => Promise<string>,
  now: string,
  pause = 500,
): Promise<Job[]> {
  const { origin, site } = workdaySite(source);
  const robots = await request(`${origin}/robots.txt`);
  const sitemapPath = `/${site}/siteMap.xml`;
  if (!robotsAllows(robots, sitemapPath))
    throw new Error("이 출처의 robots.txt가 사이트맵 수집을 허용하지 않습니다.");
  const urls = workdayJobUrls(await request(`${origin}${sitemapPath}`), source);
  if (!urls.length)
    throw new EmptyListError("Workday 공고 사이트맵이 비어 있습니다. 이전 데이터를 유지합니다.");
  const jobs: Job[] = [];
  for (const url of urls) {
    if (!robotsAllows(robots, new URL(url).pathname))
      throw new Error("이 출처의 robots.txt가 공고 수집을 허용하지 않습니다.");
    try {
      jobs.push(normalizeWorkday(await request(url), source, url, now));
    } catch (error) {
      throw new Error(`${url}: ${error instanceof Error ? error.message : "공고 수집 실패"}`);
    }
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
  }
  return jobs;
}
