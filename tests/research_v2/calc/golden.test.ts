import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAllCalculators } from '../../../src/server/research_v2/calc/index.js';
import { AS_OF, ISIN, MemorySource, pick, pit, tatatechFy26, yukenFy26 } from './helpers.js';

const ctx = { isin: ISIN, asOf: AS_OF };

function near(actual: number | null, expected: number, tolerance = 0.005): void {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

describe('golden values: YUKEN FY26', () => {
  const results = runAllCalculators(new MemorySource(yukenFy26()), ctx);

  it('CFO / PAT = 41.2888 / 14.3904 = 2.87', () => {
    const r = pick(results, 'cfo_to_pat', 'FY26');
    assert.equal(r.status, 'OK');
    near(r.value, 2.87);
    assert.equal(r.scope, 'CONSOLIDATED');
  });

  it('FCF = 41.2888 - 83.0337 = -41.74 Cr (negative is a value)', () => {
    const r = pick(results, 'fcf', 'FY26');
    assert.equal(r.status, 'OK');
    near(r.value, -41.7449, 0.0001);
    assert.match(r.note, /CAPEX_BASIS: UNSPECIFIED/);
  });

  it('EBITDA = 50.52 Cr and margin 10.93% of revenue 462.17', () => {
    near(pick(results, 'ebitda_derived', 'FY26').value, 50.52, 1e-9);
    near(pick(results, 'ebitda_margin', 'FY26').value, 10.93);
  });

  it('interest coverage (PBT + interest) / interest = 3.08, 2.71 excluding other income', () => {
    near(pick(results, 'interest_coverage', 'FY26').value, 3.08);
    near(pick(results, 'interest_coverage_ex_other_income', 'FY26').value, 2.71);
  });

  it('every result carries inputs, a formula and a stated scope', () => {
    for (const r of results.filter(x => x.status === 'OK')) {
      assert.ok(r.formula.length > 0, `${r.calcId} has no formula`);
      assert.ok(r.inputs.length > 0 || r.calcId.startsWith('operating'), `${r.calcId} has no inputs`);
      assert.match(r.note, /scope CONSOLIDATED/);
    }
  });
});

describe('golden values: TATATECH FY26', () => {
  const results = runAllCalculators(new MemorySource(tatatechFy26()), ctx);

  it('EBITDA before exceptional = 852.95', () => {
    near(pick(results, 'ebitda_derived', 'FY26').value, 852.95);
  });

  it('interest coverage ~ 25.9x using PBT before exceptional', () => {
    near(pick(results, 'interest_coverage', 'FY26').value, 25.87, 0.01);
  });

  it('effective tax = 218.13 / 740.7 = 29.45% (feeds the after-tax rate shock)', () => {
    const facts = [...tatatechFy26(), pit('floating_rate_borrowings', '2026-03-31', 100)];
    const r = pick(runAllCalculators(new MemorySource(facts), ctx), 'rate_shock_25bp_after_tax', 'FY26');
    near(r.value, 100 * 0.0025 * (1 - 218.13 / 740.7), 1e-9);
  });

  it('CFO / PAT (attributable) = 775.7 / 546.59 = 1.42', () => {
    near(pick(results, 'cfo_to_pat', 'FY26').value, 1.42);
  });

  it('CFO / EBITDA = 775.7 / 852.95 = 0.909', () => {
    near(pick(results, 'cfo_to_ebitda', 'FY26').value, 0.909, 0.001);
  });
});
