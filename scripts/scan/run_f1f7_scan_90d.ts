/**
 * Run F1-F7 scan for last 90 trading sessions.
 * Outputs JSON array of enriched stock records to stdout.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPath = (process.env.DATABASE_URL ?? '').replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const SCAN_DATE = new Date().toISOString().slice(0, 10);

// ── 1. F1-F7 passing stocks (deduplicated, latest run per symbol) ─────────────
const f1f7Rows = db.prepare(`
  SELECT f.*
  FROM strategy_fundamental_filter_results f
  INNER JOIN (
    SELECT symbol, MAX(evaluated_at) latest FROM strategy_fundamental_filter_results GROUP BY symbol
  ) m ON f.symbol = m.symbol AND f.evaluated_at = m.latest
  WHERE f.promoter_pct >= 66.6 AND f.roce_pct >= 35 AND f.roe_pct >= 25
  ORDER BY f.roce_pct DESC
`).all() as any[];

const symbols = [...new Set(f1f7Rows.map((r: any) => r.symbol as string))];

// ── 2. Pull last 90 trading days of OHLCV for each symbol ────────────────────
function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const recent = closes.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i] - recent[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  const slice = arr.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

const enriched: any[] = [];
const scanDate = SCAN_DATE;

for (const sym of symbols) {
  const f = f1f7Rows.find((r: any) => r.symbol === sym);

  // Get last 130 bars (enough for RSI + 50-SMA + 52W high)
  const bars = db.prepare(`
    SELECT trade_date, open, high, low, close, volume
    FROM DailyOHLCV
    WHERE symbol = ?
    ORDER BY trade_date DESC
    LIMIT 260
  `).all(sym) as any[];

  bars.reverse(); // ascending

  const closes = bars.map((b: any) => Number(b.close));
  const volumes = bars.map((b: any) => Number(b.volume));
  const highs = bars.map((b: any) => Number(b.high));

  const last90 = bars.slice(-90);
  const last90Closes = last90.map((b: any) => Number(b.close));
  const last90Vols = last90.map((b: any) => Number(b.volume));

  const cmp = closes.at(-1) ?? null;
  const rsi = computeRsi(closes);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const high52w = highs.length >= 252 ? Math.max(...highs.slice(-252)) : Math.max(...highs);
  const pctFrom52wHigh = cmp && high52w ? Math.round(((cmp - high52w) / high52w) * 1000) / 10 : null;

  // Volume surge: last close's volume vs 20-day avg
  const vol20 = sma(volumes, 20);
  const latestVol = volumes.at(-1) ?? 0;
  const volSurge = vol20 && vol20 > 0 ? Math.round((latestVol / vol20) * 100) / 100 : null;

  // 90-day return
  const price90dAgo = last90Closes[0] ?? null;
  const return90d = price90dAgo && cmp ? Math.round(((cmp - price90dAgo) / price90dAgo) * 1000) / 10 : null;

  // Strategy signals
  const aboveSma20 = cmp && sma20 ? cmp > sma20 : false;
  const aboveSma50 = cmp && sma50 ? cmp > sma50 : false;
  const breakout52w = pctFrom52wHigh != null && pctFrom52wHigh >= -5; // within 5% of 52W high
  const isVolumeBreakout = volSurge != null && volSurge >= 1.5;
  const rsiBullish = rsi != null && rsi >= 55 && rsi <= 75;
  const rsiOversold = rsi != null && rsi < 40;

  let signal = 'NEUTRAL';
  if (aboveSma20 && aboveSma50 && rsiBullish && isVolumeBreakout) signal = 'S3A_MOMENTUM_BREAKOUT';
  else if (rsiOversold && aboveSma50) signal = 'S4A_DIP_ACCUMULATION';
  else if (aboveSma20 && aboveSma50 && rsiBullish) signal = 'MOMENTUM_BULLISH';
  else if (aboveSma50 && !aboveSma20) signal = 'ABOVE_50_CONSOLIDATING';
  else if (!aboveSma50) signal = 'BELOW_50_WEAK';

  // F1-F7 pass labels
  const filters = {
    F1_promoter: f.promoter_pct >= 66.6,
    F2_roce: f.roce_pct >= 35,
    F3_roe: f.roe_pct >= 25,
    F4_profitable8q: f.profitable_last_8_quarters === 1 || f.profitable_quarter_count >= 8,
    F5_cashflow: f.cash_flow_to_operating_profit != null ? f.cash_flow_to_operating_profit >= 0.5 : null,
    F6_noPledge: f.pledged_pct != null ? f.pledged_pct === 0 : null,
    F7_institutional: f.institutional_involvement_pass === 1,
  };
  const passCount = Object.values(filters).filter(v => v === true).length;
  const filterStr = Object.entries(filters).filter(([, v]) => v === true).map(([k]) => k).join(', ');

  // Sparkline data (last 90 closes normalised 0-100)
  const minC = Math.min(...last90Closes);
  const maxC = Math.max(...last90Closes);
  const sparkline = last90Closes.map(c => maxC > minC ? Math.round(((c - minC) / (maxC - minC)) * 100) : 50);

  // Log to scan_signal_log
  const signalId = crypto.createHash('sha256').update(`${scanDate}|${sym}|${signal}`).digest('hex').slice(0, 32);
  try {
    db.prepare(`INSERT OR IGNORE INTO scan_signal_log
      (signal_id, scan_date, symbol, strategy_id, strategy_category, convergence_count,
       signal_price, signal_rsi, signal_volume_ratio, signal_metadata, outcome_label, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
      .run(signalId, scanDate, sym, signal, signal.includes('S3A') ? 'MOMENTUM' : signal.includes('S4A') ? 'DIP' : 'TECHNICAL',
           passCount, cmp, rsi, volSurge, JSON.stringify({ return90d, pctFrom52wHigh, aboveSma20, aboveSma50 }), 'PENDING');
  } catch {}

  // Get ticker info from MasterTickers
  const ticker = db.prepare(`SELECT company_name, sector, upstox_key_nse, upstox_key_bse FROM MasterTickers WHERE symbol=? LIMIT 1`).get(sym) as any;

  enriched.push({
    symbol: sym,
    companyName: ticker?.company_name ?? sym,
    sector: f.sector ?? ticker?.sector ?? '—',
    marketCapCr: null,
    cmp,
    rsi,
    sma20: sma20 ? Math.round(sma20 * 100) / 100 : null,
    sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
    aboveSma20,
    aboveSma50,
    high52w: Math.round(high52w * 100) / 100,
    pctFrom52wHigh,
    volSurge,
    return90d,
    signal,
    promoterPct: f.promoter_pct,
    rocePct: f.roce_pct,
    roePct: f.roe_pct,
    pledgedPct: f.pledged_pct,
    cfRatio: f.cash_flow_to_operating_profit,
    profitableQuarters: f.profitable_quarter_count,
    passCount,
    filters,
    filterStr,
    evaluatedAt: f.evaluated_at,
    sparkline,
    bars90d: last90.map((b: any) => ({ d: b.trade_date, o: +b.open, h: +b.high, l: +b.low, c: +b.close, v: +b.volume })),
  });
}

db.close();
console.log(JSON.stringify({ scanDate, symbols: symbols.length, stocks: enriched }));
