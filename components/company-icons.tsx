"use client";

import { createContext, type ReactNode } from "react";

/** Servable collected icons by company ID (lib/company-icon-src.ts), for every CompanyMark on the page. */
// Limit: the root layout persists across client navigation, so a newly collected icon appears only after a full reload.
export const CompanyIconsContext = createContext<Readonly<Record<string, string>>>({});

export function CompanyIconsProvider({ icons, children }: { icons: Readonly<Record<string, string>>; children: ReactNode }) {
  return <CompanyIconsContext.Provider value={icons}>{children}</CompanyIconsContext.Provider>;
}
