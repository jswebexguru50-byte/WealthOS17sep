import type { Fact, PeriodType, RawXbrlFact, SourceTier } from '../domain/types.js';
import { canonicalMetric, metricDefinition } from './metricDefinitions.js';
import type { MetricDefinition } from './metricDefinitions.js';
import { alignToMetricUnit, convertUnit, flagMagnitudeSuspect } from './units.js';
import type { ConvertedValue } from './units.js';

/** Aggregated count of raw rows that were not turned into facts, per raw metric and reason. */
export interface RejectedFact { rawMetric: string; reason: string; count: number }
export interface NormalizedFacts { facts: Fact[]; rejected: RejectedFact[] }

// --- Indian fiscal calendar ----------------------------------------

const QUARTER_END_MONTH_DAY = ['06-30', '09-30', '12-31', '03-31'];
const YTD_TYPES: PeriodType[] = ['YTD_3M', 'YTD_6M', 'YTD_9M', 'YTD_12M'];

/** Indian fiscal quarter (Apr-Jun = 1 ... Jan-Mar = 4) of a quarter-end date; 0 when not a quarter-end month. */
export const quarterFor = (date: string): number => {
  const month = Number(date.slice(5, 7));
  return month === 6 ? 1 : month === 9 ? 2 : month === 12 ? 3 : month === 3 ? 4 : 0;
};

/** True for 30-Jun, 30-Sep, 31-Dec and 31-Mar. */
export const isQuarterEnd = (date: string): boolean => QUARTER_END_MONTH_DAY.includes(date.slice(5, 10));

/** Calendar year in which the fiscal year starts (FY ending 31-Mar-2026 returns 2025). */
export const fiscalYearFor = (date: string): number => {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? year : year - 1;
};

/** 1 April of the fiscal year containing the date. */
export const fiscalYearStart = (date: string): string => `${fiscalYearFor(date)}-04-01`;

/** First day of the quarter whose end is `date`. */
export const quarterStart = (date: string): string => {
  const year = fiscalYearFor(date);
  const starts = [`${year}-04-01`, `${year}-07-01`, `${year}-10-01`, `${year + 1}-01-01`];
  return starts[quarterFor(date) - 1];
};

/** Last day of fiscal quarter `quarter` in the fiscal year containing `date`. */
export const quarterEnd = (date: string, quarter: number): string => {
  const year = fiscalYearFor(date);
  const ends = [`${year}-06-30`, `${year}-09-30`, `${year}-12-31`, `${year + 1}-03-31`];
  return ends[quarter - 1];
};

const monthIndex = (date: string): number => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
const dayCount = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86_400_000;

// --- classification and row validation ----------------------------------------

/** A discrete-quarter context spanning more than this many days is a mislabelled half-year/year row. */
const MAX_DISCRETE_QUARTER_DAYS = 120;
const SECONDARY_SOURCE_PATTERN = /TRENDLYNE|SCREENER|UPSTOX|YAHOO/i;
const VALID_TIERS: SourceTier[] = ['STATUTORY', 'PROVIDER_VERIFIED', 'PROVIDER_LATEST', 'SECONDARY_LEAD', 'SIMULATED'];
const TIER_STRENGTH: SourceTier[] = [...VALID_TIERS];

/**
 * Classifies a raw row by its XBRL context_ref (never by its dates): OneD = discrete quarter,
 * FourD = year-to-date ending at the period end. Balance-sheet metrics are always point-in-time.
 * @throws Error METRIC_UNMAPPED, XBRL_CONTEXT_UNSUPPORTED or PERIOD_END_UNSUPPORTED.
 */
export function classifyPeriod(raw: RawXbrlFact): PeriodType {
  const definition = metricDefinition(raw.metric);
  if (!definition) throw new Error(`METRIC_UNMAPPED:${raw.metric}`);
  if (definition.periodBasis === 'POINT_IN_TIME') return 'POINT_IN_TIME';
  if (raw.contextRef !== 'OneD' && raw.contextRef !== 'FourD') {
    throw new Error(`XBRL_CONTEXT_UNSUPPORTED:${raw.contextRef}`);
  }
  if (!isQuarterEnd(raw.periodEnd)) throw new Error(`PERIOD_END_UNSUPPORTED:${raw.periodEnd}`);
  return raw.contextRef === 'OneD' ? 'DISCRETE_Q' : YTD_TYPES[quarterFor(raw.periodEnd) - 1];
}

