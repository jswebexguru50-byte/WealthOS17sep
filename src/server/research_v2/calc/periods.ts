const MS_PER_DAY = 86_400_000;

/** Parse an ISO date (YYYY-MM-DD) or instant to epoch milliseconds. */
export function toMs(iso: string): number {
  return Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
}

/** Whole and fractional days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return (toMs(to) - toMs(from)) / MS_PER_DAY;
}

/** The ISO date `years` calendar years before `iso`. */
export function shiftYears(iso: string, years: number): string {
  const date = new Date(toMs(iso));
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

/** Indian fiscal year (ending March) that contains a period end date, e.g. 2026-03-31 -> 2026. */
export function fiscalYearEnding(periodEnd: string): number {
  const month = Number(periodEnd.slice(5, 7));
  const year = Number(periodEnd.slice(0, 4));
  return month >= 4 ? year + 1 : year;
}

/** Label such as `FY26` for the fiscal year that ends on or contains `periodEnd`. */
export function annualLabel(periodEnd: string): string {
  return `FY${String(fiscalYearEnding(periodEnd) % 100).padStart(2, '0')}`;
}

/** Label such as `Q3 FY26` for the Indian fiscal quarter ending on `periodEnd`. */
export function quarterLabel(periodEnd: string): string {
  const month = Number(periodEnd.slice(5, 7));
  const quarter = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 ? 3 : 4;
  return `Q${quarter} ${annualLabel(periodEnd)}`;
}

/** Last day of the month that is `months` calendar months before the month of `iso`. */
export function monthEndMonthsBefore(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const monthIndex = Number(iso.slice(5, 7)) - 1 - months;
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}
