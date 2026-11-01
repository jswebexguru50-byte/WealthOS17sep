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

import { PortfolioRepository } from '../../src/server/services/PortfolioRepository.js';

function resetSingleton() { (PortfolioRepository as any).instance = undefined; }
function fresh() { resetSingleton(); return PortfolioRepository.getInstance(); }
const db: any = {};

describe('PortfolioRepository', () => {
  beforeEach(() => { vi.clearAllMocks(); resetSingleton(); });
  afterEach(() => { resetSingleton(); });

  describe('getInstance', () => {
    it('returns singleton', () => expect(fresh()).toBe(PortfolioRepository.getInstance()));
  });

  describe('getByMemberId', () => {
    it('returns rows for member', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'Alpha' }]);
      const result = await fresh().getByMemberId(db, 1);
      expect(result).toEqual([{ portfolio: 'Alpha' }]);
      expect(mockDbAll).toHaveBeenCalledWith(db, expect.stringContaining('member_id'), [1, 1]);
    });
    it('returns [] when no portfolios', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getByMemberId(db, 99)).toEqual([]);
    });
  });

  describe('getAllRanked', () => {
    it('returns ordered portfolios', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'P1' }, { portfolio: 'P2' }]);
      const result = await fresh().getAllRanked(db);
      expect(result).toHaveLength(2);
      expect(mockDbAll.mock.calls[0][1]).toContain('PortfolioNames');
    });
    it('returns [] when empty', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getAllRanked(db)).toEqual([]);
    });
  });

  describe('getDetailedByMemberId', () => {
    it('passes memberId twice for permissions check', async () => {
      mockDbAll.mockResolvedValue([{ id: 1, name: 'Alpha' }]);
      const result = await fresh().getDetailedByMemberId(db, 5);
      expect(result[0].name).toBe('Alpha');
      const call = mockDbAll.mock.calls[0];
      expect(call[2]).toEqual([5, 5]);
    });
    it('returns [] when member has no portfolios', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getDetailedByMemberId(db, 99)).toEqual([]);
    });
  });

  describe('getAllDetailed', () => {
    it('queries all portfolios ordered by name', async () => {
      mockDbAll.mockResolvedValue([{ id: 1, name: 'A' }]);
      const result = await fresh().getAllDetailed(db);
      expect(result).toHaveLength(1);
      expect(mockDbAll.mock.calls[0][1]).toContain('ORDER BY name');
    });
  });

  describe('getPmsByMemberId', () => {
    it('filters PMS by member', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'cc9' }]);
      const result = await fresh().getPmsByMemberId(db, 1);
      expect(result[0].portfolio).toBe('cc9');
      expect(mockDbAll.mock.calls[0][2]).toEqual([1, 1]);
    });
  });

  describe('getPmsAll', () => {
    it('returns all PMS portfolios', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'cc9' }, { portfolio: 'iifl' }]);
      expect(await fresh().getPmsAll(db)).toHaveLength(2);
    });
    it('returns [] when none', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getPmsAll(db)).toEqual([]);
    });
  });

  describe('findByName', () => {
    it('returns existing portfolio', async () => {
      mockDbGet.mockResolvedValue({ id: 1 });
      expect(await fresh().findByName(db, 'Alpha')).toEqual({ id: 1 });
      expect(mockDbGet).toHaveBeenCalledWith(db, expect.any(String), ['Alpha']);
    });
    it('returns undefined when not found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().findByName(db, 'NoSuch')).toBeUndefined();
    });
  });

  describe('create', () => {
    it('inserts with name/type/currency', async () => {
      mockDbRun.mockResolvedValue({ lastID: 5 });
      await fresh().create(db, 'P', 'EQUITY', 'INR');
      expect(mockDbRun).toHaveBeenCalledWith(db, expect.stringContaining('INSERT'), ['P', 'EQUITY', 'INR']);
    });
  });

  describe('insertWithType', () => {
    it('inserts portfolio with type only', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().insertWithType(db, 'P', 'PMS');
      expect(mockDbRun.mock.calls[0][2]).toEqual(['P', 'PMS']);
    });
  });

  describe('updateType', () => {
    it('updates portfolio type', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().updateType(db, 'P', 'MF');
      expect(mockDbRun.mock.calls[0][2]).toEqual(['MF', 'P']);
    });
  });

  describe('insertWithCurrency', () => {
    it('inserts with currency', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().insertWithCurrency(db, 'P', 'USD');
      expect(mockDbRun.mock.calls[0][2]).toContain('USD');
    });
  });

  describe('updateCurrency', () => {
    it('updates base_currency', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().updateCurrency(db, 'P', 'USD');
      expect(mockDbRun.mock.calls[0][2]).toEqual(['USD', 'P']);
    });
  });

  describe('renameInTable', () => {
    it('updates the given table column', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().renameInTable(db, 'Holdings', 'portfolio', 'New', 'Old');
      expect(mockDbRun).toHaveBeenCalledWith(db, 'UPDATE Holdings SET portfolio = ? WHERE portfolio = ?', ['New', 'Old']);
    });
    it('does not throw when table does not exist (catch suppresses)', async () => {
      mockDbRun.mockRejectedValue(new Error('no such table'));
      await expect(fresh().renameInTable(db, 'Ghost', 'col', 'N', 'O')).resolves.toBeUndefined();
    });
  });

  describe('renamePortfolio', () => {
    it('renames the Portfolios row', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().renamePortfolio(db, 'NewName', 'OldName');
      expect(mockDbRun.mock.calls[0][2]).toEqual(['NewName', 'OldName']);
    });
  });

  describe('deleteFromTable', () => {
    it('deletes rows by col', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().deleteFromTable(db, 'Holdings', 'portfolio', 'P1');
      expect(mockDbRun).toHaveBeenCalledWith(db, 'DELETE FROM Holdings WHERE portfolio = ?', ['P1']);
    });
  });

  describe('archive', () => {
    it('sets status to ARCHIVED', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().archive(db, 'P1');
      expect(mockDbRun).toHaveBeenCalledWith(db, expect.stringContaining("'ARCHIVED'"), ['P1']);
    });
  });

  describe('transaction helpers', () => {
    it('beginTransaction calls BEGIN', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().beginTransaction(db);
      expect(mockDbRun.mock.calls[0][1]).toBe('BEGIN TRANSACTION');
    });
    it('commit calls COMMIT', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().commit(db);
      expect(mockDbRun.mock.calls[0][1]).toBe('COMMIT');
    });
    it('rollback does not throw even if DB errors', async () => {
      mockDbRun.mockRejectedValue(new Error('already rolled back'));
      await expect(fresh().rollback(db)).resolves.toBeUndefined();
    });
  });
});
