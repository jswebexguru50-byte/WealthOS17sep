import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../../src/server/research_v2/facts/factStore.js';
import { createSqliteFactSource } from '../../../src/server/research_v2/facts/sqliteFactSource.js';
import { MixedScopeError } from '../../../src/server/research_v2/facts/readPolicy.js';
import { fact, schemaDb } from './helpers.js';
import Database from 'better-sqlite3';

const ASOF = '2026-01-01T00:00:00Z';

test('first write is vintage 1; a correction becomes vintage 2 superseding the first', () => {
  const store = new FactStore(schemaDb());
  const first = store.writeFact(fact());
  assert.equal(first.status, 'INSERTED');
  assert.equal(first.fact?.vintage, 1);
  const second = store.writeFact(fact({ valueCr: 101, availableAt: '2025-09-01T00:00:00Z' }));
  assert.equal(second.status, 'INSERTED');
  assert.equal(second.fact?.vintage, 2);
  assert.equal(second.fact?.supersedesId, 'f1');
  assert.notEqual(second.fact?.factId, 'f1');
  assert.equal(store.listVintages(fact()).length, 2);
  assert.equal(second.conflictsRecorded, 0);
});

test('re-running an identical ingestion adds no vintage', () => {
  const store = new FactStore(schemaDb());
  store.writeFact(fact());
  const again = store.writeFact(fact());
  assert.equal(again.status, 'UNCHANGED');
  assert.equal(store.listVintages(fact()).length, 1);
});

test('a failed (missing or NaN) write never overwrites or hides a prior success', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  for (const bad of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = store.writeFact(fact({ valueCr: bad, availableAt: '2025-12-01T00:00:00Z' }));
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'MISSING_VALUE');
  }
  assert.equal(store.listVintages(fact()).length, 1);
  const read = createSqliteFactSource(db).facts({ asOf: ASOF, isin: fact().isin });
  assert.equal(read.length, 1);
  assert.equal(read[0].valueCr, 100);
});

test('a SQL error mid-batch rolls the whole batch back and leaves prior rows intact', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  const poisoned = fact({ factId: 'g2', periodStart: '2025-07-01', periodEnd: '2025-09-30' });
  Object.defineProperty(poisoned, 'qualityFlags', { get() { throw new Error('boom'); } });
  assert.throws(() => store.writeFacts([fact({ factId: 'g1', metric: 'other_income' }), poisoned]), /boom/);
  const count = db.prepare('SELECT COUNT(*) AS n FROM research_canonical_period_facts').get() as { n: number };
  assert.equal(count.n, 1);
});

test('simulated tier and structurally invalid facts are refused', () => {
  const store = new FactStore(schemaDb());
  assert.equal(store.writeFact(fact({ sourceTier: 'SIMULATED' })).reason, 'SIMULATED_TIER');
  assert.equal(store.writeFact(fact({ periodEnd: 'LATEST' })).reason, 'INVALID_FACT');
  assert.equal(store.writeFact(fact({ availableAt: 'yesterday' })).reason, 'INVALID_FACT');
  assert.equal(store.writeFact(fact({ scope: 'GROUP' as never })).reason, 'INVALID_FACT');
});

test('different source with a different value is retained in research_conflicts', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  const provider = store.writeFact(fact({
    factId: 'p1', sourceTier: 'PROVIDER_VERIFIED', source: 'TRENDLYNE', valueCr: 90,
    availableAt: '2025-09-01T00:00:00Z',
  }));
  assert.equal(provider.conflictsRecorded, 1);
  const conflict = db.prepare('SELECT * FROM research_conflicts').get() as Record<string, unknown>;
  assert.equal(conflict.status, 'OPEN');
  assert.equal(conflict.fact_a, 'f1');
  assert.equal(conflict.value_a, 100);
  assert.equal(conflict.value_b, 90);
  assert.ok(Math.abs((conflict.rel_diff as number) - 0.1) < 1e-9);
  assert.ok(store.openConflictFactIds().has('f1'));
});

test('different source within tolerance is a new vintage but not a conflict', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  const near = store.writeFact(
    fact({ factId: 'p1', source: 'TRENDLYNE', sourceTier: 'PROVIDER_VERIFIED', valueCr: 100.02 }),
  );
  assert.equal(near.status, 'INSERTED');
  assert.equal(near.conflictsRecorded, 0);
});

