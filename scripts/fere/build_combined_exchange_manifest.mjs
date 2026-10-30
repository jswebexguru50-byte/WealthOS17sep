#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
const value = (flag, fallback) => { const i = process.argv.indexOf(flag); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const dbPath = value('--db', process.env.DATABASE_URL || path.resolve('portfolio.db'));
const outPath = value('--out', path.resolve('outputs/fere/combined_exchange_manifest.json'));
const db = new BetterSqlite3(dbPath, { readonly: true });
const columns = new Set(db.prepare('PRAGMA table_info(MasterTickers)').all().map((row) => row.name));
const activePredicate = columns.has('is_active') ? 'COALESCE(is_active,1)=1' : (columns.has('status') ? "(status IS NULL OR upper(status) NOT IN ('INACTIVE','DELISTED'))" : '1=1');
// Exchange universe policy: exchange IN ('NSE','BSE'); numeric-symbol=BSE,
// alphabetic-symbol=NSE. Listings are deduplicate-by-ISIN while retaining both
// exchange routes and status: 'pending' for deterministic resumable runs.
const rows = db.prepare(`SELECT symbol, isin, exchange, name, company_name FROM MasterTickers WHERE ${activePredicate} AND upper(exchange) IN ('NSE','BSE') AND symbol IS NOT NULL AND trim(symbol)<>'' ORDER BY upper(symbol), exchange`).all();
db.close();
const groups = new Map();
for (const row of rows) {
  const symbol = String(row.symbol).trim().toUpperCase();
  const exchange = String(row.exchange).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,24}$/.test(symbol)) continue;
  const isin = row.isin ? String(row.isin).trim().toUpperCase() : null;
  const key = isin || `${exchange}:${symbol}`;
  const entry = groups.get(key) || { key, isin, name: row.company_name || row.name || symbol, listings: [], status: 'pending', attempts: 0 };
  if (!entry.listings.some((x) => x.symbol === symbol && x.exchange === exchange)) entry.listings.push({ symbol, exchange, route: /^\d+$/.test(symbol) ? 'BSE' : 'NSE' });
  groups.set(key, entry);
}
const manifest = { version: 1, generatedAt: new Date().toISOString(), source: 'MasterTickers', policy: 'numeric-symbol=BSE; alphabetic-symbol=NSE; deduplicate-by-ISIN', entries: [...groups.values()] };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ outPath, sourceRows: rows.length, entries: manifest.entries.length }));
