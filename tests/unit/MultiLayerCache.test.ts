import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock ObservabilityHub before importing the service
vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    increment: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock DataProviderRegistry to avoid side effects
vi.mock('../../src/server/services/DataProviderRegistry.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/server/services/DataProviderRegistry.js')>(
    '../../src/server/services/DataProviderRegistry.js'
  );
  return actual;
});

import { MultiLayerCache } from '../../src/server/services/MultiLayerCache.js';
import { obs } from '../../src/server/services/ObservabilityHub.js';
import { DATA_CLASS } from '../../src/server/services/DataProviderRegistry.js';

describe('MultiLayerCache', () => {
  let cache: MultiLayerCache;

  beforeEach(() => {
    // Reset singleton for isolated tests
    (MultiLayerCache as any).instance = undefined;
    cache = MultiLayerCache.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get() — returns null on miss and emits cache.miss', () => {
    const result = cache.get(DATA_CLASS.LIVE_PRICE, 'INFY');
    expect(result).toBeNull();
    expect(obs.increment).toHaveBeenCalledWith('cache.miss', { class: DATA_CLASS.LIVE_PRICE });
  });

  it('get() — returns cached value on hit and emits cache.hit', () => {
    const data = { price: 1500 };
    cache.set(DATA_CLASS.LIVE_PRICE, 'INFY', data, 'upstox');
    vi.clearAllMocks();

    const result = cache.get<typeof data>(DATA_CLASS.LIVE_PRICE, 'INFY');
    expect(result).toEqual(data);
    expect(obs.increment).toHaveBeenCalledWith('cache.hit', { class: DATA_CLASS.LIVE_PRICE });
  });

  it('get() — returns null after TTL expired and emits cache.expired', () => {
    const data = { price: 1500 };
    cache.set(DATA_CLASS.LIVE_PRICE, 'INFY', data, 'upstox');
    vi.clearAllMocks();

    // TTL for LIVE_PRICE is 60s = 60000ms; advance time past it
    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 61_000);

    const result = cache.get(DATA_CLASS.LIVE_PRICE, 'INFY');
    expect(result).toBeNull();
    expect(obs.increment).toHaveBeenCalledWith('cache.expired', { class: DATA_CLASS.LIVE_PRICE });
  });

  it('set() — stores value retrievable via get()', () => {
    const data = { ratio: 22.5 };
    cache.set(DATA_CLASS.RATIOS, 'TCS', data, 'screener');

    const result = cache.get<typeof data>(DATA_CLASS.RATIOS, 'TCS');
    expect(result).toEqual(data);
  });

  it('set() — different symbols are independent entries', () => {
    cache.set(DATA_CLASS.LIVE_PRICE, 'INFY', { price: 1500 }, 'upstox');
    cache.set(DATA_CLASS.LIVE_PRICE, 'TCS', { price: 3800 }, 'upstox');

    expect(cache.get<any>(DATA_CLASS.LIVE_PRICE, 'INFY')).toEqual({ price: 1500 });
    expect(cache.get<any>(DATA_CLASS.LIVE_PRICE, 'TCS')).toEqual({ price: 3800 });
  });

  it('invalidate() — removes specific (dataClass, symbol) entry', () => {
    cache.set(DATA_CLASS.LIVE_PRICE, 'INFY', { price: 1500 }, 'upstox');
    cache.set(DATA_CLASS.LIVE_PRICE, 'TCS', { price: 3800 }, 'upstox');

    cache.invalidate(DATA_CLASS.LIVE_PRICE, 'INFY');

    vi.clearAllMocks();
    expect(cache.get(DATA_CLASS.LIVE_PRICE, 'INFY')).toBeNull();
    expect(cache.get<any>(DATA_CLASS.LIVE_PRICE, 'TCS')).toEqual({ price: 3800 });
    expect(obs.increment).toHaveBeenCalledWith('cache.miss', { class: DATA_CLASS.LIVE_PRICE });
  });

  it('invalidateClass() — removes all entries for a given dataClass', () => {
    cache.set(DATA_CLASS.LIVE_PRICE, 'INFY', { price: 1500 }, 'upstox');
    cache.set(DATA_CLASS.LIVE_PRICE, 'TCS', { price: 3800 }, 'upstox');
    cache.set(DATA_CLASS.RATIOS, 'INFY', { pe: 22 }, 'screener');

    cache.invalidateClass(DATA_CLASS.LIVE_PRICE);

    vi.clearAllMocks();
    expect(cache.get(DATA_CLASS.LIVE_PRICE, 'INFY')).toBeNull();
    expect(cache.get(DATA_CLASS.LIVE_PRICE, 'TCS')).toBeNull();
    // RATIOS entry for INFY should still be present
    expect(cache.get<any>(DATA_CLASS.RATIOS, 'INFY')).toEqual({ pe: 22 });
  });

  it('size() — reflects entry count', () => {
    expect(cache.size()).toBe(0);
    cache.set(DATA_CLASS.LIVE_PRICE, 'INFY', { price: 1500 }, 'upstox');
    cache.set(DATA_CLASS.RATIOS, 'TCS', { pe: 30 }, 'screener');
    expect(cache.size()).toBe(2);
  });

  it('stats() — byClass breakdown is accurate', () => {
    cache.set(DATA_CLASS.LIVE_PRICE, 'INFY', { price: 1500 }, 'upstox');
    cache.set(DATA_CLASS.LIVE_PRICE, 'TCS', { price: 3800 }, 'upstox');
    cache.set(DATA_CLASS.RATIOS, 'INFY', { pe: 22 }, 'screener');

    const stats = cache.stats();
    expect(stats.total).toBe(3);
    expect(stats.byClass[DATA_CLASS.LIVE_PRICE]).toBe(2);
    expect(stats.byClass[DATA_CLASS.RATIOS]).toBe(1);
  });
});
