"use client";

import type { ReactNode } from "react";

/** Markers open the in-chart disclosure and scroll only its bounded list. */
export function HeadcountInteractions({ children }: { children: ReactNode }) {
  return <div className="headcount-timeline" onClick={event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-timeline-event]');
    if (!button) return;
    const root = event.currentTarget;
    const detail = root.querySelector<HTMLDetailsElement>(`details[data-timeline-fact="${CSS.escape(button.dataset.timelineEvent!)}"]`);
    const list = root.querySelector<HTMLElement>('.headcount-events');
    if (!detail || !list) return;
    detail.open = true;
    const top = detail.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTo({ top: Math.max(0, top - 8), behavior: 'instant' });
  }}>{children}</div>;
}
