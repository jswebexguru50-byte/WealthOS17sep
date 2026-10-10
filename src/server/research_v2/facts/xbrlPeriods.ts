import type { Fact, PeriodType, RawXbrlFact } from '../domain/types.js';
import { canonicalMetric, metricDefinition } from './metricDefinitions.js';
import { convertUnit, flagMagnitudeSuspect } from './units.js';

export interface RejectedFact { rawMetric: string; reason: string; count: number; }
export interface NormalizedFacts { facts: Fact[]; rejected: RejectedFact[]; }

export const quarterFor = (date: string): number => {
  const month = Number(date.slice(5, 7));
  return month === 6 ? 1 : month === 9 ? 2 : month === 12 ? 3 : month === 3 ? 4 : 0;
};
export const fiscalYearFor = (date: string): number => Number(date.slice(5, 7)) >= 4 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1;
export const fiscalYearStart = (date: string): string => `${fiscalYearFor(date)}-04-01`;
export const quarterStart = (date: string): string => {
  const year = fiscalYearFor(date); const q = quarterFor(date);
  return q === 1 ? `${year}-04-01` : q === 2 ? `${year}-07-01` : q === 3 ? `${year}-10-01` : `${year + 1}-01-01`;
};
const quarterEnd = (date: string, q: number): string => {
  const year = fiscalYearFor(date);
  return q === 1 ? `${year}-06-30` : q === 2 ? `${year}-09-30` : q === 3 ? `${year}-12-31` : `${year + 1}-03-31`;
};
const ytdType = (date: string): PeriodType => ({ 1: 'YTD_3M', 2: 'YTD_6M', 3: 'YTD_9M', 4: 'YTD_12M' } as Record<number, PeriodType>)[quarterFor(date)] || 'YTD_12M';

export function classifyPeriod(raw: RawXbrlFact): PeriodType {
  const definition = metricDefinition(raw.metric);
  if (!definition) throw new Error(`METRIC_UNMAPPED:${raw.metric}`);
  if (definition.periodBasis === 'POINT_IN_TIME') return 'POINT_IN_TIME';
  if (raw.contextRef === 'OneD') return 'DISCRETE_Q';
  if (raw.contextRef === 'FourD') return ytdType(raw.periodEnd);
  throw new Error(`XBRL_CONTEXT_UNSUPPORTED:${raw.contextRef}`);
}

const key = (raw: RawXbrlFact, period: PeriodType): string => `${raw.isin}|${raw.scope}|${canonicalMetric(raw.metric)}|${period}|${raw.periodEnd}`;
const factId = (raw: RawXbrlFact, period: PeriodType, vintage: number): string => `${key(raw, period)}|v${vintage}`;

function makeFact(raw: RawXbrlFact, period: PeriodType, vintage: number, flags: string[] = [], derivation?: Fact['derivation']): Fact {
  const converted = convertUnit(raw.value, raw.unit, raw.source.toUpperCase().includes('TRENDLYNE'));
  return {
    factId: factId(raw, period, vintage), isin: raw.isin, symbol: raw.symbol, scope: raw.scope,
    metric: canonicalMetric(raw.metric), periodType: period,
    periodStart: period === 'POINT_IN_TIME' ? raw.periodEnd : period === 'DISCRETE_Q' ? raw.periodStart : fiscalYearStart(raw.periodEnd),
    periodEnd: raw.periodEnd, valueCr: converted.value, unit: converted.unit,
    sourceTier: raw.sourceTier as any, source: raw.source, sourceRef: raw.sourceRef,
    availableAt: raw.availableAt, vintage, derivation,
    qualityFlags: [...flags, ...(converted.derivation ? ['UNIT_CONVERTED'] : [])], quarantined: false,
  };
}

export function normalizeXbrlFacts(rows: RawXbrlFact[]): NormalizedFacts {
  const latest = new Map<string, { fact: Fact; rawValue: number }>();
  const rejected = new Map<string, RejectedFact>();
  const sorted = [...rows].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.availableAt.localeCompare(b.availableAt));
  for (const raw of sorted) {
    let period: PeriodType;
    try { period = classifyPeriod(raw); } catch (error) {
      const reason = String((error as Error).message || error); const prior = rejected.get(raw.metric) || { rawMetric: raw.metric, reason, count: 0 };
      rejected.set(raw.metric, { ...prior, count: prior.count + 1 }); continue;
    }
    if (!raw.sourceTier) { const prior = rejected.get(raw.metric) || { rawMetric: raw.metric, reason: 'SOURCE_TIER_REQUIRED', count: 0 }; rejected.set(raw.metric, { ...prior, count: prior.count + 1 }); continue; }
    const existing = latest.get(key(raw, period));
    const sameValue = existing && existing.rawValue === raw.value;
    const vintage = existing ? existing.fact.vintage + (sameValue ? 0 : 1) : (raw.vintage || 1);
    if (existing && sameValue) continue;
    const flags = existing && !sameValue ? ['RESTATED'] : [];
    const fact = makeFact(raw, period, vintage, flags);
    if (existing) fact.supersedesId = existing.fact.factId;
    if (existing && flagMagnitudeSuspect(raw.value, existing.rawValue)) fact.qualityFlags.push('UNIT_SUSPECT');
    latest.set(key(raw, period), { fact, rawValue: raw.value });
  }
  const facts = deriveMissingQuarters([...latest.values()].map(item => item.fact));
  return { facts, rejected: [...rejected.values()] };
}

