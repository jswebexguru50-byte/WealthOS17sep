process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import sqlite3 from 'sqlite3';
import { dbAll, dbRun, dbGet, getDB, runInDbLock } from './database.js';
import { formatDate, parseDate, runFIFO } from './fifoEngine.js';
import { persistRefreshStamp } from './refreshState.js';

export async function safeJsonFromResponse<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trim().length === 0) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`[SafeJSON] Failed to parse JSON response (status ${res.status}):`, err);
    return null;
  }
}

export interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        currency: string;
        exchangeName: string;
        instrumentType: string;
        regularMarketPrice: number;
        chartPreviousClose: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: number[];
        }>;
      };
      events?: {
        dividends?: Record<string, {
          amount: number;
          date: number;
        }>;
        splits?: Record<string, {
          numerator: number;
          denominator: number;
          splitRatio: string;
          date: number;
        }>;
      };
    }>;
    error: any;
  };
}

export function getYahooSymbol(symbol: string, exchange: string = 'NSE', isin?: string): string {
  let s = symbol.trim().toUpperCase();
  if (s.startsWith('^')) return s;
  if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
  if (s.includes('=') || s.endsWith('.NYB') || s.includes('-Y.')) return s;

  if (s === 'EKIGREEN' || s === 'EKI' || isin === 'INE0CPR01018' || isin === 'INE00L001017') return 'EKI.BO';
  if (s === 'TELEGE' || isin === 'INE0SRP01014') return 'TELEGE.BO';
  if (s === 'LANDMARK' || s === 'LGLL' || isin === 'INE12QA01010') return 'LGLL.BO';
  if (s === 'DESCO' || isin === 'INE0TGG01014') return 'DESCO.BO';
  if (s === 'COSMICCRF' || isin === 'INE0ORA01015') return '543928.BO';
  if (s === 'KALYANICAST' || isin === 'INE0N6U01018') return 'KALYANICAST.BO';
  if (s === 'MRPAGRO' || isin === 'INE0D7801012') return 'MRPAGRO.BO';
  if (s === 'ANLON' || isin === 'INE0LR101013') return 'ANLON.NS';
  if (s === 'CGRAPHICS' || isin === 'INE0R7401011') return 'CGRAPHICS.NS';
  if (s === 'FELIX' || isin === 'INE056Z01011' || isin === 'INE901X01013') return 'FELIX.NS';
  if (s === 'GSMFOILS' || isin === 'INE0T1501013' || isin === 'INE0SQY01018') return 'GSMFOILS.NS';
  if (s === 'NEPHROCARE' || isin === 'INE0SUN01013') return 'NEPHROCARE.NS';
  if (s === 'ORIANA' || isin === 'INE0OUT01019') return 'ORIANA.NS';
  if (s === 'SJLOGISTIC' || isin === 'INE0F3301020') return 'SJLOGISTIC.NS';
  if (s === 'SONUINFRA' || isin === 'INE0JZA01018') return 'SONUINFRA.NS';
  if (s === 'FEDERAL BANK LTD' || s === 'FEDERAL BANK') return 'FEDERALBNK.NS';
  if (s === 'LARSEN AND TOUBRO LTD' || s === 'LARSEN & TOUBRO LTD' || s === 'LARSEN AND TOUBRO') return 'LT.NS';
  if (s === 'MAHINDRA AND MAHINDRA LTD' || s === 'MAHINDRA & MAHINDRA LTD' || s === 'MAHINDRA AND MAHINDRA') return 'M&M.NS';
  if (s === 'TATA POWER CO LTD' || s === 'TATA POWER COMPANY LTD') return 'TATAPOWER.NS';
  
  if (isin && isin.trim().toUpperCase().startsWith('US')) {
    return s;
  }

  const ex = (exchange || 'NSE').trim().toUpperCase();
  if (ex === 'NYSE' || ex === 'NASDAQ' || ex === 'AMEX' || ex === 'US' || ex === 'USA') {
    return s;
  }

  const US_TICKERS = new Set([
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'VOO',
    'VGT', 'SCHG', 'MET', 'BRK.B', 'BRK.A', 'IVV', 'VTI', 'IWM', 'DIA', 'AMD',
    'META', 'NFLX', 'INTC', 'CRM', 'ORCL', 'IBM', 'CSCO', 'QCOM', 'TXN', 'BAC',
    'JPM', 'WFC', 'C', 'GS', 'MS', 'V', 'MA', 'AXP', 'UNH', 'JNJ', 'PFE', 'ABBV'
  ]);
  if (US_TICKERS.has(s)) {
    return s;
  }
  
  if (ex === 'BSE' || /^\d+$/.test(s)) {
    return `${s}.BO`;
  }
  return `${s}.NS`;
}

export async function getAlpacaCredentials(): Promise<{ key: string | null; secret: string | null }> {
  let key = process.env.ALPACA_API_KEY || null;
  let secret = process.env.ALPACA_SECRET_KEY || null;
  try {
    const db = getDB();
    if (!key) {
      const row = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'Alpaca_Key'");
      key = row?.value || null;
    }
    if (!secret) {
      const row = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'Alpaca_Secret'");
      secret = row?.value || null;
    }
  } catch (e) {}
  return { key, secret };
}

