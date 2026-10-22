/**
 * StooqDataService.ts
 *
 * Free historical OHLCV data from stooq.com for NSE-listed stocks.
 * No API key, no authentication, no rate-limit registration required.
 *
 * URL pattern:
 *   https://stooq.com/q/d/l/?s={symbol}.ns&d1={yyyymmdd}&d2={yyyymmdd}&i=d
 *
 * CSV response columns: Date, Open, High, Low, Close, Volume
 *
 * Upside  : Per-symbol request, no auth, covers 5+ years, OHLCV data
 * Downside: No turnover/delivery data; small-cap/SME stocks may be absent.
 *            Use NSE Bhavcopy as primary (it covers ALL symbols + turnover).
 *            Use Stooq as gap-fill for symbols bhavcopy misses.
 */

import { getDB, dbRun, dbAll, dbGet } from '../database.js';

export interface StooqProgress {
  status: 'IDLE' | 'RUNNING' | 'COMPLETE' | 'ERROR';
  scanned: number;
  total: number;
  stored: number;
  failures: number;
  failedSymbols: string[];
  startDate: string;
  endDate: string;
  startedAt: string;
  durationMs?: number;
}

export class StooqDataService {
  private static instance: StooqDataService;
  private static progress: StooqProgress = {
    status: 'IDLE', scanned: 0, total: 0, stored: 0, failures: 0,
    failedSymbols: [], startDate: '', endDate: '', startedAt: ''
  };

  private readonly BASE_URL = 'https://stooq.com/q/d/l/';

  public static getInstance(): StooqDataService {
    if (!StooqDataService.instance) {
      StooqDataService.instance = new StooqDataService();
    }
    return StooqDataService.instance;
  }

  public static getProgress(): StooqProgress {
    return StooqDataService.progress;
  }

