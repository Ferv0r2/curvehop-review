/*
 * How old a date is, in words a reader judges at a glance ("어제", "3일 전",
 * "5개월 전"). Pages using it render per request (connection()), so the phrase
 * is computed at view time. Date-only values ("2026-10-01"), months
 * ("2026-06") and years ("2020") are compared by KST calendar day, month or
 * year, never by a guessed time of day.
 */
const KST = 9 * 3_600_000;
const kstParts = (ms: number) => {
  const d = new Date(ms + KST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) };
};

export function relativeAge(value: string, now: Date = new Date()): string | null {
  const today = kstParts(now.getTime());
  if (/^\d{4}$/.test(value)) {
    // A year is aged only once it is over: this year and later read as the year itself.
    const years = today.y - Number(value);
    return years > 0 ? `${years}년 전` : null;
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    const months = (today.y - y) * 12 + (today.m - (m - 1));
    if (months < 0) return null;
    return months === 0 ? "이번 달" : months < 12 ? `${months}개월 전` : `${Math.floor(months / 12)}년 전`;
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const at = Date.parse(dateOnly ? `${value}T00:00:00+09:00` : value);
  if (!Number.isFinite(at) || at > now.getTime() + 60_000) return null;
  if (!dateOnly) {
    const hours = (now.getTime() - at) / 3_600_000;
    if (hours < 1) return "방금";
    if (hours < 24) return `${Math.floor(hours)}시간 전`;
  }
  const days = Math.round((today.day - kstParts(at).day) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 30) return `${days}일 전`;
  const then = kstParts(at);
  const months = (today.y - then.y) * 12 + (today.m - then.m);
  return months < 12 ? `${Math.max(1, months)}개월 전` : `${Math.floor(months / 12)}년 전`;
}

/** The absolute date as readers see it next to the relative phrase. */
export function absoluteDate(value: string): string {
  if (/^\d{4}$/.test(value)) return `${value}년`;
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return value.replaceAll("-", ".");
  const d = new Date(Date.parse(value) + KST);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** "3일 전 (2026.10.02)": relative first, absolute kept beside it. */
export function agedDate(value: string, now: Date = new Date()): string {
  const rel = relativeAge(value, now);
  return rel ? `${rel} (${absoluteDate(value)})` : absoluteDate(value);
}

/**
 * Whole years behind the age phrase ("11년 전" → 11, under a year → 0), null
 * for a future or unreadable date. Same calendar rules as relativeAge, so a
 * tenure counted from it never disagrees with the phrase beside it.
 */
export function elapsedYears(value: string, now: Date = new Date()): number | null {
  const today = kstParts(now.getTime());
  if (/^\d{4}$/.test(value)) {
    const years = today.y - Number(value);
    return years >= 0 ? years : null;
  }
  // Calendar dates only: no month 0 or 13, no 2월 31일 rolled into March, and a date after today's KST date is
  // in the future whatever the time of day.
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), match[3] === undefined ? null : Number(match[3])];
  if (m < 1 || m > 12) return null;
  if (d !== null && new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d) return null;
  const order = (year: number, month: number, day: number) => (year * 100 + month) * 100 + day;
  if (order(y, m - 1, d ?? 1) > order(today.y, today.m, d === null ? 1 : new Date(today.day).getUTCDate())) return null;
  const months = (today.y - y) * 12 + (today.m - (m - 1));
  return months < 0 ? null : Math.floor(months / 12);
}

/**
 * ISO dates inside our own sentences ("2026-10-02 조사 때") in the dotted form
 * readers see (2026.10.02). Display only: stored text, and any hash bound to
 * it, keeps the ISO form. Year ranges (2023-2024) and dates inside a token
 * or an address ("v2026-10-01", "release_2026-10-01", "?version=…", "#2026-10-01") are left alone.
 */
export function dotDates(text: string): string {
  return text.replace(
    /(?<![A-Za-z0-9_.=/#\-])(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?(?![A-Za-z0-9\-])/g,
    (_, y: string, m: string, d?: string) => (d ? `${y}.${m}.${d}` : `${y}.${m}`),
  );
}