export async function fetchAlpacaTickerData(symbol: string, daysBack: number = 365 * 5): Promise<any | null> {
  const { key, secret } = await getAlpacaCredentials();
  if (!key || !secret) return null;

  try {
    const cleanSym = symbol.trim().toUpperCase();
    const fromDateObj = new Date();
    fromDateObj.setDate(fromDateObj.getDate() - daysBack);
    const startIso = fromDateObj.toISOString();

    console.log(`[Alpaca] Fetching US market data bars for ${cleanSym}...`);
    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(cleanSym)}&timeframe=1Day&start=${encodeURIComponent(startIso)}`;
    const res = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
        'Accept': 'application/json'
      }
    });

    if (res.ok) {
      const json = await safeJsonFromResponse<any>(res);
      if (!json) return null;
      const bars = json.bars?.[cleanSym];
      if (Array.isArray(bars) && bars.length > 0) {
        const closePrices: Array<{ date: string; close: number }> = [];
        for (const b of bars) {
          if (b.t && typeof b.c === 'number' && b.c > 0) {
            const dateStr = String(b.t).split('T')[0];
            closePrices.push({ date: dateStr, close: b.c });
          }
        }

        if (closePrices.length > 0) {
          const latestPrice = closePrices[closePrices.length - 1].close;
          const prevClose = closePrices.length > 1 ? closePrices[closePrices.length - 2].close : latestPrice;
          const finalResult = {
            symbol: cleanSym,
            regularMarketPrice: latestPrice,
            chartPreviousClose: prevClose,
            closePrices,
            dividends: [],
            splits: [],
            dataSource: 'Alpaca Market Data API'
          };
          saveHistoricalPricesToDB(cleanSym, closePrices, 'Alpaca Market Data API').catch(() => {});
          return finalResult;
        }
      }
    }
  } catch (err) {
    console.log(`[Alpaca] Notice: Info fetching ticker data for ${symbol}:`, err);
  }
  return null;
}

export async function getUpstoxAccessToken(): Promise<string | null> {
  if (process.env.UPSTOX_ACCESS_TOKEN) {
    return process.env.UPSTOX_ACCESS_TOKEN;
  }
  try {
    const db = getDB();
    const row = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'Access_Token'");
    
    return row?.value || null;
  } catch (err) {
    console.log('[Upstox] Info: No token from AppConfig db');
    return null;
  }
}

export async function getIsinForSymbol(symbol: string): Promise<string | null> {
  const db = getDB();
  try {
    let row = await dbGet(db, 'SELECT isin FROM Holdings WHERE symbol = ?', [symbol]);
    if (row?.isin) return row.isin;
    
    row = await dbGet(db, 'SELECT isin FROM MasterTickers WHERE symbol = ?', [symbol]);
    if (row?.isin) return row.isin;
    
    row = await dbGet(db, 'SELECT isin FROM Transactions WHERE symbol = ? LIMIT 1', [symbol]);
    if (row?.isin) return row.isin;
  } catch (err) {
    console.log(`[Upstox] Info looking up ISIN for ${symbol}`);
  } finally {
    try {  } catch {}
  }
  return null;
}

export function isValidISIN(isin: string | null | undefined): boolean {
  if (!isin) return false;
  const cleaned = isin.trim().toUpperCase();
  return cleaned.startsWith('IN') && cleaned.length === 12 && /^[A-Z0-9]{12}$/.test(cleaned);
}

export function mapSymbolToUpstoxKey(symbol: string, isin?: string | null, exchange?: string | null): string | null {
  const s = symbol.trim().toUpperCase();
  const ex = (exchange === 'BSE' || s.endsWith('.BO') || /^\d{5,6}$/.test(s)) ? 'BSE' : 'NSE';
  
  if (s === '^NSEI') return 'NSE_INDEX|Nifty 50';
  if (s === '^BSESN') return 'BSE_INDEX|SENSEX';
  if (s === '^NSEMDCP100' || s === '^CNXMID') return 'NSE_INDEX|Nifty Midcap 100';
  if (s === '^NSESCP100' || s === '^CNXSC') return 'NSE_INDEX|Nifty Smallcap 100';
  
  if (s.startsWith('^')) {
    const name = s.replace('^', '');
    return `${ex}_INDEX|${name}`;
  }
  
  if (isin && isValidISIN(isin)) {
    return `${ex}_EQ|${isin.trim().toUpperCase()}`;
  }

  // Pure numeric BSE codes without ISIN cannot be directly mapped to Upstox candle endpoints
  if (/^\d{5,6}$/.test(s)) {
    return null;
  }
  
  return null;
}

const tickerDataCache = new Map<string, any>();
const failedUpstoxCandleSymbols = new Set<string>();
const failedUpstoxCAs = new Set<string>();
const failedYahooSymbols = new Set<string>();

export function clearTickerCache() {
  tickerDataCache.clear();
  failedUpstoxCandleSymbols.clear();
  failedUpstoxCAs.clear();
  failedYahooSymbols.clear();
  console.log('[Cache] In-memory ticker cache successfully cleared.');
}


async function saveHistoricalPricesToDB(symbol: string, closePrices: Array<{ date: string; close: number }>, dataSource: string) {
  if (!closePrices || closePrices.length === 0) return;
  try {
    const db = getDB();
    const valid = closePrices.filter(cp => cp.date && !isNaN(cp.close) && cp.close > 0);
    if (valid.length === 0) return;

    // Batch INSERT â€” 500 rows per statement instead of one-at-a-time
    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const slice = valid.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '(?, ?, ?, ?, CURRENT_TIMESTAMP)').join(',');
      const values: any[] = [];
      for (const cp of slice) values.push(symbol, cp.date, cp.close, dataSource);
      await dbRun(
        db,
        `INSERT OR REPLACE INTO HistoricalPrices (symbol, date, close_price, data_source, updated_at) VALUES ${placeholders}`,
        values
      ).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to save historical prices:', err);
  }
}

export async function fetchTickerData(symbol: string, daysBack: number = 365 * 5, forceRefresh: boolean = true): Promise<any> {
  const db = getDB();
  let exchange = 'NSE';
  let isin = '';
  try {
    const tRow = await dbGet(db, 'SELECT exchange, isin FROM MasterTickers WHERE symbol = ? OR isin = ?', [symbol, symbol]);
    if (tRow?.exchange) exchange = tRow.exchange;
    if (tRow?.isin) isin = tRow.isin;
  } catch (e) {}

  if (!isin) {
    try {
      const hRow = await dbGet(db, 'SELECT isin, portfolio FROM Holdings WHERE symbol = ? LIMIT 1', [symbol]);
      if (hRow?.isin) isin = hRow.isin;
      if (hRow?.portfolio === 'US - IBKR' || (isin && isin.startsWith('US'))) {
        exchange = 'US';
      }
    } catch (e) {}
  }

  const yfSymbol = getYahooSymbol(symbol, exchange, isin);
  const cacheKey = `${yfSymbol}_${daysBack}`;
  if (!forceRefresh && tickerDataCache.has(cacheKey)) {
    return tickerDataCache.get(cacheKey);
  }
  if (!forceRefresh && (failedYahooSymbols.has(yfSymbol) || failedYahooSymbols.has(symbol))) {
    return null;
  }

  // 0. Try Alpaca Market Data API for US assets
  const isUsAsset = (isin && isin.startsWith('US')) || exchange === 'US' || exchange === 'NYSE' || exchange === 'NASDAQ' || exchange === 'AMEX';
  if (isUsAsset) {
    const alpacaData = await fetchAlpacaTickerData(symbol, daysBack);
    if (alpacaData) {
      tickerDataCache.set(cacheKey, alpacaData);
      return alpacaData;
    }
  }

  const fromDateObj = new Date();
  fromDateObj.setDate(fromDateObj.getDate() - daysBack);
  const fromDateStr = fromDateObj.toISOString().split('T')[0];

  // 2. Query Yahoo Finance Chart API as Primary Feed for Official 30-min VWAP Settlement Close (Zerodha Standard)
  const end = Math.floor(Date.now() / 1000);
  const start = end - (daysBack * 24 * 60 * 60);
  
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${yfSymbol}?period1=${start}&period2=${end}&interval=1d&events=div|split`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${yfSymbol}?period1=${start}&period2=${end}&interval=1d&events=div|split`
  ];
  
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      if (res.ok) {
        const json = await safeJsonFromResponse<YahooChartResponse>(res);
        const result = json?.chart?.result?.[0];
        if (result) {
          const meta = result.meta;
          const timestamps = result.timestamp || [];
          const quote: any = result.indicators?.quote?.[0] || {};
          const closes = quote.close || [];
          const opens = quote.open || [];
          const highs = quote.high || [];
          const lows = quote.low || [];
          const volumes = quote.volume || [];

          const closePrices: Array<{ date: string; close: number; open?: number; high?: number; low?: number; volume?: number }> = [];
          for (let i = 0; i < timestamps.length; i++) {
            if (timestamps[i] && typeof closes[i] === 'number' && closes[i] > 0) {
              const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
              closePrices.push({
                date: dateStr,
                close: closes[i],
                open: typeof opens[i] === 'number' && opens[i] > 0 ? opens[i] : closes[i],
                high: typeof highs[i] === 'number' && highs[i] > 0 ? highs[i] : closes[i],
                low: typeof lows[i] === 'number' && lows[i] > 0 ? lows[i] : closes[i],
                volume: typeof volumes[i] === 'number' && volumes[i] >= 0 ? volumes[i] : 0
              });
            }
          }

          // meta.regularMarketPrice = live price from Yahoo (always current)
          // closePrices array = historical daily closes
          const metaLivePrice = (meta?.regularMarketPrice && meta.regularMarketPrice > 0) ? meta.regularMarketPrice : null;
          const lastDailyClose = closePrices.length > 0 ? closePrices[closePrices.length - 1].close : null;
          const prevDayClose = closePrices.length > 1 ? closePrices[closePrices.length - 2].close : (meta?.chartPreviousClose || lastDailyClose || null);

          // SME / Discrepancy protection: If metaLivePrice deviates by >30% from lastDailyClose, metaLivePrice is stale/unadjusted
          const isDiscrepant = metaLivePrice && lastDailyClose && (metaLivePrice / lastDailyClose > 1.3 || metaLivePrice / lastDailyClose < 0.7);
          const effectiveMarketPrice = (isDiscrepant || !metaLivePrice) ? lastDailyClose : metaLivePrice;

          const finalResult = {
            symbol: yfSymbol,
            regularMarketPrice: effectiveMarketPrice || lastDailyClose || prevDayClose,
            chartPreviousClose: prevDayClose || lastDailyClose,
            closePrices,
            dividends: [],
            splits: [],
            dataSource: 'Yahoo Finance'
          };

          tickerDataCache.set(cacheKey, finalResult);
          if (closePrices.length > 0) {
            saveHistoricalPricesToDB(yfSymbol, closePrices, 'Yahoo Finance').catch(() => {});
            const cleanSym = symbol.replace('.NS', '').replace('.BO', '');
            if (cleanSym !== yfSymbol) {
              saveHistoricalPricesToDB(cleanSym, closePrices, 'Yahoo Finance').catch(() => {});
            }
          }
          return finalResult;
        }
      }
    } catch (err) {}
  }

  // 3. Upstox Historical Daily Candles Fallback if Yahoo Finance is unavailable
  const instKey = (isin && isin.startsWith('IN')) ? `NSE_EQ|${isin}` : '';
  const upstoxToken = await getUpstoxAccessToken();
  if (upstoxToken && instKey && !failedUpstoxCandleSymbols.has(symbol) && !failedUpstoxCandleSymbols.has(instKey)) {
    try {
      const fromIso = fromDateObj.toISOString().split('T')[0];
      const toIso = new Date().toISOString().split('T')[0];
      const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instKey)}/day/${toIso}/${fromIso}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${upstoxToken}`,
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const json = await safeJsonFromResponse<any>(res);
        const candles = json?.data?.candles;
        if (Array.isArray(candles) && candles.length > 0) {
          const closePrices: Array<{ date: string; close: number }> = [];
          for (let i = candles.length - 1; i >= 0; i--) {
            const c = candles[i];
            if (c[0] && typeof c[4] === 'number') {
              const dateStr = String(c[0]).split('T')[0];
              closePrices.push({ date: dateStr, close: c[4] });
            }
          }
          if (closePrices.length > 0) {
            const latestPrice = closePrices[closePrices.length - 1].close;
            const prevClose = closePrices.length > 1 ? closePrices[closePrices.length - 2].close : latestPrice;
            const finalResult = {
              symbol: symbol,
              regularMarketPrice: latestPrice,
              chartPreviousClose: prevClose,
              closePrices,
              dividends: [],
              splits: [],
              dataSource: 'Upstox API'
            };
            tickerDataCache.set(cacheKey, finalResult);
            await saveHistoricalPricesToDB(symbol, closePrices, 'Upstox API');
            return finalResult;
          }
        }
      }
    } catch (err) {}
  }

  // 4. Fallback to SQLite DB historical prices if network queries fail
  try {
    const fallbackRows = await dbAll(db, "SELECT date, close_price, data_source FROM HistoricalPrices WHERE symbol = ? ORDER BY date ASC", [symbol]);
    if (fallbackRows && fallbackRows.length > 0) {
      const closePrices = fallbackRows.map(r => ({ date: r.date, close: r.close_price }));
      const latestPrice = closePrices[closePrices.length - 1].close;
      const prevClose = closePrices.length > 1 ? closePrices[closePrices.length - 2].close : latestPrice;
      return {
        symbol: symbol,
        regularMarketPrice: latestPrice,
        chartPreviousClose: prevClose,
        closePrices,
        dividends: [],
        splits: [],
        dataSource: 'HistoricalPrices Cache'
      };
    }
  } catch (err) {}

  return null;
}

