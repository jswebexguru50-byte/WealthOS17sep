import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const name = 'add_acquisition_job_ledger';

export const migrationAddAcquisitionJobLedger: Migration = {
  id: 15,
  name,
  checksum: crypto.createHash('sha256').update(name).digest('hex'),
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS acquisition_job_ledger (
        job_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        isin TEXT,
        domain TEXT NOT NULL,
        metric TEXT,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        next_retry_at TEXT,
        raw_payload_hash TEXT,
        raw_storage_path TEXT,
        normalized_at TEXT,
        promoted_at TEXT,
        promotion_result TEXT,
        error_class TEXT,
        error_detail TEXT,
        ttl_seconds INTEGER DEFAULT 86400,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_acq_ledger_symbol_domain
        ON acquisition_job_ledger(symbol, domain, status)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_acq_ledger_pending
        ON acquisition_job_ledger(status, next_retry_at)
        WHERE status IN ('PENDING','FAILED')
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_acq_ledger_expires
        ON acquisition_job_ledger(expires_at)
        WHERE status = 'PROMOTED'
    `);
  },
};
