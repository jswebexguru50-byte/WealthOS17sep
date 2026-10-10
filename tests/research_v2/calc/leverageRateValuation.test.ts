import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { percentileRank, runAllCalculators } from '../../../src/server/research_v2/calc/index.js';
import type { CalcContext, DatedMultiple } from '../../../src/server/research_v2/calc/index.js';
import type { Fact } from '../../../src/server/research_v2/domain/types.js';
import { annual, AS_OF, ISIN, MemorySource, mkFact, pick, pit } from './helpers.js';

const END = '2026-03-31';
const run = (facts: Fact[], extra: Partial<CalcContext> = {}) =>
  runAllCalculators(new MemorySource(facts), { isin: ISIN, asOf: AS_OF, ...extra });
const close = (actual: number | null, expected: number, tol = 1e-9) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

const pnl = [
  annual('pbt_before_exceptional', END, 100), annual('finance_cost', END, 10), annual('depreciation_amortisation', END, 20),
  annual('other_income', END, 5), annual('pbt', END, 100), annual('tax_expense', END, 25),
  annual('pat_total', END, 75), annual('pat_attributable_to_owners', END, 75),
  annual('cfo', END, 90), annual('capex_cash_outflow', END, 40),
];
const bs = [
  pit('borrowings_total', END, 200), pit('lease_liabilities', END, 30), pit('cash_and_equivalents', END, 80),
  pit('equity_total', END, 600),
];

describe('leverage', () => {
  it('net debt = borrowings + leases - cash; net debt / EBITDA', () => {
    const results = run([...pnl, ...bs]);
    close(pick(results, 'net_debt').value, 150);
    close(pick(results, 'net_debt_to_ebitda').value, 150 / 125);
  });

  it('missing lease liabilities is INSUFFICIENT_DATA unless the run explicitly excludes leases', () => {
    const noLease = [...pnl, ...bs.filter(f => f.metric !== 'lease_liabilities')];
    const missing = pick(run(noLease), 'net_debt');
    assert.equal(missing.status, 'INSUFFICIENT_DATA');
    assert.ok(missing.missing?.some(m => m.startsWith('lease_liabilities')));
    const excluded = pick(run(noLease, { includeLeases: false }), 'net_debt');
    close(excluded.value, 120);
    assert.match(excluded.formula, /leases excluded/);
  });

  it('net cash is a negative value, not missing', () => {
    const cash = bs.map(f => (f.metric === 'cash_and_equivalents' ? { ...f, valueCr: 400 } : f));
    close(pick(run([...pnl, ...cash]), 'net_debt').value, -170);
  });

  it('net debt / EBITDA is NOT_APPLICABLE when EBITDA is not positive', () => {
    const loss = pnl.map(f => (f.metric === 'pbt_before_exceptional' ? { ...f, valueCr: -50 } : f));
    assert.equal(pick(run([...loss, ...bs]), 'net_debt_to_ebitda').status, 'NOT_APPLICABLE');
  });

  it('interest coverage with and without other income; zero finance cost is undefined, not infinite', () => {
    const results = run([...pnl, ...bs]);
    close(pick(results, 'interest_coverage').value, 11);
    close(pick(results, 'interest_coverage_ex_other_income').value, 10.5);
    const free = pnl.map(f => (f.metric === 'finance_cost' ? { ...f, valueCr: 0 } : f));
    assert.equal(pick(run(free), 'interest_coverage').status, 'NOT_APPLICABLE');
    const none = pnl.filter(f => f.metric !== 'finance_cost');
    assert.equal(pick(run(none), 'interest_coverage').status, 'INSUFFICIENT_DATA');
  });
});

