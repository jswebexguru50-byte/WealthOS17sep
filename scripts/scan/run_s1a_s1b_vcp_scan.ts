/**
 * S1A / S1B / VCP Strategy Scan — last 90 trading sessions
 * Cross-checks hits against F1-F7 fundamental filters.
 *
 * S1A : VPA Three-Leg Swing  (O→a impulse ≥20%, a→b pullback 10-50%, b→c reclaim ≥80%, VPA vol, RSI zone, bullish bar)
 * S1B : VPA Trough Reversal  (same impulse + deeper pullback ≤90%, evaluated at trough, no Leg-3 requirement)
 * VCP : Volatility Contraction Pattern (above SMA200, EMA50 within ±5%, RSI 42-58, vol contraction, ATR contraction)
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

// ── helpers ────────────────────────────────────────────────────────────────────
function ema(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}
function rsi14(closes: number[]): number | null {
  const p = 14;
  if (closes.length < p + 1) return null;
  const recent = closes.slice(-p - 1);
  let g = 0, l = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i] - recent[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  const ag = g / p, al = l / p;
  if (al === 0) return 100;
  return Math.round((100 - 100 / (1 + ag / al)) * 10) / 10;
}
function atr14(highs: number[], lows: number[], closes: number[]): number | null {
  const p = 14;
  if (highs.length < p + 1) return null;
  const trs: number[] = [];
  for (let i = highs.length - p - 1; i < highs.length; i++) {
    if (i === 0) { trs.push(highs[i] - lows[i]); continue; }
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

// Candlestick: is current bar a bullish reversal (not doji)?
function isBullishReversal(o: number, h: number, l: number, c: number, prevC: number): boolean {
  const body = Math.abs(c - o);
  const range = h - l;
  if (range === 0) return false;
  if (body / range <= 0.10) return false; // Doji gate
  if (c <= o) return false; // must close bullish
  // Marubozu, Hammer, Engulfing, Piercing — simplified: bullish body with volume
  const lowerWick = Math.min(o, c) - l;
  const upperWick = h - Math.max(o, c);
  const isHammer = lowerWick >= 2 * body && upperWick < body;
  const isBullish = c > o;
  const isEngulfing = c > o && c > prevC;
  return isBullish || isHammer || isEngulfing;
}

// RSI zone check: near 30/40/50/60 ± tolerance
function rsiNearZone(r: number, tolerance = 3.5): boolean {
  return [30, 40, 50, 60].some(z => Math.abs(r - z) <= tolerance);
}

// Signal freshness: signal bar must be within last N bars of array
const FRESH_BARS = 5;

interface Bar { date: string; o: number; h: number; l: number; c: number; v: number; }

// ── S1A: VPA Three-Leg Swing ───────────────────────────────────────────────────
function evalS1A(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 50) return { hit: false, details: { reason: 'insufficient bars' } };

  const closes = bars.map(b => b.c);
  const highs  = bars.map(b => b.h);
  const lows   = bars.map(b => b.l);
  const vols   = bars.map(b => b.v);
  const sma200 = sma(closes, 200);
  const vol20avg = (sma(vols, 20) ?? 1);
  const rsiCur = rsi14(closes);

  // Scan last 90 bars for the pattern
  // Only look for patterns that COMPLETE (point c fires) in the last FRESH_BARS sessions
  const scanWindow = FRESH_BARS;
  for (let ci = n - 1; ci >= n - scanWindow; ci--) {
    // Point c = ci (signal bar)
    const cClose = bars[ci].c;
    if (!isBullishReversal(bars[ci].o, bars[ci].h, bars[ci].l, bars[ci].c, bars[ci - 1]?.c ?? bars[ci].c)) continue;
    const cVol = bars[ci].v;
    if (cVol < vol20avg * 0.8) continue; // vol surge at c

    // Find point a in [ci-28, ci-10]: local max with impulse from O
    for (let ai = ci - 10; ai >= ci - 28; ai--) {
      if (ai < 5) break;
      const aHigh = bars[ai].h;

      // Find O in [ai-20, ai-1]: local min
      let oIdx = -1, oLow = Infinity;
      for (let oi = ai - 1; oi >= ai - 20 && oi >= 0; oi--) {
        if (bars[oi].l < oLow) { oLow = bars[oi].l; oIdx = oi; }
      }
      if (oIdx < 0) continue;
      const impulse = (aHigh - oLow) / oLow;
      if (impulse < 0.20) continue; // L1 ≥ 20%

      // Find b between a and c: local min with pullback 10-50%
      let bIdx = -1, bLow = Infinity;
      for (let bi = ai + 1; bi < ci; bi++) {
        if (bars[bi].l < bLow) { bLow = bars[bi].l; bIdx = bi; }
      }
      if (bIdx < 0) continue;
      const retrace = (aHigh - bLow) / (aHigh - oLow);
      if (retrace < 0.10 || retrace > 0.50) continue;

      // L3 reclaim
      if (cClose < aHigh * 0.80) continue;

      // Volume: L1 > vol20avg * 1.25, L2 < L1 avg
      const l1Vols = vols.slice(oIdx, ai + 1);
      const l2Vols = vols.slice(ai + 1, bIdx + 1);
      const l1avgV = l1Vols.reduce((a, b) => a + b, 0) / (l1Vols.length || 1);
      const l2avgV = l2Vols.reduce((a, b) => a + b, 0) / (l2Vols.length || 1);
      if (l1avgV < vol20avg * 1.0) continue; // L1 avg vol ≥ 20-day avg
      if (l2avgV > l1avgV * 0.85) continue;  // L2 vol < 85% of L1

      // RSI near support zone at signal bar (tolerance = 3.5 per spec)
      const barRsi = rsi14(closes.slice(0, ci + 1));
      if (!barRsi || !rsiNearZone(barRsi, 3.5)) continue;

      // SMA200 check (optional — many growth stocks may not have 200 bars)
      if (sma200 && cClose < sma200 * 0.90) continue;

      return {
        hit: true,
        details: {
          strategy: 'S1A',
          signalBar: bars[ci].date,
          pointO: { date: bars[oIdx].date, price: oLow },
          pointA: { date: bars[ai].date, price: aHigh },
          pointB: { date: bars[bIdx].date, price: bLow },
          impulse: Math.round(impulse * 1000) / 10,
          retrace: Math.round(retrace * 1000) / 10,
          rsi: barRsi,
          volSurge: Math.round((cVol / vol20avg) * 100) / 100,
          cmp: cClose,
        }
      };
    }
  }
  return { hit: false, details: { reason: 'no S1A pattern in 90 bars' } };
}

// ── S1B: VPA Trough Reversal ────────────────────────────────────────────────────
function evalS1B(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 50) return { hit: false, details: { reason: 'insufficient bars' } };
  const closes = bars.map(b => b.c);
  const highs  = bars.map(b => b.h);
  const lows   = bars.map(b => b.l);
  const vols   = bars.map(b => b.v);
  const sma200val = sma(closes, 200);
  const vol20avg = (sma(vols, 20) ?? 1);

  // S1B: trough bar (b) must fire within last FRESH_BARS sessions
  const scanWindow = FRESH_BARS;
  for (let bi = n - 1; bi >= n - scanWindow; bi--) {
    // Point b = bi (trough / signal bar — evaluated at trough, not leg 3)
    if (!isBullishReversal(bars[bi].o, bars[bi].h, bars[bi].l, bars[bi].c, bars[bi - 1]?.c ?? bars[bi].c)) continue;
    const bLow = bars[bi].l;
    const bVol = bars[bi].v;
    if (bVol < vol20avg * 0.8) continue;

    // Find a: local max in [bi-28, bi-5]
    for (let ai = bi - 5; ai >= bi - 28; ai--) {
      if (ai < 5) break;
      const aHigh = bars[ai].h;

      // Find O: local min in [ai-20, ai-1]
      let oIdx = -1, oLow = Infinity;
      for (let oi = ai - 1; oi >= ai - 20 && oi >= 0; oi--) {
        if (bars[oi].l < oLow) { oLow = bars[oi].l; oIdx = oi; }
      }
      if (oIdx < 0) continue;
      const impulse = (aHigh - oLow) / oLow;
      if (impulse < 0.20) continue;

      const retrace = (aHigh - bLow) / (aHigh - oLow);
      if (retrace < 0.10 || retrace > 0.90) continue; // S1B allows up to 90% retrace
      if (bLow <= oLow) continue; // must be higher low

      const l1Vols = vols.slice(oIdx, ai + 1);
      const l2Vols = vols.slice(ai + 1, bi + 1);
      const l1avgV = l1Vols.reduce((a, b) => a + b, 0) / (l1Vols.length || 1);
      const l2avgV = l2Vols.reduce((a, b) => a + b, 0) / (l2Vols.length || 1);
      if (l1avgV < vol20avg * 1.0) continue;
      if (l2avgV > l1avgV * 0.85) continue;

      const barRsi = rsi14(closes.slice(0, bi + 1));
      if (!barRsi || !rsiNearZone(barRsi, 3.5)) continue;

      if (sma200val && bars[bi].c < sma200val * 0.90) continue;

      return {
        hit: true,
        details: {
          strategy: 'S1B',
          signalBar: bars[bi].date,
          pointO: { date: bars[oIdx].date, price: oLow },
          pointA: { date: bars[ai].date, price: aHigh },
          pointB: { date: bars[bi].date, price: bLow },
          impulse: Math.round(impulse * 1000) / 10,
          retrace: Math.round(retrace * 1000) / 10,
          rsi: barRsi,
          volSurge: Math.round((bVol / vol20avg) * 100) / 100,
          cmp: bars[bi].c,
        }
      };
    }
  }
  return { hit: false, details: { reason: 'no S1B pattern in 90 bars' } };
}

// ── VCP: Volatility Contraction Pattern ────────────────────────────────────────
function evalVCP(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 60) return { hit: false, details: { reason: 'insufficient bars' } };
  const closes = bars.map(b => b.c);
  const highs  = bars.map(b => b.h);
  const lows   = bars.map(b => b.l);
  const vols   = bars.map(b => b.v);

  const cmp  = closes[n - 1];
  const sma200val = sma(closes, 200);
  const ema50val  = ema(closes, 50);
  const rsiVal    = rsi14(closes);
  const atr14val  = atr14(highs, lows, closes);
  const vol20avg  = (sma(vols, 20) ?? 1);
  const curVol    = vols[n - 1];
  const curHigh   = highs[n - 1];
  const prevHigh  = highs[n - 2] ?? cmp;
  const prevRsi   = rsi14(closes.slice(0, -1));

  if (!ema50val || !rsiVal) return { hit: false, details: { reason: 'insufficient data for VCP' } };

  // ATR contraction: current ATR vs 20-day avg ATR
  const atrSeries: number[] = [];
  for (let i = 1; i < n; i++) {
    atrSeries.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const atr20avg = sma(atrSeries, 20) ?? (atr14val ?? 1);
  const atrRatio = atr14val ? atr14val / atr20avg : null;

  const ema50prox = ((cmp - ema50val) / ema50val) * 100;
  const volRatio = curVol / vol20avg;

  const aboveSma200  = sma200val ? cmp > sma200val : true; // relax if no 200 SMA
  const ema50ok      = ema50prox >= -5.0 && ema50prox <= 5.0;
  const rsiOk        = rsiVal >= 42 && rsiVal <= 58;
  const volOk        = volRatio < 1.0;
  const atrOk        = atrRatio !== null ? atrRatio < 1.0 : false;
  const triggerOk    = cmp > prevHigh && rsiVal > (prevRsi ?? 0) && prevRsi !== null && prevRsi >= 42 && prevRsi <= 58;

  const allPassed = aboveSma200 && ema50ok && rsiOk && volOk && atrOk && triggerOk;
  if (!allPassed) return { hit: false, details: { ema50prox: Math.round(ema50prox * 10) / 10, rsiVal, volRatio: Math.round(volRatio * 100) / 100, atrOk, triggerOk } };

  return {
    hit: true,
    details: {
      strategy: 'VCP',
      signalBar: bars[n - 1].date,
      cmp,
      ema50: Math.round((ema50val ?? 0) * 100) / 100,
      sma200: sma200val ? Math.round(sma200val * 100) / 100 : null,
      rsi: rsiVal,
      ema50Prox: Math.round(ema50prox * 10) / 10,
      volRatio: Math.round(volRatio * 100) / 100,
      atrRatio: atrRatio ? Math.round(atrRatio * 100) / 100 : null,
    }
  };
}

// ── Main scan ─────────────────────────────────────────────────────────────────
// Get all symbols that have F1-F7 data AND recent OHLCV
const cutoffDate = (() => {
  const d = new Date('2026-10-23');
  d.setDate(d.getDate() - 400);
  return d.toISOString().slice(0, 10);
})();

const symbolRows = db.prepare(`
  SELECT DISTINCT d.symbol
  FROM DailyOHLCV d
  INNER JOIN strategy_fundamental_filter_results f ON d.symbol = f.symbol
  WHERE d.trade_date >= '2026-10-01'
  ORDER BY d.symbol
`).all() as any[];

const symbols = symbolRows.map((r: any) => r.symbol as string);
process.stderr.write(`[scan] scanning ${symbols.length} symbols for S1A/S1B/VCP\n`);

// Get F1-F7 data (latest per symbol)
const f1f7Map = new Map<string, any>();
const f1f7Rows = db.prepare(`
  SELECT f.*
  FROM strategy_fundamental_filter_results f
  INNER JOIN (
    SELECT symbol, MAX(evaluated_at) latest FROM strategy_fundamental_filter_results GROUP BY symbol
  ) m ON f.symbol = m.symbol AND f.evaluated_at = m.latest
`).all() as any[];
for (const r of f1f7Rows) f1f7Map.set(r.symbol, r);

// Get MasterTickers info
const tickerMap = new Map<string, any>();
const tickerRows = db.prepare('SELECT symbol, company_name, sector, upstox_key_nse FROM MasterTickers').all() as any[];
for (const r of tickerRows) tickerMap.set(r.symbol, r);

const results: any[] = [];
let processed = 0;

for (const sym of symbols) {
  processed++;
  if (processed % 200 === 0) process.stderr.write(`[scan] ${processed}/${symbols.length}...\n`);

  const bars = db.prepare(`
    SELECT trade_date as date, open as o, high as h, low as l, close as c, volume as v
    FROM DailyOHLCV
    WHERE symbol = ?
    ORDER BY trade_date ASC
    LIMIT 280
  `).all(sym) as Bar[];

  if (bars.length < 50) continue;

  const vcpR  = evalVCP(bars);
  const s1aR  = evalS1A(bars);
  const s1bR  = evalS1B(bars);

  if (!vcpR.hit && !s1aR.hit && !s1bR.hit) continue;

  const signals: string[] = [];
  if (s1aR.hit) signals.push('S1A');
  if (s1bR.hit) signals.push('S1B');
  if (vcpR.hit) signals.push('VCP');

  const f = f1f7Map.get(sym);
  const ticker = tickerMap.get(sym);

  // F1-F7 badge computation
  const closes = bars.map(b => b.c);
  const vols = bars.map(b => b.v);
  const highs = bars.map(b => b.h);
  const cmp = closes[closes.length - 1];
  const sma20val = sma(closes, 20);
  const sma50val = sma(closes, 50);
  const rsiCur = rsi14(closes);
  const vol20avg = sma(vols, 20) ?? 1;
  const latestVol = vols[vols.length - 1];
  const high52w = Math.max(...highs.slice(-252));
  const pctFrom52wH = high52w > 0 ? Math.round(((cmp - high52w) / high52w) * 1000) / 10 : null;
  const volSurge = Math.round((latestVol / vol20avg) * 100) / 100;

  const last90 = bars.slice(-90);
  const last90Closes = last90.map(b => b.c);
  const price90dAgo = last90Closes[0] ?? cmp;
  const return90d = Math.round(((cmp - price90dAgo) / price90dAgo) * 1000) / 10;

  // Sparkline (last 90 closes, normalised 0-100)
  const minC = Math.min(...last90Closes), maxC = Math.max(...last90Closes);
  const sparkline = last90Closes.map(c => maxC > minC ? Math.round(((c - minC) / (maxC - minC)) * 100) : 50);

  const filters = f ? {
    F1_promoter: f.promoter_pct >= 66.6,
    F2_roce: f.roce_pct >= 35,
    F3_roe: f.roe_pct >= 25,
    F4_profitable8q: f.profitable_last_8_quarters === 1 || (f.profitable_quarter_count ?? 0) >= 8,
    F5_cashflow: f.cash_flow_to_operating_profit != null ? f.cash_flow_to_operating_profit >= 0.5 : null,
    F6_noPledge: f.pledged_pct != null ? f.pledged_pct === 0 : null,
    F7_institutional: f.institutional_involvement_pass === 1,
  } : null;

  const passCount = filters ? Object.values(filters).filter(v => v === true).length : 0;

  // Log to scan_signal_log
  for (const sig of signals) {
    const signalId = crypto.createHash('sha256').update(`${SCAN_DATE}|${sym}|${sig}`).digest('hex').slice(0, 32);
    const cat = sig === 'S1A' ? 'VPA_SWING' : sig === 'S1B' ? 'VPA_TROUGH' : 'VCP_CONTRACTION';
    try {
      db.prepare(`INSERT OR IGNORE INTO scan_signal_log
        (signal_id, scan_date, symbol, strategy_id, strategy_category, convergence_count,
         signal_price, signal_rsi, signal_volume_ratio, signal_metadata, outcome_label, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
        .run(signalId, SCAN_DATE, sym, sig, cat, signals.length, cmp, rsiCur, volSurge,
             JSON.stringify({ return90d, pctFrom52wH, signals }), 'PENDING');
    } catch {}
  }

  results.push({
    symbol: sym,
    companyName: ticker?.company_name ?? sym,
    sector: f?.sector ?? ticker?.sector ?? '—',
    cmp,
    rsi: rsiCur,
    sma20: sma20val ? Math.round(sma20val * 100) / 100 : null,
    sma50: sma50val ? Math.round(sma50val * 100) / 100 : null,
    aboveSma20: sma20val ? cmp > sma20val : false,
    aboveSma50: sma50val ? cmp > sma50val : false,
    high52w: Math.round(high52w * 100) / 100,
    pctFrom52wHigh: pctFrom52wH,
    volSurge,
    return90d,
    signals,
    primarySignal: signals[0],
    vcpDetails: vcpR.hit ? vcpR.details : null,
    s1aDetails: s1aR.hit ? s1aR.details : null,
    s1bDetails: s1bR.hit ? s1bR.details : null,
    // F1-F7
    promoterPct: f?.promoter_pct ?? null,
    rocePct: f?.roce_pct ?? null,
    roePct: f?.roe_pct ?? null,
    pledgedPct: f?.pledged_pct ?? null,
    cfRatio: f?.cash_flow_to_operating_profit ?? null,
    profitableQuarters: f?.profitable_quarter_count ?? null,
    filters,
    passCount,
    sparkline,
  });
}

db.close();

// Sort: most signals first, then by return90d
results.sort((a, b) => b.signals.length - a.signals.length || (b.return90d ?? -999) - (a.return90d ?? -999));

process.stderr.write(`[scan] done — ${results.length} signals found\n`);
console.log(JSON.stringify({ scanDate: SCAN_DATE, totalScanned: symbols.length, hits: results.length, stocks: results }));
