import { createHash } from "node:crypto";
import type { CompanyResearch, Issue, ResearchPack } from "./research";
import type { PensionIdentity, PensionRosterReview } from "./pension-registry";
import type { DartIdentity } from "./dart-registry";
import { validPublicDataIdentity } from "./public-data-identity";
import { timeRange, type TimeValue } from "./time-axis";
import { dartDocument, dartFilingNumber } from "./dart-wording";
import { DART_PUBLISHER } from "./research-labels";

/**
 * Company relations, phase 1: only what structured sources already state.
 *
 *   identity (read time, never stored)   company ─operates─▶ le-bn-<10 digits> ─has_workplace─▶ wp-<companyId>
 *                                        company ─operates─▶ le-dart-<corpCode>
 *   dart (stored, rebuilt from receipts) org-n-<hash> ─subsidiary_of─▶ le-dart-<corpCode>
 *   dart links (stored, rebuilt from     le-dart-<other> ─shareholder_of─▶ le-dart-<reporter>
 *     verified link receipts)            le-dart-<reporter> ─invests_in─▶ le-dart-<other>
 *   curated (stored, code PR)            org ─overseas_parent_of─▶ legal entity (none registered in phase 1)
 *
 * Every relation has an `owner` company: its evidence resolves inside that
 * company's research, and its problems hide only that company's relations.
 * IDs are stable forever; a later merge is an additive `sameAs`, never a rename.
 * A pension 6-digit prefix is never identity (real collisions exist). A
 * disclosed counterparty is stored only as `le-dart-<corpCode>`, when
 * lib/dart-links.ts identified it by DART's corp list or the counterparty's own
 * filing, and named by DART, never by the disclosed text; any other row is only
 * counted in its receipt (2026-10-10, no disclosed names).
 */
export type EntityRef = { kind: "company" | "legal-entity" | "org" | "workplace"; id: string };
export type LegalEntity = { id: string; legalName: string; identifiers: { corpCode?: string; businessNumber?: string }; evidenceIds: string[] };
export type Organization = {
  id: string; scope: string; names: string[]; identifiers: { corpCode?: string; businessNumber?: string };
  origin: { source: "dart" | "curated"; receipt?: string }; evidenceIds: string[];
};
export type Workplace = { id: string; legalEntityId: string; name: string; address: string; pensionPrefix: string; evidenceIds: string[] };
export type RelationType = "operates" | "has_workplace" | "subsidiary_of" | "overseas_parent_of" | "shareholder_of" | "invests_in";
/** The DART link types (lib/dart-links.ts): the reporting company's 사업보고서 tables, as disclosed. */
export const LINK_TYPES: readonly RelationType[] = ["shareholder_of", "invests_in"];
/** Longest disclosed text a link row may carry, per attribute. The collector refuses a company whose table exceeds one, so a published row always validates. */
export const LINK_TEXT_LIMITS = { shares: 20 } as const;
const vocabularyKey = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");
const vocabulary = (labels: readonly string[]) => new Map(labels.map(label => [vocabularyKey(label), label]));
/**
 * The 최대주주·타법인출자 cells a link row may carry besides the name and stake cells are closed vocabularies
 * (2026-10-10): a disclosed value is kept only when, NFKC with spaces removed, it is one of these, and it is
 * stored as the label here. Anything else (a sentence, someone's name in a relation cell) is not stored; the row
 * keeps its name and stake cells. Free-text notes (비고 `rm`) are never read, so no person's holdings travel
 * with a corporate row.
 */
export const LINK_VOCABULARY = {
  role: vocabulary(["최대주주", "최대주주 본인", "본인", "특수관계인", "특수관계자", "최대주주의 특수관계인", "최대주주 특수관계인", "기타 특수관계인",
    "기타 특수관계자", "계열회사", "계열사", "최대주주의 계열회사", "주요주주", "관계회사"]),
  stockKind: vocabulary(["보통주", "보통주식", "우선주", "우선주식", "종류주", "종류주식", "전환우선주", "상환우선주", "상환전환우선주",
    "의결권 있는 주식", "의결권 없는 주식", "기명식 보통주", "기명식 우선주"]),
  purpose: vocabulary(["경영참여", "경영참가", "단순투자", "일반투자", "사업제휴", "합작투자", "전략적 투자"]),
} as const;
export type LinkVocabulary = keyof typeof LINK_VOCABULARY;
/** The fixed label of a disclosed cell, or undefined when it is not in the vocabulary (then nothing of it is stored). */
export const linkLabel = (kind: LinkVocabulary, value: string): string | undefined => LINK_VOCABULARY[kind].get(vocabularyKey(value));
export type RelationAttributes = {
  /** subsidiary_of: stored stakes (a blank or dash is null). */
  stake?: { current: number | null; prior: number | null }; note?: string; order?: number;
  /** Link types: the stake cells as printed; relation, stock kind and purpose only as LINK_VOCABULARY labels (absent otherwise). Never a disclosed name or note: the counterparty is named by its le-dart entity. */
  role?: string; stockKind?: string; purpose?: string; shares?: { start: string; end: string };
  /** Link types with a `le-dart-*` counterparty: the only listed corp of that name (`listed`) or confirmed by the counterparty's own filing (`filing`). A name merely unique in the corp list is not identity. */
  match?: "listed" | "filing";
};
export type Relation = {
  id: string; type: RelationType; owner: string; from: EntityRef; to: EntityRef;
  attributes?: RelationAttributes;
  status: "reported" | "ended"; asOf: string | null;
  /** Curated only: the span the source states (lib/time-axis.ts). `ended` holds exactly when `validTo` does. */
  validFrom?: TimeValue; validTo?: TimeValue;
  reportedOn: string | null; checkedOn: string;
  evidenceIds: string[];
  origin: { source: "identity" | "dart" | "curated"; receipt?: string; reviewedOn?: string; note?: string };
};
export type Correction = { relationId: string; kind: "row" | "claim"; factIds: string[]; reason: string; reviewedOn: string; evidenceIds: string[] };
/** Persisted: dart + curated + corrections only. */
export type RelationsFile = { version: 1; legalEntities: LegalEntity[]; organizations: Organization[]; relations: Relation[]; corrections: Correction[] };
/** The file plus identity relations derived at read time. */
export type RelationsPack = RelationsFile & { workplaces: Workplace[] };
export type IdentityRelations = Pick<RelationsPack, "legalEntities" | "workplaces" | "relations">;
export type RelationsValidation = {
  fileIssues: Issue[];
  issuesByCompany: Record<string, Issue[]>;
  /** Indexes into `pack.corrections` of every correction with at least one issue: such a correction hides and retracts nothing. */
  invalidCorrections: number[];
};

