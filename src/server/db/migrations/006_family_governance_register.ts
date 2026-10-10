import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const name = '006_family_governance_register';
export const migration006: Migration = {
  id: 6, name, checksum: crypto.createHash('sha256').update(name).digest('hex'),
  up: (db: Database.Database) => {
    db.exec(`CREATE TABLE IF NOT EXISTS family_governance_register (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio TEXT NOT NULL,
      subject_type TEXT NOT NULL CHECK(subject_type IN ('NOMINEE','JOINT_HOLDER','SUCCESSOR','TRUSTEE')),
      subject_name TEXT NOT NULL,
      relationship TEXT,
      contact_reference TEXT,
      allocation_percent REAL CHECK(allocation_percent IS NULL OR (allocation_percent >= 0 AND allocation_percent <= 100)),
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','PENDING')),
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_family_governance_portfolio ON family_governance_register(portfolio, status);
    CREATE TABLE IF NOT EXISTS family_governance_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, register_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','REVOKE')),
      actor TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
  }
};

