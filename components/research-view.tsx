import { experienceBrief } from "@/lib/experience-brief";
import { RelDate } from "./rel-date";
import { OpenDetailsLink } from "./open-details-link";
import { agedDate, relativeAge } from "@/lib/relative-date";
import { RestorableDetails } from "@/components/restorable-details";
import Link from "@/components/navigation-link";
import type { CompanyResearch, Hiring } from "@/lib/research";
import { kstDate, projectJob, shortLocation, type Job } from "@/lib/jobs";

export function ResearchJobs({ jobs, from, byRole = false }: { jobs: Job[]; from?: string; byRole?: boolean }) {
  const rows = (items: Job[], showRole = true) => (
    <ul className="research-jobs">
      {items.map((j) => (
        <li key={j.id}>
          <Link
            href={`/jobs/${encodeURIComponent(j.id)}${from ? `?${new URLSearchParams({ from })}` : ""}`}
          >
            {j.title}
          </Link>
          {(() => {
            const projected = projectJob(j);
            return (
              <span className="research-job-meta">
                {/* The condition that decides applying reads first; the address last.
                    Separators are drawn in CSS and clipped at a line start. */}
                <span className="meta-list">
                  <strong className="meta-unit research-job-experience">{experienceBrief(projected.insights!)}</strong>
                  {showRole && <span className="meta-unit">{j.roleLabel}</span>}
                  {projected.insights?.scope === "combined" && <span className="meta-unit">통합 모집</span>}
                  <span className="meta-unit">{shortLocation(projected.locationLabel)}</span>
                </span>
              </span>
            );
          })()}
        </li>
      ))}
    </ul>
  );
  // Many postings across roles read by role: every role and its count are in
  // view, each with its first rows, instead of six rows and "나머지 N건".
  const groups = [...jobs.reduce((map, job) => map.set(job.role, [...(map.get(job.role) ?? []), job]), new Map<Job["role"], Job[]>())]
    .sort(([, a], [, b]) => b.length - a.length);
  if (byRole && jobs.length > 6 && groups.length > 1)
    return (
      <>
        <ul className="research-job-roles" aria-label="직군별 공고 수">
          {groups.slice(0, ROLE_CHIPS).map(([role, items]) => (
            <li key={role}><OpenDetailsLink target={`jobs-role-${role}`}>{items[0].roleLabel} <strong>{items.length}</strong></OpenDetailsLink></li>
          ))}
          {groups.length > ROLE_CHIPS && <li><a href="#jobs-other-roles">외 {groups.length - ROLE_CHIPS}개 직군</a></li>}
        </ul>
        {groups.slice(0, OPEN_GROUPS).map(([role, items]) => (
          <section className="research-job-group" id={`jobs-role-${role}`} key={role}>
            <h3>{items[0].roleLabel} <span>{items.length}건</span></h3>
            {rows(items.slice(0, GROUP_ROWS), false)}
            {items.length > GROUP_ROWS && (
              <RestorableDetails className="research-jobs-more">
                <summary>{items[0].roleLabel} 공고 {items.length - GROUP_ROWS}건 더 보기</summary>
                {rows(items.slice(GROUP_ROWS), false)}
              </RestorableDetails>
            )}
          </section>
        ))}
        {/* Smaller roles: one line each, opened in place. */}
        {groups.length > OPEN_GROUPS && <div id="jobs-other-roles" className="research-job-others">
          {groups.slice(OPEN_GROUPS).map(([role, items]) => (
            <RestorableDetails className="research-job-group research-jobs-more" id={`jobs-role-${role}`} key={role}>
              <summary>{items[0].roleLabel} <span>{items.length}건</span></summary>
              {rows(items, false)}
            </RestorableDetails>
          ))}
        </div>}
      </>
    );
  return (
    <>
      {rows(jobs.slice(0, 6))}
      {jobs.length > 6 && (
        <RestorableDetails className="research-jobs-more">
          <summary>나머지 공고 {jobs.length - 6}건 보기</summary>
          {rows(jobs.slice(6))}
        </RestorableDetails>
      )}
    </>
  );
}
/** Rows shown per role before its own "더 보기", and roles shown open. */
const GROUP_ROWS = 2;
const OPEN_GROUPS = 4;
/** Role chips before "외 N개 직군", so the chips never push the rows below the fold. */
const ROLE_CHIPS = 5;