type Kinds = readonly EntityRef["kind"][];
export const RELATION_RULES: Readonly<Record<RelationType, { from: Kinds; to: Kinds; source: Relation["origin"]["source"] }>> = {
  operates: { from: ["company"], to: ["legal-entity"], source: "identity" },
  has_workplace: { from: ["legal-entity"], to: ["workplace"], source: "identity" },
  subsidiary_of: { from: ["org"], to: ["legal-entity"], source: "dart" },
  overseas_parent_of: { from: ["org"], to: ["legal-entity"], source: "curated" },
  // The reporter is always le-dart, and so is the counterparty: a DART corp identified by the collector, never a disclosed name.
  shareholder_of: { from: ["legal-entity"], to: ["legal-entity"], source: "dart" },
  invests_in: { from: ["legal-entity"], to: ["legal-entity"], source: "dart" },
};
/** `rel-sh-<owner>-<counterparty>-<YYYY-MM>` / `rel-inv-…`, plus `-<order>` when one filing lists the same counterparty twice. */
export const linkRelationId = (type: "shareholder_of" | "invests_in", owner: string, counterparty: string, period: string, order?: number) =>
  `rel-${type === "shareholder_of" ? "sh" : "inv"}-${owner}-${counterparty}-${period}${order === undefined ? "" : `-${order}`}`;

/** Key whitelists, in canonical output order. Anything else on an object is an issue. */
export const RELATION_KEYS = {
  file: ["version", "legalEntities", "organizations", "relations", "corrections"],
  pack: ["version", "legalEntities", "organizations", "workplaces", "relations", "corrections"],
  legalEntity: ["id", "legalName", "identifiers", "evidenceIds"],
  identifiers: ["corpCode", "businessNumber"],
  organization: ["id", "scope", "names", "identifiers", "origin", "evidenceIds"],
  organizationOrigin: ["source", "receipt"],
  workplace: ["id", "legalEntityId", "name", "address", "pensionPrefix", "evidenceIds"],
  relation: ["id", "type", "owner", "from", "to", "attributes", "status", "asOf", "validFrom", "validTo", "reportedOn", "checkedOn", "evidenceIds", "origin"],
  ref: ["kind", "id"],
  // New keys go after the old ones so existing relations keep their bytes.
  attributes: ["stake", "note", "order", "role", "stockKind", "purpose", "shares", "match"],
  stake: ["current", "prior"],
  shares: ["start", "end"],
  origin: ["source", "receipt", "reviewedOn", "note"],
  correction: ["relationId", "kind", "factIds", "reason", "reviewedOn", "evidenceIds"],
} as const;

export const emptyRelationsFile = (): RelationsFile => ({ version: 1, legalEntities: [], organizations: [], relations: [], corrections: [] });

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 500): value is string => typeof value === "string" && !!value.trim() && value.length <= max;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (values: string[]) => [...new Set(values)].sort(compare);
const RECEIPT = /^\d{17}-[a-f0-9]{8}$/;
/** Keys a relation may leave out; everything else in `RELATION_KEYS.relation` is required. */
const OPTIONAL_RELATION_KEYS: ReadonlySet<string> = new Set(["attributes", "validFrom", "validTo"]);

/** Same calendar check as `validateResearch`: a real YYYY-MM or YYYY-MM-DD, as a UTC [start, end] range. */
function period(value: unknown): [number, number] | null {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value)) return null;
  const start = Date.parse(`${value.length === 7 ? value + "-01" : value}T00:00:00Z`);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, value.length) !== value) return null;
  return [start, value.length === 10 ? start : Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)];
}

/**
 * Key for matching a disclosed name to DART's corp list (lib/dart-links.ts): NFKC, without the
 * legal-form words 주식회사/(주)/유한회사/(유), spaces, commas and dots. A match still needs the
 * corp list or the counterparty's own filing; the key alone never joins two names.
 */
export const linkNameKey = (name: string) =>
  name.normalize("NFKC").replace(/주식회사|\(주\)|유한회사|\(유\)|\s+|[,.]/g, "").toLowerCase();
/** Name-only organizations never merge across companies: the scope (company ID) is part of the identity. */
export const orgNameKey = (name: string) => name.toLowerCase().normalize("NFKC");
export const nameOrgId = (scope: string, name: string) =>
  "org-n-" + createHash("sha256").update(scope + "\n" + orgNameKey(name)).digest("hex").slice(0, 12);
/** The insert-only DART fact whose evidence a `subsidiary_of` row repeats. */
export const subsidiaryFactId = (companyId: string, period: string) => `${companyId}-dart-subsidiaries-${period.replace("-", "")}`;
const dartEvidence = (companyId: string, id: string) => id.startsWith(`${companyId}-dart-`) && /^\d{14}$/.test(id.slice(companyId.length + 6));

export function sortRelations<T extends { type?: unknown; id?: unknown }>(relations: T[]) {
  return [...relations].sort((a, b) => compare(String(a?.type), String(b?.type)) || compare(String(a?.id), String(b?.id)));
}
export function sortById<T extends { id?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => compare(String(a?.id), String(b?.id)));
}

/** UTC date of an ISO timestamp, so every machine derives the same day. */
function utcDay(timestamp: string) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : timestamp.slice(0, 10);
}

/**
 * Identity relations from the committed registry JSON (pure; never persisted).
 * A verified roster row gives `le-bn-<10 digits>`, `operates` and, through its
 * pension mapping, `wp-<companyId>` with `has_workplace`. A DART identity of a
 * company holding DART evidence gives `le-dart-<corpCode>` and `operates`.
 * `le-bn-*` and `le-dart-*` are never merged in phase 1. Companies absent from
 * research hold no evidence, so they get nothing.
 */
