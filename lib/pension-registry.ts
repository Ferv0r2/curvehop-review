import { publicDataIdentities, validPublicDataIdentity, type PublicDataIdentity } from "./public-data-identity";
import reviewed from "../data/pension-roster-review.json";
import snapshots from "../data/pension-identities.json";

export type PensionIdentity = { companyId: string; name: string; prefix: string; address: string; identityEvidence: string; strictAddress?: true; addressRule?: "published-road-v1" };
export type PensionRosterReview = {
  companyId: string; status: "verified" | "blocked"; legalName: string | null; businessNumber: string | null;
  address: string | null; sourceUrl: string | null; title: string; excerpt: string; checkedOn: string;
  candidateName: string | null; candidatePrefix: string | null; candidateAddress: string | null;
  notes: string; identityEvidence?: string; identityMapping?: string;
};
export const pensionRosterReview = reviewed as PensionRosterReview[];
// Append versions; never edit or delete a snapshot used by an archived receipt.
// Current review decisions only choose active versions. Replay retains every version.
export const LEGACY_PENSION_IDENTITIES: Readonly<Record<string, PensionIdentity>> = { ...snapshots };
export const ACTIVE_LEGACY_PENSION_IDENTITIES: Record<string, PensionIdentity> = {};
for (const review of pensionRosterReview) {
  if (review.status !== "verified") continue;
  const key = review.identityMapping, identity = key && LEGACY_PENSION_IDENTITIES[key];
  if (!key || !identity || identity.companyId !== review.companyId || identity.name !== review.candidateName ||
      identity.prefix !== review.candidatePrefix || identity.address !== review.candidateAddress ||
      identity.identityEvidence !== review.identityEvidence || !review.businessNumber ||
      review.businessNumber.replace(/-/g, "").slice(0, 6) !== identity.prefix || ACTIVE_LEGACY_PENSION_IDENTITIES[key])
    throw new Error("PENSION_MAPPING_INVALID");
  ACTIVE_LEGACY_PENSION_IDENTITIES[key] = identity;
}
// CSV receipts bind to the reviewed snapshots only. API enrollment must not
// change their replay config or introduce strict identities into the legacy matcher.
export const PENSION_IDENTITIES: Readonly<Record<string, PensionIdentity>> = { ...LEGACY_PENSION_IDENTITIES };
export const ACTIVE_PENSION_IDENTITIES: Record<string, PensionIdentity> = { ...ACTIVE_LEGACY_PENSION_IDENTITIES };

/** No timestamp/DART fields: appending independent DART enrollment cannot change pension receipt hashes. */
export function pensionIdentityFrom(companyId: string, value: PublicDataIdentity): PensionIdentity {
  if (!validPublicDataIdentity(value) || !value.pension) throw new Error("PENSION_MAPPING_INVALID");
  return {companyId,name:value.legalName,prefix:value.businessNumber.slice(0,6),address:value.address,identityEvidence:value.identityEvidence,strictAddress:true,
    ...(value.pension.addressRule ? {addressRule:value.pension.addressRule} : {})};
}
export function pensionIdentityFor(key:string, company:{id:string;publicDataIdentity?:PublicDataIdentity}): PensionIdentity | undefined {
  if (company.publicDataIdentity?.pension?.mapping === key) return pensionIdentityFrom(company.id,company.publicDataIdentity);
  return PENSION_IDENTITIES[key];
}
for (const [companyId, value] of Object.entries(publicDataIdentities)) {
  if (!value.pension) continue;
  const key = value.pension.mapping;
  if (PENSION_IDENTITIES[key] || Object.values(ACTIVE_PENSION_IDENTITIES).some(i=>i.companyId===companyId)) throw new Error("PENSION_MAPPING_COLLISION");
  const identity = pensionIdentityFrom(companyId,value);
  (PENSION_IDENTITIES as Record<string,PensionIdentity>)[key] = identity;
  ACTIVE_PENSION_IDENTITIES[key] = identity;
}
