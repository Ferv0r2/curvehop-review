import demoCompanies from "../data/demo-companies.json";
import { toSource, usableDiscoveredSources, usableDiscoveredCompanies, type DiscoveredCompany, type DiscoveredSource } from "./discovered-sources";
import type { Provider } from "./jobs";
export type Source = {
  provider?: Provider;
  careerUrl?: string;
  greetingWorkspaceId?: number;
  locationAliases?: Record<string, { label: string; evidenceUrl: string }>;
  board: string;
  company: string;
  color: string;
  customJobPage?: { host: string; path: string };
};
export const sourceKey = (source: { provider?: Provider; board: string }) =>
  `${source.provider ?? "greenhouse"}:${source.board}`;
/** Review-only fictional sources. Their matching keys take precedence over discovered entries. */
// Fictional, inert board identifiers. This edition never runs collectors.
export const codeSources: Source[] = demoCompanies.map(company => ({provider:"greeting",board:company.id,company:company.name,color:company.color,careerUrl:company.careerUrl}));

/**
 * data/discovered-sources.json, loaded so that a malformed file never stops a process (sixth audit 1).
 * `read` throws on a truncated or invalid file; that, or a file that is not a version-1 object with a
 * sources array, means no data sources and an `issue` the worker reports. Entries that overlap a code
 * source or fail validation are left out (and counted in the issue); the data gate never lets such an
 * entry reach main.
 */
export function loadDiscovered(read: () => unknown, code: readonly Source[]): { entries: DiscoveredSource[]; companies?: DiscoveredCompany[]; issue: string | null } {
  let raw: unknown;
  try {
    raw = read();
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0].slice(0, 160) : "읽기 실패";
    return { entries: [], issue: `data/discovered-sources.json을 읽지 못해 탐지 출처 없이 계속합니다(${reason}).` };
  }
  const file = raw as { version?: unknown; sources?: unknown } | null;
  if (!file || typeof file !== "object" || Array.isArray(file) || file.version !== 1 || !Array.isArray(file.sources))
    return { entries: [], issue: "data/discovered-sources.json이 version 1의 sources 배열이 아니라 탐지 출처 없이 계속합니다." };
  // A retired list that is not a list: nothing is known to be safe to collect (usableDiscoveredSources yields none).
  if ((file as { retired?: unknown }).retired !== undefined && !Array.isArray((file as { retired?: unknown }).retired))
    return { entries: [], issue: "data/discovered-sources.json의 retired가 배열이 아니라 탐지 출처 없이 계속합니다." };
  const entries = usableDiscoveredSources(file, code);
  const companies = usableDiscoveredCompanies(file, code);
  const companyValues = (file as {companies?:unknown}).companies;
  const unused = file.sources.length - entries.length + (Array.isArray(companyValues) ? companyValues.length - companies.length : companyValues === undefined ? 0 : 1);
  return { entries, ...(companies.length ? {companies} : {}), issue: unused ? `data/discovered-sources.json의 항목 ${unused}개가 형식·겹침 문제로 쓰이지 않았습니다.` : null };
}
// The bundler inlines the file for the app (main's copy passed the data gate); a worker process (tsx) reads it
// here at load time, where a malformed file must not throw. A dynamic import cannot be awaited at module load.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loaded = loadDiscovered(() => require("../data/discovered-sources.json"), codeSources);
/** Sources the mini PC discovered and proved (data/discovered-sources.json, phase 3). */
export const discoveredEntries: DiscoveredSource[] = loaded.entries;
export const discoveredCompanyEntries: DiscoveredCompany[] = loaded.companies ?? [];
export const discoveredCompanies = discoveredCompanyEntries;
/** Why data sources were left out at load, for the worker to report (null: none). */
export const discoveredLoadIssue: string | null = loaded.issue;
export const dataSources: Source[] = discoveredEntries.map(toSource);
export const sources: Source[] = [...codeSources, ...dataSources];
/** Keys of code sources: logos and pension reviews are required only for their companies. */
export const codeSourceKeys: ReadonlySet<string> = new Set(codeSources.map(sourceKey));
