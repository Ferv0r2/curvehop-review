import { HeadcountInteractions } from "./headcount-interactions";
import { RestorableDetails } from "@/components/restorable-details";
import type { CSSProperties } from "react";
import type { Evidence } from "@/lib/research";
import type { HeadcountTimeline, TimelineEvent } from "@/lib/headcount-timeline";
import { PENSION_IDENTITIES, pensionRosterReview } from "@/lib/pension-registry";
import { absoluteDate, dotDates } from "@/lib/relative-date";
import { financialPresentation } from "@/lib/company-fact-presentation";
import { CompanyFinancials } from "./company-financials";

const SOURCE_KIND: Record<Evidence["kind"], string> = { official: "공식 자료", press: "보도", repost: "재게시" };

/** First source names the event; the rest are counted, not dropped. */
const sourceLabel = (sources: Evidence[]) => {
  if (!sources.length) return "출처 확인 필요";
  const publishers = [...new Set(sources.map(s => s.publisher))];
  return `${SOURCE_KIND[sources[0].kind]} · ${publishers[0]}${publishers.length > 1 ? ` 외 ${publishers.length - 1}` : ""}`;
};

// Collector audit hashes stay in the evidence record, not in the reading surface.
const readerExcerpt = (text: string) => text.replace(/\s*(?:수집 원문 기록|응답 기록|원본) SHA-256 [a-f0-9]{64}\s*$/i, "").trim();

const PLACE_LABEL: Record<TimelineEvent["basis"], string> = { filing: "공시", funding: "발표 맥락", occurred: "날짜", reference: "기준" };

/**
 * Where the event sits, in the words of its placement: a filing's receipt date
 * (with the period a filed state is as of), a funding announcement, the day
 * something happened, or the fact's reference date. Next to a month axis the
 * date itself reads better than its age.
 */
function EventDate({ event }: { event: TimelineEvent }) {
  const { basis, date, time } = event;
  return (
    <>
      {PLACE_LABEL[basis]} <time dateTime={date}>{absoluteDate(date)}</time>
      {basis === "filing" && time.kind === "state" && time.asOf && <> · 기준 <time dateTime={time.asOf}>{absoluteDate(time.asOf)}</time></>}
    </>
  );
}

/**
 * The registered name of the pension workplace counted for a company: the
 * verified roster row's mapping in `PENSION_IDENTITIES`. Read from the
 * registry, never from relations, so the caption does not depend on them.
 */
export function pensionWorkplaceName(companyId: string): string | null {
  const row = pensionRosterReview.find(review => review.companyId === companyId && review.status === "verified");
  const identity = row?.identityMapping ? PENSION_IDENTITIES[row.identityMapping] : undefined;
  return identity && identity.companyId === companyId && identity.name.trim() ? identity.name : null;
}

/**
 * The bars alone: zero-based monthly values with the first and last written
 * on top, and the period's event markers unless `markers` is false (the /about
 * preview draws the bars without the list the markers open). Sighted reading
 * only; the caller keeps a text version of every value.
 */
