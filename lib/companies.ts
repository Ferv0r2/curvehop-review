import { codeSourceKeys, discoveredEntries, discoveredCompanyEntries, sources, sourceKey, type Source } from "./sources";
import { companyIdForDiscoveredSource, DISCOVERED_COLOR, type DiscoveredCompany, type DiscoveredSource } from "./discovered-sources";
import type { Provider } from "./jobs";
import { pensionRosterReview } from "./pension-registry";
import { notOwnPosting } from "./posting-company";
import { isJobPlatformUrl } from "./job-platforms";

// Review-only roster: every identity is fictional; source matching logic below is unchanged.
import demoCompanies from "../data/demo-companies.json";
export const researchRoster: Identity[] = demoCompanies;
export type Identity = {
  id: string;
  name: string;
  legalName: string | null;
  brand: string;
  color: string;
  sourceKeys: readonly string[];
  careerUrl: string | null;
  homepage?: string;
  aliases?: readonly string[];
  /** Products and services, for search; not names of the company itself. */
  products?: readonly string[];
};

const owned = new Set(researchRoster.flatMap((c) => [...c.sourceKeys]));
// Other names a seeker types for the company itself: romanized and short names.
const nameAliases: Record<string, readonly string[]> = {};
const productAliases: Record<string, readonly string[]> = Object.fromEntries(demoCompanies.map(company => [company.id, company.products]));
/**
 * The public page of a Greenhouse or Lever board, by the provider's own rule: those sources carry no
 * careerUrl (lib/discovered-sources.ts). Greeting and Workday boards are not derivable and return null.
 */
export function providerBoardUrl(key: string): string | null {
  const [provider, board] = key.split(":");
  if (!board || !/^[A-Za-z0-9_-]+$/.test(board)) return null;
  return provider === "greenhouse" ? `https://boards.greenhouse.io/${board}`
    : provider === "lever" ? `https://jobs.lever.co/${board}` : null;
}
/**
 * The official job board of a company's registered job source: its careerUrl, or the provider's board
 * page for Greenhouse and Lever. Null for a company with no registered source, and never anything but
 * an https address off the job platforms (lib/job-platforms.ts): those are never linked.
 */
export function sourceBoardUrl(identity: Pick<Identity, "sourceKeys" | "careerUrl">): string | null {
  if (!identity.sourceKeys.length) return null;
  const url = identity.careerUrl ?? identity.sourceKeys.map(providerBoardUrl).find((value) => value !== null) ?? null;
  if (!url) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return isJobPlatformUrl(url) ? null : url;
}
/**
 * Registered companies: the research roster, then one company per source the
 * roster does not own. A discovered source (data/discovered-sources.json)
 * brings its legal name; its company needs no logo or pension review (spec §5)
 * and never takes an id a code company already has.
 */
export function companiesFrom(sourceList: readonly Source[], discovered: readonly DiscoveredSource[] = [], companyEntries: readonly DiscoveredCompany[] = []): Identity[] {
  const legal = new Map(discovered.map((entry) => [`${entry.provider}:${entry.board}`, entry.legalName]));
  const fromSources = sourceList
    .filter((s) => !owned.has(sourceKey(s)))
    .map((s) => ({
      id: (() => { const entry = discovered.find(entry => `${entry.provider}:${entry.board}` === sourceKey(s)); return entry ? companyIdForDiscoveredSource(entry, companyEntries) : `${s.provider ?? "greenhouse"}-${s.board}`; })(),
      name: s.company,
      legalName: legal.get(sourceKey(s)) ?? null,
      brand: s.company,
      color: s.color,
      sourceKeys: [sourceKey(s)],
      careerUrl: s.careerUrl ?? providerBoardUrl(sourceKey(s)),
    }));
  const companyFirst: Identity[] = companyEntries.map(entry => {
    const attached = fromSources.filter(source => source.id === entry.id);
    return {id:entry.id,name:entry.name,legalName:entry.legalName,brand:entry.name,color:DISCOVERED_COLOR,homepage:entry.homepage,sourceKeys:attached.flatMap(source => source.sourceKeys),careerUrl:attached[0]?.careerUrl ?? null};
  });
  const ids = new Set<string>();
  return ([...researchRoster, ...companyFirst, ...fromSources] as Identity[])
    .filter((company) => !ids.has(company.id) && !!ids.add(company.id))
    .map((company) => ({
      ...company,
      legalName: pensionRosterReview.find(review => review.companyId === company.id && review.status === "verified")?.legalName ?? company.legalName,
      aliases: [...(company.aliases ?? []), ...(nameAliases[company.id] ?? [])],
      products: productAliases[company.id] ?? [],
    }));
}
export const companies: Identity[] = companiesFrom(sources, discoveredEntries, discoveredCompanyEntries);
/**
 * Whether a company comes from code (the roster or a code source), as opposed
 * to a discovered data source. Logos and pension reviews are required only
 * for code companies (tests/company-logos.test.ts, tests/pension-roster-integrity.test.ts).
 */
