/**
 * MarketDataQueryService.ts
 * Clean-Room StockScans Parity Engine — Discovery & Breadth Layer
 * 
 * Powered by DuckDB adjusted OHLCV store.
 * Strictly deterministic, zero synthetic numbers, full data provenance.
 * Non-negotiable policy: Never returns zero performance for missing custom-index data.
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { DuckDbAdjustedOhlcvService, AdjustedOhlcvBar } from '../DuckDbAdjustedOhlcvService.js';
import { NIFTY_LARGECAP_100, NIFTY_MIDCAP_150 } from '../MasterIndianUniverseService.js';
import {
  UniverseId,
  UniverseSnapshot,
  UniverseCoverageSummary,
  MissingConstituentPolicy,
  CustomIndexConstituent,
  CustomIndexResult,
  DataStatus,
  Provenance
} from '../../../types/stockscans.js';

export interface BreadthMetrics {
  asOf: string;
  dataSource: 'DUCKDB_ADJUSTED';
  formulaVersion: string;
  universe: UniverseCoverageSummary;
  parameters: Record<string, unknown>;
  coverage: {
    requested: number;
    eligible: number;
    matched: number;
    unavailable: number;
    gaps: string[];
  };
  indices: Array<{
    name: string;
    symbol: string;
    close: number;
    change1D: number;
    change1W: number;
    change1M: number;
    change1Y: number;
  }>;
  participation: {
    aboveEma20Pct: number;
    aboveEma50Pct: number;
    aboveEma100Pct: number;
    aboveEma200Pct: number;
    totalEvaluated: number;
  };
  thrust: {
    advancersCount: number;
    declinersCount: number;
    unchangedCount: number;
    advDecRatio: number;
    thrustUp4PctCount: number;
    thrustDown4PctCount: number;
    thrustUp4PctSymbols: Array<{ symbol: string; changePct: number; close: number }>;
    thrustDown4PctSymbols: Array<{ symbol: string; changePct: number; close: number }>;
  };
  extremes52W: {
    high52WCount: number;
    low52WCount: number;
    high52WSymbols: Array<{ symbol: string; close: number; high52W: number }>;
    low52WSymbols: Array<{ symbol: string; close: number; low52W: number }>;
  };
}

export interface ScanMatchItem {
  symbol: string;
  close: number;
  changePct: number;
  volume: number;
  matchReason: string;
  metrics: {
    rsi14?: number;
    ema20?: number;
    ema50?: number;
    ema200?: number;
    high52W?: number;
    low52W?: number;
    volRatio20?: number;
    roc20?: number;
  };
}

export interface ScanRunResult {
  runId: string;
  scanId: string;
  scanName: string;
  category: 'TECHNICAL' | 'MOMENTUM' | 'BREAKOUT' | 'VOLATILITY' | 'VOLUME' | 'STRUCTURE';
  asOf: string;
  dataSource: 'DUCKDB_ADJUSTED';
  formulaVersion: string;
  dataRevision: string;
  universeRevision: string;
  sourceSystem: 'DUCKDB';
  parameterHash: string;
  parameters: Record<string, unknown>;
  universe: UniverseCoverageSummary;
  coverage: {
    requested: number;
    eligible: number;
    matched: number;
    unavailable: number;
    gaps: string[];
  };
  status: DataStatus;
  noDataReason?: string | null;
  matches: ScanMatchItem[];
  executedAt: string;
}

export interface ReturnsBenchmarkSeries {
  symbol: string;
  isBenchmark: boolean;
  totalReturnPct: number;
  dataPoints: Array<{ date: string; returnPct: number; value: number }>;
  dataCompletenessPct: number;
  status: 'COMPLETE' | 'INCOMPLETE' | 'UNAVAILABLE';
}

export interface ReturnsBenchmarkResult {
  asOf: string;
  period: string;
  startDate: string;
  endDate: string;
  dataSource: 'DUCKDB_ADJUSTED';
  totalReturnCaveat: string;
  missingDataPolicy: string;
  series: ReturnsBenchmarkSeries[];
}

/**
 * Deterministic custom index calculation.
 * Returns UNAVAILABLE and null when constituents lack verified data.
 * Never fabricates zero returns.
 */
