/**
 * MarketDataCache.ts
 * In-memory high-performance TTL cache with LRU eviction and Prometheus telemetry metrics.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  itemCount: number;
  hitRatioPct: number;
}

export class MarketDataCache {
  private static instance: MarketDataCache;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxItems: number = 1000;
  private hits: number = 0;
  private misses: number = 0;
  private sets: number = 0;
  private evictions: number = 0;

  private constructor() {
    // Periodically sweep expired entries every 5 minutes
    setInterval(() => this.purgeExpired(), 5 * 60 * 1000).unref();
  }

  public static getInstance(): MarketDataCache {
    if (!MarketDataCache.instance) {
      MarketDataCache.instance = new MarketDataCache();
    }
    return MarketDataCache.instance;
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    entry.lastAccessed = Date.now();
    this.hits++;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs: number = 15 * 60 * 1000): void {
    if (this.cache.size >= this.maxItems && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now()
    });
    this.sets++;
  }

  public has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Event-driven invalidation: sweeps any cache entry associated with a symbol
   */
  public invalidateSymbol(symbol: string): number {
    const symUpper = symbol.toUpperCase();
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (key.toUpperCase().includes(symUpper)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Trigger invalidation if price change > 2% or OI change > 30%
   */
  public invalidateOnLargeDelta(symbol: string, oldPrice: number, newPrice: number, oiDeltaPct: number = 0): boolean {
    if (oldPrice > 0) {
      const priceDeltaPct = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
      if (priceDeltaPct >= 2.0 || Math.abs(oiDeltaPct) >= 30.0) {
        this.invalidateSymbol(symbol);
        return true;
      }
    }
    return false;
  }

  public clear(): void {
    this.cache.clear();
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  public getMetrics(): CacheMetrics {
    const totalRequests = this.hits + this.misses;
    const hitRatioPct = totalRequests > 0 ? Number(((this.hits / totalRequests) * 100).toFixed(2)) : 0;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      itemCount: this.cache.size,
      hitRatioPct
    };
  }
}
