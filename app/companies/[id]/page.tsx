import { AnalyticsPage } from "@/components/analytics";
import { companyListing } from "@/lib/company-listing";
import { searchRobots } from "@/lib/search-indexing";
import { companySearchEntry } from "@/lib/company-search-entry";
import { brand } from "@/lib/brand";
import { RestorableDetails } from "@/components/restorable-details";
import { SectionTabs } from "@/components/section-tabs";
import { newestFirst, companyResearchTimeline } from "@/lib/research-order";
import { shareMetadata } from "@/lib/share-metadata";
import { TalentSummary, ExperienceDistribution } from "@/components/talent-summary";
import { readPreferences } from "@/lib/preference-store";
import { withPreferredRole } from "@/lib/preferences";
import { CompanyMark } from "@/components/company-mark";
import { CompanyOverview } from "@/components/company-overview";
import { CompanyFinancials } from "@/components/company-financials";
import { financialPresentation, industryLabel } from "@/lib/company-fact-presentation";
import { CompanyQuestions } from "@/components/CompanyQuestions";
import { questionView } from "@/lib/question-view";
import { questionPresentation } from "@/lib/question-presentation";
import Link from "@/components/navigation-link";
import { companyReadingGroups, readingItems } from "@/lib/reading";
import { ReadingCard } from "@/components/reading-view";
import { companies } from "@/lib/companies";
import { queryJobs, roleLabels, type SearchParams } from "@/lib/jobs";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { boardOtherJobs, joinCompanyJobs, onboardingIdentityOnly, type CompanyResearch, type ResearchFact } from "@/lib/research";
import { isSharedBoard } from "@/lib/posting-company";
import { headcountTimeline } from "@/lib/headcount-timeline";
import { HeadcountTimelineBlock, pensionWorkplaceName } from "@/components/headcount-timeline";
import { CompanyRelationsBlock, companySubsidiaries, withoutSuppressedFacts } from "@/components/company-relations";
import { publishedRelations } from "@/lib/published-data";
import { readRenderResearch } from "@/lib/render-data";
import { readRenderSnapshot } from "@/lib/render-data";
import { RelDate } from "@/components/rel-date";
import { FactTimeMeta } from "@/components/fact-time";
import { resolveFactTimes } from "@/lib/time-axis";
import { publicationLabel, companyBusinessIntro } from "@/lib/company-overview";
import { roleCounts, topRoles } from "@/lib/company-stats";
import { companyTrend, HiringTrendNote } from "@/components/hiring-trend";
import { HEADCOUNT_SCOPE, openedSources } from "@/lib/research-labels";
import { dotDates } from "@/lib/relative-date";
import { companyListReturn } from "@/lib/company-return";
import {
  Citations,
  HiringStatus,
  ResearchUnavailable,
  ResearchJobs,
} from "@/components/research-view";
/** A fact's heading in the fact list, also the accessible name of a link to it. */
function factTitle(company: CompanyResearch, f: ResearchFact): { title: string; subject: string | undefined } {
  const subject = Object.entries({
    "global-team": "글로벌 조직 규모",
    listed: "상장 현황과 이력",
    "listing-context": "상장 이력",
    "legal-name": "법인과 사업 범위",
    "quarter-results": "최근 분기 실적",
    "crm-adoption": "제품 도입 현황",
    "ai-expansion": "새로 확장하는 사업",
  }).find(([suffix]) => f.id === `${company.id}-${suffix}`)?.[1];
  // Stored sentences (DART ones are bound to receipt hashes) keep ISO dates; only the display is dotted.
  const title = f.kind === "funding"
    ? `${(f.amountKrw! / 100000000).toLocaleString("ko-KR")}억원 · ${f.round}`
    : f.id === `${company.id}-founded`
      ? `설립: ${f.text}`
      : f.id === `${company.id}-domain`
        ? (industryLabel(f.text) ? `주요 산업: ${f.text}` : "회사가 하는 일")
        : subject ?? dotDates(f.text);
  return { title, subject: subject ?? (title === "회사가 하는 일" ? title : undefined) };
}
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const identity = companies.find((c) => c.id === id);
  const research = await readRenderResearch();
  const eligible = research.status === "ok" && companyListing(research.pack).eligibleIds.has(id);
  const entry = identity ? companySearchEntry(identity,
    research.status === "ok" ? readingItems(research.pack) : [],
    research.status === "ok" ? research.pendingGuideIds : []) : null;
  const title = entry?.title ?? "기업을 찾을 수 없어요";
  return {
    title,
    ...shareMetadata(title, entry?.description, `/companies/${encodeURIComponent(id)}`),
    robots: searchRobots(eligible),
  };
}
export default async function CompanyPage({ params, searchParams }: Props) {
  await connection();
  const { id } = await params;
  const identity = companies.find((c) => c.id === id);
  if (!identity) notFound();
  const [research, snapshot] = await Promise.all([
    readRenderResearch(),
    readRenderSnapshot().catch(() => null),
  ]);
  // An onboarding seed holds only identity evidence (lib/research.ts onboardingIdentityOnly): the page treats it
  // like a company nobody has researched, 미조사, not as research with nothing found.
  const company =
    research.status === "ok"
      ? research.pack.companies.find((c) => c.id === id && !onboardingIdentityOnly(c))
      : undefined;
  const hiring = joinCompanyJobs(identity, snapshot);
  const questions = company && research.status === "ok"
    ? questionView(research.rawPack, id, { jobs: hiring.jobs, relations: research.relationsInput }) : null;
  const hasQuestions = questions && research.status === "ok" && questionPresentation(questions, research.pack, hiring.jobs).hasContent;
  const boardOthers = hiring.status === "unavailable" ? [] : boardOtherJobs(identity, snapshot);
  const trend = companyTrend(snapshot?.trend, identity.sourceKeys);
  const preferences = await readPreferences();
  const query = await searchParams;
  const roleParam = withPreferredRole(query, preferences).role;
  // The list's search and filters come back through a validated `from` (lib/company-return.ts).
  const listReturn = companyListReturn(query.from);
  // 미조사, not 근거 부족: a company nobody has researched yet says so, and without
  // a job source it has no hiring sections or tabs to promise.
  const unresearched = research.status === "ok" && !company;
  const hasJobSource = identity.sourceKeys.length > 0;
  const showHiring = hasJobSource || !unresearched;
  const role =
    typeof roleParam === "string" && Object.hasOwn(roleLabels, roleParam)
      ? roleParam
      : "";
  const matching = queryJobs(hiring.jobs, { role });
  const allReadings = research.status === "ok" ? readingItems(research.pack) : [];
  const { culture: cultureReading, others: otherReadings } = companyReadingGroups(allReadings, id);
  const searchEntry = companySearchEntry(identity, allReadings, research.status === "ok" ? research.pendingGuideIds : []);
  // Relations never break the page: an unreadable or invalid file only hides the block.
  const rawCompany = research.status === "ok" ? research.rawPack.companies.find(c => c.id === id) : undefined;
  const relations = company && research.status === "ok" ? publishedRelations(research) : null;
  const subsidiaries = rawCompany ? companySubsidiaries(rawCompany, relations) : null;
  // Facts a `claim` correction retracted leave the fact list and the timeline.
  const shown = company && subsidiaries ? withoutSuppressedFacts(company, subsidiaries) : company;
  const businessIntro = companyBusinessIntro(shown);
  // Times resolve on the whole company, retracted facts included; visibility only decides what is drawn and linked.
  const times = rawCompany ? resolveFactTimes(rawCompany) : undefined;
  const timeline = shown ? headcountTimeline(shown, undefined, times) : null;
  const entries = company ? companyResearchTimeline(shown ?? company, times) : [];
  // The facts the list draws, in list order: a successor link points only at one of these.
  const rendered = new Map(company ? entries.flatMap(item => item.kind === "fact" && !subsidiaries?.omittedFactIds.has(item.value.id)
    ? [[item.value.id, factTitle(company, item.value).title] as const] : []) : []);
  const legalFact = company?.facts.find(f => f.id === `${id}-legal-name`);
  const verifiedLegal = legalFact && legalFact.evidenceIds.length > 0 &&
    openedSources(company, legalFact.evidenceIds);
  return (
    <article className="research-page research-detail company-hub">
      <AnalyticsPage page={{ page_type: "company", content_id: identity.id, company_id: identity.id }} />
      <Link className="back-link" href={listReturn} data-restore-scroll="">
        ← 기업 목록
      </Link>
      <header className="research-heading">
        <CompanyMark companyId={identity.id} name={identity.name} color={identity.color} className="company-monogram large" />
        <div>
          <p className="eyebrow">COMPANY RESEARCH</p>
          <h1>{identity.name}</h1>
          <p>
            {identity.legalName ? `${identity.legalName} · ${identity.brand}` : verifiedLegal ? legalFact.text : identity.brand}
          </p>
          {searchEntry.introduction && <p className="company-entry-intro">{searchEntry.introduction}</p>}
        </div>
      </header>
      {!unresearched && <CompanyOverview company={shown} factIds={rendered} businessMeta={businessIntro ? <FactTimeMeta fact={businessIntro.fact} time={times?.get(businessIntro.fact.id)} rendered={rendered} /> : undefined}
        businessSources={businessIntro && shown ? <Citations company={shown} ids={businessIntro.fact.evidenceIds} /> : undefined} />}
      {/* Below the wide layout the job list sits after the talent summary, so its
          size and largest roles are named up front. */}
      {hiring.jobs.length > 0 && (
        <p className="company-jobs-jump">
          <a href="#company-jobs">채용 공고 {hiring.jobs.length}건</a>
          <span>{topRoles(hiring.jobs, 3).map((r) => `${r.label} ${r.count}`).join(" · ")}{roleCounts(hiring.jobs).length > 3 && ` 외 ${roleCounts(hiring.jobs).length - 3}개 직군`}</span>
        </p>
      )}
      {showHiring && <SectionTabs label="기업 내용 바로가기">
        <a href="#talent-summary">{cultureReading ? "팀 이야기" : "모집 조건"}</a>
        <a href="#company-jobs">채용 공고</a>
        {hasQuestions && <a href="#company-questions">회사 알아보기</a>}
        {otherReadings.length > 0 && <a href="#guides">회사 이야기</a>}
        {company && <a href="#company-facts">회사 현황</a>}
        {company && <a href="#evidence">전체 출처</a>}
      </SectionTabs>}
      {questions && research.status === "ok" && <CompanyQuestions
        view={questions}
        pack={research.pack} jobs={hiring.jobs} />}
      {showHiring && <TalentSummary pack={research.status === "ok" ? research.pack : undefined} companyId={id} hiring={hiring} preferences={preferences} role={role} />}
      {!company &&
        (research.status !== "ok" ? (
          <ResearchUnavailable href={`/companies/${id}`} />
        ) : (
          <section className="research-section">
            <h2>아직 조사하지 않은 회사예요</h2>
            {hasJobSource ? (
              <p>
                현재 규모·투자·연봉·최근 이슈는 아직 조사하지 않았어요. 아래 공식
                채용 페이지와 저장된 공고부터 확인할 수 있어요.
              </p>
            ) : (
              <>
                <p>설립일·사업·규모·투자 같은 회사 자료를 아직 조사하지 않았어요. 연결된 채용 페이지도 아직 없어요.</p>
                {identity.homepage && <a className="research-external" href={identity.homepage}>회사 홈페이지 보기 ↗</a>}
              </>
            )}
          </section>
        ))}
      {showHiring && <RestorableDetails className="company-dossier company-jobs-rail" open>
        <summary>
          서울·판교 채용 공고{" "}
          <span>
            {hiring.status === "ok"
              ? "공식 채용 페이지에서 확인한 공고"
              : hiring.jobs.length
                ? `이전에 확인한 공고 ${hiring.jobs.length}건 · 모집 여부 미확인`
                : "저장 공고 없음 · 모집 여부 미확인"}
          </span>
        </summary>
        <section className="research-section" id="company-jobs">
          <h2 className="visually-hidden">서울·판교 채용 공고</h2>
          {cultureReading && <ExperienceDistribution hiring={hiring} preferences={preferences} role={role} />}
          <div className="hiring-line">
          {identity.sourceKeys.length > 0 ? <HiringStatus hiring={hiring} /> : <p>회사 자료를 먼저 소개하고 있어요. 채용 공고가 아직 연결되지 않았어요.</p>}
          {/* Only status "ok", which no stale, failing or unobserved source reaches (joinCompanyJobs):
              a late source reads in the status line's '마지막 공고 확인' instead. */}
          {hiring.status === "ok" && <p className="research-caption">
            최근 확인{" "}
            {hiring.sources.map((s, i) => (
              <span key={s.key}>
                {i > 0 ? " · " : ""}
                {s.lastSuccessAt ? <RelDate value={s.lastSuccessAt} /> : "미확인"}
              </span>
            ))}
          </p>}
          </div>
          {hiring.status !== "ok" && hiring.jobs.length > 0 && (
            <p>
              아래는 마지막으로 저장한 공고예요. 현재 모집 여부는 공식
              페이지에서 확인하세요.
            </p>
          )}
          {role && <p className="active-role-filter"><span>{roleLabels[role as keyof typeof roleLabels]} 공고를 보고 있어요.</span><a href={`/companies/${id}?${new URLSearchParams({ role: "", ...(listReturn !== "/companies" ? { from: listReturn } : {}) })}#company-jobs`}>직무 제한 해제 ×</a></p>}
          {role && <p>저장된 공고 중 조건에 맞는 공고 {matching.total}건</p>}
          {identity.sourceKeys.length > 0 && matching.total === 0 && (
            <p className="research-note">
              저장된 자료에서 찾지 못했어요. 현재 미채용이나 마감을 뜻하지
              않아요. 공식 페이지에서 모집 상태를 확인하세요.
            </p>
          )}
          <ResearchJobs
            byRole={!role}
            from={`/companies/${id}?role=${role}#company-jobs`}
            jobs={hiring.jobs.filter((j) => queryJobs([j], { role }).total > 0)}
          />
          {boardOthers.length > 0 && (
            <details className="board-others">
              <summary>
                {boardOthers.every((group) => group.confirmed) ? "같은 채용 보드의 다른 회사 공고" : "같은 채용 보드에서 이 회사 공고로 세지 않은 공고"}{" "}
                {boardOthers.reduce((sum, group) => sum + group.jobs.length, 0)}건
              </summary>
              {boardOthers.some((group) => group.confirmed) && (
                <p className="research-caption">
                  공고 제목이나 회사 소개가 다른 회사({boardOthers.filter((group) => group.confirmed).map((group) => group.company).join(", ")})의
                  공고라고 밝혀 이 회사 공고 수와 경력 분포에 넣지 않았어요.
                </p>
              )}
              {boardOthers.some((group) => !group.confirmed) && (
                <p className="research-caption">
                  &lsquo;회사 확인 전&rsquo; 공고는 제목과 회사 소개로 어느 회사 공고인지 정할 수 없어(그룹 채용 포함) 이 회사 공고로
                  세지 않았어요.
                </p>
              )}
              {boardOthers.map((group) => (
                <div key={group.company}>
                  <h3>
                    {group.company} <span className="tabular">{group.jobs.length}건</span>
                  </h3>
                  <ResearchJobs from={`/companies/${id}?role=${role}#company-jobs`} jobs={group.jobs} />
                </div>
              ))}
            </details>
          )}
          {identity.careerUrl ? <a className="research-external" href={identity.careerUrl}>공식 채용 페이지 보기 ↗</a>
            : identity.homepage ? <a className="research-external" href={identity.homepage}>회사 홈페이지 보기 ↗</a> : null}
          {company?.gaps.some(g => g.field === "salary") && <p className="research-caption">직무별 연봉 범위는 확보한 자료에 없어요. 회사 평균 급여로 대신 판단하지 않아요.</p>}
          {trend && <HiringTrendNote trend={trend} shared={identity.sourceKeys.some(isSharedBoard)} />}
        </section>
      </RestorableDetails>}
      {otherReadings.length > 0 && research.status === "ok" && (
        <section className="company-guide-section" id="guides">
          <div className="company-section-heading">
            <h2>어떤 점이 궁금하세요?</h2>
            <Link href="/discover">다른 회사도 발견하기</Link>
          </div>
          {(() => {
            // One question per topic up front; the rest of the same topics wait
            // behind a disclosure so repeated answers don't stack up.
            const guides = otherReadings;
            const seen = new Set<string>();
            const first = guides.filter((r) => !seen.has(r.topic) && seen.add(r.topic));
            const rest = guides.filter((r) => !first.includes(r));
            const card = (r: (typeof guides)[number]) => (
              <div key={r.id} id={`guide-${r.id}`}>
                <ReadingCard reading={r} from={`/companies/${id}?role=${role}#guide-${r.id}`} compact withinCompany />
              </div>
            );
            return (
              <>
                <div className="company-guide-grid">{first.map(card)}</div>
                {rest.length > 0 && (
                  <RestorableDetails className="company-guide-more">
                    <summary>같은 주제의 질문 {rest.length}개 더 보기</summary>
                    <div className="company-guide-grid">{rest.map(card)}</div>
                  </RestorableDetails>
                )}
              </>
            );
          })()}
        </section>
      )}
      {company && (
        <>
          <RestorableDetails className="company-dossier" open>
            <summary>
              회사 현황 <span>사업 · 규모 · 투자</span>
            </summary>
            <section className="research-section" id="company-facts">
              <h2>규모와 사업의 변화</h2>
              <p className="research-caption">
                자료에 명시된 시점과 범위로 정리했어요. 날짜가 있는 내용부터 보여드려요.
              </p>
              {timeline && <HeadcountTimelineBlock timeline={timeline} workplace={pensionWorkplaceName(id)} links={subsidiaries?.factLinks} />}
              {subsidiaries && <CompanyRelationsBlock company={company} filings={subsidiaries.filings} />}
              {entries.map(item => {
                if (item.kind === "headcount") {
                  const o = item.value;
                  // Monthly pension values live in the chart and its table.
                  if (timeline?.chartedIds.has(o.id)) return null;
                  return (
                    <div className="research-fact" key={o.id}>
                      <h3>
                        {o.approximate ? "약 " : ""}
                        {o.value.toLocaleString("ko-KR")}명{" "}
                        <span>
                          ·{" "}
                          {o.measurement === "pension-subscribers"
                            ? "국민연금 가입자 수"
                            : "당시 보고 인원"}
                        </span>
                      </h3>
                      <p>
                        {o.referenceBasis === "publication"
                          ? "인원을 집계한 날짜는 확인하지 못했어요. "
                          : "해당 날짜를 기준으로 한 인원이에요. "}
                        현재 인원과는 다를 수 있어요.
                        {o.measurement === "pension-subscribers" &&
                          " 연금 가입자 수는 전체 직원 수나 입퇴사자 수와 다를 수 있어요."}
                      </p>
                      <div className="fact-meta">
                        <span>
                          {o.referenceBasis === "publication" ? publicationLabel(company, o.evidenceIds) : "집계 기준"}{" "}
                          <RelDate value={o.referenceOn} /> ·{" "}
                          {HEADCOUNT_SCOPE[o.scope]} 기준
                        </span>
                        {!openedSources(company, o.evidenceIds) && <span>검색 결과에서만 확인</span>}
                        <Citations company={company} ids={o.evidenceIds} />
                      </div>
                    </div>
                  );
                }
                const f = item.value;
                // The exact fact already owns the intro and its original anchor/metadata above.
                if (businessIntro?.fact.id === f.id) return null;
                // A filing shown in 종속기업 지분 변화 is not repeated here; it returns whenever that block is hidden.
                if (subsidiaries?.omittedFactIds.has(f.id)) return null;
                const financial = financialPresentation(company.id, f, company.evidence.filter(source => f.evidenceIds.includes(source.id)));
                if (financial) return <div key={f.id} id={`fact-${f.id}`} className="research-fact"><CompanyFinancials view={financial} /></div>;
                const { title, subject } = factTitle(company, f);
                return (
                  <div key={f.id} id={`fact-${f.id}`} className="research-fact">
                    <h3>{title}</h3>
                    {(f.kind === "funding" || subject) && <p>{dotDates(f.text)}</p>}
                    <div className="fact-meta">
                      <FactTimeMeta fact={f} time={times?.get(f.id)} rendered={rendered} />
                      {!openedSources(company, f.evidenceIds) && <span>검색 결과에서만 확인</span>}
                      <Citations company={company} ids={f.evidenceIds} />
                    </div>
                  </div>
                );
              })}
              {(shown ?? company).facts.length === 0 && company.headcount.length === 0 && (
                <p>규모와 사업 현황을 확인할 자료가 아직 없어요.</p>
              )}
            </section>
          </RestorableDetails>
        </>
      )}
      {company && (
        <RestorableDetails className="company-dossier">
          <summary>
            참고 자료{" "}
            <span>원문 {company.evidence.length}개 · 게시일과 확인일</span>
          </summary>
          <section className="research-section" id="evidence">
            <h2>참고 자료</h2>
            <p className="research-caption">
              최근에 나온 자료부터 모았어요. 게시일을 확인하지 못한 자료는 뒤에 있어요.
              검색 결과에서만 확인한 자료는 따로 표시했어요.
            </p>
            <ol className="research-evidence">
              {newestFirst(company.evidence, e => e.publishedOn).map((e) => (
                <li key={e.id} id={`source-${e.id}`}>
                  <p className="research-caption">
                    {
                      {
                        official: "회사 공식 자료",
                        press: "언론 보도",
                        repost: "재게시 자료",
                      }[e.kind]
                    }{" "}
                    · {e.publisher}
                    {e.access === "search-index" ? " · 검색 결과에서만 확인" : ""}
                  </p>
                  <h3>
                    <a href={e.url}>{e.title} ↗</a>
                  </h3>
                  <p>{e.excerpt}</p>
                  <p className="research-caption">
                    {e.publishedOn ? <>게시 <RelDate value={e.publishedOn} /></> : "게시일 미확인"} · 확인{" "}
                    <RelDate value={e.checkedOn} />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </RestorableDetails>
      )}
      <p className="company-request">
        이 회사에 대해 더 알고 싶은 점이 있나요?{" "}
        <a href={`mailto:contact@fervorlab.com?subject=${encodeURIComponent(`[${brand.name}] ${identity.name} 조사 요청`)}`}>
          조사 요청 보내기
        </a>
      </p>
      <div className="company-exit">
        <p>다른 회사에서는 어떻게 일할까요?</p>
        <Link href="/discover?topic=work">하는 일로 이어서 살펴보기</Link>
      </div>
    </article>
  );
}
