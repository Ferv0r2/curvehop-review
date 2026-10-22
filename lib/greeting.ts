import { htmlToText, postingFields, extractJobLinks } from "./greenhouse";
import { EmptyListError } from "./source-errors";
import { asciiLower } from "./ascii";
import { isInScope } from "./eligibility";
import type { Job } from "./jobs";
import type { Source } from "./sources";

export function careerOrigin(source: Source) {
  const url = new URL(source.careerUrl ?? "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    /^[\d.]+$/.test(url.hostname) ||
    url.hostname.includes(":") ||
    /(?:localhost|\.local|\.internal)$/.test(url.hostname) ||
    !Number.isSafeInteger(source.greetingWorkspaceId) ||
    (source.greetingWorkspaceId ?? 0) <= 0
  )
    throw new Error("검증된 Greeting 채용 도메인이 필요합니다.");
  return url.origin;
}

/**
 * `<loc>…</loc>` values as `/<loc>\s*([^<]+)\s*<\/loc>/g` matched them, by a
 * forward scan: the text up to the next '<', which must open `</loc>`. The
 * regex backtracked quadratically on long whitespace without a closing tag.
 */
export function locValues(xml: string): string[] {
  const values: string[] = [];
  let pos = 0;
  for (;;) {
    const start = xml.indexOf("<loc>", pos);
    if (start < 0) break;
    const lt = xml.indexOf("<", start + 5);
    if (lt < 0) break;
    if (!xml.startsWith("</loc>", lt)) { pos = start + 1; continue; }
    if (lt > start + 5) values.push(xml.slice(start + 5, lt));
    pos = lt + 6;
  }
  return values;
}

