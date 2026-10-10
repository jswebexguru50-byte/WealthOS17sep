import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScorecard } from '../../../src/server/research_v2/filters/scorecard.js';
import { resolveThresholds } from '../../../src/server/research_v2/filters/thresholds.js';
import { annualFacts, fact, inputFor, inst, promoter, quarterlyPats, pledge } from './fixtures.js';

const row = (rows: ReturnType<typeof buildScorecard>, id: number) => rows.find(r => r.filterId === id)!;

test('P1 stored ebitda_derived must not override components (TATATECH 745.22 vs 852.95)', () => {
  // stored value is after exceptional (745.22); components give 852.95. calc/measures.ts prefers components.
  const f = annualFacts({ pbt: 600, fin: 100, dep: 200, oi: 47.05, cfo: 775.7, ebitda: 745.22 });
  const r = row(buildScorecard(inputFor(f, {})), 7);
  assert.equal(r.observed, 0.909);
});

test('P2 undefined override key must not erase a default threshold', () => {
  const t = resolveThresholds({ roce: undefined } as never);
  assert.equal(t.roce.value, 35);
});

test('P3 official pledge must not be labelled PROVIDER (no basis on PledgePoint)', () => {
  const r = row(buildScorecard(inputFor([], { pledge: [{ ...pledge(0), source: 'NSE-SHP-official' }] })), 5);
  assert.notEqual(r.basis, 'PROVIDER');
});

test('P4 duplicate institutional points with conflicting values must not be silently picked', () => {
  const r = row(buildScorecard(inputFor([], { institutional: [
    inst('2026-06-30', 10, 5, 5), inst('2026-06-30', 20, 5, 5), inst('2026-03-31', 9, 5, 5)] })), 6);
  assert.equal(r.status === 'UNVERIFIABLE' || r.note?.includes('conflict'), true);
});

test('P5 stale latest quarter (2 years old) should be flagged / not treated as current', () => {
  const ends = ['2024-06-30', '2024-03-31', '2023-12-31', '2023-09-30', '2023-06-30', '2023-03-31', '2022-12-31', '2022-09-30'];
  const f = ends.map(e => fact('pat_attributable_to_owners', 'DISCRETE_Q', e, 5));
  const r = row(buildScorecard(inputFor(f, {})), 2);
  assert.ok(r.status === 'UNVERIFIABLE' || /stale/i.test(r.note ?? ''));
});

test('P6 provider ROCE dated after asOf must not be used (look-ahead)', () => {
  const r = row(buildScorecard(inputFor([], {}, { providerRoce: { value: 40, asOf: '2027-01-01', source: 'tl' } })), 3);
  assert.equal(r.status, 'UNVERIFIABLE');
});

test('P7 pledge point dated after asOf must not be used', () => {
  const r = row(buildScorecard(inputFor([], { pledge: [pledge(0, '2027-03-31')] })), 5);
  assert.equal(r.status, 'UNVERIFIABLE');
});

test('P8 promoter point dated after asOf must not be used', () => {
  const r = row(buildScorecard(inputFor([], { promoter: { value: 70, quarterEnd: '2027-03-31', source: 's' } })), 1);
  assert.equal(r.status, 'UNVERIFIABLE');
});

test('P1b stored ebitda_derived is used only when components are missing', () => {
  const f = annualFacts({ cfo: 500, ebitda: 800 });
  const r = row(buildScorecard(inputFor(f, {})), 7);
  assert.equal(r.observed, 0.625);
  assert.match(r.note ?? '', /components missing/);
});

test('P2b malformed or unknown threshold overrides fail clearly', () => {
  assert.throws(() => resolveThresholds({ roce: { value: 'x', comparator: '>=' } } as never), /Invalid threshold/);
  assert.throws(() => resolveThresholds({ roce: { value: 1, comparator: '~' } } as never), /Invalid threshold/);
  assert.throws(() => resolveThresholds({ nope: { value: 1, comparator: '>' } } as never), /Unknown threshold/);
  assert.equal(resolveThresholds({ roce: { value: 20, comparator: '>=' } }).roce.value, 20);
});

test('P3b explicit basis wins over source-name inference', () => {
  const p = { ...pledge(0), basis: 'OFFICIAL' as const };
  assert.equal(row(buildScorecard(inputFor([], { pledge: [p] })), 5).basis, 'OFFICIAL');
  assert.equal(row(buildScorecard(inputFor([], { pledge: [pledge(0)] })), 5).basis, 'PROVIDER');
});

test('P4b identical duplicates are accepted; conflicting pledge duplicates are UNVERIFIABLE', () => {
  const same = row(buildScorecard(inputFor([], { institutional: [
    inst('2026-06-30', 10, 5, 5), inst('2026-06-30', 10, 5, 5)] })), 6);
  assert.equal(same.observed, 20);
  const conflict = row(buildScorecard(inputFor([], { pledge: [pledge(0), pledge(30)] })), 5);
  assert.equal(conflict.status, 'UNVERIFIABLE');
  assert.match(conflict.reasonIfUnverifiable ?? '', /Conflicting/);
});

test('P4c conflicting prior quarter drops QoQ but keeps the latest level', () => {
  const r = row(buildScorecard(inputFor([], { institutional: [
    inst('2026-06-30', 10, 5, 5), inst('2026-03-31', 9, 5, 5), inst('2026-03-31', 8, 5, 5)] })), 6);
  assert.equal(r.observed, 20);
  assert.equal(r.qoqChange, null);
});

test('P5b implausible span for a labelled quarter is ignored, not used', () => {
  const ends = ['2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31',
    '2024-09-30'];
  const f = ends.map(e => fact('pat_attributable_to_owners', 'DISCRETE_Q', e, 5));
  f[0] = fact('pat_attributable_to_owners', 'DISCRETE_Q', '2026-06-30', 5, { periodStart: '2025-07-01' });
  const r = row(buildScorecard(inputFor(f, {})), 2);
  assert.equal(r.status, 'UNVERIFIABLE');
});

test('P5c stale annual period is UNVERIFIABLE for ROE, ROCE and CFO/EBITDA unless the caller fixed it', () => {
  const f = annualFacts({ pbt: 600, fin: 100, dep: 200, oi: 47, pat: 500, cfo: 800, equity: 1000, borrow: 100 });
  const old = inputFor(f, {}, { asOf: '2028-10-10T00:00:00Z' });
  const rows = buildScorecard(old);
  for (const id of [4, 7]) assert.match(row(rows, id).reasonIfUnverifiable ?? '', /stale/);
  const pinned = buildScorecard({ ...old, periodEnd: '2026-03-31' });
  assert.notEqual(row(pinned, 7).status, 'UNVERIFIABLE');
});

test('P6b provider ROCE dated on or before as-of still works', () => {
  const r = row(buildScorecard(inputFor([], {}, { providerRoce: { value: 40, asOf: '2026-03-31', source: 'tl' } })), 3);
  assert.equal(r.basis, 'PROVIDER');
  assert.equal(r.observed, 40);
});
