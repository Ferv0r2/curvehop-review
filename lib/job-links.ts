export type JobLink = { text: string; url: string };
/** Links are cited attachments, not proof that their destination is company-owned. */
export function safeJobLinks(input: unknown): JobLink[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const links: JobLink[] = [];
  for (const item of input.slice(0, 200)) {
    if (
      !item ||
      typeof item.text !== "string" ||
      !item.text.trim() ||
      item.text.length > 500 ||
      typeof item.url !== "string" ||
      item.url.length > 2048
    )
      continue;
    try {
      const url = new URL(item.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        seen.has(url.href)
      )
        continue;
      seen.add(url.href);
      links.push({ text: item.text.trim(), url: url.href });
    } catch {
      /* Invalid attachments do not invalidate a vacancy. */
    }
    if (links.length === 50) break;
  }
  return links;
}

/** Display-only: a destination is not a verified publisher or a document title. */
export function jobLinkPresentation(input: unknown) {
  const links = safeJobLinks(input).map(link => {
    const text = link.text.replace(/\s*[↗→]$/u, "").trim();
    const generic = /^(?:link|url|링크|바로가기)$/i.test(text) || /^https?:\/\/\S+$/i.test(text);
    return { link, generic, host: new URL(link.url).host };
  });
  const totals = new Map<string, number>();
  for (const { generic, host } of links) {
    if (generic) totals.set(host, (totals.get(host) ?? 0) + 1);
  }
  const positions = new Map<string, number>();
  return links.map(({ link, generic, host }) => {
    if (!generic) return { ...link, label: link.text };
    const position = (positions.get(host) ?? 0) + 1;
    positions.set(host, position);
    return { ...link, label: totals.get(host)! > 1 ? `${host} · 링크 ${position}` : host };
  });
}
