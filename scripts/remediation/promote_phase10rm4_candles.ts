#!/usr/bin/env tsx
/** Promote validated Phase 10R-M.4 candles into canonical DailyOHLCV.
 * Download and promotion are deliberately separate: without --apply this is
 * a read-only audit, and every insert is idempotent on (symbol, trade_date).
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd();
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const input = path.resolve(arg('--input') || path.join(root, 'reports/market-data/PHASE10RM4_RECOVERED_CANDLES.jsonl'));
const apply = process.argv.includes('--apply');
if (!fs.existsSync(input)) throw new Error(`Recovery candle artifact not found: ${input}`);

const rows: any[] = [];
for (const line of fs.readFileSync(input, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  const numeric = ['open', 'high', 'low', 'close', 'volume'];
  if (!row.symbol || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.trade_date)) || numeric.some(k => !Number.isFinite(Number(row[k])))) continue;
  if (!(Number(row.open) > 0 && Number(row.high) >= Math.max(Number(row.open), Number(row.close)) && Number(row.low) <= Math.min(Number(row.open), Number(row.close)) && Number(row.low) > 0)) continue;
  rows.push(row);
}

const db = new Database(path.join(root, 'portfolio.db'));
const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='DailyOHLCV'").get();
if (!table) throw new Error('DailyOHLCV table is missing');
const exists = db.prepare('SELECT 1 FROM DailyOHLCV WHERE symbol=? AND trade_date=?');
const insert = db.prepare(`INSERT INTO DailyOHLCV
  (symbol, trade_date, open, high, low, close, volume, data_source)
  VALUES (@symbol,@trade_date,@open,@high,@low,@close,@volume,'UPSTOX_10RM4')`);
let inserted = 0, skipped = 0;
if (apply) {
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (exists.get(row.symbol, row.trade_date)) { skipped++; continue; }
      insert.run(row);
      inserted++;
    }
  });
  tx();
} else {
  for (const row of rows) if (exists.get(row.symbol, row.trade_date)) skipped++;
}
db.close();
console.log(JSON.stringify({ input, candidates: rows.length, inserted, skipped, apply, mcpUsed: false }, null, 2));
