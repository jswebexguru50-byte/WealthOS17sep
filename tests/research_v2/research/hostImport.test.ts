import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResearchBudgets } from '../../../src/server/research_v2/research/budget.js';
import { HostAgentImportAdapter, loadResearchItemSchema } from '../../../src/server/research_v2/research/hostImport.js';
import { validateJsonSchema } from '../../../src/server/research_v2/research/jsonSchemaLite.js';
import { candidate, countItems, filing, memoryStore } from './helpers.js';

function adapter(caps?: { maxSearches: number; maxFetches: number }) {
  const { db, store } = memoryStore();
  const budgets = new ResearchBudgets(caps);
  return { db, store, budgets, adapter: new HostAgentImportAdapter(store, budgets) };
}

test('the schema file loads and declares the required item fields', () => {
  const schema = loadResearchItemSchema();
  assert.deepEqual(schema.required, ['items']);
  const item = schema.$defs?.['item'];
  assert.deepEqual(item?.required, ['symbol', 'tier', 'url', 'retrievedAt', 'excerpt']);
});

test('a valid envelope imports; primary items go first so secondary items can trace to them', () => {
  const { adapter: a, store } = adapter();
  const primary = filing();
  const report = a.import({
    items: [candidate({ tracedTo: primary.url }, 'traced'), primary],
    effort: { TATATECH: { searches: 3, fetches: 2 } },
  });
  assert.equal(report.accepted, true);
  assert.deepEqual(report.counts, { STORED: 2 });
  const traced = store.list('TATATECH').find((i) => i.tier === 'SECONDARY');
  assert.equal(traced?.status, 'VERIFIED');
});

test('JSON text and a bare array are accepted', () => {
  const { adapter: a, db } = adapter();
  const text = JSON.stringify([candidate({}, 'p'), candidate({}, 'q')]);
  const report = a.import(text);
  assert.equal(report.accepted, true);
  assert.equal(countItems(db), 2);
});

test('invalid JSON text is refused without writes', () => {
  const { adapter: a, db } = adapter();
  const report = a.import('{not json');
  assert.equal(report.accepted, false);
  assert.match(report.errors[0] ?? '', /invalid JSON/);
  assert.equal(countItems(db), 0);
});

test('schema violations refuse the whole import: missing field, bad enum, extra field, bad sub-question id', () => {
  const { adapter: a, db } = adapter();
  const good = candidate({}, 'g');
  const noExcerpt = { ...good } as Record<string, unknown>;
  delete noExcerpt['excerpt'];
  const cases: Array<[string, unknown, RegExp]> = [
    ['missing excerpt', { items: [good, noExcerpt] }, /\/items\/1\/excerpt: is required/],
    ['bad tier', { items: [{ ...good, tier: 'GOLD' }] }, /tier: must be one of/],
    ['extra field', { items: [{ ...good, secret: 'x' }] }, /secret: is not allowed/],
    ['bad sub-question', { items: [{ ...good, subQuestionIds: ['Q30'] }] }, /subQuestionIds\/0: does not match/],
    ['bad date', { items: [{ ...good, retrievedAt: 'later' }] }, /retrievedAt: not a valid date-time/],
    ['bad status', { items: [{ ...good, status: 'GREAT' }] }, /status: must be one of/],
    ['no items', {}, /items: is required/],
    ['items not an array', { items: 'x' }, /items: expected array/],
    ['empty excerpt', { items: [{ ...good, excerpt: '' }] }, /excerpt: shorter than 1/],
    ['bad effort', { items: [], effort: { X: { searches: -1 } } }, /searches: below 0/],
  ];
  for (const [name, payload, pattern] of cases) {
    const report = a.import(payload);
    assert.equal(report.accepted, false, name);
    assert.ok(report.errors.some((e) => pattern.test(e)), `${name}: ${report.errors.join(' | ')}`);
  }
  assert.equal(countItems(db), 0);
});

test('a claimed VERIFIED status on an untraced secondary item is not honoured', () => {
  const { adapter: a, store } = adapter();
  const report = a.import({ items: [candidate({ status: 'VERIFIED', tier: 'PRIMARY' }, 'liar')] });
  assert.equal(report.accepted, true);
  assert.equal(store.list('TATATECH')[0]?.status, 'UNVERIFIED_LEAD');
});

test('semantic failures are reported per item while the rest import', () => {
  const { adapter: a, db } = adapter();
  const report = a.import({
    items: [
      candidate({ tracedTo: 'ri_missing' }, 'untraced'),
      candidate({ url: 'ftp://x.example/a' }, 'badurl'),
      filing(),
    ],
  });
  assert.equal(report.accepted, true);
  assert.deepEqual(report.counts, { STORED: 1, REJECTED: 1, INVALID: 1 });
  assert.equal(countItems(db), 2);
});

test('declared effort above the per-scrip caps refuses the import and charges nothing', () => {
  const { adapter: a, db, budgets } = adapter();
  const tooManySearches = a.import({ items: [filing()], effort: { TATATECH: { searches: 13, fetches: 1 } } });
  assert.equal(tooManySearches.accepted, false);
  assert.match(tooManySearches.errors[0] ?? '', /SEARCH_CAP_EXCEEDED/);
  const tooManyFetches = a.import({ items: [filing()], effort: { TATATECH: { searches: 1, fetches: 16 } } });
  assert.match(tooManyFetches.errors[0] ?? '', /FETCH_CAP_EXCEEDED/);
  assert.equal(countItems(db), 0);
  assert.deepEqual(budgets.forSymbol('TATATECH').snapshot().fetches, 0);
});

test('without declared effort every imported item counts as one fetch, cumulatively across imports', () => {
  const { adapter: a, budgets } = adapter({ maxSearches: 12, maxFetches: 3 });
  const first = a.import({ items: [candidate({}, 'a'), candidate({}, 'b')] });
  assert.equal(first.accepted, true);
  const second = a.import({ items: [candidate({}, 'c'), candidate({}, 'd')] });
  assert.equal(second.accepted, false);
  assert.match(second.errors[0] ?? '', /FETCH_CAP_EXCEEDED/);
  assert.equal(budgets.forSymbol('TATATECH').snapshot().fetches, 2);
});

test('a multi-symbol import is all-or-nothing on the budgets', () => {
  const { adapter: a, db, budgets } = adapter({ maxSearches: 12, maxFetches: 1 });
  const report = a.import({
    items: [candidate({ symbol: 'AAA' }, 'a'), candidate({ symbol: 'BBB' }, 'b'), candidate({ symbol: 'BBB' }, 'c')],
  });
  assert.equal(report.accepted, false);
  assert.equal(countItems(db), 0);
  assert.equal(budgets.forSymbol('AAA').snapshot().fetches, 0);
});

test('the lite validator handles refs, nullable types and additionalProperties schemas', () => {
  const schema = {
    type: 'object' as const,
    $defs: { n: { type: ['string', 'null'] as string[], maxLength: 3 } },
    properties: { a: { $ref: '#/$defs/n' } },
    additionalProperties: { type: 'integer' as const },
  };
  assert.deepEqual(validateJsonSchema(schema, { a: null, b: 2 }), []);
  assert.equal(validateJsonSchema(schema, { a: 'toolong' }).length, 1);
  assert.equal(validateJsonSchema(schema, { b: 'x' }).length, 1);
  assert.throws(() => validateJsonSchema({ $ref: '#/$defs/missing' }, 1), /unknown/);
});
