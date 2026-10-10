import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fact } from '../../../src/server/research_v2/domain/types.js';
import { createInMemoryFactSource } from '../../../src/server/research_v2/facts/inMemoryFactSource.js';
import {
  MixedScopeError, applyReadPolicy, asOfInstant, parseInstant,
} from '../../../src/server/research_v2/facts/readPolicy.js';
import { fact } from '../db/helpers.js';

const ASOF = '2026-01-01T00:00:00Z';
const query = { asOf: ASOF };
const reasons = (facts: Fact[], q = query, options = {}) =>
  applyReadPolicy(facts, q, options).rejections.map((r) => r.reason);

test('a clean fact passes untouched', () => {
  const result = applyReadPolicy([fact()], query);
  assert.equal(result.facts.length, 1);
  assert.deepEqual(result.rejections, []);
});

test('quarantined facts are rejected', () => {
  assert.deepEqual(reasons([fact({ quarantined: true })]), ['QUARANTINED']);
});

test('SIMULATED tier is rejected', () => {
  assert.deepEqual(reasons([fact({ sourceTier: 'SIMULATED' })]), ['SIMULATED']);
});

test('missing, NaN and infinite values are rejected', () => {
  assert.deepEqual(reasons([fact({ valueCr: null })]), ['MISSING_VALUE']);
  assert.deepEqual(reasons([fact({ valueCr: Number.NaN })]), ['NAN_VALUE']);
  assert.deepEqual(reasons([fact({ valueCr: Number.POSITIVE_INFINITY })]), ['NAN_VALUE']);
  assert.deepEqual(reasons([fact({ valueCr: undefined as never })]), ['MISSING_VALUE']);
});

test('LATEST* period strings and non-ISO periods are rejected', () => {
  assert.deepEqual(reasons([fact({ periodEnd: 'LATEST' })]), ['LATEST_PERIOD']);
  assert.deepEqual(reasons([fact({ periodStart: 'latest_q' })]), ['LATEST_PERIOD']);
  assert.deepEqual(reasons([fact({ periodEnd: 'Q1FY26' })]), ['INVALID_PERIOD']);
});

test('UNIT_SUSPECT and PERIOD_RECON_FAIL facts are rejected', () => {
  assert.deepEqual(reasons([fact({ qualityFlags: ['UNIT_SUSPECT'] })]), ['UNIT_SUSPECT']);
  assert.deepEqual(reasons([fact({ qualityFlags: ['DERIVED', 'PERIOD_RECON_FAIL'] })]), ['PERIOD_RECON_FAIL']);
  assert.equal(applyReadPolicy([fact({ qualityFlags: ['UNIT_CONVERTED', 'DERIVED'] })], query).facts.length, 1);
});

test('a flagged latest vintage is not silently replaced by an older clean vintage', () => {
  const old = fact({ factId: 'old', availableAt: '2025-08-01T00:00:00Z', vintage: 1 });
  const flagged = fact({
    factId: 'new', availableAt: '2025-09-01T00:00:00Z', vintage: 2, qualityFlags: ['UNIT_SUSPECT'],
  });
  const result = applyReadPolicy([old, flagged], query);
  assert.deepEqual(result.facts, []);
  assert.deepEqual(result.rejections.map((r) => r.factId), ['new']);
});

test('a quarantined latest vintage is treated as non-existent, so the older clean vintage stands', () => {
  const old = fact({ factId: 'old' });
  const bad = fact({ factId: 'new', availableAt: '2025-09-01T00:00:00Z', vintage: 2, quarantined: true });
  assert.deepEqual(applyReadPolicy([old, bad], query).facts.map((f) => f.factId), ['old']);
});

test('future-dated facts are rejected using an instant comparison', () => {
  const later = fact({ availableAt: '2026-01-01T00:00:01Z' });
  assert.deepEqual(reasons([later]), ['FUTURE_DATED']);
  assert.equal(applyReadPolicy([fact({ availableAt: '2026-01-01T00:00:00Z' })], query).facts.length, 1);
  // +05:30 offset: 2026-01-01T05:00+05:30 is 2025-12-31T23:30Z, which is before the as-of instant
  const offset = fact({ availableAt: '2026-01-01T05:00:00+05:30' });
  assert.equal(applyReadPolicy([offset], query).facts.length, 1);
  const offsetLater = fact({ availableAt: '2026-01-01T05:31:00+05:30' });
  assert.deepEqual(reasons([offsetLater]), ['FUTURE_DATED']);
});

test('a string comparison would be wrong but the instant comparison is right', () => {
  // '2026-01-01 00:00:00' sorts before '2026-01-01T00:00:00Z' as text yet is the same instant
  const same = fact({ availableAt: '2026-01-01 00:00:00' });
  assert.equal(applyReadPolicy([same], query).facts.length, 1);
});

test('a date-only asOf means the end of that day', () => {
  const evening = fact({ availableAt: '2026-01-01T18:00:00Z' });
  assert.equal(applyReadPolicy([evening], { asOf: '2026-01-01' }).facts.length, 1);
  assert.deepEqual(reasons([evening], { asOf: '2025-12-31' }), ['FUTURE_DATED']);
  assert.equal(parseInstant('2026-01-01'), Date.parse('2026-01-01T23:59:59.999Z'));
});

test('an unparseable asOf throws and an unparseable availableAt is rejected', () => {
  assert.throws(() => asOfInstant('soon'), /Invalid asOf/);
  assert.throws(() => applyReadPolicy([fact()], { asOf: '' }), /Invalid asOf/);
  assert.deepEqual(reasons([fact({ availableAt: 'n/a' })]), ['INVALID_AVAILABLE_AT']);
});

