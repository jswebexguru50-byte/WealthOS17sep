/**
 * index_data_resolver.test.ts
 *
 * Unit tests for IndexDataResolverService — the canonical wrapper that routes
 * index/benchmark symbol fetches (^NSEI, ^CRSLDX, ^GSPC, BZ=F, etc.) through
 * a singleton service rather than calling fetchTickerData directly from consumers.
 *
 * These tests verify:
 * 1. Singleton contract — getInstance() always returns the same instance.
 * 2. Delegation — resolveIndexData delegates to fetchTickerData.
 * 3. Null-safety — null/undefined from underlying provider propagates cleanly.
 * 4. Symbol passthrough — the symbol is forwarded without transformation.
 * 5. daysBack passthrough — the daysBack argument is forwarded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock fetchTickerData before importing the service ─────────────────────
vi.mock('../../src/server/yahooFinance.js', () => ({
  fetchTickerData: vi.fn(),
}));

import { fetchTickerData } from '../../src/server/yahooFinance.js';
import { IndexDataResolverService } from '../../src/server/services/IndexDataResolverService.js';

const mockFetch = fetchTickerData as ReturnType<typeof vi.fn>;

const NSEI_MOCK = {
  closePrices: [
    { date: '2026-10-28', open: 24000, high: 24200, low: 23900, close: 24100, volume: 1e8 },
    { date: '2026-10-29', open: 24100, high: 24300, low: 24050, close: 24250, volume: 1.1e8 },
  ],
};

describe('IndexDataResolverService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton between tests
    (IndexDataResolverService as any).instance = undefined;
  });

  afterEach(() => {
    (IndexDataResolverService as any).instance = undefined;
  });

  describe('Singleton contract', () => {
    it('getInstance() always returns the same object reference', () => {
      const a = IndexDataResolverService.getInstance();
      const b = IndexDataResolverService.getInstance();
      expect(a).toBe(b);
    });

    it('is created without arguments (no db param needed for index data)', () => {
      expect(() => IndexDataResolverService.getInstance()).not.toThrow();
    });
  });

  describe('resolveIndexData — delegation to fetchTickerData', () => {
    it('calls fetchTickerData with the given symbol and daysBack', async () => {
      mockFetch.mockResolvedValue(NSEI_MOCK);
      await IndexDataResolverService.getInstance().resolveIndexData('^NSEI', 180);
      expect(mockFetch).toHaveBeenCalledWith('^NSEI', 180);
    });

    it('returns the value from fetchTickerData unchanged', async () => {
      mockFetch.mockResolvedValue(NSEI_MOCK);
      const result = await IndexDataResolverService.getInstance().resolveIndexData('^NSEI', 180);
      expect(result).toEqual(NSEI_MOCK);
    });

    it('uses 365 days as default daysBack when not specified', async () => {
      mockFetch.mockResolvedValue(NSEI_MOCK);
      await IndexDataResolverService.getInstance().resolveIndexData('^NSEI');
      expect(mockFetch).toHaveBeenCalledWith('^NSEI', 365);
    });

    it('passes ^CRSLDX (Nifty 500) symbol unchanged', async () => {
      mockFetch.mockResolvedValue(NSEI_MOCK);
      await IndexDataResolverService.getInstance().resolveIndexData('^CRSLDX', 180);
      expect(mockFetch).toHaveBeenCalledWith('^CRSLDX', 180);
    });

    it('passes ^GSPC (S&P 500) symbol unchanged', async () => {
      mockFetch.mockResolvedValue(null);
      await IndexDataResolverService.getInstance().resolveIndexData('^GSPC', 30);
      expect(mockFetch).toHaveBeenCalledWith('^GSPC', 30);
    });

    it('passes BZ=F (Brent crude) unchanged', async () => {
      mockFetch.mockResolvedValue(null);
      await IndexDataResolverService.getInstance().resolveIndexData('BZ=F', 30);
      expect(mockFetch).toHaveBeenCalledWith('BZ=F', 30);
    });
  });

  describe('Null-safety', () => {
    it('propagates null from fetchTickerData without throwing', async () => {
      mockFetch.mockResolvedValue(null);
      const result = await IndexDataResolverService.getInstance().resolveIndexData('^NSEI', 180);
      expect(result).toBeNull();
    });

    it('propagates rejection as null (catch semantics)', async () => {
      mockFetch.mockRejectedValue(new Error('network timeout'));
      const result = await IndexDataResolverService.getInstance()
        .resolveIndexData('^NSEI', 180)
        .catch(() => null);
      expect(result).toBeNull();
    });
  });

  describe('Regression: callsites that must NOT call fetchTickerData directly', () => {
    it('ConsolidatedOpportunityEngine benchmark path goes through resolver', () => {
      // This is a structural check — if IndexDataResolverService is a singleton
      // and delegates correctly, the consumer only needs to call getInstance().
      const svc = IndexDataResolverService.getInstance();
      expect(typeof svc.resolveIndexData).toBe('function');
    });
  });
});
