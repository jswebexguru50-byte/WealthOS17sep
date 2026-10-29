#!/usr/bin/env node
'use strict';

// Classifies deterministic Upstox failures without retrying or consuming any
// provider quota.  The result is an input to the non-MCP fallback planner.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
try { require('dotenv').config(); } catch {}

const root = process.cwd();
const dir = path.resolve(process.argv[2] || process.env.UPSTOX_FULL_OUTPUT_DIR || path.join(root, 'reports/market-data/upstox-full'));
const failuresPath = path.join(dir, 'failures.jsonl');
if (!fs.existsSync(failuresPath)) throw new Error(`Failure ledger not found: ${failuresPath}`);
const failures = fs.readFileSync(failuresPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const db = new Database(path.join(root, 'portfolio.db'), { readonly: true });
const getTicker = db.prepare('SELECT symbol, exchange, segment, series, isin, status, upstox_key_nse, upstox_key_bse FROM MasterTickers WHERE symbol=? ORDER BY id LIMIT 1');
const rows = failures.map(f => {
  const t = getTicker.get(f.symbol) || {};
  const exchange = String(t.exchange || '').toUpperCase();
  const segment = String(t.segment || '').toUpperCase();
  const series = String(t.series || '').toUpperCase();
  let classification = 'REVIEW';
  let nextSource = 'KITE_OR_EXCHANGE_WEB';
  if (exchange && !['NSE', 'BSE'].includes(exchange)) { classification = 'NON_INDIAN_EQUITY'; nextSource = 'EXCLUDE_FROM_EQUITY_OHLCV'; }
  else if (segment !== 'EQ' || (series && !['EQ', 'BE', 'B'].includes(series))) { classification = 'NON_EQUITY_OR_UNSUPPORTED_SERIES'; nextSource = 'EXCLUDE_OR_EXCHANGE_WEB'; }
  else if (exchange === 'BSE') { classification = 'BSE_UPSTOX_REJECTED'; nextSource = 'BSE_WEB_OR_KITE'; }
  else if (String(f.provider_key || '').includes('_UNKNOWN_')) { classification = 'INVALID_PROVIDER_IDENTITY'; nextSource = 'IDENTITY_REPAIR_THEN_UPSTOX'; }
  else { classification = 'NSE_UPSTOX_REJECTED'; nextSource = 'KITE_OR_NSE_WEB'; }
  return { ...f, exchange: t.exchange || null, segment: t.segment || null, series: t.series || null, isin: t.isin || null, classification, nextSource };
});
db.close();
const counts = {};
for (const row of rows) counts[row.classification] = (counts[row.classification] || 0) + 1;
const out = { generatedAt: new Date().toISOString(), source: failuresPath, counts, failures: rows };
const outPath = path.join(dir, 'failure_classification.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ outPath, total: rows.length, counts }, null, 2));
