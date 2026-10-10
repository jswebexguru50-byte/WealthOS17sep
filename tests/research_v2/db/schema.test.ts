import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  RESEARCH_V2_MIGRATION_VERSION, applyResearchV2Schema, quarantineLegacyCompanyFacts, researchV2Migration,
  readSchemaSql, schemaChecksum,
} from '../../../src/server/db/migrations/research_v2_migration.js';
import { Migrator } from '../../../src/server/db/migrator.js';
import { schemaDb } from './helpers.js';

const TABLES = [
  'research_canonical_period_facts', 'research_metric_definitions', 'research_trendlyne_catalogue',
  'research_trendlyne_call_log', 'research_items', 'research_conflicts', 'research_report_runs',
  'research_answer_store', 'research_review_findings', 'research_filter_scorecard',
];

const insertFact = (db: Database.Database, over: Record<string, unknown> = {}): void => {
  const row = {
    fact_id: 'a', isin: 'I', symbol: 'S', scope: 'CONSOLIDATED', metric: 'm', period_type: 'ANNUAL',
    period_start: '2025-04-01', period_end: '2026-03-31', value_cr: 1, unit: 'INR_CR', source_tier: 'STATUTORY',
    source: 'XBRL', available_at: '2026-05-01T00:00:00Z', ...over,
  };
  const cols = Object.keys(row);
  const marks = cols.map(() => '?').join(',');
  db.prepare(`INSERT INTO research_canonical_period_facts (${cols.join(',')}) VALUES (${marks})`)
    .run(...Object.values(row));
};

const tableNames = (db: Database.Database): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>)
    .map((r) => r.name);

const catalogue = (db: Database.Database): unknown[] =>
  db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all();

test('schema creates all ten tables', () => {
  const names = tableNames(schemaDb());
  for (const table of TABLES) assert.ok(names.includes(table), table);
});

test('schema is idempotent: applying twice changes nothing and keeps data', () => {
  const db = schemaDb();
  insertFact(db);
  const before = catalogue(db);
  applyResearchV2Schema(db);
  applyResearchV2Schema(db);
  assert.deepEqual(catalogue(db), before);
  const count = db.prepare('SELECT COUNT(*) AS n FROM research_canonical_period_facts').get() as { n: number };
  assert.equal(count.n, 1);
});

test('schema touches no other table', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE other (x TEXT); INSERT INTO other VALUES ('keep')");
  applyResearchV2Schema(db);
  assert.equal((db.prepare('SELECT x FROM other').get() as { x: string }).x, 'keep');
  const foreign = tableNames(db).filter((n) => !n.startsWith('research_') && !n.startsWith('sqlite_'));
  assert.deepEqual(foreign, ['other']);
});

test('constraints reject bad scope, period type, tier, unit, dates, vintage and quarantined', () => {
  const db = schemaDb();
  const bad: Array<Record<string, unknown>> = [
    { scope: 'GROUP' }, { period_type: 'MONTHLY' }, { source_tier: 'MAGIC' }, { unit: 'USD' },
    { period_end: 'LATEST' }, { period_start: '2025-4-1' }, { period_start: '2026-04-01', period_end: '2026-03-31' },
    { vintage: 0 }, { quarantined: 2 }, { quality_flags: 'not json' }, { isin: '' },
  ];
  bad.forEach((over, index) => {
    assert.throws(() => insertFact(db, { fact_id: `b${index}`, ...over }), /constraint/i, JSON.stringify(over));
  });
  insertFact(db, { fact_id: 'ok' });
});

test('unique key forbids a duplicate vintage and allows a new one', () => {
  const db = schemaDb();
  insertFact(db, { fact_id: 'v1' });
  assert.throws(() => insertFact(db, { fact_id: 'v1b' }), /UNIQUE/);
  insertFact(db, { fact_id: 'v2', vintage: 2, supersedes_id: 'v1', value_cr: 2 });
});

test('supersedes_id must reference an existing fact', () => {
  const db = schemaDb();
  assert.throws(() => insertFact(db, { fact_id: 'x', vintage: 2, supersedes_id: 'ghost' }), /FOREIGN KEY/);
});

