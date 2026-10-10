import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DbGuardError } from '../../../src/server/research_v2/db/dbGuard.js';
import { ResearchItemStore } from '../../../src/server/research_v2/research/store.js';
import { applySchema, candidate, countItems, filing, memoryStore } from './helpers.js';

test('a primary filing on an exchange host is stored VERIFIED with a canonical URL and scoped hash', () => {
  const { store } = memoryStore();
  const r = store.submit(filing({ url: 'https://www.bseindia.com/x/a.pdf?utm_campaign=z#p2' }));
  assert.equal(r.outcome, 'STORED');
  assert.equal(r.item?.status, 'VERIFIED');
  assert.equal(r.item?.tier, 'PRIMARY');
  assert.equal(r.item?.url, 'https://bseindia.com/x/a.pdf');
  assert.equal(r.item?.tracedTo, null);
  assert.deepEqual(store.getById(r.item!.itemId), r.item);
});

test('secondary sources are leads only: UNVERIFIED_LEAD, whatever status or tier they claim', () => {
  const { store } = memoryStore();
  const hosts = ['moneycontrol.com', 'stockscans.in', 'multibagg.ai', 'valueresearchonline.com', 'ft.com',
    'cnbctv18.com', 'youtube.com', 'x.com'];
  hosts.forEach((host, i) => {
    const r = store.submit(candidate({ url: `https://${host}/p`, tier: 'PRIMARY', status: 'VERIFIED' }, `s${i}`));
    assert.equal(r.item?.status, 'UNVERIFIED_LEAD', host);
    assert.equal(r.item?.tier, 'SECONDARY', host);
    assert.ok(r.notes.some((n) => n.includes('downgraded')), host);
  });
});

test('declared PRIMARY on an unknown host without a primary document kind is downgraded', () => {
  const { store } = memoryStore();
  const r = store.submit(candidate({ url: 'https://blog.example.org/p', tier: 'PRIMARY' }));
  assert.equal(r.item?.tier, 'SECONDARY');
  assert.equal(r.item?.status, 'UNVERIFIED_LEAD');
});

test('an annual report on a company site is PRIMARY by document kind', () => {
  const { store } = memoryStore();
  const r = store.submit(candidate({
    url: 'https://investors.tatatechnologies.example/ar.pdf', tier: 'PRIMARY', documentKind: 'ANNUAL_REPORT',
  }));
  assert.equal(r.item?.tier, 'PRIMARY');
  assert.equal(r.item?.status, 'VERIFIED');
});

test('a secondary item becomes VERIFIED only when traced to a VERIFIED PRIMARY item (by id or URL)', () => {
  const { store } = memoryStore();
  const primary = store.submit(filing()).item!;
  const byId = store.submit(candidate({ tracedTo: primary.itemId }, 'one'));
  assert.equal(byId.item?.status, 'VERIFIED');
  assert.equal(byId.item?.tracedTo, primary.itemId);
  assert.equal(byId.item?.tier, 'SECONDARY');
  const byUrl = store.submit(candidate({ tracedTo: primary.url }, 'two'));
  assert.equal(byUrl.item?.status, 'VERIFIED');
  assert.equal(byUrl.item?.tracedTo, primary.itemId);
});

test('an untraceable trace rejects the item: unknown target, lead target, other symbol, unstored URL', () => {
  const { store } = memoryStore();
  const lead = store.submit(candidate({}, 'lead')).item!;
  const other = store.submit(filing({ symbol: 'OPTIEMUS', url: 'https://www.bseindia.com/o.pdf' }, 'o')).item!;
  const refs = ['ri_doesnotexist', lead.itemId, other.itemId, 'https://www.bseindia.com/never-stored.pdf'];
  refs.forEach((ref, i) => {
    const r = store.submit(candidate({ tracedTo: ref }, `bad${i}`));
    assert.equal(r.outcome, 'REJECTED', ref);
    assert.equal(r.item?.status, 'REJECTED', ref);
    assert.match(r.reason ?? '', /untraceable/);
  });
});

