import test from 'node:test';
import assert from 'node:assert/strict';
import { schemaDb, fact } from '../../db/helpers.js';
import { FactStore } from '../../../../src/server/research_v2/facts/factStore.js';
import { createSqliteFactSource } from '../../../../src/server/research_v2/facts/sqliteFactSource.js';
import { assertSafeWrite } from '../../../../src/server/research_v2/db/dbGuard.js';
import { schemaChecksum, readSchemaSql } from '../../../../src/server/db/migrations/research_v2_migration.js';

const Q = { isin: 'INE000000001', asOf: '2026-01-01T00:00:00Z', scope: 'CONSOLIDATED' as const };

test('ADV1 unit is part of the fact key: a rupee value must not become a vintage of a crore fact', () => {
  const store = new FactStore(schemaDb());
  store.writeFact(fact({ factId: 'a', valueCr: 100, unit: 'INR_CR' }));
  const r = store.writeFact(fact({ factId: 'b', valueCr: 1_000_000_000, unit: 'INR', source: 'OTHER' }));
  assert.notEqual(r.status === 'INSERTED' && r.fact?.vintage, 2, 'unit-differing fact became vintage 2 of same key');
});

test('ADV2 reverting to an earlier value with identical availableAt must not be silently dropped', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact({ factId: 'a', valueCr: 100 }));
  store.writeFact(fact({ factId: 'b', valueCr: 120 }));
  const r = store.writeFact(fact({ factId: 'c', valueCr: 100 }));
  const latest = createSqliteFactSource(db).facts({ ...Q, metric: 'revenue_from_operations' })[0];
  assert.equal(r.status === 'UNCHANGED' && latest.valueCr === 120, false,
    'write of 100 reported UNCHANGED while the readable value is still 120');
});

test('ADV3 a re-write carrying a blocking quality flag must not be swallowed as UNCHANGED', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact({ factId: 'a' }));
  const r = store.writeFact(fact({ factId: 'b', qualityFlags: ['PERIOD_RECON_FAIL'] }));
  const got = createSqliteFactSource(db).facts({ ...Q, metric: 'revenue_from_operations' });
  assert.equal(r.status === 'UNCHANGED' && got.length === 1, false, 'PERIOD_RECON_FAIL flag lost; fact still readable');
});

test('ADV4 a re-write marked quarantined must not be swallowed as UNCHANGED', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact({ factId: 'a' }));
  const r = store.writeFact(fact({ factId: 'b', quarantined: true }));
  assert.notEqual(r.status, 'UNCHANGED');
});

test('ADV5 impossible calendar dates are rejected on write', () => {
  const store = new FactStore(schemaDb());
  const r = store.writeFact(fact({ periodStart: '2025-13-45', periodEnd: '2025-14-99' }));
  assert.equal(r.status, 'REJECTED');
});

test('ADV6 period type must match the span (a 12-month DISCRETE_Q is rejected)', () => {
  const store = new FactStore(schemaDb());
  const r = store.writeFact(fact({ periodType: 'DISCRETE_Q', periodStart: '2024-04-01', periodEnd: '2025-03-31' }));
  assert.equal(r.status, 'REJECTED');
});

test('ADV7 guard treats the live fere_evidence.db as production', () => {
  assert.throws(() => assertSafeWrite({
    dbPath: 'C:/Users/GopalSharma/Downloads/WealthOS 04 Oct/WealthOS04Oct/data/fere/verified_filings/fere_evidence.db',
  }), /PRODUCTION_WRITE_NOT_ALLOWED/);
});

test('ADV8 schema checksum is line-ending independent (Windows autocrlf checkouts)', () => {
  const sql = readSchemaSql();
  assert.equal(schemaChecksum(sql.replace(/\n/g, '\r\n')), schemaChecksum(sql));
});

test('ADV9 same-tier sources that disagree are surfaced by the read path, not silently picked', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact({ factId: 'a', source: 'XBRL', valueCr: 100 }));
  store.writeFact(fact({ factId: 'b', source: 'NSE', valueCr: 150, availableAt: '2025-09-01T00:00:00Z' }));
  const src = createSqliteFactSource(db, { loadOpenConflicts: true });
  const policy = src.explain({ ...Q, metric: 'revenue_from_operations' });
  assert.ok(policy.facts.length === 0 || policy.rejections.some((x) => x.reason === 'UNRESOLVED_CONFLICT'),
    'default read returns 150 with no conflict signal');
});
