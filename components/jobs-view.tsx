import Link from "@/components/navigation-link";
import { AnalyticsPage } from "./analytics";
import { CompanyMark } from "./company-mark";
import { BackToTop } from "./back-to-top";
import {
  roleLabels,
  locationLabels,
  boardFreshness,
  jobFreshness,
  shortLocation,
  type Filters,
  type JobResults,
} from "@/lib/jobs";
import { experienceBrief } from "@/lib/experience-brief";
import { RelDate } from "./rel-date";
import { Bookmark } from "./bookmark";
import { agedDate } from "@/lib/relative-date";
import { CompanySizeFilter } from "./company-size-filter";
import { CompanyChips } from "./company-chips";
import type { CompanyBasics } from "@/lib/company-basics";
import { sizesLabel } from "@/lib/company-size-bands";
import { dayLabel } from "@/lib/new-arrivals";
import { ArrivalBanner, type ArrivalBannerData } from "./arrival-banner";

export function queryHref(base: string, filters: Filters, page = 1) {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  query.set("role", filters.role);
  if (filters.location) query.set("location", filters.location);
  if (filters.new) query.set("new", filters.new);
  // Like role, size is always explicit in links so a saved preference does not come back after it was lifted.
  if (filters.size.length) for (const size of filters.size) query.append("size", size);
  else query.set("size", "");
  if (page > 1) query.set("page", String(page));
  return `${base}${query.size ? `?${query}` : ""}`;
}

/**
 * A card's place: multi-office postings ("Mountain View, USA; Seattle, USA;
 * Seoul, South Korea") lead with the Seoul/Pangyo office this list is for.
 */
export function cardLocation(label: string, area?: keyof typeof locationLabels | string) {
  const offices = label.split(/\s*;\s*/).filter(Boolean);
  const local = offices.find((o) => /seoul|서울|pangyo|판교|성남|korea|한국/i.test(o)) ?? offices[0] ?? label;
  // A bare street address has no short area name; the posting's area (서울/판교) reads better than a cut address.
  const shortened = shortLocation(local);
  const short = shortened.endsWith("…") && area && area in locationLabels ? locationLabels[area as keyof typeof locationLabels] : shortened;
  return offices.length > 1 ? `${short} 외 ${offices.length - 1}곳` : short;
}

/** Tags shown on a card; the rest stay on the posting. */
const CARD_TAGS = 4;

