/**
 * run_migrations.ts — Startup schema migration runner
 *
 * Applies pending SQL migrations from scripts/migrations/ in order.
 * Uses a schema_version table to track applied migrations.
 * NEVER runs DDL from application repositories — only from here.
 *
 * Usage: called at server startup before any repository access.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');
const MIGRATIONS_DIR = path.resolve('scripts', 'migrations');

export function runMigrations(): void {
  const db = new Database(PORTFOLIO_DB_PATH);
  try {
    // Ensure version tracking table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id TEXT PRIMARY KEY,
        applied_at   TEXT NOT NULL
      );
    `);

    // Read migration files in sorted order
    let files: string[] = [];
    try {
      files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();
    } catch {
      console.warn('[Migrations] No migrations directory found at:', MIGRATIONS_DIR);
      return;
    }

    for (const file of files) {
      const migrationId = file;
      const already = db.prepare(
        'SELECT migration_id FROM schema_migrations WHERE migration_id = ?'
      ).get(migrationId);

      if (!already) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        console.log(`[Migrations] Applying: ${migrationId}`);

        // SQLite does not support IF NOT EXISTS on ALTER TABLE in older versions.
        // Run each ALTER TABLE separately, ignoring "duplicate column" errors.
        // Strip single-line SQL comments before splitting
        const cleanedSql = sql.replace(/--.*$/gm, '');
        const statements = cleanedSql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const stmt of statements) {
          try {
            db.exec(stmt);
          } catch (e: any) {
            // Duplicate column or index already exists is acceptable for idempotent migrations
            if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) {
              throw e;
            }
          }
        }

        db.prepare(
          'INSERT INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)'
        ).run(migrationId, new Date().toISOString());

        console.log(`[Migrations] Applied: ${migrationId}`);
      }
    }
  } finally {
    db.close();
  }
}

// Run directly if invoked via CLI
if (process.argv[1]?.replace(/\\/g, '/').endsWith('run_migrations.ts')) {
  try {
    runMigrations();
    console.log('[Migrations] All migrations completed successfully.');
  } catch (err) {
    console.error('[Migrations] Failed to run migrations:', err);
    process.exit(1);
  }
}
