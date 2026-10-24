import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const name = 'add_scan_scorecard';

export const migrationAddScanScorecard: Migration = {
  id: 16,
  name,
  checksum: crypto.createHash('sha256').update(name).digest('hex'),
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scan_signal_log (
        signal_id TEXT PRIMARY KEY,
        scan_date TEXT,
        symbol TEXT,
        strategy_id TEXT,
        strategy_category TEXT,
        convergence_count INTEGER,
        signal_price REAL,
        signal_rsi REAL,
        signal_volume_ratio REAL,
        signal_metadata TEXT,
        outcome_check_date TEXT,
        outcome_price REAL,
        outcome_pct_change REAL,
        outcome_label TEXT CHECK(outcome_label IN ('WIN','LOSS','NEUTRAL','PENDING')),
        created_at TEXT,
        updated_at TEXT
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ssl_scan_date
        ON scan_signal_log(scan_date)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ssl_symbol
        ON scan_signal_log(symbol)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ssl_strategy
        ON scan_signal_log(strategy_id)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ssl_outcome
        ON scan_signal_log(outcome_label)
    `);
  },
};
