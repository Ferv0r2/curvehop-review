/** Product measurement contract v1. No text, query strings, preferences or user IDs. */
export const ANALYTICS_VERSION = "1";
/** Consent-era record (2026-10-11 to 10-12). A stored "denied" choice still keeps measurement off. */
export const ANALYTICS_CONSENT_KEY = "curvehop:analytics-consent:v1";
export const pageTypes = ["discover", "companies", "company", "reading", "jobs", "job", "saved", "about"] as const;
export type PageType = typeof pageTypes[number];
export type AnalyticsPageContext = {
  page_type: PageType;
  content_id?: string;
  company_id?: string;
  topic?: "vision" | "culture" | "work" | "process" | "business";
};
export type AnalyticsAction =
  | { name: "content_select"; destination_type: "reading" | "company" | "job"; destination_id: string; destination_company_id?: string; placement: "card" | "bridge" | "company_link"; navigation_mode: "same_tab" | "new_tab" }
  | { name: "bookmark_change"; job_id: string; action: "add" | "remove" }
  | { name: "official_job_open"; job_id: string; placement: "top" | "bottom" }
  | { name: "source_open"; placement: "reading_source" };
export type AnalyticsParams = Record<string, string | number | boolean>;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/;
const topics = ["vision", "culture", "work", "process", "business"];
export const validAnalyticsId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
export function analyticsEnabled(id: string | undefined, hostname: string) {
  return !!id && /^G-[A-Z0-9]{6,20}$/.test(id) && hostname === "curvehop.net";
}
export function analyticsContext(input: AnalyticsPageContext): AnalyticsPageContext | null {
  if (!pageTypes.includes(input.page_type)) return null;
  if ([input.content_id, input.company_id].some(v => v !== undefined && !validAnalyticsId(v))) return null;
  if (input.topic !== undefined && !topics.includes(input.topic)) return null;
  if (["company", "reading", "job"].includes(input.page_type) && !input.content_id) return null;
  return { page_type: input.page_type, ...(input.content_id ? { content_id: input.content_id } : {}), ...(input.company_id ? { company_id: input.company_id } : {}), ...(input.topic ? { topic: input.topic } : {}) };
}
export function analyticsPath(page: AnalyticsPageContext) {
  const roots = { company: "companies", reading: "read", job: "jobs" } as const;
  return page.page_type in roots
    ? `/${roots[page.page_type as keyof typeof roots]}/${page.content_id}`
    : `/${page.page_type}`;
}
/** Referrer query/path can contain search text. Only the external origin is retained. */
export function analyticsReferrer(raw: string) {
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : "";
  } catch { return ""; }
}
export function analyticsAction(input: AnalyticsAction): AnalyticsParams | null {
  switch (input.name) {
    case "bookmark_change":
      return validAnalyticsId(input.job_id) && ["add", "remove"].includes(input.action)
        ? { job_id: input.job_id, action: input.action } : null;
    case "official_job_open":
      return validAnalyticsId(input.job_id) && ["top", "bottom"].includes(input.placement)
        ? { job_id: input.job_id, placement: input.placement } : null;
    case "source_open":
      return input.placement === "reading_source" ? { placement: input.placement } : null;
    case "content_select":
      if (!validAnalyticsId(input.destination_id) || !["reading", "company", "job"].includes(input.destination_type)
        || !["card", "bridge", "company_link"].includes(input.placement)
        || !["same_tab", "new_tab"].includes(input.navigation_mode)
        || (input.destination_company_id !== undefined && !validAnalyticsId(input.destination_company_id))) return null;
      return { destination_type: input.destination_type, destination_id: input.destination_id,
        ...(input.destination_company_id ? { destination_company_id: input.destination_company_id } : {}),
        placement: input.placement, navigation_mode: input.navigation_mode };
    default: return null;
  }
}
/** Measurement is on by default and disclosed in /privacy. A visitor who refused the old consent card stays out, however old the record. */
export function refusedAnalytics(legacyConsent: string | null) {
  try { return JSON.parse(legacyConsent ?? "null")?.choice === "denied"; } catch { return false; }
}

/** Accumulate only visible, consented time. Geometry is midpoint reached, not article intersection ratio. */
export function readingProgress(previous: { milliseconds: number; midpoint: boolean }, delta: number, visible: boolean, midpoint: boolean) {
  const next = { milliseconds: previous.milliseconds + (visible ? Math.max(0, delta) : 0), midpoint: previous.midpoint || (visible && midpoint) };
  return { ...next, engaged: next.milliseconds >= 30000 && next.midpoint };
}

/** A page entry owns context; stale unmounts cannot clear a newer entry. No event backlog. */
export function createAnalyticsSession(send: (name: string, params: AnalyticsParams) => void, referrer = "") {
  type Entry = { token: object; page: AnalyticsPageContext; viewed: boolean; engaged: boolean; resultsKey?: string };
  let current: Entry | null = null;
  let granted = false;
  let ready = false;
  // Strict Mode setup/cleanup replay retains the same token without recounting it.
  const entries = new WeakMap<object, Entry>();
  let previousPath = analyticsReferrer(referrer);
  let entryReferrer = previousPath;
  const defaults = () => ({ page_location: `https://curvehop.net${current ? analyticsPath(current.page) : "/"}`,
    page_referrer: entryReferrer, page_title: `Curvehop · ${current?.page.page_type ?? "page"}` });
  const emit = (name: string, params: AnalyticsParams = {}) => {
    if (!granted || !ready || !current) return;
    send(name, { ...current.page, ...params, ...defaults(), contract_version: ANALYTICS_VERSION });
  };
  const view = () => {
    if (current && granted && ready && !current.viewed) {
      emit("page_view"); current.viewed = true;
      previousPath = `https://curvehop.net${analyticsPath(current.page)}`;
    }
  };
  return {
    defaults,
    active: () => granted && ready && !!current,
    page: () => current?.page ?? null,
    owns: (token: object) => current?.token === token,
    consent(value: boolean) { granted = value; view(); },
    ready(value: boolean) { ready = value; view(); },
    enter(token: object, input: AnalyticsPageContext) {
      const page = analyticsContext(input);
      if (!page) { current = null; return; }
      if (current?.token === token) return;
      const old = entries.get(token);
      if (!old) {
        entryReferrer = previousPath;
      }
      current = old ?? { token, page, viewed: false, engaged: false };
      entries.set(token, current); view();
    },
    leave(token: object) { if (current?.token === token) current = null; },
    clear() { current = null; },
    restore(token: object) { if (current?.token === token) { current.viewed = false; current.engaged = false; current.resultsKey = undefined; view(); } },
    action(action: AnalyticsAction) {
      const params = analyticsAction(action);
      if (!params) return;
      if (action.name === "content_select") params.cross_company = !!current?.page.company_id && !!action.destination_company_id && current.page.company_id !== action.destination_company_id;
      emit(action.name, params);
    },
    results(token: object, key: string, count: number) {
      if (!current || current.token !== token || !granted || !ready || current.resultsKey === key || !Number.isFinite(count) || count < 0) return;
      current.resultsKey = key;
      emit("results_view", { result_state: count === 0 ? "zero" : "nonzero" });
    },
    engaged(token: object) {
      if (!current || current.token !== token || current.page.page_type !== "reading" || current.engaged || !granted || !ready) return;
      current.engaged = true; emit("reading_engaged");
    },
  };
}
