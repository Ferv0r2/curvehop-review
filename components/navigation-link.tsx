"use client";

import NextLink, { useLinkStatus } from "next/link";
import { useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";

function PendingNavigation() {
  const { pending } = useLinkStatus();
  // Keep the existing article visible while the server answers. A portal keeps
  // the indicator fixed even when the clicked card has a CSS transform.
  return pending ? createPortal(
    <div className="route-pending" data-route-pending role="status">
      <span className="route-pending-label">페이지를 불러오고 있어요</span>
    </div>,
    document.body,
  ) : null;
}

/** Full prefetch on intent, not for every company/job entering the viewport. */
export default function NavigationLink({ children, prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false);
  return <NextLink
    {...props}
    prefetch={prefetch ?? intent}
    onMouseEnter={event => { onMouseEnter?.(event); if (!event.defaultPrevented) setIntent(true); }}
    onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) setIntent(true); }}
    onTouchStart={event => { onTouchStart?.(event); if (!event.defaultPrevented) setIntent(true); }}
  >
    {children}
    <PendingNavigation />
  </NextLink>;
}