  private async sleepMs(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  /** Convert YYYY-MM-DD to YYYYMMDD for stooq URL */
  private toStooqDate(iso: string): string {
    return iso.replace(/-/g, '');
  }

  /**
   * Fetch daily OHLCV for a single symbol from stooq.
   * Returns parsed rows or null on failure.
   */
  public async fetchSymbol(
    symbol: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | null> {
    const stooqSym = symbol.replace(/\.NS$/i, '').toLowerCase();
    const d1 = this.toStooqDate(startDate);
    const d2 = this.toStooqDate(endDate);
    const url = `${this.BASE_URL}?s=${stooqSym}.ns&d1=${d1}&d2=${d2}&i=d`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(12000)
      });

      if (!res.ok) return null;
      const text = await res.text();

      // Stooq returns "No data" page for unknown symbols
      if (!text || text.trim().startsWith('No data') || text.trim().length < 50) return null;

      const lines = text.trim().split('\n').filter(l => l.trim().length > 0);
      if (lines.length < 2) return null;

      // Skip header row: Date,Open,High,Low,Close,Volume
      const rows: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 5) continue;
        const close = parseFloat(cols[4]) || 0;
        if (close <= 0) continue;
        rows.push({
          date: cols[0],
          open: parseFloat(cols[1]) || close,
          high: parseFloat(cols[2]) || close,
          low: parseFloat(cols[3]) || close,
          close,
          volume: parseInt(cols[5], 10) || 0
        });
      }
      return rows.length > 0 ? rows : null;
    } catch {
      return null;
    }
  }

  /**
   * Bulk backfill historical OHLCV from stooq.com into DailyOHLCV table.
   * Processes in parallel batches of 10 with 250ms between batches.
   * Only writes rows where stooq returns data (does not create empty records).
   * Existing bhavcopy rows are NOT overwritten — uses INSERT OR IGNORE to preserve
   * higher-quality NSE_BHAVCOPY rows that include turnover/delivery data.
   *
   * @param symbols    List of NSE symbols (e.g. ['RELIANCE', 'INFY', ...])
   * @param startDate  YYYY-MM-DD
   * @param endDate    YYYY-MM-DD
   * @param overwrite  If true, uses INSERT OR REPLACE instead of INSERT OR IGNORE
   */
  public async bulkBackfill(
    symbols: string[],
    startDate: string,
    endDate: string,
    overwrite: boolean = false
  ): Promise<{ totalStored: number; failures: string[]; durationMs: number }> {
    const startTime = Date.now();
    let totalStored = 0;
    const failures: string[] = [];
    const db = getDB();

    const insertMode = overwrite ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
    const INSERT_SQL = `
      ${insertMode} INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'STOOQ')
    `;

    StooqDataService.progress = {
      status: 'RUNNING',
      scanned: 0,
      total: symbols.length,
      stored: 0,
      failures: 0,
      failedSymbols: [],
      startDate,
      endDate,
      startedAt: new Date().toISOString()
    };
    const progress = StooqDataService.progress;

    console.log(`[Stooq Backfill] Starting: ${symbols.length} symbols, ${startDate} → ${endDate}`);

    const PARALLEL = 10;
    for (let i = 0; i < symbols.length; i += PARALLEL) {
      const batch = symbols.slice(i, i + PARALLEL);

      const results = await Promise.all(batch.map(async (sym) => {
        const rows = await this.fetchSymbol(sym, startDate, endDate);
        return { sym, rows };
      }));

      for (const { sym, rows } of results) {
        progress.scanned++;
        if (!rows || rows.length === 0) {
          failures.push(sym);
          progress.failures++;
          progress.failedSymbols.push(sym);
          continue;
        }

        let stored = 0;
        try {
          await dbRun(db, 'BEGIN TRANSACTION');
          for (const row of rows) {
            await dbRun(db, INSERT_SQL, [sym, row.date, row.open, row.high, row.low, row.close, row.volume]);
            stored++;
          }
          await dbRun(db, 'COMMIT');
          totalStored += stored;
          progress.stored += stored;
        } catch (err: any) {
          await dbRun(db, 'ROLLBACK').catch(() => {});
          console.warn(`[Stooq] DB error for ${sym}: ${err.message}`);
        }
      }

      console.log(`[Stooq] Batch ${Math.ceil(i / PARALLEL) + 1}/${Math.ceil(symbols.length / PARALLEL)} done — ${totalStored} rows so far`);

      if (i + PARALLEL < symbols.length) {
        await this.sleepMs(250);
      }
    }

    const durationMs = Date.now() - startTime;
    progress.status = 'COMPLETE';
    progress.durationMs = durationMs;

    console.log(`[Stooq Backfill] COMPLETE: ${totalStored} rows stored, ${failures.length} failures in ${Math.round(durationMs / 1000)}s`);
    return { totalStored, failures, durationMs };
  }

  /**
   * Identify symbols in DailyOHLCV that have fewer bars than minBars,
   * meaning they need a gap-fill from stooq.
   */
  public async findGapSymbols(minBars: number = 250): Promise<string[]> {
    const db = getDB();
    try {
      const rows = await dbAll<any>(db, `
        SELECT symbol, COUNT(*) as bar_count
        FROM DailyOHLCV
        GROUP BY symbol
        HAVING COUNT(*) < ?
        ORDER BY bar_count ASC
      `, [minBars]);
      return (rows || []).map((r: any) => r.symbol);
    } catch {
      return [];
    }
  }

  /**
   * Find symbols in MasterTickers (NSE EQ) that are entirely missing from DailyOHLCV.
   */
  public async findMissingSymbols(): Promise<string[]> {
    const db = getDB();
    try {
      const rows = await dbAll<any>(db, `
        SELECT m.symbol
        FROM MasterTickers m
        WHERE m.exchange = 'NSE' AND m.segment = 'EQ'
          AND m.symbol IS NOT NULL AND m.symbol != ''
          AND NOT EXISTS (SELECT 1 FROM DailyOHLCV d WHERE d.symbol = m.symbol)
        ORDER BY m.symbol
      `);
      return (rows || []).map((r: any) => r.symbol);
    } catch {
      return [];
    }
  }
}
