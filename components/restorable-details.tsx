"use client";

import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from "react";

/** Native fragment navigation can open a disclosure before React hydrates it.
 * Adopt that existing DOM state, then register for history restoration. */
export function RestorableDetails({ open: initiallyOpen, onToggle, ...props }: ComponentProps<"details">) {
  const identity = useId();
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(() => {
    if (typeof document === "undefined") return !!initiallyOpen;
    const existing = document.querySelector<HTMLDetailsElement>(`details[data-disclosure-id="${CSS.escape(identity)}"]`);
    // React's stable useId matches this exact server element. No storage or
    // browser preference participates: only a native pre-hydration interaction.
    return existing ? existing.open : !!initiallyOpen;
  });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset.navigationReady = "true";
    document.dispatchEvent(new Event("nextstep:disclosure-ready"));
    return () => { delete node.dataset.navigationReady; };
  }, []);
  return <details {...props} ref={ref} data-disclosure-id={identity} open={open} onToggle={event => {
    setOpen(event.currentTarget.open);
    onToggle?.(event);
  }} />;
}
