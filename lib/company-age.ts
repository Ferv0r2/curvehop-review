import { elapsedYears } from "./relative-date";

/** Tenure: the years the age phrase counts (RelDate "N년 전"), plus one, so
 * "2014년 12월 31일" reads 12년차 beside "11년 전". A year alone counts by
 * calendar year (founding year = year one). Called by server views; preserve
 * the source's date precision and entity scope. */
export function companyAge(founded: string, now = new Date()): string | null {
  const dates = [...founded.matchAll(/(?:^|\D)(\d{4})년(?:\s*(\d{1,2})월(?:\s*(\d{1,2})일)?)?/g)];
  if (dates.length !== 1 || !Number.isFinite(now.getTime())) return null;
  const [, year, month, day] = dates[0];
  if (Number(year) < 1800) return null;
  const pad = (n: string) => n.padStart(2, "0");
  const years = elapsedYears(month ? `${year}-${pad(month)}${day ? `-${pad(day)}` : ""}` : year, now);
  return years === null ? null : `${years + 1}년차`;
}

/** The tooltip beside a tenure, saying how it is counted. */
export const COMPANY_AGE_NOTE = "설립 후 지난 햇수에 1을 더해 계산해요.";
