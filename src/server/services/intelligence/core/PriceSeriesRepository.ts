/**
 * PriceSeriesRepository.ts — Constitution Article C4 & C6
 *
 * Dedicated repository for market price series, freshness tracking, and technical observation inputs.
 * Invariants:
 * - Technical observations are descriptive of market state, never predictive promises.
 * - Tracks priceAsOf, calculatedAt, lookbackWindow, and sourceSeriesHash.
 * - Stale prices cannot silently survive as fresh market levels.
 */

import Database from 'better-sqlite3';
import path from 'path';
import * as crypto from 'crypto';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

export interface PriceSeriesBar {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface MarketPriceState {
  symbol: string;
  securityId: string;
  latestPrice: number;
  priceAsOf: string;
  calculatedAt: string;
  freshness: 'FRESH' | 'CURRENT' | 'STALE' | 'UNKNOWN';
  lookbackWindow: string;
  sourceSeriesHash: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  observableSupportLevels: number[];
  observableResistanceLevels: number[];
  shortTermState: 'TRENDING_UP' | 'TRENDING_DOWN' | 'CONSOLIDATING' | 'VOLATILE';
  mediumTermState: 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'DECLINE';
  bars: PriceSeriesBar[];
}

export class PriceSeriesRepository {
  private static instance: PriceSeriesRepository;

  private constructor() {}

  public static getInstance(): PriceSeriesRepository {
    if (!PriceSeriesRepository.instance) {
      PriceSeriesRepository.instance = new PriceSeriesRepository();
    }
    return PriceSeriesRepository.instance;
  }

  /**
   * Retrieves the market price state and technical observations for a given security.
   */
  public async getMarketPriceState(
    identity: SecurityIdentity,
    asOfDate?: string
  ): Promise<MarketPriceState> {
    const sym = identity.nseSymbol || identity.bseCode || '';
    const isin = identity.isin;
    const cutoff = asOfDate || new Date().toISOString().split('T')[0];

    const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      // Query recent historical prices
      const rows = db.prepare(`
        SELECT date, close_price as close
        FROM HistoricalPrices
        WHERE symbol = ? AND date <= ?
        ORDER BY date DESC
        LIMIT 250
      `).all(sym, cutoff) as any[];

      const calculatedAt = new Date().toISOString();

      if (!rows || rows.length === 0) {
        // Fallback check in Prices table
        const altRows = db.prepare(`
          SELECT date, close, open, high, low, volume
          FROM Prices
          WHERE symbol = ? AND date <= ?
          ORDER BY date DESC
          LIMIT 250
        `).all(sym, cutoff) as any[];

        if (altRows && altRows.length > 0) {
          return this.computeStateFromBars(sym, isin, altRows, calculatedAt, cutoff);
        }

        // Return empty state
        return {
          symbol: sym,
          securityId: isin,
          latestPrice: 0,
          priceAsOf: cutoff,
          calculatedAt,
          freshness: 'UNKNOWN',
          lookbackWindow: '0d',
          sourceSeriesHash: 'NONE',
          fiftyTwoWeekHigh: 0,
          fiftyTwoWeekLow: 0,
          observableSupportLevels: [],
          observableResistanceLevels: [],
          shortTermState: 'CONSOLIDATING',
          mediumTermState: 'ACCUMULATION',
          bars: [],
        };
      }

      return this.computeStateFromBars(sym, isin, rows, calculatedAt, cutoff);
    } finally {
      try { db.close(); } catch {}
    }
  }

  private computeStateFromBars(
    sym: string,
    isin: string,
    rows: any[],
    calculatedAt: string,
    cutoff: string
  ): MarketPriceState {
    const bars: PriceSeriesBar[] = rows.map(r => ({
      date: r.date,
      close: Number(r.close),
      open: r.open ? Number(r.open) : undefined,
      high: r.high ? Number(r.high) : undefined,
      low: r.low ? Number(r.low) : undefined,
      volume: r.volume ? Number(r.volume) : undefined,
    }));

    const latest = bars[0];
    const latestPrice = latest.close;
    const priceAsOf = latest.date;

    // Freshness evaluation: compare price date with cutoff
    const cutoffDate = new Date(cutoff).getTime();
    const priceDate = new Date(priceAsOf).getTime();
    const daysDiff = Math.abs(cutoffDate - priceDate) / (1000 * 60 * 60 * 24);
    const freshness = daysDiff <= 10 ? 'FRESH' : daysDiff <= 30 ? 'CURRENT' : 'STALE';

    // 52-week high & low
    const closes = bars.map(b => b.close);
    const fiftyTwoWeekHigh = Math.max(...closes);
    const fiftyTwoWeekLow = Math.min(...closes);

    // Compute series hash
    const seriesPreimage = bars.slice(0, 30).map(b => `${b.date}:${b.close}`).join('|');
    const sourceSeriesHash = crypto.createHash('sha256').update(seriesPreimage).digest('hex');

    // Observable support & resistance clusters (observational from actual price distribution, never hardcoded per symbol)
    let observableSupportLevels = [Math.round(fiftyTwoWeekLow * 1.05)];
    let observableResistanceLevels = [Math.round(fiftyTwoWeekHigh * 0.98)];

    if (bars.length >= 5) {
      const sortedCloses = [...closes].sort((a, b) => a - b);
      const p15 = sortedCloses[Math.floor(sortedCloses.length * 0.15)];
      const p85 = sortedCloses[Math.floor(sortedCloses.length * 0.85)];
      observableSupportLevels = [Math.round(fiftyTwoWeekLow), Math.round(p15)];
      observableResistanceLevels = [Math.round(p85), Math.round(fiftyTwoWeekHigh)];
    }

    return {
      symbol: sym,
      securityId: isin,
      latestPrice,
      priceAsOf,
      calculatedAt,
      freshness,
      lookbackWindow: `${bars.length}d`,
      sourceSeriesHash,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      observableSupportLevels,
      observableResistanceLevels,
      shortTermState: latestPrice >= closes[Math.min(20, closes.length - 1)] ? 'TRENDING_UP' : 'CONSOLIDATING',
      mediumTermState: latestPrice >= fiftyTwoWeekLow * 1.3 ? 'MARKUP' : 'ACCUMULATION',
      bars,
    };
  }
}
