// cacheClient.ts — client-side in-memory TTL cache for API responses
// Usage: const data = await cacheClient.getOrFetch('holdings:cc9', () => fetchHoldings('cc9'), 60);

interface CacheEntry<T> {
  data: T;
  ts: number;
  ttlMs: number;
}

class CacheClient {
  private store = new Map<string, CacheEntry<any>>();

  // Returns cached value if fresh, otherwise calls fetcher and caches result
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() - entry.ts < entry.ttlMs) {
      return entry.data;
    }
    const data = await fetcher();
    this.store.set(key, { data, ts: Date.now(), ttlMs: ttlSeconds * 1000 });
    return data;
  }

  // Explicit invalidation
  invalidate(key: string): void { this.store.delete(key); }
  invalidatePrefix(prefix: string): void {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }

  // How many entries are currently cached
  size(): number { return this.store.size; }

  // Clear everything (e.g. on logout or portfolio switch)
  clear(): void { this.store.clear(); }

  stats(): { total: number; keys: string[] } {
    return { total: this.store.size, keys: [...this.store.keys()] };
  }
}

// Singleton — shared across all components
export const cacheClient = new CacheClient();
