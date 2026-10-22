/**
 * Data for /about (DESIGN.md 제품 소개): the live numbers, the graph input and
 * the worker schedule the architecture section describes. Pure functions over
 * the data the site already reads; the page passes the published snapshot,
 * research and relations in.
 */
import { citedEvidenceByCompany, evidenceOrigin, evidenceOriginCounts, type EvidenceOriginCount } from "./source-evidence";
import { brand } from "./brand";
import type { Identity } from "./companies";
import type { DiscoveredSource, DiscoveredCompany } from "./discovered-sources";
import type { Provider } from "./jobs";
import { providers } from "./jobs";
import { joinCompanyJobs, type CompanyResearch } from "./research";
import type { Snapshot } from "./store";
import type { GraphCompany, Scope } from "./product-graph";

export const ABOUT_DESCRIPTION =
  `${brand.koreanName}은 서울·판교의 회사와 채용 공고를 살펴보는 기업 리서치 서비스예요. 공개 자료로 확인한 사업·인재상·투자 이력과 지원 조건을 출처와 함께 살펴보세요.`;

/** A research company cites DART when one of its sources is a DART filing page. */
export const citesDart = (company: CompanyResearch) =>
  (citedEvidenceByCompany([company]).get(company.id) ?? []).some((item) => {
    try { return /(^|\.)dart\.fss\.or\.kr$/.test(new URL(item.url).hostname); } catch { return false; }
  });
/** Monthly pension-subscriber observations (국민연금공단), not a reported headcount. */
export const pensionObservations = (company: CompanyResearch) =>
  company.headcount.filter((item) => item.measurement === "pension-subscribers").length;

export type SubsidiaryRows = (companyId: string) => readonly { name: string; filing: string }[];

/**
 * Registered companies as graph input: postings from the snapshot, edges from research and sources.
 * `snapshot` is null when the jobs file could not be read; a company whose postings cannot be read
 * (that, or a malformed snapshot) gets `postings: null`, never a false 0.
 */
export function graphCompanies(input: {
  companies: readonly Identity[];
  snapshot: Snapshot | null;
  research: readonly CompanyResearch[] | null;
  discovered: readonly Pick<DiscoveredSource, "provider" | "board" | "scope">[];
  companyEntries?: readonly Pick<DiscoveredCompany, "id" | "scope">[];
  subsidiaries: SubsidiaryRows;
}): GraphCompany[] {
  const research = new Map((input.research ?? []).map((company) => [company.id, company]));
  const cited = citedEvidenceByCompany(input.research ?? []);
  const scopes = new Map(input.discovered.map((entry) => [`${entry.provider}:${entry.board}`, entry.scope as Scope]));
  return input.companies.map((identity) => {
    const company = research.get(identity.id);
    const companyScope = input.companyEntries?.find(entry => entry.id === identity.id)?.scope;
    const systems = [...new Set(identity.sourceKeys.map((key) => key.split(":")[0]))]
      .filter((provider): provider is Provider => (providers as readonly string[]).includes(provider));
    // Any failure reading this company's postings is unknown, not an error page and not 0.
    let postings: number | null;
    try {
      const hiring = joinCompanyJobs(identity, input.snapshot);
      postings = !identity.sourceKeys.length || hiring.status === "unavailable" ? null : hiring.jobs.length;
    } catch {
      postings = null;
    }
    return {
      id: identity.id,
      name: identity.name,
      postings,
      systems,
      scope: (companyScope === "requested" ? null : companyScope) ?? identity.sourceKeys.map((key) => scopes.get(key)).find(Boolean) ?? null,
      pension: company ? pensionObservations(company) > 0 : false,
      dart: (cited.get(identity.id) ?? []).some(item => { try { return /(^|\.)dart\.fss\.or\.kr$/.test(new URL(item.url).hostname); } catch { return false; } }),
      origins: [...new Set((cited.get(identity.id) ?? []).map(evidenceOrigin))],
      research: !!company,
      subsidiaries: company ? input.subsidiaries(identity.id) : [],
    };
  });
}

