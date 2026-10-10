import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScorecard, summaryLine } from '../../../src/server/research_v2/filters/scorecard.js';
import { DEFAULT_THRESHOLDS } from '../../../src/server/research_v2/filters/thresholds.js';
import { compareToThreshold } from '../../../src/server/research_v2/filters/compare.js';
import { isQuarterEnd, quarterEndsBack, shiftMonthEnd } from '../../../src/server/research_v2/filters/dates.js';
import {
  annualFacts, fact, factSource, inputFor, inst, ownership, pledge, promoter, quarterlyPats,
} from './fixtures.js';

const row = (rows: ReturnType<typeof buildScorecard>, id: number) => rows.find(r => r.filterId === id)!;

test('empty inputs: all seven rows UNVERIFIABLE with reasons and no defaulted numbers', () => {
  const rows = buildScorecard(inputFor([], {}));
  assert.equal(rows.length, 7);
  for (const r of rows) {
    assert.equal(r.observed, null, `filter ${r.filterId}`);
    assert.equal(r.status, 'UNVERIFIABLE', `filter ${r.filterId}`);
    assert.ok(r.reasonIfUnverifiable, `filter ${r.filterId}`);
  }
  assert.equal(summaryLine(rows), '0 of 0 evaluable checks meet their thresholds; 7 unverifiable');
});

test('mixed scopes: standalone quarters do not fill a consolidated window', () => {
  const cons = quarterlyPats([5, 5, 5, 5, 5]);
  const standalone = quarterlyPats([5, 5, 5, 5, 5, 5, 5, 5], 'STANDALONE');
  const r = row(buildScorecard(inputFor([...cons, ...standalone], {})), 2);
  assert.equal(r.status, 'UNVERIFIABLE');
  assert.equal(r.quartersAvailable, 5);
  assert.equal(r.scope, 'CONSOLIDATED');
});

test('a source that leaks other-scope facts is defended against', () => {
  const facts = [...quarterlyPats([5, 5, 5, 5, 5], 'CONSOLIDATED'), ...quarterlyPats([5, 5, 5, 5, 5, 5, 5, 5], 'STANDALONE')];
  const input = { ...inputFor(facts, {}), facts: factSource(facts, true) };
  assert.equal(row(buildScorecard(input), 2).quartersAvailable, 5);
});

test('annual facts of the other scope are ignored for ROE', () => {
  const facts = annualFacts({ pat: 50, equity: 200 }, 'STANDALONE');
  assert.equal(row(buildScorecard(inputFor(facts, {})), 4).status, 'UNVERIFIABLE');
});

test('a gap in the 8 quarters is UNVERIFIABLE and names the missing quarter', () => {
  const r = row(buildScorecard(inputFor(quarterlyPats([5, 5, 5, null, 5, 5, 5, 5]), {})), 2);
  assert.equal(r.status, 'UNVERIFIABLE');
  assert.match(r.reasonIfUnverifiable ?? '', /2025-09-30/);
});

test('pat_total is a flagged fallback when owners PAT is absent', () => {
  const facts = quarterlyPats([5, 5, 5, 5, 5, 5, 5, 5], 'CONSOLIDATED', 'pat_total');
  const r = row(buildScorecard(inputFor(facts, {})), 2);
  assert.equal(r.observed, 8);
  assert.match(r.note ?? '', /PAT total/);
});

test('a null-valued quarter fact is treated as missing, never zero', () => {
  const facts = [...quarterlyPats([5, 5, 5, 5, 5, 5, 5]), fact('pat_attributable_to_owners', 'DISCRETE_Q', '2024-09-30', null)];
  assert.equal(row(buildScorecard(inputFor(facts, {})), 2).status, 'UNVERIFIABLE');
});

test('simulated and quarantined facts are not used', () => {
  const facts = annualFacts({ pat: 50, equity: 200 }).map((f, i) =>
    (i % 2 === 0 ? { ...f, sourceTier: 'SIMULATED' as const } : { ...f, quarantined: true }));
  assert.equal(row(buildScorecard(inputFor(facts, {})), 4).status, 'UNVERIFIABLE');
});

test('facts not yet available at the as-of instant are not used (point in time)', () => {
  const facts = annualFacts({ pat: 50, equity: 200 }).map(f => ({ ...f, availableAt: '2026-12-01T00:00:00Z' }));
  assert.equal(row(buildScorecard(inputFor(facts, {})), 4).status, 'UNVERIFIABLE');
});

test('banks and NBFCs: ROCE and CFO/EBITDA are NOT_APPLICABLE, ROE still computed', () => {
  const facts = annualFacts({ pbt: 100, fin: 500, pat: 80, equity: 1000, cfo: 90, ebitda: 600 });
  const rows = buildScorecard(inputFor(facts, { promoter: promoter(70) }, { isFinancial: true }));
  assert.equal(row(rows, 3).status, 'NOT_APPLICABLE');
  assert.equal(row(rows, 7).status, 'NOT_APPLICABLE');
  assert.equal(row(rows, 3).observed, null);
  assert.equal(row(rows, 4).status, 'BELOW_THRESHOLD');
  assert.match(row(rows, 3).note ?? '', /Banks and NBFCs/);
});

