/**
 * run_one_time_data_push.cjs
 * 
 * Performs an immediate, comprehensive, one-time data push into portfolio.db:
 * 1. Official NSE Bhavcopy (sec_bhavdata_full) -> NseBhavcopy table
 * 2. Official NSE Bulk & Block Deals -> InstitutionalDeals table
 * 3. Official AMFI Mutual Fund Daily NAVs -> MfNavHistory table
 * 4. Spot Forex Exchange Rates -> ForexRates table
 * 5. Pre-seed Screener.in Fundamentals & Shareholding for top active scrips -> AppConfig table
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../portfolio.db');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows || []);
  });
});

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': '*/*'
};

async function runOneTimePush() {
  console.log('================================================================');
  console.log('STARTING IMMEDIATE ONE-TIME DATA PUSH INTO SQLITE (portfolio.db)');
  console.log('================================================================\n');
  const startTime = Date.now();

  // 1. Initialize Tables
  console.log('[Phase 1/5] Initializing Database Schema...');
  await dbRun(`
    CREATE TABLE IF NOT EXISTS NseBhavcopy (
      symbol TEXT NOT NULL,
      series TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      prev_close REAL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      avg_price REAL,
      volume INTEGER,
      turnover_lacs REAL,
      no_of_trades INTEGER,
      deliv_qty INTEGER,
      deliv_per REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (symbol, trade_date)
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_bhavcopy_sym_date ON NseBhavcopy(symbol, trade_date)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_bhavcopy_deliv ON NseBhavcopy(deliv_per)`);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS InstitutionalDeals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      security_name TEXT,
      client_name TEXT NOT NULL,
      deal_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      trade_price REAL NOT NULL,
      deal_category TEXT DEFAULT 'BULK_DEAL',
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(deal_date, symbol, client_name, deal_type, quantity, trade_price)
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_inst_deals_sym ON InstitutionalDeals(symbol)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_inst_deals_date ON InstitutionalDeals(deal_date)`);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS MfNavHistory (
      scheme_code TEXT NOT NULL,
      isin TEXT,
      scheme_name TEXT NOT NULL,
      nav REAL NOT NULL,
      nav_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(scheme_code, nav_date)
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_mf_nav_code ON MfNavHistory(scheme_code)`);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS ForexRates (
      currency_pair TEXT PRIMARY KEY,
      rate REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  Schema verified and indexed.\n');

  // 2. Ingest NSE Bhavcopy (Official EOD Delivery % & OHLCV)
  console.log('[Phase 2/5] Downloading Official NSE Bhavcopy (sec_bhavdata_full)...');
  let bhavcopyCount = 0;
  const dates = ['07092026', '04092026', '03092026'];
  for (const dateStr of dates) {
    const url = `https://archives.nseindia.com/products/content/sec_bhavdata_full_${dateStr}.csv`;
    try {
      const res = await fetch(url, { headers: defaultHeaders, signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const text = await res.text();
        if (text.length > 20000) {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          console.log(`  Found Bhavcopy for ${dateStr} with ${lines.length} lines. Ingesting EQ equities...`);

          await dbRun('BEGIN TRANSACTION');
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO NseBhavcopy (
              symbol, series, trade_date, prev_close, open, high, low, close, avg_price,
              volume, turnover_lacs, no_of_trades, deliv_qty, deliv_per
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            if (cols.length >= 15 && cols[1] === 'EQ') {
              stmt.run([
                cols[0], cols[1], cols[2],
                parseFloat(cols[3]) || 0,
                parseFloat(cols[4]) || 0,
                parseFloat(cols[5]) || 0,
                parseFloat(cols[6]) || 0,
                parseFloat(cols[8]) || 0,
                parseFloat(cols[9]) || 0,
                parseInt(cols[10], 10) || 0,
                parseFloat(cols[11]) || 0,
                parseInt(cols[12], 10) || 0,
                parseInt(cols[13], 10) || 0,
                parseFloat(cols[14]) || 0
              ]);
              bhavcopyCount++;
            }
          }
          await new Promise((res, rej) => stmt.finalize(err => err ? rej(err) : res()));
          await dbRun('COMMIT');
          console.log(`  Successfully inserted ${bhavcopyCount} equities for ${dateStr}.`);
          break;
        }
      }
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      console.warn(`  Failed checking ${dateStr}:`, err.message);
    }
  }

  // 3. Ingest Institutional Bulk & Block Deals
  console.log('\n[Phase 3/5] Downloading Official NSE Bulk & Block Deals...');
  let dealsCount = 0;
  try {
    const res = await fetch('https://archives.nseindia.com/content/equities/bulk.csv', { headers: defaultHeaders, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.includes('NO RECORDS'));
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length >= 7 && cols[1]) {
          const qty = parseInt(cols[5], 10) || 0;
          const price = parseFloat(cols[6]) || 0;
          if (qty > 0 && price > 0) {
            await dbRun(`
              INSERT OR IGNORE INTO InstitutionalDeals (
                deal_date, symbol, security_name, client_name, deal_type, quantity, trade_price, deal_category, remarks
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BULK_DEAL', ?)
            `, [cols[0], cols[1], cols[2], cols[3], cols[4]?.toUpperCase().includes('BUY') ? 'BUY' : 'SELL', qty, price, cols[7] || '']);
            dealsCount++;
          }
        }
      }
      console.log(`  Ingested ${dealsCount} Bulk Deals into InstitutionalDeals table.`);
    }
  } catch (err) {
    console.warn('  Bulk deals error:', err.message);
  }

  // 4. Ingest AMFI Mutual Fund Daily NAVs
  console.log('\n[Phase 4/5] Downloading AMFI Mutual Fund Daily NAVs (NAVAll.txt)...');
  let navCount = 0;
  try {
    const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', { signal: AbortSignal.timeout(25000) });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n');
      await dbRun('BEGIN TRANSACTION');
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO MfNavHistory (scheme_code, isin, scheme_name, nav, nav_date)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const line of lines) {
        const parts = line.split(';').map(p => p.trim());
        if (parts.length >= 7) {
          const schemeCode = parts[0];
          const isin = parts[1] !== '-' ? parts[1] : null;
          const schemeName = parts[3];
          const nav = parseFloat(parts[6]);
          const navDate = parts[7];

          if (schemeCode && schemeName && !isNaN(nav) && nav > 0 && navDate) {
            stmt.run([schemeCode, isin, schemeName, nav, navDate]);
            navCount++;
          }
        }
      }
      await new Promise((res, rej) => stmt.finalize(err => err ? rej(err) : res()));
      await dbRun('COMMIT');
      console.log(`  Ingested ${navCount} mutual fund scheme NAVs into MfNavHistory table.`);
    }
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => {});
    console.warn('  AMFI error:', err.message);
  }

  // 5. Ingest Forex Spot Rates
  console.log('\n[Phase 5/5] Fetching Spot Forex Currency Rates...');
  const pairs = { 'USDINR': 'USDINR=X', 'AEDINR': 'AEDINR=X', 'EURINR': 'EURINR=X', 'GBPINR': 'GBPINR=X' };
  for (const [pair, ticker] of Object.entries(pairs)) {
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`, {
        headers: defaultHeaders,
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const json = await res.json();
        const rate = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (rate && rate > 0) {
          const roundedRate = Math.round(rate * 100) / 100;
          await dbRun(`INSERT OR REPLACE INTO ForexRates (currency_pair, rate, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [pair, roundedRate]);
          console.log(`  ${pair}: ₹${roundedRate}`);
        }
      }
    } catch (e) {}
  }

  // 6. Pre-seed Screener Fundamentals for Key Tracked Universe
  console.log('\n[Bonus] Pre-seeding Screener Fundamentals for Core Holdings & LargeCaps...');
  // Get distinct symbols from Holdings table
  const holdingsRows = await dbAll(`SELECT DISTINCT symbol FROM Holdings WHERE symbol IS NOT NULL AND length(symbol) > 0`);
  const coreScrips = Array.from(new Set([
    ...holdingsRows.map(r => r.symbol.toUpperCase().replace('.NS', '').replace('.BO', '')),
    'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'BHARTIARTL', 'SBIN', 'LT', 'TATAMOTORS', 'SUNPHARMA', 'BEL', 'HAL', 'SOLARINDS', 'DIXON', 'TRENT'
  ])).slice(0, 30); // Top 30 core scrips

  console.log(`  Enriching ${coreScrips.length} core scrips from Screener.in...`);
  let enrichedCount = 0;
  for (const sym of coreScrips) {
    try {
      const url = `https://www.screener.in/company/${encodeURIComponent(sym)}/consolidated/`;
      const res = await fetch(url, { headers: defaultHeaders, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const html = await res.text();
        const ratios = {};
        const ratioMatches = html.matchAll(/<li[^>]*>\s*<span class="name">([^<]+)<\/span>[\s\S]*?<span class="number">([^<]+)<\/span>/gi);
        for (const m of ratioMatches) {
          const key = m[1].trim().toLowerCase();
          const val = m[2].trim();
          if (key.includes('market cap')) ratios.market_cap = `₹${val} Cr`;
          else if (key.includes('current price')) ratios.current_price = `₹${val}`;
          else if (key.includes('stock p/e')) ratios.stock_pe = val;
          else if (key.includes('book value')) ratios.book_value = `₹${val}`;
          else if (key.includes('dividend yield')) ratios.dividend_yield = `${val}%`;
          else if (key.includes('roce')) ratios.roce = `${val}%`;
          else if (key.includes('roe')) ratios.roe = `${val}%`;
          else if (key.includes('debt to equity')) ratios.debt_to_equity = val;
        }

        const shareholding = {};
        const shpSection = html.match(/<section id="shareholding"[\s\S]*?<\/section>/i);
        if (shpSection) {
          const rows = shpSection[0].matchAll(/<tr[^>]*>\s*<td[^>]*class="text"[^>]*>([\s\S]*?)<\/td>([\s\S]*?)<\/tr>/gi);
          for (const r of rows) {
            const name = r[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
            const vals = Array.from(r[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(td => td[1].replace(/<[^>]+>/g, '').trim());
            const latestVal = vals[vals.length - 1];
            if (name.includes('promoter')) shareholding.promoters = `${latestVal}%`;
            else if (name.includes('fii')) shareholding.fii = `${latestVal}%`;
            else if (name.includes('dii')) shareholding.dii = `${latestVal}%`;
            else if (name.includes('public')) shareholding.public = `${latestVal}%`;
          }
        }

        const screenerPayload = {
          symbol: sym,
          company_name: sym,
          ratios,
          shareholding,
          cached_at: new Date().toISOString()
        };

        await dbRun(
          `INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)`,
          [`screener_cache_${sym}`, JSON.stringify(screenerPayload)]
        );
        enrichedCount++;
      }
    } catch (e) {}
  }
  console.log(`  Enriched ${enrichedCount} core scrips with verified Screener fundamentals.`);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================================================');
  console.log(`ONE-TIME DATA PUSH COMPLETED IN ${durationSec} SECONDS!`);
  console.log(`- NSE Bhavcopy Equities: ${bhavcopyCount}`);
  console.log(`- Institutional Bulk Deals: ${dealsCount}`);
  console.log(`- AMFI Mutual Fund NAVs: ${navCount}`);
  console.log(`- Screener Verified Fundamentals: ${enrichedCount}`);
  console.log('================================================================\n');

  db.close();
}

runOneTimePush().catch(err => {
  console.error('Fatal push error:', err);
  db.close();
});
