import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fiscalYearFor, isQuarterEnd, latestVintages, normalizeXbrlFacts, quarterFor, quarterStart,
  reconcileDiscreteFacts,
} from '../../../src/server/research_v2/facts/xbrlPeriods.js';
import { alignToMetricUnit, convertUnit, flagMagnitudeSuspect } from '../../../src/server/research_v2/facts/units.js';
import { METRIC_DEFINITIONS, RAW_METRIC_MAP, canonicalMetric } from '../../../src/server/research_v2/facts/metricDefinitions.js';
import { crore, raw } from './helpers.js';

const flagsOf = (facts: { qualityFlags: string[] }[]) =>
  facts.map(f => f.qualityFlags.filter(flag => flag.startsWith('RECON_') || flag.startsWith('PERIOD_')));

// --- 1. vintages -----------------------------------------------------------------------------------------

test('every vintage of a restated fact is retained and linked by supersedesId', () => {
  const rows = [
    raw('OneD', '2025-03-31', crore(100), 'sales', { availableAt: '2025-05-01T00:00:00Z' }),
    raw('OneD', '2025-03-31', crore(120), 'sales', { availableAt: '2025-08-01T00:00:00Z' }),
    raw('OneD', '2025-03-31', crore(130), 'sales', { availableAt: '2025-11-01T00:00:00Z' }),
  ];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.deepEqual(facts.map(f => f.vintage), [1, 2, 3]);
  assert.equal(facts[1].supersedesId, facts[0].factId);
  assert.equal(facts[2].supersedesId, facts[1].factId);
  assert.ok(!facts[0].qualityFlags.includes('RESTATED'));
  assert.ok(facts[1].qualityFlags.includes('RESTATED') && facts[2].qualityFlags.includes('RESTATED'));
  assert.equal(new Set(facts.map(f => f.factId)).size, 3);
});

test('latestVintages returns only the newest vintage per key', () => {
  const rows = [
    raw('OneD', '2025-03-31', crore(100), 'sales', { availableAt: '2025-05-01T00:00:00Z' }),
    raw('OneD', '2025-03-31', crore(120), 'sales', { availableAt: '2025-08-01T00:00:00Z' }),
    raw('OneD', '2024-12-31', crore(90), 'sales'),
  ];
  const latest = latestVintages(normalizeXbrlFacts(rows).facts);
  assert.equal(latest.length, 2);
  assert.equal(latest.find(f => f.periodEnd === '2025-03-31')?.valueCr, 120);
});

test('an identical re-filing adds no vintage and no RESTATED flag', () => {
  const rows = [
    raw('OneD', '2025-03-31', crore(100), 'sales', { availableAt: '2025-05-01T00:00:00Z' }),
    raw('OneD', '2025-03-31', crore(100), 'sales', { availableAt: '2025-06-01T00:00:00Z' }),
  ];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.equal(facts.length, 1);
  assert.equal(facts[0].vintage, 1);
  assert.ok(!facts[0].qualityFlags.includes('RESTATED'));
});

test('derived quarters are built from the latest vintage of their inputs', () => {
  const rows = [
    raw('FourD', '2025-09-30', crore(50), 'pat', { availableAt: '2025-11-01T00:00:00Z' }),
    raw('FourD', '2025-09-30', crore(60), 'pat', { availableAt: '2025-12-01T00:00:00Z' }),
    raw('FourD', '2025-06-30', crore(20), 'pat'),
  ];
  const derived = normalizeXbrlFacts(rows).facts.find(f => f.periodType === 'DISCRETE_Q' && f.periodEnd === '2025-09-30');
  assert.equal(derived?.valueCr, 40);
});

// --- 2. adjacent-period magnitude --------------------------------------------------------------------------

