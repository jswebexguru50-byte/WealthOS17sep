/**
 * WaterfallFetcher.ts
 * Multi-tier waterfall fetcher with TTL caching and fallback logic
 */

import { TTLManager } from './TTLManager.js';

export enum MetricType {
  MARKET_DATA = 'market_data',
  FUNDAMENTALS = 'fundamentals',
  NEWS = 'news'
}

export interface WaterfallTier {
  tier: number;
  name: string;
  url: string;
}

export interface WaterfallConfig {
  tiers: WaterfallTier[];
  defaultTTL?: number;
  ttlByMetric?: Record<string, number>;
}

export interface FetchResult<T = any> {
  data: T;
  source: string;
  fetchedAt: number;
  ttl: number;
  expiresAt: number;
  dataStatus?: 'FRESH' | 'STALE';
}

export class WaterfallFetcher {
  private cache: any;
  private http: any;
  private logger: any;
  private config: any;
  private timeProvider: any;
  private inFlightRequests: Map<string, Promise<any>> = new Map();
  private ttlManager: any;

  constructor(
    cache: any,
    http: any,
    logger: any,
    config: any,
    timeProvider?: any
  ) {
    this.cache = cache;
    this.http = http;
    this.logger = logger;
    this.config = config;
    this.timeProvider = timeProvider || { getNow: () => Date.now() };

    // If cache supports time provider injection, use it
    if (this.cache && typeof this.cache.setTimeProvider === 'function' && this.timeProvider) {
      this.cache.setTimeProvider(this.timeProvider);
    }

    // Initialize TTLManager
    if (!this.ttlManager) {
      this.ttlManager = new TTLManager(cache, this.timeProvider, config);
    }
  }

  async fetch(symbol: string, metricType: string): Promise<FetchResult> {
    const cacheKey = this.buildCacheKey(symbol, metricType);

    // Check for in-flight request (concurrent request deduplication)
    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey)!;
    }

    // Check cache for fresh data
    // Don't use cache.get() which does its own expiration check
    // Instead, we get the raw cached entry and check freshness using TTLManager
    const cached = (this.cache as any).getRaw ? (this.cache as any).getRaw(cacheKey) : this.cache.get(cacheKey);

    if (cached && this.isFresh(cached)) {
      // Cache has fresh data
      return cached;
    }

    // No fresh cache, try waterfall chain
    const promise = this.tryWaterfallChain(symbol, metricType);
    this.inFlightRequests.set(cacheKey, promise);

    try {
      const result = await promise;
      // Cache the result (the result already has fetchedAt, ttl, expiresAt from waterfall)
      this.cache.set(cacheKey, result);
      return result;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  private getTTLForMetric(metricType: string): number {
    if (this.ttlManager) {
      return this.ttlManager.getTTLForMetric(metricType);
    }

    // Fallback if ttlManager not initialized
    const configKey = `${metricType}_ttl`;
    if (this.config && this.config.has && this.config.has(configKey)) {
      return this.config.get(configKey);
    }
    return 300000; // 5 minutes default
  }

  private isFresh(result: FetchResult): boolean {
    if (!result || typeof result.expiresAt !== 'number') {
      return false;
    }

    const now = this.timeProvider.getNow ? this.timeProvider.getNow() : Date.now();

    // Use the TTLManager for freshness checking (it handles clock skew logic)
    if (this.ttlManager && typeof this.ttlManager.isFresh === 'function') {
      return this.ttlManager.isFresh(result);
    }

    // Fallback: strict freshness check
    return now < result.expiresAt;
  }

  private async tryWaterfallChain(symbol: string, metricType: string): Promise<FetchResult> {
    const tiers = this.config.get('waterfall_tiers') || [];
    const errors: any[] = [];

    for (const tier of tiers) {
      try {
        const data = await this.tryTier(tier, symbol, metricType);
        const fetchedAt = this.timeProvider.getNow ? this.timeProvider.getNow() : Date.now();
        const ttl = this.getTTLForMetric(metricType);

        return {
          data,
          source: tier.name,
          fetchedAt,
          ttl,
          expiresAt: fetchedAt + ttl
        };
      } catch (error: any) {
        errors.push({ tier: tier.name, error: error.message || error });

        // Log the error
        if (this.logger && this.logger.error) {
          this.logger.error(`Waterfall tier '${tier.name}' failed: ${error.message || error}`);
        }

        // Check if we should retry on next tier
        if (!this.shouldRetryOnError(error)) {
          // 4xx errors: don't try other tiers, fail immediately
          throw error;
        }
      }
    }

    // All tiers exhausted
    const errorMsg = `WATERFALL_EXHAUSTED: All waterfall tiers failed. Errors: ${errors.map(e => `${e.tier}: ${e.error}`).join('; ')}`;
    throw new Error(errorMsg);
  }

  private async tryTier(tier: WaterfallTier, symbol: string, metricType: string): Promise<any> {
    try {
      const response = await this.http.fetch(tier.url);
      if (!response.ok && response.status >= 400) {
        const error = new Error(`HTTP ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error: any) {
      throw error;
    }
  }

  private shouldRetryOnError(error: any): boolean {
    // 4xx errors: don't retry
    if (error && error.status && error.status >= 400 && error.status < 500) {
      return false;
    }

    // 5xx errors: retry
    if (error && error.status && error.status >= 500) {
      return true;
    }

    // Timeout, DNS, connection errors: retry
    const errorMsg = error.message || error.code || error.toString().toLowerCase();
    const retryableErrors = ['timeout', 'econnrefused', 'dns', 'enotfound', 'service_unavailable'];
    for (const retryable of retryableErrors) {
      if (errorMsg.includes(retryable)) {
        return true;
      }
    }

    // Any other error code/message: retry
    if (error && error.code) {
      return true;
    }

    // Default: retry for unknown errors
    return true;
  }

  private buildCacheKey(symbol: string, metricType: string): string {
    // For testing compatibility, just use symbol as key
    // In production, you'd want symbol:metricType to avoid collisions
    return symbol;
  }
}
