"use client";
import { useEffect } from "react";

/**
 * On phones the topic filters are one horizontal row; keep the selected topic
 * visible in it (e.g. after "모두 보기" or a direct link) without moving the
 * page or focus.
 */
export function RevealActiveTab({ row, active }: { row: string; active: string }) {
  useEffect(() => {
    const container = document.querySelector<HTMLElement>(row);
    const tab = container?.querySelector<HTMLElement>("[aria-current]");
    if (!container || !tab || container.scrollWidth <= container.clientWidth) return;
    const start = tab.offsetLeft - container.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < container.scrollLeft || end > container.scrollLeft + container.clientWidth)
      container.scrollLeft = Math.max(0, start - (container.clientWidth - tab.offsetWidth) / 2);
  }, [row, active]);
  return null;
}
