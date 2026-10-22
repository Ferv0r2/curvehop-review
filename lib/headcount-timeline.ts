import type { CompanyResearch, Evidence, Headcount, ResearchFact } from "./research";
import { citedSources } from "./research-labels";
import { resolveFactTimes, type PlaceBasis, type ResolvedTime } from "./time-axis";

/** Months drawn at most; older observations stay in the table below the chart. */
export const MAX_CHART_MONTHS = 24;
/** Narrowest plot the marker lanes are laid out for (px), so badges never overlap on a phone. */
const LAYOUT_WIDTH = 360;

export type TimelineMonth = { month: string; value: number | null };
export type TimelineObservation = { id: string; month: string; value: number; sources: Evidence[]; checkedOn: string | null; charted: boolean };
/**
 * `date` places the event (`ResolvedTime.placeOn`): a DART filing's receipt date, or the fact's own date.
 * `basis` says which, for the list label; `time` is the fact's resolved time.
 */
export type TimelineEvent = { number: number; fact: ResearchFact; date: string; basis: PlaceBasis; time: ResolvedTime; x: number; sources: Evidence[] };
/** One dashed line per distinct date position; events on the same position share it. `align` keeps an edge badge inside the plot. */
export type TimelineMarker = { x: number; lane: number; label: string; factId: string; align: "start" | "center" | "end" };

export type HeadcountTimeline = {
  months: TimelineMonth[];
  /** First and last months that have a value. */
  first: string;
  last: string;
  observations: TimelineObservation[];
  /** Some month has more than one collected value. */
  revised: boolean;
  events: TimelineEvent[];
  markers: TimelineMarker[];
  lanes: number;
  /** Headcount records shown here, so the fact list does not repeat them month by month. */
  chartedIds: Set<string>;
};

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const kstMonth = (now: Date) => new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 7);

/** The company's own registered workplace, observed for a month — the only pension count drawn or banded. */
export const isWorkplacePension = (company: Pick<CompanyResearch, "id">, h: Headcount) =>
  h.measurement === "pension-subscribers" && h.referenceBasis === "observation" &&
  h.entityId === company.id && h.scope === "legal-entity" && /^\d{4}-\d{2}/.test(h.referenceOn);

/**
 * The company's own workplace in the pension registry, month by month, with
 * the dated milestones from the same period placed on the same axis. Values
 * are drawn as published; nothing is computed from them and an event is only
 * placed at its date (`ResolvedTime.placeOn`), never linked to a change.
 * Pass `times` resolved on the whole company when `company` is a filtered view.
 */
export function headcountTimeline(company: CompanyResearch, now = new Date(), times: ReadonlyMap<string, ResolvedTime> = resolveFactTimes(company)): HeadcountTimeline | null {
  const series = company.headcount.filter(h => isWorkplacePension(company, h));
  const observations = series.map((h, index) => {
    const sources = citedSources(company, h.evidenceIds);
    return { record: h, index, sources, month: h.referenceOn.slice(0, 7), checkedOn: sources.map(s => s.checkedOn).sort().at(-1) ?? null };
  });
  const byMonth = Map.groupBy(observations, o => o.month);
  if (byMonth.size < 2) return null;

  // A month revised by a later collection is drawn with the value checked last.
  const charted = new Map([...byMonth].map(([month, items]) => [month, items.toSorted((a, b) =>
    (a.checkedOn ?? "").localeCompare(b.checkedOn ?? "") || a.index - b.index).at(-1)!]));
  const observed = [...byMonth.keys()].sort();
  const current = kstMonth(now);
  // Milestones and funding only (`placeOn` is null for everything else). A filing's figures are as of
  // its fiscal period, but the filing happened on its receipt date; on a time axis it sits where it
  // was filed. Other facts keep their own date.
  const dated = company.facts.flatMap(fact => {
    const time = times.get(fact.id), date = time?.placeOn, basis = time?.placeBasis;
    return time && date && basis && date.slice(0, 7) >= observed[0] && date.slice(0, 7) <= current
      ? [{ fact, sources: citedSources(company, fact.evidenceIds), date, basis, time }] : [];
  });
  const end = [observed.at(-1)!, ...dated.map(e => e.date.slice(0, 7))].sort().at(-1)!;
  const axis: string[] = [];
  for (let month = observed[0]; month <= end; month = nextMonth(month)) axis.push(month);
  const months = axis.slice(-MAX_CHART_MONTHS).map(month => ({ month, value: charted.get(month)?.record.value ?? null }));
  const start = months[0].month;

  const position = (date: string) => {
    const index = months.findIndex(m => m.month === date.slice(0, 7));
    const day = date.length === 10 ? Number(date.slice(8, 10)) : null;
    return (index + (day ? (day - 0.5) / daysIn(date.slice(0, 7)) : 0.5)) / months.length;
  };
  const events = dated.filter(e => e.date.slice(0, 7) >= start)
    .map(e => ({ ...e, x: position(e.date) }))
    .toSorted((a, b) => a.x - b.x)
    .map((event, i) => ({ ...event, number: i + 1 }));

  const markers: TimelineMarker[] = [];
  const ends: number[] = [];
  for (const group of Map.groupBy(events, e => e.x).values()) {
    const label = group.length > 1 ? `${group[0].number}–${group.at(-1)!.number}` : String(group[0].number);
    const half = (label.length > 2 ? 36 : 20) / 2 / LAYOUT_WIDTH, gap = 4 / LAYOUT_WIDTH, x = group[0].x;
    let lane = ends.findIndex(right => right + gap <= x - half);
    if (lane < 0) lane = ends.length;
    ends[lane] = x + half;
    markers.push({ x, lane, label, factId: group[0].fact.id, align: x < half ? "start" : x > 1 - half ? "end" : "center" });
  }

  const table = observations.toSorted((a, b) => a.month.localeCompare(b.month) || (a.checkedOn ?? "").localeCompare(b.checkedOn ?? "") || a.index - b.index)
    .map(o => ({ id: o.record.id, month: o.month, value: o.record.value, sources: o.sources, checkedOn: o.checkedOn, charted: charted.get(o.month) === o }));
  return {
    months,
    first: observed.find(month => month >= start)!,
    last: observed.at(-1)!,
    observations: table,
    revised: [...byMonth.values()].some(items => items.length > 1),
    events,
    markers,
    lanes: ends.length,
    chartedIds: new Set(series.map(h => h.id)),
  };
}