test('vintages are immutable and never deleted, but review flags may change', () => {
  const db = schemaDb();
  insertFact(db);
  assert.throws(() => db.prepare('UPDATE research_canonical_period_facts SET value_cr = 99').run(), /immutable/);
  assert.throws(() => db.prepare("UPDATE research_canonical_period_facts SET source = 'X'").run(), /immutable/);
  assert.throws(() => db.prepare('DELETE FROM research_canonical_period_facts').run(), /never deleted/);
  db.prepare(
    `UPDATE research_canonical_period_facts SET quarantined = 1, quality_flags = '["UNIT_SUSPECT"]'`,
  ).run();
  const row = db.prepare('SELECT quarantined AS q FROM research_canonical_period_facts').get() as { q: number };
  assert.equal(row.q, 1);
});

test('other table constraints: catalogue tier, item status', () => {
  const db = schemaDb();
  assert.throws(
    () => db.prepare("INSERT INTO research_trendlyne_catalogue (token, tier) VALUES ('t','T9')").run(), /constraint/i,
  );
  db.prepare("INSERT INTO research_trendlyne_catalogue (token, tier) VALUES ('t','T1')").run();
  assert.throws(() => db.prepare(
    `INSERT INTO research_items (item_id,symbol,tier,url,retrieved_at,excerpt,status)
     VALUES ('i','S','T','u','r','e','GOOD')`,
  ).run(), /constraint/i);
});

function legacyDb(withProvider = true): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE company_facts (factId TEXT PRIMARY KEY, symbol TEXT${withProvider ? ', provider TEXT' : ''})`);
  if (withProvider) {
    db.exec(`INSERT INTO company_facts VALUES
      ('1','A','TRENDLYNE_MCP_MAX'),('2','B','XBRL'),('3','C','TRENDLYNE_MCP_MAX')`);
  } else {
    db.exec("INSERT INTO company_facts VALUES ('1','A')");
  }
  return db;
}

test('quarantine: no company_facts table means no-op', () => {
  const db = new Database(':memory:');
  assert.deepEqual(quarantineLegacyCompanyFacts(db), {
    tablePresent: false, columnAdded: false, providerColumnPresent: false, rowsQuarantined: 0,
  });
  assert.deepEqual(tableNames(db), []);
});

test('quarantine: flags only TRENDLYNE_MCP_MAX rows, deletes nothing, is repeatable', () => {
  const db = legacyDb();
  const first = applyResearchV2Schema(db);
  assert.equal(first.columnAdded, true);
  assert.equal(first.rowsQuarantined, 2);
  const rows = db.prepare('SELECT factId, quarantined FROM company_facts ORDER BY factId').all();
  assert.deepEqual(rows, [
    { factId: '1', quarantined: 1 }, { factId: '2', quarantined: 0 }, { factId: '3', quarantined: 1 },
  ]);
  const second = applyResearchV2Schema(db);
  assert.equal(second.columnAdded, false);
  assert.equal(second.rowsQuarantined, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM company_facts').get() as { n: number }).n, 3);
});

test('quarantine: without a provider column only the additive column is created', () => {
  const db = legacyDb(false);
  const report = quarantineLegacyCompanyFacts(db);
  assert.equal(report.columnAdded, true);
  assert.equal(report.providerColumnPresent, false);
  assert.equal(report.rowsQuarantined, 0);
});

test('quarantine UPDATE never reaches the new research tables', () => {
  const db = legacyDb();
  applyResearchV2Schema(db);
  insertFact(db);
  applyResearchV2Schema(db);
  const row = db.prepare('SELECT quarantined AS q FROM research_canonical_period_facts').get() as { q: number };
  assert.equal(row.q, 0);
});

test('migration object works through the Migrator, once, with a stable checksum', async () => {
  assert.equal(researchV2Migration.id, RESEARCH_V2_MIGRATION_VERSION);
  assert.equal(researchV2Migration.checksum, schemaChecksum());
  const db = new Database(':memory:');
  const migrator = new Migrator([researchV2Migration]);
  const first = await migrator.runPending(db);
  const second = await migrator.runPending(db);
  assert.equal(first.applied, 1);
  assert.equal(second.applied, 0);
  assert.ok(tableNames(db).includes('research_canonical_period_facts'));
});

test('migration detects checksum drift', async () => {
  const db = new Database(':memory:');
  await new Migrator([researchV2Migration]).runPending(db);
  const drifted = { ...researchV2Migration, checksum: 'different' };
  await assert.rejects(() => new Migrator([drifted]).runPending(db), /Checksum drift/);
});

test('schema SQL does not depend on the working directory', () => {
  const cwd = process.cwd();
  process.chdir(process.env.TEMP ?? '.');
  try {
    assert.match(readSchemaSql(), /research_canonical_period_facts/);
  } finally {
    process.chdir(cwd);
  }
});
