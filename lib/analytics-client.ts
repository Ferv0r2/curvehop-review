"use client";
import { createAnalyticsSession, type AnalyticsAction } from "./analytics";

type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag } }
const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
let session: ReturnType<typeof createAnalyticsSession> | undefined;
let granted = false;
let configured = false;
const listeners = new Set<() => void>();
export const analyticsMeasurementId = measurementId;
export function analyticsSession() {
  return session ??= createAnalyticsSession((name, params) => {
    if (granted) googleCommand("event", name, { ...params, send_to: measurementId, ...debugParameters() });
  }, typeof document === "undefined" ? "" : document.referrer);
}
function debugParameters() {
  try { return sessionStorage.getItem("curvehop:analytics-debug") === "1" ? { debug_mode: true, test_traffic: true } : {}; }
  catch { return {}; }
}
// Third-party failures never turn a successful bookmark or navigation into an error.
function googleCommand(...args: unknown[]) {
  try { window.gtag?.(...args); return typeof window.gtag === "function"; }
  catch { return false; }
}
function disable(value: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = value;
}
export function prepareAnalytics() {
  window.dataLayer ??= [];
  window.gtag ??= function () { window.dataLayer!.push(arguments); };
  disable(!granted);
}
export function configureAnalytics() {
  if (!granted) return;
  prepareAnalytics();
  if (!configured) {
    if (!googleCommand("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" })) return;
    if (!googleCommand("js", new Date())) return;
    if (!googleCommand("set", analyticsSession().defaults())) return;
    const success = googleCommand("config", measurementId, { send_page_view: false,
      allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_prefix: "ch", cookie_expires: 90 * 86400, cookie_update: false, ...debugParameters() });
    if (!success) return;
    configured = true;
  }
  syncAnalyticsDefaults();
  analyticsSession().ready(true);
  listeners.forEach(fn => fn());
}
export function syncAnalyticsDefaults() {
  if (configured && granted) googleCommand("set", analyticsSession().defaults());
}
export function setAnalyticsConsent(value: boolean) {
  granted = value;
  disable(!value);
  analyticsSession().consent(value);
  if (!value) {
    // Delete only cookies owned by this integration; bookmarks/preferences remain intact.
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (!/^ch_ga(?:_[A-Z0-9]+)?$/.test(name)) continue;
      for (const domain of ["", "; domain=curvehop.net", "; domain=.curvehop.net"]) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`;
      }
    }
  }
  listeners.forEach(fn => fn());
}
export function subscribeAnalytics(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function trackAnalytics(action: AnalyticsAction) { analyticsSession().action(action); }