export async function fetchHistoricalYahooEvents(symbol: string, exchange: string = 'NSE', daysBack: number = 365 * 20): Promise<{ dividends: any[], splits: any[] }> {
  const yfSymbol = getYahooSymbol(symbol, exchange);
  const end = Math.floor(Date.now() / 1000);
  const start = end - (daysBack * 24 * 60 * 60);
  
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yfSymbol}?period1=${start}&period2=${end}&interval=1d&events=div|split`;
  console.log(`[Yahoo Events] Fetching historical corporate actions for ${symbol} (${yfSymbol}) from Yahoo Finance (daysBack: ${daysBack})...`);
  
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`[Yahoo Events] No events found on Yahoo Finance for ${yfSymbol} (HTTP 404)`);
      } else {
        console.log(`[Yahoo Events] Non-critical: Could not fetch events for ${yfSymbol} (HTTP ${res.status})`);
      }
      return { dividends: [], splits: [] };
    }
    
    const data = await res.json() as YahooChartResponse;
    const result = data.chart.result?.[0];
    if (!result) return { dividends: [], splits: [] };
    
    const dividends: Array<{ date: string; amount: number }> = [];
    if (result.events?.dividends) {
      for (const item of Object.values(result.events.dividends)) {
        dividends.push({
          date: formatDate(new Date(item.date * 1000)),
          amount: item.amount
        });
      }
    }
    
    const splits: Array<{ date: string; numerator: number; denominator: number }> = [];
    if (result.events?.splits) {
      for (const item of Object.values(result.events.splits)) {
        splits.push({
          date: formatDate(new Date(item.date * 1000)),
          numerator: item.numerator,
          denominator: item.denominator
        });
      }
    }
    
    return { dividends, splits };
  } catch (err) {
    console.log(`[Yahoo Events] Non-critical info fetching events for ${yfSymbol}:`, err instanceof Error ? err.message : err);
    return { dividends: [], splits: [] };
  }
}

export interface UpstoxCorporateActionsResult {
  dividends: Array<{ date: string; amount: number; details: string }>;
  splits: Array<{ date: string; numerator: number; denominator: number; details: string }>;
  bonuses: Array<{ date: string; numerator: number; denominator: number; details: string }>;
  demergers: Array<{ date: string; details: string }>;
}

function parseRatioHelper(str?: string | null): { numerator: number; denominator: number } {
  if (!str) return { numerator: 1, denominator: 1 };
  const clean = String(str).trim();
  const match = clean.match(/(\d+)\s*(?::|for|to|\/)\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const den = parseInt(match[2], 10);
    if (!isNaN(num) && !isNaN(den) && num > 0 && den > 0) {
      return { numerator: num, denominator: den };
    }
  }
  return { numerator: 1, denominator: 1 };
}

function parseDateToISOHelper(dStr?: string | null): string | null {
  if (!dStr) return null;
  const clean = dStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

export async function fetchUpstoxCorporateActions(isin: string, token: string): Promise<UpstoxCorporateActionsResult> {
  if (!isin || isin.includes('UNKNOWN') || failedUpstoxCAs.has(isin.trim().toUpperCase())) {
    return { dividends: [], splits: [], bonuses: [], demergers: [] };
  }

  const cleanIsin = isin.trim().toUpperCase();
  const url = `https://api.upstox.com/v2/fundamentals/${encodeURIComponent(cleanIsin)}/corporate-actions`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(1200),
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      failedUpstoxCAs.add(cleanIsin);
      return { dividends: [], splits: [], bonuses: [], demergers: [] };
    }

    const json = await res.json() as any;
    if (json.status !== 'success' || !Array.isArray(json.data)) {
      return { dividends: [], splits: [], bonuses: [], demergers: [] };
    }

    const dividends: Array<{ date: string; amount: number; details: string }> = [];
    const splits: Array<{ date: string; numerator: number; denominator: number; details: string }> = [];
    const bonuses: Array<{ date: string; numerator: number; denominator: number; details: string }> = [];
    const demergers: Array<{ date: string; details: string }> = [];

    for (const item of json.data) {
      const name = String(item.name || '').trim().toLowerCase();
      let recordDate = '';
      let exDate = '';
      let detailsText = '';
      let amt = Number(item.amount) || 0;
      let ratioStr = item.ratio ? String(item.ratio).trim() : '';

      if (Array.isArray(item.event_details)) {
        for (const ed of item.event_details) {
          const edName = String(ed.name || '').trim().toLowerCase();
          const edVal = String(ed.value || '').trim();
          if (edName.includes('record date') && edVal) recordDate = edVal;
          else if (edName.includes('ex') && edName.includes('date') && edVal) exDate = edVal;
          else if (edName === 'details' && edVal) detailsText = edVal;
          else if (edName === 'amount' && edVal && !amt) amt = parseFloat(edVal) || 0;
          else if (edName === 'ratio' && edVal && !ratioStr) ratioStr = edVal;
        }
      }

      const targetDate = recordDate || exDate || item.expiry_date;
      if (!targetDate) continue;
      const isoDate = parseDateToISOHelper(targetDate);
      if (!isoDate) continue;

      if (name.includes('dividend')) {
        dividends.push({ date: isoDate, amount: amt, details: detailsText || `Dividend â‚¹${amt}` });
      } else if (name.includes('bonus')) {
        const { numerator, denominator } = parseRatioHelper(ratioStr || detailsText);
        bonuses.push({ date: isoDate, numerator, denominator, details: detailsText || `Bonus ${ratioStr}` });
      } else if (name.includes('split')) {
        const { numerator, denominator } = parseRatioHelper(ratioStr || detailsText);
        splits.push({ date: isoDate, numerator, denominator, details: detailsText || `Split ${ratioStr}` });
      } else if (name.includes('demerger') || name.includes('spin')) {
        demergers.push({ date: isoDate, details: detailsText || item.name });
      }
    }

    return { dividends, splits, bonuses, demergers };
  } catch (err) {
    failedUpstoxCAs.add(cleanIsin);
    console.log(`[Upstox CAs] Corporate actions for ${isin} unavailable (${err instanceof Error ? err.message : err}). Skipping.`);
    return { dividends: [], splits: [], bonuses: [], demergers: [] };
  }
}

export interface CombinedCorporateAction {
  record_date: string;
  symbol: string;
  isin: string;
  action_type: 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'DEMERGER';
  dividend_per_share?: number | null;
  numerator?: number | null;
  denominator?: number | null;
  details?: string | null;
  source: string;
}

export async function fetchNSECorporateActions(symbol: string): Promise<CombinedCorporateAction[]> {
  try {
    const cleanSym = symbol.trim().toUpperCase();
    const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(cleanSym)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/'
      }
    });

    if (!res.ok) return [];
    const json = await safeJsonFromResponse<any[]>(res);
    if (!Array.isArray(json)) return [];

    const results: CombinedCorporateAction[] = [];
    for (const ca of json) {
      const subject = String(ca.subject || '').trim();
      const isin = ca.isin || '';
      const dateParts = ca.exDate ? ca.exDate.split('-') : (ca.recDate ? ca.recDate.split('-') : []);
      if (dateParts.length !== 3) continue;

      const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
      const isoDate = `${dateParts[2]}-${months[dateParts[1]] || '01'}-${dateParts[0].padStart(2, '0')}`;

      if (subject.toLowerCase().includes('split') || subject.toLowerCase().includes('sub-division')) {
        const match = subject.match(/Rs\s*(\d+).*?Re[s]?\s*(\d+)/i) || subject.match(/(\d+).*?to.*?(\d+)/i);
        let num = 10;
        let den = 1;
        if (match) {
          const oldFv = parseInt(match[1], 10);
          const newFv = parseInt(match[2], 10);
          if (oldFv > 0 && newFv > 0) num = Math.round(oldFv / newFv);
        }
        results.push({
          record_date: isoDate,
          symbol: cleanSym,
          isin,
          action_type: 'SPLIT',
          numerator: num,
          denominator: den,
          details: subject,
          source: 'NSE India Official API'
        });
      } else if (subject.toLowerCase().includes('dividend')) {
        const match = subject.match(/Re[s]?\s*([\d.]+)/i) || subject.match(/Rs\s*([\d.]+)/i);
        const divAmt = match ? parseFloat(match[1]) : 0;
        results.push({
          record_date: isoDate,
          symbol: cleanSym,
          isin,
          action_type: 'DIVIDEND',
          dividend_per_share: divAmt,
          details: subject,
          source: 'NSE India Official API'
        });
      }
    }
    return results;
  } catch (e) {
    return [];
  }
}

