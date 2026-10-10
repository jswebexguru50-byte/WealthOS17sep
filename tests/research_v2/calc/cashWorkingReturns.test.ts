import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAllCalculators } from '../../../src/server/research_v2/calc/index.js';
import type { CalcContext } from '../../../src/server/research_v2/calc/index.js';
import type { Fact } from '../../../src/server/research_v2/domain/types.js';
import { annual, AS_OF, ISIN, MemorySource, pick, pit } from './helpers.js';

const END = '2026-03-31';
const PRIOR = '2025-03-31';
const run = (facts: Fact[], extra: Partial<CalcContext> = {}) =>
  runAllCalculators(new MemorySource(facts), { isin: ISIN, asOf: AS_OF, ...extra });
const close = (actual: number | null, expected: number, tol = 1e-9) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

describe('cash flow', () => {
  const base = [
    annual('cfo', END, 80), annual('pat_total', END, 50), annual('pat_attributable_to_owners', END, 40),
    annual('capex_cash_outflow', END, 30, { qualityFlags: ['CAPEX_PPE_ONLY'] }),
    pit('total_assets', END, 1000), pit('total_assets', PRIOR, 800),
  ];

  it('CFO/PAT uses attributable PAT; fcf and reinvestment flag the PPE-only capex basis', () => {
    const results = run(base);
    close(pick(results, 'cfo_to_pat').value, 2);
    const fcf = pick(results, 'fcf');
    close(fcf.value, 50);
    assert.match(fcf.note, /CAPEX_BASIS: PPE_ONLY/);
    close(pick(results, 'reinvestment_rate').value, 37.5);
  });

  it('accruals use average total assets when both ends exist', () => {
    const r = pick(run(base), 'accruals_ratio');
    close(r.value, (50 - 80) / 900 * 100);
    assert.match(r.note, /AVERAGE_BALANCE/);
  });

  it('accruals fall back to closing assets with a flag; without total assets they are INSUFFICIENT_DATA', () => {
    const closing = pick(run(base.filter(f => f.periodEnd !== PRIOR)), 'accruals_ratio');
    close(closing.value, -3);
    assert.match(closing.note, /CLOSING_BALANCE/);
    const none = pick(run(base.filter(f => f.metric !== 'total_assets')), 'accruals_ratio');
    assert.equal(none.status, 'INSUFFICIENT_DATA');
    assert.ok(none.missing?.some(m => m.startsWith('total_assets')));
  });

  it('PAT basis fallback is flagged when attributable PAT is absent', () => {
    const r = pick(run(base.filter(f => f.metric !== 'pat_attributable_to_owners')), 'cfo_to_pat');
    close(r.value, 1.6);
    assert.match(r.note, /PAT_BASIS_FALLBACK/);
  });

  it('negative capex sign is normalised and flagged; unspecified basis is flagged', () => {
    const r = pick(run([annual('cfo', END, 10), annual('capex_cash_outflow', END, -4)]), 'fcf');
    close(r.value, 6);
    assert.match(r.note, /CAPEX_SIGN_NORMALISED/);
    assert.match(r.note, /CAPEX_BASIS: UNSPECIFIED/);
  });

  it('missing capex -> INSUFFICIENT_DATA; zero CFO is a value; non-positive PAT/CFO bases are NOT_APPLICABLE', () => {
    assert.equal(pick(run([annual('cfo', END, 10)]), 'fcf').status, 'INSUFFICIENT_DATA');
    const zeroCfo = run([annual('cfo', END, 0), annual('pat_total', END, 5), annual('capex_cash_outflow', END, 3)]);
    close(pick(zeroCfo, 'cfo_to_pat').value, 0);
    assert.equal(pick(zeroCfo, 'reinvestment_rate').status, 'NOT_APPLICABLE');
    const lossMaking = run([annual('cfo', END, 10), annual('pat_total', END, -5)]);
    assert.equal(pick(lossMaking, 'cfo_to_pat').status, 'NOT_APPLICABLE');
  });
});

describe('working capital', () => {
  const base = [
    annual('revenue_from_operations', END, 1000), annual('cost_of_materials_consumed', END, 500),
    annual('changes_in_inventories', END, -20),
    pit('trade_receivables', END, 150), pit('trade_receivables', PRIOR, 100),
    pit('inventory', END, 80), pit('inventory', PRIOR, 60),
    pit('trade_payables', END, 60), pit('trade_payables', PRIOR, 40),
  ];

  it('uses average balances, states the COGS definition and sums the cycle', () => {
    const results = run(base);
    const cogs = 480;
    close(pick(results, 'dso').value, 125 / 1000 * 365);
    const dio = pick(results, 'dio');
    close(dio.value, 70 / cogs * 365);
    assert.match(dio.note, /COGS_COMPONENTS: cost_of_materials_consumed \+ changes_in_inventories/);
    close(pick(results, 'dpo').value, 50 / cogs * 365);
    close(pick(results, 'ccc').value, 125 / 1000 * 365 + 70 / cogs * 365 - 50 / cogs * 365);
  });

  it('flags CLOSING_BALANCE when the prior-year balance is missing', () => {
    const r = pick(run(base.filter(f => f.periodEnd !== PRIOR)), 'dso');
    close(r.value, 150 / 1000 * 365);
    assert.match(r.note, /CLOSING_BALANCE/);
  });

  it('DIO, DPO and CCC are INSUFFICIENT_DATA without COGS; DSO still works', () => {
    const results = run(base.filter(f => !f.metric.includes('cost_of_materials') && f.metric !== 'changes_in_inventories'));
    assert.equal(pick(results, 'dso').status, 'OK');
    for (const key of ['dio', 'dpo', 'ccc']) {
      const r = pick(results, key);
      assert.equal(r.status, 'INSUFFICIENT_DATA');
      assert.ok(r.missing?.some(m => m.startsWith('cost_of_materials_consumed')));
    }
  });

  it('zero inventory is a value (DIO 0), missing inventory is not', () => {
    const zero = base.map(f => (f.metric === 'inventory' ? { ...f, valueCr: 0 } : f));
    close(pick(run(zero), 'dio').value, 0);
    const missing = base.filter(f => f.metric !== 'inventory');
    assert.equal(pick(run(missing), 'dio').status, 'INSUFFICIENT_DATA');
  });
});

