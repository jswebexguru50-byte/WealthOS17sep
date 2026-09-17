import { getDB, dbRun, dbAll, dbGet } from '../database.js';
import { BollingerBands, RSI, EMA, SMA, ATR, MACD } from 'technicalindicators';

export interface MarketSnapshot {
  symbol: string;
  snapshotDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
  dataSource?: 'UPSTOX_API_V2' | 'YAHOO_FINANCE';
  // Computed Indicators
  sma20?: number;
  ema50?: number;
  rsi14?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHistogram?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  bbBandwidth?: number;
  bbPercentB?: number;
  atr14?: number;
  vwap?: number;
  volume5DayAvg?: number;
  relativeVolume?: number;
}

export interface IngestionResult {
  symbol: string;
  success: boolean;
  snapshotsStored: number;
  latestClose?: number;
  dataSource?: string;
  error?: string;
}

export interface MultiTimeframeData {
  daily: MarketSnapshot[];
  weekly: MarketSnapshot | null;
  monthly: MarketSnapshot | null;
  currentIndicators: {
    rsi14: number;
    trend: 'STRONG_UPTREND' | 'UPTREND' | 'SIDEWAYS' | 'DOWNTREND' | 'STRONG_DOWNTREND';
    bollingerSqueeze: boolean;
    bbPercentB: number;
    atr14: number;
    vwap: number;
    volume5DayAvg: number;
    relativeVolume: number;
    macdBullish: boolean;
    ema50AboveSma200: boolean;
    priceAboveEma50: boolean;
    priceAboveEma20: boolean;
    openInterest?: number;
  };
}

// Built-in ISIN mapping for top tracked Indian universe
const CORE_ISIN_MAP: Record<string, string> = {
  'RELIANCE': 'INE002A01018',
  'HDFCBANK': 'INE040A01034',
  'ICICIBANK': 'INE090A01021',
  'INFY': 'INE009A01021',
  'TCS': 'INE467B01029',
  'TATAMOTORS': 'INE155A01022',
  'TATASTEEL': 'INE081A01020',
  'HINDUNILVR': 'INE030A01027',
  'SBIN': 'INE062A01020',
  'M&M': 'INE101A01026',
  'LTIM': 'INE018A01030',
  'SUNPHARMA': 'INE044A01036',
  'AXISBANK': 'INE238A01034',
  'BAJFINANCE': 'INE296A01024',
  'BHARTIARTL': 'INE397D01024',
  'KOTAKBANK': 'INE237A01028',
  'ITC': 'INE154A01025',
  'LT': 'INE018A01030',
  'ASIANPAINT': 'INE021A01026',
  'MARUTI': 'INE585B01010',
  'TITAN': 'INE280A01028',
  'NESTLEIND': 'INE239A01016',
  'ULTRACEMCO': 'INE481G01011',
  'TECHM': 'INE669C01036',
  'WIPRO': 'INE075A01022',
  'HCLTECH': 'INE860A01027',
  'POWERGRID': 'INE752E01010',
  'NTPC': 'INE733E01010',
  'COALINDIA': 'INE522F01014',
  'JSWSTEEL': 'INE019A01038',
  'ADANIPORTS': 'INE742F01042',
  'ONGC': 'INE213A01029',
  'BPCL': 'INE029A01011',
  'BEL': 'INE263A01024',
  'TATAPOWER': 'INE245A01021',
  'PFC': 'INE134E01011',
  'RECLTD': 'INE020B01018',
  'IOC': 'INE242A01010',
  'SIEMENS': 'INE003A01024',
  'ABB': 'INE117A01022',
  'HAVELLS': 'INE176B01034',
  'PIDILITIND': 'INE318A01026',
  'DMART': 'INE192R01011',
  'TRENT': 'INE849A01020',
  'NAUKRI': 'INE663F01024',
  'ZOMATO': 'INE758U01015',
  'DRREDDY': 'INE089A01023',
  'CIPLA': 'INE059A01026',
  'DIVISLAB': 'INE361B01024',
  'APOLLOHOSP': 'INE437A01024',
  'BAJAJFINSV': 'INE918I01018',
  'SHRIRAMFIN': 'INE721A01013',
  'VEDL': 'INE205A01025',
  'INDUSINDBK': 'INE095A01012',
  'BANKBARODA': 'INE077A01010',
  'PNB': 'INE160A01022',
  'CANBK': 'INE476A01014',
  'FEDERALBNK': 'INE171A01029',
  'TATACONSUM': 'INE192A01025',
  'TATACHEM': 'INE092A01019',
  'GRASIM': 'INE047A01021',
  'HINDALCO': 'INE038A01020',
  'VBL': 'INE200M01013',
  'POLYCAB': 'INE455K01017',
  'HAL': 'INE066F01012',
  'BHEL': 'INE257A01026',
  'IRCTC': 'INE335Y01012',
  'IRFC': 'INE053F01010'
};

export class MarketDataIngestorService {
  private static instance: MarketDataIngestorService;
  private readonly YAHOO_BASE_URL = 'https://query2.finance.yahoo.com/v8/finance/chart';
  private readonly UPSTOX_BASE_URL = 'https://api.upstox.com/v2';