describe('rate sensitivity (Q24)', () => {
  const floating = pit('floating_rate_borrowings', END, 120);

  it('pre-tax = floating debt x 25bp, after-tax uses the evidenced rate', () => {
    const results = run([...pnl, ...bs, floating]);
    close(pick(results, 'rate_shock_25bp_pretax').value, 0.3);
    close(pick(results, 'rate_shock_25bp_after_tax').value, 0.3 * 0.75);
  });

  it('never applies the shock to total debt: no floating split -> INSUFFICIENT_DATA', () => {
    const results = run([...pnl, ...bs]);
    for (const key of ['rate_shock_25bp_pretax', 'rate_shock_25bp_after_tax']) {
      const r = pick(results, key);
      assert.equal(r.status, 'INSUFFICIENT_DATA');
      assert.equal(r.value, null);
      assert.ok(r.missing?.some(m => m.startsWith('floating_rate_borrowings')));
    }
  });

  it('after-tax is withheld when the tax rate is not evidenced, pre-tax still reported', () => {
    const noTax = pnl.filter(f => f.metric !== 'tax_expense');
    const results = run([...noTax, ...bs, floating]);
    close(pick(results, 'rate_shock_25bp_pretax').value, 0.3);
    const after = pick(results, 'rate_shock_25bp_after_tax');
    assert.equal(after.status, 'INSUFFICIENT_DATA');
    assert.ok(after.missing?.some(m => m.startsWith('tax_expense')));
  });

  it('a loss-making year (PBT <= 0) has no evidenced tax rate', () => {
    const loss = pnl.map(f => (f.metric === 'pbt' ? { ...f, valueCr: -10 } : f));
    const after = pick(run([...loss, ...bs, floating]), 'rate_shock_25bp_after_tax');
    assert.equal(after.status, 'NOT_APPLICABLE');
  });

  it('floating debt above total borrowings or negative is rejected', () => {
    const tooBig = pit('floating_rate_borrowings', END, 250);
    assert.equal(pick(run([...pnl, ...bs, tooBig]), 'rate_shock_25bp_pretax').status, 'NOT_APPLICABLE');
    const negative = pit('floating_rate_borrowings', END, -1);
    assert.equal(pick(run([...pnl, ...bs, negative]), 'rate_shock_25bp_pretax').status, 'NOT_APPLICABLE');
  });

  it('zero floating debt is a value (zero impact)', () => {
    close(pick(run([...pnl, ...bs, pit('floating_rate_borrowings', END, 0)]), 'rate_shock_25bp_pretax').value, 0);
  });
});

describe('valuation', () => {
  const facts = [...pnl, ...bs];
  const priced = { asOf: '2026-10-09', marketCapCr: 1500 };

  it('P/E, P/B, EV/EBITDA and FCF yield from a priced-date input', () => {
    const results = run(facts, { priced });
    close(pick(results, 'pe').value, 1500 / 75);
    close(pick(results, 'pb').value, 1500 / 600);
    close(pick(results, 'ev_ebitda').value, (1500 + 150) / 125);
    close(pick(results, 'fcf_yield').value, 50 / 1500 * 100);
    assert.match(pick(results, 'pe').period, /@2026-10-09$/);
  });

  it('market cap can come from price x shares outstanding (shares fact in SHARES)', () => {
    const shares = mkFact('shares_outstanding', 'POINT_IN_TIME', END, 5e7, { unit: 'SHARES' });
    const results = run([...facts, shares], { priced: { asOf: '2026-10-09', price: 300 } });
    close(pick(results, 'pe').value, (300 * 5e7 / 1e7) / 75);
  });

  it('no priced input -> every multiple INSUFFICIENT_DATA (no price is invented)', () => {
    const results = run(facts);
    for (const key of ['pe', 'pb', 'ev_ebitda', 'fcf_yield']) {
      assert.equal(pick(results, key).status, 'INSUFFICIENT_DATA');
    }
  });

  it('price without shares, or a priced date after asOf (look-ahead), is rejected', () => {
    const noShares = run(facts, { priced: { asOf: '2026-10-09', price: 300 } });
    assert.equal(pick(noShares, 'pe').status, 'INSUFFICIENT_DATA');
    const future = run(facts, { priced: { asOf: '2026-12-01', marketCapCr: 1500 } });
    const r = pick(future, 'pe');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.ok(r.missing?.some(m => /look-ahead/.test(m)));
  });

  it('negative earnings make P/E NOT_APPLICABLE, not a negative multiple', () => {
    const loss = facts.map(f => (f.metric === 'pat_attributable_to_owners' ? { ...f, valueCr: -3 } : f));
    assert.equal(pick(run(loss, { priced }), 'pe').status, 'NOT_APPLICABLE');
  });

  it('a negative FCF gives a negative FCF yield (a value)', () => {
    const heavy = facts.map(f => (f.metric === 'capex_cash_outflow' ? { ...f, valueCr: 200 } : f));
    close(pick(run(heavy, { priced }), 'fcf_yield').value, -110 / 1500 * 100);
  });
});

