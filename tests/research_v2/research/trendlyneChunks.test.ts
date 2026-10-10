import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunksToCandidates, documentKindFromType, importTrendlyneChunks,
} from '../../../src/server/research_v2/research/trendlyneChunks.js';
import { memoryStore } from './helpers.js';

const RETRIEVED = '2026-10-10T08:00:00Z';

const EXACT = 'Consolidated EBITDA for FY26 stood at Rs 852.95 crore, compared with Rs 780.10 crore in FY25.';

test('a chunk keeps its exact text and carries identity, type, period, locator, URL and times', () => {
  const { candidates, skipped } = chunksToCandidates('tatatech', {
    chunks: [{
      document_id: 'doc-77', title: 'TATATECH Annual Report FY26', document_type: 'Annual Report',
      reporting_period: 'FY26', page: 142, source_url: 'https://www.bseindia.com/ar/fy26.pdf', text: EXACT,
      published_at: '2026-07-01', retrieved_at: '2026-10-09T10:00:00Z',
    }],
  });
  assert.deepEqual(skipped, []);
  const c = candidates[0]!;
  assert.equal(c.symbol, 'TATATECH');
  assert.equal(c.excerpt, EXACT);
  assert.equal(c.url, 'https://www.bseindia.com/ar/fy26.pdf');
  assert.equal(c.title, 'TATATECH Annual Report FY26 | FY26 | page 142');
  assert.equal(c.documentKind, 'ANNUAL_REPORT');
  assert.equal(c.publishedAt, '2026-07-01');
  assert.equal(c.retrievedAt, '2026-10-09T10:00:00Z');
});

test('a filing with a primary URL becomes a VERIFIED PRIMARY item in the store', () => {
  const { store } = memoryStore();
  const { results } = importTrendlyneChunks(store, 'TATATECH', [{
    document_id: 'd1', document_type: 'Quarterly Results', source_url: 'https://www.bseindia.com/q2.pdf',
    text: EXACT, period: 'Q2 FY26',
  }], { retrievedAt: RETRIEVED, subQuestionIds: ['Q7.a'] });
  assert.equal(results[0]?.outcome, 'STORED');
  assert.equal(results[0]?.item?.tier, 'PRIMARY');
  assert.equal(results[0]?.item?.status, 'VERIFIED');
  assert.deepEqual(results[0]?.item?.subQuestionIds, ['Q7.a']);
});

test('a document without a source URL stays SECONDARY with an internal chunk URL', () => {
  const { store } = memoryStore();
  const { results } = importTrendlyneChunks(store, 'TATATECH', {
    results: [{ doc_id: 'd2', type: 'Annual Report', text: EXACT, chunk_index: 7 }],
  }, { retrievedAt: RETRIEVED });
  const item = results[0]?.item;
  assert.equal(item?.tier, 'SECONDARY');
  assert.equal(item?.status, 'UNVERIFIED_LEAD');
  assert.match(item?.url ?? '', /^trendlyne-doc:\/\/TATATECH\/d2\/chunk%207$/);
});

test('a document hosted on trendlyne.com is SECONDARY even if declared as an annual report', () => {
  const { store } = memoryStore();
  const { results } = importTrendlyneChunks(store, 'TATATECH', [{
    document_type: 'Annual Report', url: 'https://trendlyne.com/docs/1', text: EXACT,
  }], { retrievedAt: RETRIEVED });
  assert.equal(results[0]?.item?.tier, 'SECONDARY');
  assert.equal(results[0]?.item?.status, 'UNVERIFIED_LEAD');
});

test('earnings-call chunks are MANAGEMENT_CLAIM, with or without a primary URL', () => {
  const { store } = memoryStore();
  const { results } = importTrendlyneChunks(store, 'TATATECH', [
    { document_id: 'c1', document_type: 'Earnings Call Transcript', text: 'We expect margins to expand next year.' },
    {
      document_id: 'c2', document_type: 'Earnings Call', source_url: 'https://www.bseindia.com/call.pdf',
      text: 'Management guided to double-digit growth in the coming year across verticals.',
    },
  ], { retrievedAt: RETRIEVED });
  assert.deepEqual(results.map((r) => r.item?.status), ['MANAGEMENT_CLAIM', 'MANAGEMENT_CLAIM']);
  assert.deepEqual(results.map((r) => r.item?.tier), ['SECONDARY', 'PRIMARY']);
});

test('nested document records pass their metadata to each chunk and chunks get distinct items', () => {
  const { candidates } = chunksToCandidates('X', {
    documents: [{
      document_id: 'd9', title: 'Investor deck', document_type: 'Investor Presentation',
      chunks: [{ chunk_id: 1, text: 'Slide one text about order book.' }, { chunk_id: 2, text: 'Slide two text.' }],
    }],
  }, { retrievedAt: RETRIEVED });
  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0]?.url, candidates[1]?.url);
  assert.equal(candidates[0]?.documentKind, 'INVESTOR_PRESENTATION');
  assert.match(candidates[0]?.title ?? '', /^Investor deck \| chunk 1$/);
});

test('JSON text is parsed; broken text throws; chunks without text or retrieval time are skipped with a reason', () => {
  const ok = chunksToCandidates('X', JSON.stringify([{ text: 'hello world of filings', retrieved_at: RETRIEVED }]));
  assert.equal(ok.candidates.length, 1);
  assert.throws(() => chunksToCandidates('X', '{oops'), SyntaxError);
  const mixed = chunksToCandidates('X', [{ document_id: 'a', text: 'a chunk with text' }, { document_id: 'b' }], {});
  assert.equal(mixed.candidates.length, 0);
  assert.deepEqual(mixed.skipped.map((s) => s.reason), ['chunk has no retrieval time and none was supplied']);
  const noText = chunksToCandidates('X', { chunks: [{ document_id: 'b', text: '  ' }] }, { retrievedAt: RETRIEVED });
  assert.deepEqual(noText.skipped.map((s) => s.reason), ['chunk has no text']);
});

test('importing the same chunks twice stores them once', () => {
  const { store, db } = memoryStore();
  const payload = [{ document_id: 'd3', document_type: 'Annual Report', text: EXACT, page: 1 }];
  importTrendlyneChunks(store, 'TATATECH', payload, { retrievedAt: RETRIEVED });
  const again = importTrendlyneChunks(store, 'TATATECH', payload, { retrievedAt: RETRIEVED });
  assert.equal(again.results[0]?.outcome, 'DUPLICATE_URL');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM research_items').pluck().get() as number), 1);
});

test('documentKindFromType maps the four Trendlyne document classes', () => {
  assert.equal(documentKindFromType('Annual Reports'), 'ANNUAL_REPORT');
  assert.equal(documentKindFromType('Quarterly Results'), 'FILING');
  assert.equal(documentKindFromType('Earnings Call Transcripts'), 'CONCALL_TRANSCRIPT');
  assert.equal(documentKindFromType('Investor Presentations'), 'INVESTOR_PRESENTATION');
  assert.equal(documentKindFromType(undefined), 'OTHER');
});
