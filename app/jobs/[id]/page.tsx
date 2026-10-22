import { publicResearchCaveat } from "@/lib/research-public-copy";
import { AnalyticsPage } from "@/components/analytics";
import { companyListing, hasSourcedBusiness } from "@/lib/company-listing";
import { searchRobots } from "@/lib/search-indexing";
import { SectionTabs } from "@/components/section-tabs";
import { RestorableDetails } from "@/components/restorable-details";
import { ImageBodyNote, JobDescription } from "@/components/job-description";
import { OpenDetailsLink } from "@/components/open-details-link";
import { shareMetadata } from "@/lib/share-metadata";
import { Suspense } from "react";
import { RequestExperience } from "@/components/request-preferences";
import { CompanyMark } from "@/components/company-mark";
import { ContextLink } from "@/components/reading-view";
import Link from "@/components/navigation-link";
import { readingItems, safeReturnPath, readingJobReturn } from "@/lib/reading";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getJob, getJobSources } from "@/lib/repository";
import { jobFreshness, kstDate } from "@/lib/jobs";
import { roleLabels, type SearchParams } from "@/lib/jobs";
import { experienceBrief } from "@/lib/experience-brief";
import { boardCompanyForJob, companyForJob } from "@/lib/companies";
import { postingCompanyOf } from "@/lib/posting-company";
import { JobAttachments } from "@/components/job-attachments";
import { readRenderResearch } from "@/lib/render-data";
import { Bookmark } from "@/components/bookmark";
import { RelDate } from "@/components/rel-date";
import { agedDate } from "@/lib/relative-date";
import { IMAGE_BODY_NOTE, hasTextBody, parseJobDescription } from "@/lib/job-description";
import { isConditionsHeading, sectionHeading } from "@/lib/job-insights";
import { CompanyChips } from "@/components/company-chips";
import { companyBasics } from "@/lib/company-basics";
import { onboardingIdentityOnly } from "@/lib/research";
import { withoutResearchProcess } from "@/lib/research-process-sentences";
import { jobReadings } from "@/lib/job-readings";

// "Software Engineer", "개발자": a title that names no specialty.
const genericTitle = (title: string) =>
  /^(?:(?:senior|junior|staff|principal|lead|시니어|주니어)\s*)?(?:software|sw|소프트웨어)?\s*(?:engineer|developer|개발자|엔지니어)s?$/i.test(
    title.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/[,·\-–]+/g, " ").replace(/\s+/g, " ").trim(),
  );
// Lines per section shown before the full posting.
const DIGEST_LINES = 4;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const record = await getJob(id);
  if (!record) return { title: "공고를 찾을 수 없어요", robots: searchRobots(false) };
  const research = await readRenderResearch();
  const identity = companyForJob(record);
  const eligible = !!identity && research.status === "ok" && companyListing(research.pack).eligibleIds.has(identity.id);
  const summary = hasTextBody(record.description) ? record.description.slice(0, 180) : IMAGE_BODY_NOTE;
  return {
    title: `${record.company} · ${record.title}`,
    description: summary,
    ...shareMetadata(`${record.company} · ${record.title}`, summary, `/jobs/${record.id}`),
    robots: searchRobots(eligible),
  };
}

