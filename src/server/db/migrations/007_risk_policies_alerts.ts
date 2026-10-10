import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const name = '007_risk_policies_alerts';
export const migration007: Migration = {
  id: 7, name, checksum: crypto.createHash('sha256').update(name).digest('hex'),
  up: (db: Database.Database) => db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_risk_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL UNIQUE,
      max_single_asset_pct REAL, max_equity_pct REAL, max_daily_var_pct REAL,
      enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS portfolio_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL, symbol TEXT,
      alert_type TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('INFO','WARNING','CRITICAL')),
      message TEXT NOT NULL, observed_value REAL, threshold_value REAL, status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, acknowledged_at TEXT, acknowledged_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_portfolio_alerts_open ON portfolio_alerts(portfolio,status,created_at);
  `)
};