/** The first `<script …>…</script>` whose attributes carry id="__NEXT_DATA__", found by forward scans (no `[\s\S]*?` regex). */
export function nextDataScript(html: string): string | null {
  const lower = asciiLower(html);
  let pos = 0;
  for (;;) {
    const start = lower.indexOf("<script", pos);
    if (start < 0) return null;
    if (/\w/.test(html[start + 7] ?? "")) { pos = start + 1; continue; }
    const gt = html.indexOf(">", start + 7);
    if (gt < 0) return null;
    const close = lower.indexOf("</script>", gt + 1);
    if (close < 0) return null;
    if (/\bid=["']__NEXT_DATA__["']/.test(html.slice(start + 7, gt))) return html.slice(gt + 1, close);
    pos = close + 9;
  }
}

export function greetingJobUrls(xml: string, source: Source): string[] {
  if (!/<urlset\b/.test(xml) || !/<\/urlset>/.test(xml))
    throw new Error("전체 공고 사이트맵을 확인하지 못했습니다.");
  const origin = careerOrigin(source);
  const ids = new Set<string>();
  for (const value of locValues(xml)) {
    const url = new URL(value.trim().replaceAll("&amp;", "&"));
    const id = url.pathname.match(/^\/(?:ko\/|en\/)?o\/(\d+)\/?$/)?.[1];
    if (url.origin === origin && id) ids.add(id);
  }
  if (ids.size > 1000)
    throw new Error("사이트맵 공고가 1,000건 제한을 넘었습니다.");
  return [...ids].map((id) => `${origin}/ko/o/${id}`);
}

/**
 * robots.txt per RFC 9309 for this crawler's product token ("NextstepJobBoard"):
 * - A group is one or more user-agent lines followed by rules. Any rule line
 *   ends the user-agent list, even an empty `Disallow:` (which allows all), so
 *   "User-agent: * / Disallow: / User-agent: GPTBot / Disallow: /" is two groups.
 * - Every group whose product token equals ours (case-insensitive, version
 *   ignored) is merged; when there is none, every "*" group is; else no rules.
 * - The longest matching path wins; Allow wins a tie. `*` matches any run of
 *   characters and a trailing `$` anchors the end.
 * - Rule and request paths are compared after the same normalization
 *   (robotsPath): non-ASCII is UTF-8 percent-encoded, escapes of unreserved
 *   characters are decoded (`/%63areers` is `/careers`), other escapes are
 *   uppercased and kept (`%2f` is `%2F`, never `/`).
 */
// Every "%xx" spelling mapped once to its normalized form: unreserved characters decoded, the rest uppercased.
const ESCAPES = new Map<string, string>();
for (let byte = 0; byte < 256; byte++) {
  const hex = byte.toString(16).padStart(2, "0");
  const char = String.fromCharCode(byte);
  const normal = /[A-Za-z0-9\-._~]/.test(char) ? char : `%${hex.toUpperCase()}`;
  for (const spelling of new Set([hex, hex.toUpperCase(), hex[0].toUpperCase() + hex[1], hex[0] + hex[1].toUpperCase()])) ESCAPES.set(`%${spelling}`, normal);
}
export function robotsPath(value: string): string {
  // One pass: a run of non-ASCII, space or control characters is UTF-8 percent-encoded at once (encodeURIComponent
  // already writes uppercase escapes of reserved bytes only); an existing escape is normalized from the table.
  return value.replace(/[^\x21-\x7e]+|%[0-9a-fA-F]{2}/gu, match => (match[0] === "%" ? ESCAPES.get(match) ?? match : encodeURIComponent(match)));
}

/**
 * Does a robots rule path match the start of a request path? `*` matches any
 * run of characters and a trailing `$` anchors the end. Literal pieces are
 * placed left to right with indexOf, so a hostile rule like `/*a*a*a…b` costs
 * at most one scan per piece instead of regex backtracking.
 */
export function robotsRuleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const pieces = (anchored ? rule.slice(0, -1) : rule).split("*");
  const first = pieces[0];
  if (!path.startsWith(first)) return false;
  if (pieces.length === 1) return !anchored || path.length === first.length;
  let at = first.length;
  for (const piece of pieces.slice(1, -1)) {
    const found = path.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  const last = pieces[pieces.length - 1];
  if (anchored) return path.length - last.length >= at && path.endsWith(last);
  return path.indexOf(last, at) >= 0;
}

export function robotsAllows(text: string, rawPath: string): boolean {
  // A path this long is never one we fetch; refusing it keeps rule matching bounded (rules × path length).
  if (rawPath.length > 4096) return false;
  const path = robotsPath(rawPath);
  type Rule = { allow: boolean; path: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let group: { agents: string[]; rules: Rule[] } | null = null;
  let afterRules = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const index = line.indexOf(":");
    if (index < 0) continue;
    const key = line.slice(0, index).trim().toLowerCase(),
      value = line.slice(index + 1).trim();
    if (key === "user-agent") {
      if (afterRules || !group) {
        group = { agents: [], rules: [] };
        groups.push(group);
        afterRules = false;
      }
      group.agents.push(value.split("/")[0].trim().toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      afterRules = true;
      if (group && value) group.rules.push({ allow: key === "allow", path: robotsPath(value) });
    }
  }
  const ours = groups.filter((g) => g.agents.includes("nextstepjobboard"));
  const applicable = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));
  let best = -1,
    allowed = true;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (
      robotsRuleMatches(rule.path, path) &&
      (rule.path.length > best || (rule.path.length === best && rule.allow))
    ) {
      best = rule.path.length;
      allowed = rule.allow;
    }
  }
  return allowed;
}

type Place = {
  location?: string;
  place?: string;
  detailPlace?: string;
  workFromHome?: boolean;
};
type OpeningData = {
  groupInfo?: { groupId?: number };
  openingsInfo?: {
    openingId?: number;
    status?: string;
    deploy?: boolean;
    title?: string;
    detail?: string;
    dueDate?: string | null;
  };
  jobPositionSetting?: { jobPositions?: { workspacePlace?: Place }[] } | null;
  careerInfo?: {
    from?: number | null;
    to?: number | null;
    type?: number | null;
  };
};

