import { classifyPeriod, normalizeXbrlFacts, reconcileDiscreteFacts } from './src/server/research_v2/facts/xbrlPeriods.js';
import { convertUnit, flagMagnitudeSuspect } from './src/server/research_v2/facts/units.js';
const raw = (ctx: string, end: string, value: number, metric = 'pat', start = end, id?: string, avail = '2025-01-01T00:00:00Z', unit = 'INR') =>
  ({ factId: id || `${ctx}-${end}-${value}-${avail}`, isin: 'I', symbol: 'S', scope: 'CONSOLIDATED' as const, metric, value, unit, contextRef: ctx, periodStart: start, periodEnd: end, source: 'x', sourceRef: 'x', availableAt: avail });
const show = (label: string, fn: () => unknown) => { try { console.log('PROBE', label, '=>', JSON.stringify(fn())); } catch (e: any) { console.log('PROBE', label, '=> THROWS', e.message); } };

show('1 Q1 FourD classified as', () => classifyPeriod(raw('FourD', '2024-06-30', 1e9)));
show('2 VMART-style: Jun YTD + Sep YTD only (no OneD for Sep) -> any discrete Sep derived?', () =>
  normalizeXbrlFacts([raw('OneD', '2025-06-30', 336000000), raw('FourD', '2025-09-30', 247300000)]).map(f => [f.periodType, f.periodEnd, f.valueCr]));
show('3 Q4 missing OneD, has annual + 9M YTD -> Q4 derived?', () =>
  normalizeXbrlFacts([raw('FourD', '2024-12-31', 3327053000), raw('FourD', '2025-03-31', 4573563000)]).map(f => [f.periodType, f.periodEnd, f.valueCr, f.derivation ? 'DERIVED' : 'raw']));
show('4 unit INR_CR (already crore)', () => convertUnit(12.3, 'INR_CR'));
show('5 unit PERCENTAGE', () => convertUnit(58.04, 'PERCENTAGE'));
show('6 magnitude flag wired into normalize? (1.3e13 vs 1.36e8 equity)', () => {
  const f = normalizeXbrlFacts([raw('OneD', '2025-03-31', 1.3e13, 'equity_capital'), raw('OneD', '2026-03-31', 1.36e8, 'equity_capital')]);
  return { flags: f.map(x => x.qualityFlags), helperWorks: flagMagnitudeSuspect(1.3e13, 1.36e8) };
});
show('7 restatement duplicate of Q2 -> five quarters; recon silent?', () => {
  const rows = [raw('OneD', '2024-06-30', 100000000), raw('OneD', '2024-09-30', 100000000), raw('OneD', '2024-09-30', 100000000, 'pat', '2024-09-30', 'restated', '2025-02-01T00:00:00Z'),
    raw('OneD', '2024-12-31', 100000000), raw('OneD', '2025-03-31', 100000000), raw('FourD', '2025-03-31', 900000000)];
  const out = reconcileDiscreteFacts(normalizeXbrlFacts(rows));
  return { nFacts: out.length, flagged: out.filter(f => f.qualityFlags.includes('PERIOD_RECON_FAIL')).length, vintages: out.map(f => f.vintage) };
});
show('8 YTD_6M = Q1 + Q2 check present? (Q1=100,Q2=100,YTD6M=500)', () => {
  const out = reconcileDiscreteFacts(normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9), raw('OneD', '2024-09-30', 1e9), raw('FourD', '2024-09-30', 5e9)]));
  return out.map(f => f.qualityFlags);
});
show('9 discrete > YTD check present? (Q3 discrete 9, YTD_9M 5)', () => {
  const out = reconcileDiscreteFacts(normalizeXbrlFacts([raw('OneD', '2024-12-31', 9e9), raw('FourD', '2024-12-31', 5e9)]));
  return out.map(f => f.qualityFlags);
});
show('10 unknown context_ref', () => classifyPeriod(raw('TwoD', '2024-06-30', 1)));
show('11 capex / lease / payables / public_pct in metric vocabulary?', () => ['capex_cash_outflow', 'lease_liabilities', 'trade_payables', 'public_pct', 'total_assets'].map(m => [m, normalizeXbrlFacts([raw('OneD', '2024-06-30', 1, m)])[0].periodType]));
show('12 capex classified as (flow expected)', () => classifyPeriod(raw('OneD', '2024-06-30', 1, 'capex')));
show('13 FourD YTD periodStart rewritten to FY start?', () => normalizeXbrlFacts([raw('FourD', '2024-09-30', 1e9, 'pat', '2024-07-01')]).map(f => [f.periodType, f.periodStart]));
show('14 Mar FY mapping: Jan-Mar 2025 belongs to FY24-25 (start 2024-04-01)', () => normalizeXbrlFacts([raw('FourD', '2025-03-31', 1e9, 'pat', '2025-01-01')]).map(f => f.periodStart));
