#!/usr/bin/env node
'use strict';

// Deterministic Upstox-only daily OHLCV backfill.  Downloads are staged first;
// --apply is required to write canonical DailyOHLCV.  Re-running resumes from
// completed provider/date windows and never consumes MCP calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
try { require('dotenv').config(); } catch {}

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const outDir = path.resolve(process.env.UPSTOX_FULL_OUTPUT_DIR || path.join(root, 'reports/market-data/upstox-full'));
fs.mkdirSync(outDir, { recursive: true });
const candlesFile = path.join(outDir, 'candles.jsonl');
const failuresFile = path.join(outDir, 'failures.jsonl');
const checkpointFile = path.join(outDir, 'checkpoint.json');
const reportFile = path.join(outDir, 'report.json');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback;
};
const apply = process.argv.includes('--apply');
const allowPlanChange = process.argv.includes('--allow-plan-change');
const gapMs = Math.max(250, Number(arg('--gap-ms', process.env.UPSTOX_CANDLE_GAP_MS || 750)));
const toDefault = arg('--to', new Date().toISOString().slice(0, 10));
const latestDays = Number(arg('--latest-days', '0'));
const fromDefault = arg('--from', latestDays > 0 ? (() => { const d = days(toDefault); d.setUTCDate(d.getUTCDate() - latestDays); return iso(d); })() : '2015-01-01');
const manifest = arg('--manifest');
const only = arg('--symbol');