export function combineAndDeduplicateCAs(
  symbol: string,
  isin: string,
  yahooCAs: { dividends: any[]; splits: any[] },
  upstoxCAs: UpstoxCorporateActionsResult
): CombinedCorporateAction[] {
  const combined: CombinedCorporateAction[] = [];

  const isDateMatch = (d1: string, d2: string) => {
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    if (isNaN(t1) || isNaN(t2)) return d1 === d2;
    return Math.abs(t1 - t2) <= 14 * 86400000;
  };

  // 1. Process Dividends
  const upstoxDivsMatched = new Set<number>();
  for (const yDiv of (yahooCAs.dividends || [])) {
    let matchedIdx = -1;
    for (let idx = 0; idx < (upstoxCAs.dividends || []).length; idx++) {
      if (upstoxDivsMatched.has(idx)) continue;
      const uDiv = upstoxCAs.dividends[idx];
      if (isDateMatch(yDiv.date, uDiv.date)) {
        matchedIdx = idx;
        break;
      }
    }

    if (matchedIdx !== -1) {
      upstoxDivsMatched.add(matchedIdx);
      const uDiv = upstoxCAs.dividends[matchedIdx];
      combined.push({
        record_date: uDiv.date || yDiv.date,
        symbol,
        isin,
        action_type: 'DIVIDEND',
        dividend_per_share: uDiv.amount || yDiv.amount,
        details: uDiv.details || `Dividend â‚¹${yDiv.amount}`,
        source: 'Yahoo Finance + Upstox API'
      });
    } else {
      combined.push({
        record_date: yDiv.date,
        symbol,
        isin,
        action_type: 'DIVIDEND',
        dividend_per_share: yDiv.amount,
        details: `Dividend â‚¹${yDiv.amount}`,
        source: 'Yahoo Finance'
      });
    }
  }

  for (let idx = 0; idx < (upstoxCAs.dividends || []).length; idx++) {
    if (!upstoxDivsMatched.has(idx)) {
      const uDiv = upstoxCAs.dividends[idx];
      combined.push({
        record_date: uDiv.date,
        symbol,
        isin,
        action_type: 'DIVIDEND',
        dividend_per_share: uDiv.amount,
        details: uDiv.details || `Dividend â‚¹${uDiv.amount}`,
        source: 'Upstox API'
      });
    }
  }

  // 2. Process Splits
  const upstoxSplitsMatched = new Set<number>();
  for (const ySpl of (yahooCAs.splits || [])) {
    let matchedIdx = -1;
    for (let idx = 0; idx < (upstoxCAs.splits || []).length; idx++) {
      if (upstoxSplitsMatched.has(idx)) continue;
      const uSpl = upstoxCAs.splits[idx];
      if (isDateMatch(ySpl.date, uSpl.date)) {
        matchedIdx = idx;
        break;
      }
    }

    if (matchedIdx !== -1) {
      upstoxSplitsMatched.add(matchedIdx);
      const uSpl = upstoxCAs.splits[matchedIdx];
      combined.push({
        record_date: uSpl.date || ySpl.date,
        symbol,
        isin,
        action_type: 'SPLIT',
        numerator: uSpl.numerator || ySpl.numerator,
        denominator: uSpl.denominator || ySpl.denominator,
        details: uSpl.details || `Stock Split ${ySpl.numerator}:${ySpl.denominator}`,
        source: 'Yahoo Finance + Upstox API'
      });
    } else {
      combined.push({
        record_date: ySpl.date,
        symbol,
        isin,
        action_type: 'SPLIT',
        numerator: ySpl.numerator,
        denominator: ySpl.denominator,
        details: `Stock Split ${ySpl.numerator}:${ySpl.denominator}`,
        source: 'Yahoo Finance'
      });
    }
  }

  for (let idx = 0; idx < (upstoxCAs.splits || []).length; idx++) {
    if (!upstoxSplitsMatched.has(idx)) {
      const uSpl = upstoxCAs.splits[idx];
      combined.push({
        record_date: uSpl.date,
        symbol,
        isin,
        action_type: 'SPLIT',
        numerator: uSpl.numerator,
        denominator: uSpl.denominator,
        details: uSpl.details || `Stock Split ${uSpl.numerator}:${uSpl.denominator}`,
        source: 'Upstox API'
      });
    }
  }

  // 3. Process Bonuses
  for (const uBon of (upstoxCAs.bonuses || [])) {
    combined.push({
      record_date: uBon.date,
      symbol,
      isin,
      action_type: 'BONUS',
      numerator: uBon.numerator,
      denominator: uBon.denominator,
      details: uBon.details || `Bonus Issue ${uBon.numerator}:${uBon.denominator}`,
      source: 'Upstox API'
    });
  }

  // 4. Process Demergers
  for (const uDem of (upstoxCAs.demergers || [])) {
    combined.push({
      record_date: uDem.date,
      symbol,
      isin,
      action_type: 'DEMERGER',
      details: uDem.details || 'Demerger / Spin-off',
      source: 'Upstox API'
    });
  }

  return combined;
}

// === PERFORMANCE: Cache known-invalid Upstox instrument keys to avoid repeated 400 errors ===
const invalidUpstoxKeys = new Set<string>();

let isMarketFetchInProgress = false;
let lastMarketFetchCompletedAt = 0;
let activeMarketFetchPromise: Promise<any> | null = null;


/**
 * Checks if current time is within Indian Stock Market trading hours.
 * Indian Market Trading Session: 09:15 AM to 03:30 PM IST (Mon-Fri)
 * Buffer: 09:00 AM to 03:35 PM IST
 */
export function isIndianMarketHours(now: Date = new Date()): boolean {
  try {
    // Convert to IST (UTC + 5 hours 30 minutes = 330 mins)
    const istTime = new Date(now.getTime() + 330 * 60 * 1000);
    const day = istTime.getUTCDay(); // 0 = Sun, 6 = Sat
    if (day === 0 || day === 6) return false;

    const hour = istTime.getUTCHours();
    const minute = istTime.getUTCMinutes();
    const timeInMinutes = hour * 60 + minute;

    const marketOpen = 9 * 60 + 15;   // 09:15 AM IST
    const marketClose = 15 * 60 + 30; // 03:30 PM IST

    return timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
  } catch {
    return false;
  }
}

/**
 * Self-healing binary-search batch fetch for Upstox LTP.
 * When a batch fails (HTTP 400), splits in half and retries each sub-batch.
 * Invalid individual keys are permanently cached to avoid future slowdowns.
 */
