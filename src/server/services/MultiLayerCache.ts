// MultiLayerCache — unified per-data-class TTL cache
// Replaces: tickerDataCache, FundamentalSnapshots inline caches, marketDataCache in-memory layer

import { DATA_CLASS } from './DataProviderRegistry.js';
import { obs } from './ObservabilityHub.js';

// Per data-class TTL (seconds). Falls back to 300s for unknown classes.
const CLASS_TTL_S: Partial<Record<string, number>> = {
  [DATA_CLASS.LIVE_PRICE]:          60,
  [DATA_CLASS.DAILY_OHLCV]:         3600,
  [DATA_CLASS.INTRADAY_OHLCV]:      60,
  [DATA_CLASS.CORPORATE_ACTIONS]:   3600,
  [DATA_CLASS.FINANCIALS]:          48 * 3600,
  [DATA_CLASS.RATIOS]:              48 * 3600,
  [DATA_CLASS.SHAREHOLDING]:        7 * 24 * 3600,
  [DATA_CLASS.ANNOUNCEMENTS]:       3600,
  [DATA_CLASS.ENRICHMENT]:          24 * 3600,
  [DATA_CLASS.MF_NAV]:              3600,
};

interface CacheEntry<T> {
  data: T;
  ts: number;       // ms epoch
  source: string;   // which provider populated this
  ttlMs: number;
}

export class MultiLayerCache {
  private static instance: MultiLayerCache;
  private store = new Map<string, CacheEntry<unknown>>();

  static getInstance(): MultiLayerCache {
    if (!MultiLayerCache.instance) MultiLayerCache.instance = new MultiLayerCache();
    return MultiLayerCache.instance;
  }

  private key(dataClass: string, symbol: string): string {
    return `${dataClass}:${symbol.toUpperCase()}`;
  }

  get<T>(dataClass: string, symbol: string): T | null {
    const k = this.key(dataClass, symbol);
    const entry = this.store.get(k) as CacheEntry<T> | undefined;
    if (!entry) {
      obs.increment('cache.miss', { class: dataClass });
      return null;
    }
    if (Date.now() - entry.ts > entry.ttlMs) {
      this.store.delete(k);
      obs.increment('cache.expired', { class: dataClass });
      return null;
    }
    obs.increment('cache.hit', { class: dataClass });
    return entry.data;
  }

  set<T>(dataClass: string, symbol: string, data: T, source: string): void {
    const ttlMs = (CLASS_TTL_S[dataClass] ?? 300) * 1000;
    this.store.set(this.key(dataClass, symbol), { data, ts: Date.now(), source, ttlMs });
    obs.increment('cache.set', { class: dataClass });
  }

  invalidate(dataClass: string, symbol: string): void {
    this.store.delete(this.key(dataClass, symbol));
  }

  invalidateClass(dataClass: string): void {
    const prefix = `${dataClass}:`;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  size(): number { return this.store.size; }

  stats(): { total: number; byClass: Record<string, number> } {
    const byClass: Record<string, number> = {};
    for (const k of this.store.keys()) {
      const cls = k.split(':')[0];
      byClass[cls] = (byClass[cls] ?? 0) + 1;
    }
    return { total: this.store.size, byClass };
  }
}
