import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';
const name = '012_family_review_packs';
export const migration012: Migration = { id: 12, name, checksum: crypto.createHash('sha256').update(name).digest('hex'), up: (db: Database.Database) => db.exec(`
CREATE TABLE IF NOT EXISTS family_review_packs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 pack_key TEXT NOT NULL UNIQUE,
 portfolio TEXT NOT NULL,
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 quarter_label TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PREVIEWED','FINALIZED','CANCELLED')),
 sections_json TEXT NOT NULL DEFAULT '[]',
 preview_json TEXT,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finalized_by TEXT,
 finalized_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_family_review_packs_portfolio_period ON family_review_packs(portfolio,period_end);
CREATE TABLE IF NOT EXISTS family_review_pack_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 pack_id INTEGER NOT NULL REFERENCES family_review_packs(id),
 action TEXT NOT NULL,
 actor TEXT NOT NULL,
 payload_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_family_review_pack_audit_pack ON family_review_pack_audit(pack_id,created_at);
`) };