export function identityRelations(
  roster: readonly PensionRosterReview[],
  pensionIdentities: Readonly<Record<string, PensionIdentity>>,
  dartIdentities: { checkedAt: string; identities: Readonly<Record<string, DartIdentity>> },
  research: ResearchPack,
): IdentityRelations {
  const companies = new Map(research.companies.map(company => [company.id, company]));
  const entities = new Map<string, LegalEntity>(), workplaces: Workplace[] = [], relations: Relation[] = [];
  const entity = (id: string, legalName: string, identifiers: LegalEntity["identifiers"], evidenceIds: string[]) => {
    const known = entities.get(id);
    if (known) known.evidenceIds = sortedUnique([...known.evidenceIds, ...evidenceIds]);
    else entities.set(id, { id, legalName, identifiers, evidenceIds });
  };
  const relation = (id: string, type: RelationType, owner: string, from: EntityRef, to: EntityRef, checkedOn: string, evidenceIds: string[]): Relation =>
    ({ id, type, owner, from, to, status: "reported", asOf: null, reportedOn: null, checkedOn, evidenceIds, origin: { source: "identity" } });
  const identityEvidence = (company: CompanyResearch) => {
    const held = new Set(company.evidence.map(item => item.id));
    return sortedUnique(company.identityEvidence.filter(id => held.has(id)));
  };
  const rows = roster.filter(row => row.status === "verified").slice().sort((a, b) => compare(a.companyId, b.companyId));
  for (const row of rows) {
    const company = companies.get(row.companyId), number = (row.businessNumber ?? "").replace(/\D/g, "");
    if (!company || !/^\d{10}$/.test(number) || !row.legalName) continue;
    const evidenceIds = identityEvidence(company);
    if (!evidenceIds.length) continue;
    const id = `le-bn-${number}`;
    entity(id, row.legalName, { businessNumber: number }, evidenceIds);
    relations.push(relation(`rel-op-${company.id}-${id}`, "operates", company.id, { kind: "company", id: company.id }, { kind: "legal-entity", id }, row.checkedOn, evidenceIds));
    const mapping = row.identityMapping ? pensionIdentities[row.identityMapping] : undefined;
    if (!mapping || mapping.companyId !== company.id) continue;
    const workplace = `wp-${company.id}`;
    workplaces.push({ id: workplace, legalEntityId: id, name: mapping.name, address: mapping.address, pensionPrefix: mapping.prefix, evidenceIds });
    relations.push(relation(`rel-wp-${id}-${workplace}`, "has_workplace", company.id, { kind: "legal-entity", id }, { kind: "workplace", id: workplace }, row.checkedOn, evidenceIds));
  }
  for (const company of research.companies) {
    const identity = company.publicDataIdentity;
    if (!validPublicDataIdentity(identity) || rows.some(row => row.companyId === company.id)) continue;
    const evidenceIds = identityEvidence(company).filter(id => id === identity.identityEvidence);
    if (!evidenceIds.length) continue;
    const id = `le-bn-${identity.businessNumber}`;
    entity(id, identity.legalName, {businessNumber:identity.businessNumber}, evidenceIds);
    relations.push(relation(`rel-op-${company.id}-${id}`, "operates", company.id, {kind:"company",id:company.id}, {kind:"legal-entity",id}, identity.checkedOn, evidenceIds));
    if (identity.pension) {
      const workplace = `wp-${company.id}`;
      workplaces.push({id:workplace,legalEntityId:id,name:identity.legalName,address:identity.address,pensionPrefix:identity.businessNumber.slice(0,6),evidenceIds});
      relations.push(relation(`rel-wp-${id}-${workplace}`, "has_workplace", company.id, {kind:"legal-entity",id}, {kind:"workplace",id:workplace}, identity.checkedOn, evidenceIds));
    }
  }
  const checkedOn = utcDay(dartIdentities.checkedAt);
  const dynamicDart = research.companies.flatMap(company => {
    const identity = company.publicDataIdentity;
    return validPublicDataIdentity(identity) && identity.dart && !dartIdentities.identities[company.id]
      ? [{companyId:company.id,corpCode:identity.dart.corpCode,corpName:identity.dart.corpName,prefix:identity.businessNumber.slice(0,6),businessNumber:identity.businessNumber}] : [];
  });
  for (const identity of [...Object.values(dartIdentities.identities),...dynamicDart].sort((a, b) => compare(a.companyId, b.companyId))) {
    const company = companies.get(identity.companyId);
    if (!company || !/^\d{8}$/.test(identity.corpCode)) continue;
    const evidenceIds = sortedUnique(company.evidence.map(item => item.id).filter(id => dartEvidence(company.id, id)));
    if (!evidenceIds.length) continue;
    const id = `le-dart-${identity.corpCode}`;
    entity(id, identity.corpName, { corpCode: identity.corpCode }, evidenceIds);
    const observedOn = identity.businessNumber && validPublicDataIdentity(company.publicDataIdentity) ? company.publicDataIdentity.checkedOn : checkedOn;
    relations.push(relation(`rel-op-${company.id}-${id}`, "operates", company.id, { kind: "company", id: company.id }, { kind: "legal-entity", id }, observedOn, evidenceIds));
  }
  return { legalEntities: sortById([...entities.values()]), workplaces: sortById(workplaces), relations: sortRelations(relations) };
}

/** File-level checks only (version, top-level shape and keys). Element problems belong to `validateRelations`. */
export function parseRelationsFile(value: unknown): { file: RelationsFile; issues: [] } | { file: null; issues: Issue[] } {
  if (!record(value)) return { file: null, issues: [{ path: "$", message: "관계 파일은 JSON 객체여야 합니다." }] };
  if (value.version !== 1)
    return { file: null, issues: [{ path: "$.version", message: `지원 버전은 1, 입력은 ${typeof value.version === "number" ? value.version : "잘못된 값"}입니다.` }] };
  const issues: Issue[] = [];
  for (const key of Object.keys(value))
    if (!(RELATION_KEYS.file as readonly string[]).includes(key)) issues.push({ path: `$.${key}`, message: "관계 파일에 없는 항목입니다. 신원 관계·사업장은 저장하지 않습니다." });
  for (const key of RELATION_KEYS.file.slice(1))
    if (!Array.isArray(value[key])) issues.push({ path: `$.${key}`, message: "배열이 필요합니다." });
  return issues.length ? { file: null, issues } : { file: value as RelationsFile, issues: [] };
}

/**
 * The read-time pack: identity ∪ file. A persisted legal entity wins over the
 * identity one with the same ID; every persisted entry is kept as written, so
 * the validator still sees the file's own duplicates and unknown keys.
 */
export function assembleRelations(file: RelationsFile | null, identity: IdentityRelations): RelationsPack {
  const stored = file ?? emptyRelationsFile();
  const storedIds = new Set(stored.legalEntities.map(item => (record(item) ? item.id : undefined)));
  return {
    version: 1,
    legalEntities: sortById([...identity.legalEntities.filter(item => !storedIds.has(item.id)), ...stored.legalEntities]),
    organizations: sortById(stored.organizations),
    workplaces: sortById(identity.workplaces),
    relations: sortRelations([...identity.relations, ...stored.relations]),
    corrections: stored.corrections,
  };
}

/**
 * Structural contract for a relations pack against the research it cites.
 * Problems group by the owning company (relations by `owner`, organizations by
 * `scope`, entities by the owners of the relations touching them, corrections
 * by their target's owner); what no company owns is a file issue.
 * `checkedOn`/`reviewedOn` use `validateResearch`'s UTC-day rule against `now`.
 * Every correction that raised an issue is listed in `invalidCorrections`, so
 * display (`visibleRelationsForCompany`) ignores exactly what failed here.
 */