export function calculateIndex(
  constituents: CustomIndexConstituent[],
  bars: Array<{ symbol: string; trade_date?: string; date?: string; close_adjusted?: number; close?: number }>,
  missingPolicy: MissingConstituentPolicy = 'FAIL_IF_ANY_MISSING'
): CustomIndexResult {
  const covered = constituents.filter(c =>
    bars.some(b => b.symbol === c.symbol)
  );

  const coverage = {
    total: constituents.length,
    covered: covered.length,
    unavailable: constituents.length - covered.length,
    missingSymbols: constituents
      .filter(c => !covered.some(x => x.symbol === c.symbol))
      .map(c => c.symbol)
  };

  const constituentsCoverage = constituents.map(c => ({
    symbol: c.symbol,
    covered: covered.some(x => x.symbol === c.symbol),
    weight: covered.length > 0 ? Number((1 / covered.length).toFixed(4)) : 0
  }));

  if (covered.length === 0) {
    return {
      name: 'Custom Thematic Index',
      asOf: new Date().toISOString().split('T')[0],
      status: 'UNAVAILABLE',
      value: null,
      totalReturnPct: null,
      performance: null,
      series: [],
      coverage,
      constituentsCoverage,
      noDataReason: 'No constituents have verified price history',
      formulaVersion: '1.0.0',
      missingConstituentPolicy: missingPolicy
    };
  }

  if (missingPolicy === 'FAIL_IF_ANY_MISSING' && covered.length < constituents.length) {
    return {
      name: 'Custom Thematic Index',
      asOf: new Date().toISOString().split('T')[0],
      status: 'UNAVAILABLE',
      value: null,
      totalReturnPct: null,
      performance: null,
      series: [],
      coverage,
      constituentsCoverage,
      noDataReason: `Policy FAIL_IF_ANY_MISSING: ${coverage.unavailable} of ${coverage.total} constituents lack verified price history (${coverage.missingSymbols.join(', ')})`,
      formulaVersion: '1.0.0',
      missingConstituentPolicy: missingPolicy
    };
  }

  // Group bars by covered symbol
  const barMap = new Map<string, Array<{ trade_date: string; close_adjusted: number }>>();
  for (const b of bars) {
    const sym = b.symbol;
    if (!barMap.has(sym)) barMap.set(sym, []);
    const date = b.trade_date || b.date || '';
    const close = b.close_adjusted ?? b.close ?? 0;
    if (date && close > 0) {
      barMap.get(sym)!.push({ trade_date: date, close_adjusted: close });
    }
  }

  const coveredSyms = covered.map(c => c.symbol);
  const equalWeight = 1 / coveredSyms.length;

  // Align dates
  const dateSets = coveredSyms.map(s => new Set((barMap.get(s) || []).map(b => b.trade_date)));
  let commonDates = dateSets.length > 0 ? [...dateSets[0]] : [];
  for (let i = 1; i < dateSets.length; i++) {
    commonDates = commonDates.filter(d => dateSets[i].has(d));
  }
  commonDates.sort();

  if (commonDates.length === 0) {
    return {
      name: 'Custom Thematic Index',
      asOf: new Date().toISOString().split('T')[0],
      status: 'UNAVAILABLE',
      value: null,
      totalReturnPct: null,
      performance: null,
      series: [],
      coverage,
      constituentsCoverage,
      noDataReason: 'No overlapping trade dates found across covered constituents',
      formulaVersion: '1.0.0',
      missingConstituentPolicy: missingPolicy
    };
  }

  // Map base prices at commonDates[0]
  const basePrices = new Map<string, number>();
  for (const s of coveredSyms) {
    const b = barMap.get(s)?.find(row => row.trade_date === commonDates[0]);
    basePrices.set(s, b ? b.close_adjusted : 1);
  }

  const indexSeries: Array<{ date: string; indexValue: number; returnPct: number }> = [];
  for (const d of commonDates) {
    let sumNorm = 0;
    for (const s of coveredSyms) {
      const b = barMap.get(s)?.find(row => row.trade_date === d);
      const p = b ? b.close_adjusted : basePrices.get(s)!;
      const norm = (p / basePrices.get(s)!) * 100;
      sumNorm += norm * equalWeight;
    }
    const indexVal = Number(sumNorm.toFixed(2));
    const retPct = Number((indexVal - 100).toFixed(2));
    indexSeries.push({ date: d, indexValue: indexVal, returnPct: retPct });
  }

  const latest = indexSeries[indexSeries.length - 1];
  const prev1D = indexSeries[Math.max(0, indexSeries.length - 2)];
  const prev1W = indexSeries[Math.max(0, indexSeries.length - 6)];
  const prev1M = indexSeries[Math.max(0, indexSeries.length - 22)];
  const prev1Y = indexSeries[0];

  return {
    name: 'Custom Thematic Index',
    asOf: latest.date,
    status: 'VERIFIED',
    value: latest.indexValue,
    totalReturnPct: latest.returnPct,
    performance: {
      change1D: Number((((latest.indexValue - prev1D.indexValue) / prev1D.indexValue) * 100).toFixed(2)),
      change1W: Number((((latest.indexValue - prev1W.indexValue) / prev1W.indexValue) * 100).toFixed(2)),
      change1M: Number((((latest.indexValue - prev1M.indexValue) / prev1M.indexValue) * 100).toFixed(2)),
      change1Y: Number((((latest.indexValue - prev1Y.indexValue) / prev1Y.indexValue) * 100).toFixed(2))
    },
    series: indexSeries,
    coverage,
    constituentsCoverage,
    noDataReason: null,
    formulaVersion: '1.0.0',
    missingConstituentPolicy: missingPolicy
  };
}

