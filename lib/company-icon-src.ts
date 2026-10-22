import { discoveredEntries, discoveredCompanies } from "./sources";
import { registeredCompanies } from "./discovered-sources";
import { servableCompanyIcon } from "./company-icon-collector";
import type { ResearchPack } from "./research";

const registrations = registeredCompanies({ version: 1, sources: discoveredEntries, companies: discoveredCompanies });

/**
 * Local icon addresses by company ID, only for icons `/api/company-icons/[id]`
 * would serve (same registration, same research pack, same predicate). A
 * company left out keeps its initial, with no request that fails. Server only:
 * verifying the bytes needs Node.
 */
export function companyIconSources(pack: ResearchPack | undefined): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const entry of registrations) {
    const company = pack?.companies.find(c => c.id === entry.id);
    if (company && servableCompanyIcon(company.icon, company.onboarding?.discoveryReceiptHash, entry.receipt.hash))
      sources[entry.id] = `/api/company-icons/${entry.id}?source=${entry.receipt.hash}`;
  }
  return sources;
}
