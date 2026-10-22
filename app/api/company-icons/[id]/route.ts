import { readPublishedResearch } from "@/lib/published-data";
import { discoveredEntries, discoveredCompanies } from "@/lib/sources";
import { companyIconResponse } from "@/lib/company-icon-collector";

import { registeredCompanies } from "@/lib/discovered-sources";
const registrations = new Map(registeredCompanies({ version: 1, sources: discoveredEntries, companies: discoveredCompanies }).map(entry => [entry.id, entry]));

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params, source = new URL(request.url).searchParams.get("source");
  const entry = registrations.get(id);
  const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!entry || entry.receipt.hash !== source) return missing();
  const research = await readPublishedResearch();
  if (research.status !== "ok") return missing();
  const company = research.pack.companies.find(company => company.id === id), icon = company?.icon;
  return companyIconResponse(icon, company?.onboarding?.discoveryReceiptHash, source);
}
