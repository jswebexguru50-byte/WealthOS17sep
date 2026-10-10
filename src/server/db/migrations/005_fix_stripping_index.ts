import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const name = '005_fix_stripping_index';
export const migration005: Migration = {
  id: 5,
  name,
  checksum: crypto.createHash('sha256').update(name).digest('hex'),
  up: (db: Database.Database) => {
    db.exec('DROP INDEX IF EXISTS idx_sd_pan_fy');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sd_pan_fy ON StrippingDisallowances(portfolio, trigger_sell_date)');
  }
};