/** Newest successful collection among a company's sources, if any. */
export const lastHiringCheck = (hiring: Hiring) =>
  hiring.sources
    .map((s) => s.lastSuccessAt)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1) ?? null;

/*
 * One line that never hides staleness: whenever the status is not "ok" it
 * says that current hiring is unconfirmed and when we last saw the postings.
 * Empty lists, never-collected sources and failures read differently, and
 * none of them reads as a confirmed zero.
 */
export function hiringStatusText(hiring: Hiring, now: Date = new Date()) {
  if (hiring.status === "ok") return `확인한 서울·판교 공고 ${hiring.currentCount}건`;
  const failing = hiring.sources.find((s) => s.status === "error");
  const last = lastHiringCheck(hiring);
  const reason =
    hiring.status === "unconnected"
      ? "채용 공고가 아직 연결되지 않았어요"
      : hiring.status === "unavailable"
        ? "공고 자료를 불러오지 못했어요"
        : hiring.status === "unobserved"
          ? "연결된 채용 페이지의 공고를 아직 확인하지 못했어요"
          : hiring.status === "stale"
            ? "공고를 최근에 확인하지 못했어요"
            : failing?.errorCode === "empty"
              ? "최근 확인에서 채용 페이지의 공고 목록이 비어 있었어요"
              : !failing?.lastSuccessAt
                ? "이 채용 페이지에서 아직 공고를 가져온 적이 없어요"
                : "최신 공고를 가져오지 못했어요";
  const parts = [reason];
  if (hiring.status !== "unconnected" && hiring.status !== "unavailable") {
    parts.push("현재 모집 여부 미확인");
    // The last successful collection and the last attempt are different dates.
    const keep = (text: string) => text.replaceAll(" ", "\u00a0");
    if (last) parts.push(`마지막 공고 확인 ${keep(agedDate(last, now))}`);
    const attempted = hiring.sources
      .map((s) => s.checkedAt)
      .filter((t): t is string => !!t)
      .sort()
      .at(-1);
    if (attempted && attempted !== last) parts.push(`확인 시도 ${keep(relativeAge(attempted, now) ?? agedDate(attempted, now))}`);
  }
  return parts.join(" · ");
}

export function HiringStatus({ hiring }: { hiring: Hiring }) {
  return (
    <p className={`research-status status-${hiring.status}`}>
      {hiringStatusText(hiring)}
      {hiring.status !== "ok" && hiring.jobs.length > 0 && (
        <span> · 이전에 확인한 공고 {hiring.jobs.length}건</span>
      )}
    </p>
  );
}
export function Citations({
  company,
  ids,
}: {
  company: CompanyResearch;
  ids: string[];
}) {
  return (
    <div className="research-citations">
      {ids.map((id) => {
        const e = company.evidence.find((e) => e.id === id)!;
        return (
          <span key={id}>
            {/* The publisher is the link; dates read as plain metadata after it. */}
            <a href={`#source-${id}`} aria-label={`${e.publisher} 자료로 이동`}>{e.publisher}</a> ·{" "}
            {e.publishedOn ? <>게시 <RelDate value={e.publishedOn} /></> : "게시일 미확인"}{" "}
            · 확인 <RelDate value={e.checkedOn} compact />
            {e.access === "search-index" ? " · 검색 결과에서만 확인" : ""}
          </span>
        );
      })}
    </div>
  );
}
export function ResearchUnavailable({ href }: { href: string }) {
  return (
    <div className="research-warning">
      <h2>기업 자료를 불러오지 못했어요.</h2>
      <p>
        기업 목록은 유지하고 있어요. 잠시 후 다시 확인하거나 공식 채용 페이지를
        살펴보세요.
      </p>
      <a className="button" href={href}>
        다시 불러오기
      </a>
    </div>
  );
}
