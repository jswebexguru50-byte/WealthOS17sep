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

// Exchange routing is deterministic: numeric scrip codes are BSE listings;
// alphabetic symbols are NSE listings unless the master explicitly says BSE.
// Never send a BSE code to the NSE endpoint (it produces a misleading 404).
function listingRoute(sym) {
  const exchange = String(sym.exchange || '').toUpperCase();
  if (exchange === 'BSE' || /^\d+$/.test(String(sym.symbol || ''))) return 'BSE';
  return 'NSE';
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

function loadCachedUpstoxShareholding(symbol, isin) {
  const sourceDb = new Database(dbPath, { readonly: true });
  try {
    const snap = sourceDb.prepare(`
      SELECT source_url, fetched_at, response_json
      FROM fundamental_endpoint_snapshots
      WHERE symbol=? AND endpoint='share-holdings' AND UPPER(status)='SUCCESS'
      ORDER BY fetched_at DESC LIMIT 1
    `).get(symbol);
    if (!snap?.response_json) return null;
    const payload = JSON.parse(snap.response_json);
    const data = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(data)) return null;
    const byPeriod = new Map();
    for (const category of data) {
      const key = String(category.category || '').toLowerCase();
      for (const point of category.history || []) {
        const period = parseFilingPeriod(String(point.period || ''));
        if (!period) continue;
        const row = byPeriod.get(period) || { symbol, isin, filing_period: period };
        const value = Number(point.value);
        if (!Number.isFinite(value)) continue;
        if (key === 'promoters' || key === 'promoter') row.promoter_pct = value;
        else if (key === 'fii') row.fii_pct = value;
        else if (key === 'other_dii' || key === 'dii' || key === 'mutual_funds') row.dii_pct = (row.dii_pct || 0) + value;
        else if (key === 'retail_and_other' || key === 'public') row.public_pct = value;
        byPeriod.set(period, row);
      }
    }
    const hash = computeArtifactHash(snap.response_json);
    return [...byPeriod.values()].map(row => ({
      ...row,
      source_url: snap.source_url || 'UPSTOX_FUNDAMENTALS',
      provider: 'UPSTOX',
      artifact_hash: hash,
      acquired_at: snap.fetched_at,
    }));
  } catch {
    return null;
  } finally {
    sourceDb.close();
  }
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

function promoteRows(db, rows) {
  const ins = db.prepare(`
    INSERT OR IGNORE INTO ShareholdingPatterns
      (symbol, isin, filing_period, promoter_pct, fii_pct, dii_pct, public_pct,
       total_shares, source_url, provider, artifact_hash, acquired_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OK')
  `);
  let inserted = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const x of rows) {
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

function ensureShareholdingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ShareholdingPatterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      isin TEXT,
      filing_period TEXT NOT NULL,
      promoter_pct REAL,
      fii_pct REAL,
      dii_pct REAL,
      public_pct REAL,
      total_shares INTEGER,
      source_url TEXT,
      provider TEXT NOT NULL,
      artifact_hash TEXT,
      acquired_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OK',
      failure_reason TEXT,
      UNIQUE(symbol, filing_period, provider)
    );
    CREATE INDEX IF NOT EXISTS idx_shareholding_symbol ON ShareholdingPatterns(symbol);
    CREATE INDEX IF NOT EXISTS idx_shareholding_period ON ShareholdingPatterns(filing_period);
  `);
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
  const applyDb = apply ? new Database(dbPath) : null;
  if (applyDb) ensureShareholdingSchema(applyDb);
  let immediatePromotion = { inserted: 0, skipped: 0 };

  // Fetch NSE session cookies only when this slice actually contains NSE
  // listings. A BSE-only slice must not spend time or rate-limit budget on an
  // unrelated NSE bootstrap request.
  if (symbols.some(sym => listingRoute(sym) === 'NSE')) {
    try {
      cookies = await fetchNseCookies();
      console.log(JSON.stringify({ event: 'NSE_COOKIES_OK', cookieLen: cookies.length }));
    } catch (e) {
      console.log(JSON.stringify({ event: 'NSE_COOKIES_FAILED', error: e.message }));
      // Will proceed; individual fetches will record failure_reason
    }
  }

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const route = listingRoute(sym);
    const key = `${route}|${sym.symbol}`;
    if (cp.done[key]) continue;

    const pause = Math.max(0, gapMs - (Date.now() - last));
    if (pause) await wait(pause);

    let status = 0, rows = [], raw = null, failure_reason = null;
    const sourceUrl = route === 'BSE'
      ? `https://api.bseindia.com/BseIndiaAPI/api/SHPQNewFormat/w?scripcode=${encodeURIComponent(sym.symbol)}`
      : `https://www.nseindia.com/api/corporate-share-holding?index=EQ&symbol=${encodeURIComponent(sym.symbol)}&period=Quarterly`;

    try {
      if (route === 'BSE') {
        // BSE requires its browser-captured multi-request payload. Do not
        // substitute an NSE request or fabricate a value when it is absent.
        status = 0;
        failure_reason = 'BSE_BROWSER_CAPTURE_REQUIRED';
      } else {
        const result = await fetchNseShareholding(sym.symbol, cookies);
        status = result.status;
        raw    = result.raw;
        if (status === 200 && raw) {
          rows = parseNseResponse(raw, sym.symbol, sym.isin);
        } else {
          failure_reason = `HTTP ${status}`;
        }
      }
    } catch (e) {
      failure_reason = e.message;
    }
    if (rows.length === 0) {
      const cachedRows = loadCachedUpstoxShareholding(sym.symbol, sym.isin);
      if (cachedRows?.length) {
        rows = cachedRows;
        failure_reason = null;
      }
    }
    last = Date.now();

    if (rows.length > 0) {
      const artifactHash = raw ? computeArtifactHash(raw) : rows[0].artifact_hash;
      const acquiredAt = new Date().toISOString();
      const enrichedRows = [];
      for (const row of rows) {
        const enriched = {
          ...row,
          source_url: row.source_url || sourceUrl,
          provider: row.provider || 'NSE',
          artifact_hash: artifactHash,
          acquired_at: acquiredAt,
        };
        enrichedRows.push(enriched);
        fs.appendFileSync(stagingFile, JSON.stringify(enriched) + '\n');
      }
      if (applyDb) {
        const p = promoteRows(applyDb, enrichedRows);
        immediatePromotion.inserted += p.inserted;
        immediatePromotion.skipped += p.skipped;
        cp.promotion = { ...immediatePromotion, mode: 'IMMEDIATE', at: acquiredAt };
      }
      cp.stats.ok++;
      cp.stats.rows += rows.length;
    } else {
      fs.appendFileSync(failuresFile, JSON.stringify({
        symbol: sym.symbol, isin: sym.isin, provider: route,
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
      const p = applyDb ? promoteStaged(applyDb, stagingFile) : null;
      if (p) cp.promotion = {
        immediate: immediatePromotion,
        reconciliation: p,
        mode: 'CHECKPOINT_RECONCILIATION', at: new Date().toISOString()
      };
      fs.writeFileSync(checkpointFile, JSON.stringify(cp, null, 2));
    }

    if ((i + 1) % 25 === 0 || i === symbols.length - 1) {
      console.log(JSON.stringify({ progress: `${i+1}/${symbols.length}`, ...cp.stats, apply }));
    }
  }

  if (apply) {
    const p = applyDb ? promoteStaged(applyDb, stagingFile) : null;
    if (p) cp.promotion = {
      immediate: immediatePromotion,
      reconciliation: p,
      // `immediate` is the authoritative acquisition-time outcome. The final
      // pass is intentionally idempotent and normally reports only skips.
      mode: 'FINAL_RECONCILIATION', at: new Date().toISOString()
    };
  }

  applyDb?.close();

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
