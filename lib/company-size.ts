import type { CompanyResearch, ResearchPack } from "./research";
import { citedSources } from "./research-labels";
import { isWorkplacePension } from "./headcount-timeline";
import { bandFor, type SizeBand } from "./company-size-bands";

export type WorkplaceCount = { value: number; month: string };

/**
 * The newest month's same-workplace pension subscriber count, as published.
 * A month checked again later uses the later value, as the chart does.
 * Counts without a resolvable source are not used.
 */
export function workplacePension(company?: CompanyResearch): WorkplaceCount | null {
  if (!company) return null;
  const latest = company.headcount
    .map((record, index) => ({ record, index, sources: citedSources(company, record.evidenceIds) }))
    .filter(({ record, sources }) => isWorkplacePension(company, record) && sources.length > 0)
    .map(o => ({ ...o, month: o.record.referenceOn.slice(0, 7), checkedOn: o.sources.map(s => s.checkedOn).sort().at(-1)! }))
    .toSorted((a, b) => a.month.localeCompare(b.month) || a.checkedOn.localeCompare(b.checkedOn) || a.index - b.index)
    .at(-1);
  return latest ? { value: latest.record.value, month: latest.month } : null;
}

export const sizeBand = (company?: CompanyResearch): SizeBand | null => {
  const count = workplacePension(company);
  return count ? bandFor(count.value) : null;
};

/** Band per company id; companies missing here have no usable count. */
export function companySizes(pack?: ResearchPack): Map<string, SizeBand> {
  const sizes = new Map<string, SizeBand>();
  for (const company of pack?.companies ?? []) {
    const band = sizeBand(company);
    if (band) sizes.set(company.id, band);
  }
  return sizes;
}
