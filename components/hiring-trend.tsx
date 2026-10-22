import { RelDate } from "./rel-date";
import { Period } from "./fact-time";
import { absoluteDate } from "@/lib/relative-date";
import type { HiringTrend } from "@/lib/hiring-trend";

/** Whole days of observation before a line reads as a trend rather than noise. */
const MIN_CHART_DAYS = 7;

/**
 * Combine a company's sources into one daily series. Only days every source
 * observed are summed, so a source starting or stopping later does not show
 * up as a step in the company's postings.
 */
export function companyTrend(trend: HiringTrend | undefined, sourceKeys: readonly string[]) {
  const parts = sourceKeys.map((key) => trend?.sources[key]).filter((part) => !!part);
  if (!trend || !parts.length) return null;
  const totals = new Map<string, { open: number; sources: number }>();
  for (const part of parts)
    for (const day of part.days) {
      const total = totals.get(day.date) ?? { open: 0, sources: 0 };
      totals.set(day.date, { open: total.open + day.open, sources: total.sources + 1 });
    }
  const days = [...totals]
    .filter(([, total]) => total.sources === parts.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, open: total.open }));
  return {
    since: parts.map((part) => part.since).sort().at(-1)!,
    days,
    opened: parts.reduce((sum, part) => sum + part.opened, 0),
    closed: parts.reduce((sum, part) => sum + part.closed, 0),
    windowDays: trend.windowDays,
    generatedAt: trend.generatedAt,
  };
}

const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);

/** Whole KST days between the last observed day and the trend's own date. */
const daysBehind = (last: string, generatedAt: string) =>
  Math.round((Date.parse(`${kst(generatedAt)}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);

/** `shared`: a board other companies also post on (lib/posting-company.ts); its counts are the whole board's. */
export function HiringTrendNote({ trend, now, shared = false }: { trend: NonNullable<ReturnType<typeof companyTrend>>; now?: Date; shared?: boolean }) {
  const { days, since } = trend;
  if (!days.length) return null;
  const current = days.at(-1)!.open;
  const firstDate = days[0].date;
  const lastDate = days.at(-1)!.date;
  // The calendar span from the first to the last observed day, not a count of observed days: a gap in
  // observation would make "최근 N일" name a shorter, wrongly anchored period (DESIGN 시간 축 '기간 예외').
  const span = firstDate === lastDate ? absoluteDate(lastDate) : `${absoluteDate(firstDate)}~${absoluteDate(lastDate)}`;
  const period = firstDate === lastDate ? <time dateTime={lastDate}>{span}</time> : <Period from={firstDate} to={lastDate} />;
  // Days stop at the last successful check; more than a day behind means the
  // official page has not been read since, so the numbers are not current.
  const stale = daysBehind(lastDate, trend.generatedAt) >= 2;
  const observed = days.length;
  // The first day is usually partial (observation started mid-day).
  const wholeDays = Math.max(0, observed - 1);
  const min = Math.min(...days.map((d) => d.open));
  const max = Math.max(...days.map((d) => d.open));
  const width = 240;
  const height = 40;
  const x = (i: number) => (observed === 1 ? width : (i / (observed - 1)) * width);
  const y = (open: number) => (max === min ? height / 2 : height - 4 - ((open - min) / (max - min)) * (height - 8));
  return (
    <div className="hiring-trend">
      <h3>채용 공고 추이</h3>
      <p>
        <span className="nowrap">{period}</span> 서울·판교 공고{" "}
        <span className="nowrap">새로 올라옴 <strong className="tabular">{trend.opened}건</strong></span> ·{" "}
        <span className="nowrap">내려감 <strong className="tabular">{trend.closed}건</strong></span>
      </p>
      {shared && <p className="research-note">채용 보드 전체 기록이라 같은 보드에 올라온 다른 회사 공고도 들어 있어요.</p>}
      {stale ? (
        <p className="research-note">
          <RelDate value={lastDate} now={now} /> 이후로 공식 채용 페이지를 확인하지 못해 아래 숫자는 그날까지의 기록이에요.
        </p>
      ) : null}
      {wholeDays >= MIN_CHART_DAYS && !stale ? (
        <svg
          className="hiring-trend-line"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${span} 하루 끝 공고 수: 가장 적을 때 ${min}건, 가장 많을 때 ${max}건, 마지막 관측 ${absoluteDate(lastDate)} ${current}건`}
        >
          <polyline fill="none" points={days.map((d, i) => `${x(i)},${y(d.open)}`).join(" ")} />
        </svg>
      ) : null}
      {wholeDays >= MIN_CHART_DAYS && !stale ? (
        <p className="research-caption tabular">
          <span className="nowrap">{period}</span> 하루 끝 공고 수 {min === max ? `${min}건` : `${min}–${max}건`} · 마지막 관측{" "}
          <RelDate value={lastDate} now={now} /> {current}건
        </p>
      ) : null}
      <p className="research-caption">
        <RelDate value={since} now={now} />부터 공식 채용 페이지를 하루 네 번 확인한 기록이에요
        {wholeDays < MIN_CHART_DAYS ? ` · 관측 ${observed}일째라 늘고 줄어드는 흐름으로 읽기엔 아직 짧아요` : ""}. 내려간 공고는 마감·채용
        완료·게시 중단을 구분하지 못해요. 기준 <RelDate value={trend.generatedAt} now={now} />
      </p>
    </div>
  );
}