async function fetchUpstoxLTPBatch(
  keys: string[],
  token: string,
  results: Record<string, { ltp: number; prevClose?: number }>
): Promise<void> {
  if (keys.length === 0) return;

  const symbolParam = keys.join(',');
  try {
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(symbolParam)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    if (res.ok) {
      const json = await res.json() as any;
      if (json.status === 'success' && json.data) {
        for (const [key, details] of Object.entries(json.data)) {
          const val = details as any;
            if (val && typeof val.last_price === 'number') {
            let prevClose: number | undefined = undefined;
            // Force parseFloat to preserve decimal precision â€” prevents integer coercion
            const rawLtp = parseFloat(String(val.last_price));
            if (typeof val.net_change === 'number' && Math.abs(val.net_change) > 1e-4) {
              prevClose = parseFloat(String(val.last_price - val.net_change));
            } else if (typeof val.cp === 'number' && val.cp > 0) {
              prevClose = parseFloat(String(val.cp));
            } else if (typeof val.ohlc?.close === 'number' && val.ohlc.close > 0) {
              prevClose = parseFloat(String(val.ohlc.close));
            }

            // LTP (Last Traded Price) must reflect actual trades from exchange, not order book ask depth
            let effectiveLtp = rawLtp;

            const itemRes = { ltp: effectiveLtp, prevClose };
            results[key] = itemRes;
            results[key.replace(':', '|')] = itemRes;
            results[key.replace('|', ':')] = itemRes;
            if (val.instrument_token) {
              results[val.instrument_token] = itemRes;
              results[val.instrument_token.replace('|', ':')] = itemRes;
              if (val.instrument_token.includes('|INE')) {
                const parts = val.instrument_token.split('|');
                if (parts[1] && (!results[parts[1]] || val.instrument_token.startsWith('NSE'))) {
                  results[parts[1]] = itemRes;
                }
              }
            }
            if (val.symbol && (!results[val.symbol.toUpperCase()] || key.startsWith('NSE'))) {
              results[val.symbol.toUpperCase()] = itemRes;
            }
            if (key.includes(':')) {
              const symPart = key.split(':')[1];
              if (symPart && (!results[symPart.toUpperCase()] || key.startsWith('NSE'))) {
                results[symPart.toUpperCase()] = itemRes;
              }
            }
          }
        }
      }
      return;
    }

    if (res.status === 429) {
      console.warn(`[Upstox] Rate limit hit (429). Waiting 2000ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchUpstoxLTPBatch(keys, token, results);
    }

    if (res.status === 400 && keys.length > 1) {
      const mid = Math.ceil(keys.length / 2);
      console.log(`[Upstox] Batch of ${keys.length} failed (400). Splitting into ${mid} + ${keys.length - mid}...`);
      await fetchUpstoxLTPBatch(keys.slice(0, mid), token, results);
      await fetchUpstoxLTPBatch(keys.slice(mid), token, results);
      return;
    } else if (res.status === 400 && keys.length === 1) {
      invalidUpstoxKeys.add(keys[0]);
      console.log(`[Upstox] Key ${keys[0]} permanently marked invalid (HTTP 400).`);
    }

    console.log(`[Upstox] Batch Quote returned HTTP ${res.status}. Skipping.`);
  } catch (err) {
    console.log(`[Upstox] Batch Quote fetch (${keys.length} keys) unavailable (${err instanceof Error ? err.message : err}).`);
  }
}

export async function syncMarketPrices(portfolioFilter?: string) {
  const db = getDB();
  return autoFetchMarketData(db, portfolioFilter);
}

export async function autoFetchMarketData(db: sqlite3.Database, portfolioFilter?: string): Promise<{
  pricesUpdated: number;
  caAdded: number;
  failedSymbols: string[];
}> {
  if (isMarketFetchInProgress) {
    console.log(`[Market Sync] Market fetch already in progress. Waiting for it to complete...`);
    if (activeMarketFetchPromise) {
      await activeMarketFetchPromise;
    }
    return { pricesUpdated: 0, caAdded: 0, failedSymbols: [] };
  }

  isMarketFetchInProgress = true;
  const syncStart = Date.now();
  let pricesUpdated = 0;
  let caAdded = 0;
  const failedSymbols: string[] = [];

  let resolveActivePromise: () => void;
  activeMarketFetchPromise = new Promise<void>(resolve => { resolveActivePromise = resolve; });

  try {
    const syncTimeStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${syncTimeStr}] Starting fast market data fetch (Filter portfolio: ${portfolioFilter || 'None'})...`);
    // clearTickerCache() removed: clearing on every 45s cycle caused cache thrash and duplicate Yahoo requests
    
    // 1. Fetch only active holdings (on-hand quantity > 0) from database
    let query = `
      SELECT DISTINCT 
        H.isin AS isin, 
        H.symbol AS symbol, 
        COALESCE(M.exchange, 'NSE') AS exchange
      FROM Holdings H
      LEFT JOIN MasterTickers M ON (H.isin IS NOT NULL AND H.isin != '' AND M.isin = H.isin)
      WHERE H.symbol IS NOT NULL AND H.symbol != '' AND H.quantity > 0
        AND H.symbol != 'CASH' AND NOT H.symbol LIKE 'CASH%' AND NOT H.isin LIKE 'CASH%'
    `;
    let params: any[] = [];

    const selectedPorts = portfolioFilter && portfolioFilter !== 'Combined' && portfolioFilter !== 'all' && portfolioFilter !== 'ALL'
      ? portfolioFilter.split(',').map(p => p.trim()).filter(Boolean)
      : null;

    if (selectedPorts && selectedPorts.length > 0) {
      const placeholders = selectedPorts.map(() => '?').join(',');
      query = `
        SELECT DISTINCT 
          H.isin AS isin, 
          H.symbol AS symbol, 
          COALESCE(M.exchange, 'NSE') AS exchange
        FROM Holdings H
        LEFT JOIN MasterTickers M ON (H.isin IS NOT NULL AND H.isin != '' AND M.isin = H.isin)
        WHERE H.symbol IS NOT NULL AND H.symbol != '' AND H.quantity > 0 
          AND H.symbol != 'CASH' AND NOT H.symbol LIKE 'CASH%' AND NOT H.isin LIKE 'CASH%'
          AND H.portfolio IN (${placeholders})
      `;
      params = [...selectedPorts];
    }

    const holdings = await dbAll(db, query, params);
    
    if (holdings.length === 0) {
      console.log('No holdings found to fetch market data.');
      return { pricesUpdated: 0, caAdded: 0, failedSymbols: [] };
    }

    // 2. Retrieve Upstox Access Token
    const tokenRow = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'Access_Token'");
    const upstoxToken = tokenRow?.value;

    // 2b. Resolve CUSTOM_* placeholder ISINs to real ISINs via MasterTickers name lookup
    const customIsinHoldings = holdings.filter(h => (h.isin || '').toUpperCase().startsWith('CUSTOM_'));
    if (customIsinHoldings.length > 0) {
      const allTickers = await dbAll(db, 'SELECT symbol, isin, name FROM MasterTickers WHERE isin IS NOT NULL AND isin != ""', []);
      for (const h of customIsinHoldings) {
        const symbolNorm = (h.symbol || '').toLowerCase().replace(/\s+/g, '').replace(/&/g, 'and');
        const match = allTickers.find(t => {
          const nameNorm = (t.name || '').toLowerCase().replace(/\s+/g, '').replace(/&/g, 'and').replace(/limited/g, '').replace(/ltd/g, '');
          const holdingNorm = symbolNorm.replace(/limited/g, '').replace(/ltd/g, '');
          return nameNorm.includes(holdingNorm.slice(0, 12)) || holdingNorm.includes(nameNorm.slice(0, 12));
        });
        if (match && match.isin) {
          h.isin = match.isin;
        }
      }
    }

    // 3. Batch fetch LTP from Upstox (Indian equities & ETFs)
    const upstoxLTPs: Record<string, { ltp: number; prevClose?: number }> = {};
    const instrumentKeys: string[] = [];

    for (const h of holdings) {
      const symbol = (h.symbol || '').toUpperCase();
      const isin = (h.isin || '').toUpperCase();
      if (symbol === 'CASH' || symbol.startsWith('CASH') || symbol.startsWith('UL') || (isin.startsWith('CUSTOM_') && symbol.includes(' '))) continue;
      if (isin.startsWith('CASH') || isin.startsWith('INF')) continue;
      
      if (isin && isValidISIN(isin)) {
        const cleanIsin = isin.trim().toUpperCase();
        // Always send both NSE and BSE keys to cover BSE-only listed stocks
        const nseKey = `NSE_EQ|${cleanIsin}`;
        const bseKey = `BSE_EQ|${cleanIsin}`;
        if (!invalidUpstoxKeys.has(nseKey)) {
          instrumentKeys.push(nseKey);
        }
        if (!invalidUpstoxKeys.has(bseKey)) {
          instrumentKeys.push(bseKey);
        }
      }
    }

    const isMarketOpenNow = isIndianMarketHours();
    if (upstoxToken && instrumentKeys.length > 0) {
      console.log(`[Upstox] Batch fetching LTP for ${instrumentKeys.length} equity instruments in parallel...`);
      const BATCH_SIZE = 100;
      const batchPromises: Promise<void>[] = [];
      for (let i = 0; i < instrumentKeys.length; i += BATCH_SIZE) {
        batchPromises.push(fetchUpstoxLTPBatch(instrumentKeys.slice(i, i + BATCH_SIZE), upstoxToken, upstoxLTPs));
      }
      await Promise.all(batchPromises);
      console.log(`[Upstox] Resolved ${Object.keys(upstoxLTPs).length} prices from Upstox.`);
    }

    // Separate active equity holdings from mutual funds
    const activeHoldings = holdings.filter(h => {
      const symbol = (h.symbol || '').toUpperCase();
      const isin = (h.isin || '').toUpperCase();
      return !(
        symbol === 'CASH' ||
        symbol.startsWith('CASH') ||
        isin === 'CASH' ||
        isin.startsWith('CASH') ||
        symbol.startsWith('UL') ||
        symbol.startsWith('UNLISTED') ||
        isin.startsWith('CUSTOM_') ||
        isin.startsWith('INF')
      );
    });

    const mutualFundHoldings = holdings.filter(h => {
      const isMfIsin = (isin: string) => isin && isin.toUpperCase().startsWith('INF');
      return isMfIsin(h.isin || '');
    });

    // Dynamic USD Rate
    let usdRate = 83.5;
    try {
      const usdRateRow = await dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'");
      if (usdRateRow && usdRateRow.rate_to_inr > 0) {
        usdRate = usdRateRow.rate_to_inr;
      }
    } catch (err) {}

    // 4. Update Equities (Smooth Chunking to avoid Rate Limits)
    const chunkSize = 15;
    for (let i = 0; i < activeHoldings.length; i += chunkSize) {
      const chunk = activeHoldings.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (h) => {
        const symbol = h.symbol;
        const isin = h.isin;
        const exchange = (h.exchange || 'NSE').trim().toUpperCase();
        const fetchSymbol = getYahooSymbol(symbol, exchange, isin);
        const instKey = isin && isValidISIN(isin) ? `${exchange === 'BSE' ? 'BSE' : 'NSE'}_EQ|${isin.trim().toUpperCase()}` : '';

        // Upstox Live Match
        const upMatch = (instKey && upstoxLTPs[instKey]) ||
                        (instKey && upstoxLTPs[instKey.replace('|', ':')]) ||
                        (isin && upstoxLTPs[`NSE_EQ|${isin}`]) ||
                        (isin && upstoxLTPs[`NSE_EQ:${isin}`]) ||
                        (symbol && upstoxLTPs[`NSE_EQ:${symbol}`]) ||
                        (symbol && upstoxLTPs[`NSE_EQ|${symbol}`]) ||
                        (isin && upstoxLTPs[isin]) ||
                        (symbol && upstoxLTPs[symbol]) ||
                        (isin && upstoxLTPs[`BSE_EQ|${isin}`]) ||
                        (isin && upstoxLTPs[`BSE_EQ:${isin}`]) ||
                        (symbol && upstoxLTPs[`BSE_EQ:${symbol}`]) ||
                        (symbol && upstoxLTPs[`BSE_EQ|${symbol}`]);

        // Only query Yahoo Finance Chart API if Upstox batch price was not found
        let tickerInfo: any = null;
        if (!upMatch || !upMatch.ltp || upMatch.ltp <= 0) {
          try {
            tickerInfo = await fetchTickerData(fetchSymbol, 5, true);
          } catch (err) {}

          if ((!tickerInfo || !tickerInfo.chartPreviousClose) && !fetchSymbol.endsWith('.BO') && !fetchSymbol.endsWith('.NS')) {
            try {
              tickerInfo = await fetchTickerData(`${fetchSymbol}.BO`, 5, true);
            } catch (err) {}
          }
        }

        const chartPrevClose = (tickerInfo?.chartPreviousClose && tickerInfo.chartPreviousClose > 0) ? tickerInfo.chartPreviousClose : null;
        const yahooMarketPrice = (tickerInfo?.regularMarketPrice && tickerInfo.regularMarketPrice > 0) ? tickerInfo.regularMarketPrice : null;

        const marketOpen = isIndianMarketHours();

        // Price resolution priority: Upstox LTP > Yahoo live price > Yahoo close > manual_ltp (MasterTickers fallback for unlisted)
        const upstoxLtp = upMatch?.ltp && upMatch.ltp > 0 ? upMatch.ltp : null;
        const upstoxPrevClose = upMatch?.prevClose && upMatch.prevClose > 0 ? upMatch.prevClose : null;

        // Live tick: best available current price
        let liveTick = upstoxLtp || yahooMarketPrice || chartPrevClose || 0;
        // Previous close: for day change calculation
        let officialClose = upstoxPrevClose || chartPrevClose || yahooMarketPrice || liveTick;

        // === UNLISTED ASSET FALLBACK: use manual_ltp from MasterTickers ===
        // When neither Upstox nor Yahoo returns a price (expected for unlisted/pre-IPO assets),
        // fall back to the manually entered price in the MasterTickers specification.
        if (!liveTick || liveTick <= 0) {
          try {
            const mtRow = await dbGet(db, 'SELECT manual_ltp FROM MasterTickers WHERE symbol = ? OR isin = ?', [symbol, isin || symbol]);
            if (mtRow?.manual_ltp && mtRow.manual_ltp > 0) {
              liveTick = mtRow.manual_ltp;
              officialClose = mtRow.manual_ltp;
            }
          } catch (_e) {}
        }

        if (!liveTick && !officialClose) {
          failedSymbols.push(symbol);
          return;
        }

        const targetLtp = liveTick;
        const targetPrevClose = (officialClose > 0 && officialClose !== targetLtp) ? officialClose : (chartPrevClose || targetLtp);

        const matchingHoldings = await dbAll(
          db,
          `SELECT rowid, portfolio, symbol, isin, folio, quantity, total_cost, native_total_cost, data_source, last_update 
           FROM Holdings 
           WHERE (isin = ? OR symbol = ?) AND quantity > 0
             AND (price_authority IS NULL OR price_authority = 'LIVE_FEED')`,
          [isin || symbol, symbol]
        );
        for (const mh of matchingHoldings) {
          const isUsAsset = mh.portfolio === 'US - IBKR' || (mh.isin && mh.isin.startsWith('US'));
          const rateToInr = isUsAsset ? usdRate : 1.0;

          const itemLtp = liveTick;
          const itemPrevClose = (officialClose > 0 && officialClose !== itemLtp) ? officialClose : (chartPrevClose || itemLtp);

          const nativeLtp = itemLtp;
          const convertedLtp = itemLtp * rateToInr;
          const nativePrevClose = itemPrevClose;
          const convertedPrevClose = itemPrevClose * rateToInr;

          const currentVal = mh.quantity * convertedLtp;
          const nativeCurrentVal = mh.quantity * nativeLtp;
          const holdingDayChg = (nativeLtp - nativePrevClose) * mh.quantity * rateToInr;
          const dayChgPct = nativePrevClose > 0 ? ((nativeLtp - nativePrevClose) / nativePrevClose) * 100 : 0;

          const unrealizedGain = currentVal - mh.total_cost;
          const unrealizedGainPct = mh.total_cost > 0 ? (unrealizedGain / mh.total_cost) * 100 : 0;
          const nativeUnrealizedGain = nativeCurrentVal - mh.native_total_cost;

          const isUnlistedAsset = symbol.toUpperCase().startsWith('UL') || 
                                symbol.toUpperCase().includes('UNLISTED') || 
                                symbol.toUpperCase().includes('SOLITARIO') || 
                                (isin && isin.toUpperCase().startsWith('CUSTOM_'));

          let dataSrc = 'Master Ticker / Manual';
          let dataStatus = 'STALE';

          if (upMatch?.ltp) {
            dataSrc = 'Upstox API';
            dataStatus = 'LIVE';
          } else if (tickerInfo && (yahooMarketPrice || chartPrevClose)) {
            dataSrc = 'Yahoo Finance';
            dataStatus = 'LIVE';
          } else if (isUnlistedAsset) {
            dataSrc = 'Unlisted Valuation';
            dataStatus = 'LIVE';
          } else if (liveTick > 0) {
            dataSrc = 'Master Ticker / Manual';
            dataStatus = 'LIVE';
          } else {
            dataSrc = 'Upstox/Yahoo (Failed)';
            dataStatus = 'FAILED';
            if (!failedSymbols.includes(symbol)) {
              failedSymbols.push(symbol);
            }
          }

          try {
            await dbRun(
              db,
              `UPDATE Holdings
               SET ltp = ?, prev_close = ?, day_change = ?, day_change_pct = ?,
                   current_value = ?, unrealized_pnl = ?, unrealized_pct = ?,
                   native_ltp = ?, native_prev_close = ?, native_current_value = ?,
                   native_unrealized_pnl = ?,
                   data_source = ?, data_status = ?,
                   last_update = ?, updated_at = CURRENT_TIMESTAMP
               WHERE rowid = ?`,
              [
                convertedLtp, convertedPrevClose, holdingDayChg, dayChgPct,
                currentVal, unrealizedGain, unrealizedGainPct,
                nativeLtp, nativePrevClose, nativeCurrentVal,
                nativeUnrealizedGain,
                dataSrc, dataStatus,
                syncTimeStr,
                mh.rowid
              ]
            );
            pricesUpdated++;
          } catch (e) {}
        }

        try {
          // For unlisted assets (no live feed), preserve manually-entered manual_ltp â€” do NOT overwrite it.
          // For listed assets, update last_price and previous_close, and clear manual_ltp so it does NOT corrupt live data_source classification.
          const isUnlistedSymbol = (symbol || '').toUpperCase().startsWith('UL') ||
            (symbol || '').toUpperCase().includes('UNLISTED') ||
            (isin || '').toUpperCase().startsWith('CUSTOM_');
          if (isUnlistedSymbol) {
            await dbRun(
              db,
              `UPDATE MasterTickers SET last_price = ?, previous_close = ?, last_updated = CURRENT_TIMESTAMP WHERE symbol = ? OR isin = ?`,
              [targetLtp, targetPrevClose, symbol, isin]
            );
          } else {
            await dbRun(
              db,
              `UPDATE MasterTickers SET last_price = ?, manual_ltp = NULL, previous_close = ?, last_updated = CURRENT_TIMESTAMP WHERE symbol = ? OR isin = ?`,
              [targetLtp, targetPrevClose, symbol, isin]
            );
          }
        } catch (e) {}
      }));
    }

    // 5. Update Mutual Funds (AMFI in-memory + MFapi fallback)
    // Runs all MF NAV fetches in parallel batches of 10 (was sequential â€” caused 4-10s waterfall)
    if (mutualFundHoldings.length > 0) {
      try {
        const { fetchAMFINavs, fetchAMFISchemeCodes, fetchNAVFromMFapi } = await import('./camsParser.js');
        const amfiMap = await fetchAMFINavs();
        const schemeCodesMap = await fetchAMFISchemeCodes();

        const MF_BATCH = 10;
        for (let mi = 0; mi < mutualFundHoldings.length; mi += MF_BATCH) {
          await Promise.all(mutualFundHoldings.slice(mi, mi + MF_BATCH).map(async (mf) => {
          const isin = String(mf.isin || '').trim();
          const symbol = String(mf.symbol || '').trim();
          if (!isin && !symbol) return;

          let nav: number | null = null;
          let prevNav: number | undefined = undefined;
          let source = 'AMFI API';

          if (amfiMap.size > 0) {
            nav = amfiMap.get(isin.toUpperCase()) || 
                  amfiMap.get(symbol.toUpperCase()) || 
                  amfiMap.get(symbol.toUpperCase().replace(/\s+/g, ' ').trim()) || null;
          }

          if (!nav || nav <= 0) {
            const mfapiResult = await fetchNAVFromMFapi(isin, symbol, schemeCodesMap);
            if (mfapiResult) {
              nav = mfapiResult.nav;
              prevNav = mfapiResult.prevNav;
              source = mfapiResult.source;
            }
          }

          if (nav && nav > 0) {
            if (isin) {
              await dbRun(db, 'UPDATE MasterTickers SET last_price = ?, previous_close = COALESCE(previous_close, ?), last_updated = CURRENT_TIMESTAMP WHERE isin = ?', [nav, nav, isin]).catch(() => {});
            }

            const queryHoldings = isin 
              ? `SELECT rowid, portfolio, isin, symbol, folio, quantity, total_cost, prev_close 
                 FROM Holdings 
                 WHERE isin = ? 
                   AND (price_authority IS NULL OR price_authority = 'LIVE_FEED')`
              : `SELECT rowid, portfolio, isin, symbol, folio, quantity, total_cost, prev_close 
                 FROM Holdings 
                 WHERE symbol = ? 
                   AND (price_authority IS NULL OR price_authority = 'LIVE_FEED')`;
            const matchingMFHoldings = await dbAll(db, queryHoldings, [isin || symbol]);

            for (const mh of matchingMFHoldings) {
              if (portfolioFilter && portfolioFilter !== 'Combined' && mh.portfolio !== portfolioFilter) continue;

              const cv = mh.quantity * nav;
              const pnl = cv - mh.total_cost;
              const pct = mh.total_cost > 0 ? (pnl / mh.total_cost) * 100 : 0;
              const effectivePrevClose = prevNav || mh.prev_close || nav;
              const dayChg = nav - effectivePrevClose;
              const dayChgPct = effectivePrevClose > 0 ? (dayChg / effectivePrevClose) * 100 : 0;
              const dayChgVal = mh.quantity * dayChg;

              await dbRun(db, `
                UPDATE Holdings
                SET ltp = ?, prev_close = ?, day_change = ?, day_change_pct = ?,
                    current_value = ?, unrealized_pnl = ?, unrealized_pct = ?,
                    last_update = ?, data_status = 'LIVE', data_source = ?
                WHERE rowid = ?
              `, [nav, effectivePrevClose, dayChgVal, dayChgPct, cv, pnl, pct, syncTimeStr, source, mh.rowid]).catch(() => {});
              pricesUpdated++;
            }
          }
        }));
        }
      } catch (err) {
        console.error('[Sync] Error during MF NAV updates:', err);
      }
    }

    // 6. Update Unlisted / Custom Assets â€” priced purely from manual_ltp in MasterTickers
    // These are explicitly excluded from the equity loop (symbol.startsWith('UL') filter),
    // so they need their own dedicated handler here.
    const unlistedHoldings = holdings.filter(h => {
      const sym = (h.symbol || '').toUpperCase();
      const isn = (h.isin || '').toUpperCase();
      return (
        sym.startsWith('UL') ||
        sym.startsWith('UNLISTED') ||
        isn.startsWith('CUSTOM_')
      );
    });

    if (unlistedHoldings.length > 0) {
      console.log(`[Unlisted] Processing ${unlistedHoldings.length} unlisted/custom asset(s) from manual_ltp...`);
      for (const h of unlistedHoldings) {
        try {
          const mtRow = await dbGet(
            db,
            'SELECT manual_ltp, manual_ltp_date FROM MasterTickers WHERE symbol = ? OR isin = ?',
            [h.symbol, h.isin || h.symbol]
          );
          if (!mtRow?.manual_ltp || mtRow.manual_ltp <= 0) {
            console.log(`[Unlisted] No manual_ltp set for ${h.symbol} â€” skipping.`);
            continue;
          }
          const manualLtp = mtRow.manual_ltp;
          const matchingRows = await dbAll(
            db,
            'SELECT rowid, portfolio, quantity, total_cost FROM Holdings WHERE (symbol = ? OR isin = ?) AND quantity > 0',
            [h.symbol, h.isin || h.symbol]
          );
          for (const mh of matchingRows) {
            const cv = mh.quantity * manualLtp;
            const pnl = cv - mh.total_cost;
            const pct = mh.total_cost > 0 ? (pnl / mh.total_cost) * 100 : 0;
            await dbRun(db, `
              UPDATE Holdings
              SET ltp = ?, current_value = ?, unrealized_pnl = ?, unrealized_pct = ?,
                  native_ltp = ?, native_current_value = ?, native_unrealized_pnl = ?,
                  data_source = 'Manual Entry', data_status = 'LIVE',
                  last_update = ?, updated_at = CURRENT_TIMESTAMP
              WHERE rowid = ?
            `, [manualLtp, cv, pnl, pct, manualLtp, cv, pnl, syncTimeStr, mh.rowid]);
            pricesUpdated++;
          }
          console.log(`[Unlisted] Applied manual LTP â‚¹${manualLtp} to ${h.symbol} across ${matchingRows.length} holding row(s).`);
        } catch (ue) {
          console.error(`[Unlisted] Error updating ${h.symbol}:`, ue);
        }
      }
    }

  } catch (err) {
    console.error('[Market Sync] Error during market data fetch:', err);
    return { pricesUpdated: 0, caAdded: 0, failedSymbols: [] };
  } finally {
    isMarketFetchInProgress = false;
    activeMarketFetchPromise = null;
    if (resolveActivePromise!) resolveActivePromise();
    lastMarketFetchCompletedAt = Date.now();
  }

  // === DEFENSE-IN-DEPTH: Re-lock all CASH holdings to par value after every price sync ===
  // This prevents any accidental overwrite even if the fetch-level filters are bypassed
  try {
    // INR CASH: ltp=1.0, prev_close=1.0
    await dbRun(db, `
      UPDATE Holdings SET
        ltp = 1.0, prev_close = 1.0, native_ltp = 1.0, native_prev_close = 1.0,
        day_change = 0, day_change_pct = 0,
        current_value = quantity, native_current_value = quantity,
        unrealized_pnl = 0, unrealized_pct = 0, native_unrealized_pnl = 0,
        data_source = 'Cash Par Value', data_status = 'LIVE',
        last_update = datetime('now')
      WHERE (holding_type = 'CASH' OR UPPER(symbol) = 'CASH') AND currency = 'INR'
    `);

    // USD CASH: native_ltp=1.0, ltp=usdRate, prev_close=usdRate
    const usdRateRow = await dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'").catch(() => null);
    const currentUsdRate = usdRateRow?.rate_to_inr || 83.5;
    await dbRun(db, `
      UPDATE Holdings SET
        native_ltp = 1.0, native_prev_close = 1.0,
        ltp = ${currentUsdRate}, prev_close = ${currentUsdRate},
        day_change = 0, day_change_pct = 0,
        current_value = quantity * ${currentUsdRate}, native_current_value = quantity,
        total_cost = quantity * ${currentUsdRate}, native_total_cost = quantity,
        avg_buy_price = ${currentUsdRate}, native_avg_buy_price = 1.0,
        unrealized_pnl = 0, unrealized_pct = 0, native_unrealized_pnl = 0,
        data_source = 'Cash Par Value', data_status = 'LIVE',
        last_update = datetime('now')
      WHERE (holding_type = 'CASH' OR UPPER(symbol) = 'CASH') AND currency = 'USD'
    `);

    console.log('[Market Sync] CASH holdings re-locked to par values (defense-in-depth)');
  } catch (cashLockErr) {
    console.warn('[Market Sync] CASH re-lock warning:', cashLockErr);
  }

  // === Valuation Snapshot after Market Sync ===
  try {
    const snapUsdRow = await dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'").catch(() => null);
    const snapUsdRate = snapUsdRow?.rate_to_inr || 0;

    const portfolioVals = await dbAll(db, `
      SELECT portfolio,
        SUM(current_value) as total_value,
        SUM(CASE WHEN holding_type = 'EQUITY' THEN current_value ELSE 0 END) as equity_value,
        SUM(CASE WHEN holding_type = 'CASH' THEN current_value ELSE 0 END) as cash_value,
        SUM(CASE WHEN holding_type = 'MUTUAL_FUND' THEN current_value ELSE 0 END) as mf_value,
        SUM(CASE WHEN holding_type = 'AIF' THEN current_value ELSE 0 END) as aif_value,
        SUM(CASE WHEN holding_type = 'UNLISTED' THEN current_value ELSE 0 END) as unlisted_value
      FROM Holdings
      GROUP BY portfolio
    `);

    for (const pv of portfolioVals) {
      const lastSnap = await dbGet(db,
        `SELECT total_value_inr FROM ValuationSnapshots WHERE portfolio = ? ORDER BY id DESC LIMIT 1`,
        [pv.portfolio]
      ).catch(() => null);

      let driftPct = 0;
      let driftAlert: string | null = null;

      if (lastSnap && lastSnap.total_value_inr > 0) {
        driftPct = ((pv.total_value - lastSnap.total_value_inr) / lastSnap.total_value_inr) * 100;
        if (Math.abs(driftPct) > 5) {
          driftAlert = `WARN: ${pv.portfolio} drifted ${driftPct > 0 ? '+' : ''}${driftPct.toFixed(2)}% after market sync`;
          console.warn(`[Valuation Drift] ${driftAlert}`);
        }
      }

      await dbRun(db, `
        INSERT INTO ValuationSnapshots (portfolio, total_value_inr, equity_value, cash_value, mf_value, aif_value, unlisted_value, fx_rate_usd, trigger_source, drift_pct, drift_alert)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MARKET_SYNC', ?, ?)
      `, [pv.portfolio, pv.total_value, pv.equity_value, pv.cash_value, pv.mf_value, pv.aif_value, pv.unlisted_value, snapUsdRate, driftPct, driftAlert]);
    }
    console.log(`[Valuation Snapshot] Recorded ${portfolioVals.length} portfolio snapshots after market sync`);
  } catch (snapErr) {
    console.warn('[Valuation Snapshot] Failed to record market sync snapshot:', snapErr);
  }

  const elapsed = ((Date.now() - syncStart) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] Market price sync completed successfully in ${elapsed}s. Updated ${pricesUpdated} holdings.`);
  return {
    pricesUpdated,
    caAdded,
    failedSymbols
  };
}

export async function syncSectorsForTickers(db: sqlite3.Database): Promise<{ updatedCount: number; totalCount: number }> {
  console.log(`[${new Date().toISOString()}] Syncing sector information for all MasterTickers...`);
  
  const tickers = await dbAll(db, 'SELECT id, symbol, exchange, sector FROM MasterTickers');
  let updatedCount = 0;

  // Retrieve Upstox Access Token if available (for logging/integration context)
  const tokenRow = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'Access_Token'");
  const upstoxToken = tokenRow?.value;

  for (const t of tickers) {
    const symbol = t.symbol;
    const exchange = t.exchange || 'NSE';
    
    // Skip placeholder custom codes
    if (symbol.toUpperCase().startsWith('UL') || symbol.includes(' ')) {
      continue;
    }

    const yfSymbol = getYahooSymbol(symbol, exchange);
    let resolvedSector: string | null = null;

    // A. Upstox API does not provide a direct sector info module, so we fall back to Yahoo Finance Search
    // B. Yahoo Finance Search query (very reliable, doesn't require crumb)
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yfSymbol)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (res.ok) {
        const json = await res.json() as any;
        const exactQuote = json.quotes?.find((q: any) => q.symbol?.toUpperCase() === yfSymbol.toUpperCase());
        if (exactQuote?.sector) {
          resolvedSector = exactQuote.sector;
          console.log(`[Sector Sync] Resolved sector '${resolvedSector}' for ${symbol} using Yahoo Search exact match`);
        } else {
          // If no exact match symbol-wise, pick the first quote with a sector defined
          const firstWithSector = json.quotes?.find((q: any) => q.sector);
          if (firstWithSector?.sector) {
            resolvedSector = firstWithSector.sector;
            console.log(`[Sector Sync] Resolved sector '${resolvedSector}' for ${symbol} using Yahoo Search fallback match`);
          }
        }
      }
    } catch (err) {
      console.error(`[Sector Sync] Failed to fetch sector for ${symbol} (${yfSymbol}) via Search:`, err);
    }

    // C. Traditional fallback: Try quoteSummary if search did not yield a sector
    if (!resolvedSector) {
      try {
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yfSymbol}?modules=assetProfile`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (res.ok) {
          const json = await res.json() as any;
          const profile = json.quoteSummary?.result?.[0]?.assetProfile;
          if (profile?.sector) {
            resolvedSector = profile.sector;
            console.log(`[Sector Sync] Resolved sector '${resolvedSector}' for ${symbol} using Yahoo Finance quoteSummary`);
          }
        }
      } catch (err) {
        console.error(`[Sector Sync] Failed fallback quoteSummary sector fetch for ${symbol} (${yfSymbol}):`, err);
      }
    }

    // Fallback dictionary for common Indian stocks if both fail or rate-limit hits
    if (!resolvedSector) {
      const commonSectors: Record<string, string> = {
        'RELIANCE': 'Energy',
        'TCS': 'Technology',
        'INFY': 'Technology',
        'HDFCBANK': 'Financial Services',
        'ICICIBANK': 'Financial Services',
        'KOTAKBANK': 'Financial Services',
        'AXISBANK': 'Financial Services',
        'SBIN': 'Financial Services',
        'BHARTIARTL': 'Communication Services',
        'ITC': 'Consumer Defensive',
        'HUL': 'Consumer Defensive',
        'LTI': 'Technology',
        'LT': 'Industrials',
        'WIPRO': 'Technology',
        'HCLTECH': 'Technology',
        'ASIANPAINT': 'Consumer Defensive',
        'MARUTI': 'Consumer Cyclical',
        'TATAMOTORS': 'Consumer Cyclical',
        'M&M': 'Consumer Cyclical',
        'BAJFINANCE': 'Financial Services',
        'BAJAJFINSV': 'Financial Services',
        'SUNPHARMA': 'Healthcare',
        'DRREDDY': 'Healthcare',
        'CIPLA': 'Healthcare',
        'JSWSTEEL': 'Basic Materials',
        'TATASTEEL': 'Basic Materials',
        'HINDALCO': 'Basic Materials',
        'ULTRACEMCO': 'Basic Materials',
        'GRASIM': 'Basic Materials',
        'ADANIENT': 'Industrials',
        'ADANIPORTS': 'Industrials',
        'POWERGRID': 'Utilities',
        'NTPC': 'Utilities',
        'ONGC': 'Energy',
        'COALINDIA': 'Energy',
        'BPCL': 'Energy',
        'IOC': 'Energy',
        'HEROMOTOCO': 'Consumer Cyclical',
        'EICHERMOT': 'Consumer Cyclical',
        'BAJAJ-AUTO': 'Consumer Cyclical',
        'DIVISLAB': 'Healthcare',
        'APOLLOHOSP': 'Healthcare',
        'HDFCLIFE': 'Financial Services',
        'SBILIFE': 'Financial Services',
        'INDUSINDBK': 'Financial Services',
        'UPL': 'Basic Materials',
        'TATACONSUM': 'Consumer Defensive',
        'NESTLEIND': 'Consumer Defensive',
        'BRITANNIA': 'Consumer Defensive',
        'TITAN': 'Consumer Cyclical',
        'HINDUNILVR': 'Consumer Defensive',
        'TECHM': 'Technology'
      };
      
      const cleanSym = symbol.toUpperCase().replace('.NS', '').replace('.BO', '');
      if (commonSectors[cleanSym]) {
        resolvedSector = commonSectors[cleanSym];
        console.log(`[Sector Sync] Used fallback dictionary for ${symbol}: ${resolvedSector}`);
      }
    }

    if (resolvedSector) {
      await dbRun(db, 'UPDATE MasterTickers SET sector = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [resolvedSector, t.id]);
      updatedCount++;
    }

    // 150ms sleep to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  console.log(`[Sector Sync] Completed sector sync. Updated ${updatedCount} out of ${tickers.length} tickers.`);
  return { updatedCount, totalCount: tickers.length };
}

