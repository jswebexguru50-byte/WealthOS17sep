import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPeriod, normalizeXbrlFacts, reconcileDiscreteFacts } from '../../src/server/research_v2/facts/xbrlPeriods.js';
import { canonicalMetric } from '../../src/server/research_v2/facts/metricDefinitions.js';
import { convertUnit } from '../../src/server/research_v2/facts/units.js';

const raw = (contextRef: string, periodEnd: string, value: number, metric = 'sales', periodStart = periodEnd) => ({ factId: `${contextRef}-${periodEnd}-${value}`, isin: 'INE000000000', symbol: 'YUKEN', scope: 'CONSOLIDATED' as const, metric, value, unit: 'INR', contextRef, periodStart, periodEnd, source: 'XBRL', sourceRef: 'fixture', availableAt: '2026-10-10T00:00:00Z' });

test('classifies OneD as a discrete quarter and FourD as YTD', () => {
  assert.equal(classifyPeriod(raw('OneD', '2024-09-30', 1156571000)), 'DISCRETE_Q');
  assert.equal(classifyPeriod(raw('FourD', '2024-09-30', 2258588000)), 'YTD_6M');
  assert.equal(classifyPeriod(raw('OneD', '2024-09-30', 1, 'equity_total')), 'POINT_IN_TIME');
});

test('YUKEN FY25 sales remain discrete and reconcile to annual', () => {
  const rows = [raw('OneD','2024-06-30',1102000000), raw('OneD','2024-09-30',1156571000), raw('OneD','2024-12-31',1068465000), raw('OneD','2025-03-31',1246510000), raw('FourD','2025-03-31',4573563000)];
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows));
  const quarters = facts.filter(f => f.periodType === 'DISCRETE_Q');
  assert.deepEqual(quarters.map(f => Number((f.valueCr || 0).toFixed(4))), [110.2, 115.6571, 106.8465, 124.651]);
  assert.ok(facts.every(f => !f.qualityFlags.includes('PERIOD_RECON_FAIL')));
  assert.notEqual(facts.find(f => f.periodEnd === '2024-09-30')?.valueCr, 225.8588);
});

test('reconciliation flags a broken annual total', () => {
  const rows = [raw('OneD','2024-06-30',100000000), raw('OneD','2024-09-30',100000000), raw('OneD','2024-12-31',100000000), raw('OneD','2025-03-31',100000000), raw('FourD','2025-03-31',900000000)];
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows));
  assert.equal(facts.filter(f => f.qualityFlags.includes('PERIOD_RECON_FAIL')).length, 5);
});

test('units convert rupees to crore and reject unknown units', () => {
  assert.equal(convertUnit(123000000, 'INR').value, 12.3);
  assert.equal(convertUnit(12.5, 'PERCENT').unit, 'PCT');
  assert.equal(convertUnit(0.25, 'FRACTION').unit, 'RATIO');
  assert.throws(() => convertUnit(1, 'UNKNOWN'), /UNIT_UNSUPPORTED/);
});

test('canonical aliases separate total income from revenue', () => {
  assert.equal(canonicalMetric('Revenue'), 'revenue_from_operations');
  assert.equal(canonicalMetric('Total Rev.'), 'total_income');
  assert.equal(canonicalMetric('PAT'), 'pat_total');
});
