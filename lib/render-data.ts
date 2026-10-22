import "server-only";
import { cache } from "react";
import { readPublishedCatalog, readPublishedResearch } from "./published-data";

// One revision check per RSC render; public revision cache reuses stable data
// across requests. Cookies and filtered results never enter either cache.
export const readRenderSnapshot = cache(readPublishedCatalog);
export const readRenderResearch = cache(readPublishedResearch);
