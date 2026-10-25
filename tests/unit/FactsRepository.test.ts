/**
 * Unit tests for FactsRepository
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockDbAll, mockDbGet } = vi.hoisted(() => ({
  mockDbAll: vi.fn(),
  mockDbGet: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: mockDbAll,
  dbGet: mockDbGet,
  dbRun: vi.fn(),
}));

import { FactsRepository } from '../../src/server/services/FactsRepository.js';

function resetSingleton() {
  // @ts-ignore
  FactsRepository.instance = undefined;
}

function freshRepo(): FactsRepository {
  resetSingleton();
  return FactsRepository.getInstance();
}

describe('FactsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    // Advance fake timers so cache TTL checks work correctly
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns a singleton', () => {
      const a = FactsRepository.getInstance();
      const b = FactsRepository.getInstance();
      expect(a).toBe(b);
    });
  });

  // ── getTicker ────────────────────────────────────────────────────────────────

  describe('getTicker()', () => {
    it('returns ticker from DB', async () => {
      const ticker = { symbol: 'INFY', isin: 'INE009A01021', name: 'Infosys', exchange: 'NSE', segment: 'EQ' };
      mockDbGet.mockResolvedValue(ticker);

      const repo = freshRepo();
      const result = await repo.getTicker('INFY');
      expect(result).toEqual(ticker);
    });

    it('normalises symbol to uppercase before DB query', async () => {
      mockDbGet.mockResolvedValue(null);
      const repo = freshRepo();
      await repo.getTicker('infy');
      expect(mockDbGet).toHaveBeenCalledWith(expect.anything(), expect.any(String), ['INFY', 'INFY']);
    });

    it('caches the result so second call does not hit DB', async () => {
      const ticker = { symbol: 'TCS', isin: 'INE467B01029', name: 'TCS', exchange: 'NSE', segment: 'EQ' };
      mockDbGet.mockResolvedValue(ticker);

      const repo = freshRepo();
      await repo.getTicker('TCS');
      await repo.getTicker('TCS');
      expect(mockDbGet).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after TTL expires (2 min)', async () => {
      const ticker = { symbol: 'WIPRO', isin: 'INE075A01022', name: 'Wipro', exchange: 'NSE', segment: 'EQ' };
      mockDbGet.mockResolvedValue(ticker);

      const repo = freshRepo();
      await repo.getTicker('WIPRO');
      expect(mockDbGet).toHaveBeenCalledTimes(1);

      // Advance past 2-min TTL
      vi.advanceTimersByTime(2 * 60 * 1000 + 1);

      await repo.getTicker('WIPRO');
      expect(mockDbGet).toHaveBeenCalledTimes(2);
    });

    it('returns null for unknown symbol', async () => {
      // MiniCache cannot distinguish "stored null" from "miss" so null results are not cached
      mockDbGet.mockResolvedValue(null);
      const repo = freshRepo();
      const result = await repo.getTicker('NOSUCHSYMBOL');
      expect(result).toBeNull();
    });

    it('invalidateTicker forces re-fetch', async () => {
      const ticker = { symbol: 'HDFC', isin: 'X', name: 'HDFC', exchange: 'NSE', segment: 'EQ' };
      mockDbGet.mockResolvedValue(ticker);

      const repo = freshRepo();
      await repo.getTicker('HDFC');
      repo.invalidateTicker('HDFC');
      await repo.getTicker('HDFC');
      expect(mockDbGet).toHaveBeenCalledTimes(2);
    });
  });

  // ── getNseEquityUniverse ─────────────────────────────────────────────────────

  describe('getNseEquityUniverse()', () => {
    it('returns the full list from DB', async () => {
      const universe = [
        { symbol: 'INFY', isin: 'A', name: 'Infosys', exchange: 'NSE', segment: 'EQ' },
        { symbol: 'TCS',  isin: 'B', name: 'TCS',     exchange: 'NSE', segment: 'EQ' },
      ];
      mockDbAll.mockResolvedValue(universe);
      const repo = freshRepo();
      const result = await repo.getNseEquityUniverse();
      expect(result).toHaveLength(2);
    });

    it('caches result so second call does not hit DB', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.getNseEquityUniverse();
      await repo.getNseEquityUniverse();
      expect(mockDbAll).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after TTL expires', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.getNseEquityUniverse();
      vi.advanceTimersByTime(2 * 60 * 1000 + 1);
      await repo.getNseEquityUniverse();
      expect(mockDbAll).toHaveBeenCalledTimes(2);
    });
  });

  // ── searchTickers ────────────────────────────────────────────────────────────

  describe('searchTickers()', () => {
    it('passes LIKE pattern to DB', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.searchTickers('infosys');
      const [,, params] = mockDbAll.mock.calls[0];
      expect(params[0]).toBe('%INFOSYS%');
    });

    it('respects custom limit', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.searchTickers('tcs', 5);
      const [,, params] = mockDbAll.mock.calls[0];
      expect(params[3]).toBe(5);
    });
  });

  // ── listActivePortfolios ─────────────────────────────────────────────────────

  describe('listActivePortfolios()', () => {
    it('returns active portfolios without member filter', async () => {
      const portfolios = [{ id: 1, name: 'Alpha', status: 'ACTIVE' }];
      mockDbAll.mockResolvedValue(portfolios);

      const repo = freshRepo();
      const result = await repo.listActivePortfolios();
      expect(result).toEqual(portfolios);
    });

    it('uses member-scoped query when memberId is provided', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.listActivePortfolios(42);
      const [, sql, params] = mockDbAll.mock.calls[0];
      expect(sql).toContain('member_id');
      expect(params).toContain(42);
    });

    it('caches result per member key', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.listActivePortfolios();
      await repo.listActivePortfolios();
      expect(mockDbAll).toHaveBeenCalledTimes(1);
    });

    it('separate cache entries for different member IDs', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.listActivePortfolios(1);
      await repo.listActivePortfolios(2);
      expect(mockDbAll).toHaveBeenCalledTimes(2);
    });

    it('invalidatePortfolios clears all cached entries', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.listActivePortfolios();
      repo.invalidatePortfolios();
      await repo.listActivePortfolios();
      expect(mockDbAll).toHaveBeenCalledTimes(2);
    });
  });

  // ── getPortfolio ─────────────────────────────────────────────────────────────

  describe('getPortfolio()', () => {
    it('returns a portfolio by name', async () => {
      const p = { id: 1, name: 'Alpha', status: 'ACTIVE' };
      mockDbGet.mockResolvedValue(p);
      const repo = freshRepo();
      const result = await repo.getPortfolio('Alpha');
      expect(result).toEqual(p);
    });

    it('returns null/undefined when portfolio not found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      const repo = freshRepo();
      const result = await repo.getPortfolio('NONEXISTENT');
      expect(result == null).toBe(true);
    });
  });

  // ── getHoldings ──────────────────────────────────────────────────────────────

  describe('getHoldings()', () => {
    it('fetches all holdings when no portfolio filter', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'Alpha', symbol: 'INFY', quantity: 100 }]);
      const repo = freshRepo();
      const result = await repo.getHoldings();
      expect(result).toHaveLength(1);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).not.toContain('WHERE');
    });

    it('filters by single portfolio string', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.getHoldings('Alpha');
      const [, sql, params] = mockDbAll.mock.calls[0];
      expect(sql).toContain('portfolio');
      expect(params).toContain('Alpha');
    });

    it('filters by array of portfolios', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.getHoldings(['Alpha', 'Beta']);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('IN');
    });

    it('returns all holdings when empty array is passed', async () => {
      mockDbAll.mockResolvedValue([]);
      const repo = freshRepo();
      await repo.getHoldings([]);
      const [, sql] = mockDbAll.mock.calls[0];
      // Empty array → treat as "all"
      expect(sql).not.toContain('WHERE');
    });
  });
});