export type ProductStats = {
  /** null when postings could not be read: the page says 미확인 rather than 0. */
  companiesWithJobs: number | null;
  postings: number | null;
  /** Career sources of the listed companies; null when nothing can be listed (research unreadable). */
  sources: number | null;
  reviewedSources: number | null;
  discoveredSources: number | null;
  /** null when the research could not be read: the page says 미확인 rather than 0. */
  researchCompanies: number | null;
  evidence: number | null;
  evidenceOrigins: EvidenceOriginCount[];
  collectors: { provider: Provider; companies: number }[];
  records: number | null;
  pensionObservations: number | null;
  /** Latest successful collection among sources, ISO; null when none succeeded. */
  checkedAt: string | null;
};

export function productStats(input: {
  graph: readonly GraphCompany[];
  reviewedSources: number | null;
  discoveredSources: number | null;
  research: readonly CompanyResearch[] | null;
  snapshot: Snapshot | null;
}): ProductStats {
  const research = input.research;
  const cited = citedEvidenceByCompany(research ?? []);
  const unread = input.snapshot === null || input.graph.some((company) => company.systems.length > 0 && company.postings === null);
  return {
    companiesWithJobs: unread ? null : input.graph.filter((company) => (company.postings ?? 0) > 0).length,
    postings: unread ? null : input.graph.reduce((sum, company) => sum + (company.postings ?? 0), 0),
    sources: input.reviewedSources === null || input.discoveredSources === null ? null : input.reviewedSources + input.discoveredSources,
    reviewedSources: input.reviewedSources,
    discoveredSources: input.discoveredSources,
    researchCompanies: research ? research.length : null,
    evidence: research ? [...cited.values()].reduce((sum, sources) => sum + sources.length, 0) : null,
    evidenceOrigins: evidenceOriginCounts(cited),
    collectors: providers.map(provider => ({ provider, companies: input.graph.filter(company => company.systems.includes(provider)).length })).filter(item => item.companies > 0),
    // Facts and headcount observations that cite at least one source.
    records: research ? research.reduce((sum, company) =>
      sum + company.facts.filter((fact) => fact.evidenceIds.length).length + company.headcount.filter((item) => item.evidenceIds.length).length, 0) : null,
    pensionObservations: research ? research.reduce((sum, company) => sum + pensionObservations(company), 0) : null,
    checkedAt: lastSuccess(input.snapshot),
  };
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;
/** The latest successful collection among well-formed source rows; malformed rows are skipped, never dereferenced. */
export function lastSuccess(snapshot: Snapshot | null): string | null {
  const rows: unknown[] = Array.isArray(snapshot?.sources) ? snapshot.sources : [];
  const times = rows
    .map((row) => (row && typeof row === "object" ? (row as { lastSuccessAt?: unknown }).lastSuccessAt : undefined))
    .filter((at): at is string => typeof at === "string" && ISO_TIME.test(at) && Number.isFinite(Date.parse(at)))
    .sort();
  return times.at(-1) ?? null;
}

/**
 * The mini PC's crontab (scripts/minipc/install-cron), in the words the
 * architecture section uses. tests/product-intro.test.ts reads the crontab, so
 * a schedule change that misses this page fails the tests.
 */
export const WORKER_SCHEDULE = [
  { job: "jobs", cron: "17 */6 * * *", title: "공고 수집·원본 보관", cadence: "6시간마다 · 00:17부터" },
  { job: "research", cron: "0 10 * * *", title: "리서치", cadence: "매일 10:00 · 하루 한 회사" },
  { job: "publish", cron: "30 11 * * *", title: "발행", cadence: "매일 11:30" },
  { job: "discover", cron: "30 13 * * 0", title: "채용 원천 탐지", cadence: "매주 일요일 13:30" },
  { job: "watchdog", cron: "47 * * * *", title: "감시", cadence: "매시 47분" },
] as const;
export const scheduleOf = (job: (typeof WORKER_SCHEDULE)[number]["job"]) => WORKER_SCHEDULE.find((item) => item.job === job)!;