test('minimum source tier excludes weaker tiers', () => {
  const provider = fact({ sourceTier: 'PROVIDER_VERIFIED' });
  const lead = fact({ factId: 'lead', metric: 'other_income', sourceTier: 'SECONDARY_LEAD' });
  const result = applyReadPolicy([provider, lead], query, { minTier: 'PROVIDER_VERIFIED' });
  assert.deepEqual(result.facts.map((f) => f.factId), ['f1']);
  assert.deepEqual(result.rejections.map((r) => r.reason), ['BELOW_MIN_TIER']);
  assert.deepEqual(reasons([provider], query, { minTier: 'STATUTORY' }), ['BELOW_MIN_TIER']);
});

test('unresolved conflicts reject only when required', () => {
  const conflicted = new Set(['f1']);
  assert.equal(applyReadPolicy([fact()], query, { conflictedFactIds: conflicted }).facts.length, 1);
  const strict = { requireResolvedConflicts: true, conflictedFactIds: conflicted };
  assert.deepEqual(reasons([fact()], query, strict), ['UNRESOLVED_CONFLICT']);
});

test('mixed scope in one request is rejected; an explicit scope narrows instead', () => {
  const both = [fact(), fact({ factId: 's', scope: 'STANDALONE' })];
  const mixed = applyReadPolicy(both, query);
  assert.deepEqual(mixed.facts, []);
  assert.deepEqual(mixed.rejections.map((r) => r.reason), ['MIXED_SCOPE', 'MIXED_SCOPE']);
  const scoped = applyReadPolicy(both, { ...query, scope: 'STANDALONE' });
  assert.deepEqual(scoped.facts.map((f) => f.factId), ['s']);
  assert.deepEqual(scoped.rejections, []);
});

test('different isins each with a single scope are not mixed', () => {
  const two = [fact(), fact({ factId: 'o', isin: 'INE000000002', scope: 'STANDALONE' })];
  assert.equal(applyReadPolicy(two, query).facts.length, 2);
});

test('exactly one vintage per key: the latest available, ignoring later ones', () => {
  const v1 = fact({ factId: 'v1', valueCr: 100, vintage: 1, availableAt: '2025-08-01T00:00:00Z' });
  const v2 = fact({ factId: 'v2', valueCr: 105, vintage: 2, availableAt: '2025-10-01T00:00:00Z' });
  const v3 = fact({ factId: 'v3', valueCr: 999, vintage: 3, availableAt: '2026-06-01T00:00:00Z' });
  const result = applyReadPolicy([v3, v1, v2], query);
  assert.deepEqual(result.facts.map((f) => f.factId), ['v2']);
  assert.deepEqual(result.rejections.map((r) => [r.factId, r.reason]), [['v3', 'FUTURE_DATED']]);
});

test('scope and period type are part of the key: no collapsing across them', () => {
  const facts = [
    fact({ factId: 'q' }),
    fact({ factId: 'ytd', periodType: 'YTD_3M' }),
    fact({ factId: 'st', scope: 'STANDALONE' }),
  ];
  const result = applyReadPolicy(facts, { ...query, scope: 'CONSOLIDATED' });
  assert.deepEqual(result.facts.map((f) => f.factId).sort(), ['q', 'ytd']);
});

test('results are sorted by real period end, not by input order or text of factId', () => {
  const facts = [
    fact({ factId: 'a', periodStart: '2025-10-01', periodEnd: '2025-12-31' }),
    fact({ factId: 'b', periodStart: '2025-04-01', periodEnd: '2025-06-30' }),
    fact({ factId: 'c', periodStart: '2025-07-01', periodEnd: '2025-09-30' }),
  ];
  assert.deepEqual(applyReadPolicy(facts, query).facts.map((f) => f.factId), ['b', 'c', 'a']);
});

test('in-memory source: applies the policy, throws on mixed scope, and does not alias its input', () => {
  const input = [fact(), fact({ factId: 'x', metric: 'other_income', valueCr: Number.NaN })];
  const source = createInMemoryFactSource(input);
  assert.deepEqual(source.facts(query).map((f) => f.factId), ['f1']);
  assert.deepEqual(source.explain(query).rejections.map((r) => r.reason), ['NAN_VALUE']);
  input[0].valueCr = -1;
  assert.equal(source.facts(query)[0].valueCr, 100);
  const mixed = createInMemoryFactSource([fact(), fact({ factId: 's', scope: 'STANDALONE' })]);
  assert.throws(() => mixed.facts(query), MixedScopeError);
  assert.equal(mixed.facts({ ...query, scope: 'CONSOLIDATED' }).length, 1);
});

test('query narrowing by isin, symbol, metric and period type', () => {
  const facts = [
    fact(), fact({ factId: 'o', isin: 'INE000000002', symbol: 'OTHER' }),
    fact({
      factId: 'm', metric: 'pat_total', periodType: 'ANNUAL', periodStart: '2025-04-01', periodEnd: '2026-03-31',
    }),
  ];
  const source = createInMemoryFactSource(facts);
  assert.deepEqual(source.facts({ ...query, isin: 'INE000000002' }).map((f) => f.factId), ['o']);
  assert.deepEqual(source.facts({ ...query, symbol: 'TATATECH', metric: 'pat_total' }).map((f) => f.factId), ['m']);
  const annual = source.facts({ ...query, isin: 'INE000000001', periodTypes: ['ANNUAL'] });
  assert.deepEqual(annual.map((f) => f.factId), ['m']);
});
