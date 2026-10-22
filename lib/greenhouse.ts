import { roleLabels, type Job, type Role, type Location } from "./jobs";
import { classifyRole } from "./roles";
import type { Source } from "./sources";
import { classifyLocation } from "./eligibility";
import { safeJobLinks } from "./job-links";
import { asciiLower } from "./ascii";

/** `<a …>…</a>` pairs like `/<a\b([^>]*)>([\s\S]*?)<\/a>/gi`, found by forward scans (linear on hostile markup). */
function anchorPairs(html: string): { attrs: string; content: string }[] {
  const lower = asciiLower(html);
  const pairs: { attrs: string; content: string }[] = [];
  let pos = 0;
  for (;;) {
    const start = lower.indexOf("<a", pos);
    if (start < 0) break;
    if (/\w/.test(html[start + 2] ?? "")) { pos = start + 1; continue; }
    const gt = html.indexOf(">", start + 2);
    if (gt < 0) break;
    const close = lower.indexOf("</a>", gt + 1);
    if (close < 0) break;
    pairs.push({ attrs: html.slice(start + 2, gt), content: html.slice(gt + 1, close) });
    pos = close + 4;
  }
  return pairs;
}

export function extractJobLinks(html: string, baseUrl: string) {
  const links: { text: string; url: string }[] = [];
  for (let i = 0; i < 3; i++) html = decodeEntities(html);
  for (const match of anchorPairs(html)) {
    const href = match.attrs.match(
      /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    );
    if (!href) continue;
    try {
      links.push({
        text: htmlToText(match.content).slice(0, 500),
        url: new URL(decodeEntities(href[1] ?? href[2] ?? href[3]), baseUrl)
          .href,
      });
    } catch {
      /* Ignore malformed attachments. */
    }
    if (links.length === 200) break;
  }
  return safeJobLinks(links);
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    ldquo: "“",
    rdquo: "”",
    bull: "•",
    hellip: "…",
  };
  return text.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#")) {
        const value =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return value > 0 &&
          value <= 0x10ffff &&
          !(value >= 0xd800 && value <= 0xdfff)
          ? String.fromCodePoint(value)
          : "�";
      }
      return entities[entity.toLowerCase()] ?? match;
    },
  );
}

// Tag rewriting below uses forward-only scans (indexOf), not regexes like
// `<[^>]+>` or `[\s\S]*?<\/script>`, which go quadratic on hostile markup
// (thousands of `<` without `>`, unclosed `<script>`). Each scan reproduces the
// regex it replaces: a tag ends at the first `>` after it, a script/style
// block at the first `</script>`/`</style>` after its tag.
const isWordChar = (c: string | undefined) => !!c && /\w/.test(c);

/** Removes `<script …>…</script>` and `<style …>…</style>` blocks (case-insensitive), like `/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi`. */
function withoutScriptAndStyle(text: string): string {
  const lower = asciiLower(text);
  const names = ["script", "style"];
  const dead = new Set<string>(); // a name with no closing tag left: never searched again
  const next: Record<string, number> = { script: -2, style: -2 };
  const parts: string[] = [];
  let kept = 0, pos = 0;
  for (;;) {
    let start = -1, name = "";
    for (const candidate of names) {
      if (dead.has(candidate)) continue;
      if (next[candidate] !== -1 && next[candidate] < pos) next[candidate] = lower.indexOf(`<${candidate}`, pos);
      const at = next[candidate];
      if (at >= 0 && (start < 0 || at < start)) { start = at; name = candidate; }
    }
    if (start < 0) break;
    const after = start + 1 + name.length;
    if (isWordChar(text[after])) { pos = start + 1; continue; }
    const gt = text.indexOf(">", after);
    if (gt < 0) break; // no '>' left: no block can match from here on
    const close = lower.indexOf(`</${name}>`, gt + 1);
    if (close < 0) { dead.add(name); pos = start + 1; continue; }
    parts.push(text.slice(kept, start));
    kept = pos = close + name.length + 3;
  }
  parts.push(text.slice(kept));
  return parts.join("");
}

/** Replaces each tag whose opening matches `opens` (checked at every '<') through its first '>', like `/<(?:…)\b[^>]*>/gi`. */
function replaceTags(text: string, opens: (lowerAt: string) => boolean, replace: (tag: string) => string): string {
  const lower = asciiLower(text);
  const parts: string[] = [];
  let kept = 0, pos = 0;
  for (;;) {
    const start = text.indexOf("<", pos);
    if (start < 0) break;
    if (!opens(lower.slice(start, start + 6))) { pos = start + 1; continue; }
    const gt = text.indexOf(">", start + 1);
    if (gt < 0) break;
    parts.push(text.slice(kept, start), replace(text.slice(start, gt + 1)));
    kept = pos = gt + 1;
  }
  parts.push(text.slice(kept));
  return parts.join("");
}

