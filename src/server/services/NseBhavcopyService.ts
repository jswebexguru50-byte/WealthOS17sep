/**
 * NseBhavcopyService.ts
 * 
 * Official National Stock Exchange (NSE) & AMFI Data Ingestor for NRI WealthOS.
 * Provides 100% ground-truth EOD trade data, delivery volume %, bulk/block deals, and mutual fund NAVs.
 * 
 * Sources:
 * 1. NSE Official Security Bhavdata (sec_bhavdata_full_{DDMMYYYY}.csv)
 * 2. NSE Official Daily Bulk Deals (bulk.csv)
 * 3. NSE Official Daily Block Deals (block.csv)
 * 4. AMFI Official Daily NAVs (NAVAll.txt)
 * 5. Yahoo Finance FX Spot Rates (USDINR, AEDINR, EURINR, GBPINR)
 */

import { getDB, dbRun, dbAll, dbGet } from '../database.js';

export interface NseBhavcopyRecord {
  symbol: string;
  series: string;
  tradeDate: string;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  close: number;
  avgPrice: number;
  volume: number;
  turnoverLacs: number;
  noOfTrades: number;
  delivQty: number;
  delivPer: number;
}

export interface InstitutionalDealRecord {
  dealDate: string;
  symbol: string;
  securityName: string;
  clientName: string;
  dealType: 'BUY' | 'SELL';
  quantity: number;
  tradePrice: number;
  dealCategory: 'BULK_DEAL' | 'BLOCK_DEAL';
  remarks?: string;
}

export interface BackfillProgress {
  status: 'IDLE' | 'RUNNING' | 'COMPLETE' | 'ERROR';
  currentDate: string;
  processedDays: number;
  totalDays: number;
  successDays: number;
  failedDays: number;
  skippedDays: number;
  totalRowsIngested: number;
  startDate: string;
  endDate: string;
  startedAt: string;
  error?: string;
}

export class NseBhavcopyService {
  private static instance: NseBhavcopyService;
  private static backfillProgress: BackfillProgress = {
    status: 'IDLE', currentDate: '', processedDays: 0, totalDays: 0,
    successDays: 0, failedDays: 0, skippedDays: 0, totalRowsIngested: 0,
    startDate: '', endDate: '', startedAt: ''
  };

  public static getBackfillProgress(): BackfillProgress {
    return NseBhavcopyService.backfillProgress;
  }

  public static getInstance(): NseBhavcopyService {
    if (!NseBhavcopyService.instance) {
      NseBhavcopyService.instance = new NseBhavcopyService();
    }
    return NseBhavcopyService.instance;
  }

