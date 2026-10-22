"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A page's section links that stay at the top of the screen once they scroll
 * past it, with the section being read marked. The nav itself becomes fixed
 * (its slot keeps the height), so it works inside any layout, grid included.
 * Links are ordinary anchors; without JavaScript this is the static list.
 */
export function SectionTabs({ label, children }: { label: string; children: ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = slot.current, bar = nav.current;
    if (!element || !bar) return;
    const links = [...bar.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = element.getBoundingClientRect().top;
      const isStuck = top < 0;
      setStuck(isStuck);
      if (!isStuck) setHeight(bar.offsetHeight);
      // The section being read: the last one whose top has passed under the bar.
      const offset = bar.offsetHeight + 24;
      let active: HTMLAnchorElement | undefined;
      for (const link of links) {
        const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
        // A section inside a closed disclosure has no box of its own; its summary marks the place.
        const place = target?.closest("details:not([open])") ?? target;
        if (place && place.getBoundingClientRect().top <= offset) active = link;
      }
      // At the very bottom a short last section never reaches the bar; it is the one being read.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
        active = links.findLast(link => document.getElementById(decodeURIComponent(link.hash.slice(1)))) ?? active;
      for (const link of links) {
        if (link === active && isStuck) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
      // On a phone the stuck row scrolls sideways; keep the current section in view.
      const inner = bar.querySelector<HTMLElement>(".section-tabs-inner") ?? bar;
      if (active && isStuck && inner.scrollWidth > inner.clientWidth) {
        const left = active.offsetLeft - inner.clientWidth / 2 + active.offsetWidth / 2;
        if (Math.abs(inner.scrollLeft - left) > 8) inner.scrollLeft = left;
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={slot} className="section-tabs-slot" style={stuck ? { height } : undefined}>
      <nav ref={nav} className={`reading-nav section-tabs${stuck ? " is-stuck" : ""}`} aria-label={label}>
        <div className="section-tabs-inner">{children}</div>
      </nav>
    </div>
  );
}