/** `<br\s*\/?\s*>` → "\n", by a scan from each `<br`. */
function brToNewline(text: string): string {
  const lower = asciiLower(text);
  const parts: string[] = [];
  let kept = 0, pos = 0;
  for (;;) {
    const start = lower.indexOf("<br", pos);
    if (start < 0) break;
    let p = start + 3;
    while (p < text.length && /\s/.test(text[p])) p++;
    if (text[p] === "/") { p++; while (p < text.length && /\s/.test(text[p])) p++; }
    if (text[p] === ">") { parts.push(text.slice(kept, start), "\n"); kept = pos = p + 1; }
    else pos = start + 1;
  }
  parts.push(text.slice(kept));
  return parts.join("");
}

/** `<[^>]+>` → "", by a scan: from each '<' to the first '>' after it ("<>" stays). */
function withoutTags(text: string): string {
  const parts: string[] = [];
  let kept = 0, pos = 0;
  for (;;) {
    const start = text.indexOf("<", pos);
    if (start < 0) break;
    const gt = text.indexOf(">", start + 1);
    if (gt < 0) break;
    if (gt === start + 1) { pos = start + 1; continue; }
    parts.push(text.slice(kept, start));
    kept = pos = gt + 1;
  }
  parts.push(text.slice(kept));
  return parts.join("");
}

const boundary = (lowerAt: string, prefix: string) => lowerAt.startsWith(prefix) && !isWordChar(lowerAt[prefix.length]);

// External markup is converted to plain text and rendered through React escaping.
export function htmlToText(html: string) {
  let text = html;
  for (let i = 0; i < 3; i++) text = decodeEntities(text);
  let listDepth = 0;
  text = withoutScriptAndStyle(text);
  text = brToNewline(text);
  text = replaceTags(text, at => ["</ul", "</ol", "<ul", "<ol", "<li"].some(prefix => boundary(at, prefix)), (tag) => {
    if (/^<\/(?:ul|ol)/i.test(tag)) { listDepth = Math.max(0, listDepth - 1); return "\n"; }
    if (/^<(?:ul|ol)/i.test(tag)) { listDepth++; return "\n"; }
    return "\n" + "\t".repeat(Math.max(0, Math.min(8, listDepth - 1))) + "• ";
  });
  text = replaceTags(text, at => /^<h[1-6]/.test(at) && !isWordChar(at[3]), () => "\n\n## ");
  return withoutTags(text
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n"))
    .replace(/ +/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/^##[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function safeSourceUrl(
  input: unknown,
  source: Source,
  id: number,
): string {
  if (typeof input !== "string") throw new Error("공고 원문 URL이 없습니다.");
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      ([
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
        "job-boards.eu.greenhouse.io",
      ].includes(url.hostname) &&
        url.pathname === `/${source.board}/jobs/${id}`) ||
      (source.customJobPage &&
        url.hostname === source.customJobPage.host &&
        url.pathname === source.customJobPage.path &&
        url.searchParams.get("gh_jid") === String(id))
    )
  )
    throw new Error("허용되지 않은 공고 원문 URL입니다.");
  return url.href;
}

export function normalizeGreenhouse(
  raw: unknown,
  source: Source,
  fetchedAt: string,
): Job {
  if (!raw || typeof raw !== "object")
    throw new Error("공고 형식이 잘못되었습니다.");
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 500 ||
    typeof value.content !== "string" ||
    !value.content.trim() ||
    value.content.length > 250000
  ) {
    throw new Error("공고 ID, 제목 또는 본문이 잘못되었습니다.");
  }
  const title = htmlToText(value.title);
  const description = htmlToText(value.content);
  if (!title || !description)
    throw new Error("공고 제목 또는 본문이 비어 있습니다.");
  const locationData = value.location as { name?: unknown } | undefined;
  const locationLabel =
    typeof locationData?.name === "string"
      ? htmlToText(locationData.name)
          .split(";")
          .filter((part) => !/^\s*z-Test & Templates Only\s*$/i.test(part))
          .map((part) => part.trim())
          .filter(Boolean)
          .join("; ")
          .slice(0, 500)
      : "원문 확인";
  const fields = postingFields(title, description, locationLabel);
  return {
    id: `greenhouse-${source.board}-${value.id}`,
    source: "greenhouse",
    sourceBoard: source.board,
    sourceJobId: String(value.id),
    sourceUrl: safeSourceUrl(value.absolute_url, source, value.id),
    company: source.company,
    links: extractJobLinks(
      value.content,
      safeSourceUrl(value.absolute_url, source, value.id),
    ),
    initial: source.company[0],
    color: source.color,
    ...fields,
    experience: null,
    salary: null,

    updatedAt:
      typeof value.updated_at === "string" &&
      Number.isFinite(Date.parse(value.updated_at))
        ? new Date(value.updated_at).toISOString()
        : null,
    fetchedAt,
  };
}

const STACK = ["React", "TypeScript", "Next.js", "Node.js", "Figma", "Python", "Rust", "PostgreSQL"];
/** Stack names a text mentions; callers pass the role's own sections when known. */
export function stackTags(text: string): string[] {
  return STACK.filter((tag) => {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

export function postingFields(
  title: string,
  description: string,
  locationLabel: string,
) {
  const role: Role = classifyRole(title);
  const location: Location = classifyLocation(locationLabel);
  const tags = stackTags(description);
  return {
    title,
    description,
    locationLabel,
    role,
    roleLabel: roleLabels[role],
    location,
    tags,
  };
}