/**
 * Returns the rejection reason for a row's source tier, or null when acceptable. A tier is mandatory,
 * simulated data never becomes a fact, and provider/secondary sources can never claim STATUTORY.
 */
export function validateSourceTier(raw: RawXbrlFact): string | null {
  if (!raw.sourceTier) return 'SOURCE_TIER_REQUIRED';
  if (!VALID_TIERS.includes(raw.sourceTier)) return `SOURCE_TIER_INVALID:${raw.sourceTier}`;
  if (raw.sourceTier === 'SIMULATED') return 'SOURCE_TIER_SIMULATED';
  if (raw.sourceTier === 'STATUTORY' && SECONDARY_SOURCE_PATTERN.test(raw.source)) return 'SOURCE_TIER_MISMATCH';
  return null;
}

interface AcceptedRow {
  raw: RawXbrlFact;
  period: PeriodType;
  definition: MetricDefinition;
  converted: ConvertedValue;
}

/** Validates one raw row; every failure is thrown as an Error whose message is the rejection reason. */
function acceptRow(raw: RawXbrlFact): AcceptedRow {
  const period = classifyPeriod(raw);
  if (period === 'DISCRETE_Q' && dayCount(raw.periodStart, raw.periodEnd) > MAX_DISCRETE_QUARTER_DAYS) {
    throw new Error('CONTEXT_DURATION_MISMATCH:OneD');
  }
  const tierProblem = validateSourceTier(raw);
  if (tierProblem) throw new Error(tierProblem);
  const definition = metricDefinition(raw.metric) as MetricDefinition;
  const providerCrore = /TRENDLYNE/i.test(raw.source);
  const converted = alignToMetricUnit(convertUnit(raw.value, raw.unit, providerCrore), definition.unit);
  return { raw, period, definition, converted };
}

// --- fact construction ----------------------------------------

/** Identity of a series point without its vintage: scope, period type and period end are part of the key. */
export const seriesKey = (f: Pick<Fact, 'isin' | 'scope' | 'metric' | 'periodType' | 'periodEnd'>): string =>
  `${f.isin}|${f.scope}|${f.metric}|${f.periodType}|${f.periodEnd}`;

const addFlag = (fact: Fact, flag: string): void => {
  if (!fact.qualityFlags.includes(flag)) fact.qualityFlags.push(flag);
};

function periodStartFor(raw: RawXbrlFact, period: PeriodType): string {
  if (period === 'POINT_IN_TIME') return raw.periodEnd;
  if (period === 'DISCRETE_Q') return quarterStart(raw.periodEnd);
  return fiscalYearStart(raw.periodEnd);
}

function buildFact(row: AcceptedRow, vintage: number): Fact {
  const { raw, period, definition, converted } = row;
  const metric = canonicalMetric(raw.metric);
  const fact: Fact = {
    factId: '', isin: raw.isin, symbol: raw.symbol, scope: raw.scope, metric, periodType: period,
    periodStart: periodStartFor(raw, period), periodEnd: raw.periodEnd, valueCr: converted.value,
    unit: converted.unit, sourceTier: raw.sourceTier as SourceTier, source: raw.source,
    sourceRef: raw.sourceRef, availableAt: raw.availableAt, vintage, qualityFlags: [], quarantined: false,
  };
  fact.factId = `${seriesKey(fact)}|v${vintage}`;
  if (converted.flag) addFlag(fact, converted.flag);
  if (converted.derivation) fact.derivation = { formula: converted.derivation, inputs: [raw.factId] };
  if (definition.nonNegative && converted.value < 0) addFlag(fact, 'SIGN_UNUSUAL');
  return fact;
}