test('YUKEN equity_capital 1.3e13 INR (FY25) vs 1.36e8 INR (FY26) is flagged on the adjacent-year pair', () => {
  const rows = [
    raw('OneD', '2025-03-31', 1.3e13, 'equity_capital'),
    raw('OneD', '2026-03-31', 1.36e8, 'equity_capital'),
  ];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.equal(facts.length, 2);
  assert.ok(facts.every(f => f.qualityFlags.includes('UNIT_SUSPECT')));
  assert.ok(facts.every(f => !f.qualityFlags.includes('RESTATEMENT_MAGNITUDE_JUMP')));
});

test('a flow value that drops 1000x in the next quarter is flagged (PAT 5e9 then 5e6)', () => {
  const rows = [raw('OneD', '2025-06-30', 5e9, 'pat'), raw('OneD', '2025-09-30', 5e6, 'pat')];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.ok(facts.every(f => f.qualityFlags.includes('UNIT_SUSPECT')));
});

test('magnitude guard ignores non-adjacent periods, ordinary moves and other metrics', () => {
  const rows = [
    raw('OneD', '2024-06-30', 5e9, 'pat'), raw('OneD', '2025-06-30', 5e6, 'pat'),
    raw('OneD', '2025-09-30', 5e8, 'sales'), raw('OneD', '2025-12-31', 6e8, 'sales'),
    raw('OneD', '2025-09-30', 5e5, 'finance_costs'),
  ];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.ok(facts.every(f => !f.qualityFlags.includes('UNIT_SUSPECT')));
});

test('magnitude guard never crosses scopes', () => {
  const rows = [
    raw('OneD', '2025-06-30', 5e9, 'pat'),
    raw('OneD', '2025-09-30', 5e6, 'pat', { scope: 'STANDALONE' }),
  ];
  assert.ok(normalizeXbrlFacts(rows).facts.every(f => !f.qualityFlags.includes('UNIT_SUSPECT')));
});

test('flagMagnitudeSuspect ignores zero and null neighbours', () => {
  assert.equal(flagMagnitudeSuspect(5, 0), false);
  assert.equal(flagMagnitudeSuspect(5, null), false);
  assert.equal(flagMagnitudeSuspect(0, 5), false);
  assert.equal(flagMagnitudeSuspect(1000, 1), true);
  assert.equal(flagMagnitudeSuspect(999, 1), false);
});

// --- 3. RECON_UNVERIFIED -----------------------------------------------------------------------------------

test('a lone flow fact gets RECON_UNVERIFIED', () => {
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts([raw('OneD', '2025-06-30', crore(10))]).facts);
  assert.deepEqual(flagsOf(facts), [['RECON_UNVERIFIED']]);
});

test('four quarters without any YTD cannot be verified and are flagged', () => {
  const rows = ['2024-06-30', '2024-09-30', '2024-12-31', '2025-03-31'].map(d => raw('OneD', d, crore(10)));
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows).facts);
  assert.ok(facts.every(f => f.qualityFlags.includes('RECON_UNVERIFIED')));
});

test('derived quarters cannot verify their own inputs (all flagged RECON_UNVERIFIED)', () => {
  const rows = [raw('FourD', '2024-12-31', crore(300)), raw('FourD', '2025-03-31', crore(400))];
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows).facts);
  assert.ok(facts.length >= 3);
  assert.ok(facts.every(f => f.qualityFlags.includes('RECON_UNVERIFIED')));
});

test('a verifiable group is not flagged and point-in-time facts never are', () => {
  const rows = [
    raw('OneD', '2024-06-30', crore(10)), raw('FourD', '2024-06-30', crore(10)),
    raw('OneD', '2025-03-31', crore(7), 'equity_capital'),
  ];
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows).facts);
  assert.ok(facts.every(f => !f.qualityFlags.includes('RECON_UNVERIFIED')));
  const lonePit = reconcileDiscreteFacts(normalizeXbrlFacts([rows[2]]).facts);
  assert.deepEqual(flagsOf(lonePit), [[]]);
});

