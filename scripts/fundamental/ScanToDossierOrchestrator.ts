/**
 * ScanToDossierOrchestrator — All 7 Alphanumeric Strategies × F1-F7 Dossier Pipeline
 *
 * Strategies: S1A · S1B · S2A · S3A · S4A · S4B · S5A
 *
 * Stage 1: Resolve last 90 trading sessions from DailyOHLCV
 * Stage 2: Run all 7 technical signals (fresh signals = last FRESH_BARS)
 * Stage 3: Cross-check against F1-F7 fundamental filters (data enrichment)
 * Stage 4: Persist to dossier_runs / dossier_candidates / dossier_signals
 * Stage 5: Emit enriched JSON for HTML artifact
 *
 * Data-access fixes applied:
 *   - Column is trade_date (not date) in DailyOHLCV
 *   - MasterTickers: company_name, sector, upstox_key_nse, upstox_key_bse (no market_cap_cr, nse_code)
 *   - 9-source waterfall: all F1-F7 fields from strategy_fundamental_filter_results
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPath = (process.env.DATABASE_URL ?? '').replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function generateId(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/\D/g, '').slice(0, 8)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// ── Math helpers ──────────────────────────────────────────────────────────────
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
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}
function rsiNearZone(r: number, tol = 3.5): boolean {
  return [30, 40, 50, 60].some(z => Math.abs(r - z) <= tol);
}
function detectBullishCandle(o: number, h: number, l: number, c: number, prevO: number, prevC: number, atrVal: number): string | null {
  const range = h - l;
  if (range === 0) return null;
  const body = Math.abs(c - o);
  if (body / range <= 0.10) return null; // Doji reject
  if (c <= o) return null; // must close bullish
  // Marubozu: body ≥90% of range, body ≥ ATR
  if (body / range >= 0.90 && body >= atrVal) return 'MARUBOZU';
  // Hammer: lower wick ≥ 2×body, upper wick ≤15% range
  const lowerWick = Math.min(o, c) - l, upperWick = h - Math.max(o, c);
  if (lowerWick >= 2 * body && upperWick <= 0.15 * range) return 'HAMMER';
  // Engulfing: prev bearish, current engulfs
  if (prevC < prevO && o <= prevC && c >= prevO) return 'ENGULFING';
  // Harami: prev bearish, current body inside prior body
  if (prevC < prevO && o > prevC && c < prevO) return 'HARAMI';
  // Piercing: prev bearish, current closes ≥50% into prior body
  if (prevC < prevO && c >= prevC + 0.5 * (prevO - prevC)) return 'PIERCING';
  // Generic bullish close
  return 'BULLISH';
}

const FRESH_BARS = 5;

interface Bar { date: string; o: number; h: number; l: number; c: number; v: number; }

// ── S1A: VPA 3-Leg Swing Reclaim ─────────────────────────────────────────────
function evalS1A(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 50) return { hit: false, details: {} };
  const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
  const sma200 = sma(closes, 200), vol20avg = sma(vols, 20) ?? 1;
  for (let ci = n - 1; ci >= n - FRESH_BARS; ci--) {
    const cClose = bars[ci].c;
    if (bars[ci].v < vol20avg * 0.8) continue;
    for (let ai = ci - 10; ai >= ci - 28; ai--) {
      if (ai < 5) break;
      const aHigh = bars[ai].h;
      let oIdx = -1, oLow = Infinity;
      for (let oi = ai - 1; oi >= ai - 20 && oi >= 0; oi--) { if (bars[oi].l < oLow) { oLow = bars[oi].l; oIdx = oi; } }
      if (oIdx < 0) continue;
      const impulse = (aHigh - oLow) / oLow;
      if (impulse < 0.20) continue;
      let bIdx = -1, bLow = Infinity;
      for (let bi = ai + 1; bi < ci; bi++) { if (bars[bi].l < bLow) { bLow = bars[bi].l; bIdx = bi; } }
      if (bIdx < 0) continue;
      const retrace = (aHigh - bLow) / (aHigh - oLow);
      if (retrace < 0.10 || retrace > 0.50) continue;
      if (cClose < aHigh * 0.80) continue;
      const l1V = vols.slice(oIdx, ai+1), l2V = vols.slice(ai+1, bIdx+1);
      const l1avg = l1V.reduce((a,b)=>a+b,0)/(l1V.length||1), l2avg = l2V.reduce((a,b)=>a+b,0)/(l2V.length||1);
      if (l1avg < vol20avg * 1.0 || l2avg > l1avg * 0.85) continue;
      const barRsi = rsi14(closes.slice(0, ci+1));
      if (!barRsi || !rsiNearZone(barRsi, 3.5)) continue;
      if (sma200 && cClose < sma200 * 0.90) continue;
      return { hit: true, details: {
        strategy: 'S1A', signalBar: bars[ci].date,
        pointO: { date: bars[oIdx].date, price: oLow },
        pointA: { date: bars[ai].date, price: aHigh },
        pointB: { date: bars[bIdx].date, price: bLow },
        impulse: Math.round(impulse*1000)/10, retrace: Math.round(retrace*1000)/10,
        rsi: barRsi, volSurge: Math.round((bars[ci].v/vol20avg)*100)/100, cmp: cClose,
      }};
    }
  }
  return { hit: false, details: {} };
}

// ── S1B: VPA Trough Reversal ──────────────────────────────────────────────────
function evalS1B(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 50) return { hit: false, details: {} };
  const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
  const sma200 = sma(closes, 200), vol20avg = sma(vols, 20) ?? 1;
  for (let bi = n - 1; bi >= n - FRESH_BARS; bi--) {
    const bLow = bars[bi].l;
    if (bars[bi].v < vol20avg * 0.8) continue;
    for (let ai = bi - 5; ai >= bi - 28; ai--) {
      if (ai < 5) break;
      const aHigh = bars[ai].h;
      let oIdx = -1, oLow = Infinity;
      for (let oi = ai - 1; oi >= ai - 20 && oi >= 0; oi--) { if (bars[oi].l < oLow) { oLow = bars[oi].l; oIdx = oi; } }
      if (oIdx < 0) continue;
      const impulse = (aHigh - oLow) / oLow;
      if (impulse < 0.20) continue;
      const retrace = (aHigh - bLow) / (aHigh - oLow);
      if (retrace < 0.10 || retrace > 0.90 || bLow <= oLow) continue;
      const l1V = vols.slice(oIdx, ai+1), l2V = vols.slice(ai+1, bi+1);
      const l1avg = l1V.reduce((a,b)=>a+b,0)/(l1V.length||1), l2avg = l2V.reduce((a,b)=>a+b,0)/(l2V.length||1);
      if (l1avg < vol20avg * 1.0 || l2avg > l1avg * 0.85) continue;
      const barRsi = rsi14(closes.slice(0, bi+1));
      if (!barRsi || !rsiNearZone(barRsi, 3.5)) continue;
      if (sma200 && bars[bi].c < sma200 * 0.90) continue;
      return { hit: true, details: {
        strategy: 'S1B', signalBar: bars[bi].date,
        pointO: { date: bars[oIdx].date, price: oLow },
        pointA: { date: bars[ai].date, price: aHigh },
        pointB: { date: bars[bi].date, price: bLow },
        impulse: Math.round(impulse*1000)/10, retrace: Math.round(retrace*1000)/10,
        rsi: barRsi, volSurge: Math.round((bars[bi].v/vol20avg)*100)/100, cmp: bars[bi].c,
      }};
    }
  }
  return { hit: false, details: {} };
}

// ── S2A: Institutional FVG / Consequent Encroachment Pullback ─────────────────
function evalS2A(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 30) return { hit: false, details: {} };
  const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
  const vol20avg = sma(vols, 20) ?? 1;
  const atrSeries: number[] = [];
  for (let i = 1; i < n; i++) atrSeries.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
  const atr14val = atrSeries.length >= 14 ? atrSeries.slice(-14).reduce((a,b)=>a+b,0)/14 : null;

  // Scan lookback for FVG formation (fvg bar = i, displacement = i-1, pre = i-2)
  const FVG_LOOKBACK = 35;
  for (let fvgI = Math.max(3, n - FVG_LOOKBACK); fvgI < n - 2; fvgI++) {
    // 3-bar FVG: Low[i] > High[i-2]
    if (bars[fvgI].l <= bars[fvgI-2].h) continue;
    const dispBar = bars[fvgI-1];
    const dispVol = dispBar.v;
    const vol20atDisp = sma(vols.slice(0, fvgI), 20) ?? vol20avg;
    // Displacement volume ≥ 1.5x vol20
    if (dispVol < vol20atDisp * 1.50) continue;
    const gapHigh = bars[fvgI-2].h, gapLow = bars[fvgI].l;
    const gapHeight = gapLow - gapHigh;
    const gapHeightPct = gapHeight / gapHigh;
    // Gap must be economically significant: ≥1.5% OR ≥0.5×ATR
    if (gapHeightPct < 0.015 && (!atr14val || gapHeight < 0.5 * atr14val)) continue;
    // CE level = 50% midpoint of gap
    const ceLevel = gapHigh + 0.5 * gapHeight;
    // Look for CE pullback within 15 bars after FVG, must be fresh
    const searchStart = fvgI + 1;
    const searchEnd = Math.min(n - 1, fvgI + 15);
    for (let pi = Math.max(searchStart, n - FRESH_BARS); pi <= searchEnd; pi++) {
      // Price reached CE level (within ±2%)
      const touchDiff = Math.abs(bars[pi].l - ceLevel) / ceLevel;
      if (touchDiff > 0.02) continue;
      // Close must not penetrate below gap floor by more than 10%
      if (bars[pi].c < gapHigh * 0.90) continue;
      // Volume contraction during pullback
      const pbVols = vols.slice(fvgI + 1, pi + 1);
      const pbVolAvg = pbVols.length > 0 ? pbVols.reduce((a,b)=>a+b,0)/pbVols.length : dispVol;
      if (pbVolAvg > dispVol * 0.75) continue;
      // Bullish candle at CE
      const prevBar = bars[pi-1];
      const atrV = atr14val ?? (gapHeight * 2);
      const pattern = detectBullishCandle(bars[pi].o, bars[pi].h, bars[pi].l, bars[pi].c, prevBar.o, prevBar.c, atrV);
      if (!pattern) continue;
      const barRsi = rsi14(closes.slice(0, pi+1));
      return { hit: true, details: {
        strategy: 'S2A', signalBar: bars[pi].date,
        fvgDate: bars[fvgI].date, fvgTop: Math.round(gapLow*100)/100, fvgBottom: Math.round(gapHigh*100)/100,
        ceLevel: Math.round(ceLevel*100)/100, gapHeightPct: Math.round(gapHeightPct*1000)/10,
        dispVolSurge: Math.round((dispVol/vol20atDisp)*100)/100,
        pbVolRatio: Math.round((pbVolAvg/dispVol)*100)/100,
        candlePattern: pattern, rsi: barRsi, cmp: bars[pi].c,
      }};
    }
  }
  return { hit: false, details: {} };
}

// ── S3A: Institutional 3-Leg HH/HL Structure (SMA50-based) ───────────────────
function evalS3A(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 80) return { hit: false, details: {} };
  const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
  const sma50val = sma(closes, 50);
  if (!sma50val) return { hit: false, details: {} };
  // SMA50 must be rising (current > 5 bars ago)
  const sma50prev = sma(closes.slice(0, n-5), 50);
  if (!sma50prev || sma50val <= sma50prev) return { hit: false, details: {} };

  // ATR for compression check
  const atrSeries: number[] = [];
  for (let i = 1; i < n; i++) atrSeries.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
  const atr14cur = atrSeries.slice(-14).reduce((a,b)=>a+b,0)/14;
  const atr14_20ago = atrSeries.slice(-34,-20).reduce((a,b)=>a+b,0)/14;
  const atrCompressionRatio = atr14_20ago > 0 ? atr14cur / atr14_20ago : 1;

  // Look for HH/HL structure within last FRESH_BARS as signal bar
  const vol20avg = sma(vols, 20) ?? 1;
  for (let si = n - 1; si >= n - FRESH_BARS; si--) {
    // Signal bar: price near SMA50 (within ±5%)
    const cmp = bars[si].c;
    const prox = Math.abs(cmp - sma50val) / sma50val;
    if (prox > 0.05) continue;
    // Find preceding HH structure: look back 60 bars for H1 (high) then L1 (pullback) then H2 (higher high)
    const lookback = Math.max(0, si - 60);
    let h1 = -1, h1V = -Infinity;
    for (let i = lookback; i < si - 15; i++) {
      if (bars[i].h > h1V) { h1V = bars[i].h; h1 = i; }
    }
    if (h1 < 0) continue;
    // Find L1 between h1 and si
    let l1 = -1, l1V = Infinity;
    for (let i = h1 + 1; i < si - 5; i++) {
      if (bars[i].l < l1V) { l1V = bars[i].l; l1 = i; }
    }
    if (l1 < 0) continue;
    // Preceding move from L1 origin to H1: must be ≥20%
    const originLow = l1V;
    const impulse = (h1V - originLow) / originLow;
    if (impulse < 0.20) continue;
    // Find H2 between l1 and signal
    let h2 = -1, h2V = -Infinity;
    for (let i = l1 + 1; i < si; i++) {
      if (bars[i].h > h2V) { h2V = bars[i].h; h2 = i; }
    }
    if (h2 < 0 || h2V <= h1V) continue; // H2 must be higher high
    // Signal bar is pullback from H2, near SMA50
    const pullbackDrop = (h2V - cmp) / h2V;
    if (pullbackDrop < 0.03 || pullbackDrop > 0.25) continue;
    // ATR compression at signal (contracting = good)
    if (atrCompressionRatio > 1.0) continue;
    // Bullish candle at signal
    const prevBar = bars[si-1];
    const pattern = detectBullishCandle(bars[si].o, bars[si].h, bars[si].l, bars[si].c, prevBar.o, prevBar.c, atr14cur);
    if (!pattern) continue;
    const barRsi = rsi14(closes.slice(0, si+1));
    return { hit: true, details: {
      strategy: 'S3A', signalBar: bars[si].date,
      h1: { date: bars[h1].date, price: Math.round(h1V*100)/100 },
      l1: { date: bars[l1].date, price: Math.round(l1V*100)/100 },
      h2: { date: bars[h2].date, price: Math.round(h2V*100)/100 },
      impulse: Math.round(impulse*1000)/10, pullbackDrop: Math.round(pullbackDrop*1000)/10,
      atrCompressionRatio: Math.round(atrCompressionRatio*100)/100,
      sma50: Math.round(sma50val*100)/100, candlePattern: pattern,
      rsi: barRsi, cmp,
    }};
  }
  return { hit: false, details: {} };
}

// ── S4A: Gap Running Stocks (Breakouts with Gaps) ────────────────────────────
function evalS4A(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 60) return { hit: false, details: {} };
  const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
  const sma50val = sma(closes, 50), sma200val = sma(closes, 200);
  const vol20avg = sma(vols, 20) ?? 1;
  const cmp = closes[n-1];
  // Price floor: not penny stock
  if (cmp < 50) return { hit: false, details: {} };
  // Trend: price above SMA50 and SMA200
  if (!sma50val || !sma200val) return { hit: false, details: {} };
  if (cmp <= sma50val || cmp <= sma200val) return { hit: false, details: {} };

  // Look for gap-up day within last 90 bars as the setup bar
  const GAP_LOOKBACK = Math.min(n - 5, 90);
  for (let gi = n - FRESH_BARS; gi >= n - GAP_LOOKBACK; gi--) {
    if (gi < 1) break;
    // Gap up ≥ 2% from previous close
    const gapPct = (bars[gi].l - bars[gi-1].c) / bars[gi-1].c;
    if (gapPct < 0.02) continue;
    // Volume on gap bar ≥ 1.3× vol20 (institutional participation)
    const vol20atGap = sma(vols.slice(0, gi), 20) ?? vol20avg;
    if (bars[gi].v < vol20atGap * 1.30) continue;
    // Find swing high since gap bar
    let swingHigh = -Infinity;
    for (let i = gi; i < n; i++) swingHigh = Math.max(swingHigh, bars[i].h);
    // ATR for pullback measurement
    const atrSeries: number[] = [];
    for (let i = 1; i <= gi; i++) atrSeries.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
    const atr14v = atrSeries.length >= 14 ? atrSeries.slice(-14).reduce((a,b)=>a+b,0)/14 : null;
    // Pullback ATR ratio: current pullback from swing high / ATR ≤ 0.5
    const pullbackAmt = swingHigh - cmp;
    const pullbackAtrRatio = atr14v ? pullbackAmt / atr14v : null;
    if (pullbackAtrRatio !== null && pullbackAtrRatio > 0.50) continue;
    // Supply dry-up: recent vol ≤ 85% of vol20
    const volRatio = vols[n-1] / vol20avg;
    if (volRatio > 0.85) continue;
    // Entry: current CMP should be above prior swing high or near it (within 2%)
    const prevSwingHigh = Math.max(...highs.slice(gi, n-1));
    const entryProx = (cmp - prevSwingHigh) / prevSwingHigh;
    if (entryProx < -0.02) continue; // price not yet breaking out
    const barRsi = rsi14(closes);
    const stopLoss = Math.min(...lows.slice(n-5)) * 0.99;
    return { hit: true, details: {
      strategy: 'S4A', signalBar: bars[n-1].date,
      gapDate: bars[gi].date, gapPct: Math.round(gapPct*1000)/10,
      volSurgeAtGap: Math.round((bars[gi].v/vol20atGap)*100)/100,
      prevSwingHigh: Math.round(prevSwingHigh*100)/100,
      pullbackAtrRatio: pullbackAtrRatio !== null ? Math.round(pullbackAtrRatio*100)/100 : null,
      supplyDryUpRatio: Math.round(volRatio*100)/100,
      stopLoss: Math.round(stopLoss*100)/100,
      rsi: barRsi, cmp,
    }};
  }
  return { hit: false, details: {} };
}

// ── S4B: Gap RSI Support ──────────────────────────────────────────────────────
function evalS4B(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 25) return { hit: false, details: {} };
  const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
  const vol20avg = sma(vols, 20) ?? 1;
  const atrSeries: number[] = [];
  for (let i = 1; i < n; i++) atrSeries.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
  const atr14val = atrSeries.length >= 14 ? atrSeries.slice(-14).reduce((a,b)=>a+b,0)/14 : null;

  // Look for signal bar within FRESH_BARS
  for (let si = n - 1; si >= n - FRESH_BARS; si--) {
    if (si < 2) break;
    const prevBar = bars[si-1];
    // Gap up ≥ 2% from previous close
    const gapPct = (bars[si].l - prevBar.c) / prevBar.c;
    if (gapPct < 0.02) continue;
    // RSI near 50 (±5): RSI support level at 50
    const barRsi = rsi14(closes.slice(0, si+1));
    if (!barRsi || Math.abs(barRsi - 50) > 5) continue;
    // Bullish candle pattern
    const atrV = atr14val ?? (bars[si].h - bars[si].l) * 2;
    const pattern = detectBullishCandle(bars[si].o, bars[si].h, bars[si].l, bars[si].c, prevBar.o, prevBar.c, atrV);
    if (!pattern) continue;
    // Stop loss = 1% below lowest low in last 5 bars
    const stopLoss = Math.min(...lows.slice(Math.max(0, si-4), si+1)) * 0.99;
    return { hit: true, details: {
      strategy: 'S4B', signalBar: bars[si].date,
      gapPct: Math.round(gapPct*1000)/10, rsi: barRsi,
      rsiSupportLevel: 50, candlePattern: pattern,
      stopLoss: Math.round(stopLoss*100)/100, cmp: bars[si].c,
    }};
  }
  return { hit: false, details: {} };
}

// ── S5A: Minervini Winning Stocks ─────────────────────────────────────────────
function evalS5A(bars: Bar[]): { hit: boolean; details: Record<string, any> } {
  const n = bars.length;
  if (n < 60) return { hit: false, details: {} };
  const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
  const cmp = closes[n-1];
  // Price floor: ≥50
  if (cmp < 50) return { hit: false, details: {} };
  // 52-week high/low
  const window252 = Math.min(n, 252);
  const high52w = Math.max(...highs.slice(-window252));
  const low52w = Math.min(...lows.slice(-window252));
  // Within 25% of 52W high
  const discountFrom52High = (high52w - cmp) / high52w * 100;
  if (discountFrom52High > 25) return { hit: false, details: {} };
  // At least 100% above 52W low
  const gainFrom52Low = (cmp - low52w) / low52w * 100;
  if (gainFrom52Low < 100) return { hit: false, details: {} };
  // SMA50 and SMA200
  const sma50val = sma(closes, 50), sma200val = sma(closes, 200);
  if (!sma50val || !sma200val) return { hit: false, details: {} };
  // Price above SMA200
  if (cmp <= sma200val) return { hit: false, details: {} };
  // SMA50 above SMA200
  if (sma50val <= sma200val) return { hit: false, details: {} };
  // SMA200 rising: current > 65 bars ago
  const sma200_65ago = sma(closes.slice(0, n-65), 200);
  if (!sma200_65ago || sma200val <= sma200_65ago) return { hit: false, details: {} };
  // VCP: ATR contraction (current ATR < 20-day avg ATR)
  const atrSeries: number[] = [];
  for (let i = 1; i < n; i++) atrSeries.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
  const atr20cur = atrSeries.length >= 20 ? atrSeries.slice(-20).reduce((a,b)=>a+b,0)/20 : null;
  const atr20prev = atrSeries.length >= 40 ? atrSeries.slice(-40,-20).reduce((a,b)=>a+b,0)/20 : null;
  const atrContracting = atr20cur && atr20prev ? atr20cur < atr20prev : true;
  // Volume contraction on pullback
  const vol20avg = sma(vols, 20) ?? 1;
  const volRatio = vols[n-1] / vol20avg;
  const volContracting = volRatio < 1.0;
  // Entry trigger: close above prior swing high (swing high = max of last 5-25 bars excluding last 2)
  const prevSwingHigh = Math.max(...highs.slice(Math.max(0, n-25), n-2));
  const breakingOut = cmp >= prevSwingHigh * 0.98; // within 2% of prior swing high counts as breakout zone
  if (!atrContracting && !volContracting) return { hit: false, details: {} };
  if (!breakingOut) return { hit: false, details: {} };
  // ATR-based stop loss (2×ATR20)
  const atr20val = atrSeries.slice(-20).reduce((a,b)=>a+b,0)/20;
  const stopLoss = cmp - 2 * atr20val;
  const barRsi = rsi14(closes);
  return { hit: true, details: {
    strategy: 'S5A', signalBar: bars[n-1].date,
    high52w: Math.round(high52w*100)/100, low52w: Math.round(low52w*100)/100,
    discountFrom52High: Math.round(discountFrom52High*10)/10,
    gainFrom52Low: Math.round(gainFrom52Low*10)/10,
    sma50: Math.round(sma50val*100)/100, sma200: Math.round(sma200val*100)/100,
    prevSwingHigh: Math.round(prevSwingHigh*100)/100,
    atrCompressionRatio: atr20cur && atr20prev ? Math.round((atr20cur/atr20prev)*100)/100 : null,
    supplyDryUpRatio: Math.round(volRatio*100)/100,
    stopLoss: Math.round(stopLoss*100)/100,
    rsi: barRsi, cmp,
  }};
}

// ── Stage 1: resolve 90 trading sessions ──────────────────────────────────────
const SCAN_DATE = new Date().toISOString().slice(0, 10);
const tradingDatesRows = db.prepare(`
  SELECT DISTINCT trade_date FROM DailyOHLCV
  WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT 90
`).all(SCAN_DATE) as any[];
const tradingDates = tradingDatesRows.map((r: any) => r.trade_date).reverse();
process.stderr.write(`[orchestrator] Resolved ${tradingDates.length} trading sessions. Latest: ${tradingDates[tradingDates.length-1]}\n`);

// ── Stage 2 & 3: Load lookup maps ─────────────────────────────────────────────
const f1f7Map = new Map<string, any>();
(db.prepare(`
  SELECT f.* FROM strategy_fundamental_filter_results f
  INNER JOIN (SELECT symbol, MAX(evaluated_at) latest FROM strategy_fundamental_filter_results GROUP BY symbol) m
  ON f.symbol=m.symbol AND f.evaluated_at=m.latest
`).all() as any[]).forEach((r: any) => f1f7Map.set(r.symbol, r));

const tickerMap = new Map<string, any>();
(db.prepare('SELECT symbol, company_name, sector, upstox_key_nse, upstox_key_bse FROM MasterTickers').all() as any[]).forEach((r: any) => tickerMap.set(r.symbol, r));

// Scan ALL symbols with recent OHLCV (not just those with F1-F7 data)
const symbolRows = db.prepare(`
  SELECT DISTINCT symbol FROM DailyOHLCV
  WHERE trade_date >= '2026-10-01'
  ORDER BY symbol
`).all() as any[];
const symbols = symbolRows.map((r: any) => r.symbol as string);
process.stderr.write(`[orchestrator] Scanning ${symbols.length} symbols for all 7 strategies...\n`);

const scanResults: any[] = [];
let processed = 0;
for (const sym of symbols) {
  processed++;
  if (processed % 500 === 0) process.stderr.write(`[orchestrator] ${processed}/${symbols.length}...\n`);

  // Load the LATEST 300 bars (DESC LIMIT then re-sort ASC so strategies get chronological order)
  const bars = (db.prepare(`
    SELECT date, o, h, l, c, v FROM (
      SELECT trade_date as date, open as o, high as h, low as l, close as c, volume as v
      FROM DailyOHLCV WHERE symbol=? ORDER BY trade_date DESC LIMIT 300
    ) ORDER BY date ASC
  `).all(sym) as Bar[]);
  if (bars.length < 50) continue;

  // Run all 7 strategies
  const s1aR = evalS1A(bars);
  const s1bR = evalS1B(bars);
  const s2aR = evalS2A(bars);
  const s3aR = evalS3A(bars);
  const s4aR = evalS4A(bars);
  const s4bR = evalS4B(bars);
  const s5aR = evalS5A(bars);

  if (!s1aR.hit && !s1bR.hit && !s2aR.hit && !s3aR.hit && !s4aR.hit && !s4bR.hit && !s5aR.hit) continue;

  const signals: string[] = [];
  if (s1aR.hit) signals.push('S1A');
  if (s1bR.hit) signals.push('S1B');
  if (s2aR.hit) signals.push('S2A');
  if (s3aR.hit) signals.push('S3A');
  if (s4aR.hit) signals.push('S4A');
  if (s4bR.hit) signals.push('S4B');
  if (s5aR.hit) signals.push('S5A');

  const f = f1f7Map.get(sym), ticker = tickerMap.get(sym);
  const closes = bars.map(b => b.c), vols = bars.map(b => b.v), highs = bars.map(b => b.h);
  const cmp = closes[closes.length-1];
  const sma20val = sma(closes, 20), sma50val = sma(closes, 50), rsiCur = rsi14(closes);
  const vol20avg = sma(vols, 20) ?? 1, latestVol = vols[vols.length-1];
  const high52w = Math.max(...highs.slice(-252));
  const pctFrom52wH = high52w > 0 ? Math.round(((cmp-high52w)/high52w)*1000)/10 : null;
  const volSurge = Math.round((latestVol/vol20avg)*100)/100;
  const last90 = bars.slice(-90), last90C = last90.map(b => b.c);
  const price90dAgo = last90C[0] ?? cmp;
  const return90d = Math.round(((cmp-price90dAgo)/price90dAgo)*1000)/10;
  const minC = Math.min(...last90C), maxC = Math.max(...last90C);
  const sparkline = last90C.map(c => maxC>minC ? Math.round(((c-minC)/(maxC-minC))*100) : 50);

  // F1-F7 filters (enrichment from 9-source waterfall)
  const filters = f ? {
    F1_promoter: f.promoter_pct != null && f.promoter_pct >= 66.6,
    F2_roce: f.roce_pct != null && f.roce_pct >= 35,
    F3_roe: f.roe_pct != null && f.roe_pct >= 25,
    F4_profitable8q: f.profitable_last_8_quarters===1 || (f.profitable_quarter_count ?? 0) >= 8,
    F5_cashflow: f.cash_flow_to_operating_profit != null ? f.cash_flow_to_operating_profit >= 0.5 : null,
    F6_noPledge: f.pledged_pct != null ? f.pledged_pct === 0 : null,
    F7_institutional: f.institutional_involvement_pass === 1,
  } : null;
  const passCount = filters ? Object.values(filters).filter(v => v === true).length : 0;

  // Strategy signal details
  const strategyDetails: Record<string, any> = {};
  if (s1aR.hit) strategyDetails.s1aDetails = s1aR.details;
  if (s1bR.hit) strategyDetails.s1bDetails = s1bR.details;
  if (s2aR.hit) strategyDetails.s2aDetails = s2aR.details;
  if (s3aR.hit) strategyDetails.s3aDetails = s3aR.details;
  if (s4aR.hit) strategyDetails.s4aDetails = s4aR.details;
  if (s4bR.hit) strategyDetails.s4bDetails = s4bR.details;
  if (s5aR.hit) strategyDetails.s5aDetails = s5aR.details;

  scanResults.push({
    symbol: sym,
    companyName: ticker?.company_name ?? sym,
    sector: f?.sector ?? ticker?.sector ?? '—',
    cmp, rsi: rsiCur,
    sma20: sma20val ? Math.round(sma20val*100)/100 : null,
    sma50: sma50val ? Math.round(sma50val*100)/100 : null,
    aboveSma20: sma20val ? cmp > sma20val : false,
    aboveSma50: sma50val ? cmp > sma50val : false,
    high52w: Math.round(high52w*100)/100, pctFrom52wHigh: pctFrom52wH,
    volSurge, return90d, signals,
    promoterPct: f?.promoter_pct ?? null, rocePct: f?.roce_pct ?? null, roePct: f?.roe_pct ?? null,
    pledgedPct: f?.pledged_pct ?? null, cfRatio: f?.cash_flow_to_operating_profit ?? null,
    profitableQuarters: f?.profitable_quarter_count ?? null,
    filters, passCount, sparkline,
    ...strategyDetails,
  });
}

scanResults.sort((a, b) => b.passCount - a.passCount || b.signals.length - a.signals.length || (b.return90d??-999) - (a.return90d??-999));

process.stderr.write(`[orchestrator] Technical scan complete — ${scanResults.length} candidates found.\n`);

// ── Stage 4: Persist to dossier tables ─────────────────────────────────────────
const dossierRunId = generateId('DR');
db.prepare(`
  INSERT INTO dossier_runs (dossierRunId, requestMode, requestedTradingSessions, actualTradingDates, scanAsOf, createdAt, status)
  VALUES (?, '90D_LOOKBACK_7STRAT', 90, ?, ?, ?, 'COMPLETED')
`).run(dossierRunId, JSON.stringify(tradingDates), SCAN_DATE, new Date().toISOString());

const strategyNames: Record<string, string> = {
  S1A: 'VPA_3_LEG_RECLAIM',
  S1B: 'VPA_TROUGH_REVERSAL',
  S2A: 'INSTITUTIONAL_FVG_CE',
  S3A: 'HH_HL_SMA50_STRUCTURE',
  S4A: 'GAP_RUNNING_STOCKS',
  S4B: 'GAP_RSI_SUPPORT',
  S5A: 'MINERVINI_WINNING_STOCKS',
};

let totalSignals = 0;
for (const s of scanResults) {
  const candidateId = generateId('CAN');
  db.prepare(`
    INSERT INTO dossier_candidates (candidateId, dossierRunId, symbol, convergenceCount, status)
    VALUES (?, ?, ?, ?, 'ANALYZED')
  `).run(candidateId, dossierRunId, s.symbol, s.signals.length);
  for (const sig of s.signals) {
    const signalId = generateId('SIG');
    db.prepare(`
      INSERT INTO dossier_signals (signalId, candidateId, dossierRunId, symbol, strategyId, strategyName, signalDate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(signalId, candidateId, dossierRunId, s.symbol, sig, strategyNames[sig] ?? sig, SCAN_DATE);
    totalSignals++;
  }
}

db.close();

// Signal counts per strategy
const signalCounts: Record<string, number> = {};
for (const s of scanResults) {
  for (const sig of s.signals) signalCounts[sig] = (signalCounts[sig] ?? 0) + 1;
}

process.stderr.write(`[orchestrator] Done — ${scanResults.length} candidates, ${totalSignals} signals. Run: ${dossierRunId}\n`);
process.stderr.write(`[orchestrator] Signal breakdown: ${JSON.stringify(signalCounts)}\n`);

console.log(JSON.stringify({
  scanDate: SCAN_DATE, dossierRunId,
  totalScanned: symbols.length, hits: scanResults.length,
  tradingSessionsResolved: tradingDates.length,
  signalCounts,
  stocks: scanResults,
}, null, 0));