/** Where Greeting stores images uploaded into a posting body (seen on every image-only board, 2026-10-08). */
const GREETING_ATTACHMENT_HOSTS = new Set(["opening-attachments.greetinghr.com"]);

/** Drops `<!-- … -->` with a linear scan; an unclosed comment runs to the end, as in a browser. */
function withoutComments(html: string): string {
  let out = "",
    at = 0;
  for (;;) {
    const start = html.indexOf("<!--", at);
    if (start < 0) return out + html.slice(at);
    out += html.slice(at, start);
    const end = html.indexOf("-->", start + 4);
    if (end < 0) return out;
    at = end + 3;
  }
}

/** The src of one `<img …>` tag's attribute text; quoted values are read whole. */
function imageSource(attrs: string): string | undefined {
  for (const m of attrs.matchAll(
    /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  ))
    if (m[1].toLowerCase() === "src") return m[2] ?? m[3] ?? m[4] ?? "";
  return undefined;
}

/**
 * Whether a body carries an image uploaded to Greeting itself: an `<img>`
 * outside comments whose src is an https URL on Greeting's attachment host.
 * Pixels, data:, relative, empty or other-host sources do not count. Only the
 * markup is read (linear scans); the image is never fetched.
 */
export function hasGreetingImage(detail: string): boolean {
  const html = withoutComments(detail);
  const open = /<img(?![\w-])/gi;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const close = html.indexOf(">", open.lastIndex);
    if (close < 0) return false;
    const src = imageSource(html.slice(open.lastIndex, close));
    open.lastIndex = close + 1;
    if (!src) continue;
    try {
      const url = new URL(src.trim().replaceAll("&amp;", "&"));
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        GREETING_ATTACHMENT_HOSTS.has(url.hostname)
      )
        return true;
    } catch {
      /* Not an absolute URL. */
    }
  }
  return false;
}

