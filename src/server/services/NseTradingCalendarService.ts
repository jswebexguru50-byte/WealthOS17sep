/**
 * NseTradingCalendarService.ts
 *
 * Resolves actual NSE trading session dates from DuckDB adjusted OHLCV data.
 *
 * Two modes:
 *   Mode A: resolveLastNTradingSessions(n)     — last N completed sessions
 *   Mode B: resolveSessionsFromWindow(from, to) — sessions within a date range
 *
 * NO synthetic dates. NO weekend/holiday assumptions. Derived purely from
 * the distinct trade dates present in the canonical OHLCV store.
 */

import fs from 'fs';
import path from 'path';

import { DuckDbAdjustedOhlcvService } from './DuckDbAdjustedOhlcvService.js';
import { dbAll, getDB } from '../database.js';

export interface TradingSessionResolution {
  mode: 'LAST_N' | 'DATE_WINDOW';
  requestedN?: number;
  requestedFrom?: string;
  requestedTo?: string;
  resolvedDates: string[];       // ISO YYYY-MM-DD, ascending
  ohlcvAsOf: string;             // Latest trading date in entire store
  coverageStatus: 'FULL' | 'PARTIAL' | 'INSUFFICIENT';
  coverageNote: string;
}

export class NseTradingCalendarService {
  /**
   * Returns the last N completed NSE trading session dates.
   * Reads distinct trade dates from DuckDB OHLCV (canonical market-adjusted store).
   * 
   * Mode A — "last N trading sessions"
   */
  static async resolveLastNTradingSessions(n: number): Promise<TradingSessionResolution> {
    if (n < 1 || n > 365) {
      throw new Error(`Invalid N=${n}. Must be between 1 and 365.`);
    }

    const allDates = await NseTradingCalendarService.getAllTradingDatesDescending();

    if (allDates.length === 0) {
      return {
        mode: 'LAST_N',
        requestedN: n,
        resolvedDates: [],
        ohlcvAsOf: '',
        coverageStatus: 'INSUFFICIENT',
        coverageNote: 'No trading dates found in DuckDB OHLCV or SQLite IndexOHLCV stores.',
      };
    }

    const ohlcvAsOf = allDates[0]; // most recent
    const selected = allDates.slice(0, n).reverse(); // ascending order

    return {
      mode: 'LAST_N',
      requestedN: n,
      resolvedDates: selected,
      ohlcvAsOf,
      coverageStatus: selected.length >= n ? 'FULL' : 'PARTIAL',
      coverageNote:
        selected.length >= n
          ? `Resolved ${n} trading sessions ending ${ohlcvAsOf}.`
          : `Only ${selected.length} sessions available (requested ${n}).`,
    };
  }

  /**
   * Returns trading session dates within a calendar window.
   *
   * Mode B — "fromDate → toDate"
   */
  static async resolveSessionsFromWindow(
    fromDate: string,
    toDate: string
  ): Promise<TradingSessionResolution> {
    const allDates = await NseTradingCalendarService.getAllTradingDatesDescending();
    const ohlcvAsOf = allDates[0] ?? '';

    const filtered = allDates
      .filter((d) => d >= fromDate && d <= toDate)
      .sort(); // ascending

    return {
      mode: 'DATE_WINDOW',
      requestedFrom: fromDate,
      requestedTo: toDate,
      resolvedDates: filtered,
      ohlcvAsOf,
      coverageStatus: filtered.length > 0 ? 'FULL' : 'INSUFFICIENT',
      coverageNote:
        filtered.length > 0
          ? `Resolved ${filtered.length} sessions from ${fromDate} to ${toDate}.`
          : `No sessions found between ${fromDate} and ${toDate}.`,
    };
  }