test('ROCE derived from average capital employed when borrowings exist', () => {
  const facts = annualFacts({ pbt: 180, fin: 20, equity: 700, equityOpen: 500, borrow: 300, borrowOpen: 300 });
  const r = row(buildScorecard(inputFor(facts, {})), 3);
  // EBIT 200 / average(1000, 800) = 22.22
  assert.equal(r.basis, 'DERIVED');
  assert.ok(Math.abs((r.observed as number) - 22.222) < 0.01);
  assert.equal(r.status, 'BELOW_THRESHOLD');
});

test('ROCE upper bound above threshold is UNVERIFIABLE, not a pass', () => {
  const r = row(buildScorecard(inputFor(annualFacts({ pbt: 450, fin: 0, equity: 1000 }), {})), 3);
  assert.equal(r.basis, 'UPPER_BOUND');
  assert.equal(r.observed, 45);
  assert.equal(r.status, 'UNVERIFIABLE');
  assert.match(r.reasonIfUnverifiable ?? '', /bound/);
});

test('ROCE with missing finance cost is not computed (not read as zero)', () => {
  const r = row(buildScorecard(inputFor(annualFacts({ pbt: 100, equity: 1000 }), {})), 3);
  assert.equal(r.observed, null);
  assert.equal(r.status, 'UNVERIFIABLE');
});

test('ROCE lease basis without lease data falls back to an upper bound', () => {
  const facts = annualFacts({ pbt: 100, fin: 10, equity: 1000, borrow: 100 });
  const r = row(buildScorecard(inputFor(facts, {}, { includeLeaseInCapitalEmployed: true })), 3);
  assert.equal(r.basis, 'UPPER_BOUND');
});

test('ROE uses average equity when opening equity exists and no CLOSING_BALANCE flag', () => {
  const r = row(buildScorecard(inputFor(annualFacts({ pat: 90, equity: 1100, equityOpen: 900 }), {})), 4);
  assert.equal(r.observed, 9);
  assert.ok(!r.flags?.includes('CLOSING_BALANCE'));
});

test('ROE with non-positive equity is UNVERIFIABLE', () => {
  const r = row(buildScorecard(inputFor(annualFacts({ pat: 90, equity: -5 }), {})), 4);
  assert.equal(r.status, 'UNVERIFIABLE');
});

test('pledge: null is UNVERIFIABLE; within tolerance meets; above tolerance is ABOVE', () => {
  const run = (v: number | null) => row(buildScorecard(inputFor([], { pledge: [pledge(v)] })), 5);
  assert.equal(run(null).status, 'UNVERIFIABLE');
  assert.equal(run(0.005).status, 'MEETS_THRESHOLD');
  assert.equal(run(2.5).status, 'ABOVE_THRESHOLD');
  assert.equal(run(2.5).gap, 2.5);
  assert.equal(run(130).status, 'UNVERIFIABLE');
});

test('pledge: uses the latest dated known point and notes a newer empty point', () => {
  const r = row(buildScorecard(inputFor([], { pledge: [pledge(0, '2026-03-31'), pledge(null, '2026-06-30')] })), 5);
  assert.equal(r.observed, 0);
  assert.equal(r.asOf, '2026-03-31');
  assert.match(r.note ?? '', /no value/);
});

test('promoter: missing, null and out-of-range are UNVERIFIABLE; no pledge condition is applied', () => {
  assert.equal(row(buildScorecard(inputFor([], {})), 1).status, 'UNVERIFIABLE');
  assert.equal(row(buildScorecard(inputFor([], { promoter: promoter(null) })), 1).status, 'UNVERIFIABLE');
  assert.equal(row(buildScorecard(inputFor([], { promoter: promoter(140) })), 1).status, 'UNVERIFIABLE');
  assert.equal(row(buildScorecard(inputFor([], { promoter: promoter(70), pledge: [] })), 1).status, 'MEETS_THRESHOLD');
});

test('promoter at exactly the threshold does not meet ">" 66.6', () => {
  assert.equal(row(buildScorecard(inputFor([], { promoter: promoter(66.6) })), 1).status, 'BELOW_THRESHOLD');
});

test('institutional: monthly points are ignored; incomplete components are UNVERIFIABLE', () => {
  const monthly = row(buildScorecard(inputFor([], { institutional: [inst('2026-07-31', 5, 5, 5)] })), 6);
  assert.equal(monthly.status, 'UNVERIFIABLE');
  const partial = row(buildScorecard(inputFor([], { institutional: [inst('2026-06-30', 5, null, 5)] })), 6);
  assert.equal(partial.status, 'UNVERIFIABLE');
  assert.match(partial.reasonIfUnverifiable ?? '', /dii_other/);
});