export function validateRelations(pack: RelationsPack, research: ResearchPack, now = new Date()): RelationsValidation {
  const fileIssues: Issue[] = [], issuesByCompany: Record<string, Issue[]> = {}, invalidCorrections: number[] = [];
  const input = pack as unknown;
  if (!record(input) || input.version !== 1) return { fileIssues: [{ path: "$", message: "version: 1 관계 묶음이 필요합니다." }], issuesByCompany, invalidCorrections };
  let added = 0;
  const add = (owners: Iterable<string>, path: string, message: string) => {
    added++;
    const list = [...new Set(owners)];
    if (!list.length) fileIssues.push({ path, message });
    for (const owner of list) (issuesByCompany[owner] ??= []).push({ path, message });
  };
  for (const key of Object.keys(input))
    if (!(RELATION_KEYS.pack as readonly string[]).includes(key)) add([], `$.${key}`, "알 수 없는 항목입니다.");
  const list = (key: (typeof RELATION_KEYS.pack)[number]) => {
    if (key === "version") return [];
    const value = input[key];
    if (!Array.isArray(value)) { add([], `$.${key}`, "배열이 필요합니다."); return []; }
    return value as unknown[];
  };
  const legalEntities = list("legalEntities"), organizations = list("organizations"), workplaces = list("workplaces");
  const relations = list("relations"), corrections = list("corrections");

  const companies = new Map(research.companies.map(company => [company.id, company]));
  const evidenceCache = new Map<string, Set<string>>();
  const evidenceOf = (companyId: string) => {
    let held = evidenceCache.get(companyId);
    if (!held) evidenceCache.set(companyId, held = new Set(companies.get(companyId)?.evidence.map(item => item.id) ?? []));
    return held;
  };
  const today = Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const pastDay = (value: unknown) => { const range = period(value); return !!range && String(value).length === 10 && range[0] <= today; };
  const keys = (value: Record<string, unknown>, allowed: readonly string[], required: readonly string[], owners: Iterable<string>, path: string) => {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) add(owners, `${path}.${key}`, "허용되지 않은 항목입니다.");
    for (const key of required) if (!(key in value)) add(owners, `${path}.${key}`, "필수 항목이 없습니다.");
  };
  const evidenceList = (value: unknown, allowEmpty = false): value is string[] =>
    Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 500 && new Set(value).size === value.length &&
    value.every(id => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id));

  // Who owns each entity: the owners of the relations that touch it, and which evidence each of them cites.
  const touching = new Map<string, Set<string>>(), citing = new Map<string, Map<string, Set<string>>>();
  for (const raw of relations) {
    if (!record(raw) || typeof raw.owner !== "string") continue;
    for (const end of [raw.from, raw.to]) if (record(end) && typeof end.id === "string") {
      const owners = touching.get(end.id) ?? new Set<string>(); owners.add(raw.owner); touching.set(end.id, owners);
      const byEvidence = citing.get(end.id) ?? new Map<string, Set<string>>(); citing.set(end.id, byEvidence);
      for (const evidenceId of Array.isArray(raw.evidenceIds) ? raw.evidenceIds : []) {
        const cited = byEvidence.get(String(evidenceId)) ?? new Set<string>(); cited.add(raw.owner); byEvidence.set(String(evidenceId), cited);
      }
    }
  }
  const seen = new Set<string>();
  const unique = (id: unknown, owners: Iterable<string>, path: string) => {
    if (typeof id !== "string" || !id) { add(owners, path, "ID가 필요합니다."); return false; }
    if (seen.has(id)) add(owners, path, "중복된 ID입니다.");
    seen.add(id);
    return true;
  };

  const legal = new Map<string, Record<string, unknown>>();
  legalEntities.forEach((raw, index) => {
    const path = `legalEntities[${index}]`;
    if (!record(raw)) { add([], path, "법인 객체가 필요합니다."); return; }
    const owners = typeof raw.id === "string" ? touching.get(raw.id) ?? new Set<string>() : new Set<string>();
    keys(raw, RELATION_KEYS.legalEntity, RELATION_KEYS.legalEntity, owners, path);
    if (!unique(raw.id, owners, path + ".id")) return;
    const id = raw.id as string;
    if (!legal.has(id)) legal.set(id, raw);
    if (!owners.size) add([], path, "어떤 관계도 가리키지 않는 법인입니다.");
    if (!text(raw.legalName, 200)) add(owners, path + ".legalName", "1~200자 법인명이 필요합니다.");
    const identifiers = raw.identifiers, bn = /^le-bn-(\d{10})$/.exec(id), dart = /^le-dart-(\d{8})$/.exec(id);
    if (!bn && !dart) add(owners, path + ".id", "le-bn-<사업자번호 10자리> 또는 le-dart-<고유번호 8자리> 형식이 필요합니다.");
    if (!record(identifiers)) add(owners, path + ".identifiers", "식별자 객체가 필요합니다.");
    else {
      keys(identifiers, RELATION_KEYS.identifiers, [], owners, path + ".identifiers");
      if (bn && (identifiers.businessNumber !== bn[1] || "corpCode" in identifiers))
        add(owners, path + ".identifiers", "le-bn 법인은 ID와 같은 사업자번호만 가집니다.");
      if (dart && (identifiers.corpCode !== dart[1] || "businessNumber" in identifiers))
        add(owners, path + ".identifiers", "le-dart 법인은 ID와 같은 DART 고유번호만 가집니다.");
    }
    if (!evidenceList(raw.evidenceIds)) add(owners, path + ".evidenceIds", "중복 없는 근거 ID 목록이 필요합니다.");
    else for (const evidenceId of raw.evidenceIds)
      // A shared legal entity: missing evidence is the problem of the owners whose relations cite it, so each company validates on its own.
      if (![...owners].some(owner => evidenceOf(owner).has(evidenceId)))
        add(citing.get(id)?.get(evidenceId) ?? owners, path + ".evidenceIds", `관계 주인 회사의 리서치에 없는 근거입니다: ${evidenceId}`);
  });

  const orgs = new Map<string, Record<string, unknown>>();
  organizations.forEach((raw, index) => {
    const path = `organizations[${index}]`;
    if (!record(raw)) { add([], path, "조직 객체가 필요합니다."); return; }
    const scope = typeof raw.scope === "string" ? raw.scope : null, owners = scope ? [scope] : [];
    keys(raw, RELATION_KEYS.organization, RELATION_KEYS.organization, owners, path);
    if (!unique(raw.id, owners, path + ".id")) return;
    const id = raw.id as string;
    if (!orgs.has(id)) orgs.set(id, raw);
    if (!scope || !companies.has(scope)) add(owners, path + ".scope", "리서치에 있는 회사 ID가 필요합니다.");
    const names = raw.names;
    const namesOk = Array.isArray(names) && names.length > 0 && names.length <= 20 && new Set(names).size === names.length && names.every(name => text(name, 200));
    if (!namesOk) add(owners, path + ".names", "중복 없는 1~200자 이름 목록이 필요합니다.");
    const identifiers = record(raw.identifiers) ? raw.identifiers : null;
    if (!identifiers) add(owners, path + ".identifiers", "식별자 객체가 필요합니다.");
    else keys(identifiers, RELATION_KEYS.identifiers, [], owners, path + ".identifiers");
    const named = /^org-n-[0-9a-f]{12}$/.test(id), dart = /^org-dart-(\d{8})$/.exec(id), bn = /^org-bn-(\d{10})$/.exec(id);
    if (named) {
      if (identifiers && Object.keys(identifiers).length) add(owners, path + ".identifiers", "이름만 있는 조직은 식별자를 갖지 않습니다.");
      if (scope && namesOk && id !== nameOrgId(scope, (names as string[])[0])) add(owners, path + ".id", "범위와 첫 이름에서 만든 ID와 다릅니다.");
    } else if (dart) {
      if (!identifiers || identifiers.corpCode !== dart[1] || "businessNumber" in identifiers) add(owners, path + ".identifiers", "ID와 같은 DART 고유번호만 가집니다.");
    } else if (bn) {
      if (!identifiers || identifiers.businessNumber !== bn[1] || "corpCode" in identifiers) add(owners, path + ".identifiers", "ID와 같은 사업자번호만 가집니다.");
    } else add(owners, path + ".id", "org-n-/org-dart-/org-bn- 형식이 필요합니다.");
    const origin = raw.origin;
    if (!record(origin) || !["dart", "curated"].includes(String(origin.source))) add(owners, path + ".origin", "dart 또는 curated 출처가 필요합니다.");
    else {
      keys(origin, RELATION_KEYS.organizationOrigin, ["source"], owners, path + ".origin");
      if (origin.source === "dart" && !(typeof origin.receipt === "string" && RECEIPT.test(origin.receipt))) add(owners, path + ".origin.receipt", "DART 수신 기록 ID가 필요합니다.");
      if (origin.source === "curated" && "receipt" in origin) add(owners, path + ".origin.receipt", "검토 등록 조직은 수신 기록을 갖지 않습니다.");
    }
    if (!evidenceList(raw.evidenceIds)) add(owners, path + ".evidenceIds", "중복 없는 근거 ID 목록이 필요합니다.");
    else if (scope) for (const evidenceId of raw.evidenceIds)
      if (!evidenceOf(scope).has(evidenceId)) add(owners, path + ".evidenceIds", `범위 회사의 리서치에 없는 근거입니다: ${evidenceId}`);
  });
  // An organization may not carry the identifier of a known legal entity: that is the same legal person under two IDs.
  const legalIdentifiers = new Set<string>();
  for (const entity of legal.values()) if (record(entity.identifiers))
    for (const key of RELATION_KEYS.identifiers) if (typeof entity.identifiers[key] === "string") legalIdentifiers.add(`${key}:${entity.identifiers[key]}`);
  organizations.forEach((raw, index) => {
    if (!record(raw) || !record(raw.identifiers)) return;
    for (const key of RELATION_KEYS.identifiers)
      if (typeof raw.identifiers[key] === "string" && legalIdentifiers.has(`${key}:${raw.identifiers[key]}`))
        add(typeof raw.scope === "string" ? [raw.scope] : [], `organizations[${index}].identifiers.${key}`, "이미 있는 법인의 식별자를 조직에 쓸 수 없습니다.");
  });

  const places = new Map<string, Record<string, unknown>>();
  workplaces.forEach((raw, index) => {
    const path = `workplaces[${index}]`;
    if (!record(raw)) { add([], path, "사업장 객체가 필요합니다."); return; }
    const company = typeof raw.id === "string" && raw.id.startsWith("wp-") ? raw.id.slice(3) : null;
    const owners = new Set([...(typeof raw.id === "string" ? touching.get(raw.id) ?? [] : []), ...(company ? [company] : [])]);
    keys(raw, RELATION_KEYS.workplace, RELATION_KEYS.workplace, owners, path);
    if (!unique(raw.id, owners, path + ".id")) return;
    if (!places.has(raw.id as string)) places.set(raw.id as string, raw);
    if (!company || !companies.has(company)) add(owners, path + ".id", "wp-<리서치에 있는 회사 ID> 형식이 필요합니다.");
    if (typeof raw.legalEntityId !== "string" || !legal.has(raw.legalEntityId)) add(owners, path + ".legalEntityId", "있는 법인 ID가 필요합니다.");
    for (const key of ["name", "address"]) if (!text(raw[key], 200)) add(owners, `${path}.${key}`, "1~200자 텍스트가 필요합니다.");
    if (typeof raw.pensionPrefix !== "string" || !/^\d{6}$/.test(raw.pensionPrefix)) add(owners, path + ".pensionPrefix", "국민연금 사업자번호 앞 6자리가 필요합니다.");
    if (!evidenceList(raw.evidenceIds)) add(owners, path + ".evidenceIds", "중복 없는 근거 ID 목록이 필요합니다.");
    else if (company) for (const evidenceId of raw.evidenceIds)
      if (!evidenceOf(company).has(evidenceId)) add(owners, path + ".evidenceIds", `회사 리서치에 없는 근거입니다: ${evidenceId}`);
  });

  const exists: Record<EntityRef["kind"], (id: string) => boolean> = {
    company: id => companies.has(id), "legal-entity": id => legal.has(id), org: id => orgs.has(id), workplace: id => places.has(id),
  };
  const relationById = new Map<string, Record<string, unknown>>();
  // Every relation ID up front: a link row needs its owner's `operates` row, which sorts after it.
  const relationIds = new Set(relations.map(raw => (record(raw) && typeof raw.id === "string" ? raw.id : "")));
  relations.forEach((raw, index) => {
    const path = `relations[${index}]`;
    if (!record(raw)) { add([], path, "관계 객체가 필요합니다."); return; }
    if (typeof raw.owner !== "string" || !raw.owner) { add([], path + ".owner", "관계 주인 회사 ID가 필요합니다."); return; }
    const owner = raw.owner, owners = [owner], company = companies.get(owner);
    keys(raw, RELATION_KEYS.relation, RELATION_KEYS.relation.filter(key => !OPTIONAL_RELATION_KEYS.has(key)), owners, path);
    if (!unique(raw.id, owners, path + ".id")) return;
    const id = raw.id as string;
    if (!relationById.has(id)) relationById.set(id, raw);
    if (!company) add(owners, path + ".owner", "리서치에 없는 회사가 주인인 관계입니다.");
    const rule = typeof raw.type === "string" && Object.hasOwn(RELATION_RULES, raw.type) ? RELATION_RULES[raw.type as RelationType] : null;
    if (!rule) add(owners, path + ".type", "알 수 없는 관계 종류입니다.");
    const ends: Partial<Record<"from" | "to", { kind: EntityRef["kind"]; id: string }>> = {};
    for (const side of ["from", "to"] as const) {
      const end = raw[side];
      if (!record(end)) { add(owners, `${path}.${side}`, "끝점 객체가 필요합니다."); continue; }
      keys(end, RELATION_KEYS.ref, RELATION_KEYS.ref, owners, `${path}.${side}`);
      if (typeof end.id !== "string" || !Object.hasOwn(exists, String(end.kind))) { add(owners, `${path}.${side}`, "끝점 종류와 ID가 필요합니다."); continue; }
      const kind = end.kind as EntityRef["kind"];
      if (rule && !rule[side].includes(kind)) add(owners, `${path}.${side}.kind`, `${raw.type} 관계의 ${side === "from" ? "시작" : "끝"}은 ${rule[side].join(" 또는 ")}입니다.`);
      if (!exists[kind](end.id)) add(owners, `${path}.${side}.id`, `없는 끝점입니다: ${end.id}`);
      ends[side] = { kind, id: end.id };
    }
    const origin = record(raw.origin) ? raw.origin : null;
    if (!origin) add(owners, path + ".origin", "출처 객체가 필요합니다.");
    else {
      const source = origin.source;
      keys(origin, RELATION_KEYS.origin, ["source"], owners, path + ".origin");
      if (rule && source !== rule.source) add(owners, path + ".origin.source", `${raw.type} 관계의 출처는 ${rule.source}입니다.`);
      if (source === "dart") {
        if (!(typeof origin.receipt === "string" && RECEIPT.test(origin.receipt))) add(owners, path + ".origin.receipt", "DART 수신 기록 ID가 필요합니다.");
        for (const key of ["reviewedOn", "note"]) if (key in origin) add(owners, `${path}.origin.${key}`, "DART 관계에 없는 항목입니다.");
      } else if (source === "curated") {
        if ("receipt" in origin) add(owners, path + ".origin.receipt", "검토 등록 관계는 수신 기록을 갖지 않습니다.");
        if (!pastDay(origin.reviewedOn)) add(owners, path + ".origin.reviewedOn", "미래가 아닌 검토일 YYYY-MM-DD가 필요합니다.");
        else if (raw.checkedOn !== origin.reviewedOn) add(owners, path + ".checkedOn", "검토 등록 관계의 확인일은 검토일과 같아야 합니다.");
        if ("note" in origin && !text(origin.note)) add(owners, path + ".origin.note", "1~500자 메모가 필요합니다.");
      } else if (source === "identity") {
        for (const key of ["receipt", "reviewedOn", "note"]) if (key in origin) add(owners, `${path}.origin.${key}`, "신원 관계에 없는 항목입니다.");
      } else add(owners, path + ".origin.source", "identity/dart/curated 출처가 필요합니다.");
    }
    if (!["reported", "ended"].includes(String(raw.status))) add(owners, path + ".status", "reported 또는 ended가 필요합니다.");
    if (!pastDay(raw.checkedOn)) add(owners, path + ".checkedOn", "미래가 아닌 실제 확인일 YYYY-MM-DD가 필요합니다.");
    const checked = period(raw.checkedOn);
    for (const key of ["asOf", "reportedOn"] as const) {
      if (raw[key] === null) continue;
      const range = period(raw[key]);
      if (!range) add(owners, `${path}.${key}`, "YYYY-MM 또는 YYYY-MM-DD, 또는 null이 필요합니다.");
      else if (checked && range[0] > checked[0]) add(owners, `${path}.${key}`, "확인일보다 뒤일 수 없습니다.");
    }
    // The span a source states: curated only, real values, already begun and already ended by the check day, holding asOf.
    const span: Partial<Record<"validFrom" | "validTo", [number, number]>> = {};
    for (const key of ["validFrom", "validTo"] as const) {
      if (!(key in raw)) continue;
      if (origin?.source !== "curated") { add(owners, `${path}.${key}`, "구조화 원천 관계는 기준 시점(asOf)만 가져요."); continue; }
      const range = typeof raw[key] === "string" ? timeRange(raw[key]) : null;
      if (!range) { add(owners, `${path}.${key}`, "YYYY, YYYY-MM 또는 YYYY-MM-DD가 필요합니다(null은 쓰지 않아요)."); continue; }
      span[key] = range;
      if (checked && (key === "validFrom" ? range[0] : range[1]) > checked[0])
        add(owners, `${path}.${key}`, key === "validFrom" ? "시작은 확인일보다 뒤일 수 없습니다." : "끝은 확인일까지 실제로 끝난 날짜만 씁니다.");
    }
    if (span.validFrom && span.validTo && span.validFrom[0] > span.validTo[1]) add(owners, path + ".validFrom", "시작(validFrom)은 끝(validTo)보다 늦을 수 없습니다.");
    const point = period(raw.asOf);
    if (point && ((span.validFrom && point[0] < span.validFrom[0]) || (span.validTo && point[1] > span.validTo[1])))
      add(owners, path + ".asOf", "기준 시점(asOf)은 시작과 끝 사이여야 합니다.");
    if (raw.status === "ended" && !("validTo" in raw)) add(owners, path + ".validTo", "ended 관계는 원문이 말한 끝(validTo)이 필요합니다.");
    if (raw.status !== "ended" && "validTo" in raw) add(owners, path + ".status", "끝(validTo)이 있는 관계는 ended여야 합니다.");
    if ("attributes" in raw) {
      const attributes = raw.attributes;
      if (!record(attributes)) add(owners, path + ".attributes", "속성 객체가 필요합니다.");
      else {
        keys(attributes, RELATION_KEYS.attributes, [], owners, path + ".attributes");
        if ("stake" in attributes) {
          const stake = attributes.stake, value = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100);
          if (!record(stake)) add(owners, path + ".attributes.stake", "지분 객체가 필요합니다.");
          else {
            keys(stake, RELATION_KEYS.stake, RELATION_KEYS.stake, owners, path + ".attributes.stake");
            for (const key of RELATION_KEYS.stake) if (!value(stake[key])) add(owners, `${path}.attributes.stake.${key}`, "0~100 사이 숫자 또는 null이 필요합니다.");
          }
        }
        const link = LINK_TYPES.includes(raw.type as RelationType);
        // A DART link row never carries a note (free text can name a person); a subsidiary row keeps its stored note.
        if ("note" in attributes && (link || !text(attributes.note, 200))) add(owners, path + ".attributes.note", link ? "지분 관계 공시는 비고를 싣지 않습니다." : "1~200자 비고가 필요합니다.");
        for (const key of ["role", "stockKind", "purpose"] as const)
          if (key in attributes && !(typeof attributes[key] === "string" && linkLabel(key, attributes[key] as string) === attributes[key]))
            add(owners, `${path}.attributes.${key}`, "정해진 분류(LINK_VOCABULARY)의 표기만 둘 수 있습니다.");
        if ("shares" in attributes) {
          const shares = attributes.shares;
          if (!record(shares)) add(owners, path + ".attributes.shares", "지분율 칸 객체가 필요합니다.");
          else {
            keys(shares, RELATION_KEYS.shares, RELATION_KEYS.shares, owners, path + ".attributes.shares");
            for (const key of RELATION_KEYS.shares)
              if (!(typeof shares[key] === "string" && /^[^\r\n]+$/.test(shares[key] as string) && (shares[key] as string).length <= LINK_TEXT_LIMITS.shares && (shares[key] as string).trim() === shares[key]))
                add(owners, `${path}.attributes.shares.${key}`, "공시 표 그대로의 1~20자 칸 값이 필요합니다.");
          }
        }
        if ("match" in attributes && attributes.match !== "listed" && attributes.match !== "filing") add(owners, path + ".attributes.match", "listed 또는 filing이 필요합니다.");
        const linkKeys = ["role", "stockKind", "purpose", "shares", "match"].filter(key => key in attributes);
        if (!link && linkKeys.length) add(owners, path + ".attributes", `지분 관계 공시에만 쓰는 항목입니다: ${linkKeys.join(", ")}`);
        if ("order" in attributes && !(Number.isSafeInteger(attributes.order) && (attributes.order as number) >= 0 && (attributes.order as number) <= 1000))
          add(owners, path + ".attributes.order", "0 이상의 정수 순서가 필요합니다.");
      }
    }
    // Deterministic IDs from (type, from, to, period); the UI never uses these as DOM ids.
    const from = ends.from?.id, to = ends.to?.id;
    if (raw.type === "operates" && from && to && (from !== owner || id !== `rel-op-${from}-${to}`)) add(owners, path + ".id", "rel-op-<회사>-<법인> 형식이고 시작이 주인 회사여야 합니다.");
    if (raw.type === "has_workplace" && from && to) {
      if (id !== `rel-wp-${from}-${to}` || to !== `wp-${owner}`) add(owners, path + ".id", "rel-wp-<법인>-wp-<주인 회사> 형식이 필요합니다.");
      const place = places.get(to);
      if (place && place.legalEntityId !== from) add(owners, path + ".from", "사업장의 법인과 다릅니다.");
    }
    if (raw.type === "subsidiary_of" || raw.type === "overseas_parent_of") {
      const org = from ? orgs.get(from) : undefined;
      if (org && org.scope !== owner) add(owners, path + ".owner", "조직의 범위 회사가 주인이어야 합니다.");
    }
    if ((raw.type === "shareholder_of" || raw.type === "invests_in") && origin?.source === "dart") {
      // The reporter's own 사업보고서 table, as disclosed: never "자회사"/"모회사", only what the row says.
      const holder = raw.type === "shareholder_of", attributes = record(raw.attributes) ? raw.attributes : null;
      const reporter = holder ? ends.to : ends.from, counterparty = holder ? ends.from : ends.to;
      if (reporter && (!reporter.id.startsWith("le-dart-") || !relationIds.has(`rel-op-${owner}-${reporter.id}`)))
        add(owners, `${path}.${holder ? "to" : "from"}`, "보고 법인은 주인 회사의 DART 운영 법인(le-dart)이어야 합니다.");
      if (counterparty?.kind === "legal-entity") {
        if (!counterparty.id.startsWith("le-dart-") || counterparty.id === reporter?.id) add(owners, `${path}.${holder ? "from" : "to"}`, "상대 법인은 보고 법인이 아닌 le-dart 법인이어야 합니다.");
        if (!attributes || (attributes.match !== "listed" && attributes.match !== "filing")) add(owners, path + ".attributes.match", "DART 고유번호로 확인한 상대는 확인 방법(match)이 필요합니다.");
      }
      if (counterparty && typeof raw.asOf === "string" && /^\d{4}-\d{2}$/.test(raw.asOf)) {
        const base = linkRelationId(raw.type, owner, counterparty.id, raw.asOf), order = attributes?.order;
        if (id !== base && !(Number.isSafeInteger(order) && id === `${base}-${order}`)) add(owners, path + ".id", "rel-sh|inv-<주인>-<상대>-<YYYY-MM>[-<순서>] 형식이 필요합니다.");
      } else add(owners, path + ".asOf", "결산월 YYYY-MM이 필요합니다.");
      if (!attributes || !record(attributes.shares) || !("order" in attributes)) add(owners, path + ".attributes", "지분율 칸·순서가 필요합니다.");
      else {
        if ("stake" in attributes) add(owners, path + ".attributes.stake", "지분 관계 공시는 지분율을 표 그대로(shares) 적습니다.");
        for (const key of holder ? ["purpose"] : ["role", "stockKind"]) if (key in attributes) add(owners, `${path}.attributes.${key}`, `${raw.type} 관계에 없는 항목입니다.`);
      }
      // One cited source: the owner's 사업보고서 of the same period, published on `reportedOn`.
      const citedIds = Array.isArray(raw.evidenceIds) ? (raw.evidenceIds as unknown[]) : [];
      const cited = citedIds.length === 1 ? company?.evidence.find(item => item.id === citedIds[0]) : undefined;
      const periodMark = typeof raw.asOf === "string" ? `(${raw.asOf.replace("-", ".")})` : null;
      if (!cited || !dartFilingNumber(owner, cited.id) || dartDocument(cited.title).name !== "사업보고서" || !periodMark || !cited.title.includes(periodMark) ||
          cited.publisher !== DART_PUBLISHER || raw.reportedOn !== cited.publishedOn)
        add(owners, path + ".evidenceIds", "같은 결산월 사업보고서 근거(<회사>-dart-<접수번호>) 하나를 인용하고 공시일이 같아야 합니다.");
    }
    if (raw.type === "subsidiary_of" && from) {
      const attributes = record(raw.attributes) ? raw.attributes : null;
      const prefix = `rel-sub-${from}-${String(raw.asOf)}`;
      const suffix = id.startsWith(prefix) ? /^(?:-(\d+))?$/.exec(id.slice(prefix.length)) : null;
      if (typeof raw.asOf !== "string" || !/^\d{4}-\d{2}$/.test(raw.asOf) || !suffix) add(owners, path + ".id", "rel-sub-<조직>-<YYYY-MM> 형식이 필요합니다.");
      else if (suffix[1] !== undefined && Number(suffix[1]) !== attributes?.order) add(owners, path + ".id", "ID 끝 순서가 attributes.order와 다릅니다.");
      if (!attributes || !record(attributes.stake) || !("order" in attributes)) add(owners, path + ".attributes", "지분과 순서가 필요합니다.");
    }
    if (!evidenceList(raw.evidenceIds)) { add(owners, path + ".evidenceIds", "중복 없는 근거 ID 목록이 필요합니다."); return; }
    const held = evidenceOf(owner);
    for (const evidenceId of raw.evidenceIds)
      if (!held.has(evidenceId)) add(owners, path + ".evidenceIds", `주인 회사의 리서치에 없는 근거입니다: ${evidenceId}`);
    if (origin?.source === "curated" && company) {
      // Durable only: identity evidence, or evidence a fact outside the research pipeline cites (a pipeline replacement can drop the rest).
      const pipelineFacts = new Set(company.pipeline?.factIds ?? []);
      for (const evidenceId of raw.evidenceIds)
        if (!company.identityEvidence.includes(evidenceId) && !company.facts.some(fact => !pipelineFacts.has(fact.id) && fact.evidenceIds.includes(evidenceId)))
          add(owners, path + ".evidenceIds", `검토 등록 관계는 신원 근거나 리서치 파이프라인 밖 사실이 인용한 근거만 씁니다: ${evidenceId}`);
    }
    if (origin?.source === "dart" && raw.type === "subsidiary_of" && company && typeof raw.asOf === "string") {
      const fact = company.facts.find(item => item.id === subsidiaryFactId(owner, raw.asOf as string));
      if (!fact) add(owners, path + ".asOf", `같은 기간의 DART 종속기업 사실이 없습니다: ${subsidiaryFactId(owner, raw.asOf)}`);
      else if (sortedUnique(fact.evidenceIds).join("\n") !== sortedUnique(raw.evidenceIds).join("\n"))
        add(owners, path + ".evidenceIds", "같은 기간 DART 종속기업 사실과 같은 근거를 인용해야 합니다.");
    }
  });

  const correctionKeys = new Set<string>();
  const checkCorrection = (raw: unknown, index: number) => {
    const path = `corrections[${index}]`;
    if (!record(raw)) { add([], path, "정정 객체가 필요합니다."); return; }
    const target = typeof raw.relationId === "string" ? relationById.get(raw.relationId) : undefined;
    const owner = target && typeof target.owner === "string" ? target.owner : null, owners = owner ? [owner] : [];
    keys(raw, RELATION_KEYS.correction, RELATION_KEYS.correction, owners, path);
    if (!target) { add(owners, path + ".relationId", "있는 관계 ID가 필요합니다."); return; }
    const company = owner ? companies.get(owner) : undefined;
    if (raw.kind !== "row" && raw.kind !== "claim") add(owners, path + ".kind", "row 또는 claim이 필요합니다.");
    const key = `${raw.relationId}\n${String(raw.kind)}`;
    if (correctionKeys.has(key)) add(owners, path, "같은 관계의 같은 종류 정정이 이미 있습니다.");
    correctionKeys.add(key);
    const factIds = raw.factIds;
    if (!Array.isArray(factIds) || new Set(factIds).size !== factIds.length || !factIds.every(id => typeof id === "string"))
      add(owners, path + ".factIds", "중복 없는 사실 ID 목록이 필요합니다.");
    else if (raw.kind === "row" && factIds.length) add(owners, path + ".factIds", "row 정정은 사실을 가리키지 않습니다.");
    else if (raw.kind === "claim") {
      if (!factIds.length) add(owners, path + ".factIds", "claim 정정은 철회할 사실을 하나 이상 가리킵니다.");
      for (const factId of factIds) if (!company?.facts.some(fact => fact.id === factId)) add(owners, path + ".factIds", `주인 회사에 없는 사실입니다: ${factId}`);
    }
    if (!text(raw.reason)) add(owners, path + ".reason", "1~500자 사유가 필요합니다.");
    if (!pastDay(raw.reviewedOn)) add(owners, path + ".reviewedOn", "미래가 아닌 검토일 YYYY-MM-DD가 필요합니다.");
    if (!evidenceList(raw.evidenceIds, true)) add(owners, path + ".evidenceIds", "중복 없는 근거 ID 목록이 필요합니다.");
    else if (owner) for (const evidenceId of raw.evidenceIds)
      if (!evidenceOf(owner).has(evidenceId)) add(owners, path + ".evidenceIds", `주인 회사의 리서치에 없는 근거입니다: ${evidenceId}`);
  };
  corrections.forEach((raw, index) => {
    const before = added;
    checkCorrection(raw, index);
    if (added !== before) invalidCorrections.push(index);
  });
  return { fileIssues, issuesByCompany, invalidCorrections };
}

