import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';
const name = '010_report_schedules';
export const migration010: Migration = { id: 10, name, checksum: crypto.createHash('sha256').update(name).digest('hex'), up: (db: Database.Database) => {
  db.exec(`CREATE TABLE IF NOT EXISTS report_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, report_type TEXT NOT NULL, portfolio TEXT, frequency TEXT NOT NULL CHECK(frequency IN ('DAILY','WEEKLY','MONTHLY')), timezone TEXT NOT NULL DEFAULT 'UTC', next_run_at TEXT NOT NULL, delivery_mode TEXT NOT NULL DEFAULT 'DOWNLOAD_ONLY' CHECK(delivery_mode IN ('DOWNLOAD_ONLY','EMAIL_PENDING')), recipient_ref TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED')), last_run_at TEXT, last_status TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS idx_report_schedules_due ON report_schedules(status, next_run_at); CREATE INDEX IF NOT EXISTS idx_report_schedules_owner ON report_schedules(created_by, status);`);
} };

