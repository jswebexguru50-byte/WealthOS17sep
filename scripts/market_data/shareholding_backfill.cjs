#!/usr/bin/env node
'use strict';

// Deterministic NSE/BSE shareholding pattern backfill.
// Downloads official shareholding data and stages it; --apply promotes to ShareholdingPatterns.
// Re-running resumes from checkpoint and is idempotent (INSERT OR IGNORE).
//
// Usage:
//   node shareholding_backfill.cjs [--apply] [--symbol RELIANCE] [--gap-ms 1000]
//   node shareholding_backfill.cjs --apply --from-date 2024-04-01  (process quarters since date)

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
try { require('dotenv').config(); } catch {}

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const outDir = path.resolve(
  process.env.SHAREHOLDING_OUTPUT_DIR || path.join(root, 'reports/market-data/shareholding')
);
fs.mkdirSync(outDir, { recursive: true });

const stagingFile  = path.join(outDir, 'staged.jsonl');
const failuresFile = path.join(outDir, 'failures.jsonl');
const checkpointFile = path.join(outDir, 'checkpoint.json');
const reportFile   = path.join(outDir, 'report.json');

const apply        = process.argv.includes('--apply');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/market_data/shareholding_backfill.cjs [--apply] [--symbol SYMBOL] [--limit N] [--gap-ms N]');
  console.log('Default mode stages official NSE shareholding responses; --apply promotes staged rows idempotently.');
  process.exit(0);
}
const onlySymbols  = (() => {
  const result = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--symbol' && process.argv[i + 1]) result.push(process.argv[i + 1]);
  }
  return result;
})();
const limit = (() => {
  const i = process.argv.indexOf('--limit');
  if (i < 0) return null;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error('--limit must be a positive integer');
  return n;
})();
const gapMs = Math.max(500, Number(
  (() => { const i = process.argv.indexOf('--gap-ms'); return i >= 0 ? process.argv[i + 1] : '1200'; })()
));

// ── Filing period helpers ──────────────────────────────────────────────────

const MONTH_MAP = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };

function parseFilingPeriod(quarterStr) {
  const m = quarterStr.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[1]];
  const year  = parseInt(m[2], 10);
  if (!month || !year) return null;
  let fy, quarter;
  if (month >= 4) { fy = year + 1; quarter = Math.floor((month - 4) / 3) + 1; }
  else            { fy = year;     quarter = 4; }
  return `Q${quarter}FY${fy}`;
}

function computeArtifactHash(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Load symbols ───────────────────────────────────────────────────────────

function loadSymbols() {
  const db = new Database(dbPath, { readonly: true });
  let rows = db.prepare(
    "SELECT symbol, isin, exchange FROM MasterTickers WHERE COALESCE(status,'ACTIVE')='ACTIVE' ORDER BY symbol"
  ).all();
  db.close();
  if (onlySymbols.length) rows = rows.filter(r => onlySymbols.includes(r.symbol));
  // Keep only Indian-exchange symbols — shareholding is filed with SEBI for Indian equities
  rows = rows.filter(r => {
    const ex = (r.exchange || '').toUpperCase();
    if (['NASDAQ','NYSE','AMEX','OTC'].includes(ex)) return false;
    if (r.isin && /^IN[89]/.test(r.isin)) return false;  // rights entitlements
    if (r.isin && r.isin.startsWith('INF'))  return false;  // MF units
    return true;
  });
  // De-duplicate by symbol
  const seen = new Set();
  const unique = rows.filter(r => { if (seen.has(r.symbol)) return false; seen.add(r.symbol); return true; });
  return limit == null ? unique : unique.slice(0, limit);
}

// ── NSE shareholding fetch ─────────────────────────────────────────────────
// NSE blocks plain fetch without a session cookie.  We first hit the homepage
// to obtain a set of cookies, then use them on the API endpoint.

async function fetchNseCookies() {
  const r = await fetch('https://www.nseindia.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  // Extract key=value pairs from a set-cookie header chain
  return setCookie.split(',').map(s => s.trim().split(';')[0]).filter(Boolean).join('; ');
}

async function fetchNseShareholding(symbol, cookies) {
  const url = `https://www.nseindia.com/api/corporate-share-holding?index=EQ&symbol=${encodeURIComponent(symbol)}&period=Quarterly`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://www.nseindia.com',
      Cookie: cookies,
    },
    signal: AbortSignal.timeout(20000),
  });
  return { status: r.status, raw: r.status === 200 ? await r.text() : null };
}

// ── Parse NSE response ─────────────────────────────────────────────────────

function parseNseResponse(raw, symbol, isin) {
  if (!raw) return [];
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  // NSE returns an array or object with shareholdingPatterns array
  const quarters = Array.isArray(data) ? data : (data.data || []);
  return quarters.map(q => {
    const periodStr = q.date || q.quarter || '';
    const filing_period = parseFilingPeriod(periodStr) || periodStr;
    // Promoter / FII / DII / Public percentages vary by API version
    const promoter_pct = Number(q.promoter || q.promoterHolding || q.promoterAndPromoterGroup || 0) || null;
    const fii_pct      = Number(q.fii || q.foreignInstitutional || q.fiiDiiInfo?.fii || 0) || null;
    const dii_pct      = Number(q.dii || q.domesticInstitutional || q.fiiDiiInfo?.dii || 0) || null;
    const public_pct   = Number(q.public || q.publicShareholders || 0) || null;
    return { symbol, isin, filing_period, promoter_pct, fii_pct, dii_pct, public_pct, total_shares: null };
  }).filter(r => r.filing_period);
}

