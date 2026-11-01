/**
 * Chaos tests: Cache resilience
 *
 * Tests an in-memory TTL cache (representative of MultiLayerCache behaviour)
 * against mid-flight clears and TTL expiry races.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Minimal TTL cache (stands in for MultiLayerCache L1 layer) ───────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private ttlMs: number) {}

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// Fetch counter so tests can verify re-fetches
let fetchCallCount = 0;

async function fetchFromProvider(symbol: string): Promise<{ price: number; source: string }> {
  fetchCallCount++;
  return { price: 100 + fetchCallCount, source: 'UPSTOX_API_V2' };
}

async function getWithCache(
  cache: TtlCache<{ price: number; source: string }>,
  symbol: string,
): Promise<{ price: number; source: string }> {
  const cached = cache.get(symbol);
  if (cached) return cached;
  const fresh = await fetchFromProvider(symbol);
  cache.set(symbol, fresh);
  return fresh;
}

// ─── Scenario 1: Cache cleared mid-flight ────────────────────────────────────
describe('Cache resilience: mid-flight clear', () => {
  let cache: TtlCache<{ price: number; source: string }>;

  beforeEach(() => {
    cache = new TtlCache(60_000); // 60s TTL
    fetchCallCount = 0;
  });

  test('first request populates cache', async () => {
    const result = await getWithCache(cache, 'RELIANCE');
    expect(result.price).toBeGreaterThan(0);
    expect(cache.size()).toBe(1);
    expect(fetchCallCount).toBe(1);
  });

  test('cache cleared mid-flight → subsequent request re-fetches', async () => {
    await getWithCache(cache, 'RELIANCE');
    cache.clear();
    expect(cache.size()).toBe(0);

    const result2 = await getWithCache(cache, 'RELIANCE');
    expect(result2.price).toBeGreaterThan(0);
    expect(fetchCallCount).toBe(2); // second fetch happened
    expect(cache.size()).toBe(1);   // re-cached
  });

  test('cleared cache produces a fresh re-cache, not a stale hit', async () => {
    const first = await getWithCache(cache, 'INFY');
    cache.clear();
    const second = await getWithCache(cache, 'INFY');
    // prices differ because fetchCallCount incremented
    expect(second.price).not.toBe(first.price);
  });
});

// ─── Scenario 2: TTL expiry — stale data NOT served after TTL ────────────────
describe('Cache resilience: TTL expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchCallCount = 0;
  });

  // Restore real timers after each test
  afterEach(() => {
    vi.useRealTimers();
  });

  test('data within TTL is served from cache (no re-fetch)', async () => {
    const cache = new TtlCache<{ price: number; source: string }>(5000); // 5s TTL
    await getWithCache(cache, 'TCS');
    vi.advanceTimersByTime(2000); // 2s — still within TTL

    await getWithCache(cache, 'TCS');
    expect(fetchCallCount).toBe(1); // no re-fetch
  });

  test('stale data is NOT served after TTL — fresh fetch occurs', async () => {
    const cache = new TtlCache<{ price: number; source: string }>(5000); // 5s TTL
    await getWithCache(cache, 'HDFC');
    expect(fetchCallCount).toBe(1);

    vi.advanceTimersByTime(6000); // advance past TTL

    // TTL expired — cache.get returns null, triggers re-fetch
    const result = await getWithCache(cache, 'HDFC');
    expect(fetchCallCount).toBe(2);
    expect(result.price).toBeGreaterThan(0);
  });

  test('expired entry is evicted from cache on access', async () => {
    const cache = new TtlCache<{ price: number; source: string }>(3000); // 3s TTL
    await getWithCache(cache, 'WIPRO');

    vi.advanceTimersByTime(4000); // expire TTL

    // Direct get returns null (entry evicted)
    const stale = cache.get('WIPRO');
    expect(stale).toBeNull();
    expect(cache.size()).toBe(0); // evicted
  });

  test('multiple keys with same TTL all expire together', async () => {
    const cache = new TtlCache<{ price: number; source: string }>(2000);
    for (const sym of ['A', 'B', 'C']) {
      await getWithCache(cache, sym);
    }
    expect(cache.size()).toBe(3);

    vi.advanceTimersByTime(3000);

    for (const sym of ['A', 'B', 'C']) {
      expect(cache.get(sym)).toBeNull();
    }
  });
});

// ─── Scenario 3: Concurrent access after clear ───────────────────────────────
describe('Cache resilience: concurrent access after clear', () => {
  beforeEach(() => {
    fetchCallCount = 0;
  });

  test('two parallel requests after clear both re-fetch and re-cache', async () => {
    const cache = new TtlCache<{ price: number; source: string }>(60_000);
    await getWithCache(cache, 'SBIN');
    cache.clear();

    // Parallel requests — both miss the cleared cache
    const [r1, r2] = await Promise.all([
      getWithCache(cache, 'SBIN'),
      getWithCache(cache, 'SBIN'),
    ]);

    // Both return valid prices (no crash)
    expect(r1.price).toBeGreaterThan(0);
    expect(r2.price).toBeGreaterThan(0);
    // At least 2 total fetches (initial + at least one re-fetch)
    expect(fetchCallCount).toBeGreaterThanOrEqual(2);
  });
});
