import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const name = 'add_entry_plan_outcomes';

export const migrationAddEntryPlanOutcomes: Migration = {
  id: 17,
  name,
  checksum: crypto.createHash('sha256').update(name).digest('hex'),
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS entry_plan_outcomes (
        plan_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        strategy_id TEXT,
        signal_date TEXT,
        signal_price REAL,
        signal_convergence INTEGER,
        planned_entry_price REAL,
        actual_entry_price REAL,
        entry_date TEXT,
        planned_exit_price REAL,
        actual_exit_price REAL,
        exit_date TEXT,
        stop_loss_price REAL,
        target_price REAL,
        pnl_pct REAL,
        pnl_inr REAL,
        quantity INTEGER,
        outcome_label TEXT CHECK(outcome_label IN ('OPEN','HIT_TARGET','HIT_STOP','MANUAL_EXIT','EXPIRED')),
        holding_days INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_epo_symbol
        ON entry_plan_outcomes(symbol)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_epo_strategy
        ON entry_plan_outcomes(strategy_id)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_epo_signal_date
        ON entry_plan_outcomes(signal_date)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_epo_outcome
        ON entry_plan_outcomes(outcome_label)
    `);
  },
};
