import type { PeriodType } from '../domain/types.js';
import type { TokenMapping } from './tokenMappings.js';
import { AcquisitionError } from './types.js';

/**
 * Period anchoring for provider values. Provider relative labels ("1Q Ago", "2Y Ago") are anchored
 * to the provider-reported latest RESULTS quarter. A fetch timestamp is never an anchor: no function
 * here accepts one, and only exact quarter-end dates are accepted as anchors.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const QUARTER_END_MONTHS = new Set([3, 6, 9, 12]);

const pad = (n: number): string => String(n).padStart(2, '0');
const lastDay = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();
const iso = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;

/** True for 31 Mar, 30 Jun, 30 Sep and 31 Dec. */
export function isQuarterEnd(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return QUARTER_END_MONTHS.has(month) && day === lastDay(year, month);
}

/** Shifts a quarter-end date by a whole number of quarters (negative = earlier). */
export function shiftQuarters(quarterEnd: string, quarters: number): string {
  if (!isQuarterEnd(quarterEnd)) throw new AcquisitionError('ANCHOR_INVALID', `${quarterEnd} is not a quarter end`);
  const year = Number(quarterEnd.slice(0, 4));
  const month = Number(quarterEnd.slice(5, 7));
  const index = year * 12 + (month - 1) + quarters * 3;
  const y = Math.floor(index / 12);
  const mo = (index % 12) + 1;
  return iso(y, mo, lastDay(y, mo));
}

/** Shifts a fiscal-year-end (31 March) by whole years. */
export function shiftYears(fyEnd: string, years: number): string {
  if (!/^\d{4}-03-31$/.test(fyEnd)) throw new AcquisitionError('ANCHOR_INVALID', `${fyEnd} is not a fiscal year end (31 March)`);
  return iso(Number(fyEnd.slice(0, 4)) + years, 3, 31);
}

/** Most recent fiscal year end (31 March) on or before a quarter end. */
export function latestFiscalYearEndOnOrBefore(quarterEnd: string): string {
  const year = Number(quarterEnd.slice(0, 4));
  return Number(quarterEnd.slice(5, 7)) >= 3 ? iso(year, 3, 31) : iso(year - 1, 3, 31);
}

/** First day of the quarter that ends on `quarterEnd`. */
export function quarterStartOf(quarterEnd: string): string {
  const month = Number(quarterEnd.slice(5, 7));
  return iso(Number(quarterEnd.slice(0, 4)), month - 2, 1);
}

function dayAfter(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

const QUARTER_BY_FISCAL_Q: Record<number, [number, number]> = { 1: [6, 0], 2: [9, 0], 3: [12, 0], 4: [3, 1] };

/**
 * Parses a provider-stated result period to a quarter-end date. Accepts ISO or dd-mm-yyyy dates that
 * are exact quarter ends, "Jun 2026" / "June 2026" / "30 Jun 2026", and "Q1 FY27" / "Q1FY2027"
 * (Indian fiscal year, April to March). Anything else, including non-quarter-end dates, returns null.
 */
export function parseProviderResultPeriod(text: string): string | null {
  const s = text.trim();
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m && isQuarterEnd(m[0])) return m[0];
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(s);
  if (m) {
    const candidate = iso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (isQuarterEnd(candidate)) return candidate;
  }
  m = /\bQ([1-4])\s*-?\s*FY\s*'?(\d{2}|\d{4})\b/i.exec(s);
  if (m) {
    const fy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    const [month, nextYear] = QUARTER_BY_FISCAL_Q[Number(m[1])];
    const year = fy - 1 + nextYear;
    return iso(year, month, lastDay(year, month));
  }
  m = /\b(?:\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ ,'-]+(\d{4})\b/i.exec(s);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const candidate = iso(Number(m[2]), month, lastDay(Number(m[2]), month));
    if (isQuarterEnd(candidate)) return candidate;
  }
  return null;
}

export type AnchorCrossCheckStatus = 'AGREES' | 'PROVIDER_LAGS_XBRL' | 'PROVIDER_AHEAD_OF_XBRL' | 'NOT_AVAILABLE';

export interface AnchorCrossCheck {
  status: AnchorCrossCheckStatus;
  xbrlQuarterEnd?: string;
  detail: string;
}

/** Provider-anchored result periods for one symbol. */
export interface ResultAnchor {
  /** Quarter end of the provider's latest RESULTS quarter (not the shareholding quarter). */
  latestQuarterEnd: string;
  /** Latest completed fiscal year end. */
  latestFiscalYearEnd: string;
  /** How the fiscal year end was obtained. */
  yearSource: 'PROVIDER_REPORTED' | 'DERIVED_FROM_RESULT_QUARTER';
  /** Where the provider stated the quarter, e.g. the call and field. */
  evidence: string;
  crossCheck: AnchorCrossCheck;
  /** Provider's shareholding quarter end when known; ownership facts anchor here. */
  shareholdingQuarterEnd?: string;
}

