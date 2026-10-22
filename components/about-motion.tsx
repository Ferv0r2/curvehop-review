"use client";

import { useEffect } from "react";

/**
 * Decorative motion for /about (DESIGN.md 제품 소개 랜딩 예외), added after the
 * page works without it:
 *
 * - Sections marked `data-reveal` rise in once when they scroll into view.
 *   Without JavaScript, or with reduced motion, nothing is ever hidden: the
 *   root only gets `data-motion` here, and what is already on screen is marked
 *   revealed first so it never blinks.
 * - The one looping animation (the hero lens float) pauses
 *   while off-screen or while the tab is hidden (`data-paused`), so they cost
 *   nothing when nobody sees them.
 *
 * Renders nothing; the page stays server-rendered.
 */
/** Elements whose CSS animation loops; tests/product-intro.test.ts checks every `infinite` animation on /about is one of these. */
export const LOOPING = ".hero-scene";

export function AboutMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".about-landing");
    if (!root || !("IntersectionObserver" in window)) return;
    const cleanups: (() => void)[] = [];

    // Every looping animation on the page: the hero lens float.
    const looping = [...root.querySelectorAll<HTMLElement>(LOOPING)];
    if (looping.length) {
      const visible = new Map(looping.map((el) => [el, true]));
      const sync = () => { for (const [el, seen] of visible) el.toggleAttribute("data-paused", !seen || document.hidden); };
      const watch = new IntersectionObserver((entries) => { for (const entry of entries) visible.set(entry.target as HTMLElement, entry.isIntersecting); sync(); });
      for (const el of looping) watch.observe(el);
      document.addEventListener("visibilitychange", sync);
      cleanups.push(() => { watch.disconnect(); document.removeEventListener("visibilitychange", sync); });
    }

    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const items = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
      const fold = window.innerHeight;
      for (const item of items) if (item.getBoundingClientRect().top < fold) item.classList.add("is-revealed");
      root.setAttribute("data-motion", "");
      const reveal = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-revealed");
          reveal.unobserve(entry.target);
        }
      }, { rootMargin: "0px 0px -8% 0px" });
      for (const item of items) if (!item.classList.contains("is-revealed")) reveal.observe(item);
      cleanups.push(() => { reveal.disconnect(); root.removeAttribute("data-motion"); });
    }
    return () => { for (const cleanup of cleanups) cleanup(); };
  }, []);
  return null;
}
