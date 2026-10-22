import { htmlToText, postingFields, extractJobLinks } from "./greenhouse";
import { safeJobLinks } from "./job-links";
import type { Job } from "./jobs";
import type { Source } from "./sources";

export function normalizeLever(
  raw: unknown,
  source: Source,
  fetchedAt: string,
): Job {
  if (!raw || typeof raw !== "object")
    throw new Error("잘못된 Lever 공고입니다.");
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    !/^[a-z\d-]{1,100}$/i.test(value.id) ||
    typeof value.text !== "string" ||
    !value.text.trim() ||
    value.text.length > 500 ||
    typeof value.hostedUrl !== "string"
  )
    throw new Error("Lever 공고 ID, 제목 또는 URL이 잘못되었습니다.");
  const url = new URL(value.hostedUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname !== "jobs.lever.co" ||
    url.pathname !== `/${source.board}/${value.id}`
  )
    throw new Error("허용되지 않은 Lever 원문 URL입니다.");
  const parts: string[] = [];
  const links: { text: string; url: string }[] = [];
  const append = (html: unknown, plain?: unknown) => {
    if (typeof html === "string")
      links.push(...extractJobLinks(html, url.href));
    if (typeof html === "string" && html.trim()) parts.push(htmlToText(html));
    else if (typeof plain === "string") parts.push(plain.trim());
  };
  append(value.description, value.descriptionPlain);
  if (value.lists !== undefined && !Array.isArray(value.lists))
    throw new Error("Lever 본문 목록이 잘못되었습니다.");
  for (const list of (value.lists ?? []) as {
    text?: unknown;
    content?: unknown;
  }[]) {
    if (!list || typeof list.content !== "string")
      throw new Error("Lever 본문 항목이 잘못되었습니다.");
    append(list.text);
    append(list.content);
  }
  append(value.additional, value.additionalPlain);
  const description = parts.filter(Boolean).join("\n\n");
  if (!description || description.length > 250000)
    throw new Error("Lever 본문이 비어 있거나 너무 큽니다.");
  const categories = value.categories as
    { location?: unknown; allLocations?: unknown } | undefined;
  const locations = [
    categories?.location,
    ...(Array.isArray(categories?.allLocations) ? categories.allLocations : []),
  ].filter((item): item is string => typeof item === "string" && !!item.trim());
  const locationLabel =
    [...new Set(locations)].map(htmlToText).join("; ") || "원문 확인";
  const title = htmlToText(value.text);
  if (!title) throw new Error("Lever 제목이 비어 있습니다.");
  return {
    id: `lever-${source.board}-${value.id}`,
    source: "lever",
    sourceBoard: source.board,
    sourceJobId: value.id,
    sourceUrl: url.href,
    company: source.company,
    links: safeJobLinks(links),
    initial: source.company[0],
    color: source.color,
    ...postingFields(title, description, locationLabel),
    workplaceType:
      value.workplaceType === "remote" ||
      value.workplaceType === "hybrid" ||
      value.workplaceType === "on-site"
        ? value.workplaceType
        : undefined,
    experience: null,
    salary: null,
    updatedAt: null,
    fetchedAt,
  };
}
