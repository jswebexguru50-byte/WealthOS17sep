import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initializeDatabase, runDatabaseMigrations } from '../../src/server/database.js';
import { Migrator, Migration } from '../../src/server/db/migrator.js';
import { canonicalMigrations } from '../../src/server/db/migrations/index.js';
import { migration001 } from '../../src/server/db/migrations/001_baseline_schema.js';

const TEST_DB_PATH = path.join(process.cwd(), 'scratch', 'test_startup_migrations.db');

describe('Database Startup Migrations Integration', () => {
  let db: any;

  beforeEach(() => {
    if (!fs.existsSync(path.dirname(TEST_DB_PATH))) {
      fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch {}
    }
    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch {}
    }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch {}
    if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch {}
  });

  it('1. Fresh database initializes and applies versioned migrations', async () => {
    const result = await runDatabaseMigrations(db);
    expect(result.applied).toBeGreaterThanOrEqual(1);
    expect(result.currentVersion).toBeGreaterThanOrEqual(1);

    // Verify schema_migrations table exists and is populated
    const rows = db.prepare("SELECT * FROM schema_migrations ORDER BY migration_id ASC").all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].migration_id).toBe('1');
    expect(rows[0].name).toBe('001_baseline_schema');
    expect(rows[0].checksum).toBeDefined();
    expect(rows[0].applied_at).toBeDefined();

    // Verify core tables were created
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    expect(tables).toContain('Portfolios');
    expect(tables).toContain('Holdings');
    expect(tables).toContain('Transactions');
    expect(tables).toContain('DashboardDiskCache');
  });

  it('2. Populated existing database preserves rows across migration', async () => {
    // Populate before migration
    db.exec(`
      CREATE TABLE IF NOT EXISTS Portfolios (name TEXT PRIMARY KEY, base_currency TEXT DEFAULT 'INR');
      INSERT INTO Portfolios (name, base_currency) VALUES ('ExistingPortfolio1', 'USD');
    `);

    const result = await runDatabaseMigrations(db);
    expect(result.currentVersion).toBeGreaterThanOrEqual(1);

    const row = db.prepare("SELECT name, base_currency FROM Portfolios WHERE name = 'ExistingPortfolio1'").get() as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('ExistingPortfolio1');
    expect(row.base_currency).toBe('USD');
  });

  it('3. Repeated startup is completely idempotent', async () => {
    const run1 = await runDatabaseMigrations(db);
    expect(run1.applied).toBeGreaterThanOrEqual(1);

    const run2 = await runDatabaseMigrations(db);
    expect(run2.applied).toBe(0);
    expect(run2.currentVersion).toBe(run1.currentVersion);
  });

  it('4. Rejects checksum drift on previously applied migrations', async () => {
    // Apply baseline
    await runDatabaseMigrations(db);

    // Tamper with checksum in schema_migrations
    db.prepare("UPDATE schema_migrations SET checksum = 'tampered_checksum_xyz' WHERE migration_id = '1'").run();

    // Re-running migrator must detect drift and reject
    const migrator = new Migrator(canonicalMigrations);
    await expect(migrator.runPending(db)).rejects.toThrow(/Checksum drift detected/i);
  });

  it('5. Failed migration rolls back atomically and does not commit table or migration log', async () => {
    const failingMigration: Migration = {
      id: 999,
      name: '999_failing_migration',
      checksum: 'fail_chk',
      up: (targetDb: any) => {
        targetDb.exec("CREATE TABLE doomed_table (id INT)");
        targetDb.exec("INSERT INTO doomed_table VALUES (1)");
        throw new Error('ATOMIC_ROLLBACK_TEST_ERROR');
      }
    };

    const migrator = new Migrator([...canonicalMigrations, failingMigration]);
    await expect(migrator.runPending(db)).rejects.toThrow('ATOMIC_ROLLBACK_TEST_ERROR');

    // doomed_table must not exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    expect(tables).not.toContain('doomed_table');

    // schema_migrations must not contain 999
    const rec = db.prepare("SELECT * FROM schema_migrations WHERE migration_id = '999'").get();
    expect(rec).toBeUndefined();
  });

  it('6. Partial migration failure preserves prior successful migrations', async () => {
    const goodMigration: Migration = {
      id: 50,
      name: '050_good_migration',
      checksum: 'good_chk',
      up: (targetDb: any) => {
        targetDb.exec("CREATE TABLE success_v50 (id INT PRIMARY KEY)");
      }
    };

    const badMigration: Migration = {
      id: 51,
      name: '051_bad_migration',
      checksum: 'bad_chk',
      up: () => {
        throw new Error('STEP_51_FAILURE');
      }
    };

    const migrator = new Migrator([migration001, goodMigration, badMigration]);
    await expect(migrator.runPending(db)).rejects.toThrow('STEP_51_FAILURE');

    // Migration 50 must be recorded and its table exist
    const applied = await migrator.getAppliedMigrations(db);
    expect(applied.map(a => a.id)).toContain(50);
    expect(applied.map(a => a.id)).not.toContain(51);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    expect(tables).toContain('success_v50');
  });

  it('7. Actual initializeDatabase() integration runs migrations and populates schema_migrations', async () => {
    // Calling initializeDatabase in integration
    await initializeDatabase(db as any, true);

    const rows = db.prepare("SELECT * FROM schema_migrations").all();
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Verify MasterTickers, Portfolios, Transactions tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    expect(tables).toContain('schema_migrations');
    expect(tables).toContain('Portfolios');
    expect(tables).toContain('MasterTickers');
    expect(tables).toContain('Transactions');
  });
});
