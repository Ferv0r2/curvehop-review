import research from "../data/company-research.json";

/** Official identity admitted by a replayable enrollment receipt, not by an LLM draft. */
export type PublicDataIdentity = {
  version: 1; discoveryReceiptHash: string; businessNumber: string; legalName: string;
  address: string; identityEvidence: string; checkedOn: string;
  pension?: { mapping: string; addressRule?: "published-road-v1" };
  dart?: { corpCode: string; corpName: string };
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= 500;
export function validPublicDataIdentity(v: unknown): v is PublicDataIdentity {
  return object(v) && v.version === 1 && typeof v.discoveryReceiptHash === "string" && /^[a-f0-9]{64}$/.test(v.discoveryReceiptHash)
    && typeof v.businessNumber === "string" && /^\d{10}$/.test(v.businessNumber) && text(v.legalName) && text(v.address) && text(v.identityEvidence)
    && typeof v.checkedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.checkedOn) && Number.isFinite(Date.parse(v.checkedOn))
    && Object.keys(v).every(k => ["version","discoveryReceiptHash","businessNumber","legalName","address","identityEvidence","checkedOn","pension","dart"].includes(k))
    && (v.pension === undefined || (object(v.pension) && Object.keys(v.pension).every(key => ["mapping","addressRule"].includes(key))
      && typeof v.pension.mapping === "string" && /^auto-[-a-z0-9]{1,80}$/.test(v.pension.mapping)
      && (v.pension.addressRule === undefined || v.pension.addressRule === "published-road-v1")))
    && (v.dart === undefined || (object(v.dart) && Object.keys(v.dart).sort().join() === "corpCode,corpName" && typeof v.dart.corpCode === "string" && /^\d{8}$/.test(v.dart.corpCode) && text(v.dart.corpName)));
}
export function publicDataIdentitiesFrom(companies: readonly {id:string; publicDataIdentity?:unknown}[]): Record<string,PublicDataIdentity> {
  const result: Record<string,PublicDataIdentity> = {};
  for (const company of companies) {
    if (company.publicDataIdentity === undefined) continue;
    if (!validPublicDataIdentity(company.publicDataIdentity) || result[company.id]) throw new Error("PUBLIC_DATA_IDENTITY_INVALID");
    result[company.id] = company.publicDataIdentity;
  }
  return result;
}
// Pure leaf: never import companies/research runtime here (both depend on the registries).
export const publicDataIdentities = publicDataIdentitiesFrom(research.companies);
