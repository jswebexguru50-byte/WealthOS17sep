/**
 * BatchFundamentalProvider
 *
 * Single entry point for ALL fundamental data consumers (F1-F7, 29Q, scans,
 * dossiers, ITAS, routes).  No consumer should call FundamentalDataService or
 * Screener.in directly.
 *
 * Adds on top of FundamentalDataService:
 *   - In-process single-flight: N concurrent callers for the same symbol share
 *     one underlying fetch instead of firing N separate Screener.in calls.
 *   - Circuit breaker: when Screener.in is down, fast-fail and return cached DB
 *     data rather than queueing timeouts.
 *   - Batch prefetch: load a symbol universe in order with rate-limiting; callers
 *     that arrive during the batch automatically receive the result.
 *   - ObservabilityHub metrics: every call emits hit/miss/latency counters.
 *
 * Usage:
 *   import { BatchFundamentalProvider } from './BatchFundamentalProvider.js';
 *   const snap = await BatchFundamentalProvider.getInstance().get('INFY');
 */

import { FundamentalDataService, FundamentalSnapshot } from './FundamentalDataService.js';
import { CircuitBreakerRegistry } from './CircuitBreaker.js';
import { obs } from './ObservabilityHub.js';

const cb = CircuitBreakerRegistry.get('screener-fundamentals', 4);

export class BatchFundamentalProvider {
  private static instance: BatchFundamentalProvider;
  private inflight = new Map<string, Promise<FundamentalSnapshot | null>>();
  private svc = FundamentalDataService.getInstance();

  static getInstance(): BatchFundamentalProvider {
    if (!BatchFundamentalProvider.instance) BatchFundamentalProvider.instance = new BatchFundamentalProvider();
    return BatchFundamentalProvider.instance;
  }

  /**
   * Get fundamentals for one symbol.  Concurrent calls for the same symbol
   * coalesce into a single fetch.
   */
  async get(symbol: string): Promise<FundamentalSnapshot | null> {
    const key = symbol.trim().toUpperCase();
    if (this.inflight.has(key)) {
      obs.increment('fundamentals.inflight_hit', { symbol: key });
      return this.inflight.get(key)!;
    }

    const t0 = Date.now();
    const promise = this.fetch(key).finally(() => {
      this.inflight.delete(key);
      obs.timing('fundamentals.latency_ms', Date.now() - t0, { symbol: key });
    });
    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Batch prefetch a list of symbols sequentially with per-symbol rate limit.
   * Warm the SQLite cache so subsequent get() calls are instant.
   */
  async prefetch(symbols: string[], rateLimitMs = 1200): Promise<void> {
    obs.info('BatchFundamentalProvider', 'prefetch_start', { count: symbols.length });
    for (const sym of symbols) {
      await this.get(sym).catch(() => null);
      if (rateLimitMs > 0) await new Promise(r => setTimeout(r, rateLimitMs));
    }
    obs.info('BatchFundamentalProvider', 'prefetch_done', { count: symbols.length });
  }

  private async fetch(symbol: string): Promise<FundamentalSnapshot | null> {
    return cb.call(
      async () => {
        const result = await this.svc.getSnapshot(symbol);
        obs.increment('fundamentals.fetch_ok', { symbol });
        return result;
      },
      async () => {
        obs.warn('BatchFundamentalProvider', 'fetch_failed_cb_open', { symbol });
        return this.svc.getSnapshot(symbol).catch(() => null);
      }
    );
  }
}
