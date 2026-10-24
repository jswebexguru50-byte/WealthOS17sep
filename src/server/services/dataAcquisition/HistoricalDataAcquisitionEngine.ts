import { DuckDbAdjustedOhlcvService } from '../DuckDbAdjustedOhlcvService.js';

export interface DailyOHLCVRecord {
  securityId: string;
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose?: number;
  volume: number;
  turnover: number;
  provenanceRecordId: string;
}

/**
 * Metadata wrapper returned by exportAdjustedCandles.
 * `source` tells callers whether records come from the DuckDB adjusted store
 * (preferred, `duckdb-adjusted`) or a raw fallback (`raw-fallback`).
 */
export interface ExportedCandlesResult {
  symbol: string;
  from: string;
  to: string;
  adjusted: boolean;
  source: 'duckdb-adjusted' | 'raw-fallback';
  records: DailyOHLCVRecord[];
}

/** Acquires existing adjusted market evidence; it never generates prices. */
export class HistoricalDataAcquisitionEngine {
  /**
   * Thin wrapper kept for backward-compat with AcquisitionWorker's D2_DAILY_OHLCV
   * domain. Internally delegates to exportAdjustedCandles so the DuckDB adjusted
   * store is always the single truth source.
   */
  public static async acquireDailyOHLCV(
    securityId: string,
    symbol: string,
    startDate: string,
    endDate: string,
    provenanceId: string
  ): Promise<DailyOHLCVRecord[]> {
    const result = await HistoricalDataAcquisitionEngine.exportAdjustedCandles(
      symbol, startDate, endDate, securityId, provenanceId
    );
    return result.records;
  }

  /**
   * Export adjusted candles for a symbol over [from, to].
   *
   * The DuckDB adjusted-price store is always tried first. If it contains data
   * for the requested range, `source` is `duckdb-adjusted` and `adjusted` is
   * true — this is the preferred path and the single truth source for daily
   * candles.
   *
   * When DuckDB returns no bars for the range, `source` is `raw-fallback` and
   * `adjusted` is false. Callers must treat raw-fallback records as provisional;
   * a TODO marks where the actual BSE/NSE raw-fetch should be wired in.
   */
  public static async exportAdjustedCandles(
    symbol: string,
    from: string,
    to: string,
    securityId = '',
    provenanceId = ''
  ): Promise<ExportedCandlesResult> {
    const cleanSymbol = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    if (!cleanSymbol || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { symbol: cleanSymbol || symbol, from, to, adjusted: false, source: 'raw-fallback', records: [] };
    }

    // Prefer DuckDB adjusted store — single truth source for daily candles.
    const requestedDays = Math.max(
      1,
      Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 31
    );
    const bars = await DuckDbAdjustedOhlcvService.getDailyBars(cleanSymbol, requestedDays);
    const adjustedRecords: DailyOHLCVRecord[] = (bars || [])
      .filter(bar => bar.trade_date >= from && bar.trade_date <= to)
      .map(bar => ({
        securityId, symbol: cleanSymbol, date: bar.trade_date,
        open: Number(bar.open_adjusted), high: Number(bar.high_adjusted),
        low: Number(bar.low_adjusted), close: Number(bar.close_adjusted),
        adjustedClose: Number(bar.close_adjusted), volume: Number(bar.volume_raw),
        turnover: Number(bar.close_adjusted) * Number(bar.volume_raw),
        provenanceRecordId: provenanceId,
      }))
      .filter(row => [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite));

    if (adjustedRecords.length > 0) {
      return { symbol: cleanSymbol, from, to, adjusted: true, source: 'duckdb-adjusted', records: adjustedRecords };
    }

    // Raw fallback: DuckDB has no adjusted data for this symbol / range.
    // TODO A4: wire BSE/NSE raw-price fetch here and mark records as unadjusted.
    console.warn(
      `[HistoricalDataAcquisitionEngine] No adjusted data in DuckDB for ${cleanSymbol} [${from}..${to}];` +
      ` raw-fallback path not yet implemented — returning empty.`
    );
    return { symbol: cleanSymbol, from, to, adjusted: false, source: 'raw-fallback', records: [] };
  }
}
