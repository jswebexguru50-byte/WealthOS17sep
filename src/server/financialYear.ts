/** Return the Indian financial year for an ISO/date-parsable date. */
export function getFinancialYearFromDate(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`INVALID_TRADE_DATE: ${String(value)}`);
  }
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function parseFinancialYear(value: string): { startYear: number; endYear: number } {
  const match = /^([0-9]{4})-([0-9]{4})$/.exec(String(value));
  const startYear = match ? Number(match[1]) : NaN;
  const endYear = match ? Number(match[2]) : NaN;
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear !== startYear + 1) {
    throw new Error(`INVALID_FINANCIAL_YEAR: ${String(value)}`);
  }
  return { startYear, endYear };
}
