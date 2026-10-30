#!/usr/bin/env node
'use strict';
/**
 * Batch screener.in borrowings acquisition.
 * Fetches balance-sheet borrowings for symbols missing it in company_facts.
 * No MCP. Idempotent. Resumable via checkpoint.
 *
 * Usage:
 *   node scripts/fundamental/batch_screener_borrowings.cjs [--apply] [--gap-ms 1200] [--limit 100]
 *
 * Without --apply, runs in dry-run mode (counts gaps, no DB writes).
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const apply = process.argv.includes('--apply');
const gapMs = Math.max(800, Number(process.argv[process.argv.indexOf('--gap-ms') + 1] || 1200));
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 0;
const outDir = path.join(root, 'reports', 'fundamental');
fs.mkdirSync(outDir, { recursive: true });
const checkpointFile = path.join(outDir, 'batch_screener_borrowings_checkpoint.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Parse borrowings from screener.in HTML. Returns { borrowings_cr, latestPeriod } or null. */
function parseScreenerBorrowings(html) {
  if (!html || html.length < 500) return null;

  // Find balance sheet section
  const bsMatch = html.match(/balance-sheet[\s\S]{0,200}?(<table[\s\S]*?<\/table>)/i)
    || html.match(/id="balance-sheet"[\s\S]{0,500}?(<table[\s\S]*?<\/table>)/i)
    || html.match(/Balance Sheet[\s\S]{0,200}?(<table[\s\S]*?<\/table>)/i);

  if (!bsMatch) return null;
  const tableHtml = bsMatch[1];

  // Extract period labels from headers
  const thMatches = tableHtml.match(/<th[^>]*>(.*?)<\/th>/gi) || [];
  const periods = [];
  for (const th of thMatches) {
    const txt = th.replace(/<[^>]+>/g, '').trim();
    if (/\b(Mar|Jun|Sep|Dec)\s+20\d{2}\b/i.test(txt) || /\b20\d{2}\b/.test(txt)) {
      periods.push(txt);
    }
  }

  // Extract rows, find borrowings
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  let borrowingsCr = null;
  let latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;

  for (const row of rowMatches) {
    const plain = row.replace(/<[^>]+>/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!plain.startsWith('borrowings')) continue;

    // Extract td values
    const tdMatches = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
    const vals = tdMatches.map(td => {
      const t = td.replace(/<[^>]+>/g, '').trim().replace(/,/g, '');
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    }).filter(v => v !== null);

    if (vals.length > 0) {
      // Latest period is the last column
      borrowingsCr = vals[vals.length - 1];
      break;
    }
  }

  if (borrowingsCr === null) return null;
  return { borrowings_cr: borrowingsCr, latestPeriod };
}

