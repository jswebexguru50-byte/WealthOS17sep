import { classifyPeriod, normalizeXbrlFacts, reconcileDiscreteFacts } from './src/server/research_v2/facts/xbrlPeriods.js';
const raw = (ctx: string, end: string, value: number, metric = 'pat', start = end, scope: 'CONSOLIDATED' | 'STANDALONE' = 'CONSOLIDATED', avail = '2025-01-01T00:00:00Z', isin = 'I', unit = 'INR') =>
  ({ factId: `${isin}-${scope}-${metric}-${ctx}-${end}-${value}`, isin, symbol: 'S', scope, metric, value, unit, contextRef: ctx, periodStart: start, periodEnd: end, source: 'FERE', sourceRef: 'x', availableAt: avail });
const show = (label: string, fn: () => unknown) => { try { console.log('PROBE', label, '=>', JSON.stringify(fn())); } catch (e: any) { console.log('PROBE', label, '=> THROWS', e.message); } };
const brief = (fs: any[]) => fs.map(f => `${f.metric}/${f.scope}/${f.periodType}/${f.periodEnd}=${Number((f.valueCr ?? 0).toFixed(4))}${f.qualityFlags.includes('DERIVED') ? '[D]' : ''}`);

show('A Q3 derivation: Q1=100,Q2 discrete=100 (OneD), YTD_6M=200, YTD_9M=330 -> expected Q3=130 (YTD9M - YTD6M)', () => {
  const o = normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9), raw('OneD', '2024-09-30', 1e9), raw('FourD', '2024-09-30', 2e9), raw('FourD', '2024-12-31', 3.3e9)]);
  return brief(o.filter(f => f.periodEnd === '2024-12-31'));
});
show('B Q3 derivation when Q2 has NO OneD but Q1 discrete + YTD6M + YTD9M -> expected Q2=100(derived) and Q3=130', () =>
  brief(normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9), raw('FourD', '2024-09-30', 2e9), raw('FourD', '2024-12-31', 3.3e9)]).filter(f => f.qualityFlags.includes('DERIVED'))));
show('C cross-metric contamination: PAT has Q1 + YTD6M (needs derived Q2); SALES has Q2 OneD present. Is PAT Q2 derived?', () =>
  brief(normalizeXbrlFacts([raw('OneD', '2025-06-30', 336000000, 'pat'), raw('FourD', '2025-09-30', 247300000, 'pat'), raw('OneD', '2025-09-30', 5e9, 'sales')]).filter(f => f.metric === 'pat_total')));
show('D cross-metric: SALES Q1 = 5000, PAT YTD6M only (no PAT Q1) -> must NOT derive PAT Q2 from sales Q1', () =>
  brief(normalizeXbrlFacts([raw('OneD', '2025-06-30', 5e10, 'sales'), raw('FourD', '2025-09-30', 247300000, 'pat')]).filter(f => f.metric === 'pat_total')));
show('E cross-scope: STANDALONE Q1 present, CONSOLIDATED YTD6M only -> must NOT derive consolidated Q2 from standalone Q1', () =>
  brief(normalizeXbrlFacts([raw('OneD', '2025-06-30', 336000000, 'pat', '2025-06-30', 'STANDALONE'), raw('FourD', '2025-09-30', 247300000, 'pat', '2025-09-30', 'CONSOLIDATED')]).filter(f => f.scope === 'CONSOLIDATED')));
show('F Q4 derivation suppressed by an unrelated Q4 discrete (other metric)', () =>
  brief(normalizeXbrlFacts([raw('FourD', '2024-12-31', 3327053000, 'pat'), raw('FourD', '2025-03-31', 4573563000, 'pat'), raw('OneD', '2025-03-31', 1, 'sales')]).filter(f => f.metric === 'pat_total')));
show('G Q4 derivation suppressed by an unrelated Q4 in another fiscal year', () =>
  brief(normalizeXbrlFacts([raw('OneD', '2024-03-31', 1e9, 'pat'), raw('FourD', '2024-12-31', 3327053000, 'pat'), raw('FourD', '2025-03-31', 4573563000, 'pat')]).filter(f => f.qualityFlags.includes('DERIVED'))));
