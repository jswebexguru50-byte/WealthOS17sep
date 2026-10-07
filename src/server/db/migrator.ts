import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

/**
 * src/server/db/migrator.ts
 *
 * WealthOS Standardized Database Migration Architecture
 * Provides sequential, transactional, idempotent migration execution
 * tracked via `schema_migrations` table with support for both existing
 * legacy schemas and fresh installations, with checksum drift protection.
 */

export interface Migration {
  id: number;
  version?: number;
  name: string;
  checksum: string;
  up(db: Database.Database): void;
}

export interface AppliedMigration {
  migration_id: string;
  id: number;
  version?: number;
  name: string;
  checksum?: string;
  applied_at: string;
}

function getMigrationId(m: any): number {
  return m.id ?? m.version ?? 0;
}

export class Migrator {
  private migrations: Migration[] = [];

  constructor(migrations: Migration[] = []) {
    this.migrations = [...migrations].sort((a, b) => getMigrationId(a) - getMigrationId(b));
  }

  public register(migration: Migration): void {
    if (this.migrations.some(m => m.id === migration.id)) {
      throw new Error(`Duplicate migration ID: ${migration.id}`);
    }
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.id - b.id);
  }

  public initMigrationTable(db: any): void {
    const rawDb = db.db || db;
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id TEXT PRIMARY KEY,
        name TEXT,
        checksum TEXT,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Ensure columns exist on pre-existing legacy schema_migrations table
    // (Allowed compatibility inspect)
    const cols = (rawDb.prepare("PRAGMA table_info(schema_migrations)").all() as any[]).map(c => c.name);
    if (!cols.includes('name')) {
      rawDb.exec("ALTER TABLE schema_migrations ADD COLUMN name TEXT");
    }
    if (!cols.includes('checksum')) {
      rawDb.exec("ALTER TABLE schema_migrations ADD COLUMN checksum TEXT");
    }
  }

  public getAppliedMigrations(db: any): AppliedMigration[] {
    const rawDb = db.db || db;
    this.initMigrationTable(rawDb);
    const rows = rawDb.prepare(`
      SELECT migration_id, name, checksum, applied_at
      FROM schema_migrations
      ORDER BY rowid ASC
    `).all() as any[];

    return rows.map(r => {
      const parsedId = Number.parseInt(String(r.migration_id).replace(/\D+/g, ''), 10);
      const numId = Number.isFinite(parsedId) ? parsedId : 0;
      return {
        migration_id: String(r.migration_id),
        id: numId,
        version: numId,
        name: String(r.name || r.migration_id),
        checksum: r.checksum ? String(r.checksum) : undefined,
        applied_at: String(r.applied_at)
      };
    });
  }

  public verifyChecksum(migration: Migration, appliedRecord?: AppliedMigration): void {
    if (appliedRecord && appliedRecord.checksum && migration.checksum) {
      if (appliedRecord.checksum !== migration.checksum) {
        throw new Error(
          `Checksum drift detected for migration ${migration.id} (${migration.name}): recorded "${appliedRecord.checksum}", expected "${migration.checksum}".`
        );
      }
    }
  }

  public async runPending(db: any): Promise<{ applied: number; currentVersion: number }> {
    const rawDb = db.db || db;
    this.initMigrationTable(rawDb);
    const appliedList = this.getAppliedMigrations(rawDb);
    const appliedMap = new Map<string, AppliedMigration>();
    for (const a of appliedList) {
      appliedMap.set(String(a.migration_id), a);
      appliedMap.set(String(a.name), a);
      if (a.id > 0) {
        appliedMap.set(String(a.id), a);
      }
    }

    let appliedCount = 0;
    let latestVersion = appliedList.reduce((max, a) => Math.max(max, a.id), 0);

    for (const migration of this.migrations) {
      const mId = getMigrationId(migration);
      const existing = appliedMap.get(String(mId)) || appliedMap.get(migration.name);

      if (existing) {
        // Migration already recorded — verify checksum integrity
        this.verifyChecksum(migration, existing);
        latestVersion = Math.max(latestVersion, mId);
        continue;
      }

      // Execute migration within atomic transaction
      const inTx = rawDb.inTransaction;
      const savepoint = `sp_mig_${mId}_${Date.now()}`;

      if (!inTx) {
        rawDb.exec('BEGIN IMMEDIATE');
      } else {
        rawDb.exec(`SAVEPOINT ${savepoint}`);
      }

      try {
        await migration.up(rawDb);

        const chk = migration.checksum || crypto.createHash('sha256').update(migration.name).digest('hex');
        rawDb.prepare(`
          INSERT INTO schema_migrations (migration_id, name, checksum, applied_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(migration_id) DO UPDATE SET
            name = excluded.name,
            checksum = excluded.checksum,
            applied_at = excluded.applied_at
        `).run(String(mId), migration.name, chk);

        if (!inTx) {
          rawDb.exec('COMMIT');
        } else {
          rawDb.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }

        appliedCount++;
        latestVersion = Math.max(latestVersion, mId);
      } catch (err) {
        if (!inTx) {
          try { rawDb.exec('ROLLBACK'); } catch {}
        } else {
          try {
            rawDb.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            rawDb.exec(`RELEASE SAVEPOINT ${savepoint}`);
          } catch {}
        }
        throw err;
      }
    }

    return {
      applied: appliedCount,
      currentVersion: latestVersion
    };
  }
}
