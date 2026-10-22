"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { SizeBand } from "@/lib/company-size-bands";
import {
  historyEntryKey, navigationMemoryKey, navigationRoute, parseNavigationMemory,
  type NavigationMemory, type PagePosition,
} from "@/lib/navigation-memory";

const currentUrl = () => location.pathname + location.search + location.hash;
function detailsOnPage() {
  return [...document.querySelectorAll<HTMLDetailsElement>("main details:not(.preference-bar)")].map((node, index) => ({
    node,
    key: node.id || node.querySelector(":scope > section[id]")?.id || `${index}:${node.querySelector(":scope > summary")?.textContent?.trim()}`,
  }));
}

/** Horizontally scrolling rows (e.g. /discover shelves on phones), by key. */
function rowsOnPage() {
  return Object.fromEntries([...document.querySelectorAll<HTMLElement>("main [data-scroll-row]")]
    .map((node) => [node.dataset.scrollRow!, Math.round(node.scrollLeft)]));
}
function restoreRows(rows: Record<string, number> | undefined) {
  if (!rows) return;
  for (const node of document.querySelectorAll<HTMLElement>("main [data-scroll-row]")) {
    const left = rows[node.dataset.scrollRow!];
    if (left !== undefined) node.scrollLeft = left;
  }
}

/** Supplement native/Next history restoration without replacing their router.
 * Only return links and known history entries restore; new reading starts fresh. */