export const isCodeCompany = (company: Pick<Identity, "sourceKeys" | "id">) =>
  researchRoster.some((c) => c.id === company.id) || company.sourceKeys.some((key) => codeSourceKeys.has(key));
/**
 * The day each data-source company was registered (data/discovered-sources.json
 * `addedOn`), by company id. Code companies have no date and are never listed.
 */
export function companyAddedOn(list: readonly Identity[], discovered: readonly DiscoveredSource[], companyEntries: readonly DiscoveredCompany[] = []): ReadonlyMap<string, string> {
  const added = new Map(discovered.map((entry) => [`${entry.provider}:${entry.board}`, entry.addedOn]));
  const result = new Map<string, string>();
  for (const company of list) {
    if (isCodeCompany(company)) continue;
    const day = companyEntries.find(entry => entry.id === company.id)?.addedOn ?? company.sourceKeys.map((key) => added.get(key)).find((value) => typeof value === "string");
    if (day) result.set(company.id, day);
  }
  return result;
}
export const companiesAddedOn = companyAddedOn(companies, discoveredEntries, discoveredCompanyEntries);
export const normalizeName = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/주식회사|\(주\)|[\s·.]/g, "");
const exactly = (names: readonly (string | null | undefined)[], query: string) =>
  names.some((n) => n && normalizeName(n) === query);
/** The company a query names, by its own names (not its products). */
export function findCompany(name: string): Identity | undefined {
  const query = normalizeName(name);
  if (!query) return undefined;
  const matches = companies.filter((c) => exactly([c.name, c.legalName, c.brand, ...(c.aliases ?? [])], query));
  return matches.length === 1 ? matches[0] : undefined;
}
/** The company whose product or service a query names. */
export function findCompanyByProduct(name: string): Identity | undefined {
  const query = normalizeName(name);
  if (!query) return undefined;
  const matches = companies.filter((c) => exactly(c.products ?? [], query));
  return matches.length === 1 ? matches[0] : undefined;
}
/** The registered company whose board carries the posting, whichever company the posting names. */
export function boardCompanyForJob(job: {
  source: Provider;
  sourceBoard: string;
}): Identity | undefined {
  const key = sourceKey({ provider: job.source, board: job.sourceBoard });
  return companies.find((c) => c.sourceKeys.includes(key));
}
/**
 * The company a posting belongs to: its board's company, unless on a shared board the posting names
 * another company or its company is unconfirmed (lib/posting-company.ts).
 */
export function companyForJob(job: {
  source: Provider;
  sourceBoard: string;
  title: string;
  description: string;
}): Identity | undefined {
  return notOwnPosting(job) ? undefined : boardCompanyForJob(job);
}
/**
 * A company's own postings among raw rows. Rows are first narrowed to the company's registered boards, and only
 * those are read for whose posting they are (shared boards). A malformed row on another company's board is never
 * read, so it cannot stop this company's research (R0-5). Same result as filtering by `companyForJob`.
 */
export function companyJobs<T extends { source: Provider; sourceBoard: string; title: string; description: string }>(rows: readonly T[], companyId: string): T[] {
  const keys = new Set(companies.find((c) => c.id === companyId)?.sourceKeys ?? []);
  return rows.filter((row) => !!row && typeof row === "object" && typeof row.sourceBoard === "string"
    && keys.has(sourceKey({ provider: row.source, board: row.sourceBoard })) && companyForJob(row)?.id === companyId);
}
