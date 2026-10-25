/**
 * Unit tests for BatchFundamentalProvider
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks must be declared before importing the module under test ──────────────

const mockGetSnapshot = vi.fn();

vi.mock('../../src/server/services/FundamentalDataService.js', () => ({
  FundamentalDataService: {
    getInstance: () => ({ getSnapshot: mockGetSnapshot }),
  },
}));

vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    increment: vi.fn(),
    timing: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    snapshot: vi.fn(() => ({ counters: {}, histograms: {}, ts: Date.now() })),
  },
}));

vi.mock('../../src/server/services/CircuitBreaker.js', () => {
  const execute = vi.fn(async (fn: () => Promise<any>) => fn());
  const isAvailable = vi.fn(() => true);
  return {
    CircuitBreaker: {
      for: vi.fn(() => ({ execute, isAvailable })),
      status: vi.fn(() => ({})),
    },
  };
});

import { BatchFundamentalProvider } from '../../src/server/services/BatchFundamentalProvider.js';

// Reset singleton between tests
function resetSingleton() {
  // @ts-ignore
  BatchFundamentalProvider.instance = undefined;
}

describe('BatchFundamentalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns a singleton', () => {
      const a = BatchFundamentalProvider.getInstance();
      const b = BatchFundamentalProvider.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('get()', () => {
    it('returns snapshot from underlying service', async () => {
      const snap = { symbol: 'INFY', pe: 25, roe: 30 };
      mockGetSnapshot.mockResolvedValue(snap);

      const provider = BatchFundamentalProvider.getInstance();
      const result = await provider.get('INFY');
      expect(result).toEqual(snap);
    });

    it('normalises symbol to uppercase', async () => {
      mockGetSnapshot.mockResolvedValue({ symbol: 'RELIANCE' });
      const provider = BatchFundamentalProvider.getInstance();
      await provider.get('reliance');
      expect(mockGetSnapshot).toHaveBeenCalledWith('RELIANCE');
    });

    it('trims whitespace from symbol', async () => {
      mockGetSnapshot.mockResolvedValue(null);
      const provider = BatchFundamentalProvider.getInstance();
      await provider.get('  TCS  ');
      expect(mockGetSnapshot).toHaveBeenCalledWith('TCS');
    });

    it('concurrent calls for the same symbol coalesce into one fetch', async () => {
      let resolveSnap!: (v: any) => void;
      const pendingSnap = new Promise(r => { resolveSnap = r; });
      mockGetSnapshot.mockReturnValue(pendingSnap);

      const provider = BatchFundamentalProvider.getInstance();
      const p1 = provider.get('HDFC');
      const p2 = provider.get('HDFC');
      const p3 = provider.get('HDFC');

      resolveSnap({ symbol: 'HDFC' });
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1).toEqual({ symbol: 'HDFC' });
      expect(r2).toEqual({ symbol: 'HDFC' });
      expect(r3).toEqual({ symbol: 'HDFC' });
      // Only one underlying fetch despite 3 concurrent calls
      expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
    });

    it('different symbols fetch independently', async () => {
      mockGetSnapshot
        .mockResolvedValueOnce({ symbol: 'INFY' })
        .mockResolvedValueOnce({ symbol: 'TCS' });

      const provider = BatchFundamentalProvider.getInstance();
      const [r1, r2] = await Promise.all([provider.get('INFY'), provider.get('TCS')]);
      expect(r1?.symbol).toBe('INFY');
      expect(r2?.symbol).toBe('TCS');
      expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
    });

    it('returns null when service returns null', async () => {
      mockGetSnapshot.mockResolvedValue(null);
      const provider = BatchFundamentalProvider.getInstance();
      const result = await provider.get('UNKNOWN');
      expect(result).toBeNull();
    });

    it('falls back gracefully when circuit breaker throws', async () => {
      // First call (via CB) throws; second call (fallback) returns cached value
      mockGetSnapshot
        .mockRejectedValueOnce(new Error('CB open'))
        .mockResolvedValueOnce({ symbol: 'WIPRO', cached: true });

      const provider = BatchFundamentalProvider.getInstance();
      const result = await provider.get('WIPRO');
      expect(result).toEqual({ symbol: 'WIPRO', cached: true });
    });

    it('returns null when both CB and fallback fail', async () => {
      mockGetSnapshot.mockRejectedValue(new Error('service down'));
      const provider = BatchFundamentalProvider.getInstance();
      const result = await provider.get('BROKEN');
      expect(result).toBeNull();
    });

    it('inflight map is cleared after the promise resolves', async () => {
      mockGetSnapshot.mockResolvedValue({ symbol: 'ONGC' });
      const provider = BatchFundamentalProvider.getInstance();
      await provider.get('ONGC');
      // A second call should trigger a fresh fetch (inflight cleared)
      mockGetSnapshot.mockResolvedValue({ symbol: 'ONGC', v2: true });
      const result = await provider.get('ONGC');
      expect(result).toEqual({ symbol: 'ONGC', v2: true });
      expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  describe('prefetch()', () => {
    it('fetches each symbol in the list', async () => {
      mockGetSnapshot.mockResolvedValue({ symbol: 'X' });
      const provider = BatchFundamentalProvider.getInstance();
      await provider.prefetch(['INFY', 'TCS', 'HCL'], 0);
      expect(mockGetSnapshot).toHaveBeenCalledTimes(3);
    });

    it('does not throw if one symbol fails', async () => {
      mockGetSnapshot
        .mockResolvedValueOnce({ symbol: 'INFY' })
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(null);
      const provider = BatchFundamentalProvider.getInstance();
      await expect(provider.prefetch(['INFY', 'BAD', 'TCS'], 0)).resolves.toBeUndefined();
    });

    it('completes for an empty list', async () => {
      const provider = BatchFundamentalProvider.getInstance();
      await expect(provider.prefetch([], 0)).resolves.toBeUndefined();
      expect(mockGetSnapshot).not.toHaveBeenCalled();
    });
  });
});