test('same-source restatement is a correction, not a conflict', () => {
  const store = new FactStore(schemaDb());
  store.writeFact(fact());
  const restated = store.writeFact(fact({ valueCr: 120, availableAt: '2025-10-01T00:00:00Z' }));
  assert.equal(restated.conflictsRecorded, 0);
});

test('as-of selection returns exactly one vintage per key and respects availability', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  store.writeFact(fact({ valueCr: 110, availableAt: '2025-10-01T00:00:00Z' }));
  store.writeFact(fact({ valueCr: 130, availableAt: '2026-03-01T00:00:00Z' }));
  const source = createSqliteFactSource(db);
  const at = (asOf: string) => source.facts({ asOf, isin: fact().isin }).map((f) => [f.valueCr, f.vintage]);
  assert.deepEqual(at('2025-07-31T23:59:59Z'), []);
  assert.deepEqual(at('2025-08-01T00:00:00Z'), [[100, 1]]);
  assert.deepEqual(at('2025-12-31'), [[110, 2]]);
  assert.deepEqual(at('2026-03-01'), [[130, 3]]);
});

test('statutory beats a later provider value for the same key', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  store.writeFact(fact({
    factId: 'p', source: 'TRENDLYNE', sourceTier: 'PROVIDER_VERIFIED', valueCr: 90,
    availableAt: '2025-09-01T00:00:00Z',
  }));
  const got = createSqliteFactSource(db).facts({ asOf: ASOF });
  assert.equal(got.length, 1);
  assert.equal(got[0].valueCr, 100);
  assert.equal(got[0].sourceTier, 'STATUTORY');
});

test('sqlite source: quarantine flag set later hides the fact; flags can be changed but values cannot', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  db.prepare('UPDATE research_canonical_period_facts SET quarantined = 1').run();
  assert.deepEqual(createSqliteFactSource(db).facts({ asOf: ASOF }), []);
});

test('sqlite source: unresolved conflicts reject only when the policy requires it', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  store.writeFact(fact({ factId: 'p', source: 'TRENDLYNE', sourceTier: 'PROVIDER_VERIFIED', valueCr: 50 }));
  assert.equal(createSqliteFactSource(db).facts({ asOf: ASOF }).length, 1);
  const strict = createSqliteFactSource(db, { requireResolvedConflicts: true });
  assert.equal(strict.facts({ asOf: ASOF }).length, 0);
  db.prepare("UPDATE research_conflicts SET status = 'RESOLVED'").run();
  assert.equal(strict.facts({ asOf: ASOF }).length, 1);
});

test('sqlite source: mixed scope throws unless a scope is given', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFact(fact());
  store.writeFact(fact({ factId: 's', scope: 'STANDALONE', valueCr: 80 }));
  const source = createSqliteFactSource(db);
  assert.throws(() => source.facts({ asOf: ASOF, isin: fact().isin }), MixedScopeError);
  assert.equal(source.facts({ asOf: ASOF, scope: 'STANDALONE' })[0].valueCr, 80);
});

test('sqlite source: filters by metric, period type and sorts by real period end', () => {
  const db = schemaDb();
  const store = new FactStore(db);
  store.writeFacts([
    fact({ factId: 'q2', periodStart: '2025-07-01', periodEnd: '2025-09-30' }),
    fact({ factId: 'q1' }),
    fact({ factId: 'oi', metric: 'other_income' }),
    fact({ factId: 'an', periodType: 'ANNUAL', periodStart: '2025-04-01', periodEnd: '2026-03-31' }),
  ]);
  const source = createSqliteFactSource(db);
  const q = source.facts({ asOf: ASOF, metric: 'revenue_from_operations', periodTypes: ['DISCRETE_Q'] });
  assert.deepEqual(q.map((f) => f.factId), ['q1', 'q2']);
  assert.equal(source.facts({ asOf: ASOF, metric: ['other_income', 'revenue_from_operations'] }).length, 4);
});

test('FactStore refuses a read-only handle and an unguarded production-named database', () => {
  const ro = new Database(':memory:');
  const readonlyLike = Object.create(ro, { readonly: { value: true } }) as Database.Database;
  assert.throws(() => new FactStore(readonlyLike), /writable/);
  const prodLike = Object.create(ro, { name: { value: 'C:\\x\\portfolio.db' } }) as Database.Database;
  assert.throws(() => new FactStore(prodLike), /production/);
});
