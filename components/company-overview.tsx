import { RestorableDetails } from "@/components/restorable-details";
import { COMPANY_AGE_NOTE, companyAge } from "@/lib/company-age";
import { RelDate } from "./rel-date";
import { companyOverview, companyBusinessIntro } from "@/lib/company-overview";
import type { ReactNode } from "react";
import type { CompanyResearch } from "@/lib/research";
import { industryLabel } from "@/lib/company-fact-presentation";

function OverviewSources({ field, children }: { field: ReturnType<typeof companyOverview>[number]; children?: ReactNode }) {
  const sources = [...new Map(field.sources.map(source => [source.url, source])).values()];
  if (children) return <RestorableDetails className="overview-sources">
    <summary>출처 {sources.length}개 보기</summary>
    {children}
  </RestorableDetails>;
  if (sources.length <= 1) return sources.map(source => <a key={source.id} href={`#source-${source.id}`} aria-label={`${field.label} 출처: ${source.publisher}`}>{source.publisher}</a>);
  return <RestorableDetails className="overview-sources">
    <summary>출처 {sources.length}개 보기</summary>
    <ul>{sources.map(source => <li key={source.id}><a href={`#source-${source.id}`}>{source.title}</a></li>)}</ul>
  </RestorableDetails>;
}

/*
 * Basics at a glance: a known value takes its line plus one wrapping meta
 * line (date · limit · source link). Fully unknown fields are named together
 * on one line instead of each taking a block. The long basis for each value
 * stays in "회사 현황" below, and sources open in the in-page source list.
 */
export function CompanyOverview({ company, factIds, businessMeta, businessSources }: {
  company?: CompanyResearch;
  /** Facts the page's 회사 현황 list draws; a field only links to those. */
  factIds?: { has(id: string): boolean };
  businessMeta?: ReactNode;
  businessSources?: ReactNode;
}) {
  const fields = companyOverview(company);
  const business = fields.find(field => field.label === "주요 산업·도메인" && field.value !== "미확인" && !industryLabel(field.value));
  const intro = companyBusinessIntro(company);
  const unknown = fields.filter((field) => field.value === "미확인");
  const shown = fields.filter((field) => field.value !== "미확인" && field !== business);
  return <div className="company-overview-block">
    {shown.length > 0 && <dl className="company-overview" aria-label="회사 기본 정보">
      {shown.map((field) => {
        const age = field.label === "설립일" ? companyAge(field.value) : null;
        const partial = field.value.includes("미확인");
        // A note starts with the value's date: a day, a month or, for some events, only a year.
        const date = field.note.match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?(?= )/)?.[0];
        const historical = field.label === "인원 규모" && !!date && !field.caveat;
        const funding = field.label === "투자 시리즈" && !!date;
        const limits = [
          field.caveat,
          historical ? `${field.note.includes("국민연금 가입자") ? "국민연금 가입자 · " : ""}현재 인원 미확인` : null,
          funding ? "이후 투자 여부 미확인" : null,
          field.sources.some((source) => source.access === "search-index") ? "검색 결과에서만 확인" : null,
        ].filter((text): text is string => !!text);
        const records = (field.records ?? []).filter((id) => !factIds || factIds.has(id));
        return <div className="company-overview-field" key={field.label}>
          <dt>{field.label}</dt>
          <dd>
            <strong className={`company-overview-value${partial ? " is-unknown" : ""}${historical ? " is-number" : ""}`}>{field.value}{age && <span className="company-age" title={COMPANY_AGE_NOTE}> ({age})</span>}</strong>
            <div className="company-overview-meta">
              {date && <span>{field.dateLabel ?? (historical && field.note.includes("기사 게시 시점") ? "기사 기준" : field.note.includes("자료 시점") ? "자료 시점" : "자료 기준")} <RelDate value={date} /></span>}
              {limits.map((text) => <span key={text}>{text}</span>)}
              <OverviewSources field={field} />
              {records.length > 0 && <a href={`#fact-${records[0]}`} aria-label={`${field.label} 관련 기록 ${records.length}건 보기`}>관련 기록 {records.length}건 보기</a>}
            </div>
            {field.contrast && <p className="company-overview-meta company-overview-contrast">
              <span>다른 공개 자료 {field.contrast.value} · {field.contrast.scope} {field.contrast.basis}</span>
              <span>자료 기준 <RelDate value={field.contrast.referenceOn} /></span>
              {field.contrast.sources.map((source) => <a key={source.id} href={`#source-${source.id}`} aria-label={`${field.label} 비교 출처: ${source.publisher}`}>{source.publisher}</a>)}
            </p>}
          </dd>
        </div>;
      })}
    </dl>}
    {business && <div className="company-business-intro" id={intro ? `fact-${intro.fact.id}` : undefined}>
      <h2>어떤 회사인가요?</h2>
      <p>{business.value}</p>
      <div className="company-overview-meta">{businessMeta}<OverviewSources field={{ ...business, label: "회사 소개" }}>{businessSources}</OverviewSources></div>
    </div>}
    {unknown.length > 0 && <p className="company-overview-unknown">확인하지 못한 항목: {unknown.map((field) => field.label).join(" · ")}</p>}
  </div>;
}