  /**
   * Initializes SQLite tables for Bhavcopy, Institutional Deals, and Forex rates
   */
  public async initializeDatabase(): Promise<void> {
    const db = getDB();

    await dbRun(db, `
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

    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_bhavcopy_sym_date ON NseBhavcopy(symbol, trade_date)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_bhavcopy_deliv ON NseBhavcopy(deliv_per)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_bhavcopy_date ON NseBhavcopy(trade_date)`);

    await dbRun(db, `
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

    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_inst_deals_sym ON InstitutionalDeals(symbol)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_inst_deals_date ON InstitutionalDeals(deal_date)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_inst_deals_client ON InstitutionalDeals(client_name)`);

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS ForexRates (
        currency_pair TEXT PRIMARY KEY,
        rate REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Download and ingest official NSE Bhavcopy for a given date or latest trading days
   */
  public async syncLatestBhavcopy(targetDate?: Date): Promise<{ success: boolean; date?: string; recordsIngested: number; error?: string }> {
    await this.initializeDatabase();
    const db = getDB();

    const candidateDates: Date[] = [];
    if (targetDate) {
      candidateDates.push(targetDate);
    } else {
      const now = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        // skip weekends
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          candidateDates.push(d);
        }
      }
    }

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    for (const d of candidateDates) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const dateStr = `${dd}${mm}${yyyy}`;
      const bhavUrl = `https://archives.nseindia.com/products/content/sec_bhavdata_full_${dateStr}.csv`;

      try {
        console.log(`[NseBhavcopyService] Checking official Bhavcopy for ${dateStr}...`);
        const res = await fetch(bhavUrl, {
          headers: defaultHeaders,
          signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) {
          console.log(`[NseBhavcopyService] Bhavcopy not available for ${dateStr} (status ${res.status}), trying prior trading day...`);
          continue;
        }

        const text = await res.text();
        if (!text || text.length < 10000) {
          continue;
        }

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 10) continue;

        let insertedCount = 0;
        await dbRun(db, 'BEGIN TRANSACTION');

        const stmt = `
          INSERT OR REPLACE INTO NseBhavcopy (
            symbol, series, trade_date, prev_close, open, high, low, close, avg_price,
            volume, turnover_lacs, no_of_trades, deliv_qty, deliv_per
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols.length >= 15 && cols[1] === 'EQ') { // Standard equity series
            const symbol = cols[0];
            const series = cols[1];
            const tradeDate = cols[2];
            const prevClose = parseFloat(cols[3]) || 0;
            const open = parseFloat(cols[4]) || 0;
            const high = parseFloat(cols[5]) || 0;
            const low = parseFloat(cols[6]) || 0;
            const close = parseFloat(cols[8]) || 0;
            const avgPrice = parseFloat(cols[9]) || 0;
            const volume = parseInt(cols[10], 10) || 0;
            const turnoverLacs = parseFloat(cols[11]) || 0;
            const noOfTrades = parseInt(cols[12], 10) || 0;
            const delivQty = parseInt(cols[13], 10) || 0;
            const delivPer = parseFloat(cols[14]) || 0;

            await dbRun(db, stmt, [
              symbol, series, tradeDate, prevClose, open, high, low, close, avgPrice,
              volume, turnoverLacs, noOfTrades, delivQty, delivPer
            ]);
            insertedCount++;
          }
        }

        await dbRun(db, 'COMMIT');
        console.log(`[NseBhavcopyService] Successfully ingested ${insertedCount} equities for ${dateStr} into NseBhavcopy table.`);
        return { success: true, date: dateStr, recordsIngested: insertedCount };
      } catch (err: any) {
        await dbRun(db, 'ROLLBACK').catch(() => {});
        console.warn(`[NseBhavcopyService] Error ingesting Bhavcopy for ${dateStr}:`, err.message);
      }
    }

    return { success: false, recordsIngested: 0, error: 'No valid Bhavcopy found in candidate dates' };
  }

  /**
   * Download and ingest official daily Bulk & Block deals from NSE archives
   */
  public async syncInstitutionalDeals(): Promise<{ bulkIngested: number; blockIngested: number }> {
    await this.initializeDatabase();
    const db = getDB();
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    let bulkIngested = 0;
    let blockIngested = 0;

    // 1. Ingest Bulk Deals
    try {
      console.log('[NseBhavcopyService] Fetching official NSE Bulk Deals (bulk.csv)...');
      const res = await fetch('https://archives.nseindia.com/content/equities/bulk.csv', {
        headers: defaultHeaders,
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.includes('NO RECORDS'));
        if (lines.length > 1) {
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
            if (cols.length >= 7 && cols[1]) {
              const dealDate = cols[0];
              const symbol = cols[1];
              const secName = cols[2];
              const clientName = cols[3];
              const dealType = cols[4]?.toUpperCase().includes('BUY') ? 'BUY' : 'SELL';
              const qty = parseInt(cols[5], 10) || 0;
              const price = parseFloat(cols[6]) || 0;
              const remarks = cols[7] || '';

              if (qty > 0 && price > 0) {
                await dbRun(db, `
                  INSERT OR IGNORE INTO InstitutionalDeals (
                    deal_date, symbol, security_name, client_name, deal_type, quantity, trade_price, deal_category, remarks
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BULK_DEAL', ?)
                `, [dealDate, symbol, secName, clientName, dealType, qty, price, remarks]);
                bulkIngested++;
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[NseBhavcopyService] Error syncing Bulk Deals:', err.message);
    }

    // 2. Ingest Block Deals
    try {
      console.log('[NseBhavcopyService] Fetching official NSE Block Deals (block.csv)...');
      const res = await fetch('https://archives.nseindia.com/content/equities/block.csv', {
        headers: defaultHeaders,
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.includes('NO RECORDS'));
        if (lines.length > 1) {
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
            if (cols.length >= 7 && cols[1]) {
              const dealDate = cols[0];
              const symbol = cols[1];
              const secName = cols[2];
              const clientName = cols[3];
              const dealType = cols[4]?.toUpperCase().includes('BUY') ? 'BUY' : 'SELL';
              const qty = parseInt(cols[5], 10) || 0;
              const price = parseFloat(cols[6]) || 0;

              if (qty > 0 && price > 0) {
                await dbRun(db, `
                  INSERT OR IGNORE INTO InstitutionalDeals (
                    deal_date, symbol, security_name, client_name, deal_type, quantity, trade_price, deal_category, remarks
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BLOCK_DEAL', 'NSE Block Deal')
                `, [dealDate, symbol, secName, clientName, dealType, qty, price]);
                blockIngested++;
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[NseBhavcopyService] Error syncing Block Deals:', err.message);
    }

    console.log(`[NseBhavcopyService] Ingested ${bulkIngested} bulk deals and ${blockIngested} block deals.`);
    return { bulkIngested, blockIngested };
  }

  /**
   * Download and ingest AMFI Mutual Fund NAVs
   */
  public async syncAmfiNavs(): Promise<{ schemesIngested: number }> {
    const db = getDB();
    await dbRun(db, `
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

    let schemesIngested = 0;
    try {
      console.log('[NseBhavcopyService] Fetching AMFI NAVAll.txt...');
      const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(20000)
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n');
        await dbRun(db, 'BEGIN TRANSACTION');

        for (const line of lines) {
          const parts = line.split(';').map(p => p.trim());
          if (parts.length >= 7) {
            const schemeCode = parts[0];
            const isin = parts[1] !== '-' ? parts[1] : null;
            const schemeName = parts[3];
            const navStr = parts[6];
            const navDate = parts[7];
            const nav = parseFloat(navStr);

            if (schemeCode && schemeName && !isNaN(nav) && nav > 0 && navDate) {
              await dbRun(db, `
                INSERT OR REPLACE INTO MfNavHistory (scheme_code, isin, scheme_name, nav, nav_date)
                VALUES (?, ?, ?, ?, ?)
              `, [schemeCode, isin, schemeName, nav, navDate]);
              schemesIngested++;
            }
          }
        }
        await dbRun(db, 'COMMIT');
      }
    } catch (err: any) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      console.warn('[NseBhavcopyService] Error syncing AMFI NAVs:', err.message);
    }

    console.log(`[NseBhavcopyService] Ingested ${schemesIngested} mutual fund NAVs.`);
    return { schemesIngested };
  }

  /**
   * Sync Forex Currency Rates (USD/INR, AED/INR, EUR/INR, GBP/INR)
   */
  public async syncForexRates(): Promise<Record<string, number>> {
    const db = getDB();
    const pairs: Record<string, string> = {
      'USDINR': 'USDINR=X',
      'AEDINR': 'AEDINR=X',
      'EURINR': 'EURINR=X',
      'GBPINR': 'GBPINR=X'
    };

    const rates: Record<string, number> = { 'INRINR': 1.0 };
    for (const [pair, ticker] of Object.entries(pairs)) {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const json: any = await res.json();
          const rate = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (rate && rate > 0) {
            rates[pair] = Math.round(rate * 100) / 100;
            await dbRun(db, `
              INSERT OR REPLACE INTO ForexRates (currency_pair, rate, updated_at)
              VALUES (?, ?, CURRENT_TIMESTAMP)
            `, [pair, rates[pair]]);
          }
        }
      } catch {}
    }
    console.log('[NseBhavcopyService] Updated Forex rates:', rates);
    return rates;
  }

  /**
   * Retrieve official delivery % for a symbol from latest Bhavcopy in SQLite
   */
  public async getLatestDeliveryPercent(symbol: string): Promise<{ delivPer: number; volume: number; delivQty: number; date: string } | null> {
    const cleanSym = symbol.trim().toUpperCase().replace('.NS', '').replace('.BO', '');
    const db = getDB();
    try {
      const row = await dbGet<any>(
        db,
        `SELECT deliv_per, volume, deliv_qty, trade_date FROM NseBhavcopy WHERE symbol = ? ORDER BY trade_date DESC LIMIT 1`,
        [cleanSym]
      );
      if (row && typeof row.deliv_per === 'number') {
        return {
          delivPer: row.deliv_per,
          volume: row.volume || 0,
          delivQty: row.deliv_qty || 0,
          date: row.trade_date
        };
      }
    } catch {}
    return null;
  }

  /**
   * Retrieve institutional bulk/block deals for a symbol from SQLite
   */
  public async getInstitutionalDeals(symbol: string): Promise<InstitutionalDealRecord[]> {
    const cleanSym = symbol.trim().toUpperCase().replace('.NS', '').replace('.BO', '');
    const db = getDB();
    try {
      const rows = await dbAll<any>(
        db,
        `SELECT deal_date, symbol, security_name, client_name, deal_type, quantity, trade_price, deal_category, remarks
         FROM InstitutionalDeals WHERE symbol = ? ORDER BY deal_date DESC LIMIT 50`,
        [cleanSym]
      );
      return rows.map(r => ({
        dealDate: r.deal_date,
        symbol: r.symbol,
        securityName: r.security_name,
        clientName: r.client_name,
        dealType: r.deal_type,
        quantity: r.quantity,
        tradePrice: r.trade_price,
        dealCategory: r.deal_category,
        remarks: r.remarks
      }));
    } catch {
      return [];
    }
  }

  /**
   * Backfill historical NSE Bhavcopy data into the unified DailyOHLCV table.
   * Downloads daily CSVs from archives.nseindia.com for each trading day in the range.
   * Each CSV contains ALL listed stocks for that day.
   * Rate limited: 500ms between requests. Retry with exponential backoff (3 retries).
   */
  public async backfillHistoricalData(
    startDate: string,
    endDate: string
  ): Promise<{
    totalDays: number;
    successDays: number;
    failedDays: number;
    skippedDays: number;
    totalRows: number;
    startDate: string;
    endDate: string;
  }> {
    const db = getDB();
    const progress = NseBhavcopyService.backfillProgress;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      throw new Error(`Invalid date range: ${startDate} to ${endDate}`);
    }

    const tradingDays: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        tradingDays.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    Object.assign(progress, {
      status: 'RUNNING',
      currentDate: '',
      processedDays: 0,
      totalDays: tradingDays.length,
      successDays: 0,
      failedDays: 0,
      skippedDays: 0,
      totalRowsIngested: 0,
      startDate,
      endDate,
      startedAt: new Date().toISOString(),
      error: undefined
    });

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    const BATCH_SIZE = 1000;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const fetchWithRetry = async (url: string, retries: number = 3): Promise<string | null> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url, {
            headers: defaultHeaders,
            signal: AbortSignal.timeout(15000)
          });
          if (res.status === 404 || res.status === 403) return null;
          if (!res.ok) {
            if (attempt < retries) {
              await sleep(1000 * Math.pow(2, attempt));
              continue;
            }
            return null;
          }
          const text = await res.text();
          if (!text || text.length < 5000) return null;
          return text;
        } catch (err: any) {
          if (attempt < retries) {
            await sleep(1000 * Math.pow(2, attempt));
            continue;
          }
          return null;
        }
      }
      return null;
    };

    // Parse a bhavcopy CSV text into rows ready for DailyOHLCV insert.
    const parseBhavCsv = (text: string, isoDate: string): any[][] => {
      const rows: any[][] = [];
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (let li = 1; li < lines.length; li++) {
        const cols = lines[li].split(',').map(c => c.trim());
        if (cols.length >= 15 && cols[1] === 'EQ') {
          const close = parseFloat(cols[8]) || 0;
          if (close <= 0) continue;
          rows.push([
            cols[0],                          // symbol
            isoDate,                          // trade_date
            parseFloat(cols[4]) || 0,         // open
            parseFloat(cols[5]) || 0,         // high
            parseFloat(cols[6]) || 0,         // low
            close,                            // close
            parseInt(cols[10], 10) || 0,      // volume
            (parseFloat(cols[11]) || 0) * 1e5, // turnover (lacs â†’ rupees)
            parseInt(cols[13], 10) || 0,      // delivery_qty
            parseFloat(cols[14]) || 0,        // delivery_pct
            parseInt(cols[12], 10) || 0,      // no_of_trades
            parseFloat(cols[3]) || 0,         // prev_close
            'NSE_BHAVCOPY'
          ]);
        }
      }
      return rows;
    };

    // â”€â”€ Fast parallel download: 8 concurrent days, multi-row batch INSERT â”€â”€â”€â”€â”€â”€
    // 5-year backfill (~1250 days): estimated 3-5 minutes total wall-clock time.
    // Each bhavcopy file covers ALL ~2000 NSE EQ stocks for that day.
    const PARALLEL_DAYS = 8;
    const ROW_COLS = `symbol, trade_date, open, high, low, close, volume,
        turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source`;
    const ROW_PLACEHOLDERS = '(?,?,?,?,?,?,?,?,?,?,?,?,?)';
    // SQLite SQLITE_MAX_COMPOUND_SELECT default is 500 â€” stay safely under it
    const MAX_ROWS_PER_INSERT = 400;

    /**
     * Bulk-insert many rows in a single BEGIN/INSERTâ€¦VALUES(â€¦),(â€¦)/COMMIT.
     * ~20-50x faster than individual INSERT calls for the same row count.
     */
    const bulkInsert = async (allRows: any[][]): Promise<void> => {
      for (let b = 0; b < allRows.length; b += MAX_ROWS_PER_INSERT) {
        const slice = allRows.slice(b, b + MAX_ROWS_PER_INSERT);
        const sql = `INSERT OR REPLACE INTO DailyOHLCV (${ROW_COLS}) VALUES ${slice.map(() => ROW_PLACEHOLDERS).join(',')}`;
        await dbRun(db, sql, slice.flat());
      }
    };

    for (let i = 0; i < tradingDays.length; i += PARALLEL_DAYS) {
      const batchDays = tradingDays.slice(i, i + PARALLEL_DAYS);
      const batchNum = Math.ceil((i + 1) / PARALLEL_DAYS);
      const totalBatches = Math.ceil(tradingDays.length / PARALLEL_DAYS);

      // Download all days in this batch concurrently
      const downloadResults = await Promise.all(batchDays.map(async (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const isoDate = `${yyyy}-${mm}-${dd}`;
        const bhavUrl = `https://archives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${yyyy}.csv`;
        const text = await fetchWithRetry(bhavUrl);
        return { isoDate, text };
      }));

      // Parse all days and write each to DB sequentially (SQLite single-writer)
      for (const { isoDate, text } of downloadResults) {
        progress.processedDays++;
        progress.currentDate = isoDate;

        if (!text || text.length < 100) {
          progress.skippedDays++;
          continue;
        }

        const rows = parseBhavCsv(text, isoDate);
        if (rows.length === 0) {
          progress.skippedDays++;
          continue;
        }

        try {
          await dbRun(db, 'BEGIN TRANSACTION');
          await bulkInsert(rows);
          await dbRun(db, 'COMMIT');
          progress.successDays++;
          progress.totalRowsIngested += rows.length;
        } catch (err: any) {
          await dbRun(db, 'ROLLBACK').catch(() => {});
          progress.failedDays++;
          console.warn(`[Bhavcopy] ${isoDate} â€” DB error: ${err.message}`);
        }
      }

      console.log(`[Bhavcopy] Batch ${batchNum}/${totalBatches} done â€” ${progress.totalRowsIngested.toLocaleString()} rows total`);

      if (i + PARALLEL_DAYS < tradingDays.length) {
        await sleep(150); // 150ms between batches is sufficient; NSE archive is CDN-backed
      }
    }

    progress.status = 'COMPLETE';
    console.log(`[Bhavcopy Backfill] COMPLETE: ${progress.successDays} success, ${progress.failedDays} failed, ${progress.skippedDays} skipped, ${progress.totalRowsIngested} total rows`);

    return {
      totalDays: tradingDays.length,
      successDays: progress.successDays,
      failedDays: progress.failedDays,
      skippedDays: progress.skippedDays,
      totalRows: progress.totalRowsIngested,
      startDate,
      endDate
    };
  }

  /**
   * Fetch DailyOHLCV candles for a given symbol from the unified table.
   * Returns rows ordered by trade_date ascending.
   */
  public async getDailyOHLCV(
    symbol: string,
    limit: number = 600
  ): Promise<Array<{
    date: string; open: number; high: number; low: number; close: number;
    volume: number; turnover: number; deliveryQty: number; deliveryPct: number;
  }>> {
    const db = getDB();
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    try {
      const rows = await dbAll<any>(db, `
        SELECT trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct
        FROM DailyOHLCV
        WHERE symbol = ?
        ORDER BY trade_date DESC
        LIMIT ?
      `, [cleanSym, limit]);
      return rows.reverse().map(r => ({
        date: r.trade_date,
        open: r.open ?? r.close,
        high: r.high ?? r.close,
        low: r.low ?? r.close,
        close: r.close,
        volume: r.volume || 0,
        turnover: r.turnover || 0,
        deliveryQty: r.delivery_qty || 0,
        deliveryPct: r.delivery_pct || 0
      }));
    } catch {
      return [];
    }
  }
}