const addRejection = (report: Map<string, RejectedFact>, rawMetric: string, reason: string): void => {
  const key = `${rawMetric}|${reason}`;
  const prior = report.get(key) ?? { rawMetric, reason, count: 0 };
  report.set(key, { ...prior, count: prior.count + 1 });
};

/**
 * Returns the newest vintage of every series point (same isin, scope, metric, period type, period end),
 * preserving input order.
 */
export function latestVintages(facts: Fact[]): Fact[] {
  const newest = new Map<string, number>();
  for (const fact of facts) {
    const key = seriesKey(fact);
    newest.set(key, Math.max(newest.get(key) ?? 0, fact.vintage));
  }
  return facts.filter(fact => fact.vintage === newest.get(seriesKey(fact)));
}

/** True when a fact may feed calculators: it failed no reconciliation, is not a suspected unit error. */
export const isCalculable = (fact: Fact): boolean =>
  !fact.quarantined && !fact.qualityFlags.includes('PERIOD_RECON_FAIL') && !fact.qualityFlags.includes('UNIT_SUSPECT');

// --- magnitude guard on adjacent periods ----------------------------------------

/** Month gap that makes two periods of this type "adjacent" for the magnitude comparison. */
function isAdjacent(period: PeriodType, previousEnd: string, currentEnd: string): boolean {
  const gap = monthIndex(currentEnd) - monthIndex(previousEnd);
  if (period === 'DISCRETE_Q') return gap === 3;
  if (period === 'POINT_IN_TIME') return gap > 0 && gap <= 12;
  return gap === 12;
}

/** Flags UNIT_SUSPECT on both facts of an adjacent pair whose values differ by 1000x or more. */
function flagAdjacentMagnitudes(latest: Fact[]): void {
  const series = new Map<string, Fact[]>();
  for (const fact of latest) {
    const key = `${fact.isin}|${fact.scope}|${fact.metric}|${fact.periodType}`;
    series.set(key, [...(series.get(key) ?? []), fact]);
  }
  for (const facts of series.values()) {
    facts.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    for (let i = 1; i < facts.length; i++) {
      const [previous, current] = [facts[i - 1], facts[i]];
      if (!isAdjacent(current.periodType, previous.periodEnd, current.periodEnd)) continue;
      if (!flagMagnitudeSuspect(current.valueCr ?? 0, previous.valueCr)) continue;
      addFlag(previous, 'UNIT_SUSPECT');
      addFlag(current, 'UNIT_SUSPECT');
    }
  }
}

// --- quarter derivation ----------------------------------------

const INHERITED_FLAGS = ['UNIT_CONVERTED', 'UNIT_ASSUMED_CRORE', 'UNIT_SUSPECT', 'RESTATED', 'SIGN_UNUSUAL'];
const ROUND_DECIMALS = 1e9;

const weakerTier = (a: SourceTier, b: SourceTier): SourceTier =>
  TIER_STRENGTH.indexOf(a) >= TIER_STRENGTH.indexOf(b) ? a : b;

const isDiscrete = (fact: Fact, quarter: number): boolean =>
  fact.periodType === 'DISCRETE_Q' && quarterFor(fact.periodEnd) === quarter;

interface Cumulative { valueCr: number; inputs: Fact[]; label: string }

/** Cumulative value before `quarter`: the prior YTD fact, else the sum of the earlier discrete quarters. */
function cumulativeBefore(group: Fact[], quarter: number): Cumulative | undefined {
  const priorYtd = group.find(f => f.periodType === YTD_TYPES[quarter - 2]);
  if (priorYtd && priorYtd.valueCr !== null) {
    return { valueCr: priorYtd.valueCr, inputs: [priorYtd], label: priorYtd.periodType };
  }
  const earlier = [1, 2, 3].filter(n => n < quarter).map(n => group.find(f => isDiscrete(f, n)));
  if (earlier.some(f => !f || f.valueCr === null)) return undefined;
  const facts = earlier as Fact[];
  const total = facts.reduce((sum, f) => sum + (f.valueCr as number), 0);
  return { valueCr: total, inputs: facts, label: `discrete Q1..Q${quarter - 1}` };
}

