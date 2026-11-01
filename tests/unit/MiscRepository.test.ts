/**
 * Unit tests for MiscRepository
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockDbAll, mockDbGet, mockDbRun } = vi.hoisted(() => ({
  mockDbAll: vi.fn(),
  mockDbGet: vi.fn(),
  mockDbRun: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: mockDbAll,
  dbGet: mockDbGet,
  dbRun: mockDbRun,
}));

import { MiscRepository } from '../../src/server/services/MiscRepository.js';

function resetSingleton() {
  // @ts-ignore
  MiscRepository.instance = undefined;
}

function freshRepo(): MiscRepository {
  resetSingleton();
  return MiscRepository.getInstance();
}

describe('MiscRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns a singleton', () => {
      expect(MiscRepository.getInstance()).toBe(MiscRepository.getInstance());
    });
  });

  describe('getPortfolioNames()', () => {
    it('returns portfolio names from Holdings, Transactions, and Portfolios union', async () => {
      const rows = [{ portfolio: 'FundA' }, { portfolio: 'FundB' }, { name: 'FundC' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getPortfolioNames({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('Holdings');
      expect(sql).toContain('Transactions');
      expect(sql).toContain('Portfolios');
      expect(sql).toContain('UNION');
    });

    it('returns empty array when no data', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getPortfolioNames({} as any)).toEqual([]);
    });
  });

  describe('getFallbackPortfolios()', () => {
    it('unions distinct portfolios from Holdings and Transactions', async () => {
      const rows = [{ portfolio: 'FundA' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getFallbackPortfolios({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('Holdings');
      expect(sql).toContain('Transactions');
      expect(sql).toContain('IS NOT NULL');
    });
  });

  describe('insertFemaRepatriation()', () => {
    it('inserts all 12 FEMA ledger fields', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertFemaRepatriation(
        {} as any,
        '2024-2025', '2024-08-15', 'FundA', 'NRO Savings', 'UAE',
        5000000, 86.80, 57604, 'CA123', 'CB456', 'MEM789', 'S1301'
      );
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('INSERT INTO FemaRepatriationLedger');
      expect(params).toHaveLength(12);
      expect(params[0]).toBe('2024-2025');
      expect(params[4]).toBe('UAE');
    });
  });

  describe('getAccountProfiles()', () => {
    it('returns all account profiles ordered by portfolio_name ASC', async () => {
      const rows = [
        { portfolio_name: 'Alpha', account_type: 'NRE' },
        { portfolio_name: 'Beta', account_type: 'NRO' },
      ];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getAccountProfiles({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('AccountProfiles');
      expect(sql).toContain('ORDER BY portfolio_name ASC');
    });

    it('returns empty array when no profiles', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getAccountProfiles({} as any)).toEqual([]);
    });
  });

  describe('upsertAccountProfile()', () => {
    it('upserts with ON CONFLICT update for portfolio_name', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().upsertAccountProfile(
        {} as any, 'FundA', 'NRE', 'NON_PIS', 'HDFC Bank', 'ACC1234',
        'PIS-REF-001', 'UAE', 'NRI'
      );
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('INSERT INTO AccountProfiles');
      expect(sql).toContain('ON CONFLICT(portfolio_name)');
      expect(params[0]).toBe('FundA');
      expect(params[7]).toBe('NRI');
    });

    it('passes null for optional bank fields without error', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await expect(freshRepo().upsertAccountProfile(
        {} as any, 'FundB', 'NRO', 'NON_PIS', null, null, null, 'US', 'NRI'
      )).resolves.toBeUndefined();
    });
  });

  describe('getFereStock()', () => {
    it('returns enriched ledger row matching cleanSymbol or rawSymbol', async () => {
      const row = { symbol: 'INFY', fere_score: 85 };
      mockDbGet.mockResolvedValue(row);
      const result = await freshRepo().getFereStock({} as any, 'INFY', 'INFY-EQ');
      expect(result).toEqual(row);
      expect(mockDbGet).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('FEREEnrichedLedger'),
        ['INFY', 'INFY-EQ']
      );
    });

    it('returns undefined when symbol not found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      const result = await freshRepo().getFereStock({} as any, 'NOSYM', 'NOSYM-EQ');
      expect(result).toBeUndefined();
    });
  });
});