export function normalizeGreeting(
  html: string,
  source: Source,
  pageUrl: string,
  now: string,
): Job | null {
  const origin = careerOrigin(source),
    url = new URL(pageUrl);
  const id = url.pathname.match(/^\/ko\/o\/(\d+)$/)?.[1];
  if (url.origin !== origin || !id)
    throw new Error("허용되지 않은 공고 페이지입니다.");
  const script = nextDataScript(html);
  if (script === null) throw new Error("Greeting 공개 페이지의 구조가 변경됐습니다.");
  const props = JSON.parse(script)?.props?.pageProps;
  const query = props?.dehydratedState?.queries?.find(
    (q: { queryKey?: unknown[] }) => q.queryKey?.includes("getOpeningById"),
  );
  const result = query?.state?.data;
  const data: OpeningData = result?.data;
  const info = data?.openingsInfo;
  const groupId = data?.groupInfo?.groupId;
  const workspaceId = props?.careerBaseInfo?.workspace?.id;
  if (
    result?.success !== true ||
    groupId !== source.greetingWorkspaceId ||
    !Number.isSafeInteger(groupId) ||
    !Number.isSafeInteger(workspaceId) ||
    (groupId ?? 0) <= 0 ||
    workspaceId <= 0 ||
    !info ||
    info.openingId !== Number(id) ||
    data.groupInfo?.groupId !== props?.careerBaseInfo?.workspace?.id
  )
    throw new Error("공고 ID 또는 회사 정보를 확인하지 못했습니다.");
  if (
    !["OPEN", "CLOSED"].includes(info.status ?? "") ||
    typeof info.deploy !== "boolean"
  )
    throw new Error("공고 공개 상태 형식이 변경됐습니다.");
  if (info.status !== "OPEN" || !info.deploy) return null;
  if (info.dueDate && !Number.isFinite(Date.parse(info.dueDate)))
    throw new Error("공고 마감일 형식이 잘못되었습니다.");
  if (info.dueDate && Date.parse(info.dueDate) <= Date.parse(now)) return null;
  if (
    typeof info.title !== "string" ||
    !info.title.trim() ||
    info.title.length > 500 ||
    typeof info.detail !== "string" ||
    !info.detail.trim() ||
    info.detail.length > 5 * 1024 * 1024
  )
    throw new Error("공고 제목 또는 본문이 잘못되었습니다.");
  const places =
    data.jobPositionSetting?.jobPositions
      ?.map((p) => p.workspacePlace)
      .filter((p): p is Place => !!p && p.workFromHome !== true) ?? [];
  const locationLabel = [
    ...new Set(
      places.map((p) =>
        [
          source.locationAliases?.[p.location ?? ""]?.label ?? p.location,
          p.place,
          p.detailPlace,
        ]
          .filter((v) => typeof v === "string" && !!v.trim())
          .join(" · "),
      ),
    ),
  ]
    .filter(Boolean)
    .join("; ");
  const title = htmlToText(info.title),
    description = htmlToText(info.detail);
  // Some boards publish the whole body as images uploaded to Greeting
  // (`<p><img src="https://opening-attachments.greetinghr.com/…"></p>`). The
  // images are never read, downloaded or shown here; such a posting is kept
  // for its structured fields only, with an empty description the job page
  // explains, and only when those fields make it a Seoul/Pangyo vacancy.
  const imageOnly = !description && hasGreetingImage(info.detail);
  if (!title || (!description && !imageOnly) || description.length > 250000)
    throw new Error("공고 제목 또는 본문이 비어 있습니다.");
  const career = data.careerInfo;
  // An upper bound of 0, below the lower bound, or a placeholder like 30
  // means "no upper bound" in Greeting data ("10~0년", "3~30년").
  const experience =
    career?.from != null && Number.isFinite(career.from)
      ? career.to != null && Number.isFinite(career.to) && career.to >= career.from && career.to > 0 && career.to < 20
        ? `${career.from}~${career.to}년`
        : `${career.from}년 이상`
      : null;
  const job: Job = {
    id: `greeting-${source.board}-${id}`,
    source: "greeting",
    sourceBoard: source.board,
    sourceJobId: id,
    sourceUrl: url.href,
    company: source.company,
    links: extractJobLinks(info.detail, url.href),
    initial: source.company[0],
    color: source.color,
    ...postingFields(title, description, locationLabel),
    experience,
    salary: null,
    updatedAt: null,
    fetchedAt: now,
  };
  // Text postings outside scope stay in the archive (collectSources filters
  // them); an image-only one has no text worth archiving, so it is skipped.
  if (imageOnly && !isInScope(job)) return null;
  return job;
}

export async function collectGreeting(
  source: Source,
  request: (url: string) => Promise<string>,
  now: string,
): Promise<Job[]> {
  const origin = careerOrigin(source);
  const robots = await request(`${origin}/robots.txt`);
  if (!robotsAllows(robots, "/sitemap.xml"))
    throw new Error(
      "이 출처의 robots.txt가 사이트맵 수집을 허용하지 않습니다.",
    );
  const urls = greetingJobUrls(await request(`${origin}/sitemap.xml`), source);
  if (!urls.length)
    throw new EmptyListError(
      "공고 사이트맵이 비어 있습니다. 이전 데이터를 유지합니다.",
    );
  const jobs: Job[] = [];
  for (const url of urls) {
    if (!robotsAllows(robots, new URL(url).pathname))
      throw new Error("이 출처의 robots.txt가 공고 수집을 허용하지 않습니다.");
    try {
      const job = normalizeGreeting(await request(url), source, url, now);
      if (job) jobs.push(job);
    } catch (error) {
      throw new Error(
        `${url}: ${error instanceof Error ? error.message : "공고 수집 실패"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return jobs;
}