/** Compares the provider's latest results quarter with the latest XBRL-reported quarter. */
export function crossCheckAnchor(providerQuarterEnd: string, xbrlQuarterEnd?: string | null): AnchorCrossCheck {
  if (!xbrlQuarterEnd) return { status: 'NOT_AVAILABLE', detail: 'no XBRL quarter available to cross-check' };
  if (xbrlQuarterEnd === providerQuarterEnd) {
    return { status: 'AGREES', xbrlQuarterEnd, detail: 'provider latest results quarter equals XBRL' };
  }
  const status = providerQuarterEnd < xbrlQuarterEnd ? 'PROVIDER_LAGS_XBRL' : 'PROVIDER_AHEAD_OF_XBRL';
  return { status, xbrlQuarterEnd, detail: `provider ${providerQuarterEnd} vs XBRL ${xbrlQuarterEnd}` };
}

export interface AnchorInput {
  /** Provider-stated latest results period (text or date). */
  quarterText: string;
  /** Where the provider said it (tool and field), kept for audit. */
  evidence: string;
  /** Provider-stated latest annual period, if given; otherwise derived from the quarter. */
  fiscalYearText?: string;
  shareholdingQuarterText?: string;
  /** Latest quarter end present in XBRL for the same symbol and scope, when available. */
  xbrlLatestQuarterEnd?: string | null;
}

/**
 * Builds the anchor from provider-stated periods.
 * @throws AcquisitionError ANCHOR_INVALID when the stated period is not an exact quarter end.
 */
export function buildResultAnchor(input: AnchorInput): ResultAnchor {
  const quarter = parseProviderResultPeriod(input.quarterText);
  if (!quarter) {
    throw new AcquisitionError('ANCHOR_INVALID', `"${input.quarterText}" is not a provider-stated quarter end`);
  }
  let fiscalYear: string;
  let yearSource: ResultAnchor['yearSource'] = 'DERIVED_FROM_RESULT_QUARTER';
  if (input.fiscalYearText) {
    const stated = parseProviderResultPeriod(input.fiscalYearText);
    if (!stated || !/-03-31$/.test(stated)) {
      throw new AcquisitionError('ANCHOR_INVALID', `"${input.fiscalYearText}" is not a fiscal year end`);
    }
    fiscalYear = stated;
    yearSource = 'PROVIDER_REPORTED';
  } else {
    fiscalYear = latestFiscalYearEndOnOrBefore(quarter);
  }
  const shareholding = input.shareholdingQuarterText ? parseProviderResultPeriod(input.shareholdingQuarterText) : null;
  return {
    latestQuarterEnd: quarter, latestFiscalYearEnd: fiscalYear, yearSource, evidence: input.evidence,
    crossCheck: crossCheckAnchor(quarter, input.xbrlLatestQuarterEnd),
    ...(shareholding ? { shareholdingQuarterEnd: shareholding } : {}),
  };
}

/** Relative label offset, e.g. "Operating Rev. 4Q ago" gives {unit:'Q', offset:4}. */
export function parseRelativeLabel(label: string): { unit: 'Q' | 'Y'; offset: number } | null {
  const m = /(\d+)\s*(qtrs?|quarters?|q|yrs?|years?|y)\b\s*ago/i.exec(label);
  if (!m) return null;
  return { unit: m[2].toLowerCase().startsWith('q') ? 'Q' : 'Y', offset: Number(m[1]) };
}

/** Result of anchoring one token to a dated period. */
export interface AnchoredPeriod {
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
}

/** Context needed to anchor a token. */
export interface AnchorContext {
  anchor: ResultAnchor | null;
  /** Provider observation date from the response header (the priced date; not a fiscal period). */
  observationDate: string | null;
}

/**
 * Dated period for a token, or null when its anchor is unavailable (the caller must then reject the
 * value rather than fall back to a fetch date).
 */
export function anchoredPeriod(mapping: TokenMapping, ctx: AnchorContext): AnchoredPeriod | null {
  const { anchor, observationDate } = ctx;
  let end: string | null = null;
  if (mapping.anchor === 'OBSERVATION_DATE') end = observationDate;
  if (mapping.anchor === 'SHAREHOLDING_QUARTER') end = anchor?.shareholdingQuarterEnd ?? null;
  if (mapping.anchor === 'RESULT_QUARTER' && anchor) end = shiftQuarters(anchor.latestQuarterEnd, -mapping.offset);
  if (mapping.anchor === 'RESULT_YEAR' && anchor) end = shiftYears(anchor.latestFiscalYearEnd, -mapping.offset);
  if (!end) return null;
  return { periodType: mapping.periodType, periodEnd: end, periodStart: periodStartFor(mapping, end) };
}

function periodStartFor(mapping: TokenMapping, end: string): string {
  if (mapping.periodType === 'DISCRETE_Q') return quarterStartOf(end);
  if (mapping.periodType === 'ANNUAL') return dayAfter(shiftYears(end, -1));
  if (mapping.periodType === 'TTM') return dayAfter(shiftQuarters(end, -4));
  return end;
}