/**
 * Identity ∪ file, validated: the one way every reader (site, wiki, report)
 * turns a parsed file into a pack and per-company issues. Identity relations
 * written into the file are an issue of their owner (they are derived, never
 * persisted). Any file issue means the file is unusable as a whole.
 */
export function resolveRelations(file: RelationsFile | null, identity: IdentityRelations, research: ResearchPack, now = new Date()): RelationsValidation & { pack: RelationsPack } {
  const pack = assembleRelations(file, identity);
  const result = validateRelations(pack, research, now);
  (file?.relations ?? []).forEach((relation, index) => {
    const value = relation as unknown;
    if (!record(value) || typeof value.owner !== "string" || !record(value.origin) || value.origin.source !== "identity") return;
    (result.issuesByCompany[value.owner] ??= []).push({ path: `$.relations[${index}].origin.source`, message: "신원 관계는 파일에 저장하지 않습니다." });
  });
  return { pack, ...result };
}

export type CompanyRelations = {
  /** The company's own relations (all types) left after corrections; empty while the company has issues. */
  rows: Relation[];
  /** The valid corrections of the company's relations (the only ones that hide or retract anything), in file order. */
  corrections: Correction[];
  /** Facts every one of whose claims a `claim` correction retracted: suppressed from fact list, timeline and wiki, never restored. */
  suppressedFactIds: string[];
  /** Facts only some of whose claims are retracted: they stay, with a pending research correction (O-5). */
  pendingFactIds: string[];
  /** True when the company's relations must not be shown: its issues, or every `subsidiary_of` row corrected away. */
  hidden: boolean;
  reason: "issues" | "corrected" | null;
};

