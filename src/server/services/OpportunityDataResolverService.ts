/**
 * OpportunityDataResolverService.ts — v5.4.1 (Production Master)
 * 
 * Zero-Cost Local-First Market Data Provider for NRI WealthOS Opportunity Engine.
 * 
 * Priority Hierarchy:
 * 1. Permanent DuckDB corporate-action-adjusted catalog
 * 2. SQLite caches only when the catalog has no usable coverage
 * 3. Fallback to Yahoo/Upstox if local series is insufficient
 */

import { getDB, dbAll, dbGet } from '../database.js';
import { fetchTickerData, getYahooSymbol } from '../yahooFinance.js';
import { roundINR } from '../../lib/decimalUtils.js';
import { DuckDbAdjustedOhlcvService } from './DuckDbAdjustedOhlcvService.js';

export interface ResolvedCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  deliveryQty?: number;
  deliveryPct?: number;
}

export interface ResolvedMarketSnapshot {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  singleDayChangePct: number;
  turnover20DayAvgCr: number | null;
  latestDate: string;
  candles: ResolvedCandle[];
  dataSource: 'DUCKDB_ADJUSTED' | 'LOCAL_EXCHANGE_MASTER' | 'SQLITE_HISTORICAL_CACHE' | 'YAHOO_FALLBACK' | 'UPSTOX_FALLBACK';
  isLocalGroundTruth: boolean;
}

export class OpportunityDataResolverService {
  private static instance: OpportunityDataResolverService;
  private readonly duckdbBarsCache = new Map<string, { expiresAt: number; bars: ResolvedCandle[] }>();
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000;

  public static getInstance(): OpportunityDataResolverService {
    if (!OpportunityDataResolverService.instance) {
      OpportunityDataResolverService.instance = new OpportunityDataResolverService();
    }
    return OpportunityDataResolverService.instance;
  }

  private toResolvedCandles(rows: Array<{ trade_date: string; open_adjusted: number; high_adjusted: number; low_adjusted: number; close_adjusted: number; volume_raw: number }>): ResolvedCandle[] {
    return rows.map(r => ({ date: r.trade_date, open: Number(r.open_adjusted), high: Number(r.high_adjusted), low: Number(r.low_adjusted), close: Number(r.close_adjusted), volume: Number(r.volume_raw || 0) }));
  }

