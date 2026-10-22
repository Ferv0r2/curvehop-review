"use client";
import { useEffect, useState } from "react";

/**
 * "위로" for long lists: appears after one screen of scrolling. Returns to the
 * top and puts focus on the main content, so keyboard users start over there.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; setShown(scrollY > innerHeight); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", schedule, { passive: true });
    return () => { removeEventListener("scroll", schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
  if (!shown) return null;
  return (
    <button
      type="button"
      className="back-to-top"
      onClick={() => {
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        document.getElementById("main")?.focus({ preventScroll: true });
      }}
    >
      <span aria-hidden="true">↑</span> 위로
    </button>
  );
}
