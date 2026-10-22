import Link from "@/components/navigation-link";
import { RestorableDetails } from "@/components/restorable-details";
import { AnalyticsPage } from "@/components/analytics";
import { shareMetadata } from "@/lib/share-metadata";
import { searchRobots, unfilteredSearchPage } from "@/lib/search-indexing";
import { companyListing } from "@/lib/company-listing";
import { CompanyMark } from "@/components/company-mark";
import { companies, companiesAddedOn, findCompany, findCompanyByProduct, normalizeName } from "@/lib/companies";
import { dayLabel, parseNewDay } from "@/lib/new-arrivals";
import type { SearchParams } from "@/lib/jobs";
import { connection } from "next/server";
import { boardOtherJobs, joinCompanyJobs } from "@/lib/research";
import { readRenderResearch } from "@/lib/render-data";
import { readRenderSnapshot } from "@/lib/render-data";
import { ResearchUnavailable } from "@/components/research-view";
import { DirectoryOpenings } from "@/components/directory-openings";
import { CompanySizeFilter } from "@/components/company-size-filter";
import { CompanyChips } from "@/components/company-chips";
import { companyBasics } from "@/lib/company-basics";
import { businessLine } from "@/lib/company-stats";
import { readingItems } from "@/lib/reading";
import { readPreferences } from "@/lib/preference-store";
import { withPreferredSize } from "@/lib/preferences";
import { parseSizes, sizesLabel, type SizeFilter } from "@/lib/company-size-bands";
import { sizeBand, workplacePension } from "@/lib/company-size";
import { BackToTop } from "@/components/back-to-top";
import { absoluteDate } from "@/lib/relative-date";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return { title: "지원할 회사 찾기 · 기업정보", ...shareMetadata("지원할 회사 찾기 · 기업정보", "회사의 사업과 규모, 팀 이야기와 서울·판교 채용 공고를 함께 살펴보고 지원할 회사를 찾아보세요.", "/companies"), robots: searchRobots(unfilteredSearchPage(await searchParams)) };
}
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const preferences = await readPreferences();
  const params = withPreferredSize(await searchParams, preferences);
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const sizes = parseSizes(params.size);
  // `new=YYYY-MM-DD`: only data-source companies registered that day (code companies have no date).
  const newDay = parseNewDay(params.new);
  const exact = findCompany(q) ?? findCompanyByProduct(q);
  const [research, snapshot] = await Promise.all([
    readRenderResearch(),
    readRenderSnapshot().catch(() => null),
  ]);
  const eligible = research.status === "ok" ? companyListing(research.pack).eligibleIds : new Set<string>();
  const searched = companies.filter(
    (c) =>
      eligible.has(c.id) &&
      (!newDay || companiesAddedOn.get(c.id) === newDay) &&
      (!q ||
        (exact
          ? c.id === exact.id
          : [c.name, c.legalName, c.brand, ...(c.aliases ?? []), ...(c.products ?? [])].some((n) =>
              n?.toLowerCase().includes(q.toLowerCase()),
            ))),
  );
  const readings = research.status === "ok" ? readingItems(research.pack) : [];
  const researchFor = (id: string) => research.status === "ok" ? research.pack.companies.find((c) => c.id === id) : undefined;
  const bandOf = (id: string): SizeFilter => sizeBand(researchFor(id)) ?? "unknown";
  const visible = sizes.length ? searched.filter((c) => sizes.includes(bandOf(c.id))) : searched;
  // A size filter leaves out companies without a count, and says how many.
  const unknown = sizes.length && !sizes.includes("unknown") ? searched.filter((c) => bandOf(c.id) === "unknown").length : 0;
  const href = (next: SizeFilter[], day = newDay) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (day) query.set("new", day);
    if (next.length) for (const size of next) query.append("size", size);
    else query.set("size", "");
    return `/companies?${query}`;
  };
  // A company page returns to this list as it is, when that differs from a bare /companies
  // (search, day, or sizes other than the saved preference).
  const listFrom = q || newDay || sizes.join() !== parseSizes(preferences.sizes).join() ? href(sizes) : "";
  const companyPage = (id: string, rest = "") => `/companies/${id}${listFrom ? `?${new URLSearchParams({ from: listFrom })}` : ""}${rest}`;
  return (
    <div className="research-page companies-index">
      <AnalyticsPage page={{ page_type: "companies" }} resultCount={research.status === "ok" ? visible.length : undefined} />
      <header className="page-heading companies-heading">
        <h1>{newDay ? "새로 만나는 회사" : "지원할 회사 찾아보기"}</h1>
        <p className="companies-count">
          {research.status === "ok" ? `${visible.length}곳 · 회사 이야기와 채용 공고를 함께 살펴보세요.` : "회사 정보를 불러오지 못했어요."}
        </p>
      </header>
      <form action="/companies" className="company-search">
        <label htmlFor="company-query" className="visually-hidden">회사 이름으로 찾기</label>
        <div>
          <input
            id="company-query"
            name="q"
            defaultValue={q}
            placeholder="법인명 또는 서비스 이름"
            maxLength={100}
          />
          {sizes.length ? sizes.map((size) => <input key={size} type="hidden" name="size" value={size} />) : <input type="hidden" name="size" value="" />}
          {newDay && <input type="hidden" name="new" value={newDay} />}
          <button className="button" type="submit">
            검색
          </button>
        </div>
      </form>
      {research.status === "ok" && <CompanySizeFilter sizes={sizes} href={href} />}
      {research.status === "ok" && newDay && <p className="active-role-filter"><span>{`${dayLabel(newDay)}에 새로 들어온 회사 ${visible.length}곳을 보고 있어요.`}</span><Link href={href(sizes, "")}>전체 보기</Link></p>}
      {research.status === "ok" && sizes.length > 0 && <p className="active-role-filter"><span>{sizesLabel(sizes)} 회사 {visible.length}곳을 보고 있어요 · 국민연금 가입자 기준</span><Link href={href([])}>규모 제한 해제 ×</Link></p>}
      {unknown > 0 && <p className="research-note">규모 자료가 없는 회사 {unknown}곳은 빼고 보여드려요. <Link href={href([...sizes, "unknown"])}>함께 보기</Link></p>}
      {research.status === "ok" && visible.length === 0 && (
        <p>
          이 조건에 맞는 회사를 찾지 못했어요.{q && " 아직 다루지 않는 회사일 수 있어요."} <Link href="/companies?size=">전체 회사 보기</Link>
        </p>
      )}
      {research.status !== "ok" && <ResearchUnavailable href="/companies" />}
      <ul className="research-list">
        {visible.map((identity) => {
          const company = researchFor(identity.id);
          const pension = workplacePension(company);
          const hiring = joinCompanyJobs(identity, snapshot);
          const stories = readings.filter((story) => story.companyId === identity.id);
          const line = businessLine(company, stories.find((story) => story.id === `${identity.id}-overview-story`)?.answer);
          const companyHref = `/companies/${identity.id}?role=`;
          const pageHref = listFrom ? `${companyHref}&${new URLSearchParams({ from: listFrom })}` : companyHref;
          const story = stories.find((story) => story.topic === "vision" || story.topic === "culture") ?? stories[0];
          const legal = identity.legalName && normalizeName(identity.legalName) !== normalizeName(identity.name) ? identity.legalName : null;
          const basics = companyBasics(company);
          // A sentence fragment repeated in the introduction is not an industry label.
          const chipKeys = basics.domain && line?.startsWith(basics.domain) ? ["founded", "stage"] as const : ["domain", "founded", "stage"] as const;
          const otherCompanies = hiring.status === "unavailable" ? [] : boardOtherJobs(identity, snapshot);
          return (
            <li key={identity.id} className="research-row company-directory-entry">
              <CompanyMark companyId={identity.id} name={identity.name} color={identity.color} className="company-monogram" />
              <div>
                <h2>
                  <Link href={companyPage(identity.id)}>
                    {identity.name}
                  </Link>
                </h2>
                <div className="research-identity">
                  {/* An unknown legal name is noted on the company page, not repeated in the list. */}
                  {(legal || identity.brand !== identity.name) && (
                    <p className="research-legal">
                      {[legal, identity.brand !== identity.name ? identity.brand : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <CompanyChips basics={basics} keys={[...chipKeys]} />
                  {pension && <p className="research-size">국민연금 가입자 {pension.value.toLocaleString("ko-KR")}명 · {absoluteDate(pension.month)} 기준</p>}
                </div>
                {/* Only published research supplies a business description. */}
                {line && <p className="research-business">{line}</p>}
                {story && <Link className="directory-story" href={`/read/${story.id}?${new URLSearchParams({ from: companyHref })}`}>
                  <span>회사 이야기</span>
                  {story.question}
                </Link>}
                <DirectoryOpenings hiring={hiring} name={identity.name} from={`${companyHref}#company-jobs`} otherCompanies={otherCompanies} />
                <div className="directory-actions">
                  {stories.length > 0 && <Link href={pageHref}>회사 이야기 {stories.length}편</Link>}
                  {hiring.jobs.length > 0 ? <a href={`${pageHref}#company-jobs`}>{hiring.status === "ok" ? "공고 모아보기" : "이전 공고 보기"}</a> : otherCompanies.length > 0 && <a href={`${pageHref}#company-jobs`}>채용 회사별 공고 보기</a>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <RestorableDetails className="directory-method">
        <summary>공고와 회사 정보의 기준</summary>
        <p>
          공식 로고, 출처가 있는 사업 설명과 회사 이야기를 함께 살펴볼 수 있는 회사를 소개해요.
          연봉·투자·인원처럼 공개 범위가 다른 정보는 각 회사에서 확인할 수 있어요.
        </p>
        <p>
          공고 수는 저장된 서울·판교 공고를 기준으로 해요. 목록에는 그중 일부를 보여주며, 경력과 근무 조건은 각 공고에서 살펴볼 수 있어요. 새로 들어온 회사의 날짜는 Curvehop에 등록된 날이며, 공고가 올라온 날과는 달라요.
        </p>
        <p>
          인원은 같은 사업장 국민연금 가입자 수를 국민연금공단 자료 그대로 보여주고, 회사 규모로 고를 때도 이 값을 써요. 전체 직원·입퇴사자 수와 다를 수 있고, 값이 없는 회사는 ‘규모 자료 없음’으로 따로 알려드려요.
        </p>
        <p>
          회사 소개·언론 보도·재게시 자료를 구분하고, 원문과 확인 날짜를 함께
          표시해요.
        </p>
      </RestorableDetails>
      <BackToTop />
    </div>
  );
}