  /**
   * One bounded DuckDB bridge call per 500 symbols. Call before a full scan so
   * per-scrip evaluation is memory-only instead of spawning hundreds of Python
   * processes.
   */
  public async prewarmDuckDb(symbols: string[], minBars: number = 240): Promise<void> {
    const clean = [...new Set(symbols.map(symbol => symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '')).filter(Boolean))];
    const now = Date.now();
    const missing = clean.filter(symbol => {
      const cached = this.duckdbBarsCache.get(symbol);
      return !cached || cached.expiresAt <= now || cached.bars.length < minBars;
    });
    for (let offset = 0; offset < missing.length; offset += 500) {
      const batch = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(missing.slice(offset, offset + 500), Math.max(minBars, 260));
      for (const [symbol, rows] of batch.bars) {
        this.duckdbBarsCache.set(symbol, { expiresAt: now + OpportunityDataResolverService.CACHE_TTL_MS, bars: this.toResolvedCandles(rows) });
      }
    }
  }

  /**
   * Resolves complete historical candles and delivery metrics using local-first architecture
   */
  public async resolveMarketData(symbol: string, minBars: number = 240): Promise<ResolvedMarketSnapshot | null> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const db = getDB();

    // 1. Corporate-action-adjusted DuckDB first.
    try {
      let cached = this.duckdbBarsCache.get(cleanSym);
      if (!cached || cached.expiresAt <= Date.now()) {
        await this.prewarmDuckDb([cleanSym], minBars);
        cached = this.duckdbBarsCache.get(cleanSym);
      }
      if (cached && cached.bars.length >= minBars) {
        const candles = cached.bars;
        const latest = candles[candles.length - 1];
        const prev = candles[candles.length - 2] || latest;
        const last20 = candles.slice(-20);
        const validTurnoverCandles = last20.filter(c => c.volume != null);
        const avgTurnoverCr = validTurnoverCandles.length > 0 
          ? roundINR(validTurnoverCandles.reduce((total, c) => total + c.close * (c.volume as number) / 10000000, 0) / validTurnoverCandles.length)
          : null;
        return { symbol: cleanSym, currentPrice: latest.close, previousClose: prev.close, singleDayChangePct: roundINR(prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0), turnover20DayAvgCr: avgTurnoverCr, latestDate: latest.date, candles, dataSource: 'DUCKDB_ADJUSTED', isLocalGroundTruth: true };
      }
    } catch (err: unknown) {
      console.warn('[OpportunityDataResolverService] DuckDB lookup failed:', {
        symbol: cleanSym,
        error: err instanceof Error ? err.message : String(err),
        stage: 'DUCKDB_PRIMARY',
        recoverable: true
      });
    }

    // 2. SQLite fallback when DuckDB has no usable symbol coverage.
    try {
      const rows = await dbAll(db, `
        SELECT 
          d.date, d.open, d.high, d.low, d.close, d.volume,
          b.deliv_qty as deliveryQty, b.deliv_per as deliveryPct,
          b.turnover_lacs as turnoverLacs
        FROM DailyOHLCV d
        LEFT JOIN NseBhavcopy b ON d.symbol = b.symbol AND d.date = b.trade_date
        WHERE d.symbol = ? OR d.symbol = ?
        ORDER BY d.date ASC
      `, [cleanSym, `${cleanSym}.NS`]);

      if (rows && rows.length >= minBars) {
        const candles: ResolvedCandle[] = rows.map((r: any) => ({
          date: r.date,
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume || 0),
          deliveryQty: r.deliveryQty ? Number(r.deliveryQty) : undefined,
          deliveryPct: r.deliveryPct ? Number(r.deliveryPct) : undefined
        }));

        const latest = candles[candles.length - 1];
        const prev = candles.length > 1 ? candles[candles.length - 2] : latest;
        const changePct = prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0;

        // Calculate 20-day turnover
        const last20 = rows.slice(-20);
        let sumTurnoverCr = 0;
        for (const r of last20) {
          if (r.turnoverLacs) {
            sumTurnoverCr += (Number(r.turnoverLacs) / 100);
          } else {
            sumTurnoverCr += ((Number(r.close) * Number(r.volume || 0)) / 10000000);
          }
        }
        const avgTurnoverCr = last20.length > 0 ? roundINR(sumTurnoverCr / last20.length) : null;

        return {
          symbol: cleanSym,
          currentPrice: latest.close,
          previousClose: prev.close,
          singleDayChangePct: roundINR(changePct),
          turnover20DayAvgCr: avgTurnoverCr,
          latestDate: latest.date,
          candles,
          dataSource: 'LOCAL_EXCHANGE_MASTER',
          isLocalGroundTruth: true
        };
      }
    } catch (err: unknown) {
      console.warn('[OpportunityDataResolverService] SQLite DailyOHLCV lookup failed:', {
        symbol: cleanSym,
        error: err instanceof Error ? err.message : String(err),
        stage: 'SQLITE_PRIMARY',
        recoverable: true
      });
    }

    // 2. Try local HistoricalPrices table
    try {
      const histRows = await dbAll(db, `
        SELECT date, close_price as close, data_source
        FROM HistoricalPrices
        WHERE symbol = ? OR symbol = ?
        ORDER BY date ASC
      `, [cleanSym, `${cleanSym}.NS`]);

      if (histRows && histRows.length >= minBars) {
        const candles: ResolvedCandle[] = histRows.map((r: any) => ({
          date: r.date,
          open: Number(r.close),
          high: Number(r.close),
          low: Number(r.close),
          close: Number(r.close),
          volume: null
        }));

        const latest = candles[candles.length - 1];
        const prev = candles.length > 1 ? candles[candles.length - 2] : latest;
        const changePct = prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0;

        return {
          symbol: cleanSym,
          currentPrice: latest.close,
          previousClose: prev.close,
          singleDayChangePct: roundINR(changePct),
          turnover20DayAvgCr: null, // Removed verified baseline fallback
          latestDate: latest.date,
          candles,
          dataSource: 'SQLITE_HISTORICAL_CACHE',
          isLocalGroundTruth: true
        };
      }
    } catch (err: unknown) {
      console.warn('[OpportunityDataResolverService] SQLite HistoricalPrices lookup failed:', {
        symbol: cleanSym,
        error: err instanceof Error ? err.message : String(err),
        stage: 'SQLITE_SECONDARY',
        recoverable: true
      });
    }

    // 3. Fallback to Yahoo Finance / Upstox API
    try {
      const externalData = await fetchTickerData(cleanSym, 365 * 2, false);
      if (externalData && Array.isArray(externalData.closePrices) && externalData.closePrices.length >= minBars) {
        const candles: ResolvedCandle[] = externalData.closePrices.map((cp: any) => ({
          date: cp.date,
          open: cp.open ?? cp.close,
          high: cp.high ?? cp.close,
          low: cp.low ?? cp.close,
          close: cp.close,
          volume: cp.volume ?? null
        }));

        const latest = candles[candles.length - 1];
        const prev = candles.length > 1 ? candles[candles.length - 2] : latest;
        const changePct = prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0;

        return {
          symbol: cleanSym,
          currentPrice: externalData.regularMarketPrice || latest.close,
          previousClose: externalData.chartPreviousClose || prev.close,
          singleDayChangePct: roundINR(changePct),
          turnover20DayAvgCr: null,
          latestDate: latest.date,
          candles,
          dataSource: externalData.dataSource?.includes('Upstox') ? 'UPSTOX_FALLBACK' : 'YAHOO_FALLBACK',
          isLocalGroundTruth: false
        };
      }
    } catch (err: unknown) {
      console.warn('[OpportunityDataResolverService] External fallback failed:', {
        symbol: cleanSym,
        error: err instanceof Error ? err.message : String(err),
        stage: 'EXTERNAL_FALLBACK',
        recoverable: false
      });
    }

    return null;
  }
}
