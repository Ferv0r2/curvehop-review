/*
 * What the board gained on one day, by the Korean calendar (KST):
 *
 *   new jobs on D       postings whose `firstSeenAt` (lib/collection.ts) falls on D
 *   new companies on D  data-source companies whose data/discovered-sources.json `addedOn` is D
 *
 * Code-source companies carry no date and never count. A posting without a
 * known first sighting (`firstSeenAt` null or absent) never counts either.
 * Pure: every function takes its clock (`now`) from the caller.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The banner looks back over today and the six days before it. */
export const ARRIVAL_WINDOW_DAYS = 7;

/** A real YYYY-MM-DD calendar day ("2026-02-30" is not). */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** The KST calendar day of an ISO instant; null when it is not one. */
export function kstDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10) : null;
}

/** Today in KST. */
export const kstToday = (now: Date) => new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The `new` query value: a real calendar day, otherwise "" (the filter is ignored). */
export function parseNewDay(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return isCalendarDay(first) ? first : "";
}

/** Whether a posting was first collected on `day` (KST). Unknown first sightings never are. */
export const firstSeenOn = (firstSeenAt: string | null | undefined, day: string) => kstDay(firstSeenAt) === day;

/** "10월 8일": the day the banner and filter lines name. */
export function dayLabel(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(month)}월 ${Number(date)}일`;
}

export type Arrivals = {
  /** The reference day, YYYY-MM-DD (KST). */
  day: string;
  /** Whether that day is today (KST). */
  today: boolean;
  jobs: number;
  companies: number;
};

/**
 * The reference day and its counts: today if anything arrived today, else the
 * latest day with arrivals among the six days before it, else null (no banner).
 * Days after today (a wrong clock) are ignored.
 */
export function latestArrivals(
  input: {
    /** `firstSeenAt` of every listed posting (null or absent: unknown). */
    jobFirstSeen: readonly (string | null | undefined)[];
    /** `addedOn` of every data-source company. */
    companyAddedOn: readonly (string | null | undefined)[];
  },
  now: Date,
): Arrivals | null {
  if (!Number.isFinite(now.getTime())) return null;
  const today = kstToday(now);
  const oldest = shiftDay(today, -(ARRIVAL_WINDOW_DAYS - 1));
  const counts = new Map<string, { jobs: number; companies: number }>();
  const count = (day: string | null) => {
    if (!day || day < oldest || day > today) return null;
    let entry = counts.get(day);
    if (!entry) counts.set(day, (entry = { jobs: 0, companies: 0 }));
    return entry;
  };
  for (const at of input.jobFirstSeen) {
    const entry = count(kstDay(at));
    if (entry) entry.jobs++;
  }
  for (const day of input.companyAddedOn) {
    const entry = count(isCalendarDay(day) ? day : null);
    if (entry) entry.companies++;
  }
  const day = [...counts.keys()].sort().at(-1);
  return day ? { day, today: day === today, ...counts.get(day)! } : null;
}
