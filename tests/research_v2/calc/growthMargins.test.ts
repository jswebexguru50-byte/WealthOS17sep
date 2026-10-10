import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAllCalculators } from '../../../src/server/research_v2/calc/index.js';
import { annual, AS_OF, ISIN, MemorySource, mkFact, pick, quarter } from './helpers.js';

const ctx = { isin: ISIN, asOf: AS_OF };
const run = (facts: ReturnType<typeof quarter>[]) => runAllCalculators(new MemorySource(facts), ctx);

describe('quarterly growth', () => {
  const facts = [
    quarter('revenue_from_operations', '2025-09-30', 100),
    quarter('revenue_from_operations', '2025-12-31', 110),
    quarter('revenue_from_operations', '2026-06-30', 130),
    quarter('revenue_from_operations', '2026-09-30', 150),
    quarter('pat_total', '2025-09-30', 0),
    quarter('pat_total', '2026-09-30', 5),
  ];
  const results = run(facts);

  it('computes discrete-quarter YoY', () => {
    const r = pick(results, 'revenue_yoy_q', 'Q2 FY27');
    assert.equal(r.status, 'OK');
    assert.ok(Math.abs((r.value as number) - 50) < 1e-9);
  });

  it('computes sequential growth against the prior discrete quarter', () => {
    const r = pick(results, 'revenue_qoq', 'Q2 FY27');
    assert.equal(r.status, 'OK');
    assert.ok(Math.abs((r.value as number) - (150 / 130 - 1) * 100) < 1e-9);
  });

  it('sequential growth is INSUFFICIENT_DATA when the prior quarter is missing', () => {
    const gap = run([quarter('revenue_from_operations', '2025-12-31', 110),
      quarter('revenue_from_operations', '2026-09-30', 150)]);
    const r = pick(gap, 'revenue_qoq', 'Q2 FY27');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.equal(r.value, null);
    assert.ok(r.missing?.some(m => m.startsWith('revenue_from_operations')));
  });

  it('a zero base makes growth NOT_APPLICABLE, never a default', () => {
    const r = pick(results, 'pat_yoy_q', 'Q2 FY27');
    assert.equal(r.status, 'NOT_APPLICABLE');
    assert.equal(r.value, null);
  });

  it('ignores year-to-date facts at the same period end (no duration mixing)', () => {
    const mixed = [...facts, mkFact('revenue_from_operations', 'YTD_6M', '2026-09-30', 999)];
    const r = pick(run(mixed), 'revenue_yoy_q', 'Q2 FY27');
    assert.ok(Math.abs((r.value as number) - 50) < 1e-9);
  });
});

describe('annual growth and CAGR', () => {
  const years = [2021, 2022, 2023, 2024, 2025, 2026];
  const values = [100, 120, 144, 172.8, 207.36, 248.832];
  const facts = years.map((y, i) => annual('revenue_from_operations', `${y}-03-31`, values[i]));

  it('computes YoY, 3y and 5y CAGR on annual facts', () => {
    const results = run(facts);
    assert.ok(Math.abs((pick(results, 'revenue_yoy_fy', 'FY26').value as number) - 20) < 1e-9);
    assert.ok(Math.abs((pick(results, 'revenue_cagr_3y', 'FY26').value as number) - 20) < 1e-9);
    assert.ok(Math.abs((pick(results, 'revenue_cagr_5y', 'FY26').value as number) - 20) < 1e-9);
  });

  it('5y CAGR is INSUFFICIENT_DATA with fewer annual points; 3y still works', () => {
    const results = run(facts.slice(2));
    assert.equal(pick(results, 'revenue_cagr_5y', 'FY26').status, 'INSUFFICIENT_DATA');
    assert.equal(pick(results, 'revenue_cagr_3y', 'FY26').status, 'OK');
  });

  it('CAGR with a non-positive start is NOT_APPLICABLE', () => {
    const bad = [annual('revenue_from_operations', '2023-03-31', -5), ...facts.slice(3)];
    assert.equal(pick(run(bad), 'revenue_cagr_3y', 'FY26').status, 'NOT_APPLICABLE');
  });

  it('operating leverage is EBITDA growth over revenue growth, undefined at zero revenue growth', () => {
    const comp = (end: string, rev: number, pbt: number) => [
      annual('revenue_from_operations', end, rev), annual('pbt_before_exceptional', end, pbt),
      annual('finance_cost', end, 0), annual('depreciation_amortisation', end, 0), annual('other_income', end, 0),
    ];
    const ok = run([...comp('2025-03-31', 100, 10), ...comp('2026-03-31', 110, 15)]);
    assert.ok(Math.abs((pick(ok, 'operating_leverage_yoy', 'FY26').value as number) - 5) < 1e-9);
    const flat = run([...comp('2025-03-31', 100, 10), ...comp('2026-03-31', 100, 15)]);
    assert.equal(pick(flat, 'operating_leverage_yoy', 'FY26').status, 'NOT_APPLICABLE');
  });
});

describe('margins', () => {
  const end = '2026-03-31';
  const base = [
    annual('revenue_from_operations', end, 200), annual('pbt_before_exceptional', end, 20),
    annual('finance_cost', end, 5), annual('depreciation_amortisation', end, 10), annual('other_income', end, 3),
    annual('pat_total', end, 15),
  ];

  it('derives EBITDA and the three margins', () => {
    const results = run(base);
    assert.equal(pick(results, 'ebitda_derived', 'FY26').value, 32);
    assert.ok(Math.abs((pick(results, 'ebitda_margin', 'FY26').value as number) - 16) < 1e-9);
    assert.ok(Math.abs((pick(results, 'operating_margin', 'FY26').value as number) - 11) < 1e-9);
    assert.ok(Math.abs((pick(results, 'pat_margin', 'FY26').value as number) - 7.5) < 1e-9);
  });

  it('a missing component yields INSUFFICIENT_DATA naming it, never zero', () => {
    const results = run(base.filter(f => f.metric !== 'other_income'));
    const r = pick(results, 'ebitda_derived', 'FY26');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.ok(r.missing?.some(m => m.startsWith('other_income')));
  });

  it('a stored ebitda_derived is used only when components are missing', () => {
    const only = [annual('revenue_from_operations', end, 200), annual('ebitda_derived', end, 40), annual('pat_total', end, 1)];
    assert.equal(pick(run(only), 'ebitda_derived', 'FY26').value, 40);
  });

  it('zero other income is a value, not missing', () => {
    const zero = base.map(f => (f.metric === 'other_income' ? { ...f, valueCr: 0 } : f));
    assert.equal(pick(run(zero), 'ebitda_derived', 'FY26').value, 35);
  });

  it('PBT fallback is flagged as including exceptional items', () => {
    const fallback = base.filter(f => f.metric !== 'pbt_before_exceptional').concat(annual('pbt', end, 20));
    const r = pick(run(fallback), 'ebitda_derived', 'FY26');
    assert.equal(r.status, 'OK');
    assert.match(r.note, /PBT_INCLUDES_EXCEPTIONAL_ITEMS/);
  });

  it('zero revenue makes a margin NOT_APPLICABLE', () => {
    const zero = base.map(f => (f.metric === 'revenue_from_operations' ? { ...f, valueCr: 0 } : f));
    assert.equal(pick(run(zero), 'ebitda_margin', 'FY26').status, 'NOT_APPLICABLE');
  });
});