test('reconciliation judges the latest vintage, not the superseded one', () => {
  const quarters = ['2024-06-30', '2024-09-30', '2024-12-31', '2025-03-31'];
  const rows = [
    ...quarters.map(d => raw('OneD', d, crore(100))),
    raw('FourD', '2025-03-31', crore(900), 'sales', { availableAt: '2026-01-01T00:00:00Z' }),
    raw('FourD', '2025-03-31', crore(400), 'sales', { availableAt: '2026-02-01T00:00:00Z' }),
  ];
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows).facts);
  assert.ok(facts.every(f => !f.qualityFlags.includes('PERIOD_RECON_FAIL')));
});

// --- 4. Q1 derivation ----------------------------------------------------------------------------------------

test('discrete Q1 is derived from YTD_3M when OneD is missing', () => {
  const facts = normalizeXbrlFacts([raw('FourD', '2025-06-30', crore(42))]).facts;
  const q1 = facts.find(f => f.periodType === 'DISCRETE_Q');
  assert.equal(q1?.valueCr, 42);
  assert.equal(q1?.periodStart, '2025-04-01');
  assert.equal(q1?.periodEnd, '2025-06-30');
  assert.ok(q1?.qualityFlags.includes('DERIVED'));
  assert.deepEqual(q1?.derivation?.inputs.length, 1);
});

test('Q1 is not derived when OneD exists', () => {
  const rows = [raw('OneD', '2025-06-30', crore(42)), raw('FourD', '2025-06-30', crore(42))];
  const quarters = normalizeXbrlFacts(rows).facts.filter(f => f.periodType === 'DISCRETE_Q');
  assert.equal(quarters.length, 1);
  assert.ok(!quarters[0].qualityFlags.includes('DERIVED'));
});

test('Q1 FourD is classified YTD_3M and never a discrete quarter', () => {
  const facts = normalizeXbrlFacts([raw('FourD', '2025-06-30', crore(42))]).facts;
  assert.equal(facts.find(f => f.factId.includes('YTD_3M'))?.periodType, 'YTD_3M');
});

// --- 5. tier validation ----------------------------------------------------------------------------------------

test('a missing source tier is rejected, not defaulted', () => {
  const result = normalizeXbrlFacts([raw('OneD', '2025-06-30', 1, 'sales', { sourceTier: undefined })]);
  assert.equal(result.facts.length, 0);
  assert.deepEqual(result.rejected, [{ rawMetric: 'sales', reason: 'SOURCE_TIER_REQUIRED', count: 1 }]);
});

test('TRENDLYNE, SCREENER, UPSTOX and YAHOO sources cannot be STATUTORY', () => {
  for (const source of ['TRENDLYNE_MCP', 'screener-export', 'Upstox API', 'Yahoo Finance']) {
    const result = normalizeXbrlFacts([raw('OneD', '2025-06-30', 1, 'sales', { source })]);
    assert.equal(result.facts.length, 0, source);
    assert.equal(result.rejected[0].reason, 'SOURCE_TIER_MISMATCH', source);
  }
});

test('a provider source with a provider tier is accepted and its crore assumption is recorded', () => {
  const row = raw('OneD', '2025-06-30', 12.5, 'sales', { source: 'TRENDLYNE_MCP', sourceTier: 'PROVIDER_VERIFIED' });
  const fact = normalizeXbrlFacts([row]).facts[0];
  assert.equal(fact.valueCr, 12.5);
  assert.ok(fact.qualityFlags.includes('UNIT_ASSUMED_CRORE'));
  assert.ok(fact.derivation);
});

test('invalid and simulated tiers are rejected', () => {
  const bad = raw('OneD', '2025-06-30', 1, 'sales', { sourceTier: 'GOLD' as never });
  const simulated = raw('OneD', '2025-09-30', 1, 'sales', { sourceTier: 'SIMULATED' });
  const result = normalizeXbrlFacts([bad, simulated]);
  assert.equal(result.facts.length, 0);
  assert.deepEqual(result.rejected.map(r => r.reason).sort(), ['SOURCE_TIER_INVALID:GOLD', 'SOURCE_TIER_SIMULATED']);
});

