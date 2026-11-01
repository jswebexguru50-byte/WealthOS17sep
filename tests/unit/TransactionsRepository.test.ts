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

import { TransactionsRepository } from '../../src/server/services/TransactionsRepository.js';

function resetSingleton() { (TransactionsRepository as any).instance = undefined; }
function fresh() { resetSingleton(); return TransactionsRepository.getInstance(); }
const db: any = {};

describe('TransactionsRepository', () => {
  beforeEach(() => { vi.clearAllMocks(); resetSingleton(); });
  afterEach(() => { resetSingleton(); });

  describe('getInstance', () => {
    it('is a singleton', () => expect(fresh()).toBe(TransactionsRepository.getInstance()));
  });

  describe('countTransactions', () => {
    it('returns count row', async () => {
      mockDbGet.mockResolvedValue({ count: 42 });
      const result: any = await fresh().countTransactions(db, 'FROM Transactions WHERE 1=1', []);
      expect(result.count).toBe(42);
    });
    it('returns 0 when no rows', async () => {
      mockDbGet.mockResolvedValue({ count: 0 });
      const result: any = await fresh().countTransactions(db, 'FROM Transactions WHERE 1=0', []);
      expect(result.count).toBe(0);
    });
  });

  describe('getTransactions', () => {
    it('returns paginated rows', async () => {
      mockDbAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await fresh().getTransactions(db, 'SELECT *', 'FROM Transactions WHERE 1=1', 'date DESC', 50, 0, []);
      expect(result).toHaveLength(2);
    });
    it('passes limit and offset', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getTransactions(db, 'SELECT *', 'FROM Transactions WHERE 1=1', 'date DESC', 25, 50, []);
      const params = mockDbAll.mock.calls[0][2];
      expect(params[params.length - 2]).toBe(25);
      expect(params[params.length - 1]).toBe(50);
    });
  });

  describe('findTickerBySymbolOrIsin', () => {
    it('returns ticker match', async () => {
      mockDbGet.mockResolvedValue({ symbol: 'INFY', isin: 'INE009A01021' });
      const result: any = await fresh().findTickerBySymbolOrIsin(db, 'INFY', '');
      expect(result.symbol).toBe('INFY');
      expect(mockDbGet.mock.calls[0][2]).toEqual(['INFY', '']);
    });
    it('returns undefined when not found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().findTickerBySymbolOrIsin(db, 'NOSYM', '')).toBeUndefined();
    });
  });

  describe('findIsinBySymbol', () => {
    it('excludes CUSTOM_ ISINs', async () => {
      mockDbGet.mockResolvedValue({ isin: 'INE009A01021' });
      const result: any = await fresh().findIsinBySymbol(db, 'INFY');
      expect(result.isin).toBe('INE009A01021');
      expect(mockDbGet.mock.calls[0][1]).toContain('CUSTOM_');
    });
    it('returns undefined when no real ISIN', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().findIsinBySymbol(db, 'MF_SYM')).toBeUndefined();
    });
  });

  describe('insertMutualFundTicker', () => {
    it('inserts OR IGNORE with MUTUAL_FUND params', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().insertMutualFundTicker(db, 'CUSTOM_MF123', 'MF SCHEME');
      expect(mockDbRun.mock.calls[0][2]).toContain('CUSTOM_MF123');
    });
  });

  describe('insertTransaction', () => {
    it('passes all 15 fields', async () => {
      mockDbRun.mockResolvedValue({ lastID: 7 });
      const result = await fresh().insertTransaction(db, {
        date: '2026-01-01', portfolio: 'P', type: 'BUY', isin: 'I', symbol: 'S',
        quantity: 10, price: 100, gross_amount: 1000, brokerage: 5, net_amount: 1005,
        notes: '', isCashFlow: 1, broker_name: '', account_number: '', folio: ''
      });
      expect(result.lastID).toBe(7);
      expect(mockDbRun.mock.calls[0][2]).toHaveLength(15);
    });
  });

  describe('findTickerBySymbolOrName', () => {
    it('searches by symbol or name', async () => {
      mockDbGet.mockResolvedValue({ symbol: 'INFY', isin: 'X' });
      await fresh().findTickerBySymbolOrName(db, 'INFY');
      expect(mockDbGet.mock.calls[0][2]).toEqual(['INFY', 'INFY']);
    });
    it('returns undefined if no match', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().findTickerBySymbolOrName(db, 'XX')).toBeUndefined();
    });
  });

  describe('findIsinBySymbolStrict', () => {
    it('requires non-null non-empty ISIN', async () => {
      mockDbGet.mockResolvedValue({ isin: 'INE009A01021' });
      const result: any = await fresh().findIsinBySymbolStrict(db, 'INFY');
      expect(result.isin).toBeTruthy();
    });
  });

  describe('updateTransaction', () => {
    it('updates 13 fields + id', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().updateTransaction(db, '5', {
        date: '2026-01-01', portfolio: 'P', type: 'SELL', isin: 'I', symbol: 'S',
        quantity: 5, price: 200, gross_amount: 1000, brokerage: 0, net_amount: 1000,
        notes: '', isCashFlow: 1
      });
      const params = mockDbRun.mock.calls[0][2];
      expect(params[params.length - 1]).toBe('5');
    });
  });

  describe('deleteTransaction', () => {
    it('deletes by id', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().deleteTransaction(db, '3');
      expect(mockDbRun).toHaveBeenCalledWith(db, expect.stringContaining('DELETE'), ['3']);
    });
  });

  describe('bulkDeleteTransactions', () => {
    it('builds IN placeholder from ids', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().bulkDeleteTransactions(db, [1, 2, 3]);
      expect(mockDbRun.mock.calls[0][2]).toEqual([1, 2, 3]);
    });
  });

  describe('bulkUpdateTransactions', () => {
    it('appends ids after clause params', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().bulkUpdateTransactions(db, ['portfolio = ?'], ['NewPort'], [10, 11]);
      const params = mockDbRun.mock.calls[0][2];
      expect(params).toEqual(['NewPort', 10, 11]);
    });
  });

  describe('getAllTransactions / getAllCorporateActions / getAllHoldings / getAllMasterTickers', () => {
    it('getAllTransactions orders by date DESC', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getAllTransactions(db);
      expect(mockDbAll.mock.calls[0][1]).toContain('date DESC');
    });
    it('getAllCorporateActions orders by record_date', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getAllCorporateActions(db);
      expect(mockDbAll.mock.calls[0][1]).toContain('record_date');
    });
    it('getAllHoldings orders by current_value', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getAllHoldings(db);
      expect(mockDbAll.mock.calls[0][1]).toContain('current_value');
    });
    it('getAllMasterTickers orders by symbol', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getAllMasterTickers(db);
      expect(mockDbAll.mock.calls[0][1]).toContain('symbol');
    });
  });

  describe('updateMasterTicker', () => {
    it('passes id as last param', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().updateMasterTicker(db, '7', {
        isin: 'I', symbol: 'S', name: 'N', exchange: 'NSE', sector: 'IT',
        manual_ltp: 100, manual_ltp_date: '2026-01-01', fmv_31_jan_2018: 90
      });
      const params = mockDbRun.mock.calls[0][2];
      expect(params[params.length - 1]).toBe('7');
    });
  });

  describe('getHoldingsBySymbolOrIsin', () => {
    it('queries by symbol or isin', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'P', quantity: 10 }]);
      await fresh().getHoldingsBySymbolOrIsin(db, 'INFY', 'INE009A01021');
      expect(mockDbAll.mock.calls[0][2]).toEqual(['INFY', 'INE009A01021']);
    });
    it('returns [] when no holdings', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getHoldingsBySymbolOrIsin(db, 'X', 'Y')).toEqual([]);
    });
  });

  describe('updateHoldingLtp', () => {
    it('passes 8 params', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().updateHoldingLtp(db, 150, 1500, 500, 50, 'P', 'ISIN', 'SYM', 'NA');
      expect(mockDbRun.mock.calls[0][2]).toHaveLength(8);
    });
  });

  describe('upsertMasterTickerByIsin', () => {
    it('uses ON CONFLICT upsert', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().upsertMasterTickerByIsin(db, { isin: 'I', symbol: 'S', name: 'N', exchange: 'NYSE', sector: '', manual_ltp: null, fmv_31_jan_2018: 0 });
      expect(mockDbRun.mock.calls[0][1]).toContain('ON CONFLICT');
    });
  });
});