test('institutional: level shown without QoQ when the prior quarter-end is absent', () => {
  const own = { institutional: [inst('2026-06-30', 5, 5, 5), inst('2025-12-31', 1, 1, 1)] };
  const r = row(buildScorecard(inputFor([], own)), 6);
  assert.equal(r.observed, 15);
  assert.equal(r.qoqChange, null);
  assert.match(r.note ?? '', /QoQ change not available/);
});

test('institutional with a configured threshold is compared; default stays informational', () => {
  const own = { institutional: [inst('2026-06-30', 5, 5, 5)] };
  assert.equal(row(buildScorecard(inputFor([], own)), 6).status, 'NOT_APPLICABLE');
  const cfg = { institutional: { value: 20, comparator: '>=' as const } };
  assert.equal(row(buildScorecard(inputFor([], own), cfg), 6).status, 'BELOW_THRESHOLD');
});

test('CFO/EBITDA: duration mismatch, missing inputs and non-positive EBITDA are UNVERIFIABLE', () => {
  const mismatch = [fact('cfo', 'ANNUAL', '2026-03-31', 50),
    fact('ebitda_derived', 'ANNUAL', '2026-03-31', 100, { periodStart: '2025-04-05' })];
  assert.match(row(buildScorecard(inputFor(mismatch, {})), 7).reasonIfUnverifiable ?? '', /different durations/);
  const missing = row(buildScorecard(inputFor([fact('cfo', 'ANNUAL', '2026-03-31', 50)], {})), 7);
  assert.match(missing.reasonIfUnverifiable ?? '', /components missing/);
  const r = row(buildScorecard(inputFor(annualFacts({ cfo: 50, ebitda: -10 }), {})), 7);
  assert.equal(r.status, 'UNVERIFIABLE');
  assert.match(r.reasonIfUnverifiable ?? '', /not positive/);
});

test('CFO/EBITDA does not mix a quarter with a year', () => {
  const facts = [fact('cfo', 'ANNUAL', '2026-03-31', 50), fact('ebitda_derived', 'DISCRETE_Q', '2026-03-31', 100)];
  assert.equal(row(buildScorecard(inputFor(facts, {})), 7).status, 'UNVERIFIABLE');
});

test('threshold overrides apply per run and defaults are not mutated', () => {
  const before = JSON.stringify(DEFAULT_THRESHOLDS);
  const facts = annualFacts({ pat: 30, equity: 100 });
  const strict = row(buildScorecard(inputFor(facts, {}), { roe: { value: 35, comparator: '>=' } }), 4);
  assert.equal(strict.status, 'BELOW_THRESHOLD');
  assert.equal(strict.threshold, 35);
  assert.equal(row(buildScorecard(inputFor(facts, {})), 4).status, 'MEETS_THRESHOLD');
  assert.equal(JSON.stringify(DEFAULT_THRESHOLDS), before);
});

test('compareToThreshold edge cases', () => {
  assert.equal(compareToThreshold(25, { value: 25, comparator: '>=' }).status, 'MEETS_THRESHOLD');
  assert.equal(compareToThreshold(24.99, { value: 25, comparator: '>=' }).status, 'BELOW_THRESHOLD');
  assert.equal(compareToThreshold(1, { value: null, comparator: 'info' }).gap, null);
  assert.equal(compareToThreshold(3, { value: 3, comparator: '==', tolerance: 0.1 }).status, 'MEETS_THRESHOLD');
  assert.equal(compareToThreshold(4, { value: 3, comparator: '==' }).status, 'ABOVE_THRESHOLD');
});

test('date helpers', () => {
  assert.equal(shiftMonthEnd('2026-06-30', -3), '2026-03-31');
  assert.equal(shiftMonthEnd('2026-03-31', -12), '2025-03-31');
  assert.equal(shiftMonthEnd('2026-03-31', -1), '2026-02-28');
  assert.deepEqual(quarterEndsBack('2026-03-31', 3), ['2026-03-31', '2025-12-31', '2025-09-30']);
  assert.ok(isQuarterEnd('2026-09-30'));
  assert.ok(!isQuarterEnd('2026-09-29'));
  assert.ok(!isQuarterEnd('2026-07-31'));
  assert.ok(!isQuarterEnd('garbage'));
});

test('summaryLine does not count informational or not-applicable rows as evaluable', () => {
  const rows = buildScorecard(inputFor([], { promoter: promoter(70) }, { isFinancial: true }));
  assert.equal(summaryLine(rows), '1 of 1 evaluable checks meet their thresholds; 4 unverifiable');
});

test('ownership fixture helper keeps source methods independent of facts', () => {
  const o = ownership({ promoter: promoter(50) });
  assert.equal(o.promoterOfficial('x')?.value, 50);
  assert.deepEqual(o.pledgeSeries('x'), []);
});