export default async function JobPage({ params, searchParams }: Props) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  await connection();
  const freshness = jobFreshness(job, await getJobSources());
  const identity = companyForJob(job);
  // On a shared board, a posting that is not the board company's own: say whose board it came from.
  const boardCompany = identity ? undefined : boardCompanyForJob(job);
  const unconfirmed = postingCompanyOf(job).kind === "unconfirmed";
  const research = identity ? await readRenderResearch() : null;
  // An onboarding seed holds only identity evidence (lib/research.ts onboardingIdentityOnly): 미조사, as on the company page.
  const company =
    research?.status === "ok"
      ? research.pack.companies.find((c) => c.id === identity?.id && !onboardingIdentityOnly(c))
      : undefined;
  // '어떤 회사일까요?' needs a sourced business description (the listing's own rule); without one the section
  // is left out rather than filled. A company nobody has researched says so instead.
  const companyContext = !identity ? null
    : research?.status !== "ok" ? "unavailable"
      : !company ? "unresearched"
        : hasSourcedBusiness(company) ? "about" : null;
  // Sentences about how the research was done are not product copy (D4); the stored summary is unchanged.
  const about = companyContext === "about" && company ? withoutResearchProcess(company.summary) : "";
  const stories = research?.status === "ok" ? readingItems(research.pack).filter(r=>r.companyId===identity?.id) : [];
  const { posting: jobStories, selected: selectedStories } = jobReadings(stories, identity?.id ?? "", job);
  const jobStory = jobStories.find(r=>r.topic==="work") ?? jobStories[0];
  // An image-only body has no text to digest or unfold; the original carries it.
  const textBody = hasTextBody(job.description);
  const insights = job.insights!;
  // Quote list items when a section has them; intro prose and sub-labels in
  // between would otherwise take the few visible lines.
  const quoted = (key: "duties" | "required" | "preferred") =>
    insights.items[key].length >= 2 ? insights.items[key] : insights.sections[key];
  const digestGroups = ([
    ["duties", "주요 업무", quoted("duties")],
    ["required", "자격 요건", quoted("required")],
    ["preferred", "우대 사항", quoted("preferred")],
    ["conditions", "근무·전형", insights.conditions],
  ] as const).filter(([, , lines]) => lines.length > 0);
  // The posting's own workplace line ("근무지: 구의오피스 (재택병행)"), by the title.
  const workplace = insights.conditions
    .find((line) => /^근무\s*(?:지|장소|형태)\s*[:：]/.test(line))
    ?.replace(/^근무\s*(?:지|장소|형태)\s*[:：]\s*/, "")
    .trim();
  // Headings the full posting will carry ids for (see JobDescription).
  const anchors = new Set<string>(
    parseJobDescription(job.description).flatMap((block) => {
      if (block.kind !== "heading") return [];
      const kind = sectionHeading(block.text) ?? (isConditionsHeading(block.text) ? "conditions" : null);
      return kind ? [kind] : [];
    }),
  );
  // Conditions already quoted in the visible digest are tagged there, not repeated.
  const bare = (line: string) => line.replace(/^[•·\-*\s]+/, "").trim();
  const digestLines = new Set(
    [quoted("duties"), quoted("required"), quoted("preferred"), insights.conditions].flatMap((lines) => lines.slice(0, DIGEST_LINES).map(bare)),
  );
  // Keyed by the source line; a line split into clauses tags as required if any clause is.
  const experienceByLine = new Map<string, (typeof insights.experience)[number]>();
  for (const e of insights.experience) {
    const key = bare(e.evidence);
    const seen = experienceByLine.get(key);
    if (!seen || (seen.kind !== "required" && e.kind === "required")) experienceByLine.set(key, e);
  }
  // Shown verbatim: a line classified per clause is still quoted whole, once.
  const remainingExperience = insights.experience
    .filter((e) => !digestLines.has(bare(e.evidence)))
    .filter((e, i, all) => all.findIndex((other) => other.evidence === e.evidence) === i);
  const { from, readFrom, readOrigin } = await searchParams;
  const back = safeReturnPath(
    typeof from === "string" ? from : undefined,
    "/jobs",
    research?.status === "ok" ? research.pack : undefined,
  );
  return (
    <div className="detail-page">
      <AnalyticsPage page={{ page_type: "job", content_id: job.id, company_id: identity?.id }} />
      <ContextLink restore className="back-link" href={readingJobReturn(back, readFrom, readOrigin, research?.status === "ok" ? research.pack : undefined)}>
        ←{" "}
        {back === "/saved" ? "북마크로" : back.startsWith("/companies/")
          ? "읽던 회사로"
          : back.startsWith("/read/")
            ? "읽던 질문으로"
            : "공고 목록으로"}
      </ContextLink>
      <div className="detail-layout">
        <article className="detail-article">
          <header className="detail-heading">
            <CompanyMark companyId={identity?.id} name={job.company} color={job.color} className="company-monogram large" />
            <p className="detail-company">
              {identity ? (
                <Link href={`/companies/${identity.id}`}>{job.company}</Link>
              ) : (
                job.company
              )}{" "}
              <span>· {job.roleLabel}</span>
            </p>
            <CompanyChips basics={companyBasics(company)} />
            {boardCompany && (
              <p className="research-note">
                <Link href={`/companies/${boardCompany.id}`}>{boardCompany.name}</Link> 채용 보드에 함께 올라온{" "}
                {unconfirmed
                  ? `공고예요. 어느 회사 공고인지 제목과 회사 소개로 정할 수 없어 ${boardCompany.name} 회사 자료와 연결하지 않았어요.`
                  : `다른 회사 공고예요. ${boardCompany.name} 회사 자료와 연결하지 않았어요.`}
              </p>
            )}
            <h1>{job.title}</h1>
            {/* Separators are drawn in CSS and clipped at a line start (see .meta-row). */}
            <p className="job-meta meta-row">
              <span className="meta-list">
                {job.locationLabel.trim() && <span className="meta-unit">{job.locationLabel}</span>}
                {workplace && <span className="meta-unit">{workplace}</span>}
                <span className="meta-unit">공식 채용 공고</span>
              </span>
            </p>
            {job.tags.length > 0 && (
              <div className="tags">
                {job.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className="detail-actions">
              <a
                className="button primary"
                data-analytics="official_job_open" data-job-id={job.id} data-placement="top"
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                공식 공고 열기 ↗
              </a>
              {identity && (
                <Link className="button" href={`/companies/${identity.id}`}>
                  회사 알아보기
                </Link>
              )}
            </div>
            {/* On narrow screens the sidebar falls to the end; keep saving and freshness by the title. */}
            <div className="detail-quick">
              <Bookmark id={job.id} title={`${job.company} ${job.title}`} expanded />
              <p>
                이 브라우저에 저장돼요 · 최근 확인 <RelDate value={job.fetchedAt} />
                {freshness.state !== "ok" ? " · 현재 모집 여부 미확인" : ""}
              </p>
            </div>
            <SectionTabs label="공고 내용 바로가기">
              {jobStory && <a href="#job-research">공고 해석</a>}
              <a href="#experience-summary">모집 조건</a>
              {(companyContext === "about" || companyContext === "unavailable") && <a href="#company-context">회사 질문</a>}
              {textBody && <OpenDetailsLink target="job-description">공고 전문</OpenDetailsLink>}
            </SectionTabs>
          </header>
          {jobStory && (
            <section className="detail-section job-research" id="job-research" aria-label="공고와 회사 자료를 함께 읽은 해석">
              <p className="section-kicker">이 공고를 읽는 관점</p>
              <h2>{jobStory.question}</h2>
              <p className="job-research-answer">{jobStory.answer}</p>
              {jobStory.sections?.map(section => (
                <section key={section.id} className="job-research-point">
                  <h3>{section.title}</h3>
                  <p>{section.text}</p>
                </section>
              ))}
              <p className="research-note">{publicResearchCaveat(jobStory.limitation)}</p>
              <ContextLink className="job-research-link" href={`/read/${jobStory.id}?${new URLSearchParams({from:`/jobs/${job.id}`})}`}>
                회사 이야기와 참고 자료 보기
              </ContextLink>
            </section>
          )}
          <section className="detail-section job-digest" id="experience-summary">
            <h2>무슨 일을 하고, 무엇을 요구하나요?</h2>
            <p className="job-digest-role">
              {insights.roles
                .filter((r) => r !== "engineering" && r !== "other")
                .map((r) => roleLabels[r])
                .join(" · ") || job.roleLabel}
              {insights.scope === "combined"
                ? " · 통합 모집 · 역할 배정 확인 필요"
                : insights.scope === "unknown" && genericTitle(job.title)
                  ? " · 세부 역할 미확인"
                  : ""}
              {insights.experience.length > 0 && <span className="job-digest-brief"> · {experienceBrief(insights)}</span>}
            </p>
            <Suspense fallback={null}><RequestExperience /></Suspense>
            {(insights.scope === "combined" || !insights.experience.length) && (
              <p className="research-note">
                {insights.scope === "combined" && "여러 역할을 함께 모집하는 공고예요. 실제 배정 방식을 확인하세요. "}
                {!insights.experience.length && "공고에서 경력 조건을 확인하지 못했어요. 경력 무관으로 모집한다는 뜻은 아니에요."}
              </p>
            )}
            {!textBody ? (
              <ImageBodyNote sourceUrl={job.sourceUrl} />
            ) : !digestGroups.some(([key]) => key !== "conditions") && (
              <p className="research-caption">
                업무와 요건을 따로 나눠 적지 않은 공고예요.{" "}
                <OpenDetailsLink target="job-description">공고 전문 보기</OpenDetailsLink>
              </p>
            )}
            {digestGroups.length > 0 && (
              <>
                <dl className="job-digest-rows">
                  {digestGroups.map(([key, title, lines]) => (
                    <div key={key}>
                      <dt>{title}</dt>
                      <dd>
                        <ul>
                          {lines.slice(0, DIGEST_LINES).map((line, i) => {
                            const condition = experienceByLine.get(bare(line));
                            return (
                              <li key={i}>
                                {condition && (
                                  <span className="digest-tag">{condition.kind === "preferred" ? "우대 경력" : "경력 조건"}</span>
                                )}
                                {line}
                              </li>
                            );
                          })}
                        </ul>
                        {lines.length > DIGEST_LINES && (
                          <OpenDetailsLink
                            className="job-digest-more"
                            target="job-description"
                            anchor={anchors.has(key) ? `jd-${key}` : "job-description"}
                          >
                            {title} {lines.length - DIGEST_LINES}개 더 보기
                          </OpenDetailsLink>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="research-caption">공고 원문의 문장을 그대로 옮겼어요. 근무 조건과 전형은 바뀔 수 있으니 지원 전에 원문을 확인하세요.</p>
              </>
            )}
            {remainingExperience.length > 0 && (
              <>
                <h3 className="job-digest-subhead">{digestGroups.length ? "그 밖의 경력 조건" : "경력 조건"}</h3>
                <ul className="experience-evidence">
                  {remainingExperience.map((e, i) => (
                    <li key={i}>
                      <span className="experience-kind">
                        {e.kind === "required" ? "필수" : e.kind === "preferred" ? "우대" : "필수·우대 미확인"}
                        {/* Which role a condition applies to only matters when several are recruited. */}
                        {insights.scope === "combined" ? (e.role ? ` · ${roleLabels[e.role]}` : " · 적용 역할 확인 필요") : ""}
                      </span>
                      {/* A clause is shown as its whole source line; other conditions keep their own text ("제목에 명시: …"). */}
                      <span>{(e.evidence.includes(e.text.replace(/^[•·\-*]\s*/, "")) ? e.evidence : e.text).replace(/^[•·\-*]\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

          </section>
          {identity && companyContext === "unresearched" && (
            <section className="detail-section job-company-context" id="company-context">
              <h2>아직 조사하지 않은 회사예요</h2>
              <p>{identity.name}의 사업·규모·투자 같은 회사 자료는 아직 조사하지 않았어요.</p>
              <a className="button" href={`/companies/${identity.id}?role=#company-jobs`}>
                {identity.name} 공고 모아보기
              </a>
            </section>
          )}
          {identity && (companyContext === "about" || companyContext === "unavailable") && (
            <section
              className="detail-section job-company-context"
              id="company-context"
            >
              <h2>{identity.name}, 어떤 회사일까요?</h2>
              <CompanyChips basics={companyBasics(company)} />
              {companyContext === "unavailable" ? (
                <p>기업 자료를 불러오지 못했어요. 회사 화면에서 다시 확인할 수 있어요.</p>
              ) : about ? (
                <p>{about}</p>
              ) : null}
              {!!selectedStories.length && (
                <ul>
                  {selectedStories.map((g) => (
                    <li key={g.id}>
                      <Link
                        href={`/read/${g.id}?${new URLSearchParams({ from: `/jobs/${job.id}` })}`}
                      >
                        {g.question}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link className="button" href={`/companies/${identity.id}`}>
                {identity.name} 더 알아보기
              </Link>
            </section>
          )}
          {textBody && (
            <RestorableDetails className="detail-section job-original" id="job-description">
              <summary>포지션 소개 · 공고 전문 읽기</summary>
              <JobDescription text={job.description} />
            </RestorableDetails>
          )}
          <JobAttachments links={job.links} />
        </article>
        <aside className="detail-sidebar">
          <div className="summary-card">
            <h2>지원 전 확인</h2>
            <dl>
              <div>
                <dt>직군</dt>
                <dd>{job.roleLabel}</dd>
              </div>
              <div>
                <dt>근무 지역</dt>
                <dd>{job.locationLabel}</dd>
              </div>
              <div>
                <dt>경력</dt>
                <dd>
                  <a href="#experience-summary">{experienceBrief(insights)}</a>
                </dd>
              </div>
              <div>
                <dt>연봉</dt>
                <dd>{job.salary ?? "연봉 범위 미확인"}</dd>
              </div>
            </dl>
            <a
              className="button primary source-link"
                data-analytics="official_job_open" data-job-id={job.id} data-placement="bottom"
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              원문에서 지원하기 ↗
            </a>
            <Bookmark
              id={job.id}
              title={`${job.company} ${job.title}`}
              expanded
            />
            <p className="local-note">이 브라우저에 저장돼요.</p>
            <div className="source-note">
              <p>
                출처 · {job.company} /{" "}
                {
                  {
                    lever: "Lever",
                    greenhouse: "Greenhouse",
                    greeting: "공식 채용 페이지",
                    workday: "Workday",
                  }[job.source]
                }
              </p>
              <p>
                최근 확인{" "}
                <RelDate value={job.fetchedAt} />
              </p>
              {freshness.state !== "ok" && (
                <p className="job-freshness">
                  {freshness.empty
                    ? "최근 확인에서 이 채용 페이지의 공고 목록이 비어 있었어요."
                    : freshness.state === "error"
                      ? "최근 확인에서 이 채용 페이지를 불러오지 못했어요."
                      : "이 공고를 최근에 확인하지 못했어요."}{" "}
                  {`현재 모집 여부는 확인하지 못했어요${freshness.lastSuccessAt ? ` (마지막 공고 확인 ${agedDate(freshness.lastSuccessAt)})` : ""}.`}
                </p>
              )}
              <p>지원 조건과 마감 여부는 원문을 확인해 주세요.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