  public static getInstance(): MarketDataIngestorService {
    if (!MarketDataIngestorService.instance) {
      MarketDataIngestorService.instance = new MarketDataIngestorService();
    }
    return MarketDataIngestorService.instance;
  }

  public async initializeDatabase(): Promise<void> {
    const db = getDB();
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS MarketSnapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        snapshot_date TEXT NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume INTEGER,
        open_interest REAL,
        data_source TEXT DEFAULT 'UPSTOX_API_V2',
        sma20 REAL,
        ema50 REAL,
        rsi14 REAL,
        macd_line REAL,
        macd_signal REAL,
        macd_histogram REAL,
        bb_upper REAL,
        bb_middle REAL,
        bb_lower REAL,
        bb_bandwidth REAL,
        bb_percent_b REAL,
        atr14 REAL,
        vwap REAL,
        volume_5d_avg REAL,
        relative_volume REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, snapshot_date)
      )
    `);

    // Ensure columns exist on pre-existing tables
    try {
      await dbRun(db, `ALTER TABLE MarketSnapshots ADD COLUMN open_interest REAL`);
    } catch {}
    try {
      await dbRun(db, `ALTER TABLE MarketSnapshots ADD COLUMN data_source TEXT DEFAULT 'UPSTOX_API_V2'`);
    } catch {}
  }

  /**
   * Retrieve active Upstox Access Token from environment or AppConfig DB
   */
  public async getUpstoxAccessToken(): Promise<string | null> {
    if (process.env.UPSTOX_ACCESS_TOKEN) {
      return process.env.UPSTOX_ACCESS_TOKEN;
    }
    try {
      const db = getDB();
      const row = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'Access_Token'");
      return row?.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve an equity/index symbol to an Upstox Instrument Key
   * e.g. RELIANCE -> NSE_EQ|INE002A01018, ^NSEI -> NSE_INDEX|Nifty 50
   */
  public async resolveUpstoxInstrumentKey(symbol: string): Promise<string | null> {
    const s = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');

    if (s === '^NSEI' || s === 'NIFTY50' || s === 'NIFTY 50') return 'NSE_INDEX|Nifty 50';
    if (s === '^NSEBANK' || s === 'BANKNIFTY') return 'NSE_INDEX|Nifty Bank';
    if (s === '^INDIAVIX' || s === 'INDIAVIX') return 'NSE_INDEX|India VIX';

    // 1. Check in-memory core map
    if (CORE_ISIN_MAP[s]) {
      return `NSE_EQ|${CORE_ISIN_MAP[s]}`;
    }

    // 2. Query MasterTickers / Holdings DB â€” prefer NSE key, fall back to BSE key
    try {
      const db = getDB();
      const row = await dbGet(db, `
        SELECT isin, exchange, upstox_key_nse, upstox_key_bse FROM MasterTickers WHERE symbol = ? OR isin = ?
      `, [s, s]);
      if (row?.upstox_key_nse) return row.upstox_key_nse;
      if (row?.upstox_key_bse) return row.upstox_key_bse;
      // Only auto-construct NSE key for NSE-listed stocks (not BSE-only / SME stocks)
      if (row?.isin && row.isin.startsWith('IN') && row.exchange !== 'BSE') return `NSE_EQ|${row.isin}`;

      const hRow = await dbGet(db, `SELECT isin FROM Holdings WHERE symbol = ? LIMIT 1`, [s]);
      if (hRow?.isin && hRow.isin.startsWith('IN')) return `NSE_EQ|${hRow.isin}`;
    } catch {}

    return null;
  }

  /**
   * Fetch OHLCV + Open Interest directly from Upstox Historical Candle API v2
   * URL format: /historical-candle/{instrumentKey}/day/{toIso}/{fromIso}
   */
  public async fetchOHLCVFromUpstox(symbol: string, days: number = 200): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    openInterest?: number;
    dataSource: 'UPSTOX_API_V2';
  }> | null> {
    const instKey = await this.resolveUpstoxInstrumentKey(symbol);
    if (!instKey) return null;

    const token = await this.getUpstoxAccessToken();
    const toIso = new Date().toISOString().split('T')[0];
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - Math.round(days * 1.5));
    const fromIso = fromDate.toISOString().split('T')[0];

    const url = `${this.UPSTOX_BASE_URL}/historical-candle/${encodeURIComponent(instKey)}/day/${toIso}/${fromIso}`;

    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) {
        return null; // Fallback to Yahoo
      }

      const json = await response.json();
      const rawCandles = json?.data?.candles;
      if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
        return null;
      }

      // Upstox candle format: [timestamp, open, high, low, close, volume, open_interest]
      // Returned in reverse chronological order (newest first)
      const candles = rawCandles.slice().reverse().map((c: any) => ({
        date: String(c[0]).split('T')[0],
        open: Number(c[1]) || 0,
        high: Number(c[2]) || 0,
        low: Number(c[3]) || 0,
        close: Number(c[4]) || 0,
        volume: Number(c[5]) || 0,
        openInterest: Number(c[6]) || 0,
        dataSource: 'UPSTOX_API_V2' as const
      })).filter(c => c.close > 0 && c.open > 0);

      return candles.slice(-days);
    } catch (err: any) {
      console.warn(`[Upstox Data] Fallback for ${symbol}: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch OHLCV data from Yahoo Finance (Secondary Fallback Feed)
   */
  public async fetchOHLCVFromYahoo(symbol: string, days: number = 200): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    openInterest?: number;
    dataSource: 'YAHOO_FINANCE';
  }>> {
    const yahooSymbol = symbol.includes('.') || symbol.startsWith('^') ? symbol : `${symbol}.NS`;
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - Math.round(days * 1.5 * 24 * 3600);
    const url = `${this.YAHOO_BASE_URL}/${yahooSymbol}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) return [];

      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result) return [];

      const timestamps: number[] = result.timestamp || [];
      const ohlcv = result.indicators?.quote?.[0];
      if (!ohlcv || !timestamps.length) return [];

      const candles = timestamps.map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        open: ohlcv.open[i] ?? 0,
        high: ohlcv.high[i] ?? 0,
        low: ohlcv.low[i] ?? 0,
        close: ohlcv.close[i] ?? ohlcv.adjclose?.[i] ?? 0,
        volume: ohlcv.volume[i] ?? 0,
        openInterest: 0,
        dataSource: 'YAHOO_FINANCE' as const
      })).filter(c => c.close > 0 && c.open > 0);

      return candles.slice(-days);
    } catch {
      return [];
    }
  }

  /**
   * Unified Fetch: Tries Upstox Primary -> Falls back to Yahoo Finance
   */
  public async fetchOHLCV(symbol: string, days: number = 200): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    openInterest?: number;
    dataSource: 'UPSTOX_API_V2' | 'YAHOO_FINANCE';
  }>> {
    // 1. Try Upstox API v2 Primary
    const upstoxCandles = await this.fetchOHLCVFromUpstox(symbol, days);
    if (upstoxCandles && upstoxCandles.length >= 20) {
      return upstoxCandles;
    }

    // 2. Fallback to Yahoo Finance
    return this.fetchOHLCVFromYahoo(symbol, days);
  }

  /**
   * Compute technical indicators from OHLCV data
   */
  public computeIndicators(candles: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    openInterest?: number;
    dataSource?: 'UPSTOX_API_V2' | 'YAHOO_FINANCE';
  }>): MarketSnapshot[] {
    if (candles.length < 20) return [];

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    // Compute indicators
    const sma20Arr = SMA.calculate({ period: 20, values: closes });
    const ema50Arr = EMA.calculate({ period: 50, values: closes });
    const rsi14Arr = RSI.calculate({ period: 14, values: closes });
    const atr14Arr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const macdArr = MACD.calculate({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      values: closes,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const bbArr = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });

    const snapshots: MarketSnapshot[] = [];
    const maxLen = candles.length;

    for (let i = 0; i < maxLen; i++) {
      const candle = candles[i];
      // Align indicator arrays (they start later than the raw candles)
      const sma20Idx = i - (maxLen - sma20Arr.length);
      const ema50Idx = i - (maxLen - ema50Arr.length);
      const rsi14Idx = i - (maxLen - rsi14Arr.length);
      const atr14Idx = i - (maxLen - atr14Arr.length);
      const macdIdx = i - (maxLen - macdArr.length);
      const bbIdx = i - (maxLen - bbArr.length);

      // Volume 5-day average
      const vol5d = volumes.slice(Math.max(0, i - 4), i + 1);
      const vol5dAvg = vol5d.reduce((a, b) => a + b, 0) / vol5d.length;

      const bb = bbIdx >= 0 ? bbArr[bbIdx] : null;
      const bbBandwidth = bb ? ((bb.upper - bb.lower) / bb.middle) * 100 : undefined;
      const bbPercentB = bb ? (candle.close - bb.lower) / (bb.upper - bb.lower) : undefined;

      // Intraday VWAP approximation using typical price Ã— volume
      const typicalPrices = candles.slice(Math.max(0, i - 19), i + 1);
      let cumTPV = 0, cumVol = 0;
      for (const c of typicalPrices) {
        const tp = (c.high + c.low + c.close) / 3;
        cumTPV += tp * c.volume;
        cumVol += c.volume;
      }
      const vwap = cumVol > 0 ? cumTPV / cumVol : candle.close;

      const macdData = macdIdx >= 0 ? macdArr[macdIdx] : null;

      snapshots.push({
        symbol: '',
        snapshotDate: candle.date,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        openInterest: candle.openInterest,
        dataSource: candle.dataSource || 'UPSTOX_API_V2',
        sma20: sma20Idx >= 0 ? sma20Arr[sma20Idx] : undefined,
        ema50: ema50Idx >= 0 ? ema50Arr[ema50Idx] : undefined,
        rsi14: rsi14Idx >= 0 ? rsi14Arr[rsi14Idx] : undefined,
        macdLine: macdData?.MACD,
        macdSignal: macdData?.signal,
        macdHistogram: macdData?.histogram,
        bbUpper: bb?.upper,
        bbMiddle: bb?.middle,
        bbLower: bb?.lower,
        bbBandwidth,
        bbPercentB,
        atr14: atr14Idx >= 0 ? atr14Arr[atr14Idx] : undefined,
        vwap,
        volume5DayAvg: vol5dAvg,
        relativeVolume: vol5dAvg > 0 ? candle.volume / vol5dAvg : 1
      });
    }
    return snapshots;
  }

  /**
   * Ingest, compute, and store data for a single symbol
   */
  public async ingestSymbol(symbol: string, days: number = 200): Promise<IngestionResult> {
    try {
      const candles = await this.fetchOHLCV(symbol, days);
      if (!candles.length) {
        return { symbol, success: false, snapshotsStored: 0, error: 'No OHLCV data returned' };
      }

      const snapshots = this.computeIndicators(candles);
      const db = getDB();
      let stored = 0;
      const dataSource = candles[0]?.dataSource || 'UPSTOX_API_V2';

      for (const snap of snapshots) {
        try {
          await dbRun(db, `
            INSERT OR REPLACE INTO MarketSnapshots
              (symbol, snapshot_date, open, high, low, close, volume, open_interest, data_source,
               sma20, ema50, rsi14, macd_line, macd_signal, macd_histogram,
               bb_upper, bb_middle, bb_lower, bb_bandwidth, bb_percent_b,
               atr14, vwap, volume_5d_avg, relative_volume)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            symbol, snap.snapshotDate,
            snap.open, snap.high, snap.low, snap.close, snap.volume,
            snap.openInterest ?? null, dataSource,
            snap.sma20 ?? null, snap.ema50 ?? null, snap.rsi14 ?? null,
            snap.macdLine ?? null, snap.macdSignal ?? null, snap.macdHistogram ?? null,
            snap.bbUpper ?? null, snap.bbMiddle ?? null, snap.bbLower ?? null,
            snap.bbBandwidth ?? null, snap.bbPercentB ?? null,
            snap.atr14 ?? null, snap.vwap ?? null, snap.volume5DayAvg ?? null,
            snap.relativeVolume ?? null
          ]);
          stored++;
        } catch { /* skip duplicates */ }
      }

      const latestClose = candles[candles.length - 1]?.close;
      return { symbol, success: true, snapshotsStored: stored, latestClose, dataSource };
    } catch (err: any) {
      return { symbol, success: false, snapshotsStored: 0, error: err.message };
    }
  }

  /**
   * Get the latest market snapshot from DB for a symbol
   */
  public async getLatestSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    const db = getDB();
    const row = await dbGet(db, `
      SELECT * FROM MarketSnapshots WHERE symbol = ? ORDER BY snapshot_date DESC LIMIT 1
    `, [symbol]);

    if (!row) return null;

    return {
      symbol: row.symbol,
      snapshotDate: row.snapshot_date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      sma20: row.sma20,
      ema50: row.ema50,
      rsi14: row.rsi14,
      macdLine: row.macd_line,
      macdSignal: row.macd_signal,
      macdHistogram: row.macd_histogram,
      bbUpper: row.bb_upper,
      bbMiddle: row.bb_middle,
      bbLower: row.bb_lower,
      bbBandwidth: row.bb_bandwidth,
      bbPercentB: row.bb_percent_b,
      atr14: row.atr14,
      vwap: row.vwap,
      volume5DayAvg: row.volume_5d_avg,
      relativeVolume: row.relative_volume
    };
  }

  /**
   * Get last N snapshots for a symbol (for charting / analysis)
   */
  public async getSnapshots(symbol: string, limit: number = 60): Promise<MarketSnapshot[]> {
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT * FROM MarketSnapshots WHERE symbol = ? ORDER BY snapshot_date DESC LIMIT ?
    `, [symbol, limit]);

    return rows.map((row: any) => ({
      symbol: row.symbol,
      snapshotDate: row.snapshot_date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      sma20: row.sma20,
      ema50: row.ema50,
      rsi14: row.rsi14,
      macdLine: row.macd_line,
      macdSignal: row.macd_signal,
      macdHistogram: row.macd_histogram,
      bbUpper: row.bb_upper,
      bbMiddle: row.bb_middle,
      bbLower: row.bb_lower,
      bbBandwidth: row.bb_bandwidth,
      bbPercentB: row.bb_percent_b,
      atr14: row.atr14,
      vwap: row.vwap,
      volume5DayAvg: row.volume_5d_avg,
      relativeVolume: row.relative_volume
    })).reverse();
  }

  /**
   * Get multi-timeframe analysis for a symbol from stored snapshots
   */
  public async getMultiTimeframeData(symbol: string): Promise<MultiTimeframeData | null> {
    const snapshots = await this.getSnapshots(symbol, 200);
    if (snapshots.length < 20) return null;

    const latest = snapshots[snapshots.length - 1];
    const prev20 = snapshots.slice(-20);

    // Weekly: last 5 trading days aggregated
    const weekly5d = snapshots.slice(-5);
    const weeklySnap: MarketSnapshot | null = weekly5d.length > 0 ? {
      symbol,
      snapshotDate: weekly5d[weekly5d.length - 1].snapshotDate,
      open: weekly5d[0].open,
      high: Math.max(...weekly5d.map(s => s.high)),
      low: Math.min(...weekly5d.map(s => s.low)),
      close: weekly5d[weekly5d.length - 1].close,
      volume: weekly5d.reduce((a, s) => a + s.volume, 0)
    } : null;

    // Monthly: last 20 trading days aggregated
    const monthly20d = snapshots.slice(-20);
    const monthlySnap: MarketSnapshot | null = monthly20d.length > 0 ? {
      symbol,
      snapshotDate: monthly20d[monthly20d.length - 1].snapshotDate,
      open: monthly20d[0].open,
      high: Math.max(...monthly20d.map(s => s.high)),
      low: Math.min(...monthly20d.map(s => s.low)),
      close: monthly20d[monthly20d.length - 1].close,
      volume: monthly20d.reduce((a, s) => a + s.volume, 0)
    } : null;

    // Determine trend from EMA50 vs SMA20
    const ema50 = latest.ema50 ?? 0;
    const sma20 = latest.sma20 ?? 0;
    const close = latest.close;

    let trend: MultiTimeframeData['currentIndicators']['trend'] = 'SIDEWAYS';
    if (close > ema50 * 1.03 && ema50 > sma20 * 0.98) trend = 'STRONG_UPTREND';
    else if (close > ema50) trend = 'UPTREND';
    else if (close < ema50 * 0.97 && ema50 < sma20 * 1.02) trend = 'STRONG_DOWNTREND';
    else if (close < ema50) trend = 'DOWNTREND';

    const bbBandwidth = latest.bbBandwidth ?? 10;
    const bollingerSqueeze = bbBandwidth < 6.5;
    const priceAboveEma20 = close > (latest.sma20 ?? close); // Using SMA20 as proxy for EMA20

    // EMA50 vs SMA of last 100 days as SMA200 proxy
    const sma100Closes = snapshots.slice(-100).map(s => s.close);
    const sma100 = sma100Closes.reduce((a, b) => a + b, 0) / sma100Closes.length;

    return {
      daily: snapshots.slice(-60),
      weekly: weeklySnap,
      monthly: monthlySnap,
      currentIndicators: {
        rsi14: latest.rsi14 ?? 50,
        trend,
        bollingerSqueeze,
        bbPercentB: latest.bbPercentB ?? 0.5,
        atr14: latest.atr14 ?? close * 0.02,
        vwap: latest.vwap ?? close,
        volume5DayAvg: latest.volume5DayAvg ?? latest.volume,
        relativeVolume: latest.relativeVolume ?? 1,
        macdBullish: (latest.macdHistogram ?? 0) > 0,
        ema50AboveSma200: ema50 > sma100,
        priceAboveEma50: close > ema50,
        priceAboveEma20
      }
    };
  }

  /**
   * Batch ingest multiple symbols (used by the hourly scheduler)
   */
  public async batchIngest(symbols: string[], days: number = 200): Promise<{
    totalIngested: number;
    failures: string[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    let totalIngested = 0;
    const failures: string[] = [];

    // Process in batches of 5 to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(sym => this.ingestSymbol(sym, days)));

      for (const result of results) {
        if (result.success) {
          totalIngested += result.snapshotsStored;
        } else {
          failures.push(result.symbol);
        }
      }

      // Rate limit: 200ms between batches
      if (i + batchSize < symbols.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return {
      totalIngested,
      failures,
      durationMs: Date.now() - startTime
    };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // UPSTOX BACKFILL INTO DailyOHLCV TABLE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private static backfillProgress = { status: 'IDLE', scanned: 0, total: 0, stored: 0, failures: 0 };

  public static getBackfillProgress() {
    return MarketDataIngestorService.backfillProgress;
  }

  private async sleepMs(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  // â”€â”€ Upstox API Rate Limiter â”€â”€
  // Conservative limits: 50 req/min (well under 100/min Upstox max), 900/day (under 1000/day).
  // Per-minute window enforced by tracking request timestamps.
  // Daily budget tracked across the calendar day (resets at midnight).
  private static upstoxRateLimiter = {
    perMinuteLimit: 50,    // max requests per minute
    dailyLimit: 900,       // conservative daily budget (Upstox free: ~1000/day)
    requestTimestamps: [] as number[],
    dailyDate: '',         // YYYY-MM-DD â€” resets counter at midnight
    dailyCount: 0,
    paused: false,
    dailyLimitReached: false,
  };

  /**
   * Enforce Upstox API rate limits before each API call.
   * Returns false if the daily limit has been reached (caller should stop).
   */
  private async upstoxRateThrottle(): Promise<boolean> {
    const rl = MarketDataIngestorService.upstoxRateLimiter;
    const today = new Date().toISOString().split('T')[0];

    // Reset daily counter at midnight
    if (rl.dailyDate !== today) {
      rl.dailyDate = today;
      rl.dailyCount = 0;
      rl.dailyLimitReached = false;
    }

    // Hard stop when daily budget is exhausted
    if (rl.dailyCount >= rl.dailyLimit) {
      if (!rl.dailyLimitReached) {
        console.warn(`[Upstox RateLimiter] Daily limit of ${rl.dailyLimit} requests reached for ${today}. Backfill will resume tomorrow.`);
        rl.dailyLimitReached = true;
      }
      return false; // signal caller to stop
    }

    // Per-minute window: keep only timestamps within the last 60s
    const now = Date.now();
    rl.requestTimestamps = rl.requestTimestamps.filter(t => now - t < 60_000);

    // If at per-minute limit, sleep until the oldest timestamp falls out of the window
    if (rl.requestTimestamps.length >= rl.perMinuteLimit) {
      const oldest = rl.requestTimestamps[0];
      const waitMs = 60_000 - (now - oldest) + 100; // +100ms buffer
      console.log(`[Upstox RateLimiter] Per-minute limit (${rl.perMinuteLimit} req/min) reached â€” waiting ${Math.round(waitMs / 1000)}s`);
      await this.sleepMs(waitMs);
      // Re-clean after sleep
      const now2 = Date.now();
      rl.requestTimestamps = rl.requestTimestamps.filter(t => now2 - t < 60_000);
    }

    rl.requestTimestamps.push(Date.now());
    rl.dailyCount++;
    return true;
  }

  /** Returns current Upstox rate limiter stats (used by status endpoint). */
  public static getUpstoxRateLimiterStats() {
    const rl = MarketDataIngestorService.upstoxRateLimiter;
    return {
      dailyUsed: rl.dailyCount,
      dailyLimit: rl.dailyLimit,
      dailyDate: rl.dailyDate,
      dailyLimitReached: rl.dailyLimitReached,
      requestsInLastMinute: rl.requestTimestamps.filter(t => Date.now() - t < 60_000).length,
      perMinuteLimit: rl.perMinuteLimit
    };
  }

  private async fetchWithRetry(url: string, headers: Record<string, string>, maxRetries: number = 3): Promise<any> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(10000)
        });

        if (response.status === 429) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`[Upstox] Rate limited (429), backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleepMs(backoffMs);
          continue;
        }

        if (!response.ok) return null;
        return await response.json();
      } catch (err: any) {
        if (attempt < maxRetries - 1) {
          await this.sleepMs(1000 * (attempt + 1));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  /**
   * Split a date range into â‰¤2-year windows (Upstox daily-candle API limit).
   */
  private buildDateChunks(fromIso: string, toIso: string): Array<{ from: string; to: string }> {
    const chunks: Array<{ from: string; to: string }> = [];
    let cursor = new Date(fromIso);
    const endDate = new Date(toIso);
    while (cursor <= endDate) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setFullYear(chunkEnd.getFullYear() + 2);
      chunkEnd.setDate(chunkEnd.getDate() - 1);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
      chunks.push({
        from: cursor.toISOString().split('T')[0],
        to: chunkEnd.toISOString().split('T')[0]
      });
      cursor = new Date(chunkEnd);
      cursor.setDate(cursor.getDate() + 1);
    }
    return chunks;
  }

  /**
   * Backfill daily OHLCV from Upstox into the unified DailyOHLCV table.
   * Supports absolute date range (startDate/endDate) which is auto-chunked into
   * â‰¤2-year windows to respect Upstox API limits.
   * Falls back to daysBack relative window when no date range is given.
   */
  public async backfillFromUpstox(
    symbols: string[],
    daysBack: number = 500,
    options?: { startDate?: string; endDate?: string }
  ): Promise<{
    totalStored: number;
    failures: string[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    let totalStored = 0;
    const failures: string[] = [];

    const token = await this.getUpstoxAccessToken();
    if (!token) {
      console.warn('[Upstox Backfill] No access token available â€” skipping Upstox backfill');
      return { totalStored: 0, failures: symbols, durationMs: Date.now() - startTime };
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // Resolve the date range and split into â‰¤2-year chunks
    const toIso = options?.endDate || new Date().toISOString().split('T')[0];
    const fromIso = options?.startDate || (() => {
      const d = new Date();
      d.setDate(d.getDate() - Math.round(daysBack * 1.5));
      return d.toISOString().split('T')[0];
    })();
    const dateChunks = this.buildDateChunks(fromIso, toIso);

    console.log(`[Upstox Backfill] ${symbols.length} symbols, range ${fromIso}â†’${toIso} in ${dateChunks.length} chunk(s)`);

    MarketDataIngestorService.backfillProgress = { status: 'RUNNING', scanned: 0, total: symbols.length, stored: 0, failures: 0 };
    const db = getDB();

    const CHUNK = 10;
    for (let i = 0; i < symbols.length; i += CHUNK) {
      const symBatch = symbols.slice(i, i + CHUNK);

      await Promise.all(symBatch.map(async (sym) => {
        try {
          const instKey = await this.resolveUpstoxInstrumentKey(sym);
          if (!instKey) {
            failures.push(sym);
            return;
          }

          let symStored = 0;
          for (const { from, to } of dateChunks) {
            const canProceed = await this.upstoxRateThrottle();
            if (!canProceed) {
              // Daily limit hit â€” mark remaining symbols as failures and abort outer loop
              failures.push(sym);
              return;
            }
            const url = `${this.UPSTOX_BASE_URL}/historical-candle/${encodeURIComponent(instKey)}/day/${to}/${from}`;
            const json = await this.fetchWithRetry(url, headers);
            const rawCandles = json?.data?.candles;
            if (!Array.isArray(rawCandles) || rawCandles.length === 0) continue;

            for (const c of rawCandles) {
              const tradeDate = String(c[0]).split('T')[0];
              const open = Number(c[1]) || 0;
              const high = Number(c[2]) || 0;
              const low = Number(c[3]) || 0;
              const close = Number(c[4]) || 0;
              const volume = Number(c[5]) || 0;
              if (close <= 0 || open <= 0) continue;

              try {
                await dbRun(db, `
                  INSERT OR REPLACE INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'UPSTOX')
                `, [sym, tradeDate, open, high, low, close, volume]);
                symStored++;
              } catch {}
            }
            // Brief pause between chunk requests for the same symbol
            if (dateChunks.length > 1) await this.sleepMs(80);
          }

          totalStored += symStored;
          if (symStored === 0) failures.push(sym);
        } catch {
          failures.push(sym);
        }
      }));

      MarketDataIngestorService.backfillProgress = {
        status: 'RUNNING',
        scanned: Math.min(symbols.length, i + CHUNK),
        total: symbols.length,
        stored: totalStored,
        failures: failures.length
      };

      if (i + CHUNK < symbols.length) {
        await this.sleepMs(300);
      }
    }

    MarketDataIngestorService.backfillProgress = {
      status: 'COMPLETE',
      scanned: symbols.length,
      total: symbols.length,
      stored: totalStored,
      failures: failures.length
    };

    console.log(`[Upstox Backfill] Done: ${totalStored} rows stored, ${failures.length} failures in ${Date.now() - startTime}ms`);
    return { totalStored, failures, durationMs: Date.now() - startTime };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // UPSTOX INTRADAY (15m) BULK BACKFILL â€” for S10 ORB Breakout strategy
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private static intradayBackfillProgress = { status: 'IDLE', scanned: 0, total: 0, stored: 0, failures: 0 };

  public static getIntradayBackfillProgress() {
    return MarketDataIngestorService.intradayBackfillProgress;
  }

  /**
   * Bulk backfill 15-minute intraday candles from Upstox for a list of symbols.
   * Upstox limits 15m data to 1 month per request, so date range is auto-chunked monthly.
   * Results stored in IntradayCandles table.
   */
  public async backfillIntradayFromUpstox(
    symbols: string[],
    startDate: string,
    endDate: string,
    interval: '15m' | '30m' | '1h' = '15m'
  ): Promise<{ totalStored: number; failures: string[]; durationMs: number }> {
    const startTime = Date.now();
    let totalStored = 0;
    const failures: string[] = [];

    const token = await this.getUpstoxAccessToken();
    if (!token) {
      console.warn('[Upstox Intraday Backfill] No access token');
      return { totalStored: 0, failures: symbols, durationMs: Date.now() - startTime };
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    };
    const upstoxInterval = MarketDataIngestorService.INTERVAL_MAP[interval] || '15minute';

    // Build monthly chunks (Upstox 15m API max range = 1 month per call)
    const monthChunks: Array<{ from: string; to: string }> = [];
    let cursor = new Date(startDate);
    const end = new Date(endDate);
    while (cursor <= end) {
      const chunkEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0); // last day of month
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      monthChunks.push({
        from: cursor.toISOString().split('T')[0],
        to: chunkEnd.toISOString().split('T')[0]
      });
      cursor = new Date(chunkEnd);
      cursor.setDate(cursor.getDate() + 1);
    }

    console.log(`[Upstox Intraday] ${symbols.length} symbols, range ${startDate}â†’${endDate}, ${monthChunks.length} monthly chunks`);

    MarketDataIngestorService.intradayBackfillProgress = { status: 'RUNNING', scanned: 0, total: symbols.length, stored: 0, failures: 0 };
    const db = getDB();

    const CHUNK = 5; // smaller batch for intraday to avoid rate limits
    for (let i = 0; i < symbols.length; i += CHUNK) {
      const symBatch = symbols.slice(i, i + CHUNK);

      await Promise.all(symBatch.map(async (sym) => {
        try {
          const instKey = await this.resolveUpstoxInstrumentKey(sym);
          if (!instKey) { failures.push(sym); return; }

          let symStored = 0;
          for (const { from, to } of monthChunks) {
            const canProceed = await this.upstoxRateThrottle();
            if (!canProceed) { failures.push(sym); return; }
            const url = `${this.UPSTOX_BASE_URL}/historical-candle/${encodeURIComponent(instKey)}/${upstoxInterval}/${to}/${from}`;
            const json = await this.fetchWithRetry(url, headers);
            const rawCandles = json?.data?.candles;
            if (!Array.isArray(rawCandles) || rawCandles.length === 0) continue;

            for (const c of rawCandles) {
              const candleTime = String(c[0]);
              const open = Number(c[1]) || 0;
              const high = Number(c[2]) || 0;
              const low = Number(c[3]) || 0;
              const close = Number(c[4]) || 0;
              const volume = Number(c[5]) || 0;
              if (close <= 0) continue;

              try {
                await dbRun(db, `
                  INSERT OR REPLACE INTO IntradayCandles (symbol, candle_time, interval, open, high, low, close, volume, data_source)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPSTOX')
                `, [sym, candleTime, interval, open, high, low, close, volume]);
                symStored++;
              } catch {}
            }
            if (monthChunks.length > 1) await this.sleepMs(100);
          }

          totalStored += symStored;
          if (symStored === 0) failures.push(sym);
        } catch {
          failures.push(sym);
        }
      }));

      MarketDataIngestorService.intradayBackfillProgress = {
        status: 'RUNNING',
        scanned: Math.min(symbols.length, i + CHUNK),
        total: symbols.length,
        stored: totalStored,
        failures: failures.length
      };

      if (i + CHUNK < symbols.length) await this.sleepMs(400);
    }

    MarketDataIngestorService.intradayBackfillProgress = {
      status: 'COMPLETE',
      scanned: symbols.length,
      total: symbols.length,
      stored: totalStored,
      failures: failures.length
    };

    console.log(`[Upstox Intraday] Done: ${totalStored} rows stored, ${failures.length} failures in ${Date.now() - startTime}ms`);
    return { totalStored, failures, durationMs: Date.now() - startTime };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // INTRADAY CANDLE FETCHER (15m / 30m / 1h from Upstox)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private static readonly INTERVAL_MAP: Record<string, string> = {
    '15m': '15minute',
    '30m': '30minute',
    '1h': '1hour',
    '1m': '1minute',
    '5m': '5minute'
  };

  /**
   * Fetch intraday candles for a single symbol from Upstox and store in IntradayCandles table.
   */
  public async fetchIntradayCandles(
    symbol: string,
    interval: '15m' | '30m' | '1h' = '15m',
    fromDate?: string,
    toDate?: string
  ): Promise<{ symbol: string; interval: string; stored: number; error?: string }> {
    const token = await this.getUpstoxAccessToken();
    if (!token) {
      return { symbol, interval, stored: 0, error: 'No Upstox access token' };
    }

    const instKey = await this.resolveUpstoxInstrumentKey(symbol);
    if (!instKey) {
      return { symbol, interval, stored: 0, error: `Cannot resolve instrument key for ${symbol}` };
    }

    const upstoxInterval = MarketDataIngestorService.INTERVAL_MAP[interval] || '15minute';
    const to = toDate || new Date().toISOString().split('T')[0];
    const from = fromDate || to;

    const url = `${this.UPSTOX_BASE_URL}/historical-candle/${encodeURIComponent(instKey)}/${upstoxInterval}/${to}/${from}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    try {
      const json = await this.fetchWithRetry(url, headers);
      const rawCandles = json?.data?.candles;
      if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
        return { symbol, interval, stored: 0, error: 'No intraday candles returned' };
      }

      const db = getDB();
      let stored = 0;

      for (const c of rawCandles) {
        const candleTime = String(c[0]);
        const open = Number(c[1]) || 0;
        const high = Number(c[2]) || 0;
        const low = Number(c[3]) || 0;
        const close = Number(c[4]) || 0;
        const volume = Number(c[5]) || 0;
        if (close <= 0) continue;

        try {
          await dbRun(db, `
            INSERT OR REPLACE INTO IntradayCandles (symbol, candle_time, interval, open, high, low, close, volume, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPSTOX')
          `, [symbol, candleTime, interval, open, high, low, close, volume]);
          stored++;
        } catch {}
      }

      return { symbol, interval, stored };
    } catch (err: any) {
      return { symbol, interval, stored: 0, error: err.message };
    }
  }

  /**
   * Batch fetch intraday candles for multiple symbols (today's data).
   * Respects rate limits with 300ms between chunks of 5.
   */
  public async batchFetchIntraday(
    symbols: string[],
    interval: '15m' | '30m' | '1h' = '15m'
  ): Promise<{
    totalStored: number;
    failures: string[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    let totalStored = 0;
    const failures: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    const CHUNK = 5;
    for (let i = 0; i < symbols.length; i += CHUNK) {
      const chunk = symbols.slice(i, i + CHUNK);

      const results = await Promise.all(
        chunk.map(sym => this.fetchIntradayCandles(sym, interval, today, today))
      );

      for (const r of results) {
        if (r.stored > 0) {
          totalStored += r.stored;
        } else if (r.error) {
          failures.push(r.symbol);
        }
      }

      if (i + CHUNK < symbols.length) {
        await this.sleepMs(300);
      }
    }

    return { totalStored, failures, durationMs: Date.now() - startTime };
  }
}
