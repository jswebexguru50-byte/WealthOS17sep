#!/usr/bin/env node
'use strict';
/**
 * Authenticated/public screener.in bulk borrowings acquisition.
 *
 * Fetches balance-sheet Borrowings for all ~3,400 symbols missing the field
 * in company_facts. Works without credentials — screener.in HTML pages are
 * publicly readable and the balance-sheet section is embedded in the HTML.
 *
 * Usage:
 *   node scripts/fundamental/batch_screener_borrowings_auth.cjs [--apply] [--gap-ms 1200] [--limit 100] [--symbol SYM]
 *
 * Without --apply runs dry-run (counts gaps, no DB writes).
 * Checkpoint at reports/fundamental/screener_borrowings_auth_checkpoint.json.
 * mcpUsed: false always.
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const apply = process.argv.includes('--apply');
const gapMs = Math.max(800, Number(
  process.argv.includes('--gap-ms') ? process.argv[process.argv.indexOf('--gap-ms') + 1] : 1200
));
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 0;
const onlySymbol = process.argv.includes('--symbol') ? process.argv[process.argv.indexOf('--symbol') + 1] : null;
const outDir = path.join(root, 'reports', 'fundamental');
fs.mkdirSync(outDir, { recursive: true });
const checkpointFile = path.join(outDir, 'screener_borrowings_auth_checkpoint.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
};

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Parse balance-sheet Borrowings from screener.in HTML.
 * The balance-sheet section has id="balance-sheet" and contains a table
 * with TH headers (period dates) and TR rows (line items).
 * Returns { borrowings_cr, latestPeriod } or null.
 */
function parseScreenerBorrowings(html) {
  if (!html || html.length < 1000) return null;

  // Find the balance-sheet section
  const bsStart = html.indexOf('id="balance-sheet"');
  if (bsStart < 0) return null;
  const bsEnd = html.indexOf('</section>', bsStart);
  const bsHtml = bsEnd > 0 ? html.slice(bsStart, bsEnd) : html.slice(bsStart, bsStart + 20000);

  // Extract period headers from TH elements
  const thMatches = [...bsHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
  const periods = [];
  for (const m of thMatches) {
    const txt = m[1].replace(/<[^>]+>/g, '').trim();
    // Match "Mar 2026", "Jun 2025" etc.
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}$/.test(txt)) {
      periods.push(txt);
    }
  }

  // Extract all TR rows
  const trMatches = [...bsHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const trm of trMatches) {
    const rowHtml = trm[1];
    const plain = rowHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    // Match "Borrowing" and "Borrowings" (screener uses both spellings)
    if (!/^Borrowings?\b/i.test(plain)) continue;

    // Extract TD numeric values
    const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    const vals = tdMatches.map(td => {
      const t = td[1].replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    }).filter(v => v !== null);

    if (vals.length === 0) return null;

    // Latest period = last column
    const borrowingsCr = vals[vals.length - 1];
    const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : 'LATEST';

    return { borrowings_cr: borrowingsCr, latestPeriod, colCount: vals.length };
  }

  return null;
}

/** Convert "Mar 2026" → "2026-03-31" (period-end date) */
function periodToDate(period) {
  if (!period || period === 'LATEST') return null;
  const m = period.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/);
  if (!m) return null;
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                   Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const endDays = { '01': '31', '02': '28', '03': '31', '04': '30', '05': '31',
                    '06': '30', '07': '31', '08': '31', '09': '30', '10': '31', '11': '30', '12': '31' };
  const mo = months[m[1]];
  return `${m[2]}-${mo}-${endDays[mo]}`;
}

async function fetchScreenerPage(symbol) {
  // Try consolidated first, then standalone
  for (const suffix of ['/consolidated/', '/']) {
    const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}${suffix}`;
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        return { url, status: res.status, html: null, error: `HTTP_${res.status}` };
      }
      const html = await res.text();
      return { url, status: res.status, html, suffix };
    } catch (e) {
      // timeout or network error — try next suffix
    }
  }
  return { url: `https://www.screener.in/company/${symbol}/`, status: 0, html: null, error: 'FETCH_FAILED' };
}