// --- 6. units never throw out of normalisation ----------------------------------------------------------------

test('unknown units go to the rejection report and never throw', () => {
  const rows = [raw('OneD', '2025-06-30', 1, 'sales', { unit: 'USD' }), raw('OneD', '2025-09-30', 2, 'sales')];
  const result = normalizeXbrlFacts(rows);
  assert.equal(result.facts.length, 1);
  assert.deepEqual(result.rejected, [{ rawMetric: 'sales', reason: 'UNIT_UNSUPPORTED:USD', count: 1 }]);
});

test('a non-finite value is rejected without throwing', () => {
  const result = normalizeXbrlFacts([raw('OneD', '2025-06-30', Number.NaN)]);
  assert.equal(result.facts.length, 0);
  assert.equal(result.rejected[0].reason, 'UNIT_VALUE_NOT_FINITE');
});

test('per-share units are supported in both spellings', () => {
  assert.equal(convertUnit(10, 'INRPerShare').unit, 'INR_PER_SHARE');
  assert.equal(convertUnit(10, 'INR_PER_SHARE').unit, 'INR_PER_SHARE');
  assert.equal(convertUnit(10, 'INRPerShare').value, 10);
});

test('a dimensionless "pure" unit on a money metric is rejected as unsupported', () => {
  const result = normalizeXbrlFacts([raw('FourD', '2025-03-31', 3, 'xbrl_reserve_excluding_revaluation_reserves', {
    unit: 'pure',
  })]);
  assert.equal(result.facts.length, 0);
  assert.equal(result.rejected[0].reason, 'UNIT_UNSUPPORTED:pure');
});

// --- percent vs fraction ----------------------------------------------------------------------------------------

test('a fraction on a percent metric is converted x100 and recorded; crore on a percent metric is a mismatch', () => {
  const fraction = normalizeXbrlFacts([raw('OneD', '2025-06-30', 0.25, 'promoter_pct', { unit: 'FRACTION' })]).facts[0];
  assert.equal(fraction.valueCr, 25);
  assert.equal(fraction.unit, 'PCT');
  assert.ok(fraction.derivation);
  const percent = normalizeXbrlFacts([raw('OneD', '2025-06-30', 25, 'promoter_pct', { unit: 'PERCENT' })]).facts[0];
  assert.equal(percent.valueCr, 25);
  const mismatch = normalizeXbrlFacts([raw('OneD', '2025-06-30', 25, 'promoter_pct', { unit: 'INR' })]);
  assert.equal(mismatch.rejected[0].reason, 'UNIT_MISMATCH:INR_CR->PCT');
  assert.throws(() => alignToMetricUnit(convertUnit(1, 'PERCENT'), 'INR_CR'), /UNIT_MISMATCH/);
});

// --- 7. real raw names -----------------------------------------------------------------------------------------

test('every raw mapping targets a defined metric and carries verification evidence', () => {
  const defined = new Set(METRIC_DEFINITIONS.map(d => d.metric));
  for (const mapping of RAW_METRIC_MAP) {
    assert.ok(defined.has(mapping.canonical), mapping.raw);
    assert.ok(mapping.evidence.length > 20, mapping.raw);
  }
  assert.equal(new Set(RAW_METRIC_MAP.map(m => m.raw)).size, RAW_METRIC_MAP.length);
});