  /**
   * Returns all known distinct trading dates in descending order (latest first).
   * Derived from the DuckDB OHLCV store across a broad enough sample of symbols
   * to reliably cover every actual trading day.
   */
  private static async getAllTradingDatesDescending(): Promise<string[]> {
    try {
      // Use NIFTY 50 index (or any liquid symbol) to get distinct trading dates.
      // We request a wide window (500 bars) to get plenty of history.
      // We query directly from a reliable large-cap. Use RELIANCE as a stable proxy.
      // If RELIANCE is unavailable, fall back to HDFCBANK or TCS.
      const fallbackSymbols = ['RELIANCE', 'HDFCBANK', 'TCS', 'INFY', 'NIFTYBEES'];

      for (const sym of fallbackSymbols) {
        try {
          const bars = await DuckDbAdjustedOhlcvService.getDailyBars(sym, 500);
          if (bars && bars.length > 0) {
            // Extract distinct dates in descending order
            const dates = [...new Set(bars.map((b) => b.trade_date).filter(Boolean))].sort((a, b) =>
              String(b).localeCompare(String(a))
            );
            if (dates.length > 0) return dates.map(String);
          }
        } catch {
          continue;
        }
      }

      const fallbackDates = await NseTradingCalendarService.getTradingDatesFromLocalStores();
      if (fallbackDates.length > 0) return fallbackDates;

      return [];
    } catch (err: any) {
      console.error('[NseTradingCalendarService] Error resolving trading dates:', err?.message);
      return NseTradingCalendarService.getTradingDatesFromLocalStores().catch(() => []);
    }
  }

  private static async getTradingDatesFromLocalStores(): Promise<string[]> {
    const [sqliteDates, manifestDates] = await Promise.all([
      NseTradingCalendarService.getTradingDatesFromSqliteIndexOhlcv(),
      Promise.resolve(NseTradingCalendarService.getTradingDatesFromKiteAdjustedManifest()),
    ]);

    return [...new Set([...sqliteDates, ...manifestDates])]
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 500);
  }

  /**
   * Deterministic fallback when the DuckDB/Python bridge is unavailable.
   *
   * IndexOHLCV is populated from locally ingested exchange/index OHLCV and stores
   * exact trade_date values. This is not a weekend/holiday heuristic; it only
   * returns dates that are already present in the app database.
   */
  private static async getTradingDatesFromSqliteIndexOhlcv(): Promise<string[]> {
    try {
      const rows = await dbAll<{ trade_date: string }>(
        getDB(),
        `
          SELECT DISTINCT trade_date
          FROM IndexOHLCV
          WHERE trade_date IS NOT NULL
            AND trade_date GLOB '????-??-??'
          ORDER BY trade_date DESC
          LIMIT 500
        `
      );
      return rows.map((r) => String(r.trade_date)).filter(Boolean);
    } catch (err: any) {
      console.warn('[NseTradingCalendarService] SQLite IndexOHLCV fallback unavailable:', err?.message);
      return [];
    }
  }

  /**
   * Reads exact min/max trade dates from the Kite adjusted OHLCV manifest.
   *
   * The manifest does not contain every row-level date, but it records real
   * exchange dates already observed per symbol. We use it only as a supplement
   * to locally stored trade dates, never to synthesize calendar sessions.
   */
  private static getTradingDatesFromKiteAdjustedManifest(): string[] {
    try {
      const manifestPath = path.join(
        process.cwd(),
        'data',
        'market_data',
        'tejhq_hf_10y',
        'kite_adjusted_backfill',
        'manifest.json'
      );
      if (!fs.existsSync(manifestPath)) return [];
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const symbols = parsed?.symbols && typeof parsed.symbols === 'object' ? parsed.symbols : {};
      const dates = new Set<string>();
      for (const row of Object.values(symbols) as any[]) {
        if (typeof row?.max_trade_date === 'string') dates.add(row.max_trade_date);
        if (typeof row?.min_trade_date === 'string') dates.add(row.min_trade_date);
      }
      return [...dates];
    } catch (err: any) {
      console.warn('[NseTradingCalendarService] Kite adjusted manifest fallback unavailable:', err?.message);
      return [];
    }
  }

  /**
   * Quick utility: get just the latest N dates as an array of ISO strings.
   * Used by the orchestrator for a quick check.
   */
  static async getLatestTradingDate(): Promise<string | null> {
    const resolution = await NseTradingCalendarService.resolveLastNTradingSessions(1);
    return resolution.resolvedDates[0] ?? null;
  }
}