describe('own-history percentile', () => {
  const facts = [...pnl, ...bs];
  const priced = { asOf: '2026-10-09', marketCapCr: 1500 };
  const series = (n: number, valueAt: (i: number) => number, date = '2025-%02d-01'): DatedMultiple[] =>
    Array.from({ length: n }, (_, i) => ({ date: date.replace('%02d', String(i + 1).padStart(2, '0')), value: valueAt(i) }));

  it('without a dated series it is INSUFFICIENT_DATA', () => {
    const r = pick(run(facts, { priced }), 'pe_percentile');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.ok(r.missing?.some(m => /history series/.test(m)));
  });

  it('computes the share of history at or below the current P/E (20x)', () => {
    const r = pick(run(facts, { priced, multipleHistory: { pe: series(12, i => 10 + i * 2) } }), 'pe_percentile');
    close(r.value, (6 / 12) * 100);
    assert.equal(percentileRank(20, [10, 20, 30, 40]), 50);
  });

  it('rejects a short series and a series with points after asOf', () => {
    const short = pick(run(facts, { priced, multipleHistory: { pe: series(5, () => 10) } }), 'pe_percentile');
    assert.equal(short.status, 'INSUFFICIENT_DATA');
    const leaky = series(12, () => 10);
    leaky[11] = { date: '2027-01-01', value: 10 };
    const r = pick(run(facts, { priced, multipleHistory: { pe: leaky } }), 'pe_percentile');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.ok(r.missing?.some(m => /look-ahead/.test(m)));
  });

  it('is INSUFFICIENT_DATA when the current multiple itself is unavailable', () => {
    const r = pick(run(facts, { multipleHistory: { pe: series(12, () => 10) } }), 'pe_percentile');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
  });
});

describe('reverse DCF (illustrative)', () => {
  const facts = [...pnl, ...bs];
  const priced = { asOf: '2026-10-09', marketCapCr: 1500 };
  const dcf = { discountRate: 0.12, terminalGrowth: 0.04, horizonYears: 10, assumptionsRef: 'fixture-assumptions' };

  it('requires explicit stored assumptions', () => {
    const r = pick(run(facts, { priced }), 'reverse_dcf_implied_growth');
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.match(r.name, /ILLUSTRATIVE/);
  });

  it('solves the implied growth and labels the output illustrative', () => {
    const r = pick(run(facts, { priced, dcf }), 'reverse_dcf_implied_growth');
    assert.equal(r.status, 'OK');
    const g = (r.value as number) / 100;
    let pv = 0;
    for (let t = 1; t <= 10; t += 1) pv += 50 * (1 + g) ** t / 1.12 ** t;
    pv += 50 * (1 + g) ** 10 * 1.04 / 0.08 / 1.12 ** 10;
    close(pv, 1500, 1e-6);
    assert.match(r.note, /illustrative/);
    assert.match(r.note, /fixture-assumptions/);
  });

  it('rejects invalid assumptions and a non-positive base FCF', () => {
    const bad = pick(run(facts, { priced, dcf: { ...dcf, terminalGrowth: 0.12 } }), 'reverse_dcf_implied_growth');
    assert.equal(bad.status, 'NOT_APPLICABLE');
    const negativeFcf = facts.map(f => (f.metric === 'capex_cash_outflow' ? { ...f, valueCr: 200 } : f));
    const r = pick(run(negativeFcf, { priced, dcf }), 'reverse_dcf_implied_growth');
    assert.equal(r.status, 'NOT_APPLICABLE');
  });

  it('reports no solution when the price implies growth outside the search bounds', () => {
    const r = pick(run(facts, { priced: { asOf: '2026-10-09', marketCapCr: 1e9 }, dcf }), 'reverse_dcf_implied_growth');
    assert.equal(r.status, 'NOT_APPLICABLE');
  });
});