test('real raw names map to canonical names (sales is revenue, xbrl_income is total income)', () => {
  assert.equal(canonicalMetric('sales'), 'revenue_from_operations');
  assert.equal(canonicalMetric('xbrl_income'), 'total_income');
  assert.equal(canonicalMetric('xbrl_other_income'), 'other_income');
  assert.equal(canonicalMetric('xbrl_profit_before_exceptional_items_and_tax'), 'pbt_before_exceptional');
  assert.equal(canonicalMetric('xbrl_exceptional_items_before_tax'), 'exceptional_items');
  assert.equal(canonicalMetric('xbrl_tax_expense'), 'tax_expense');
  assert.equal(canonicalMetric('xbrl_profit_or_loss_attributable_to_owners_of_parent'), 'pat_attributable_to_owners');
  assert.equal(canonicalMetric('finance_costs'), 'finance_cost');
  assert.equal(canonicalMetric('depreciation'), 'depreciation_amortisation');
  assert.equal(
    canonicalMetric('xbrl_purchase_of_property_plant_and_equipment_classified_as_investing_activities'),
    'capex_cash_outflow',
  );
  assert.equal(canonicalMetric('xbrl_reserve_excluding_revaluation_reserves'), 'reserves');
});

test('TATATECH FY26 real figures: revenue 5505.57, total income 5680.12 and the exceptional-item sign', () => {
  const fy = (metric: string, cr: number) => raw('FourD', '2026-03-31', crore(cr), metric, { symbol: 'TATATECH' });
  const rows = [
    fy('sales', 5505.57), fy('xbrl_income', 5680.12), fy('xbrl_other_income', 174.55),
    fy('xbrl_profit_before_exceptional_items_and_tax', 848.43), fy('xbrl_exceptional_items_before_tax', -107.73),
    fy('pbt', 740.70), fy('finance_costs', 34.12), fy('depreciation', 144.95), fy('cfo', 775.70),
  ];
  const facts = normalizeXbrlFacts(rows).facts.filter(f => f.periodType === 'YTD_12M');
  const value = (metric: string) => facts.find(f => f.metric === metric)?.valueCr as number;
  assert.equal(value('revenue_from_operations'), 5505.57);
  assert.equal(value('total_income'), 5680.12);
  assert.ok(Math.abs(value('pbt_before_exceptional') + value('exceptional_items') - value('pbt')) < 0.005);
  const ebitda = value('pbt_before_exceptional') + value('finance_cost') + value('depreciation_amortisation')
    - value('other_income');
  assert.equal(Number(ebitda.toFixed(2)), 852.95);
  assert.equal(Number((value('cfo') / ebitda).toFixed(3)), 0.909);
});

test('out-of-scope raw metrics are aggregated in the rejection report and never throw', () => {
  const rows = [
    raw('FourD', '2025-03-31', 1, 'xbrl_adjustments_for_decrease_increase_in_inventories'),
    raw('FourD', '2024-03-31', 2, 'xbrl_adjustments_for_decrease_increase_in_inventories'),
    raw('OneD', '2025-03-31', 3, 'xbrl_adjustments_for_decrease_increase_in_inventories'),
    raw('OneD', '2025-03-31', 4, 'xbrl_debt_equity_ratio', { unit: 'pure' }),
  ];
  const result = normalizeXbrlFacts(rows);
  assert.equal(result.facts.length, 0);
  const inventories = result.rejected.find(r => r.rawMetric.endsWith('increase_in_inventories'));
  assert.equal(inventories?.count, 3);
  assert.match(inventories?.reason || '', /^METRIC_UNMAPPED/);
  assert.equal(result.rejected.length, 2);
});

test('capex filed with a negative sign is kept and flagged SIGN_UNUSUAL', () => {
  const metric = 'xbrl_purchase_of_property_plant_and_equipment_classified_as_investing_activities';
  const fact = normalizeXbrlFacts([raw('FourD', '2025-03-31', -crore(5), metric)]).facts[0];
  assert.equal(fact.valueCr, -5);
  assert.ok(fact.qualityFlags.includes('SIGN_UNUSUAL'));
});

// --- calendar, scope, isolation -----------------------------------------------------------------------------

