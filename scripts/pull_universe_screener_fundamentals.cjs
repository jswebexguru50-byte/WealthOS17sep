/**
 * scripts/pull_universe_screener_fundamentals.cjs
 * 
 * Downloads official NSE Nifty 500 & Nifty Microcap 250 constituent lists
 * and performs a complete, rate-limited batch ingestion of Screener.in fundamentals
 * into portfolio.db (AppConfig table) for the full 750+ stock universe.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../portfolio.db');
const db = new sqlite3.Database(dbPath);

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows || []);
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': '*/*'
};

const US_AND_NON_EQUITY = new Set([
  'VNQ', 'QQQ', 'VTI', 'SCHG', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  'BND', 'BNDX', 'DESCO', 'MRP', 'VT', 'VOO', 'SPY', 'IVV', 'IWM', 'EEM', 'VEA', 'VWO', 'AGG', 'TLT',
  'CASH', 'FD', 'USD', 'AED', 'EUR', 'GBP'
]);

async function fetchCsvLines(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: defaultHeaders, signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 50) return lines;
      }
    } catch (e) {}
  }
  return [];
}

function parseScreenerHTML(symbol, html) {
  // Extract Company Name
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const companyName = titleMatch ? titleMatch[1].trim() : symbol;

  // Extract Key Ratios from top list
  const ratios = {};
  const ratioMatches = html.matchAll(/<li[^>]*>\s*<span class="name">([^<]+)<\/span>[\s\S]*?<span class="number">([^<]+)<\/span>/gi);
  for (const m of ratioMatches) {
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key.includes('market cap')) ratios.market_cap = `₹${val} Cr`;
    else if (key.includes('current price')) ratios.current_price = `₹${val}`;
    else if (key.includes('high / low')) ratios.high_low = `₹${val}`;
    else if (key.includes('stock p/e')) ratios.stock_pe = val;
    else if (key.includes('book value')) ratios.book_value = `₹${val}`;
    else if (key.includes('dividend yield')) ratios.dividend_yield = `${val}%`;
    else if (key.includes('roce')) ratios.roce = `${val}%`;
    else if (key.includes('roe')) ratios.roe = `${val}%`;
    else if (key.includes('face value')) ratios.face_value = `₹${val}`;
    else if (key.includes('debt to equity')) ratios.debt_to_equity = val;
  }

  // Extract Shareholding
  const shareholding = {};
  const shpSection = html.match(/<section id="shareholding"[\s\S]*?<\/section>/i);
  if (shpSection) {
    const rows = shpSection[0].matchAll(/<tr[^>]*>\s*<td[^>]*class="text"[^>]*>([\s\S]*?)<\/td>([\s\S]*?)<\/tr>/gi);
    for (const r of rows) {
      const name = r[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
      const vals = Array.from(r[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(td => td[1].replace(/<[^>]+>/g, '').trim());
      const latestVal = vals[vals.length - 1];
      if (latestVal) {
        if (name.includes('promoter')) {
          shareholding.promoters = `${latestVal}%`;
        } else if (name.includes('fii')) {
          shareholding.fii = `${latestVal}%`;
          shareholding.fiis = `${latestVal}%`;
        } else if (name.includes('dii')) {
          shareholding.dii = `${latestVal}%`;
          shareholding.diis = `${latestVal}%`;
        } else if (name.includes('public')) {
          shareholding.public = `${latestVal}%`;
          shareholding.public_holding = `${latestVal}%`;
        } else if (name.includes('government') || name.includes('others')) {
          shareholding.government = `${latestVal}%`;
        }
      }
    }
  }

  return {
    symbol,
    company_name: companyName,
    ratios,
    shareholding,
    cached_at: new Date().toISOString()
  };
}

async function fetchCompanyFundamentals(symbol) {
  const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
  if (US_AND_NON_EQUITY.has(cleanSym)) return null;

  const url = `https://www.screener.in/company/${encodeURIComponent(cleanSym)}/consolidated/`;
  try {
    let res = await fetch(url, { headers: defaultHeaders, signal: AbortSignal.timeout(6000) });
    let html = '';
    if (res.ok) {
      html = await res.text();
    } else {
      // Fallback 1: Standalone
      const standaloneUrl = `https://www.screener.in/company/${encodeURIComponent(cleanSym)}/`;
      const res2 = await fetch(standaloneUrl, { headers: defaultHeaders, signal: AbortSignal.timeout(6000) });
      if (res2.ok) {
        html = await res2.text();
      } else {
        // Fallback 2: Search API
        const searchUrl = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(cleanSym)}`;
        const searchRes = await fetch(searchUrl, { headers: defaultHeaders, signal: AbortSignal.timeout(5000) });
        if (searchRes.ok) {
          const results = await searchRes.json();
          if (results && results.length > 0 && results[0].url) {
            const matchedRes = await fetch(`https://www.screener.in${results[0].url}`, { headers: defaultHeaders, signal: AbortSignal.timeout(6000) });
            if (matchedRes.ok) {
              html = await matchedRes.text();
            }
          }
        }
      }
    }

    if (!html || html.length < 5000) return null;
    return parseScreenerHTML(cleanSym, html);
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('================================================================');
  console.log('STARTING COMPLETE NIFTY 500 + MICROCAP 250 SCREENER INGESTION');
  console.log('================================================================\n');
  const t0 = Date.now();

  // 1. Fetch Official Nifty 500 Constituents
  console.log('[Phase 1/4] Fetching official NIFTY 500 constituents from NSE...');
  const nifty500Lines = await fetchCsvLines([
    'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
    'https://archives.nseindia.com/content/indices/ind_nifty500list.csv'
  ]);
  const nifty500Symbols = [];
  for (let i = 1; i < nifty500Lines.length; i++) {
    const parts = nifty500Lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length >= 3 && parts[2]) nifty500Symbols.push(parts[2].toUpperCase());
  }
  console.log(`  Found ${nifty500Symbols.length} Nifty 500 constituents.\n`);

  // 2. Fetch Official Nifty Microcap 250 Constituents
  console.log('[Phase 2/4] Fetching official NIFTY MICROCAP 250 constituents from NSE...');
  const micro250Lines = await fetchCsvLines([
    'https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv',
    'https://archives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv'
  ]);
  const micro250Symbols = [];
  for (let i = 1; i < micro250Lines.length; i++) {
    const parts = micro250Lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length >= 3 && parts[2]) micro250Symbols.push(parts[2].toUpperCase());
  }
  console.log(`  Found ${micro250Symbols.length} Nifty Microcap 250 constituents.\n`);

  // 3. User Indian Holdings
  console.log('[Phase 3/4] Extracting Indian portfolio holdings...');
  const holdingRows = await dbAll(`
    SELECT DISTINCT symbol FROM Holdings 
    WHERE symbol IS NOT NULL AND length(symbol) > 0 
      AND (portfolio IS NULL OR (
        UPPER(portfolio) NOT LIKE '%US%' AND
        UPPER(portfolio) NOT LIKE '%IBKR%' AND
        UPPER(portfolio) NOT LIKE '%SARWA%'
      ))
  `);
  const holdingSymbols = holdingRows
    .map(r => r.symbol.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '').trim())
    .filter(s => s && /^[A-Z0-9&]{2,15}$/.test(s) && !US_AND_NON_EQUITY.has(s));
  console.log(`  Found ${holdingSymbols.length} user portfolio Indian symbols.\n`);

  // Combine into deduplicated target universe
  const targetUniverse = Array.from(new Set([
    ...nifty500Symbols,
    ...micro250Symbols,
    ...holdingSymbols
  ])).filter(s => !US_AND_NON_EQUITY.has(s) && s.length <= 15);

  console.log(`================================================================`);
  console.log(`TOTAL TARGET UNIVERSE: ${targetUniverse.length} UNIQUE STOCKS`);
  console.log(`- Nifty 500: ${nifty500Symbols.length}`);
  console.log(`- Nifty Microcap 250: ${micro250Symbols.length}`);
  console.log(`- Unique Portfolio Holdings: ${holdingSymbols.length}`);
  console.log(`================================================================\n`);

  // 4. Check existing cached scrips in AppConfig
  console.log('[Phase 4/4] Checking local cache in SQLite (AppConfig)...');
  const existingRows = await dbAll(`SELECT key, value FROM AppConfig WHERE key LIKE 'screener_cache_%'`);
  const validCachedSet = new Set();
  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 3600 * 1000;

  for (const r of existingRows) {
    try {
      const sym = r.key.replace('screener_cache_', '');
      const parsed = JSON.parse(r.value);
      const cacheAge = nowMs - new Date(parsed.cached_at || 0).getTime();
      const hasMetrics = Boolean(
        parsed.ratios && (
          parsed.ratios.market_cap ||
          parsed.ratios.roce ||
          parsed.ratios.stock_pe ||
          parsed.ratios.current_price
        )
      );
      if (cacheAge < ONE_DAY_MS && hasMetrics) {
        validCachedSet.add(sym);
      }
    } catch (e) {}
  }

  const toFetch = targetUniverse.filter(sym => !validCachedSet.has(sym));
  console.log(`  Already Fresh in Cache: ${validCachedSet.size} stocks.`);
  console.log(`  Remaining to Fetch:     ${toFetch.length} stocks.\n`);

  if (toFetch.length === 0) {
    console.log('✅ All 750+ universe constituents are already fresh in cache!');
    db.close();
    return;
  }

  console.log(`Launching worker pool (Concurrency: 4 workers, 150ms backoff)...`);
  let completed = 0;
  let successCount = 0;
  let failCount = 0;
  const CONCURRENCY = 4;
  let idx = 0;

  async function worker(workerId) {
    while (idx < toFetch.length) {
      const currentIdx = idx++;
      const sym = toFetch[currentIdx];
      try {
        const payload = await fetchCompanyFundamentals(sym);
        if (payload && payload.ratios && Object.keys(payload.ratios).length > 0) {
          await dbRun(
            `INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)`,
            [`screener_cache_${sym}`, JSON.stringify(payload)]
          );
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
      completed++;
      if (completed % 25 === 0 || completed === toFetch.length) {
        const progressPct = ((completed / toFetch.length) * 100).toFixed(1);
        const elapsedSec = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`  [${completed}/${toFetch.length}] (${progressPct}%) — Success: ${successCount} | Failed/Unlisted: ${failCount} | Elapsed: ${elapsedSec}s`);
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const totalDurationSec = ((Date.now() - t0) / 1000).toFixed(1);
  const finalCachedRows = await dbAll(`SELECT count(*) as count FROM AppConfig WHERE key LIKE 'screener_cache_%'`);

  console.log('\n================================================================');
  console.log(`BATCH INGESTION COMPLETED IN ${totalDurationSec} SECONDS!`);
  console.log(`- Newly Enriched:      ${successCount}`);
  console.log(`- Not Found on Screener: ${failCount}`);
  console.log(`- Total Cached in DB:  ${finalCachedRows[0].count} stocks`);
  console.log('================================================================\n');

  db.close();
}

main().catch(err => {
  console.error('Fatal batch ingestion error:', err);
  db.close();
});