async function main() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Gap symbols: active, no non-MCP borrowings in company_facts
  let gapRows = db.prepare(`
    SELECT UPPER(mt.symbol) as symbol, mt.isin, mt.id as company_id
    FROM MasterTickers mt
    WHERE COALESCE(mt.status,'ACTIVE')='ACTIVE'
    AND NOT EXISTS (
      SELECT 1 FROM company_facts cf
      WHERE UPPER(cf.symbol)=UPPER(mt.symbol)
      AND cf.metric='borrowings'
      AND (cf.provider IS NULL OR cf.provider NOT LIKE '%MCP%')
    )
    ORDER BY mt.symbol
  `).all();

  if (onlySymbol) gapRows = gapRows.filter(r => r.symbol === onlySymbol.toUpperCase());
  let symbols = limit > 0 ? gapRows.slice(0, limit) : gapRows;

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    gap_symbols: gapRows.length,
    to_process: symbols.length,
    gap_ms: gapMs,
    mcpUsed: false,
  }));

  if (!apply) {
    console.log('DRY_RUN: pass --apply to write to DB.');
    db.close(); return;
  }

  // Load checkpoint
  let cp = fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
    : { done: {}, stats: { attempted: 0, promoted: 0, failed: 0, skipped: 0, http_error: 0 } };

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

    if (cp.done[symbol]) { cp.stats.skipped++; continue; }

    const pause = Math.max(0, gapMs - (Date.now() - last));
    if (pause) await wait(pause);

    const now = new Date().toISOString();
    const { url, status, html, error } = await fetchScreenerPage(symbol);
    last = Date.now();
    cp.stats.attempted++;

    if (!html) {
      insSnap.run(symbol, url, url, 'FAILURE', null, now, error || `HTTP_${status}`);
      cp.stats.http_error++;
      cp.done[symbol] = { status: 'HTTP_ERROR', code: status, at: now };
      fs.writeFileSync(checkpointFile, JSON.stringify(cp));
      continue;
    }

    const parsed = parseScreenerBorrowings(html);
    if (!parsed) {
      insSnap.run(symbol, url, url, 'FAILURE', null, now, 'BORROWINGS_NOT_FOUND_IN_BS');
      cp.stats.failed++;
      cp.done[symbol] = { status: 'PARSE_FAIL', at: now };
      fs.writeFileSync(checkpointFile, JSON.stringify(cp));
      continue;
    }

    const { borrowings_cr, latestPeriod } = parsed;
    const periodEnd = periodToDate(latestPeriod) || now.slice(0, 10);
    const periodToken = latestPeriod.replace(/[^A-Za-z0-9]/g, '_');
    const factId = `${companyId}_borrowings_ANNUAL_${periodToken}_CONSOLIDATED_SCREENER`;

    const txn = db.transaction(() => {
      insSnap.run(symbol, url, url, 'SUCCESS',
        JSON.stringify({ borrowings_cr, latestPeriod, col_count: parsed.colCount }),
        now, null);
      insFact.run(
        factId, companyId, symbol, isin || null,
        String(borrowings_cr), periodEnd, now.slice(0, 10), now, now,
        `SCREENER_PUBLIC:${url}:${symbol}:${now}`,
        url,
        JSON.stringify({ borrowings_cr, latestPeriod, source_url: url })
      );
    });
    txn();

    cp.stats.promoted++;
    cp.done[symbol] = { status: 'SUCCESS', borrowings_cr, latestPeriod, at: now };
    fs.writeFileSync(checkpointFile, JSON.stringify(cp));

    if ((i + 1) % 25 === 0 || i === symbols.length - 1) {
      console.log(JSON.stringify({ progress: `${i + 1}/${symbols.length}`, ...cp.stats, mcpUsed: false }));
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
  const reportFile = path.join(outDir, 'screener_borrowings_auth_report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log('FINAL:', JSON.stringify(report));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