test('a management claim cannot be verified and a trace to a MANAGEMENT_CLAIM is refused', () => {
  const { store } = memoryStore();
  const call = store.submit(filing({
    url: 'https://www.bseindia.com/concall.pdf', documentKind: 'CONCALL_TRANSCRIPT', title: 'Q2 call',
  }, 'call')).item!;
  assert.equal(call.status, 'MANAGEMENT_CLAIM');
  assert.throws(() => store.traceItem(call.itemId, call.itemId), /management claim/);
  const r = store.submit(candidate({ tracedTo: call.itemId }, 'viaCall'));
  assert.equal(r.outcome, 'REJECTED');
});

test('concall and investor-presentation items are MANAGEMENT_CLAIM; a concall title also triggers the label', () => {
  const { store } = memoryStore();
  const t = store.submit(filing({ documentKind: 'CONCALL_TRANSCRIPT' }, 'c1')).item!;
  const p = store.submit(filing({ documentKind: 'INVESTOR_PRESENTATION' }, 'c2')).item!;
  const n = store.submit(candidate({ title: 'Q2 FY26 earnings call transcript' }, 'c3')).item!;
  assert.deepEqual([t.status, p.status, n.status], ['MANAGEMENT_CLAIM', 'MANAGEMENT_CLAIM', 'MANAGEMENT_CLAIM']);
  assert.equal(t.tier, 'PRIMARY');
});

test('traceItem upgrades a stored lead; refuses bad targets, primary items and unknown ids', () => {
  const { store } = memoryStore();
  const lead = store.submit(candidate({}, 'lead')).item!;
  const primary = store.submit(filing()).item!;
  assert.throws(() => store.traceItem(lead.itemId, 'ri_nope'), /not a VERIFIED PRIMARY/);
  assert.throws(() => store.traceItem('ri_missing', primary.itemId), /unknown item/);
  assert.throws(() => store.traceItem(primary.itemId, primary.itemId), /needs no trace/);
  const upgraded = store.traceItem(lead.itemId, primary.url);
  assert.equal(upgraded.status, 'VERIFIED');
  assert.equal(store.getById(lead.itemId)?.tracedTo, primary.itemId);
});

test('resubmitting a rejected item with a valid trace upgrades it', () => {
  const { store } = memoryStore();
  const first = store.submit(candidate({ tracedTo: 'ri_unknown' }, 'x'));
  assert.equal(first.outcome, 'REJECTED');
  const primary = store.submit(filing()).item!;
  const again = store.submit(candidate({ tracedTo: primary.itemId }, 'x'));
  assert.equal(again.outcome, 'UPGRADED');
  assert.equal(store.getById(first.item!.itemId)?.status, 'VERIFIED');
});

test('duplicate URL (after canonicalisation) is not stored twice; sub-question ids merge', () => {
  const { store, db } = memoryStore();
  store.submit(candidate({ url: 'https://www.moneycontrol.com/news/a?utm_source=tw' }, 'a'));
  const dup = store.submit(candidate({ url: 'https://moneycontrol.com/news/a/', subQuestionIds: ['Q9.b'] }, 'a'));
  assert.equal(dup.outcome, 'DUPLICATE_URL');
  assert.deepEqual(dup.item?.subQuestionIds, ['Q7.a', 'Q9.b']);
  assert.equal(countItems(db), 1);
});

test('the same URL for two symbols is stored once per symbol', () => {
  const { store } = memoryStore();
  const a = store.submit(candidate({ symbol: 'AAA' }, 'z'));
  const b = store.submit(candidate({ symbol: 'BBB' }, 'z'));
  assert.equal(a.outcome, 'STORED');
  assert.equal(b.outcome, 'STORED');
  assert.notEqual(a.item?.itemId, b.item?.itemId);
});

