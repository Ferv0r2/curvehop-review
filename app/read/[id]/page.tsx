import "./reader.css";
import { AnalyticsPage } from "@/components/analytics";
import { companyListing } from "@/lib/company-listing";
import { searchRobots } from "@/lib/search-indexing";
import { Suspense } from "react";
import { newestFirst } from "@/lib/research-order";
import { shareMetadata } from "@/lib/share-metadata";
import { readPreferences } from "@/lib/preference-store";
import { companies, sourceBoardUrl } from "@/lib/companies";
import { joinCompanyJobs } from "@/lib/research";
import { queryJobs, roleLabels } from "@/lib/jobs";
import Link from "@/components/navigation-link";
import { StoryContents } from "@/components/story-contents";
import { StoryBody } from "@/components/story-body";
import { QuestionReadingCard, ReadingArrival } from "@/components/reading-question-link";
import { questionNextReadings, questionConnectionArrival } from "@/lib/reading-journey";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { readRenderResearch, readRenderSnapshot } from "@/lib/render-data";
import {
  companyReadingGroups,
  getReading,
  readingItems,
  readingTopics,
  safeReturnPath,
} from "@/lib/reading";
import {
  CompanyMark,
  ContextLink,
  keepDates,
  readingCheckedOn,
} from "@/components/reading-view";
import { ResearchUnavailable } from "@/components/research-view";
import type { SearchParams } from "@/lib/jobs";
import { RelDate } from "@/components/rel-date";
import { questionView } from "@/lib/question-view";
import { readingScopedAnswers } from "@/lib/question-presentation";
import { ReadingRoleAnswers } from "@/components/reading-role-answers";
import { otherCompanyReadings } from "@/lib/reading-discovery";
import { publicResearchCaveat } from "@/lib/research-public-copy";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const r = await readRenderResearch();
  const reading = r.status === "ok" ? getReading(r.pack, id) : undefined;
  const title = reading?.question ?? (r.status === "ok" ? "읽을거리를 찾을 수 없어요" : "자료 확인이 필요해요");
  return { title, ...shareMetadata(title, reading?.preview, `/read/${encodeURIComponent(id)}`), robots: searchRobots(!!reading && r.status === "ok" && companyListing(r.pack).eligibleIds.has(reading.companyId)) };
}
export default async function ReadPage({ params, searchParams }: Props) {
  await connection();
  const { id } = await params;
  const { from, origin: rawOrigin, edge: rawEdge } = await searchParams;
  const research = await readRenderResearch();
  if (research.status !== "ok")
    return (
      <div className="reader-page">
        <Link className="back-link" href="/discover">
          ← 읽을거리로
        </Link>
        <ResearchUnavailable href={`/read/${encodeURIComponent(id)}`} />
      </div>
    );
  const reading = getReading(research.pack, id);
  if (!reading) notFound();
  const scopedAnswers = reading.company.questionAssessment
    ? readingScopedAnswers(questionView(research.rawPack, reading.companyId, { relations: research.relationsInput }), reading.id) : [];
  // `#guides` exists only when the company has a reading besides its culture one (lib/reading.ts).
  const companyReturn = `/companies/${reading.companyId}${companyReadingGroups(readingItems(research.pack), reading.companyId).anchor}`;
  const initialReturn = safeReturnPath(
    typeof from === "string" ? from : undefined,
    companyReturn,
    research.pack,
  );
  const candidateOrigin = safeReturnPath(
    typeof rawOrigin === "string" ? rawOrigin : undefined,
    initialReturn,
    research.pack,
  );
  // Preserve the starting company/filter separately; never nest return URLs.
  const origin = candidateOrigin.startsWith("/read/")
    ? companyReturn
    : candidateOrigin;
  const back = safeReturnPath(
    typeof from === "string" ? from : undefined,
    origin,
    research.pack,
  );
  const backHref = back.startsWith("/read/")
    ? `${back}${back.includes("?") ? "&" : "?"}${new URLSearchParams({ origin })}`
    : back;
  const eligible = companyListing(research.pack).eligibleIds;
  const options = { knowledgeReady: research.readingConnectionsReady, allowedCompanyIds: eligible };
  const next = questionNextReadings(research.pack, id, options);
  const arrival = questionConnectionArrival(research.pack, id, rawEdge, options);
  const here = `/read/${id}${arrival ? `?edge=${arrival.edge.id}` : ""}`;
  const sidebar = next.filter(item => item.edge.proposal.from.sectionId === null);
  const board = sourceBoardUrl(companies.find(c => c.id === reading.companyId)!);
  const otherStories = readingItems(research.pack).filter(item => item.companyId === reading.companyId && item.id !== id && !next.some(n => n.reading.id === item.id)).slice(0, 3);
  const otherCompanies = otherCompanyReadings(readingItems(research.pack), reading, eligible, new Set([...research.pendingGuideIds, ...next.map(n => n.reading.id)]));
  return (
    <div className={`reader-page${reading.sections ? " reader-story" : ""}`}>
      <AnalyticsPage page={{ page_type: "reading", content_id: reading.id, company_id: reading.companyId, topic: reading.topic }} />
      <div className="reader-trail">
        <ContextLink href={backHref} restore>
          ←{" "}
          {back.startsWith("/read/")
            ? "읽던 질문으로"
            : back.startsWith("/discover")
              ? "읽을거리로"
              : back.startsWith("/jobs/")
                ? "읽던 공고로"
                : back.startsWith("/companies/")
                  ? "회사 개요로"
                  : "공고 목록으로"}
        </ContextLink>
        <span>회사 이야기 이어 읽기</span>
      </div>
      <div className="reader-context">
        <Link
          data-analytics="content_select" data-destination-type="company" data-destination-id={reading.companyId} data-destination-company-id={reading.companyId} data-placement="company_link"
          className="reader-company"
          href={`/companies/${reading.companyId}`}
        >
          <CompanyMark
            companyId={reading.companyId}
            name={reading.companyName}
            color={reading.companyColor}
          />
          <span>
            <strong>{reading.companyName}</strong>
            <small>회사 개요 보기</small>
          </span>
        </Link>
        {/* While the jobs file is read (and without JavaScript) the posting count is unknown, so the shell links
            the registered source's official board, true for any count; no board, no link (DESIGN 읽기와 북마크 전달). */}
        <Suspense fallback={board ? <a className="reader-jobs-link" href={board}>공식 채용 페이지 보기 ↗</a> : null}>
          <ReadingJobsLink companyId={reading.companyId} here={here} back={back} origin={origin} />
        </Suspense>
      </div>
      <div className="reader-grid">
        <article className="reader-answer">
          <p className="reading-kicker">{readingTopics[reading.topic]}</p>
          <h1>{reading.question}</h1>
          {arrival && <ReadingArrival item={arrival} />}
          <p className="reader-lead">{keepDates(reading.answer)}</p>
          <div className="reader-boundary">
            <h2>함께 알아둘 점</h2>
            <p>{keepDates(publicResearchCaveat(reading.limitation))}</p>
          </div>
          <ReadingRoleAnswers groups={scopedAnswers} reading={reading} />
          {reading.sections ? <>
            <p className="story-checked">{(checked => checked ? <>자료 확인 <RelDate value={checked} /></> : "자료 확인일 미확인")(readingCheckedOn(reading))} · 참고 자료 {reading.evidence.length}개</p>
            <StoryBody reading={reading} connections={next} from={here} origin={origin}/>
          </> : <div className="reader-provenance">
            {newestFirst(reading.evidence, e => e.publishedOn).map((e) => (
              <p key={e.id}>
                {e.kind === "official"
                  ? "회사 공식 자료"
                  : e.kind === "press"
                    ? "언론 보도"
                    : "재게시 자료"}{" "}
                · {e.access === "page" ? "원문 확인" : "검색 결과에서만 확인"}
                <br />
                {e.publishedOn ? <>게시 <RelDate value={e.publishedOn} /></> : "게시일 미확인"} · 확인{" "}
                <RelDate value={e.checkedOn} />
              </p>
            ))}
          </div>}
          <a className="reader-source-jump" href="#reading-sources">
            참고 자료 {reading.evidence.length}개 보기
          </a>
        </article>
        <aside className="reader-next" aria-label="목차와 다음 읽을거리">
          {reading.sections?.length ? <StoryContents sections={reading.sections.map(({ id, title }) => ({ id, title }))} placement="sidebar" /> : null}
          {!!sidebar.length && <div className="next-heading"><h2>이어서 살펴볼 질문</h2></div>}
          {sidebar.map(item => <QuestionReadingCard key={item.edge.id} item={item} from={here} origin={origin}/>)}
          {!!otherStories.length && <nav className="reader-company-stories" aria-label="이 회사의 다른 이야기">
            <h2>이 회사의 다른 이야기</h2>
            {otherStories.map(item => <Link key={item.id} href={`/read/${item.id}?${new URLSearchParams({from:here,origin})}`}><strong>{item.question}</strong><span>{item.preview}</span></Link>)}
          </nav>}
          {!!otherCompanies.length && <nav className="reader-company-stories" aria-label="다른 회사의 같은 주제 이야기">
            <h2>다른 회사의 {readingTopics[reading.topic]} 이야기</h2>
            {otherCompanies.map(item => <Link key={item.id} href={`/read/${item.id}?${new URLSearchParams({from:here,origin})}`}>
              <span>{item.companyName}</span><strong>{item.question}</strong><span>{item.preview}</span>
            </Link>)}
          </nav>}
          <Link
            className="all-readings"
            href={`/discover?topic=${reading.topic}`}
          >
            이 주제 이야기 모두 보기
          </Link>
          <Link className="talent-overview-link" href={`/companies/${reading.companyId}`}>회사 정보 모아보기</Link>
        </aside>
        <section className="reader-evidence" id="reading-sources">
          <h2>어떤 자료를 참고했나요?</h2>
          <p className="research-caption">최근에 나온 자료부터 모았어요. 게시일을 확인하지 못한 자료는 뒤에 있어요.</p>
          {newestFirst(reading.evidence, e => e.publishedOn).map((e) => (
            <article key={e.id} className="reader-source" id={`reading-source-${e.id}`}>
              <p className="reading-kicker">{e.publisher}</p>
              <h3>{e.title}</h3>
              <p>{e.excerpt}</p>
              <p className="research-caption">
                {e.access === "search-index"
                  ? "검색 결과에서 확인했어요. 원문은 직접 확인하지 못했어요."
                  : "원문 확인"}{" "}
                · {e.publishedOn ? <>게시 <RelDate value={e.publishedOn} /></> : "게시일 미확인"} · 확인{" "}
                <RelDate value={e.checkedOn} />
              </p>
              <a data-analytics="source_open" data-placement="reading_source" className="source-original" href={e.url} target="_blank" rel="noopener noreferrer">
                {e.kind === "official" ? "공식 원문 확인" : "원문 확인"} ↗
              </a>
            </article>
          ))}
          <ContextLink
            className="reader-company-return"
            href={companyReturn}
          >
            {reading.companyName}의 다른 질문과 회사 자료
          </ContextLink>
        </section>
      </div>
    </div>
  );
}