export function HeadcountBars({ timeline, markers: withMarkers = true }: { timeline: HeadcountTimeline; markers?: boolean }) {
  const { months } = timeline;
  const markers = withMarkers ? timeline.markers : [];
  const lanes = withMarkers ? timeline.lanes : 0;
  const max = Math.max(...months.map(m => m.value ?? 0)) || 1;
  const lastValue = months.findLast(m => m.value !== null)?.month;
  // A window with no observed month has nothing to draw.
  if (!lastValue) return null;
  const dense = months.length > 14;
  return (
    <div className={`headcount-chart${dense ? " dense" : ""}`} aria-hidden="true"
      style={{ "--months": months.length, "--lanes": lanes } as CSSProperties}>
      <div className="headcount-plot">
        {markers.map(marker => (
          <button type="button" key={marker.factId} className={`headcount-marker ${marker.align}`} data-timeline-event={marker.factId} tabIndex={-1}
            style={{ "--x": marker.x, "--lane": marker.lane } as CSSProperties}>
            <span>{marker.label}</span>
          </button>
        ))}
        {months.map((m, i) => (
          <div key={m.month} className="headcount-month">
            {m.value === null ? (
              <span className="headcount-empty" />
            ) : (
              <>
                <span className={`headcount-value${i === 0 || m.month === lastValue ? "" : " middle"}`}>{m.value.toLocaleString("ko-KR")}</span>
                <span className={`headcount-bar${m.month === lastValue ? " last" : ""}`} style={{ "--ratio": m.value / max } as CSSProperties} />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="headcount-axis">
        {months.map((m, i) => (
          <span key={m.month}>
            {Number(m.month.slice(5))}
            {/* The year sits under the first month and each January; a December start leaves it to the January beside it. */}
            {((i === 0 && !m.month.endsWith("-12")) || m.month.endsWith("-01")) && <small>{m.month.slice(0, 4)}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Same-workplace pension subscribers per month as zero-based bars with their
 * raw values, and the period's dated facts as numbered lines on the same axis.
 * The drawing is for sighted reading only; the list and the table below carry
 * every value, date and source.
 */
export function HeadcountTimelineBlock({ timeline, workplace = null, links }: {
  timeline: HeadcountTimeline;
  /** The counted workplace's registered name (`pensionWorkplaceName`); the caption names it when known. */
  workplace?: string | null;
  /** Facts shown elsewhere on the page (a filing in 종속기업 지분 변화) link there instead of the fact list. */
  links?: ReadonlyMap<string, string>;
}) {
  const { events, observations } = timeline;
  const href = (factId: string) => links?.get(factId) ?? `#fact-${factId}`;
  return (
    <HeadcountInteractions>
      <h3>국민연금 가입자와 같은 기간의 공시·보도</h3>
      <HeadcountBars timeline={timeline} />
      {events.length > 0 && (
        <ol className="headcount-events" aria-label="그래프와 함께 읽는 공시·보도" tabIndex={0}>
          {events.map(event => {
            const financial = financialPresentation(event.fact.id.replace(/-dart-\d{6}$/, ""), event.fact, event.sources);
            return (
            <li key={event.fact.id}>
              <span className="headcount-event-number">{event.number}</span>
              <RestorableDetails className="headcount-event-detail" id={`timeline-event-${event.fact.id}`} data-timeline-fact={event.fact.id}>
                <summary>
                  <span className="headcount-event-meta"><EventDate event={event} /> · {sourceLabel(event.sources)}</span>
                  <span className="headcount-event-title">{financial?.title ?? dotDates(event.fact.text)}</span>
                  <span className="headcount-event-action"><span className="when-closed">자료 펼쳐 읽기</span><span className="when-open">자료 접기</span></span>
                </summary>
                <div className="headcount-event-sources">
                  {financial ? <CompanyFinancials view={financial} heading={false} /> : event.sources.map(source => <div key={source.id}>
                    <p className="headcount-event-meta">{source.publisher} · {source.publishedOn ? `게시 ${absoluteDate(source.publishedOn)}` : "게시일 미확인"}{source.access === "search-index" && " · 검색 결과에서만 확인"}</p>
                    <p>{readerExcerpt(source.excerpt)}</p>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">원문 확인 ↗</a>
                  </div>)}
                  <a className="headcount-context-link" href={href(event.fact.id)}>회사 현황에서 보기</a>
                </div>
              </RestorableDetails>
            </li>
          ); })}
        </ol>
      )}
      <p className="research-caption">
        국민연금공단 · {workplace ? `사업장 ‘${workplace}’ 가입자` : "같은 사업장 가입자"} · {absoluteDate(timeline.first)}~{absoluteDate(timeline.last)} · 전체 직원·입퇴사자 수와 다를 수 있어요.
        {events.length > 0 && " 공시에서 나온 사실은 공시한 날, 그 밖의 사실은 아래 목록의 날짜에 놓았어요."}
        {timeline.revised && " 같은 달 값이 다시 확인된 달은 나중에 확인한 값을 그렸어요."}
      </p>
      <RestorableDetails className="headcount-table">
        <summary>월별 값과 출처 보기</summary>
        <table>
          <thead>
            <tr><th scope="col">기준월</th><th scope="col">가입자</th><th scope="col">출처</th></tr>
          </thead>
          <tbody>
            {observations.map(o => (
              <tr key={o.id}>
                <td>{absoluteDate(o.month)}</td>
                <td className="tabular">{o.value.toLocaleString("ko-KR")}명{observations.some(other => other !== o && other.month === o.month) && !o.charted ? " · 이전 확인 값" : ""}</td>
                <td>
                  {o.sources.map(source => (
                    <a key={source.id} href={`#source-${source.id}`}>{source.publisher}</a>
                  ))}
                  {o.checkedOn && <> · 확인 {absoluteDate(o.checkedOn)}</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RestorableDetails>
    </HeadcountInteractions>
  );
}
