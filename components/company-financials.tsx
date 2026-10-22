import { RestorableDetails } from "@/components/restorable-details";
import type { FinancialPresentation } from "@/lib/company-fact-presentation";
import { absoluteDate } from "@/lib/relative-date";

/** Server-rendered figures, shared by the company facts and in-chart disclosure. */
export function CompanyFinancials({ view, heading = true }: { view: FinancialPresentation; heading?: boolean }) {
  return <div className="company-financials">
    {heading && <h3>{view.title}</h3>}
    <p className="financial-basis">{view.document} · {view.basis}</p>
    <dl className="financial-metrics">
      {view.metrics.map(metric => <div key={metric.label}>
        <dt>{metric.label}</dt><dd>{metric.value}</dd>
      </div>)}
    </dl>
    <table className="financial-equity">
      <caption>자본총계</caption>
      <thead><tr>{view.equity.map(value => <th scope="col" key={value.period}>{value.period}</th>)}</tr></thead>
      <tbody><tr>{view.equity.map(value => <td key={value.period}>{value.value}</td>)}</tr></tbody>
    </table>
    {view.caveat && <p className="financial-caveat">{view.caveat}</p>}
    <p className="financial-precision">금액의 표시 단위 미만은 버림</p>
    {view.sources.some(source => source.excerpt) && <RestorableDetails className="financial-excerpt">
      <summary>공시 세부 내용</summary>
      {view.sources.filter(source => source.excerpt).map(source => <p key={source.id}>{source.excerpt.replace(/\s*(?:수집 원문 기록|응답 기록|원본) SHA-256 [a-f0-9]{64}\s*$/i, "").trim()}</p>)}
    </RestorableDetails>}
    <p className="financial-source">
      {view.sources.map(source => <span key={source.id}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">금융감독원 전자공시</a>
        <span>공시 <time dateTime={source.publishedOn!}>{absoluteDate(source.publishedOn!)}</time></span>
        <span>확인 <time dateTime={source.checkedOn}>{absoluteDate(source.checkedOn)}</time></span>
      </span>)}
    </p>
  </div>;
}
