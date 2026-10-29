#!/usr/bin/env node
'use strict';

// Idempotent sidecar promoter. It may run while upstox_full_candle_backfill.cjs
// is appending candles.jsonl; INSERT OR IGNORE makes repeated passes safe.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
try { require('dotenv').config(); } catch {}
const root = process.cwd();
const outDir = path.resolve(process.env.UPSTOX_FULL_OUTPUT_DIR || path.join(root, 'reports/market-data/upstox-full'));
const candlesFile = path.join(outDir, 'candles.jsonl');
const stateFile = path.join(outDir, 'promotion-checkpoint.json');
const db = new Database(path.join(root, 'portfolio.db'));
const insert = db.prepare("INSERT OR IGNORE INTO DailyOHLCV (symbol,trade_date,open,high,low,close,volume,data_source) VALUES (?,?,?,?,?,?,?,'UPSTOX_V2')");
function promote() {
  if (!fs.existsSync(candlesFile)) return {read: 0, inserted: 0, skipped: 0, offset: 0};
  const prior = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {offset: 0};
  const text = fs.readFileSync(candlesFile, 'utf8');
  const start = Math.min(Number(prior.offset) || 0, text.length);
  const chunk = text.slice(start);
  const lines = chunk.split('\n');
  const complete = lines.pop() === '' ? lines : lines; // keep only complete JSON lines
  let inserted = 0, skipped = 0, read = 0;
  const tx = db.transaction(() => {
    for (const line of complete) {
      if (!line.trim()) continue;
      let x; try { x = JSON.parse(line); } catch { continue; }
      read++;
      const r = insert.run(x.symbol, x.trade_date, x.open, x.high, x.low, x.close, x.volume);
      if (r.changes) inserted++; else skipped++;
    }
  });
  tx();
  const consumed = Buffer.byteLength(complete.join('\n') + (complete.length ? '\n' : ''));
  const next = start + consumed;
  fs.writeFileSync(stateFile, JSON.stringify({offset: next, updatedAt: new Date().toISOString(), read: (prior.read || 0) + read, inserted: (prior.inserted || 0) + inserted, skipped: (prior.skipped || 0) + skipped}, null, 2));
  return {read, inserted, skipped, offset: next};
}
const result = promote(); db.close(); console.log(JSON.stringify({outDir, ...result, mcpUsed: false}));