export class MarketDataQueryService {
  private static readonly FORMULA_VERSION = '1.0.0';
  private static breadthCache: { timestamp: number; key: string; data: BreadthMetrics } | null = null;
  private static readonly CACHE_TTL_MS = 60_000;

  // Canonical liquid benchmark universe: NIFTY 100 LargeCap liquid universe
  public static getLiquidUniverse(): string[] {
    return [...NIFTY_LARGECAP_100].sort();
  }

  /**
   * Deterministic Universe Resolver
   */
  public static resolveUniverseSnapshot(
    universeId: UniverseId = 'NIFTY_100',
    customSymbols?: string[]
  ): UniverseSnapshot {
    let symbols: string[] = [];
    const asOf = new Date().toISOString().split('T')[0];
    const revision = `${asOf}T08:00:00Z`;

    if (universeId === 'CUSTOM' && customSymbols && customSymbols.length > 0) {
      symbols = [...new Set(customSymbols.map(s => s.trim().toUpperCase()))].sort();
    } else if (universeId === 'NIFTY_50') {
      symbols = [...NIFTY_LARGECAP_100].slice(0, 50).sort();
    } else if (universeId === 'NIFTY_100') {
      symbols = [...NIFTY_LARGECAP_100].sort();
    } else if (universeId === 'NIFTY_500') {
      symbols = [...new Set([...NIFTY_LARGECAP_100, ...NIFTY_MIDCAP_150])].sort();
    } else if (universeId === 'NSE_ALL_ACTIVE' || universeId === 'BSE_ALL_ACTIVE') {
      try {
        const evidencePath = path.resolve('data', 'fere', 'verified_filings', 'fere_evidence.db');
        if (fs.existsSync(evidencePath)) {
          const db = new Database(evidencePath, { readonly: true });
          const ex = universeId === 'NSE_ALL_ACTIVE' ? 'NSE' : 'BSE';
          const rows = db.prepare(`SELECT DISTINCT symbol FROM universe WHERE exchange = ? AND (status = 'Active' OR status IS NULL)`).all(ex) as any[];
          symbols = rows.map(r => String(r.symbol).toUpperCase()).sort();
        }
      } catch (err) {
        console.warn(`[MarketDataQueryService] Failed to load ${universeId} from SQLite:`, err);
      }
      if (symbols.length === 0) {
        symbols = [...NIFTY_LARGECAP_100].sort();
      }
    } else {
      symbols = [...NIFTY_LARGECAP_100].sort();
    }

    const prov: Provenance = {
      sourceSystem: 'DUCKDB',
      sourceTable: 'universe_security_master',
      sourceUrl: null,
      documentId: null,
      documentSha256: null,
      retrievedAt: asOf,
      asOf,
      formulaVersion: this.FORMULA_VERSION
    };

    return {
      universeId,
      revision,
      asOf,
      symbols,
      source: prov
    };
  }

  // Calculate EMA series
  public static calculateEMA(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    const ema: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    ema.push(sum / period);
    for (let i = period; i < values.length; i++) {
      const prev = ema[ema.length - 1];
      ema.push(values[i] * k + prev * (1 - k));
    }
    return ema;
  }

  // Calculate standard 14-period RSI
  public static calculateRSI(closes: number[], period = 14): number | undefined {
    if (closes.length < period + 1) return undefined;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const g = diff >= 0 ? diff : 0;
      const l = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Number((100 - (100 / (1 + rs))).toFixed(2));
  }

