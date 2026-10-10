import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CalcEnv, runAllCalculators } from '../../../src/server/research_v2/calc/index.js';
import type { CalcContext } from '../../../src/server/research_v2/calc/index.js';
import type { Fact } from '../../../src/server/research_v2/domain/types.js';
import { annual, AS_OF, ISIN, MemorySource, pick, pit, quarter } from './helpers.js';

const END = '2026-03-31';
const run = (facts: Fact[], extra: Partial<CalcContext> = {}) =>
  runAllCalculators(new MemorySource(facts), { isin: ISIN, asOf: AS_OF, ...extra });
const close = (actual: number | null, expected: number, tol = 1e-9) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

describe('related-party materiality', () => {
  const facts = [
    annual('revenue_from_operations', END, 1000), pit('total_assets', END, 2000), pit('equity_total', END, 800),
  ];
  const table = { documentId: 'doc-1', periodEnd: END, totalAmountCr: 50, parsed: true };

  it('RPT / revenue, assets and net worth from a parsed table', () => {
    const results = run(facts, { rptTable: table });
    close(pick(results, 'rpt_to_revenue').value, 5);
    close(pick(results, 'rpt_to_assets').value, 2.5);
    close(pick(results, 'rpt_to_net_worth').value, 6.25);
    assert.ok(pick(results, 'rpt_to_revenue').inputs.includes('doc:doc-1'));
  });

  it('no table, an unparsed table or a table for another year -> INSUFFICIENT_DATA (no RPT=0 placeholder)', () => {
    const cases = [undefined, { ...table, parsed: false }, { ...table, periodEnd: '2025-03-31' }];
    for (const rptTable of cases) {
      for (const key of ['rpt_to_revenue', 'rpt_to_assets', 'rpt_to_net_worth']) {
        const r = pick(run(facts, { rptTable }), key);
        assert.equal(r.status, 'INSUFFICIENT_DATA');
        assert.equal(r.value, null);
      }
    }
  });

  it('a parsed table with a zero total is a value (0%), and a missing denominator is INSUFFICIENT_DATA', () => {
    close(pick(run(facts, { rptTable: { ...table, totalAmountCr: 0 } }), 'rpt_to_revenue').value, 0);
    const noAssets = facts.filter(f => f.metric !== 'total_assets');
    assert.equal(pick(run(noAssets, { rptTable: table }), 'rpt_to_assets').status, 'INSUFFICIENT_DATA');
  });
});

describe('fact environment rules', () => {
  const base = [annual('revenue_from_operations', END, 100), annual('pat_total', END, 10)];

  it('requires an isin or symbol', () => {
    assert.throws(() => new CalcEnv(new MemorySource([]), { asOf: AS_OF }), /CALC_CONTEXT_NEEDS_ISIN_OR_SYMBOL/);
  });

  it('prefers consolidated and states it; falls back to standalone only when no consolidated exists', () => {
    const standalone = [annual('revenue_from_operations', END, 7, { scope: 'STANDALONE' })];
    const both = run([...base, ...standalone]);
    assert.equal(pick(both, 'ebitda_margin').scope, 'CONSOLIDATED');
    const only = run(standalone);
    assert.equal(pick(only, 'revenue_yoy_fy').scope, 'STANDALONE');
  });

  it('never mixes scopes inside one calculation', () => {
    const mixed = [
      annual('cfo', END, 50), annual('pat_total', END, 25, { scope: 'STANDALONE' }),
    ];
    const r = pick(run(mixed), 'cfo_to_pat');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.equal(r.scope, 'CONSOLIDATED');
  });

  it('excludes quarantined, simulated, non-finite, wrong-unit and not-yet-available facts', () => {
    const rows = [
      annual('revenue_from_operations', END, 100, { quarantined: true }),
      annual('pat_total', END, 10, { sourceTier: 'SIMULATED' }),
      annual('cfo', END, Number.NaN),
      annual('pbt', END, 50, { unit: 'PCT' }),
      annual('tax_expense', END, 5, { availableAt: '2027-01-01T00:00:00Z' }),
      annual('pat_attributable_to_owners', END, 1),
    ];
    const results = run(rows);
    assert.equal(pick(results, 'cfo_to_pat').status, 'INSUFFICIENT_DATA');
    assert.equal(pick(results, 'ebitda_margin').status, 'INSUFFICIENT_DATA');
    assert.equal(pick(results, 'rate_shock_25bp_after_tax').status, 'INSUFFICIENT_DATA');
  });

  it('uses the latest vintage when two vintages of a period exist', () => {
    const rows = [
      annual('cfo', END, 10, { vintage: 1 }), annual('cfo', END, 20, { vintage: 2 }), annual('pat_total', END, 10),
      annual('capex_cash_outflow', END, 5),
    ];
    close(pick(run(rows), 'fcf').value, 15);
  });

  it('empty source: scope is null and every result is INSUFFICIENT_DATA with no value', () => {
    const results = run([]);
    assert.ok(results.length > 0);
    for (const r of results) {
      assert.equal(r.status, 'INSUFFICIENT_DATA', r.calcId);
      assert.equal(r.value, null);
      assert.equal(r.scope, null);
    }
  });

  it('annualPeriodEnd override targets an earlier year', () => {
    const rows = [
      annual('cfo', END, 10), annual('pat_total', END, 5), annual('cfo', '2025-03-31', 8),
      annual('pat_total', '2025-03-31', 4),
    ];
    close(pick(run(rows, { annualPeriodEnd: '2025-03-31' }), 'cfo_to_pat', 'FY25').value, 2);
  });

  it('works on quarterly-only data without inventing annual results', () => {
    const rows = [quarter('revenue_from_operations', '2026-06-30', 10)];
    const results = run(rows);
    assert.equal(pick(results, 'annual_growth').status, 'INSUFFICIENT_DATA');
    assert.equal(pick(results, 'cfo_to_pat').status, 'INSUFFICIENT_DATA');
  });
});
