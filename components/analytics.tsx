"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ANALYTICS_CONSENT_KEY, analyticsEnabled, analyticsPath, readingProgress, refusedAnalytics, type AnalyticsAction, type AnalyticsPageContext } from "@/lib/analytics";
import { analyticsMeasurementId, analyticsSession, configureAnalytics, prepareAnalytics, setAnalyticsConsent, subscribeAnalytics, syncAnalyticsDefaults, trackAnalytics } from "@/lib/analytics-client";

/** Called only on successfully resolved pages, using server-validated IDs. */
export function AnalyticsPage({ page, resultCount }: { page: AnalyticsPageContext; resultCount?: number }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = JSON.stringify(page);
  const context = useRef(page);
  context.current = page;
  const token = useRef<object>({});
  const previousKey = useRef("");
  if (previousKey.current !== key) { previousKey.current = key; token.current = {}; }
  const owner = token.current;
  const resultKey = `${pathname}?${(search?.toString() ?? "")}`; // local dedup only, NEVER transmitted
  const results = useRef({ key: resultKey, count: resultCount });
  results.current = { key: resultKey, count: resultCount };
  useEffect(() => {
    if (pathname !== analyticsPath(context.current)) return;
    const session = analyticsSession();
    session.enter(owner, context.current);
    syncAnalyticsDefaults();
    const report = () => { if (results.current.count !== undefined) session.results(owner, results.current.key, results.current.count); };
    report();
    const unsubscribe = subscribeAnalytics(report);
    // BFCache restores are new visits, unlike a React effect replay.
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) { session.restore(owner); syncAnalyticsDefaults(); report(); }
    };
    window.addEventListener("pageshow", restored);
    return () => { unsubscribe(); window.removeEventListener("pageshow", restored); session.leave(owner); };
  }, [key, pathname, owner]);
  useEffect(() => {
    if (resultCount !== undefined) analyticsSession().results(owner, resultKey, resultCount);
  }, [owner, resultKey, resultCount]);
  useEffect(() => {
    if (page.page_type !== "reading") return;
    const session = analyticsSession();
    let progress = { milliseconds: 0, midpoint: false };
    let last = performance.now();
    let wasVisible = !document.hidden;
    let wasActive = session.active();
    const sample = () => {
      const now = performance.now();
      const active = session.active() && session.owns(owner);
      if (!active) progress = { milliseconds: 0, midpoint: false };
      const answer = document.querySelector(".reader-answer");
      const bounds = answer?.getBoundingClientRect();
      const midpoint = !!bounds && bounds.top + bounds.height / 2 <= innerHeight && bounds.bottom > 0;
      const next = readingProgress(progress, now - last, active && wasActive && wasVisible, midpoint);
      progress = next;
      if (next.engaged) session.engaged(owner);
      last = now; wasVisible = !document.hidden; wasActive = active;
    };
    const restoreProgress = (event: PageTransitionEvent) => { if (event.persisted) { progress = { milliseconds: 0, midpoint: false }; last = performance.now(); wasVisible = !document.hidden; wasActive = session.active(); } };
    window.addEventListener("pageshow", restoreProgress);
    const unsubscribe = subscribeAnalytics(sample);
    const timer = window.setInterval(sample, 1000);
    document.addEventListener("visibilitychange", sample);
    window.addEventListener("scroll", sample, { passive: true });
    return () => { unsubscribe(); window.removeEventListener("pageshow", restoreProgress); clearInterval(timer); document.removeEventListener("visibilitychange", sample); window.removeEventListener("scroll", sample); };
  }, [owner, page.page_type]);
  return null;
}

/** Measurement is on by default on curvehop.net, disclosed in /privacy with the ways to refuse it. */
export function AnalyticsLoader() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!analyticsEnabled(analyticsMeasurementId, location.hostname)) return;
    let refused = false;
    try { refused = refusedAnalytics(localStorage.getItem(ANALYTICS_CONSENT_KEY)); } catch { /* unreadable storage: like a first visit */ }
    prepareAnalytics();
    setAnalyticsConsent(!refused); // a refusal also deletes this site's analytics cookies
    setEnabled(!refused);
  }, []);
  // A route with no validated AnalyticsPage must not inherit the previous company.
  useEffect(() => {
    const page = analyticsSession().page();
    if (page && analyticsPath(page) !== pathname) { analyticsSession().clear(); syncAnalyticsDefaults(); }
  }, [pathname]);
  useEffect(() => {
    if (!enabled) return;
    const clicked = (event: MouseEvent) => {
      if ((event.type === "click" && event.button !== 0) || (event.type === "auxclick" && event.button !== 1)) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-analytics]") : null;
      if (!link) return;
      const d = link.dataset;
      const action = d.analytics === "content_select" ? { name: d.analytics, destination_type: d.destinationType,
        destination_id: d.destinationId, destination_company_id: d.destinationCompanyId, placement: d.placement,
        navigation_mode: event.button === 1 || event.metaKey || event.ctrlKey || event.shiftKey || link.target === "_blank" ? "new_tab" : "same_tab" }
        : d.analytics === "official_job_open" ? { name: d.analytics, job_id: d.jobId, placement: d.placement }
        : { name: d.analytics, placement: d.placement };
      // Runtime contract validates every field and drops extras. Next Link prevents its
      // own native default; this records selection, not successful destination arrival.
      trackAnalytics(action as AnalyticsAction);
    };
    document.addEventListener("click", clicked);
    document.addEventListener("auxclick", clicked);
    return () => { document.removeEventListener("click", clicked); document.removeEventListener("auxclick", clicked); };
  }, [enabled]);
  if (!enabled) return null;
  return <Script id="curvehop-ga" src={`https://www.googletagmanager.com/gtag/js?id=${analyticsMeasurementId}`} strategy="afterInteractive" referrerPolicy="no-referrer" onReady={configureAnalytics} />;
}