  /**
   * P0: Market Breadth Snapshot computed deterministically via DuckDB
   */
  public static async getBreadthSnapshot(universeParam?: string[] | UniverseId): Promise<BreadthMetrics> {
    const snapshot = this.resolveUniverseSnapshot(
      typeof universeParam === 'string' ? universeParam as UniverseId : (Array.isArray(universeParam) ? 'CUSTOM' : 'NIFTY_100'),
      Array.isArray(universeParam) ? universeParam : undefined
    );
    const universe = snapshot.symbols;
    const cacheKey = `${snapshot.universeId}:${universe.slice(0, 5).join(',')}:${universe.length}`;
    const now = Date.now();

    if (this.breadthCache && this.breadthCache.key === cacheKey && now - this.breadthCache.timestamp < this.CACHE_TTL_MS) {
      return this.breadthCache.data;
    }

    // Benchmark indices to evaluate in parallel
    const benchmarkNames = ['NIFTY 50', 'NIFTY 500', 'NIFTY BANK', 'NIFTY IT'];
    const indexResults: BreadthMetrics['indices'] = [];

    const indexBarsList = await Promise.all(
      benchmarkNames.map(bName =>
        DuckDbAdjustedOhlcvService.getDailyBars(bName, 260)
          .then(bars => ({ bName, bars }))
          .catch(() => ({ bName, bars: null }))
      )
    );

    for (const { bName, bars } of indexBarsList) {
      if (bars && bars.length > 1) {
        const latest = bars[bars.length - 1];
        const prev1D = bars[bars.length - 2];
        const prev1W = bars[Math.max(0, bars.length - 6)];
        const prev1M = bars[Math.max(0, bars.length - 22)];
        const prev1Y = bars[0];

        indexResults.push({
          name: bName,
          symbol: bName,
          close: Number(latest.close_adjusted.toFixed(2)),
          change1D: Number((((latest.close_adjusted - prev1D.close_adjusted) / prev1D.close_adjusted) * 100).toFixed(2)),
          change1W: Number((((latest.close_adjusted - prev1W.close_adjusted) / prev1W.close_adjusted) * 100).toFixed(2)),
          change1M: Number((((latest.close_adjusted - prev1M.close_adjusted) / prev1M.close_adjusted) * 100).toFixed(2)),
          change1Y: Number((((latest.close_adjusted - prev1Y.close_adjusted) / prev1Y.close_adjusted) * 100).toFixed(2)),
        });
      }
    }

    // Query daily bars for the entire universe (260 bars for 52W high/low & EMA200)
    const { bars: barMap } = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(universe, 260);

    const eligible = universe.length;
    const gaps: string[] = [];
    let asOf = '';
    let aboveEma20Count = 0;
    let aboveEma50Count = 0;
    let aboveEma100Count = 0;
    let aboveEma200Count = 0;
    let validStockCount = 0;

    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;
    const thrustUp4: Array<{ symbol: string; changePct: number; close: number }> = [];
    const thrustDown4: Array<{ symbol: string; changePct: number; close: number }> = [];

    const highs52W: Array<{ symbol: string; close: number; high52W: number }> = [];
    const lows52W: Array<{ symbol: string; close: number; low52W: number }> = [];

    for (const sym of universe) {
      const symBars = barMap.get(sym);
      if (!symBars || symBars.length < 2) {
        gaps.push(sym);
        continue;
      }

      validStockCount++;
      const latestBar = symBars[symBars.length - 1];
      if (!asOf || latestBar.trade_date > asOf) {
        asOf = latestBar.trade_date;
      }

      const prevBar = symBars[symBars.length - 2];
      const close = latestBar.close_adjusted;
      const prevClose = prevBar.close_adjusted;
      const changePct = Number((((close - prevClose) / prevClose) * 100).toFixed(2));

      // Thrust metrics
      if (changePct > 0) advancers++;
      else if (changePct < 0) decliners++;
      else unchanged++;

      if (changePct >= 4.0) {
        thrustUp4.push({ symbol: sym, changePct, close });
      } else if (changePct <= -4.0) {
        thrustDown4.push({ symbol: sym, changePct, close });
      }

      // Moving Averages
      const closes = symBars.map(b => b.close_adjusted);
      if (closes.length >= 20) {
        const ema20 = this.calculateEMA(closes, 20);
        if (close >= ema20[ema20.length - 1]) aboveEma20Count++;
      }
      if (closes.length >= 50) {
        const ema50 = this.calculateEMA(closes, 50);
        if (close >= ema50[ema50.length - 1]) aboveEma50Count++;
      }
      if (closes.length >= 100) {
        const ema100 = this.calculateEMA(closes, 100);
        if (close >= ema100[ema100.length - 1]) aboveEma100Count++;
      }
      if (closes.length >= 200) {
        const ema200 = this.calculateEMA(closes, 200);
        if (close >= ema200[ema200.length - 1]) aboveEma200Count++;
      }

      // 52-Week High / Low (using last 250 bars)
      const lookback52W = symBars.slice(-250);
      const high52W = Math.max(...lookback52W.map(b => b.high_adjusted || b.close_adjusted));
      const low52W = Math.min(...lookback52W.map(b => b.low_adjusted || b.close_adjusted));

      if (close >= high52W * 0.995) {
        highs52W.push({ symbol: sym, close, high52W: Number(high52W.toFixed(2)) });
      }
      if (close <= low52W * 1.005) {
        lows52W.push({ symbol: sym, close, low52W: Number(low52W.toFixed(2)) });
      }
    }

    const matched = validStockCount;
    const participationTotal = Math.max(matched, 1);
    const advDecRatio = decliners === 0 ? advancers : Number((advancers / decliners).toFixed(2));

    const breadth: BreadthMetrics = {
      asOf: asOf || snapshot.asOf,
      dataSource: 'DUCKDB_ADJUSTED',
      formulaVersion: this.FORMULA_VERSION,
      universe: {
        id: snapshot.universeId,
        revision: snapshot.revision,
        requested: snapshot.symbols.length,
        eligible,
        unavailable: gaps.length
      },
      parameters: {
        universeId: snapshot.universeId,
        universeRevision: snapshot.revision,
        eligibleUniverseSize: eligible,
        lookbackBars: 260,
        emaPeriods: [20, 50, 100, 200],
        thrustThresholdPct: 4.0,
        highLowTolerancePct: 0.5
      },
      coverage: {
        requested: snapshot.symbols.length,
        eligible,
        matched,
        unavailable: gaps.length,
        gaps
      },
      indices: indexResults,
      participation: {
        aboveEma20Pct: Number(((aboveEma20Count / participationTotal) * 100).toFixed(1)),
        aboveEma50Pct: Number(((aboveEma50Count / participationTotal) * 100).toFixed(1)),
        aboveEma100Pct: Number(((aboveEma100Count / participationTotal) * 100).toFixed(1)),
        aboveEma200Pct: Number(((aboveEma200Count / participationTotal) * 100).toFixed(1)),
        totalEvaluated: matched
      },
      thrust: {
        advancersCount: advancers,
        declinersCount: decliners,
        unchangedCount: unchanged,
        advDecRatio,
        thrustUp4PctCount: thrustUp4.length,
        thrustDown4PctCount: thrustDown4.length,
        thrustUp4PctSymbols: thrustUp4.sort((a, b) => b.changePct - a.changePct),
        thrustDown4PctSymbols: thrustDown4.sort((a, b) => a.changePct - b.changePct)
      },
      extremes52W: {
        high52WCount: highs52W.length,
        low52WCount: lows52W.length,
        high52WSymbols: highs52W.sort((a, b) => b.close - a.close),
        low52WSymbols: lows52W.sort((a, b) => a.close - b.close)
      }
    };

    this.breadthCache = { timestamp: now, key: cacheKey, data: breadth };
    return breadth;
  }