describe('returns on capital', () => {
  const pnl = [
    annual('pbt_before_exceptional', END, 120), annual('finance_cost', END, 20), annual('other_income', END, 10),
    annual('pbt', END, 120), annual('tax_expense', END, 30), annual('pat_total', END, 90),
    annual('pat_attributable_to_owners', END, 90),
  ];
  const bs = [
    pit('equity_total', END, 500), pit('borrowings_total', END, 200), pit('lease_liabilities', END, 50),
    pit('cash_and_equivalents', END, 100),
    pit('equity_total', PRIOR, 400), pit('borrowings_total', PRIOR, 150), pit('lease_liabilities', PRIOR, 50),
    pit('cash_and_equivalents', PRIOR, 50),
  ];

  it('ROE on average equity, ROCE on average capital employed incl. leases, ROIC on average invested capital', () => {
    const results = run([...pnl, ...bs]);
    close(pick(results, 'roe').value, 90 / 450 * 100);
    close(pick(results, 'roce').value, 140 / ((750 + 600) / 2) * 100);
    const nopat = (120 + 20 - 10) * (1 - 30 / 120);
    close(pick(results, 'roic').value, nopat / ((650 + 550) / 2) * 100);
  });

  it('ROE falls back to closing equity with a flag', () => {
    const r = pick(run([...pnl, ...bs.filter(f => f.periodEnd !== PRIOR)]), 'roe');
    close(r.value, 90 / 500 * 100);
    assert.match(r.note, /CLOSING_BALANCE/);
  });

  it('ROCE without borrowings is INSUFFICIENT_DATA and only a labelled upper bound is offered', () => {
    const noDebt = [...pnl, ...bs.filter(f => f.metric !== 'borrowings_total')];
    const results = run(noDebt);
    const roce = pick(results, 'roce');
    assert.equal(roce.status, 'INSUFFICIENT_DATA');
    assert.ok(roce.missing?.some(m => m.startsWith('borrowings_total')));
    const bound = pick(results, 'roce_upper_bound');
    close(bound.value, 140 / 500 * 100);
    assert.match(bound.note, /UPPER_BOUND/);
  });

  it('includeLeases=false states the ex-lease basis and removes the lease requirement', () => {
    const noLease = [...pnl, ...bs.filter(f => f.metric !== 'lease_liabilities')];
    assert.equal(pick(run(noLease), 'roce').status, 'INSUFFICIENT_DATA');
    const r = pick(run(noLease, { includeLeases: false }), 'roce');
    assert.equal(r.status, 'OK');
    assert.match(r.formula, /leases excluded/);
  });

  it('ROIC needs an evidenced tax rate: non-positive PBT -> NOT_APPLICABLE', () => {
    const loss = pnl.map(f => (f.metric === 'pbt' ? { ...f, valueCr: -5 } : f));
    assert.equal(pick(run([...loss, ...bs]), 'roic').status, 'NOT_APPLICABLE');
  });

  it('incremental ROIC over a stated window; non-positive capital change is NOT_APPLICABLE', () => {
    const y0 = '2023-03-31';
    const earlier = [
      annual('pbt_before_exceptional', y0, 60), annual('finance_cost', y0, 10), annual('other_income', y0, 5),
      annual('pbt', y0, 60), annual('tax_expense', y0, 15),
      pit('equity_total', y0, 250), pit('borrowings_total', y0, 100), pit('lease_liabilities', y0, 50),
      pit('cash_and_equivalents', y0, 50),
    ];
    const r = pick(run([...pnl, ...bs, ...earlier]), 'incremental_roic_3y');
    const nopatNow = 130 * 0.75;
    const nopatThen = 65 * 0.75;
    close(r.value, (nopatNow - nopatThen) / (650 - 350) * 100);
    assert.match(r.note, /window 3 years/);
    const shrunk = earlier.map(f => (f.metric === 'equity_total' ? { ...f, valueCr: 900 } : f));
    assert.equal(pick(run([...pnl, ...bs, ...shrunk]), 'incremental_roic_3y').status, 'NOT_APPLICABLE');
    assert.equal(pick(run([...pnl, ...bs]), 'incremental_roic_3y').status, 'INSUFFICIENT_DATA');
  });
});