export function JobsView({
  data,
  filters,
  mode,
  renderedAt,
  error = "",
  retry,
  basics = {},
  arrivals = null,
  requestedRole = filters.role,
}: {
  /** Verified company basics by company id, shown as chips on cards. */
  basics?: Record<string, CompanyBasics>;
  /** New companies and postings, each with its own reference day (SSR only). */
  arrivals?: ArrivalBannerData | null;
  /** The role the URL asked for, before a saved preference fills `filters.role`. */
  requestedRole?: string;
  data?: JobResults;
  filters: Filters;
  mode: "ssr" | "csr";
  renderedAt?: string;
  error?: string;
  retry?: () => void;
}) {
  const base = mode === "ssr" ? "/jobs" : "/csr";
  // Only judged when source states are known (SSR); CSR data has none.
  const board = data?.sources ? boardFreshness(data.sources) : null;
  const narrowed = !!(filters.q || filters.role || filters.location || filters.size.length || filters.new);
  return (
    <>
      {mode === "ssr" && <AnalyticsPage page={{ page_type: "jobs" }} resultCount={data && !error ? data.total : undefined} />}
      <section className="page-heading jobs-heading" data-rendered-at={renderedAt}>
        <h1>서울·판교 채용 공고</h1>
        <p className="jobs-edition">
          <span className={board?.stale ? "live-dot is-stale" : "live-dot"} />
          {data
            ? `${data.companies.toLocaleString("ko-KR")}개 회사 · ${data.available.toLocaleString("ko-KR")}개 공고`
            : "새로운 가능성을 찾는 중"}
          {board?.newestSuccessAt && (
            <>
              {" · 최근 확인 "}
              <RelDate value={board.newestSuccessAt} />
            </>
          )}
        </p>
      </section>
      {/* A list narrowed by the URL leads with its results; one day's new postings say so in the filter
          line below. A saved role preference alone is the reader's usual list and keeps the banner. */}
      {!filters.new && !filters.q && !requestedRole && <ArrivalBanner data={arrivals} />}
      <div className="board-layout">
        <aside className="filter-panel">
          <div className="filter-heading">
            <h2>어떤 일을 찾으세요?</h2>
            {narrowed && <Link href={`${base}?role=&size=`}>검색 초기화</Link>}
          </div>
          <form
            action={base}
            method="get"
            key={`${filters.q}:${filters.role}:${filters.location}:${filters.size.join(",")}:${filters.new}`}
          >
            <label htmlFor="q">검색어</label>
            <div className="search-input">
              <span aria-hidden="true">⌕</span>
              <input
                id="q"
                name="q"
                defaultValue={filters.q}
                placeholder="회사·기술·직무"
                maxLength={100}
              />
            </div>
            <input id="role" type="hidden" name="role" value={filters.role} />
            {filters.size.length ? filters.size.map((size) => <input key={size} type="hidden" name="size" value={size} />) : <input type="hidden" name="size" value="" />}
            {filters.new && <input type="hidden" name="new" value={filters.new} />}
            <label htmlFor="location">근무 지역</label>
            <select
              id="location"
              name="location"
              defaultValue={filters.location}
            >
              <option value="">서울·판교 전체</option>
              {Object.entries(locationLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button className="button primary filter-submit" type="submit">
              공고 찾기
            </button>
          </form>
          {mode === "ssr" && <CompanySizeFilter sizes={filters.size} href={size => queryHref(base, { ...filters, size })} />}
        </aside>
        <section className="results" aria-label="채용 공고">
          {/* Unfiltered, the count repeats the page heading; phones hide this row visually. */}
          <div className={narrowed ? "results-heading" : "results-heading is-unfiltered"}>
            <h2>
              {narrowed
                ? "검색 결과"
                : "전체 채용 공고"}{" "}
              <span>{data?.total.toLocaleString("ko-KR") ?? "—"}</span>
            </h2>
            <span className="result-caption">
              공식 공고 · 회사별 번갈아 보기
            </span>
          </div>
          {board?.stale && (
            <p className="freshness-banner" role="status">
              공고 자료가{" "}
              {board.newestSuccessAt ? `${agedDate(board.newestSuccessAt)} 이후 ` : ""}
              갱신되지 않았어요. 현재 모집 여부는 각 공고의 원문에서 확인하세요.
            </p>
          )}
          {filters.new && <p className="active-role-filter"><span>{`${dayLabel(filters.new)}에 새로 들어온 공고만 보고 있어요.`}</span><Link href={queryHref(base, { ...filters, new: "" })}>전체 보기</Link></p>}
          {filters.role && <p className="active-role-filter"><span>{roleLabels[filters.role as keyof typeof roleLabels]} 공고를 보고 있어요.</span><Link href={queryHref(base, { ...filters, role: "" })}>직무 제한 해제 ×</Link></p>}
          {filters.size.length > 0 && <p className="active-role-filter"><span>{sizesLabel(filters.size)} 회사의 공고를 보고 있어요 · 국민연금 가입자 기준</span><Link href={queryHref(base, { ...filters, size: [] })}>규모 제한 해제 ×</Link></p>}
          {!!data?.sizeUnknown && <p className="research-note">규모 자료가 없는 회사의 공고 {data.sizeUnknown.toLocaleString("ko-KR")}건은 빼고 보여드려요. <Link href={queryHref(base, { ...filters, size: [...filters.size, "unknown"] })}>함께 보기</Link></p>}
          {error ? (
            <div className="empty" role="alert">
              <h3>공고를 불러오지 못했어요</h3>
              <p>{error}</p>
              <button className="button primary" onClick={retry}>
                다시 시도
              </button>
            </div>
          ) : !data ? (
            <div className="loading" role="status">
              <span className="spinner" />
              공고를 불러오는 중…
            </div>
          ) : data.items.length === 0 ? (
            <div className="empty">
              <span className="empty-symbol" aria-hidden="true">
                ⌕
              </span>
              <h3>조건에 맞는 공고가 없어요</h3>
              <p>
                저장된 자료에서 조건에 맞는 공고를 찾지 못했어요. 현재
                미채용이나 마감을 뜻하지 않아요.
              </p>
              {data.companyId && (
                <p>
                  <Link href={`/companies/${data.companyId}`}>
                    회사 정보와 공식 채용 경로 확인
                  </Link>
                </p>
              )}
              <Link className="button primary" href={`${base}?role=`}>
                전체 공고 보기
              </Link>
            </div>
          ) : (
            <div className="job-list">
              {data.items.map((job) => (
                <article className="job-card" key={job.id} data-job-id={job.id}>
                  <CompanyMark companyId={job.companyId} name={job.company} color={job.color} className="company-monogram" />
                  <div className="job-card-main">
                    <div className="job-card-company">
                      <div className="company-name">
                        {job.companyId ? (
                          <Link href={`/companies/${job.companyId}`}>
                            {job.company}
                          </Link>
                        ) : (
                          job.company
                        )}
                        <span className="company-dot">·</span>
                        <span>공식 채용 페이지</span>
                      </div>
                      {job.companyId && <CompanyChips basics={basics[job.companyId]} keys={["domain", "founded"]} />}
                    </div>
                    <h3>
                      <Link
                        data-analytics="content_select" data-destination-type="job" data-destination-id={job.id} data-destination-company-id={job.companyId} data-placement="card"
                        href={`/jobs/${job.id}?${new URLSearchParams({ from: queryHref(base, filters, data.page) })}`}
                      >
                        {job.title}
                      </Link>
                    </h3>
                    {(() => {
                      const fresh = data.sources ? jobFreshness(job, data.sources) : null;
                      return fresh && fresh.state !== "ok" ? (
                        <p className="job-freshness">
                          모집 여부 미확인
                          {fresh.lastSuccessAt ? ` · 마지막 공고 확인 ${agedDate(fresh.lastSuccessAt)}` : ""}
                        </p>
                      ) : null;
                    })()}
                    {/* The decision line: what the posting asks, which role, where. Separators are CSS-drawn and clipped at a line start. */}
                    <p className="job-decision">
                      <span className="decision-list">
                        {job.insights && <span className="decision-unit decision-experience">{experienceBrief(job.insights)}</span>}
                        <span className="decision-unit">{job.roleLabel}</span>
                        <span className="decision-unit" title={job.locationLabel}>{cardLocation(job.locationLabel, job.location)}</span>
                        {job.salary && <span className="decision-unit">{job.salary}</span>}
                      </span>
                    </p>
                    {job.insights?.scope === "combined" && (
                      <p className="role-scope">
                        {job.insights.roles.includes("frontend")
                          ? "FE 포함 · "
                          : ""}
                        통합 모집 · 역할 배정 확인 필요
                      </p>
                    )}
                    {job.tags.length > 0 && (
                      <div className="tags job-card-tags">
                        {job.tags.slice(0, CARD_TAGS).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                        {job.tags.length > CARD_TAGS && <span className="tags-more">+{job.tags.length - CARD_TAGS}</span>}
                      </div>
                    )}
                  </div>
                  <Bookmark id={job.id} title={`${job.company} ${job.title}`} />
                </article>
              ))}
            </div>
          )}
          {data && data.totalPages > 1 && (
            <nav className="pagination" aria-label="공고 페이지">
              {data.page > 1 && (
                <Link
                  href={queryHref(base, filters, data.page - 1)}
                  aria-label="이전 페이지"
                >
                  ←
                </Link>
              )}
              {paginationPages(data.page, data.totalPages).map((page, index) =>
                page === null ? (
                  <span className="page-gap" key={`gap-${index}`}>
                    …
                  </span>
                ) : (
                  <Link
                    href={queryHref(base, filters, page)}
                    key={page}
                    aria-current={page === data.page ? "page" : undefined}
                    aria-label={`${page}페이지`}
                  >
                    {page}
                  </Link>
                ),
              )}
              {data.page < data.totalPages && (
                <Link
                  href={queryHref(base, filters, data.page + 1)}
                  aria-label="다음 페이지"
                >
                  →
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>

      <BackToTop />
    </>
  );
}

function paginationPages(current: number, total: number): Array<number | null> {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const result: Array<number | null> = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) result.push(null);
    result.push(page);
  });
  return result;
}