show('H derived-quarter periodStart (Q2 expected 2025-07-01; Q4 expected FY-Q4 start Jan 1)', () => normalizeXbrlFacts([raw('OneD', '2025-06-30', 336000000), raw('FourD', '2025-09-30', 247300000)]).filter(f => f.qualityFlags.includes('DERIVED')).map(f => [f.periodType, f.periodStart, f.periodEnd]));
show('I identical duplicate row from another filing flagged RESTATED? (should NOT be)', () =>
  normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9, 'pat', '2024-04-01', 'CONSOLIDATED', '2024-08-01T00:00:00Z'), raw('OneD', '2024-06-30', 1e9, 'pat', '2024-04-01', 'CONSOLIDATED', '2024-09-01T00:00:00Z')]).map(f => [f.vintage, f.qualityFlags, f.supersedesId ? 'supersedes' : '-']));
show('J genuine restatement flagged RESTATED and history retained? (count of outputs)', () => {
  const o = normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9, 'pat', '2024-04-01', 'CONSOLIDATED', '2024-08-01T00:00:00Z'), raw('OneD', '2024-06-30', 1.2e9, 'pat', '2024-04-01', 'CONSOLIDATED', '2024-12-01T00:00:00Z')]);
  return { outputs: o.length, vintages: o.map(f => f.vintage), flags: o.map(f => f.qualityFlags) };
});
show('K magnitude across ADJACENT periods (YUKEN equity_capital 1.3e13 FY25 vs 1.36e8 FY26)', () =>
  normalizeXbrlFacts([raw('OneD', '2025-03-31', 1.3e13, 'equity_capital'), raw('OneD', '2026-03-31', 1.36e8, 'equity_capital')]).map(f => f.qualityFlags));
show('L magnitude across adjacent QUARTERS flow (PAT 5e9 then 5e6 next quarter)', () =>
  normalizeXbrlFacts([raw('OneD', '2024-06-30', 5e9), raw('OneD', '2024-09-30', 5e6)]).map(f => f.qualityFlags));
show('M balance-sheet facts get RECON_UNVERIFIED noise?', () => reconcileDiscreteFacts(normalizeXbrlFacts([raw('OneD', '2025-03-31', 1.36e8, 'equity_total')])).map(f => f.qualityFlags));
show('N partial year (Q1,Q2 + YTD6M broken) still checked?', () =>
  reconcileDiscreteFacts(normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9), raw('OneD', '2024-09-30', 1e9), raw('FourD', '2024-09-30', 5e9)])).map(f => f.qualityFlags));
show('O Q1 FourD equals OneD duplicate: emitted as YTD_3M (ok) and recon passes?', () =>
  reconcileDiscreteFacts(normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9), raw('FourD', '2024-06-30', 1e9)])).map(f => [f.periodType, f.qualityFlags]));
show('P tier from raw: Trendlyne-labelled source gets tier?', () => normalizeXbrlFacts([{ ...raw('OneD', '2024-06-30', 12.3, 'pat', '2024-04-01', 'CONSOLIDATED', '2024-08-01T00:00:00Z', 'I', 'INR'), source: 'TRENDLYNE_MCP' }]).map(f => [f.sourceTier, f.valueCr, f.unit]));
show('Q default tier when raw has none', () => normalizeXbrlFacts([raw('OneD', '2024-06-30', 1e9)]).map(f => f.sourceTier));
show('R metric alias capex / sales / finance_costs map', () => ['capex', 'sales', 'finance_costs', 'materials_cost', 'equity_capital', 'reserves', 'operating_profit'].map(m => { try { return [m, classifyPeriod(raw('OneD', '2024-06-30', 1, m))]; } catch (e: any) { return [m, 'THROWS ' + e.message]; } }));
show('S unit: unknown string and non-finite', () => { try { return normalizeXbrlFacts([{ ...raw('OneD', '2024-06-30', 1), unit: 'USD' }]); } catch (e: any) { return e.message; } });