  /**
   * P0: Deterministic Prebuilt Technical & Declarative Scans
   */
  public static async runScan(
    scanId: string,
    customParams: Record<string, unknown> = {}
  ): Promise<ScanRunResult> {
    const requestedUniverseId = (customParams.universeId as UniverseId) || (customParams.universe ? 'CUSTOM' : 'NIFTY_100');
    const snapshot = this.resolveUniverseSnapshot(
      requestedUniverseId,
      customParams.universe as string[] | undefined
    );
    const universe = snapshot.symbols;

    const { bars: rawBarMap } = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(universe, 520);
    // Date-bounded scan: evaluate the latest available candle within the
    // requested window (the OHLCV store itself remains fully up to date).
    const fromDate = typeof customParams.fromDate === 'string' ? customParams.fromDate : undefined;
    const toDate = typeof customParams.toDate === 'string' ? customParams.toDate : undefined;
    const barMap = new Map<string, typeof rawBarMap extends Map<any, infer V> ? V : never>();
    for (const [symbol, rows] of rawBarMap.entries()) {
      const filtered = rows.filter((row: any) => (!fromDate || row.trade_date >= fromDate) && (!toDate || row.trade_date <= toDate));
      barMap.set(symbol, filtered as any);
    }

    const matches: ScanMatchItem[] = [];
    const gaps: string[] = [];
    let asOf = '';

    for (const sym of universe) {
      const bars = barMap.get(sym);
      if (!bars || bars.length < 25) {
        gaps.push(sym);
        continue;
      }

      const latest = bars[bars.length - 1];
      if (!asOf || latest.trade_date > asOf) asOf = latest.trade_date;

      const prev = bars[bars.length - 2];
      const close = latest.close_adjusted;
      const prevClose = prev.close_adjusted;
      const changePct = Number((((close - prevClose) / prevClose) * 100).toFixed(2));
      const volume = latest.volume_raw;

      const closes = bars.map(b => b.close_adjusted);
      const ema20Arr = this.calculateEMA(closes, 20);
      const ema50Arr = this.calculateEMA(closes, 50);
      const ema200Arr = closes.length >= 200 ? this.calculateEMA(closes, 200) : [];
      const rsi = this.calculateRSI(closes, 14);

      const ema20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : undefined;
      const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : undefined;
      const ema200 = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : undefined;

      const lookback52W = bars.slice(-250);
      const high52W = Math.max(...lookback52W.map(b => b.high_adjusted || b.close_adjusted));
      const low52W = Math.min(...lookback52W.map(b => b.low_adjusted || b.close_adjusted));

      const vol20Lookback = bars.slice(-20);
      const avgVol20 = vol20Lookback.reduce((acc, b) => acc + b.volume_raw, 0) / vol20Lookback.length;
      const volRatio20 = avgVol20 > 0 ? Number((volume / avgVol20).toFixed(2)) : 1;

      const roc20 = closes.length >= 21 ? Number((((close - closes[closes.length - 21]) / closes[closes.length - 21]) * 100).toFixed(2)) : 0;

      const metricsObj = {
        rsi14: rsi,
        ema20: ema20 ? Number(ema20.toFixed(2)) : undefined,
        ema50: ema50 ? Number(ema50.toFixed(2)) : undefined,
        ema200: ema200 ? Number(ema200.toFixed(2)) : undefined,
        high52W: Number(high52W.toFixed(2)),
        low52W: Number(low52W.toFixed(2)),
        volRatio20,
        roc20
      };

      let matched = false;
      let reason = '';

      switch (scanId) {
        case 'MOVERS_4PCT':
          if (changePct >= 4.0) {
            matched = true;
            reason = `Up +${changePct}% on volume ${volRatio20}x 20DMA`;
          }
          break;

        case 'FALLERS_4PCT':
          if (changePct <= -4.0) {
            matched = true;
            reason = `Down ${changePct}% on volume ${volRatio20}x 20DMA`;
          }
          break;

        case '52W_HIGH_BREAKOUT':
          if (close >= high52W * 0.995) {
            matched = true;
            reason = `Near/at 52W High (₹${high52W.toFixed(2)}) with RSI ${rsi || 'N/A'}`;
          }
          break;

        case '52W_LOW_BREAKDOWN':
          if (close <= low52W * 1.005) {
            matched = true;
            reason = `Near/at 52W Low (₹${low52W.toFixed(2)}) with RSI ${rsi || 'N/A'}`;
          }
          break;

        case 'GOLDEN_CROSS':
          if (ema50 && ema200 && ema50 >= ema200 && ema50Arr[ema50Arr.length - 2] < ema200Arr[ema200Arr.length - 2]) {
            matched = true;
            reason = `EMA50 crossed above EMA200 (Golden Cross)`;
          }
          break;

        case 'DEATH_CROSS':
          if (ema50 && ema200 && ema50 <= ema200 && ema50Arr[ema50Arr.length - 2] > ema200Arr[ema200Arr.length - 2]) {
            matched = true;
            reason = `EMA50 crossed below EMA200 (Death Cross)`;
          }
          break;

        case 'RSI_OVERSOLD':
          if (rsi !== undefined && rsi < 30) {
            matched = true;
            reason = `RSI(14) oversold at ${rsi}`;
          }
          break;

        case 'RSI_OVERBOUGHT':
          if (rsi !== undefined && rsi > 70) {
            matched = true;
            reason = `RSI(14) overbought at ${rsi}`;
          }
          break;

        case 'VOLUME_SURGE':
          if (volRatio20 >= 2.5 && changePct > 0) {
            matched = true;
            reason = `Volume surge ${volRatio20}x 20DMA with +${changePct}% gain`;
          }
          break;

        case 'CUSTOM': {
          const minPrice = Number(customParams.minPrice || 0);
          const maxPrice = Number(customParams.maxPrice || Infinity);
          const minChangePct = Number(customParams.minChangePct || -Infinity);
          const minVolRatio = Number(customParams.minVolRatio || 0);
          const requireAboveEma50 = Boolean(customParams.requireAboveEma50);

          if (close >= minPrice && close <= maxPrice && changePct >= minChangePct && volRatio20 >= minVolRatio) {
            if (!requireAboveEma50 || (ema50 && close >= ema50)) {
              matched = true;
              reason = `Custom rule passed: ₹${close} (${changePct}%), ${volRatio20}x vol`;
            }
          }
          break;
        }

        default:
          throw new Error(`Unsupported scan ID: ${scanId}`);
      }

      if (matched) {
        matches.push({
          symbol: sym,
          close,
          changePct,
          volume,
          matchReason: reason,
          metrics: metricsObj
        });
      }
    }

    // Deterministic parameter hash
    const paramHash = crypto.createHash('sha256').update(JSON.stringify({ scanId, ...customParams })).digest('hex');

    const scanNames: Record<string, string> = {
      MOVERS_4PCT: '4% Movers (Bullish Thrust)',
      FALLERS_4PCT: '4% Fallers (Bearish Thrust)',
      '52W_HIGH_BREAKOUT': '52-Week High Breakout',
      '52W_LOW_BREAKDOWN': '52-Week Low Breakdown',
      GOLDEN_CROSS: 'Golden Cross (EMA 50 / 200)',
      DEATH_CROSS: 'Death Cross (EMA 50 / 200)',
      RSI_OVERSOLD: 'RSI Oversold (< 30)',
      RSI_OVERBOUGHT: 'RSI Overbought (> 70)',
      VOLUME_SURGE: 'Volume Surge (> 2.5x 20DMA)',
      CUSTOM: 'Custom Multi-Condition Scan'
    };

    const scanCategories: Record<string, 'TECHNICAL' | 'MOMENTUM' | 'BREAKOUT' | 'VOLATILITY' | 'VOLUME' | 'STRUCTURE'> = {
      MOVERS_4PCT: 'MOMENTUM',
      FALLERS_4PCT: 'MOMENTUM',
      '52W_HIGH_BREAKOUT': 'BREAKOUT',
      '52W_LOW_BREAKDOWN': 'BREAKOUT',
      GOLDEN_CROSS: 'STRUCTURE',
      DEATH_CROSS: 'STRUCTURE',
      RSI_OVERSOLD: 'VOLATILITY',
      RSI_OVERBOUGHT: 'VOLATILITY',
      VOLUME_SURGE: 'VOLUME',
      CUSTOM: 'TECHNICAL'
    };

    const runAsOf = asOf || snapshot.asOf;

    return {
      runId: `SCAN-${Date.now()}-${paramHash.slice(0, 8)}`,
      scanId,
      scanName: scanNames[scanId] || scanId,
      category: scanCategories[scanId] || 'TECHNICAL',
      asOf: runAsOf,
      dataSource: 'DUCKDB_ADJUSTED',
      formulaVersion: this.FORMULA_VERSION,
      dataRevision: runAsOf,
      universeRevision: snapshot.revision,
      sourceSystem: 'DUCKDB',
      parameterHash: paramHash,
      parameters: customParams,
      universe: {
        id: snapshot.universeId,
        revision: snapshot.revision,
        requested: snapshot.symbols.length,
        eligible: universe.length,
        unavailable: gaps.length
      },
      coverage: {
        requested: snapshot.symbols.length,
        eligible: universe.length,
        matched: matches.length,
        unavailable: gaps.length,
        gaps
      },
      status: matches.length > 0 ? 'VERIFIED' : 'PARTIAL',
      noDataReason: matches.length === 0 ? 'No securities matched scan criteria' : null,
      matches,
      executedAt: new Date().toISOString()
    };
  }