test('Indian fiscal quarter mapping for all four quarters and the year boundary', () => {
  assert.deepEqual(['2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31'].map(quarterFor), [1, 2, 3, 4]);
  assert.equal(fiscalYearFor('2026-03-31'), 2025);
  assert.equal(fiscalYearFor('2026-04-01'), 2026);
  assert.equal(quarterStart('2026-03-31'), '2026-01-01');
  assert.equal(quarterStart('2025-06-30'), '2025-04-01');
  assert.equal(isQuarterEnd('2025-09-30'), true);
  assert.equal(isQuarterEnd('2025-09-29'), false);
  assert.equal(isQuarterEnd('2025-05-31'), false);
});

test('a flow row whose period end is not a quarter end is rejected, not mapped to a year', () => {
  const result = normalizeXbrlFacts([raw('FourD', '2025-05-31', 1)]);
  assert.equal(result.facts.length, 0);
  assert.equal(result.rejected[0].reason, 'PERIOD_END_UNSUPPORTED:2025-05-31');
});

test('derived quarter dates are correct for Q1 to Q4', () => {
  const ends = ['2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31'];
  const rows = ends.map((d, i) => raw('FourD', d, crore(100 * (i + 1))));
  const derived = normalizeXbrlFacts(rows).facts.filter(f => f.periodType === 'DISCRETE_Q');
  assert.deepEqual(derived.map(f => [f.periodStart, f.periodEnd]), [
    ['2025-04-01', '2025-06-30'], ['2025-07-01', '2025-09-30'],
    ['2025-10-01', '2025-12-31'], ['2026-01-01', '2026-03-31'],
  ]);
  assert.deepEqual(derived.map(f => f.valueCr), [100, 100, 100, 100]);
});

test('YTD facts always start on 1 April even when the raw FourD start is a quarter start', () => {
  const fact = normalizeXbrlFacts([raw('FourD', '2024-09-30', crore(5), 'sales', { periodStart: '2024-07-01' })])
    .facts.find(f => f.periodType === 'YTD_6M');
  assert.equal(fact?.periodStart, '2024-04-01');
});

test('cumulative YTD is never emitted as a discrete quarter when no earlier YTD exists', () => {
  const facts = normalizeXbrlFacts([raw('FourD', '2024-09-30', 2258588000)]).facts;
  assert.equal(facts.filter(f => f.periodType === 'DISCRETE_Q').length, 0);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].periodType, 'YTD_6M');
});

test('no derivation across scopes', () => {
  const rows = [
    raw('FourD', '2024-12-31', crore(300)),
    raw('FourD', '2025-03-31', crore(400), 'sales', { scope: 'STANDALONE' }),
  ];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.ok(facts.every(f => f.periodType !== 'DISCRETE_Q' || f.periodEnd !== '2025-03-31'));
});

test('no derivation across metrics', () => {
  const rows = [raw('FourD', '2024-12-31', crore(300), 'sales'), raw('FourD', '2025-03-31', crore(400), 'pat')];
  assert.equal(normalizeXbrlFacts(rows).facts.filter(f => f.periodType === 'DISCRETE_Q' && f.periodEnd === '2025-03-31').length, 0);
});

test('a point-in-time metric carried in both OneD and FourD yields one fact with no restatement', () => {
  const rows = [raw('OneD', '2026-03-31', crore(13.58), 'equity_capital'), raw('FourD', '2026-03-31', crore(13.58), 'equity_capital')];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.equal(facts.length, 1);
  assert.equal(facts[0].periodType, 'POINT_IN_TIME');
  assert.equal(facts[0].periodStart, '2026-03-31');
  assert.ok(!facts[0].qualityFlags.includes('RESTATED'));
});

test('unit conversion to crore is recorded on the fact', () => {
  const fact = normalizeXbrlFacts([raw('OneD', '2025-06-30', crore(10))]).facts[0];
  assert.ok(fact.qualityFlags.includes('UNIT_CONVERTED'));
  assert.equal(fact.derivation?.formula, 'INR / 10,000,000 = INR crore');
});