test('syndicated content on a different URL is detected and not stored', () => {
  const { store, db } = memoryStore();
  const text = 'Tata Technologies reported a rise in consolidated revenue to 1,300 crore for the quarter, driven by '
    + 'growth in the automotive vertical and a strong order pipeline across regions and customers worldwide.';
  const first = store.submit(candidate({ excerpt: text }, 'orig')).item!;
  const copy = store.submit(candidate({
    url: 'https://www.cnbctv18.com/syndicated', publisher: 'CNBC-TV18', excerpt: `${text} (Source: PTI)`,
  }, 'copy'));
  assert.equal(copy.outcome, 'SYNDICATED_DUPLICATE');
  assert.equal(copy.duplicateOf, first.itemId);
  assert.equal(countItems(db), 1);
});

test('a primary record is not discarded because a secondary lead carries the same text', () => {
  const { store } = memoryStore();
  const text = 'The board approved the unaudited consolidated results for the quarter ended 30 September 2026 and '
    + 'declared an interim dividend of five rupees per equity share of face value two rupees each.';
  store.submit(candidate({ excerpt: text }, 'lead'));
  const primary = store.submit(filing({ excerpt: text }, 'orig'));
  assert.equal(primary.outcome, 'STORED');
  assert.equal(primary.item?.status, 'VERIFIED');
});

test('similar text for another symbol is not a duplicate', () => {
  const { store } = memoryStore();
  const text = 'Revenue rose strongly in the quarter driven by growth in services demand across regions and clients.';
  store.submit(candidate({ symbol: 'AAA', excerpt: text }, 'a'));
  assert.equal(store.submit(candidate({ symbol: 'BBB', excerpt: text }, 'b')).outcome, 'STORED');
});

test('invalid candidates are rejected without being stored', () => {
  const { store, db } = memoryStore();
  const bad = [
    candidate({ url: 'not a url' }),
    candidate({ excerpt: '   ' }),
    candidate({ symbol: ' ' }),
    candidate({ retrievedAt: 'yesterday-ish' }),
    candidate({ publishedAt: 'soon' }),
    candidate({ subQuestionIds: ['Q99.z'] }),
    candidate({ tier: 'TERTIARY' as never }),
    candidate({ documentKind: 'BLOG' as never }),
  ];
  for (const item of bad) assert.equal(store.submit(item).outcome, 'INVALID', JSON.stringify(item.url));
  assert.equal(countItems(db), 0);
});

test('list filters by symbol and status', () => {
  const { store } = memoryStore();
  store.submit(candidate({}, 'a'));
  store.submit(filing());
  store.submit(candidate({ symbol: 'OTHER' }, 'b'));
  assert.equal(store.list('tatatech').length, 2);
  assert.equal(store.list('TATATECH', 'VERIFIED').length, 1);
  assert.equal(store.list('TATATECH', 'REJECTED').length, 0);
});

test('writes go through the db guard: a production-named database is refused without --allow-production', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-guard-'));
  const db = new Database(path.join(dir, 'portfolio.db'));
  applySchema(db);
  try {
    const store = new ResearchItemStore(db);
    assert.throws(() => store.submit(candidate()), (e: unknown) =>
      e instanceof DbGuardError && e.code === 'PRODUCTION_WRITE_NOT_ALLOWED');
    const noBackup = new ResearchItemStore(db, { allowProduction: true });
    assert.throws(() => noBackup.submit(candidate()), (e: unknown) =>
      e instanceof DbGuardError && e.code === 'BACKUP_REQUIRED');
    assert.equal(store.list('TATATECH').length, 0);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a read-only handle cannot write, and reads still work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-ro-'));
  const file = path.join(dir, 'research-copy.db');
  const rw = new Database(file);
  applySchema(rw);
  rw.close();
  const ro = new Database(file, { readonly: true });
  try {
    const store = new ResearchItemStore(ro);
    assert.deepEqual(store.list('X'), []);
    assert.throws(() => store.submit(candidate()), /read-only/);
  } finally {
    ro.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the store never creates tables (no runtime DDL): an empty database fails on write', () => {
  const db = new Database(':memory:');
  const store = new ResearchItemStore(db);
  assert.throws(() => store.submit(candidate()), /no such table/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").pluck().get(), 0);
  db.close();
});
