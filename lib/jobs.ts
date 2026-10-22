import { freezeData, isFrozenData } from "./immutable-data";
import { isVacancy } from "./eligibility";
import { stackTags } from "./greenhouse";
import { classifyRole } from "./roles";
import { findCompany, findCompanyByProduct, companyForJob } from "./companies";
import { postingCompanyLabel } from "./posting-company";
import { isJobPlatformUrl, withoutPlatformUrls } from "./job-platforms";
import { parseSizes, type SizeBand, type SizeFilter } from "./company-size-bands";
import { analyzeJob, type JobInsights } from "./job-insights";
import { firstSeenOn, parseNewDay } from "./new-arrivals";
export type SearchParams = Record<string, string | string[] | undefined>;
/** Every collector. Validators must use this list, never a local copy. */
export const providers = ["greenhouse", "lever", "greeting", "workday"] as const;
export type Provider = (typeof providers)[number];
export type Role =
  | "frontend"
  | "backend"
  | "mobile"
  | "data"
  | "infra"
  | "security"
  | "qa"
  | "engineering"
  | "design"
  | "product"
  | "marketing"
  | "sales"
  | "md"
  | "operations"
  | "strategy"
  | "finance"
  | "hr"
  | "legal"
  | "other";
export type Location = "seoul" | "pangyo" | "remote" | "global";
export type Job = {
  id: string;
  source: Provider;
  sourceBoard: string;
  sourceJobId: string;
  sourceUrl: string;
  company: string;
  initial: string;
  color: string;
  title: string;
  role: Role;
  roleLabel: string;
  location: Location;
  locationLabel: string;
  workplaceType?: "remote" | "hybrid" | "on-site";
  experience: string | null;
  salary: string | null;
  tags: string[];
  description: string;
  updatedAt: string | null;
  fetchedAt: string;
  /**
   * When the collector first saw this posting id (lib/collection.ts). Null: it
   * was already in the snapshot before the field existed, so the date is
   * unknown. Absent only in snapshots written before then.
   */
  firstSeenAt?: string | null;
  links?: { text: string; url: string }[];
  insights?: JobInsights;
  companyId?: string;
};
// Keys are stable (URLs, cookies); labels and order are what people see.
export const roleLabels: Record<Role, string> = {
  frontend: "프론트엔드",
  backend: "백엔드",
  mobile: "모바일",
  data: "데이터·AI",
  infra: "인프라·DevOps",
  security: "보안·정보보호",
  qa: "QA·테스트",
  engineering: "기타 개발",
  design: "디자인",
  product: "프로덕트·기획",
  marketing: "마케팅·콘텐츠",
  sales: "영업·사업개발",
  md: "MD·카테고리",
  operations: "운영·CS",
  strategy: "전략·분석",
  finance: "재무·회계",
  hr: "인사·채용",
  legal: "법무·컴플라이언스",
  other: "기타 직군",
};
export const locationLabels = {
  seoul: "서울",
  pangyo: "판교",
};
export type Filters = {
  q: string;
  role: string;
  location: string;
  /** Company size bands (latest same-workplace pension count); empty means every size. */
  size: SizeFilter[];
  /** `new=YYYY-MM-DD`: only postings first collected that KST day; "" for all. */
  new: string;
  page: number;
};
export function parseFilters(params: SearchParams): Filters {
  const read = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  const page = Number(read("page"));
  return {
    q: read("q").trim().slice(0, 100),
    role: Object.hasOwn(roleLabels, read("role")) ? read("role") : "",
    location: Object.hasOwn(locationLabels, read("location"))
      ? read("location")
      : "",
    size: parseSizes(params.size),
    new: parseNewDay(params.new),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
const JOBS_PER_PAGE = 24;

/**
 * `sizes` maps a company id to its size band (server only; the research pack
 * is not shipped to the browser). Without it, size is not filtered.
 */
export function queryJobs(jobs: Job[], params: SearchParams, sizes?: ReadonlyMap<string, SizeBand>) {
  const filters = parseFilters(params);
  const available = jobs.filter(isVacancy).map(projectJob);
  const company = findCompany(filters.q);
  const product = company ? undefined : findCompanyByProduct(filters.q);
  // Latin product names match whole words ("NOL" is not "techNOLogy").
  const escaped = filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentions = new RegExp(/^[\x20-\x7e]+$/.test(filters.q) ? `\\b${escaped}\\b` : escaped, "i");
  // Search terms likewise: a Latin edge must be a word edge ("PM" is not "DeveloPMent", "UX" is
  // not "LinUX"), while Korean matches inside words. A version may follow a name (".NET6",
  // "iOS16"), so only a letter ends the match. Titles spell the Go language "Golang".
  const ending = /[a-z]$/i.test(filters.q) ? "(?![a-z])" : /\w$/.test(filters.q) ? "\\b" : "";
  const term = new RegExp(
    `${/^\w/.test(filters.q) ? "\\b" : ""}${escaped}${ending}${/^go$/i.test(filters.q) ? "|\\bgolang\\b" : ""}`,
    "i",
  );
  const searched = available.filter(
    (job) =>
      (!filters.role || job.insights!.roles.includes(filters.role as Role)) &&
      (!filters.location || filters.location === job.location) &&
      (!filters.new || firstSeenOn(job.firstSeenAt, filters.new)) &&
      (company
        ? companyForJob(job)?.id === company.id
        : product
          ? companyForJob(job)?.id === product.id &&
            mentions.test(`${job.title}\n${job.description}`)
          : term.test([
            job.company,
            job.title,
            job.roleLabel,
            job.locationLabel,
            ...job.tags,
          ].join(" "))),
  );
  const bandOf = (job: Job): SizeFilter => sizes?.get(companyForJob(job)?.id ?? "") ?? "unknown";
  const sizing = !!sizes && filters.size.length > 0;
  const filtered = sizing ? searched.filter((job) => filters.size.includes(bandOf(job))) : searched;
  // Companies without a count are left out of a size filter, but never silently.
  const sizeUnknown = sizing && !filters.size.includes("unknown") ? searched.filter((job) => bandOf(job) === "unknown").length : 0;
  // Preserve each company's source order, but interleave companies across the
  // full result before pagination so a large employer cannot fill page one.
  const groups = new Map<string, Job[]>();
  for (const job of filtered) {
    const group = groups.get(job.company) ?? [];
    group.push(job);
    groups.set(job.company, group);
  }
  const matching: Job[] = [];
  for (let index = 0; matching.length < filtered.length; index++) {
    for (const group of groups.values())
      if (group[index]) matching.push(group[index]);
  }
  const totalPages = Math.max(1, Math.ceil(matching.length / JOBS_PER_PAGE));
  const page = Math.min(filters.page, totalPages);
  return {
    items: matching.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE),
    total: matching.length,
    available: available.length,
    companies: new Set(available.map((job) => job.company)).size,
    matchingCompanies: groups.size,
    sizeUnknown,
    page,
    totalPages,
    filters: { ...filters, page },
    companyId: (company ?? product)?.id,
  };
}
// Boards sometimes put the workplace name (often the company itself) beside
// the address: "㈜딥엑스 · 판교역로 … · ㈜딥엑스". Drop repeats and the company name.
const companyName = (s: string) => s.replace(/㈜|\(주\)|주식회사|\s/g, "").toLowerCase();
export function tidyLocation(label: string, company: string) {
  if (!label) return label;
  const seen = new Set<string>();
  const parts = label.split(" · ").filter((part) => {
    const key = companyName(part);
    if (!key || seen.has(key) || key === companyName(company)) return false;
    seen.add(key);
    return true;
  });
  return parts.length ? parts.join(" · ") : label;
}
/** A list row's location: the area name and district, not the street address. */
export function shortLocation(label: string) {
  const parts = label.split(" · ");
  const district = label.match(/[가-힣]+(?:구|군)(?=\s|$)/)?.[0];
  const area = parts[0].length <= 8 ? parts[0] : null;
  if (area) return district && !area.includes(district) ? `${area} · ${district}` : area;
  return district ?? (parts[0].length <= 24 ? parts[0] : `${parts[0].slice(0, 22)}…`);
}
// Only objects prepared from the current server revision can skip analysis.
// Serialized/stored insights never constitute that proof.
const prepared = new WeakSet<Job>();
const projections = new WeakMap<Job, Job>();
export function prepareJob(stored: Job): Job {
  const projection = projectJob(stored);
  if (prepared.has(projection)) return projection;
  // Mutable caller inputs may share nested arrays with the projection.
  const result = freezeData(structuredClone(projection));
  prepared.add(result);
  return result;
}
// Recompute from saved source text so legacy snapshots and every view agree.
export function projectJob(stored: Job): Job {
  if (prepared.has(stored)) return stored;
  const previous = projections.get(stored);
  if (previous) return previous;
  // The role taxonomy evolves; derive it from the title for every snapshot.
  const role = classifyRole(stored.title);
  // A stored posting without a text body (null from a malformed row) reads as an empty body, so
  // analysis and every page that projects it (lists, details, /about) never call string methods on null.
  // Job-platform addresses in the company's own posting are hidden from every page (lib/job-platforms.ts).
  const description = withoutPlatformUrls(typeof stored.description === "string" ? stored.description : "");
  const links = Array.isArray(stored.links) ? stored.links.filter((link) => !isJobPlatformUrl(typeof link?.url === "string" ? link.url : "")) : stored.links;
  const job = { ...stored, description, links, role, roleLabel: roleLabels[role] };
  const insights = analyzeJob(job);
  // Stack tags come from the role's own sections when the JD has them, so a
  // company intro or another track's stack does not tag this role.
  const sectionText = [...insights.sections.duties, ...insights.sections.required, ...insights.sections.preferred, ...insights.stack].join("\n");
  const result = {
    ...job,
    // On a shared board, a posting that is not the board company's own shows whose it is (lib/posting-company.ts).
    company: postingCompanyLabel(job) ?? job.company,
    locationLabel: tidyLocation(job.locationLabel, job.company),
    tags: stackTags(sectionText || job.description),
    companyId: companyForJob(job)?.id,
    insights,
  };
  // Published snapshots are deeply frozen. Mutable worker/fixture inputs must
  // still recompute, and stored insights are never trusted.
  if (isFrozenData(stored)) {
    freezeData(result);
    prepared.add(result);
    projections.set(stored, result);
  }
  return result;
}
export type SourceState = {
  provider?: Provider;
  board: string;
  company: string;
  status: "ok" | "error";
  /**
   * "empty": the provider answered with no postings and the board had some before (previous jobs
   * kept). A board that was already empty, or a new one, is status "ok" with zero postings.
   */
  errorCode?: "empty";
  checkedAt: string;
  lastSuccessAt: string | null;
  error?: string;
};
export type JobResults = ReturnType<typeof queryJobs> & {
  sources?: SourceState[];
};

/** A source's last successful collection older than this is not "current". */
export const JOB_FRESHNESS_MS = 48 * 60 * 60 * 1000;
export type SourceFreshness = {
  state: "ok" | "stale" | "error" | "unobserved";
  lastSuccessAt: string | null;
  empty: boolean;
};
/** A job's source and a source state share this key ("provider:board"). */
export const sourceOf = (job: { source: Provider; sourceBoard: string }) =>
  `${job.source}:${job.sourceBoard}`;
export const keyOf = (state: SourceState) => `${state.provider ?? "greenhouse"}:${state.board}`;

/** Freshness of the source a job came from; jobs list, detail and company pages share it. */
export function jobFreshness(
  job: { source: Provider; sourceBoard: string },
  sources: SourceState[] | undefined,
  now = new Date(),
): SourceFreshness {
  const state = sources?.find((s) => keyOf(s) === sourceOf(job));
  if (!state) return { state: "unobserved", lastSuccessAt: null, empty: false };
  const last = state.lastSuccessAt;
  const stale = !last || now.getTime() - Date.parse(last) > JOB_FRESHNESS_MS;
  return {
    state: state.status === "error" ? "error" : stale ? "stale" : "ok",
    lastSuccessAt: last,
    empty: state.errorCode === "empty",
  };
}

/** Newest successful collection across all sources; stale when even that is old. */
export function boardFreshness(sources: SourceState[] | undefined, now = new Date()) {
  const newest = (sources ?? [])
    .map((s) => s.lastSuccessAt)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1) ?? null;
  return {
    newestSuccessAt: newest,
    stale: !newest || now.getTime() - Date.parse(newest) > JOB_FRESHNESS_MS,
  };
}

export const kstDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