/** Optional personalization streams; the complete article and sources are in
 * the initial shell, including when JavaScript is disabled. */
async function ReadingJobsLink({ companyId, here, back, origin }: { companyId: string; here: string; back: string; origin: string }) {
  const [preferences, snapshot] = await Promise.all([readPreferences(), readRenderSnapshot().catch(() => null)]);
  const identity = companies.find(c => c.id === companyId)!;
  const hiring = joinCompanyJobs(identity, snapshot);
  // No posting to open (the jobs file read fine): the registered source's official board, or no link at all,
  // never a "채용 공고 확인" that lands on an empty job section.
  if (hiring.status !== "unavailable" && hiring.jobs.length === 0) {
    const board = sourceBoardUrl(identity);
    return board ? <a className="reader-jobs-link" href={board}>공식 채용 페이지 보기 ↗</a> : null;
  }
  const relevant = queryJobs(hiring.jobs, { role: preferences.role });
  const jobsHref = relevant.total === 1
    ? `/jobs/${relevant.items[0].id}?${new URLSearchParams({ from: here, readFrom: back, readOrigin: origin })}`
    : relevant.total > 1
      ? `/jobs?${new URLSearchParams({ q: identity.name, role: preferences.role })}`
      : `/companies/${companyId}${preferences.role ? `?role=${preferences.role}` : ""}#company-jobs`;
  return <ContextLink className="reader-jobs-link" href={jobsHref}>
    {preferences.role ? roleLabels[preferences.role] : "채용"} 공고 확인
  </ContextLink>;
}