  /**
   * P1: Returns Benchmark Comparison Engine
   */
  public static getReturnsBenchmark(
    symbols: string[],
    period: '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'YTD' = '1Y'
  ): Promise<ReturnsBenchmarkResult> {
    return MarketDataQueryService.compareReturnsBenchmark(symbols, period);
  }

  public static async compareReturnsBenchmark(
    symbols: string[],
    period: '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'YTD' = '1Y'
  ): Promise<ReturnsBenchmarkResult> {
    const daysMap = { '1M': 35, '3M': 100, '6M': 190, '1Y': 380, '3Y': 1100, '5Y': 1850, 'YTD': 260 };
    const maxLookback = daysMap[period] || 380;

    const benchmarkSymbols = ['NIFTY 50'];
    const allSymbols = [...new Set([...symbols.map(s => s.trim().toUpperCase()), ...benchmarkSymbols])];

    const { bars: barMap } = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(allSymbols, maxLookback);

    const seriesList: ReturnsBenchmarkSeries[] = [];
    let overallStartDate = '';
    let overallEndDate = '';

    for (const sym of allSymbols) {
      const bars = barMap.get(sym);
      const isBenchmark = benchmarkSymbols.includes(sym);

      if (!bars || bars.length < 5) {
        seriesList.push({
          symbol: sym,
          isBenchmark,
          totalReturnPct: 0,
          dataPoints: [],
          dataCompletenessPct: 0,
          status: 'UNAVAILABLE'
        });
        continue;
      }

      // Filter by period
      let filteredBars = bars;
      if (period === 'YTD') {
        const currentYear = new Date().getFullYear().toString();
        filteredBars = bars.filter(b => b.trade_date.startsWith(currentYear));
        if (filteredBars.length < 2) filteredBars = bars.slice(-250);
      }

      const firstBar = filteredBars[0];
      const lastBar = filteredBars[filteredBars.length - 1];
      const baseClose = firstBar.close_adjusted;

      if (!overallStartDate || firstBar.trade_date < overallStartDate) overallStartDate = firstBar.trade_date;
      if (!overallEndDate || lastBar.trade_date > overallEndDate) overallEndDate = lastBar.trade_date;

      const dataPoints = filteredBars.map(b => ({
        date: b.trade_date,
        value: Number(b.close_adjusted.toFixed(2)),
        returnPct: Number((((b.close_adjusted - baseClose) / baseClose) * 100).toFixed(2))
      }));

      const finalReturn = dataPoints[dataPoints.length - 1].returnPct;
      const completeness = Number(((filteredBars.length / maxLookback) * 100).toFixed(1));

      seriesList.push({
        symbol: sym,
        isBenchmark,
        totalReturnPct: finalReturn,
        dataPoints,
        dataCompletenessPct: Math.min(completeness, 100),
        status: completeness >= 80 ? 'COMPLETE' : 'INCOMPLETE'
      });
    }

    return {
      asOf: overallEndDate || new Date().toISOString().split('T')[0],
      period,
      startDate: overallStartDate,
      endDate: overallEndDate,
      dataSource: 'DUCKDB_ADJUSTED',
      totalReturnCaveat: 'Excludes cash dividend reinvestment and tax friction. Adjusted prices reflect splits and bonus actions.',
      missingDataPolicy: 'Symbols with fewer than 5 trading bars are marked UNAVAILABLE.',
      series: seriesList
    };
  }

  /**
   * P1: Custom Index Calculator.
   * Never returns zero performance when constituent data is missing.
   */
  public static async calculateCustomIndex(
    constituents: Array<{ symbol: string; weight?: number }>,
    period: '1M' | '3M' | '6M' | '1Y' = '1Y',
    missingPolicy: MissingConstituentPolicy = 'FAIL_IF_ANY_MISSING'
  ): Promise<CustomIndexResult> {
    const syms = constituents.map(c => c.symbol.trim().toUpperCase());
    const days = period === '1M' ? 35 : period === '3M' ? 100 : period === '6M' ? 190 : 380;
    const { bars: barMap } = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(syms, days);

    const allBars: Array<{ symbol: string; trade_date: string; close_adjusted: number }> = [];
    for (const [sym, bList] of barMap.entries()) {
      if (bList && bList.length > 0) {
        for (const b of bList) {
          allBars.push({ symbol: sym, trade_date: b.trade_date, close_adjusted: b.close_adjusted });
        }
      }
    }

    return calculateIndex(constituents, allBars, missingPolicy);
  }
}