/**
 * One company's visible relations. `row` corrections hide a relation (its
 * source fact stays); `claim` corrections hide it and retract the listed facts.
 * A fact backs every `subsidiary_of` row of its period and every relation whose
 * correction lists it; it is suppressed only when all of those are retracted.
 * Only corrections `validateRelations` accepted act: an invalid one (future
 * `reviewedOn`, empty reason, unknown evidence or facts, bad kind) is an issue
 * of its owner, which hides the company's relations, and never hides a row or
 * retracts a fact by itself. A valid `claim` keeps its facts retracted even
 * while the company has other issues.
 */
export function visibleRelationsForCompany(
  pack: RelationsPack,
  validation: Pick<RelationsValidation, "issuesByCompany" | "invalidCorrections">,
  companyId: string,
): CompanyRelations {
  const { issuesByCompany } = validation, invalid = new Set(validation.invalidCorrections);
  const owned = pack.relations.filter(relation => record(relation) && relation.owner === companyId);
  const ids = new Set(owned.map(relation => relation.id));
  const corrections = pack.corrections.filter((correction, index) => !invalid.has(index) && record(correction) && ids.has(correction.relationId));
  const hiddenIds = new Set(corrections.map(correction => correction.relationId));
  const retracted = new Map<string, Set<string>>(), listed = new Map<string, Set<string>>();
  for (const correction of corrections) {
    const factIds = Array.isArray(correction.factIds) ? correction.factIds : [];
    for (const factId of factIds) {
      const into = correction.kind === "claim" ? retracted : listed;
      (into.get(correction.relationId) ?? into.set(correction.relationId, new Set()).get(correction.relationId)!).add(factId);
    }
  }
  const backs = (relation: Relation, factId: string) =>
    (relation.type === "subsidiary_of" && relation.origin?.source === "dart" && typeof relation.asOf === "string" && subsidiaryFactId(companyId, relation.asOf) === factId) ||
    !!retracted.get(relation.id)?.has(factId) || !!listed.get(relation.id)?.has(factId);
  const claimed = sortedUnique([...retracted.values()].flatMap(set => [...set]));
  const suppressedFactIds = claimed.filter(factId => owned.filter(relation => backs(relation, factId)).every(relation => retracted.get(relation.id)?.has(factId)));
  const pendingFactIds = claimed.filter(factId => !suppressedFactIds.includes(factId));
  if (issuesByCompany[companyId]?.length) return { rows: [], corrections, suppressedFactIds, pendingFactIds, hidden: true, reason: "issues" };
  const rows = owned.filter(relation => !hiddenIds.has(relation.id));
  const corrected = owned.some(relation => relation.type === "subsidiary_of") && !rows.some(relation => relation.type === "subsidiary_of");
  return { rows, corrections, suppressedFactIds, pendingFactIds, hidden: corrected, reason: corrected ? "corrected" : null };
}

/** Per-company counts by type, and relations citing evidence their owner's research does not hold. */
export function relationsReport(pack: RelationsPack, research: ResearchPack) {
  const companies = new Map(research.companies.map(company => [company.id, new Set(company.evidence.map(item => item.id))]));
  const counts: Record<string, Partial<Record<RelationType, number>>> = {};
  const dangling: { relationId: string; owner: string; evidenceIds: string[] }[] = [];
  for (const relation of pack.relations) {
    if (!record(relation)) continue;
    const owner = String(relation.owner), byType = (counts[owner] ??= {});
    byType[relation.type] = (byType[relation.type] ?? 0) + 1;
    const held = companies.get(owner) ?? new Set<string>();
    const missing = (Array.isArray(relation.evidenceIds) ? relation.evidenceIds : []).filter(id => !held.has(id));
    if (missing.length || !Array.isArray(relation.evidenceIds) || !relation.evidenceIds.length) dangling.push({ relationId: String(relation.id), owner, evidenceIds: missing });
  }
  const sorted = Object.fromEntries(Object.keys(counts).sort(compare).map(owner => [owner, counts[owner]]));
  return { companies: sorted, dangling: dangling.sort((a, b) => compare(a.relationId, b.relationId)) };
}
