#!/usr/bin/env tsx
/** Ensure BSE-only identities have their deterministic Upstox instrument key. */
import Database from 'better-sqlite3';
import path from 'node:path';

const db = new Database(path.join(process.cwd(), 'portfolio.db'));
const rows = db.prepare(`
  SELECT id, symbol, isin FROM MasterTickers
  WHERE isin IS NOT NULL AND TRIM(isin) <> ''
    AND (exchange='BSE' OR symbol GLOB '[0-9]*')
    AND (upstox_key_bse IS NULL OR TRIM(upstox_key_bse)='')
`).all() as any[];
const update = db.prepare('UPDATE MasterTickers SET upstox_key_bse=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
let updated = 0;
const tx = db.transaction(() => {
  for (const row of rows) {
    update.run(`BSE_EQ|${String(row.isin).trim().toUpperCase()}`, row.id);
    updated++;
  }
});
tx();
db.close();
console.log(JSON.stringify({ candidates: rows.length, updated, source: 'MasterTickers.isin', mcpUsed: false }, null, 2));
