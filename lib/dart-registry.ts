import snapshots from "../data/dart-identities.json";
import { ACTIVE_PENSION_IDENTITIES, PENSION_IDENTITIES } from "./pension-registry";
import { publicDataIdentities, publicDataIdentitiesFrom, validPublicDataIdentity, type PublicDataIdentity } from "./public-data-identity";

/**
 * Legacy snapshots retain the reviewed pension-prefix contract for receipt replay.
 * New identities come from official enrollment and match all ten business-number
 * digits, independently of whether a pension workplace has been found.
 */
export type DartIdentity = { companyId: string; corpCode: string; corpName: string; prefix: string; pensionKey?: string; businessNumber?: string; identityEvidence?: string };
const LEGACY_DART_IDENTITIES: Readonly<Record<string, DartIdentity>> = snapshots.identities;

for (const [companyId, identity] of Object.entries(LEGACY_DART_IDENTITIES)) {
  const pension = identity.pensionKey && PENSION_IDENTITIES[identity.pensionKey];
  if (identity.companyId !== companyId || !/^\d{8}$/.test(identity.corpCode) || !pension || pension.companyId !== companyId || pension.prefix !== identity.prefix)
    throw new Error(`DART_REGISTRY_INVALID: ${companyId}`);
}

/** No legacy object is rewritten: archived receipts bind its exact bytes. */
export function dartIdentitiesWithPublicData(entries: Readonly<Record<string, PublicDataIdentity>>, active = false): Record<string, DartIdentity> {
  const result = Object.fromEntries(Object.entries(LEGACY_DART_IDENTITIES).filter(([, identity]) => !active || !!(identity.pensionKey && ACTIVE_PENSION_IDENTITIES[identity.pensionKey])));
  for (const [companyId, value] of Object.entries(entries)) {
    if (!validPublicDataIdentity(value)) throw new Error("DART_REGISTRY_IDENTITY_INVALID");
    if (!value.dart) continue;
    const prior = LEGACY_DART_IDENTITIES[companyId];
    if (prior) {
      if (prior.corpCode !== value.dart.corpCode || prior.prefix !== value.businessNumber.slice(0, 6)) throw new Error("DART_REGISTRY_IDENTITY_CONFLICT");
      continue;
    }
    if (Object.values(result).some(identity => identity.corpCode === value.dart!.corpCode && identity.companyId !== companyId)) throw new Error("DART_REGISTRY_IDENTITY_CONFLICT");
    result[companyId] = { companyId, corpCode: value.dart.corpCode, corpName: value.dart.corpName, prefix: value.businessNumber.slice(0, 6), businessNumber: value.businessNumber, identityEvidence: value.identityEvidence };
  }
  return result;
}

/** Used with an explicitly supplied research pack, including pending worker changes. */
export function dartIdentitiesFromResearch(companies: readonly { id: string; publicDataIdentity?: unknown }[], active = false) {
  return dartIdentitiesWithPublicData(publicDataIdentitiesFrom(companies), active);
}
export function dartIdentityForCompany(company: { id: string; publicDataIdentity?: unknown }): DartIdentity | undefined {
  return dartIdentitiesFromResearch([company])[company.id];
}
export const DART_IDENTITIES: Readonly<Record<string, DartIdentity>> = dartIdentitiesWithPublicData(publicDataIdentities);

/** Active legacy pension bindings plus independently admitted public-data identities. */
export const ACTIVE_DART_IDENTITIES: Record<string, DartIdentity> = dartIdentitiesWithPublicData(publicDataIdentities, true);