function buildDerivedQuarter(current: Fact, prior: Cumulative | undefined, quarter: number): Fact {
  const inputs = prior ? [...prior.inputs, current] : [current];
  const flags = new Set(inputs.flatMap(f => f.qualityFlags.filter(flag => INHERITED_FLAGS.includes(flag))));
  const value = (current.valueCr as number) - (prior?.valueCr ?? 0);
  return {
    ...current,
    factId: `${current.factId}|derived`,
    periodType: 'DISCRETE_Q',
    periodStart: quarterStart(quarterEnd(current.periodEnd, quarter)),
    periodEnd: quarterEnd(current.periodEnd, quarter),
    valueCr: Math.round(value * ROUND_DECIMALS) / ROUND_DECIMALS,
    sourceTier: inputs.map(f => f.sourceTier).reduce(weakerTier),
    availableAt: inputs.map(f => f.availableAt).sort().at(-1) as string,
    vintage: Math.max(...inputs.map(f => f.vintage)),
    supersedesId: undefined,
    derivation: {
      formula: prior ? `${current.periodType} - ${prior.label}` : `${current.periodType} (first quarter)`,
      inputs: inputs.map(f => f.factId),
    },
    qualityFlags: [...flags, 'DERIVED'],
  };
}

/** Derives each missing discrete quarter from cumulative YTD facts of the latest vintage, per group. */
function deriveMissingQuarters(latest: Fact[]): Fact[] {
  const groups = new Map<string, Fact[]>();
  for (const fact of latest) {
    if (fact.periodType === 'POINT_IN_TIME') continue;
    const key = `${fact.isin}|${fact.scope}|${fact.metric}|${fiscalYearFor(fact.periodEnd)}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  const derived: Fact[] = [];
  for (const group of groups.values()) {
    for (const quarter of [1, 2, 3, 4]) {
      if (group.some(f => isDiscrete(f, quarter))) continue;
      const current = group.find(f => f.periodType === YTD_TYPES[quarter - 1]);
      if (!current || current.valueCr === null) continue;
      const prior = quarter === 1 ? undefined : cumulativeBefore(group, quarter);
      if (quarter > 1 && !prior) continue;
      derived.push(buildDerivedQuarter(current, prior, quarter));
    }
  }
  return derived;
}

// --- normalisation entry point ----------------------------------------

/**
 * Turns raw XBRL rows into facts. Every vintage of a restated fact is kept (v1, v2, ... linked by
 * supersedesId); identical re-filings add nothing. Rows that cannot be accepted are aggregated in the
 * rejection report and never throw.
 */
export function normalizeXbrlFacts(rows: RawXbrlFact[]): NormalizedFacts {
  const vintages = new Map<string, Fact[]>();
  const all: Fact[] = [];
  const rejected = new Map<string, RejectedFact>();
  const ordered = [...rows].sort(
    (a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.availableAt.localeCompare(b.availableAt),
  );
  for (const raw of ordered) {
    let accepted: AcceptedRow;
    try { accepted = acceptRow(raw); } catch (error) {
      addRejection(rejected, raw.metric, (error as Error).message);
      continue;
    }
    const candidate = buildFact(accepted, 1);
    const key = seriesKey(candidate);
    const history = vintages.get(key) ?? [];
    const previous = history.at(-1);
    if (previous && previous.valueCr === candidate.valueCr) continue;
    const fact = previous ? buildFact(accepted, history.length + 1) : candidate;
    if (previous) {
      fact.supersedesId = previous.factId;
      addFlag(fact, 'RESTATED');
      if (flagMagnitudeSuspect(fact.valueCr ?? 0, previous.valueCr)) addFlag(fact, 'RESTATEMENT_MAGNITUDE_JUMP');
    }
    vintages.set(key, [...history, fact]);
    all.push(fact);
  }
  const latest = latestVintages(all);
  flagAdjacentMagnitudes(latest);
  return { facts: [...all, ...deriveMissingQuarters(latest)], rejected: [...rejected.values()] };
}

// --- reconciliation ----------------------------------------

const isIndependentDiscrete = (fact: Fact | undefined, quarter: number): fact is Fact =>
  !!fact && isDiscrete(fact, quarter) && !fact.qualityFlags.includes('DERIVED');

interface ReconOutcome { ran: boolean; failures: Fact[][] }

/** Runs every applicable independent check of one metric/fiscal-year group. */
function checkGroup(group: Fact[], absolute: number, relative: number): ReconOutcome {
  const outcome: ReconOutcome = { ran: false, failures: [] };
  const value = (fact: Fact): number => fact.valueCr ?? 0;
  const tolerance = (reference: Fact): number => Math.max(absolute, Math.abs(value(reference)) * relative);
  const quarter = (n: number): Fact | undefined => group.find(f => isIndependentDiscrete(f, n));
  const ytd = (type: PeriodType): Fact | undefined => group.find(f => f.periodType === type);
  const checkSum = (total: Fact | undefined, parts: (Fact | undefined)[]): void => {
    if (!total || parts.some(p => !p)) return;
    const members = parts as Fact[];
    outcome.ran = true;
    const gap = Math.abs(members.reduce((sum, f) => sum + value(f), 0) - value(total));
    if (gap > tolerance(total)) outcome.failures.push([...members, total]);
  };
  checkSum(ytd('YTD_12M'), [quarter(1), quarter(2), quarter(3), quarter(4)]);
  checkSum(ytd('YTD_9M'), [quarter(1), quarter(2), quarter(3)]);
  checkSum(ytd('YTD_6M'), [quarter(1), quarter(2)]);
  checkSum(ytd('YTD_3M'), [quarter(1)]);
  checkDiscreteWithinYtd(group, quarter, ytd, tolerance, outcome);
  return outcome;
}

/** A discrete quarter of a never-negative metric cannot exceed the YTD ending the same day. */
function checkDiscreteWithinYtd(
  group: Fact[],
  quarter: (n: number) => Fact | undefined,
  ytd: (type: PeriodType) => Fact | undefined,
  tolerance: (reference: Fact) => number,
  outcome: ReconOutcome,
): void {
  if (!metricDefinition(group[0].metric)?.nonNegative) return;
  for (const n of [1, 2, 3, 4]) {
    const discrete = quarter(n);
    const cumulative = ytd(YTD_TYPES[n - 1]);
    if (!discrete || !cumulative) continue;
    outcome.ran = true;
    if ((discrete.valueCr ?? 0) > (cumulative.valueCr ?? 0) + tolerance(cumulative)) {
      outcome.failures.push([discrete, cumulative]);
    }
  }
}

/**
 * Reconciles the latest vintage of each flow group with independent checks: sum of four discrete quarters
 * = annual, Q1+Q2 = YTD_6M, Q1+Q2+Q3 = YTD_9M, Q1 = YTD_3M, discrete <= YTD (never-negative metrics).
 * Failing members get PERIOD_RECON_FAIL; a flow group where no check could run gets RECON_UNVERIFIED on
 * every member. Derived quarters never act as independent evidence. Point-in-time facts are untouched.
 */
export function reconcileDiscreteFacts(facts: Fact[], absolute = 0.05, relative = 0.001): Fact[] {
  const out = facts.map(fact => ({ ...fact, qualityFlags: [...fact.qualityFlags] }));
  const groups = new Map<string, Fact[]>();
  for (const fact of latestVintages(out)) {
    if (fact.periodType === 'POINT_IN_TIME') continue;
    const key = `${fact.isin}|${fact.scope}|${fact.metric}|${fiscalYearFor(fact.periodEnd)}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  for (const group of groups.values()) {
    const outcome = checkGroup(group, absolute, relative);
    for (const members of outcome.failures) members.forEach(fact => addFlag(fact, 'PERIOD_RECON_FAIL'));
    if (!outcome.ran) group.forEach(fact => addFlag(fact, 'RECON_UNVERIFIED'));
  }
  return out;
}
