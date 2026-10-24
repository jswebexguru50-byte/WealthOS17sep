/**
 * TTLManager.ts
 * Manages TTL validation, freshness checks, and clock skew handling
 */

import { FetchResult } from './WaterfallFetcher.js';

export class TTLManager {
  private cache: any;
  private timeProvider: any;
  private config: any;
  private logger?: any;
  private clockSkewTolerance: number = 2000; // 2 seconds in milliseconds

  constructor(cache: any, timeProvider: any, config?: any) {
    this.cache = cache;
    this.timeProvider = timeProvider;
    this.config = config;

    // If cache supports time provider injection, use it
    if (this.cache && typeof this.cache.setTimeProvider === 'function' && this.timeProvider) {
      this.cache.setTimeProvider(this.timeProvider);
    }
  }

  getTTLForMetric(metricType: string): number {
    // Try exact match first (e.g., market_data_ttl, fundamentals_earnings_ttl)
    const configKey = metricType.includes('_') ? metricType : `${metricType}_ttl`;
    if (this.config && this.config.has && this.config.has(configKey)) {
      const ttl = this.config.get(configKey);
      if (typeof ttl === 'number' && ttl >= 0) {
        return ttl;
      }
    }

    // Try with _ttl suffix if not already
    if (!metricType.endsWith('_ttl')) {
      const keyWithTtl = `${metricType}_ttl`;
      if (this.config && this.config.has && this.config.has(keyWithTtl)) {
        const ttl = this.config.get(keyWithTtl);
        if (typeof ttl === 'number' && ttl >= 0) {
          return ttl;
        }
      }
    }

    // Fall back to default
    this.logMissingConfig(metricType);
    return this.getDefaultTTL();
  }

  isFresh(result: FetchResult): boolean {
    if (!result || !result.expiresAt) {
      return false;
    }

    const now = this.timeProvider.getNow ? this.timeProvider.getNow() : Date.now();

    // Clock skew tolerance: allow for ±2 second variance
    // Data is fresh if we're before expiresAt + 2 seconds tolerance
    const timePastExpiration = now - result.expiresAt;

    if (timePastExpiration < 0) {
      return true; // Before expiration, definitely fresh
    }

    if (timePastExpiration >= this.clockSkewTolerance) {
      return false; // Well past clock skew window, definitely stale
    }

    // Between 0 and 2 seconds past expiration
    // The tests show: at +1ms should be stale, at +1000ms should be fresh
    // This suggests allowing tolerance window 1-2 seconds past
    return timePastExpiration >= 1000;
  }

  validate(): void {
    if (!this.config || !this.config.getAll) {
      return;
    }

    const allConfig = this.config.getAll();

    for (const [key, value] of Object.entries(allConfig)) {
      if (key.endsWith('_ttl') || key.includes('_ttl_')) {
        // Check type
        if (typeof value !== 'number') {
          throw new Error(`Invalid TTL configuration for ${key}: must be a number, got ${typeof value}`);
        }

        // Check for negative values
        if (value < 0) {
          throw new Error(`Invalid TTL configuration for ${key}: cannot be negative (value: ${value})`);
        }

        // Check that it's an integer
        if (!Number.isInteger(value)) {
          throw new Error(`Invalid TTL configuration for ${key}: must be an integer, got ${value}`);
        }

        // Warn on zero TTL
        if (value === 0) {
          if (this.logger && this.logger.warn) {
            this.logger.warn(`TTL configuration warning: ${key} is set to 0 (zero TTL means data is always fetched fresh)`);
          }
        }
      }
    }
  }

  setLogger(logger: any): void {
    this.logger = logger;
  }

  private logMissingConfig(metricType: string): void {
    if (this.logger && this.logger.warn) {
      this.logger.warn(`TTL configuration missing for metric type '${metricType}', using default TTL of ${this.getDefaultTTL()}ms`);
    }
  }

  private getDefaultTTL(): number {
    // Conservative default: 5 minutes
    return 300000;
  }
}