function token() {
  if (process.env.UPSTOX_ACCESS_TOKEN) return process.env.UPSTOX_ACCESS_TOKEN;
  try { const d = new Database(dbPath, { readonly: true }); const v = d.prepare("SELECT value FROM AppConfig WHERE key='Access_Token'").get()?.value; d.close(); return String(v || ''); } catch { return ''; }
}
function days(s) { const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(d.getTime()) ? d : null; }
function iso(d) { return d.toISOString().slice(0, 10); }
function windows(from, to) {
  const out = []; let cur = days(from), end = days(to);
  while (cur && end && cur <= end) {
    const wEnd = new Date(cur); wEnd.setUTCDate(wEnd.getUTCDate() + 364); if (wEnd > end) wEnd.setTime(end.getTime());
    out.push({ from: iso(cur), to: iso(wEnd) }); cur = new Date(wEnd); cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
function valid(c) {
  if (!Array.isArray(c) || c.length < 6) return false;
  const dt = String(c[0]).slice(0, 10), n = c.slice(1, 6).map(Number);
  return /^\d{4}-\d{2}-\d{2}$/.test(dt) && n.every(Number.isFinite) && n[0] > 0 && n[2] > 0 && n[3] > 0 && n[2] <= Math.max(n[0], n[3]) && n[1] >= Math.max(n[0], n[3]);
}
function loadSymbols() {
  const d = new Database(dbPath, { readonly: true });
  let rows = d.prepare("SELECT symbol, isin, exchange, upstox_key_nse, upstox_key_bse, listing_date FROM MasterTickers WHERE COALESCE(status,'ACTIVE')='ACTIVE' ORDER BY symbol, id").all(); d.close();
  if (manifest) {
    const m = JSON.parse(fs.readFileSync(path.resolve(manifest), 'utf8'));
    const syms = new Set((m.entries || m.symbols || m).map(x => typeof x === 'string' ? x : (x.symbol || x.key?.split(':').pop())).filter(Boolean));
    rows = rows.filter(x => syms.has(x.symbol));
  }
  if (only) rows = rows.filter(x => x.symbol === only);
  const seen = new Set();
  // Prefer NSE key when available regardless of exchange — BSE SME / cross-listed stocks
  // often have a valid NSE_EQ key while the BSE_EQ key returns HTTP 400 from Upstox v2.
  // Fall back to BSE key only for BSE-only listings (no NSE key present).
  return rows
    .filter(x => { if (seen.has(x.symbol)) return false; seen.add(x.symbol); return true; })
    .filter(x => {
      const isin = x.isin || '';
      const exchange = (x.exchange || '').toUpperCase();
      // Rights entitlements (IN8/IN9 ISIN prefix) have no equity candle data in Upstox V2.
      if (/^IN[89]/.test(isin)) return false;
      // Mutual-fund units (INF ISIN prefix) are not on the Upstox equity candle endpoint.
      if (isin.startsWith('INF')) return false;
      // Non-Indian exchanges (NASDAQ/NYSE/AMEX/OTC) have no NSE_EQ or BSE_EQ key.
      if (['NASDAQ', 'NYSE', 'AMEX', 'OTC'].includes(exchange)) return false;
      return true;
    })
    .map(x => ({ ...x, providerKey: x.upstox_key_nse || x.upstox_key_bse }));
}
function promoteStaged(db, file) {
  if (!fs.existsSync(file)) return { inserted: 0, skipped: 0 };
  const exists = db.prepare('SELECT 1 FROM DailyOHLCV WHERE symbol=? AND trade_date=?');
  const ins = db.prepare("INSERT OR IGNORE INTO DailyOHLCV (symbol,trade_date,open,high,low,close,volume,data_source) VALUES (?,?,?,?,?,?,?,'UPSTOX_V2')");
  let inserted = 0, skipped = 0;
  const tx = db.transaction(() => { for (const line of fs.readFileSync(file, 'utf8').split('\n')) { if (!line.trim()) continue; let x; try { x = JSON.parse(line); } catch { continue; } if (exists.get(x.symbol, x.trade_date)) { skipped++; continue; } const r = ins.run(x.symbol, x.trade_date, x.open, x.high, x.low, x.close, x.volume); inserted += r.changes; } });
  tx(); return { inserted, skipped };
}
async function main() {
  const access = token(); if (!access) throw new Error('UPSTOX_ACCESS_TOKEN is not configured');
  const symbols = loadSymbols().filter(x => x.providerKey);
  if (!symbols.length) throw new Error('No active symbols with an Upstox provider key');
  const windowsBySymbol = symbols.flatMap(s => windows(s.listing_date && s.listing_date > fromDefault ? s.listing_date : fromDefault, toDefault).map(w => ({ ...s, ...w })));
  const hash = crypto.createHash('sha256').update(JSON.stringify(windowsBySymbol.map(x => [x.symbol,x.providerKey,x.from,x.to]))).digest('hex');
  let cp = fs.existsSync(checkpointFile) ? JSON.parse(fs.readFileSync(checkpointFile)) : { planHash: hash, done: {}, stats: { windows: 0, ok: 0, failed: 0, candles: 0 } };
  if (cp.planHash && cp.planHash !== hash) {
    if (!allowPlanChange) throw new Error('Plan changed; rerun with --allow-plan-change after reviewing reports');
    cp.planChange = { previousHash: cp.planHash, currentHash: hash, acceptedAt: new Date().toISOString(), preservedDone: Object.keys(cp.done || {}).length };
  }
  cp.planHash = hash; if (!fs.existsSync(candlesFile)) fs.writeFileSync(candlesFile, ''); if (!fs.existsSync(failuresFile)) fs.writeFileSync(failuresFile, '');
  const wait = ms => new Promise(r => setTimeout(r, ms)); let last = 0;
  for (let i = 0; i < windowsBySymbol.length; i++) {
    const x = windowsBySymbol[i], key = `${x.providerKey}|${x.from}|${x.to}`; if (cp.done[key]) continue;
    const pause = Math.max(0, gapMs - (Date.now() - last)); if (pause) await wait(pause);
    // Upstox V2 is the stable daily historical endpoint.  V3 uses a different
    // interval contract and rejects this daily path with UDAPI100036.
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(x.providerKey)}/day/${x.to}/${x.from}`;
    let status = 0, candles = [];
    try { const r = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(60000) }); status = r.status; const j = await r.json().catch(() => null); candles = (j?.data?.candles || []).filter(valid); } catch (e) { status = 0; }
    last = Date.now();
    // If the NSE key returned 400 and the symbol also has a BSE key, retry once.
    // Handles stocks that are active on BSE but whose NSE_EQ key Upstox V2 rejects
    // (recently listed, suspended on NSE, or cross-listed with a thinly-traded NSE series).
    if (status === 400 && x.upstox_key_bse && x.upstox_key_nse && x.providerKey === x.upstox_key_nse && x.upstox_key_bse !== x.upstox_key_nse) {
      const pause2 = Math.max(0, gapMs - (Date.now() - last)); if (pause2) await wait(pause2);
      const altUrl = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(x.upstox_key_bse)}/day/${x.to}/${x.from}`;
      try { const r2 = await fetch(altUrl, { headers: { Accept: 'application/json', Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(60000) }); status = r2.status; const j2 = await r2.json().catch(() => null); candles = (j2?.data?.candles || []).filter(valid); } catch { status = 0; }
      last = Date.now();
    }
    if (status === 200) { for (const c of candles) fs.appendFileSync(candlesFile, JSON.stringify({ symbol: x.symbol, isin: x.isin, provider_key: x.providerKey, trade_date: String(c[0]).slice(0,10), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]), source: 'UPSTOX_V2' }) + '\n'); cp.stats.ok++; cp.stats.candles += candles.length; } else { fs.appendFileSync(failuresFile, JSON.stringify({ symbol:x.symbol, provider_key:x.providerKey, from:x.from, to:x.to, status, source:'UPSTOX_V2' })+'\n'); cp.stats.failed++; }
    cp.done[key] = { status, candles: candles.length, at: new Date().toISOString() }; cp.stats.windows++; fs.writeFileSync(checkpointFile, JSON.stringify(cp, null, 2));
    // Promote completed staged candles at checkpoints; this makes every
    // successful acquisition usable by consumers before the full run ends.
    if (apply && (i + 1) % 25 === 0) { const db = new Database(dbPath); const p = promoteStaged(db, candlesFile); db.close(); cp.promotion = { ...p, at: new Date().toISOString(), mcpUsed: false }; fs.writeFileSync(checkpointFile, JSON.stringify(cp, null, 2)); }
    if ((i + 1) % 25 === 0 || i === windowsBySymbol.length - 1) console.log(JSON.stringify({ progress: `${i+1}/${windowsBySymbol.length}`, ...cp.stats, apply }));
  }
  if (apply) {
    const db = new Database(dbPath); const exists = db.prepare('SELECT 1 FROM DailyOHLCV WHERE symbol=? AND trade_date=?'); const ins = db.prepare("INSERT OR IGNORE INTO DailyOHLCV (symbol,trade_date,open,high,low,close,volume,data_source) VALUES (?,?,?,?,?,?,?,'UPSTOX_V2')"); let inserted=0, skipped=0;
    const tx=db.transaction(()=>{ for(const line of fs.readFileSync(candlesFile,'utf8').split('\n')){if(!line.trim())continue; const x=JSON.parse(line); if(exists.get(x.symbol,x.trade_date)){skipped++;continue;} const r=ins.run(x.symbol,x.trade_date,x.open,x.high,x.low,x.close,x.volume); inserted+=r.changes;}}); tx(); db.close(); cp.promotion={inserted,skipped,at:new Date().toISOString(),mcpUsed:false};
  }
  fs.writeFileSync(reportFile, JSON.stringify({ generatedAt:new Date().toISOString(), symbols:symbols.length, windows:windowsBySymbol.length, ...cp.stats, apply, mcpUsed:false, checkpoint:checkpointFile, candles:candlesFile, failures:failuresFile, promotion:cp.promotion || null }, null, 2)); console.log(fs.readFileSync(reportFile,'utf8'));
}
main().catch(e => { console.error(`UPSTOX_BACKFILL_FAILED: ${e.message}`); process.exit(1); });
