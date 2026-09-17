import { getDB, dbRun, dbAll, dbGet } from '../database.js';
import { evaluateS10_IntradayORBConfirmation } from './NewTechnicalStrategiesEngine.js';

export interface IntradayCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest: number;
}

export class UpstoxIntradayIngestor {
  private static instance: UpstoxIntradayIngestor;
  
  // Rate-limiting constants: Strict conservative pacing to NEVER hit API walls
  private readonly DELAY_MS_BETWEEN_CALLS = 350; // ~2.8 calls/sec (Limit is 25/sec)
  private readonly MAX_CALLS_PER_MINUTE = 120;   // Safe ceiling
  private callCountThisMinute = 0;
  private minuteStartTime = Date.now();

  public static getInstance(): UpstoxIntradayIngestor {
    if (!UpstoxIntradayIngestor.instance) {
      UpstoxIntradayIngestor.instance = new UpstoxIntradayIngestor();
    }
    return UpstoxIntradayIngestor.instance;
  }

  /**
   * Initializes the persistent intraday candle storage table and index
   */
  public async initTable(db = getDB()): Promise<void> {
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS IntradayOHLCV (
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume INTEGER NOT NULL,
        open_interest INTEGER DEFAULT 0,
        PRIMARY KEY (symbol, timeframe, timestamp)
      )
    `);

    await dbRun(db, `
      CREATE INDEX IF NOT EXISTS idx_intraday_lookup 
      ON IntradayOHLCV(symbol, timeframe, timestamp)
    `);
  }

  /**
   * Pacing throttle ensuring we never violate per-second or per-minute rate limits
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    if (now - this.minuteStartTime > 60000) {
      this.minuteStartTime = now;
      this.callCountThisMinute = 0;
    }

    if (this.callCountThisMinute >= this.MAX_CALLS_PER_MINUTE) {
      const waitTime = 60000 - (now - this.minuteStartTime) + 1000;
      console.log(`[UpstoxIngestor] Reached safe minute threshold (${this.callCountThisMinute} calls). Cooling down for ${(waitTime / 1000).toFixed(1)}s...`);
      await new Promise(res => setTimeout(res, waitTime));
      this.minuteStartTime = Date.now();
      this.callCountThisMinute = 0;
    }

    await new Promise(res => setTimeout(res, this.DELAY_MS_BETWEEN_CALLS));
    this.callCountThisMinute++;
  }

  /**
   * Fetches historical intraday candles using the public unauthenticated endpoint.
   * This guarantees ZERO consumption of your private M2M / trading token quota!
   */
  public async fetchPublicIntradayCandles(
    instrumentKey: string,
    timeframe: '30minute' | '1minute',
    toDate: string,
    fromDate: string
  ): Promise<IntradayCandle[]> {
    await this.throttle();

    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${timeframe}/${toDate}/${fromDate}`;
    
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (res.status === 429) {
        console.warn(`[UpstoxIngestor] 429 Too Many Requests. Backing off for 12 seconds...`);
        await new Promise(res => setTimeout(res, 12000));
        return this.fetchPublicIntradayCandles(instrumentKey, timeframe, toDate, fromDate);
      }

      if (!res.ok) {
        console.warn(`[UpstoxIngestor] Warning HTTP ${res.status} for ${instrumentKey}`);
        return [];
      }

      const json = await res.json() as any;
      const rawCandles = json?.data?.candles;
      if (!Array.isArray(rawCandles)) return [];

      return rawCandles.map((c: any) => ({
        timestamp: c[0],
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5]),
        openInterest: Number(c[6] || 0)
      }));
    } catch (err: any) {
      console.error(`[UpstoxIngestor] Fetch failed for ${instrumentKey}:`, err.message);
      return [];
    }
  }

  /**
   * Stores fetched candles in batch into SQLite
   */
  public async saveCandles(symbol: string, timeframe: string, candles: IntradayCandle[], db = getDB()): Promise<number> {
    if (candles.length === 0) return 0;

    await dbRun(db, 'BEGIN TRANSACTION');
    try {
      for (const c of candles) {
        await dbRun(db, `
          INSERT OR REPLACE INTO IntradayOHLCV (
            symbol, timeframe, timestamp, open, high, low, close, volume, open_interest
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          symbol, timeframe, c.timestamp, c.open, c.high, c.low, c.close, c.volume, c.openInterest
        ]);
      }
      await dbRun(db, 'COMMIT');
      return candles.length;
    } catch (err) {
      await dbRun(db, 'ROLLBACK');
      console.error(`[UpstoxIngestor] DB Insert error for ${symbol}:`, err);
      return 0;
    }
  }

  /**
   * Evaluates live or cached 15-minute Opening Range Breakout (S10 ORB)
   * Strictly filters candles by sessionDate (IST trading date) to prevent historical candle leakage,
   * isolates the 09:15-09:30 IST opening range, and applies time-of-day normalized RVOL.
   */
  public async get15MinORBStatus(
    symbol: string,
    dailySetupActive = true,
    marketRegimePermitsLong = true,
    avgOpeningVolume = 50000,
    sessionDate?: string,
    timeOfDayVolumeBaseline?: Record<string, number> | number,
    mode: 'LIVE' | 'HISTORICAL' = 'LIVE'
  ): Promise<any> {
    const cleanSym = symbol.toUpperCase().replace('.NS', '').replace('.BO', '').trim();
    const db = getDB();
    
    try {
      // Determine session date (default to current IST trading date YYYY-MM-DD if not explicitly specified)
      const targetSessionDate = sessionDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      // Query candles strictly for this specific trading date
      let rows = await dbAll(db, `
        SELECT timestamp, open, high, low, close, volume
        FROM IntradayOHLCV
        WHERE symbol = ? AND timestamp LIKE ?
        ORDER BY timestamp ASC
      `, [cleanSym, `${targetSessionDate}%`]);

      // LIVE execution must never substitute a prior session. Historical analysis may use the latest stored session.
      if ((!rows || rows.length === 0) && mode === 'HISTORICAL') {
        const latestDateRow = await dbGet(db, `
          SELECT substr(timestamp, 1, 10) as sessionDate
          FROM IntradayOHLCV
          WHERE symbol = ?
          ORDER BY timestamp DESC
          LIMIT 1
        `, [cleanSym]) as any;

        if (latestDateRow?.sessionDate) {
          rows = await dbAll(db, `
            SELECT timestamp, open, high, low, close, volume
            FROM IntradayOHLCV
            WHERE symbol = ? AND timestamp LIKE ?
            ORDER BY timestamp ASC
          `, [cleanSym, `${latestDateRow.sessionDate}%`]);
        }
      }

      if ((!rows || rows.length === 0) && mode === 'LIVE') {
        return {
          symbol: cleanSym, timeframe: '15m', confirmed: false, status: 'DATA_UNAVAILABLE',
          openingRangeHigh: 0, openingRangeLow: 0, breakoutClose: 0, rvol: 0,
          explanation: `DATA_UNAVAILABLE: No intraday candles are stored for live session ${targetSessionDate}.`
        };
      }

      const candles = (rows || []).map(r => ({
        timestamp: r.timestamp,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume)
      }));

      return evaluateS10_IntradayORBConfirmation(
        cleanSym,
        candles,
        dailySetupActive,
        marketRegimePermitsLong,
        timeOfDayVolumeBaseline,
        targetSessionDate
      );
    } catch (err: any) {
      return {
        symbol: cleanSym,
        timeframe: '15m',
        confirmed: false,
        status: 'REJECT',
        openingRangeHigh: 0,
        openingRangeLow: 0,
        breakoutClose: 0,
        rvol: 0,
        explanation: `ERROR: Failed to retrieve intraday candles for ${cleanSym}: ${err.message}`
      };
    }
  }
}

