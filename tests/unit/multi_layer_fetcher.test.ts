import { describe, expect, it, vi } from 'vitest';
import { MultiLayerFetcher } from '../../src/server/services/MultiLayerFetcher.js';

describe('MultiLayerFetcher', () => {
  it('falls back in order and caches the successful result', async () => {
    const first = vi.fn().mockRejectedValue(Object.assign(new Error('provider timeout'), { status: 503 }));
    const second = vi.fn().mockResolvedValue({ price: 101 });
    const fetcher = new MultiLayerFetcher([{ name: 'upstox', fetch: first }, { name: 'yahoo', fetch: second }]);
    const result = await fetcher.fetch('infy', 'live_price');
    expect(result.source).toBe('yahoo');
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
    await fetcher.fetch('INFY', 'live_price');
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('coalesces concurrent requests for the same symbol and class', async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => { release = resolve; });
    const provider = vi.fn().mockReturnValue(pending);
    const fetcher = new MultiLayerFetcher([{ name: 'provider', fetch: provider }]);
    const a = fetcher.fetch('INFY', 'daily_ohlcv');
    const b = fetcher.fetch('infy', 'daily_ohlcv');
    release({ close: 100 });
    await Promise.all([a, b]);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
