/** Date helpers for quarter-end arithmetic on ISO dates (YYYY-MM-DD, UTC). */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Month-end date `deltaMonths` away from the month of `date` (2026-06-30 with -3 gives 2026-03-31). */
export function shiftMonthEnd(date: string, deltaMonths: number): string {
  const year = Number(date.slice(0, 4));
  const month0 = Number(date.slice(5, 7)) - 1 + deltaMonths;
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0));
  return `${lastDay.getUTCFullYear()}-${pad(lastDay.getUTCMonth() + 1)}-${pad(lastDay.getUTCDate())}`;
}

/** True when `date` is the last day of March, June, September or December. */
export function isQuarterEnd(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const month = Number(date.slice(5, 7));
  return month % 3 === 0 && shiftMonthEnd(date, 0) === date;
}

/** The `count` consecutive quarter-ends ending at `latest`, newest first. */
export function quarterEndsBack(latest: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonthEnd(latest, -3 * i));
}

const DAY_MS = 86_400_000;

/** Whole days from ISO date/instant `from` to `to` (date part only; negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY_MS);
}

/** True when the date part of `date` is on or before the date part of the as-of instant. */
export function onOrBefore(date: string, asOf: string): boolean {
  return date.slice(0, 10) <= asOf.slice(0, 10);
}
