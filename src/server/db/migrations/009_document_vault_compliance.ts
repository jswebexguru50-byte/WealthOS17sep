import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const name = '009_document_vault_compliance';
export const migration009: Migration = {
  id: 9, name, checksum: crypto.createHash('sha256').update(name).digest('hex'),
  up: (db: Database.Database) => db.exec(`
    CREATE TABLE IF NOT EXISTS family_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL, title TEXT NOT NULL,
      document_type TEXT NOT NULL, storage_ref TEXT NOT NULL, sha256 TEXT,
      issued_on TEXT, expires_on TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED','REVOKED')),
      notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_family_documents_expiry ON family_documents(portfolio, expires_on, status);
    CREATE TABLE IF NOT EXISTS compliance_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL, title TEXT NOT NULL,
      compliance_type TEXT NOT NULL, due_on TEXT NOT NULL, recurrence TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','DONE','WAIVED')),
      owner TEXT, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_compliance_calendar_due ON compliance_calendar(portfolio, due_on, status);
  `)
};

