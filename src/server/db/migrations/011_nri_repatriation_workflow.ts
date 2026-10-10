import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';
const name = '011_nri_repatriation_workflow';
export const migration011: Migration = { id: 11, name, checksum: crypto.createHash('sha256').update(name).digest('hex'), up: (db: Database.Database) => db.exec(`
CREATE TABLE IF NOT EXISTS nri_repatriation_workflow (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL, transfer_reference TEXT, source_account TEXT, destination_country TEXT, requested_on TEXT NOT NULL, target_on TEXT, review_due_on TEXT, checklist_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','READY_FOR_ADVISOR','COMPLETED','CANCELLED')), advisor_reference TEXT, evidence_reference TEXT, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_nri_repatriation_portfolio ON nri_repatriation_workflow(portfolio,status,requested_on);
CREATE TABLE IF NOT EXISTS nri_review_reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL, tracker_id INTEGER, reminder_type TEXT NOT NULL, due_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','COMPLETED','DISMISSED')), notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_nri_review_reminders_due ON nri_review_reminders(portfolio,due_on,status);`) };

