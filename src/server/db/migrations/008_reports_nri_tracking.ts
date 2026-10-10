import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';
const name = '008_reports_nri_tracking';
export const migration008: Migration = { id: 8, name, checksum: crypto.createHash('sha256').update(name).digest('hex'), up: (db: Database.Database) => {
  db.exec(`CREATE TABLE IF NOT EXISTS report_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, report_type TEXT NOT NULL, portfolio TEXT, financial_year TEXT, start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'COMPLETED', request_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_report_runs_created ON report_runs(created_at DESC);
  CREATE TABLE IF NOT EXISTS nri_tracker (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL, account_profile TEXT, tax_residency_status TEXT, residency_effective_date TEXT, treaty_reference TEXT, advisor_reference TEXT, review_due_date TEXT, evidence_reference TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVIEW','CLOSED')), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_nri_tracker_portfolio ON nri_tracker(portfolio, status);`);
} };