export function NavigationMemory({ preferredRole, preferredSizes }: { preferredRole: string; preferredSizes: SizeBand[] }) {
  const sizesKey = preferredSizes.join(",");
  const freshEntry = useRef<string | undefined>(undefined);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useLayoutEffect(() => {
    const route = navigationRoute(location.href, preferredRole, preferredSizes);
    let memory: NavigationMemory;
    try {
      memory = parseNavigationMemory(sessionStorage.getItem(navigationMemoryKey));
      sessionStorage.setItem(navigationMemoryKey, JSON.stringify(memory));
    } catch {
      // Storage-disabled browsers keep their normal native/Next behavior.
      return;
    }
    let active: PagePosition;
    let restoring = false;
    let frame = 0;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let applyPendingRestore: (() => boolean) | undefined;
    const persist = () => {
      try { sessionStorage.setItem(navigationMemoryKey, JSON.stringify(memory)); }
      catch { /* Storage quota/privacy changes must never block navigation. */ }
    };
    const persistPosition = () => {
      if (!active) return;
      try { memory = parseNavigationMemory(sessionStorage.getItem(navigationMemoryKey)); } catch { return; }
      memory.entries = [...memory.entries.filter(e => e.id !== active.id), active].slice(-40);
      persist();
    };
    const capture = () => {
      if (!active || restoring) return;
      active = { ...active, x: scrollX, y: scrollY, details: Object.fromEntries(detailsOnPage().map(({node, key}) => [key, node.open])), rows: rowsOnPage(), savedAt: Date.now() };
    };
    const save = () => { capture(); persistPosition(); };
    const stopRestore = () => { generation++; cancelAnimationFrame(frame); restoring = false; applyPendingRestore = undefined; };
    const restore = (snapshot: PagePosition) => {
      stopRestore();
      restoring = true;
      const token = generation;
      const apply = () => {
        if (token !== generation) return false;
        if (document.querySelector('main [data-navigation-pending="true"]')) return false;
        const disclosures = detailsOnPage();
        // A root layout can commit before a streamed page hydrates. Wait for
        // each disclosure owner rather than mutating its server HTML early.
        if (disclosures.some(({ node }) => node.dataset.navigationReady !== "true")) return false;
        for (const { node, key } of disclosures) {
          if (Object.hasOwn(snapshot.details, key)) node.open = snapshot.details[key];
        }
        window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: "instant" });
        restoreRows(snapshot.rows);
        return true;
      };
      applyPendingRestore = apply;
      apply();
      // Native popstate restoration and late font metrics can run after commit.
      // Stop correcting immediately when the user starts their own interaction.
      frame = requestAnimationFrame(() => {
        apply();
        frame = requestAnimationFrame(() => { restoring = !apply(); });
      });
      const started = performance.now();
      void document.fonts.ready.then(() => {
        if (token === generation && performance.now() - started < 1500) apply();
      });
    };
    const enter = (restoreSaved = true) => {
      try { memory = parseNavigationMemory(sessionStorage.getItem(navigationMemoryKey)); } catch { return; }
      const url = currentUrl();
      let id = history.state?.[historyEntryKey];
      const saved = memory.entries.find(e => e.id === id && e.url === url && e.route === route);
      if (!saved) id = crypto.randomUUID();
      const returning = memory.returning;
      const previous = returning?.route === route && returning.expires > Date.now()
        ? memory.entries.find(e => e.id === returning.id && e.route === route) : undefined;
      delete memory.returning;
      active = saved ?? { id, url, route, x: 0, y: 0, details: {}, savedAt: Date.now() };
      // Preserve every framework-owned history field.
      history.replaceState({ ...history.state, [historyEntryKey]: id }, "");
      const snapshot = saved ?? previous;
      if (!snapshot) freshEntry.current = id;
      if (snapshot && restoreSaved) {
        freshEntry.current = undefined;
        active = { ...active, x: snapshot.x, y: snapshot.y, details: snapshot.details, rows: snapshot.rows };
        restore(active);
      }
      else save();
      persist();
    };
    const onDisclosureReady = () => {
      if (applyPendingRestore?.()) restoring = false;
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      stopRestore();
      save();
      if (anchor.origin !== location.origin) return;
      if (anchor.hasAttribute("data-restore-scroll")) {
        const target = navigationRoute(anchor.href, preferredRole, preferredSizes);
        const snapshot = [...memory.entries].reverse().find(e => e.route === target);
        if (snapshot) { memory.returning = { route: target, id: snapshot.id, expires: Date.now() + 10_000 }; persist(); }
      }
    };
    const onScroll = () => {
      if (restoring || navigationRoute(location.href, preferredRole, preferredSizes) !== route) return;
      capture();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persistPosition, 120);
    };
    const onRowScroll = (event: Event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.dataset.scrollRow) return;
      onScroll();
    };
    const onToggle = () => { if (navigationRoute(location.href, preferredRole, preferredSizes) === route) save(); };
    const onPageHide = () => { stopRestore(); save(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) enter(); };
    const onPopState = () => {
      // Same-route traversals do not rerun the route effect.
      stopRestore();
      save();
      if (navigationRoute(location.href, preferredRole, preferredSizes) === route) {
        frame = requestAnimationFrame(() => enter());
      }
    };
    const onHashChange = () => {
      if (navigationRoute(location.href, preferredRole, preferredSizes) === route) {
        // Native fragment changes can emit both popstate and hashchange.
        // Enter once: a second enter would restore the new entry's starting
        // position and cancel the browser's in-flight smooth anchor scroll.
        if (active?.url === currentUrl() && active.id === history.state?.[historyEntryKey]) return;
        stopRestore();
        enter();
      }
    };
    // Strict Mode replays this effect on the same visit. Restoring its newly
    // captured position would interrupt an initial native fragment scroll.
    enter(freshEntry.current === undefined || freshEntry.current !== history.state?.[historyEntryKey]);
    document.addEventListener("nextstep:disclosure-ready", onDisclosureReady);
    document.addEventListener("click", onClick, true);
    document.addEventListener("toggle", onToggle, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    // Row scrolls do not bubble; capture them so a swiped shelf is remembered.
    document.addEventListener("scroll", onRowScroll, { passive: true, capture: true });
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState, true);
    window.addEventListener("hashchange", onHashChange);
    const cancelEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const type of cancelEvents) window.addEventListener(type, stopRestore, { passive: true });
    return () => {
      // Next can synchronously commit a traversal before our popstate listener.
      // Flush the outgoing position here; the new route restores in its layout effect.
      if (active && !restoring) active = { ...active, x: scrollX, y: scrollY, savedAt: Date.now() };
      persistPosition();
      stopRestore();
      clearTimeout(saveTimer);
      document.removeEventListener("nextstep:disclosure-ready", onDisclosureReady);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("toggle", onToggle, true);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onRowScroll, { capture: true });
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState, true);
      window.removeEventListener("hashchange", onHashChange);
      for (const type of cancelEvents) window.removeEventListener(type, stopRestore);
    };
  }, [pathname, search, preferredRole, sizesKey]);
  return null;
}