export function validateAndCheckPriceAnomaly(
  newPrice: number,
  lastPrice: number | null | undefined,
  symbol: string
): { isValid: boolean; reason?: string } {
  // Reject any price update for CASH-like symbols â€” cash should never have market prices
  const symUp = (symbol || '').toUpperCase();
  if (symUp === 'CASH' || symUp.startsWith('CASH_') || symUp.startsWith('CASH:')) {
    return { isValid: false, reason: `CASH symbol "${symbol}" must not receive market prices` };
  }
  if (isNaN(newPrice) || !isFinite(newPrice) || newPrice <= 0 || newPrice > 5000000) {
    return { isValid: false, reason: 'Invalid, zero, or out-of-bounds price value' };
  }
  if (lastPrice && lastPrice > 0) {
    const pctChange = Math.abs((newPrice - lastPrice) / lastPrice);
    if (pctChange > 0.40) {
      console.warn(`[Price Failsafe] Anomaly detected for ${symbol}: new ${newPrice} vs last ${lastPrice} (${(pctChange * 100).toFixed(1)}% jump). Rejecting outlier.`);
      return { isValid: false, reason: `Anomaly deviation > 40% (${(pctChange * 100).toFixed(1)}%)` };
    }
  }
  return { isValid: true };
}

let lastMarketSyncTimestamp = 0;

export function triggerBackgroundMarketDataSync(db: sqlite3.Database, portfolioFilter?: string, force: boolean = false): void {
  const now = Date.now();
  if (!force && (now - lastMarketSyncTimestamp < 90000)) {
    return;
  }
  lastMarketSyncTimestamp = now;
  setImmediate(() => {
    autoFetchMarketData(db, portfolioFilter)
      .then(() => {
        try {
          persistRefreshStamp(db, 'market-prices');
        } catch (e) {}
      })
      .catch(err => console.error('[Background Market Sync Error]:', err));
  });
}


