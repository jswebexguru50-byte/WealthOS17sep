import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const MIGRATION_NAME = '003_reconciliation_exceptions';
const checksum = crypto.createHash('sha256').update(MIGRATION_NAME).digest('hex');

export const migration003: Migration = {
  id: 3,
  name: MIGRATION_NAME,
  checksum,
  up: (db: Database.Database) => {
    db.exec(`CREATE TABLE IF NOT EXISTS ReconciliationExceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL,
      scrip_or_trade_id TEXT NOT NULL, exception_type TEXT NOT NULL,
      discrepancy_detail TEXT NOT NULL, reason_category TEXT NOT NULL,
      reason_notes TEXT, approved_by TEXT, approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN');
      CREATE INDEX IF NOT EXISTS idx_recon_exceptions_status
        ON ReconciliationExceptions(status, reason_category);
      CREATE INDEX IF NOT EXISTS idx_recon_exceptions_trade
        ON ReconciliationExceptions(portfolio, scrip_or_trade_id);`);
  }
};
