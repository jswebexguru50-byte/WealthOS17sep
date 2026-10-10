import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

const MIGRATION_NAME = '004_security_identity_aliases';
const checksum = crypto.createHash('sha256').update(MIGRATION_NAME).digest('hex');

export const migration004: Migration = {
  id: 4,
  name: MIGRATION_NAME,
  checksum,
  up: (db: Database.Database) => {
    db.exec(`CREATE TABLE IF NOT EXISTS SecurityIdentityAliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias_kind TEXT NOT NULL CHECK(alias_kind IN ('SYMBOL', 'ISIN')),
      alias_value TEXT NOT NULL UNIQUE,
      canonical_symbol TEXT NOT NULL,
      canonical_isin TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'canonical_migration');`);
    const insert = db.prepare(`INSERT OR IGNORE INTO SecurityIdentityAliases
      (alias_kind, alias_value, canonical_symbol, canonical_isin) VALUES (?, ?, ?, ?)`);
    const aliases: Array<[string, string, string, string]> = [
      ['ISIN', 'INE869Y01010', 'TEMBO', 'INE869Y01028'],
      ['ISIN', 'INE713T01010', 'APOLLO', 'INE713T01028'],
      ['ISIN', 'IN_ORIANA', 'ORIANA', 'INE0OUT01027'],
      ['ISIN', 'INE0OUT01019', 'ORIANA', 'INE0OUT01027'],
      ['ISIN', 'INE245A01021', 'TATAPOWER', 'INE245A01021'],
      ['SYMBOL', 'TEMBO', 'TEMBO', 'INE869Y01028'],
      ['SYMBOL', 'APOLLO', 'APOLLO', 'INE713T01028'],
      ['SYMBOL', 'ORIANA', 'ORIANA', 'INE0OUT01027'],
      ['SYMBOL', 'TATAPOWER', 'TATAPOWER', 'INE245A01021']
    ];
    for (const row of aliases) insert.run(...row);
  }
};