function deriveMissingQuarters(facts: Fact[]): Fact[] {
  const out = [...facts];
  const groups = new Map<string, Fact[]>();
  for (const fact of facts) { const groupKey = `${fact.isin}|${fact.scope}|${fact.metric}|${fiscalYearFor(fact.periodEnd)}`; groups.set(groupKey, [...(groups.get(groupKey) || []), fact]); }
  for (const group of groups.values()) {
    const ytd = (period: PeriodType) => group.find(f => f.periodType === period);
    const q = (quarter: number) => group.find(f => f.periodType === 'DISCRETE_Q' && quarterFor(f.periodEnd) === quarter);
    const derive = (period: PeriodType, quarter: number, current: Fact | undefined, previous: Fact | undefined) => {
      if (!current || !previous || q(quarter)) return;
      out.push({ ...current, factId: `${current.factId}|derived`, periodType: 'DISCRETE_Q', periodStart: quarterStart(current.periodEnd), periodEnd: quarterEnd(current.periodEnd, quarter), valueCr: (current.valueCr || 0) - (previous.valueCr || 0), derivation: { formula: `${period} − previous cumulative YTD`, inputs: [previous.factId, current.factId] }, qualityFlags: [...current.qualityFlags, 'DERIVED'] });
    };
    derive('YTD_3M', 1, ytd('YTD_3M'), undefined);
    derive('YTD_6M', 2, ytd('YTD_6M'), ytd('YTD_3M') || q(1));
    derive('YTD_9M', 3, ytd('YTD_9M'), ytd('YTD_6M'));
    derive('YTD_12M', 4, ytd('YTD_12M'), ytd('YTD_9M'));
  }
  return out;
}

export function reconcileDiscreteFacts(facts: Fact[], absolute = 0.05, relative = 0.001): Fact[] {
  const out = facts.map(f => ({ ...f, qualityFlags: [...f.qualityFlags] }));
  const mark = (items: Fact[], flag: string) => items.forEach(item => { if (!item.qualityFlags.includes(flag)) item.qualityFlags.push(flag); });
  const groups = new Map<string, Fact[]>();
  for (const fact of out) { if (fact.periodType === 'POINT_IN_TIME') continue; const k = `${fact.isin}|${fact.scope}|${fact.metric}|${fiscalYearFor(fact.periodEnd)}`; groups.set(k, [...(groups.get(k) || []), fact]); }
  for (const group of groups.values()) {
    const q = (n: number) => group.find(f => f.periodType === 'DISCRETE_Q' && quarterFor(f.periodEnd) === n);
    const annual = group.find(f => f.periodType === 'YTD_12M'); const y6 = group.find(f => f.periodType === 'YTD_6M'); const y9 = group.find(f => f.periodType === 'YTD_9M');
    if (annual && q(1) && q(2) && q(3) && q(4) && Math.abs((q(1)!.valueCr || 0) + (q(2)!.valueCr || 0) + (q(3)!.valueCr || 0) + (q(4)!.valueCr || 0) - (annual.valueCr || 0)) > Math.max(absolute, Math.abs(annual.valueCr || 0) * relative)) mark([q(1)!, q(2)!, q(3)!, q(4)!, annual], 'PERIOD_RECON_FAIL');
    if (y6 && q(1) && q(2) && Math.abs((q(1)!.valueCr || 0) + (q(2)!.valueCr || 0) - (y6.valueCr || 0)) > Math.max(absolute, Math.abs(y6.valueCr || 0) * relative)) mark([q(1)!, q(2)!, y6], 'PERIOD_RECON_FAIL');
    if (y9 && q(1) && q(2) && q(3) && Math.abs((q(1)!.valueCr || 0) + (q(2)!.valueCr || 0) + (q(3)!.valueCr || 0) - (y9.valueCr || 0)) > Math.max(absolute, Math.abs(y9.valueCr || 0) * relative)) mark([q(1)!, q(2)!, q(3)!, y9], 'PERIOD_RECON_FAIL');
    for (const ytd of group.filter(f => f.periodType.startsWith('YTD_'))) { const quarter = q(quarterFor(ytd.periodEnd)); if (quarter && quarter.valueCr !== null && ytd.valueCr !== null && quarter.valueCr > ytd.valueCr + Math.max(absolute, Math.abs(ytd.valueCr) * relative)) mark([quarter, ytd], 'PERIOD_RECON_FAIL'); }
  }
  return out;
}
