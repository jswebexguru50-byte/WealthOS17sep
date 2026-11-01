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

import { SettingsRepository } from '../../src/server/services/SettingsRepository.js';

function resetSingleton() { (SettingsRepository as any).instance = undefined; }
function fresh() { resetSingleton(); return SettingsRepository.getInstance(); }
const db: any = {};

describe('SettingsRepository', () => {
  beforeEach(() => { vi.clearAllMocks(); resetSingleton(); });
  afterEach(() => { resetSingleton(); });

  describe('getInstance', () => {
    it('is a singleton', () => expect(fresh()).toBe(SettingsRepository.getInstance()));
  });

  describe('getAllConfig', () => {
    it('returns key/value rows', async () => {
      mockDbAll.mockResolvedValue([{ key: 'theme', value: 'dark' }]);
      const result = await fresh().getAllConfig(db);
      expect(result[0].key).toBe('theme');
      expect(mockDbAll.mock.calls[0][1]).toContain('AppConfig');
    });
    it('returns [] when config table empty', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getAllConfig(db)).toEqual([]);
    });
  });

  describe('upsertConfig', () => {
    it('inserts or replaces key/value pair', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().upsertConfig(db, 'theme', 'light');
      expect(mockDbRun).toHaveBeenCalledWith(db, expect.stringContaining('INSERT OR REPLACE'), ['theme', 'light']);
    });
    it('passes value as second param', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().upsertConfig(db, 'lang', 'en');
      expect(mockDbRun.mock.calls[0][2]).toEqual(['lang', 'en']);
    });
  });

  describe('getTickers', () => {
    it('returns all tickers when no search', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'INFY' }]);
      await fresh().getTickers(db);
      expect(mockDbAll.mock.calls[0][1]).not.toContain('LIKE');
    });
    it('adds LIKE filter when search provided', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getTickers(db, 'inf');
      const sql = mockDbAll.mock.calls[0][1];
      expect(sql).toContain('LIKE');
      expect(mockDbAll.mock.calls[0][2]).toHaveLength(3);
    });
  });

  describe('findTickerById', () => {
    it('returns ticker row', async () => {
      mockDbGet.mockResolvedValue({ symbol: 'TCS', isin: 'INE467B01029' });
      const result: any = await fresh().findTickerById(db, 1);
      expect(result.symbol).toBe('TCS');
      expect(mockDbGet.mock.calls[0][2]).toEqual([1]);
    });
    it('returns undefined when not found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().findTickerById(db, 9999)).toBeUndefined();
    });
  });

  describe('remapTransactionsToTicker', () => {
    it('updates symbol and isin in Transactions', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().remapTransactionsToTicker(db, 'TCS', 'INE467B01029', 'TCS_OLD', 'INE467BXXXXX');
      const params = mockDbRun.mock.calls[0][2];
      expect(params[0]).toBe('TCS');
      expect(params[1]).toBe('INE467B01029');
    });
  });

  describe('remapHoldingsToTicker', () => {
    it('updates symbol and isin in Holdings', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().remapHoldingsToTicker(db, 'TCS', 'INE467B01029', 'TCS_OLD', 'INE467BXXXXX');
      expect(mockDbRun.mock.calls[0][1]).toContain('Holdings');
    });
  });

  describe('deleteTicker', () => {
    it('deletes by id', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().deleteTicker(db, 5);
      expect(mockDbRun).toHaveBeenCalledWith(db, expect.stringContaining('DELETE'), [5]);
    });
  });

  describe('upsertTicker', () => {
    it('uses ON CONFLICT upsert', async () => {
      mockDbRun.mockResolvedValue({ lastID: 10 });
      await fresh().upsertTicker(db, { isin: 'I', symbol: 'S', name: 'N', exchange: 'NSE', segment: 'EQ', sector: 'IT', manual_ltp: 100, fmv_31_jan_2018: 90 });
      expect(mockDbRun.mock.calls[0][1]).toContain('ON CONFLICT');
    });
    it('passes 8 values', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().upsertTicker(db, { isin: 'I', symbol: 'S', name: '', exchange: '', segment: '', sector: '', manual_ltp: null, fmv_31_jan_2018: null });
      expect(mockDbRun.mock.calls[0][2]).toHaveLength(8);
    });
  });

  describe('updateTicker', () => {
    it('passes id as last param', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().updateTicker(db, 7, { symbol: 'S', name: 'N', exchange: 'BSE', segment: 'EQ', sector: 'FIN', manual_ltp: 200, fmv_31_jan_2018: 150 });
      const params = mockDbRun.mock.calls[0][2];
      expect(params[params.length - 1]).toBe(7);
    });
    it('uses COALESCE to preserve existing values', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().updateTicker(db, 1, { symbol: null, name: null, exchange: null, segment: null, sector: null, manual_ltp: null, fmv_31_jan_2018: null });
      expect(mockDbRun.mock.calls[0][1]).toContain('COALESCE');
    });
  });

  describe('getUserMappings', () => {
    it('returns mappings ordered by raw_name', async () => {
      mockDbAll.mockResolvedValue([{ raw_name: 'ABCD', canonical: 'INFY' }]);
      const result = await fresh().getUserMappings(db);
      expect(result[0].raw_name).toBe('ABCD');
      expect(mockDbAll.mock.calls[0][1]).toContain('raw_name ASC');
    });
    it('returns [] when no mappings', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getUserMappings(db)).toEqual([]);
    });
  });
});
