import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESEARCH_CAPS, ResearchBudget, ResearchBudgets, ResearchCapError, UrlCache,
} from '../../../src/server/research_v2/research/budget.js';
import {
  ResearchSession, type FetchedPage, type ResearchFetcher,
} from '../../../src/server/research_v2/research/fetcher.js';
import { countItems, memoryStore } from './helpers.js';

test('default caps are 12 searches and 15 fetches per scrip', () => {
  assert.deepEqual({ ...DEFAULT_RESEARCH_CAPS }, { maxSearches: 12, maxFetches: 15 });
});

test('the counter allows exactly the cap and then throws without incrementing', () => {
  const budget = new ResearchBudget('X');
  for (let i = 0; i < 12; i += 1) budget.chargeSearch();
  assert.throws(() => budget.chargeSearch(), (e: unknown) =>
    e instanceof ResearchCapError && e.code === 'SEARCH_CAP_EXCEEDED');
  for (let i = 0; i < 15; i += 1) budget.chargeFetch();
  assert.throws(() => budget.chargeFetch(), (e: unknown) =>
    e instanceof ResearchCapError && e.code === 'FETCH_CAP_EXCEEDED');
  assert.deepEqual(budget.snapshot(), {
    symbol: 'X', searches: 12, fetches: 15, searchesRemaining: 0, fetchesRemaining: 0,
  });
});

test('a bulk charge that would exceed the cap is refused as a whole', () => {
  const budget = new ResearchBudget('X', { maxSearches: 3, maxFetches: 3 });
  assert.throws(() => budget.chargeFetch(4), ResearchCapError);
  assert.equal(budget.snapshot().fetches, 0);
  assert.equal(budget.wouldExceed(0, 4), 'FETCH_CAP_EXCEEDED');
  assert.equal(budget.wouldExceed(4, 0), 'SEARCH_CAP_EXCEEDED');
  assert.equal(budget.wouldExceed(3, 3), null);
});

test('invalid caps are refused', () => {
  assert.throws(() => new ResearchBudget('X', { maxSearches: -1, maxFetches: 1 }), /maxSearches/);
  assert.throws(() => new ResearchBudget('X', { maxSearches: 1, maxFetches: 1.5 }), /maxFetches/);
});

test('budgets are per scrip and case-insensitive', () => {
  const budgets = new ResearchBudgets({ maxSearches: 1, maxFetches: 1 });
  budgets.forSymbol('aaa').chargeSearch();
  assert.throws(() => budgets.forSymbol('AAA').chargeSearch(), ResearchCapError);
  budgets.forSymbol('BBB').chargeSearch();
});

test('UrlCache keys by canonical URL hash', () => {
  const cache = new UrlCache<number>();
  cache.set('https://a.example/x', 1);
  assert.equal(cache.get('https://a.example/x'), 1);
  assert.equal(cache.has('https://a.example/y'), false);
  assert.equal(cache.size, 1);
});

class FakeFetcher implements ResearchFetcher {
  readonly name = 'fake';
  searches: string[] = [];
  fetches: string[] = [];

  async search(query: string) {
    this.searches.push(query);
    return [{ url: 'https://www.moneycontrol.com/n/1' }];
  }

  async fetch(url: string): Promise<FetchedPage> {
    this.fetches.push(url);
    return {
      url,
      title: `Page ${this.fetches.length}`,
      publisher: 'Moneycontrol',
      publishedAt: '2026-10-01T00:00:00Z',
      retrievedAt: '2026-10-10T08:00:00Z',
      text: `Distinct text number ${this.fetches.length} about pledge disclosures at the quarter end ${url}`,
    };
  }
}

function session(caps = { maxSearches: 2, maxFetches: 2 }) {
  const { db, store } = memoryStore();
  const fetcher = new FakeFetcher();
  const budget = new ResearchBudget('TATATECH', caps);
  return { db, store, fetcher, budget, s: new ResearchSession({ symbol: 'TATATECH', fetcher, store, budget }) };
}

test('searches are charged and stop at the cap', async () => {
  const { s, fetcher } = session();
  await s.search('q1');
  await s.search('q2');
  await assert.rejects(s.search('q3'), ResearchCapError);
  assert.equal(fetcher.searches.length, 2);
});

test('fetchAndStore stores a lead, charges one fetch, and stops at the fetch cap without fetching', async () => {
  const { s, fetcher, budget, db } = session();
  const r = await s.fetchAndStore({ url: 'https://www.moneycontrol.com/n/1', subQuestionIds: ['Q7.a'] });
  assert.equal(r.outcome, 'STORED');
  assert.equal(r.item?.status, 'UNVERIFIED_LEAD');
  await s.fetchAndStore({ url: 'https://www.moneycontrol.com/n/2', subQuestionIds: ['Q7.a'] });
  await assert.rejects(
    s.fetchAndStore({ url: 'https://www.moneycontrol.com/n/3', subQuestionIds: [] }), ResearchCapError);
  assert.equal(fetcher.fetches.length, 2);
  assert.equal(budget.snapshot().fetches, 2);
  assert.equal(countItems(db), 2);
});

test('an already stored URL costs no fetch (store hit, canonicalised)', async () => {
  const { s, fetcher, budget } = session();
  await s.fetchAndStore({ url: 'https://www.moneycontrol.com/n/1', subQuestionIds: ['Q7.a'] });
  const again = await s.fetchAndStore({ url: 'https://moneycontrol.com/n/1/?utm_source=a', subQuestionIds: [] });
  assert.equal(again.outcome, 'DUPLICATE_URL');
  assert.equal(fetcher.fetches.length, 1);
  assert.equal(budget.snapshot().fetches, 1);
});

test('the URL cache avoids a second fetch when the first result was not stored in the database', async () => {
  const { s, fetcher, budget, db } = session();
  const first = await s.fetchAndStore({ url: 'https://example.org/p', subQuestionIds: ['Q7.a'] });
  assert.equal(first.outcome, 'STORED');
  db.prepare('DELETE FROM research_items').run();
  const second = await s.fetchAndStore({ url: 'https://example.org/p?utm_medium=z', subQuestionIds: ['Q7.a'] });
  assert.equal(second.outcome, 'STORED');
  assert.equal(fetcher.fetches.length, 1);
  assert.equal(budget.snapshot().fetches, 1);
});

test('an invalid URL is rejected before any charge', async () => {
  const { s, budget, fetcher } = session();
  const r = await s.fetchAndStore({ url: 'file:///etc/passwd', subQuestionIds: [] });
  assert.equal(r.outcome, 'INVALID');
  assert.equal(budget.snapshot().fetches, 0);
  assert.equal(fetcher.fetches.length, 0);
});

test('a fetch error keeps the charge (the attempt was used) and stores nothing', async () => {
  const { store } = memoryStore();
  const budget = new ResearchBudget('TATATECH', { maxSearches: 1, maxFetches: 1 });
  const failing: ResearchFetcher = {
    name: 'failing',
    search: async () => [],
    fetch: async () => { throw new Error('network down'); },
  };
  const s = new ResearchSession({ symbol: 'TATATECH', fetcher: failing, store, budget });
  await assert.rejects(s.fetchAndStore({ url: 'https://example.org/q', subQuestionIds: [] }), /network down/);
  assert.equal(budget.snapshot().fetches, 1);
  assert.equal(store.list('TATATECH').length, 0);
});
