/**
 * Unit tests for QuantRepository
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockDbAll, mockDbRun } = vi.hoisted(() => ({
  mockDbAll: vi.fn(),
  mockDbRun: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: mockDbAll,
  dbGet: vi.fn(),
  dbRun: mockDbRun,
}));

import { QuantRepository } from '../../src/server/services/QuantRepository.js';

function resetSingleton() {
  // @ts-ignore
  QuantRepository.instance = undefined;
}

function freshRepo(): QuantRepository {
  resetSingleton();
  return QuantRepository.getInstance();
}

describe('QuantRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns a singleton', () => {
      expect(QuantRepository.getInstance()).toBe(QuantRepository.getInstance());
    });
  });

  describe('insertPaperTrade()', () => {
    it('inserts with status OPEN and all provided fields', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertPaperTrade(
        {} as any, 'pt_abc', 'INFY', 'Infosys', '["s1"]', '{}',
        '2024-06-01T00:00:00Z', 1500, 1450, 1600, 1700, 100, 150000, 'test trade'
      );
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain("'OPEN'");
      expect(params[0]).toBe('pt_abc');
      expect(params[1]).toBe('INFY');
    });

    it('passes all params in correct order', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertPaperTrade(
        {} as any, 'id1', 'TCS', 'TCS Ltd', null, null,
        '2024-01-01', 3500, 3400, 3700, 3900, 50, 175000, null
      );
      const [,, params] = mockDbRun.mock.calls[0];
      expect(params).toHaveLength(13);
      expect(params[2]).toBe('TCS Ltd');
    });
  });

  describe('listPaperTrades()', () => {
    it('returns all trades ordered by created_at DESC', async () => {
      const rows = [{ id: 'pt_1', symbol: 'INFY' }, { id: 'pt_2', symbol: 'TCS' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().listPaperTrades({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at DESC');
    });

    it('returns empty array when no trades', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().listPaperTrades({} as any)).toEqual([]);
    });
  });

  describe('updatePaperTrade()', () => {
    it('updates all fields including status, exit price, and pnl', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().updatePaperTrade(
        {} as any, 'pt_abc', 'CLOSED', '2024-07-01', 1620, 8.0, 12000, 30, 10, -5, 'WIN', 'good trade'
      );
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('UPDATE paper_trades');
      // id should be last param (WHERE id = ?)
      expect(params[params.length - 1]).toBe('pt_abc');
      expect(params[0]).toBe('CLOSED');
    });
  });

  describe('insertFunnelPreset()', () => {
    it('inserts preset with id, name, strategy_ids_json, gate_config_json', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertFunnelPreset({} as any, 'fp_xyz', 'Growth Preset', '["s1","s2"]', '{"minScore":70}');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('INSERT INTO funnel_presets');
      expect(params).toEqual(['fp_xyz', 'Growth Preset', '["s1","s2"]', '{"minScore":70}']);
    });
  });

  describe('listFunnelPresets()', () => {
    it('returns all presets ordered by created_at DESC', async () => {
      const rows = [{ id: 'fp_1', name: 'Growth' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().listFunnelPresets({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at DESC');
    });
  });

  describe('getDailyOhlcv()', () => {
    it('queries DailyOHLCV for the given symbol ordered ASC', async () => {
      const candles = [
        { date: '2024-01-01', open: 1490, high: 1510, low: 1485, close: 1500, volume: 1000000 },
      ];
      mockDbAll.mockResolvedValue(candles);
      const result = await freshRepo().getDailyOhlcv({} as any, 'INFY');
      expect(result).toEqual(candles);
      const [, sql, params] = mockDbAll.mock.calls[0];
      expect(sql).toContain('DailyOHLCV');
      expect(sql).toContain('ORDER BY trade_date ASC');
      expect(params).toContain('INFY');
    });

    it('returns empty array for unknown symbol', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getDailyOhlcv({} as any, 'NOSYM')).toEqual([]);
    });
  });

  describe('getDistinctDailyOhlcvSymbols()', () => {
    it('returns distinct symbols ordered ASC', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'HDFC' }, { symbol: 'INFY' }]);
      const result = await freshRepo().getDistinctDailyOhlcvSymbols({} as any);
      expect(result).toHaveLength(2);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('DISTINCT symbol');
      expect(sql).toContain('ORDER BY symbol ASC');
    });
  });
});
