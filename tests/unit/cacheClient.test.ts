import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheClient } from '../../src/lib/cacheClient.js';

beforeEach(() => {
  cacheClient.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cacheClient', () => {
  it('getOrFetch — calls fetcher on miss and returns data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 42 });
    const result = await cacheClient.getOrFetch('test:1', fetcher, 60);
    expect(result).toEqual({ value: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('getOrFetch — returns cached value on second call without calling fetcher again', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 99 });
    await cacheClient.getOrFetch('test:2', fetcher, 60);
    const result = await cacheClient.getOrFetch('test:2', fetcher, 60);
    expect(result).toEqual({ value: 99 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('getOrFetch — calls fetcher again after TTL expires', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const fetcher = vi.fn()
      .mockResolvedValueOnce({ value: 'first' })
      .mockResolvedValueOnce({ value: 'second' });

    await cacheClient.getOrFetch('test:3', fetcher, 10); // 10 second TTL
    vi.setSystemTime(now + 11_000); // advance 11 seconds
    const result = await cacheClient.getOrFetch('test:3', fetcher, 10);
    expect(result).toEqual({ value: 'second' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidate(key) — removes specific key', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    await cacheClient.getOrFetch('inv:1', fetcher, 300);
    cacheClient.invalidate('inv:1');
    const result = await cacheClient.getOrFetch('inv:1', fetcher, 300);
    expect(result).toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidatePrefix — removes all matching keys', async () => {
    const f1 = vi.fn().mockResolvedValue('a');
    const f2 = vi.fn().mockResolvedValue('b');
    const f3 = vi.fn().mockResolvedValue('c');
    await cacheClient.getOrFetch('holdings:cc9', f1, 300);
    await cacheClient.getOrFetch('holdings:all', f2, 300);
    await cacheClient.getOrFetch('universe', f3, 300);

    cacheClient.invalidatePrefix('holdings:');
    // holdings keys gone, universe still cached
    const f1b = vi.fn().mockResolvedValue('a2');
    const f2b = vi.fn().mockResolvedValue('b2');
    const f3b = vi.fn().mockResolvedValue('c2');
    await cacheClient.getOrFetch('holdings:cc9', f1b, 300);
    await cacheClient.getOrFetch('holdings:all', f2b, 300);
    await cacheClient.getOrFetch('universe', f3b, 300);

    expect(f1b).toHaveBeenCalledTimes(1);
    expect(f2b).toHaveBeenCalledTimes(1);
    expect(f3b).not.toHaveBeenCalled(); // still cached
  });

  it('clear() — empties all entries', async () => {
    await cacheClient.getOrFetch('a', async () => 1, 300);
    await cacheClient.getOrFetch('b', async () => 2, 300);
    expect(cacheClient.size()).toBe(2);
    cacheClient.clear();
    expect(cacheClient.size()).toBe(0);
  });

  it('size() — reflects count', async () => {
    expect(cacheClient.size()).toBe(0);
    await cacheClient.getOrFetch('x', async () => 1, 300);
    expect(cacheClient.size()).toBe(1);
    await cacheClient.getOrFetch('y', async () => 2, 300);
    expect(cacheClient.size()).toBe(2);
  });

  it('stats() — returns total and keys array', async () => {
    await cacheClient.getOrFetch('alpha', async () => 'a', 300);
    await cacheClient.getOrFetch('beta', async () => 'b', 300);
    const s = cacheClient.stats();
    expect(s.total).toBe(2);
    expect(s.keys).toContain('alpha');
    expect(s.keys).toContain('beta');
  });
});
