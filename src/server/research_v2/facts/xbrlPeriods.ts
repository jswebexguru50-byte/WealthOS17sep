import type { Fact, PeriodType, RawXbrlFact } from '../domain/types.js';
import { canonicalMetric } from './metricDefinitions.js';
import { convertUnit } from './units.js';

const FLOW_METRICS = new Set(['revenue_from_operations','other_income','total_income','pbt_before_exceptional','exceptional_items','pbt','tax_expense','pat_total','pat_attributable_to_owners','finance_cost','depreciation_amortisation','cfo','ebitda_derived']);
const quarterFor = (date: string) => { const month = Number(date.slice(5, 7)); return month === 6 ? 1 : month === 9 ? 2 : month === 12 ? 3 : month === 3 ? 4 : 0; };
const fyFor = (date: string) => { const year = Number(date.slice(0, 4)); return Number(date.slice(5, 7)) >= 4 ? year : year - 1; };
const fyStart = (date: string) => `${fyFor(date)}-04-01`;
const ytdType = (date: string): PeriodType => ({ 1: 'YTD_6M', 2: 'YTD_6M', 3: 'YTD_9M', 4: 'YTD_12M' } as any)[quarterFor(date)] || 'YTD_12M';

export function classifyPeriod(raw: RawXbrlFact): PeriodType {
  if (!FLOW_METRICS.has(canonicalMetric(raw.metric))) return 'POINT_IN_TIME';
  if (raw.contextRef === 'OneD') return 'DISCRETE_Q';
  if (raw.contextRef === 'FourD') return ytdType(raw.periodEnd);
  throw new Error(`XBRL_CONTEXT_UNSUPPORTED:${raw.contextRef}`);
}

function makeFact(raw: RawXbrlFact, periodType: PeriodType, value: number, flags: string[] = [], derivation?: Fact['derivation']): Fact {
  const converted = convertUnit(value, raw.unit);
  return { factId: raw.factId, isin: raw.isin, symbol: raw.symbol, scope: raw.scope, metric: canonicalMetric(raw.metric), periodType, periodStart: periodType === 'POINT_IN_TIME' ? raw.periodEnd : periodType === 'DISCRETE_Q' ? raw.periodStart : fyStart(raw.periodEnd), periodEnd: raw.periodEnd, valueCr: converted.value, unit: converted.unit, sourceTier: 'STATUTORY', source: raw.source, sourceRef: raw.sourceRef, availableAt: raw.availableAt, vintage: raw.vintage || 1, derivation, qualityFlags: [...flags, ...(converted.derivation ? ['UNIT_CONVERTED'] : [])], quarantined: false };
}

export function normalizeXbrlFacts(rows: RawXbrlFact[]): Fact[] {
  const ordered = [...rows].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.availableAt.localeCompare(b.availableAt));
  const result: Fact[] = [];
  for (const raw of ordered) result.push(makeFact(raw, classifyPeriod(raw), raw.value));
  return result;
}

export function reconcileDiscreteFacts(facts: Fact[], toleranceAbsolute = 0.05, toleranceRelative = 0.001): Fact[] {
  const out = facts.map(f => ({ ...f, qualityFlags: [...f.qualityFlags] }));
  const groups = new Map<string, Fact[]>();
  for (const fact of out) { const key = `${fact.isin}|${fact.scope}|${fact.metric}|${fyFor(fact.periodEnd)}`; const list = groups.get(key) || []; list.push(fact); groups.set(key, list); }
  for (const list of groups.values()) {
    const quarters = list.filter(f => f.periodType === 'DISCRETE_Q');
    const annual = list.find(f => f.periodType === 'YTD_12M' && quarterFor(f.periodEnd) === 4);
    if (annual && quarters.length === 4 && annual.valueCr !== null) { const sum = quarters.reduce((s, f) => s + (f.valueCr || 0), 0); const diff = Math.abs(sum - annual.valueCr); if (diff > Math.max(toleranceAbsolute, Math.abs(annual.valueCr) * toleranceRelative)) { for (const f of [...quarters, annual]) if (!f.qualityFlags.includes('PERIOD_RECON_FAIL')) f.qualityFlags.push('PERIOD_RECON_FAIL'); } }
  }
  return out;
}
