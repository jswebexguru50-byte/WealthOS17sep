import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Migrator, Migration } from '../../src/server/db/migrator.js';
import { migration001 } from '../../src/server/db/migrations/001_baseline_schema.js';

describe('Phase 4: Standardized Database Migration Architecture', () => {
  let db: any;

  beforeEach(() => {
    // In-memory isolated database for pure deterministic testing
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('1. Fresh database migration from zero applies baseline cleanly', async () => {
    const migrator = new Migrator([migration001]);
    const result = await migrator.runPending(db);

    expect(result.applied).toBe(1);
    expect(result.currentVersion).toBe(1);

    // Verify schema_migrations table contains version 1
    const applied = await migrator.getAppliedMigrations(db);
    expect(applied.length).toBe(1);
    expect(applied[0].version).toBe(1);
    expect(applied[0].name).toBe('001_baseline_schema');

    // Verify core tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    expect(tables).toContain('Portfolios');
    expect(tables).toContain('Holdings');
    expect(tables).toContain('Transactions');
    expect(tables).toContain('DashboardDiskCache');
  });

  it('2. Existing database upgrade preserves existing data without loss', async () => {
    // Pre-populate database with an existing portfolio and holding
    db.exec(`
      CREATE TABLE Portfolios (name TEXT PRIMARY KEY, base_currency TEXT DEFAULT 'INR');
      INSERT INTO Portfolios (name, base_currency) VALUES ('PreExistingPort', 'INR');
    `);

    const migrator = new Migrator([migration001]);
    const result = await migrator.runPending(db);

    expect(result.applied).toBe(1);
    expect(result.currentVersion).toBe(1);

    // Verify pre-existing data was preserved
    const row = db.prepare("SELECT name, base_currency FROM Portfolios WHERE name = 'PreExistingPort'").get() as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('PreExistingPort');
  });

  it('3. Repeated runs are no-ops when already up-to-date', async () => {
    const migrator = new Migrator([migration001]);
    
    // First run applies
    const run1 = await migrator.runPending(db);
    expect(run1.applied).toBe(1);
    expect(run1.currentVersion).toBe(1);

    // Second run is a complete no-op
    const run2 = await migrator.runPending(db);
    expect(run2.applied).toBe(0);
    expect(run2.currentVersion).toBe(1);
  });

  it('4. Rollback of a failing migration leaves database uncorrupted', async () => {
    const failingMigration: Migration = {
      version: 2,
      name: '002_failing_migration',
      up: async (targetDb: any) => {
        targetDb.exec("CREATE TABLE should_be_rolled_back (id INT)");
        targetDb.exec("INSERT INTO should_be_rolled_back VALUES (1)");
        throw new Error('SIMULATED_MIGRATION_ERROR');
      }
    };

    const migrator = new Migrator([migration001, failingMigration]);

    // First migration succeeds, second fails
    await expect(migrator.runPending(db)).rejects.toThrow('SIMULATED_MIGRATION_ERROR');

    // Verify version 1 is applied, but version 2 is NOT recorded
    const applied = await migrator.getAppliedMigrations(db);
    expect(applied.length).toBe(1);
    expect(applied[0].version).toBe(1);

    // Verify table from failed migration was rolled back
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    expect(tables).not.toContain('should_be_rolled_back');
  });

  it('5. Partial failure leaves the database at the last good version', async () => {
    const goodMigration: Migration = {
      version: 2,
      name: '002_good_migration',
      up: (targetDb: any) => {
        targetDb.exec("CREATE TABLE table_v2 (id INT PRIMARY KEY)");
      }
    };

    const badMigration: Migration = {
      version: 3,
      name: '003_bad_migration',
      up: () => {
        throw new Error('FAILURE_AT_V3');
      }
    };

    const migrator = new Migrator([migration001, goodMigration, badMigration]);

    await expect(migrator.runPending(db)).rejects.toThrow('FAILURE_AT_V3');

    // Database remains exactly at version 2
    const applied = await migrator.getAppliedMigrations(db);
    expect(applied.length).toBe(2);
    expect(applied.map(a => a.version)).toEqual([1, 2]);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    expect(tables).toContain('table_v2');
  });
});
