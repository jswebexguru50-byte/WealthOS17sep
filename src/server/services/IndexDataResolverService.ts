import { fetchTickerData } from '../yahooFinance.js';

/**
 * Canonical wrapper for index and benchmark symbol data.
 *
 * Index symbols (^NSEI, ^CRSLDX, ^GSPC, BZ=F, USDINR=X, ^TNX, etc.) are not
 * in the equity DailyOHLCV canonical store — they are macro/benchmark series.
 * This service wraps fetchTickerData behind a singleton interface so consumers
 * do not import Yahoo Finance directly. fetchTickerData already carries its own
 * 15-minute in-memory cache (via MarketDataCache) so we do not add a second
 * caching layer here.
 */
export class IndexDataResolverService {
  private static instance: IndexDataResolverService;

  static getInstance(): IndexDataResolverService {
    if (!IndexDataResolverService.instance) {
      IndexDataResolverService.instance = new IndexDataResolverService();
    }
    return IndexDataResolverService.instance;
  }

  /**
   * Fetch historical OHLCV data for an index or benchmark symbol.
   * Returns the same shape as fetchTickerData: { closePrices, ... } or null.
   */
  async resolveIndexData(symbol: string, daysBack: number = 365): Promise<any> {
    try {
      return await fetchTickerData(symbol, daysBack);
    } catch (err) {
      console.warn(`[IndexDataResolverService] Failed to resolve ${symbol}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
}