// ── Promote staged data ────────────────────────────────────────────────────

function promoteStaged(db, file) {
  if (!fs.existsSync(file)) return { inserted: 0, skipped: 0 };
  const ins = db.prepare(`
    INSERT OR IGNORE INTO ShareholdingPatterns
      (symbol, isin, filing_period, promoter_pct, fii_pct, dii_pct, public_pct,
       total_shares, source_url, provider, artifact_hash, acquired_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OK')
  `);
  let inserted = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let x; try { x = JSON.parse(line); } catch { continue; }
      const r = ins.run(
        x.symbol, x.isin, x.filing_period,
        x.promoter_pct, x.fii_pct, x.dii_pct, x.public_pct,
        x.total_shares, x.source_url, x.provider, x.artifact_hash,
        x.acquired_at
      );
      if (r.changes) inserted++; else skipped++;
    }
  });
  tx();
  return { inserted, skipped };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const symbols = loadSymbols();
  if (!symbols.length) throw new Error('No eligible symbols found');

  let cp = fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
    : { done: {}, stats: { total: 0, ok: 0, failed: 0, rows: 0 } };

  if (!fs.existsSync(stagingFile))  fs.writeFileSync(stagingFile, '');
  if (!fs.existsSync(failuresFile)) fs.writeFileSync(failuresFile, '');

  const wait = ms => new Promise(r => setTimeout(r, ms));
  let last = 0;
  let cookies = '';

  // Fetch NSE session cookies once at start
  try {
    cookies = await fetchNseCookies();
    console.log(JSON.stringify({ event: 'NSE_COOKIES_OK', cookieLen: cookies.length }));
  } catch (e) {
    console.log(JSON.stringify({ event: 'NSE_COOKIES_FAILED', error: e.message }));
    // Will proceed; individual fetches will record failure_reason
  }

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const key = `NSE|${sym.symbol}`;
    if (cp.done[key]) continue;

    const pause = Math.max(0, gapMs - (Date.now() - last));
    if (pause) await wait(pause);

    let status = 0, rows = [], raw = null, failure_reason = null;
    const sourceUrl = `https://www.nseindia.com/api/corporate-share-holding?index=EQ&symbol=${encodeURIComponent(sym.symbol)}&period=Quarterly`;

    try {
      const result = await fetchNseShareholding(sym.symbol, cookies);
      status = result.status;
      raw    = result.raw;
      if (status === 200 && raw) {
        rows = parseNseResponse(raw, sym.symbol, sym.isin);
      } else {
        failure_reason = `HTTP ${status}`;
      }
    } catch (e) {
      failure_reason = e.message;
    }
    last = Date.now();

    if (rows.length > 0) {
      const artifactHash = computeArtifactHash(raw);
      for (const row of rows) {
        fs.appendFileSync(stagingFile, JSON.stringify({
          ...row,
          source_url: sourceUrl,
          provider: 'NSE',
          artifact_hash: artifactHash,
          acquired_at: new Date().toISOString(),
        }) + '\n');
      }
      cp.stats.ok++;
      cp.stats.rows += rows.length;
    } else {
      fs.appendFileSync(failuresFile, JSON.stringify({
        symbol: sym.symbol, isin: sym.isin, provider: 'NSE',
        source_url: sourceUrl, status, failure_reason,
        acquired_at: new Date().toISOString(),
      }) + '\n');
      cp.stats.failed++;
    }

    cp.done[key] = { status, rows: rows.length, at: new Date().toISOString() };
    cp.stats.total++;
    fs.writeFileSync(checkpointFile, JSON.stringify(cp, null, 2));

    // Promote every 50 symbols when --apply is set
    if (apply && (i + 1) % 50 === 0) {
      const db = new Database(dbPath);
      const p = promoteStaged(db, stagingFile);
      db.close();
      cp.promotion = { ...p, at: new Date().toISOString() };
      fs.writeFileSync(checkpointFile, JSON.stringify(cp, null, 2));
    }

    if ((i + 1) % 25 === 0 || i === symbols.length - 1) {
      console.log(JSON.stringify({ progress: `${i+1}/${symbols.length}`, ...cp.stats, apply }));
    }
  }

  if (apply) {
    const db = new Database(dbPath);
    const p = promoteStaged(db, stagingFile);
    db.close();
    cp.promotion = { ...p, at: new Date().toISOString() };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    symbols: symbols.length,
    ...cp.stats,
    apply,
    promotion: cp.promotion || null,
    checkpoint: checkpointFile,
    staged: stagingFile,
    failures: failuresFile,
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

main().catch(e => { console.error(`SHAREHOLDING_BACKFILL_FAILED: ${e.message}`); process.exit(1); });