async function fetchScreener(symbol) {
  // Try consolidated first, then standalone
  for (const suffix of ['/consolidated/', '/']) {
    const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}${suffix}`;
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = parseScreenerBorrowings(html);
      if (parsed) return { ...parsed, url, html_len: html.length };
    } catch (e) {
      // network error, try next suffix
    }
  }
  return null;
}

async function main() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Load checkpoint
  let cp = fs.existsSync(checkpointFile) ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8')) : { done: {}, stats: { attempted: 0, promoted: 0, failed: 0, already_covered: 0 } };

  // Get gap symbols: active, no non-MCP borrowings fact
  const gapRows = db.prepare(`
    SELECT UPPER(mt.symbol) as symbol, mt.isin, mt.id as company_id
    FROM MasterTickers mt
    WHERE COALESCE(mt.status,'ACTIVE')='ACTIVE'
    AND NOT EXISTS (
      SELECT 1 FROM company_facts cf
      WHERE UPPER(cf.symbol)=UPPER(mt.symbol)
      AND cf.metric='borrowings'
      AND cf.provider != 'TRENDLYNE_MCP'
    )
    ORDER BY mt.symbol
  `).all();

  let symbols = gapRows;
  if (limit > 0) symbols = symbols.slice(0, limit);

  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', gap_symbols: gapRows.length, to_process: symbols.length, gap_ms: gapMs }));

  if (!apply) {
    console.log('DRY_RUN: pass --apply to write to DB. Exiting.');
    db.close();
    return;
  }

  const insSnap = db.prepare(`
    INSERT OR IGNORE INTO fundamental_endpoint_snapshots
    (symbol, provider, endpoint, authority, source_url, status, response_json, fetched_at, error)
    VALUES (?, 'SCREENER_PUBLIC', ?, 'SCREENER_PUBLIC', ?, ?, ?, ?, ?)
  `);
  const insFact = db.prepare(`
    INSERT OR IGNORE INTO company_facts
    (factId, companyId, symbol, isin, metric, value, unit, currency,
     periodType, periodEnd, asOfDate, factType, sourceType, scope,
     provider, verificationStatus, fetchedAt, availableAt, availabilityStatus,
     sourceDocumentId, providerToken, exactProviderLabel, sourceUrl, evidenceText, calculationMethod)
    VALUES
    (?, ?, ?, ?, 'borrowings', ?, 'Cr', 'INR',
     'ANNUAL', ?, ?, 'REPORTED_EXCHANGE_SNAPSHOT', 'STRUCTURED_SECONDARY', 'CONSOLIDATED',
     'SCREENER_PUBLIC', 'VERIFIED_PARTIAL', ?, ?, 'AVAILABLE',
     ?, 'SCREENER_PUBLIC', 'Borrowings', ?, ?, 'PUBLIC_EXCHANGE_SNAPSHOT_V1')
  `);

  let last = 0;
  for (let i = 0; i < symbols.length; i++) {
    const { symbol, isin, company_id: companyId } = symbols[i];
    if (cp.done[symbol]) { cp.stats.already_covered++; continue; }

    const pause = Math.max(0, gapMs - (Date.now() - last));
    if (pause) await wait(pause);

    const now = new Date().toISOString();
    const result = await fetchScreener(symbol);
    last = Date.now();

    cp.stats.attempted++;

    if (result) {
      const { borrowings_cr, latestPeriod, url } = result;
      const periodToken = (latestPeriod || 'LATEST').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const factId = `${companyId}_borrowings_ANNUAL_${periodToken}_CONSOLIDATED_EXCHANGE_SNAPSHOT`;
      const endpoint = url;

      const txn = db.transaction(() => {
        insSnap.run(symbol, endpoint, endpoint, 'SUCCESS', JSON.stringify({ borrowings_cr, latestPeriod }), now, null);
        insFact.run(
          factId, companyId, symbol, isin || null,
          String(borrowings_cr), latestPeriod || 'LATEST',
          now.slice(0, 10), now, now,
          `SCREENER_PUBLIC:${endpoint}:${symbol}:${now}`,
          endpoint, JSON.stringify({ borrowings_cr, latestPeriod, url: endpoint })
        );
      });
      txn();
      cp.stats.promoted++;
      cp.done[symbol] = { status: 'SUCCESS', borrowings_cr, latestPeriod, at: now };
    } else {
      const failUrl = `https://www.screener.in/company/${symbol}/consolidated/`;
      insSnap.run(symbol, failUrl, failUrl, 'FAILURE', null, now, 'BORROWINGS_NOT_FOUND_IN_BALANCE_SHEET');
      cp.stats.failed++;
      cp.done[symbol] = { status: 'FAILURE', at: now };
    }

    fs.writeFileSync(checkpointFile, JSON.stringify(cp, null, 2));

    if ((i + 1) % 10 === 0 || i === symbols.length - 1) {
      console.log(JSON.stringify({ progress: `${i + 1}/${symbols.length}`, ...cp.stats }));
    }
  }

  db.close();
  const report = {
    generatedAt: new Date().toISOString(),
    total_gap_symbols: gapRows.length,
    processed: symbols.length,
    ...cp.stats,
    mcpUsed: false,
    checkpoint: checkpointFile,
  };
  const reportFile = path.join(outDir, 'batch_screener_borrowings_report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log('FINAL:', JSON.stringify(report));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
