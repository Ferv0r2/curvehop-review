"use client";

import type { ReactNode } from "react";

/** An in-page link to a collapsed section that opens it first. Without
 * JavaScript it is a plain anchor to the section. */
export function OpenDetailsLink({
  target,
  anchor = target,
  children,
  className,
}: {
  /** The details element to open. */
  target: string;
  /** Where to land inside it; defaults to the details itself. */
  anchor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={`#${anchor}`}
      onClick={() => {
        const node = document.getElementById(target);
        if (node instanceof HTMLDetailsElement) node.open = true;
      }}
    >
      {children}
    </a>
  );
}
