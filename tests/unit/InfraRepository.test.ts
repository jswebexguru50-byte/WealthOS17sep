/**
 * Unit tests for InfraRepository — all DB calls are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

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

import { InfraRepository } from '../../src/server/services/InfraRepository.js';

function resetSingleton() {
  // @ts-ignore
  InfraRepository.instance = undefined;
}

function freshRepo(): InfraRepository {
  resetSingleton();
  return InfraRepository.getInstance();
}

describe('InfraRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  // ── singleton ────────────────────────────────────────────────────────────────

  describe('getInstance', () => {
    it('returns the same instance every time', () => {
      const a = InfraRepository.getInstance();
      const b = InfraRepository.getInstance();
      expect(a).toBe(b);
    });
  });

  // ── getDataSources ───────────────────────────────────────────────────────────

  describe('getDataSources()', () => {
    it('returns all data sources ordered by tier', async () => {
      const rows = [{ source_id: 'A', reliability_tier: 1 }, { source_id: 'B', reliability_tier: 2 }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getDataSources({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('data_sources');
      expect(sql).toContain('reliability_tier');
    });

    it('returns [] when table is empty', async () => {
      mockDbAll.mockResolvedValue([]);
      const result = await freshRepo().getDataSources({} as any);
      expect(result).toEqual([]);
    });
  });

  // ── getCorporateActionsAll ───────────────────────────────────────────────────

  describe('getCorporateActionsAll()', () => {
    it('passes limit to SQL', async () => {
      mockDbAll.mockResolvedValue([]);
      await freshRepo().getCorporateActionsAll({} as any, 50);
      const [, , params] = mockDbAll.mock.calls[0];
      expect(params).toContain(50);
    });

    it('returns rows', async () => {
      const rows = [{ id: 1, symbol: 'INFY', record_date: '2024-01-01', action_type: 'DIVIDEND' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getCorporateActionsAll({} as any, 10);
      expect(result).toHaveLength(1);
    });
  });

  // ── getHistoricalPricesUniverseCount ─────────────────────────────────────────

  describe('getHistoricalPricesUniverseCount()', () => {
    it('returns the count from the first row', async () => {
      mockDbAll.mockResolvedValue([{ count: 742 }]);
      const count = await freshRepo().getHistoricalPricesUniverseCount({} as any);
      expect(count).toBe(742);
    });

    it('returns 0 when no rows returned', async () => {
      mockDbAll.mockResolvedValue([]);
      const count = await freshRepo().getHistoricalPricesUniverseCount({} as any);
      expect(count).toBe(0);
    });
  });

  // ── getDailyOHLCVSymbols ─────────────────────────────────────────────────────

  describe('getDailyOHLCVSymbols()', () => {
    it('queries DailyOHLCV for DISTINCT symbols', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'INFY' }, { symbol: 'TCS' }]);
      const result = await freshRepo().getDailyOHLCVSymbols({} as any);
      expect(result).toHaveLength(2);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('DailyOHLCV');
      expect(sql).toContain('DISTINCT');
    });

    it('returns [] when table empty', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getDailyOHLCVSymbols({} as any)).toEqual([]);
    });
  });

  // ── getDailyOHLCVSymbolsForBacktest ──────────────────────────────────────────

  describe('getDailyOHLCVSymbolsForBacktest()', () => {
    it('filters to symbols with >= 100 bars', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'RELIANCE' }]);
      await freshRepo().getDailyOHLCVSymbolsForBacktest({} as any);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('100');
      expect(sql).toContain('LIMIT 150');
    });

    it('returns [] when no qualifying symbols', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getDailyOHLCVSymbolsForBacktest({} as any)).toEqual([]);
    });
  });

  // ── getCandlesForSymbol ──────────────────────────────────────────────────────

  describe('getCandlesForSymbol()', () => {
    it('passes symbol as parameter', async () => {
      mockDbAll.mockResolvedValue([]);
      await freshRepo().getCandlesForSymbol({} as any, 'WIPRO');
      const [, , params] = mockDbAll.mock.calls[0];
      expect(params).toContain('WIPRO');
    });

    it('returns OHLCV rows', async () => {
      const candles = [{ date: '2024-01-01', open: 100, high: 110, low: 95, close: 105, volume: 1000000 }];
      mockDbAll.mockResolvedValue(candles);
      const result = await freshRepo().getCandlesForSymbol({} as any, 'WIPRO');
      expect(result).toEqual(candles);
    });
  });

  // ── bulkInsertDailyOHLCVRows ─────────────────────────────────────────────────

  describe('bulkInsertDailyOHLCVRows()', () => {
    it('wraps inserts in a transaction and returns row count', async () => {
      mockDbRun.mockResolvedValue(undefined);
      const rows: any[][] = [['INFY', '2024-01-01', 100, 110, 95, 105, 500000]];
      const stored = await freshRepo().bulkInsertDailyOHLCVRows({} as any, rows);
      expect(stored).toBe(1);
      const calls = mockDbRun.mock.calls.map((c: any) => c[1] as string);
      expect(calls.some((sql: string) => sql.includes('BEGIN'))).toBe(true);
      expect(calls.some((sql: string) => sql.includes('COMMIT'))).toBe(true);
    });

    it('calls ROLLBACK and returns 0 on insert error', async () => {
      mockDbRun
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error('constraint fail')); // INSERT fails
      const rows: any[][] = [['INFY', '2024-01-01', 100, 110, 95, 105, 500000]];
      const stored = await freshRepo().bulkInsertDailyOHLCVRows({} as any, rows);
      expect(stored).toBe(0);
      const calls = mockDbRun.mock.calls.map((c: any) => c[1] as string);
      expect(calls.some((sql: string) => sql.includes('ROLLBACK'))).toBe(true);
    });

    it('returns 0 for empty rows array without touching DB', async () => {
      mockDbRun.mockResolvedValue(undefined);
      const stored = await freshRepo().bulkInsertDailyOHLCVRows({} as any, []);
      // BEGIN + COMMIT are still called, but no rows inserted
      expect(stored).toBe(0);
    });
  });

  // ── getMasterTickerNseEqSymbols ──────────────────────────────────────────────

  describe('getMasterTickerNseEqSymbols()', () => {
    it('queries NSE EQ symbols from MasterTickers', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'INFY' }]);
      await freshRepo().getMasterTickerNseEqSymbols({} as any);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('MasterTickers');
      expect(sql).toContain("'NSE'");
      expect(sql).toContain("'EQ'");
    });

    it('returns [] when no symbols', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getMasterTickerNseEqSymbols({} as any)).toEqual([]);
    });
  });

  // ── getMasterTickerNseEqSymbolsStrict ────────────────────────────────────────

  describe('getMasterTickerNseEqSymbolsStrict()', () => {
    it('excludes empty-string symbols', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'RELIANCE' }]);
      await freshRepo().getMasterTickerNseEqSymbolsStrict({} as any);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain("symbol != ''");
    });

    it('returns [] when no qualifying symbols', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getMasterTickerNseEqSymbolsStrict({} as any)).toEqual([]);
    });
  });

  // ── listCustomStrategies ─────────────────────────────────────────────────────

  describe('listCustomStrategies()', () => {
    it('returns active strategies with full fields', async () => {
      const rows = [{ id: '1', name: 'MomentumV1', base_template_id: 'S1_VPA_BASE_BREAKOUT', is_active: 1 }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().listCustomStrategies({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('CustomStrategies');
      expect(sql).toContain('is_active = 1');
    });

    it('returns [] when no active strategies', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().listCustomStrategies({} as any)).toEqual([]);
    });
  });

  // ── listActiveCustomStrategies ───────────────────────────────────────────────

  describe('listActiveCustomStrategies()', () => {
    it('returns id, name, base_template_id, parameters_json only', async () => {
      mockDbAll.mockResolvedValue([{ id: '1', name: 'S', base_template_id: 'S1', parameters_json: '{}' }]);
      await freshRepo().listActiveCustomStrategies({} as any);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('base_template_id');
      expect(sql).not.toContain('backtest_win_rate');
    });

    it('returns [] when no strategies', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().listActiveCustomStrategies({} as any)).toEqual([]);
    });
  });

  // ── getCustomStrategyById ────────────────────────────────────────────────────

  describe('getCustomStrategyById()', () => {
    it('passes id as parameter and returns the row', async () => {
      const row = { id: 'abc', name: 'VPA', is_active: 1 };
      mockDbGet.mockResolvedValue(row);
      const result = await freshRepo().getCustomStrategyById({} as any, 'abc');
      expect(result).toEqual(row);
      const [, , params] = mockDbGet.mock.calls[0];
      expect(params).toContain('abc');
    });

    it('returns null/undefined for unknown id', async () => {
      mockDbGet.mockResolvedValue(undefined);
      const result = await freshRepo().getCustomStrategyById({} as any, 'NOTFOUND');
      expect(result == null).toBe(true);
    });
  });

  // ── insertCustomStrategy ─────────────────────────────────────────────────────

  describe('insertCustomStrategy()', () => {
    it('calls dbRun with the correct params', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertCustomStrategy({} as any, 'uuid-1', 'StratA', 'S1_VPA_BASE_BREAKOUT', 'desc', '{"a":1}');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('INSERT INTO CustomStrategies');
      expect(params).toContain('uuid-1');
      expect(params).toContain('StratA');
      expect(params).toContain('{"a":1}');
    });

    it('uses ON CONFLICT upsert', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertCustomStrategy({} as any, 'u', 'n', 'S1', null, '{}');
      const [, sql] = mockDbRun.mock.calls[0];
      expect(sql).toContain('ON CONFLICT');
    });
  });

  // ── softDeleteCustomStrategy ─────────────────────────────────────────────────

  describe('softDeleteCustomStrategy()', () => {
    it('sets is_active = 0 for the given id', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().softDeleteCustomStrategy({} as any, 'my-id');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('is_active = 0');
      expect(params).toContain('my-id');
    });
  });

  // ── updateCustomStrategyBacktestResults ──────────────────────────────────────

  describe('updateCustomStrategyBacktestResults()', () => {
    it('passes all backtest fields to dbRun', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().updateCustomStrategyBacktestResults({} as any, 65.5, 1.23, 42, 'strat-id');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('backtest_win_rate');
      expect(params).toContain(65.5);
      expect(params).toContain(1.23);
      expect(params).toContain(42);
      expect(params).toContain('strat-id');
    });
  });

  // ── getCustomStrategyTableColumns ────────────────────────────────────────────

  describe('getCustomStrategyTableColumns()', () => {
    it('queries PRAGMA table_info for CustomStrategies', async () => {
      const cols = [{ name: 'id', type: 'TEXT' }, { name: 'name', type: 'TEXT' }];
      mockDbAll.mockResolvedValue(cols);
      const result = await freshRepo().getCustomStrategyTableColumns({} as any);
      expect(result).toEqual(cols);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('PRAGMA table_info(CustomStrategies)');
    });

    it('returns [] when no columns', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getCustomStrategyTableColumns({} as any)).toEqual([]);
    });
  });

  // ── addCustomStrategyColumn ──────────────────────────────────────────────────

  describe('addCustomStrategyColumn()', () => {
    it('calls ALTER TABLE ADD COLUMN with safe name and type', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().addCustomStrategyColumn({} as any, 'my_col', 'REAL');
      const [, sql] = mockDbRun.mock.calls[0];
      expect(sql).toContain('ALTER TABLE CustomStrategies ADD COLUMN my_col REAL');
    });
  });

  // ── dropCustomStrategyColumn ─────────────────────────────────────────────────

  describe('dropCustomStrategyColumn()', () => {
    it('calls ALTER TABLE DROP COLUMN with the column name', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().dropCustomStrategyColumn({} as any, 'my_col');
      const [, sql] = mockDbRun.mock.calls[0];
      expect(sql).toContain('ALTER TABLE CustomStrategies DROP COLUMN my_col');
    });
  });

  // ── getFnoOptionsMetrics ─────────────────────────────────────────────────────

  describe('getFnoOptionsMetrics()', () => {
    it('queries derived_options_metrics for the symbol', async () => {
      const row = { symbol: 'NIFTY', as_of_date: '2024-01-15' };
      mockDbGet.mockResolvedValue(row);
      const result = await freshRepo().getFnoOptionsMetrics({} as any, 'NIFTY');
      expect(result).toEqual(row);
      const [, sql, params] = mockDbGet.mock.calls[0];
      expect(sql).toContain('derived_options_metrics');
      expect(params).toContain('NIFTY');
    });

    it('returns null when no row', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await freshRepo().getFnoOptionsMetrics({} as any, 'UNKNOWN')).toBeUndefined();
    });
  });

  // ── getFnoOptionsChain ───────────────────────────────────────────────────────

  describe('getFnoOptionsChain()', () => {
    it('queries options_chain_snapshot for the symbol', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'BANKNIFTY', strike: 45000, option_type: 'CE' }]);
      const result = await freshRepo().getFnoOptionsChain({} as any, 'BANKNIFTY');
      expect(result).toHaveLength(1);
      const [, sql, params] = mockDbAll.mock.calls[0];
      expect(sql).toContain('options_chain_snapshot');
      expect(params).toContain('BANKNIFTY');
    });

    it('returns [] when no chain data', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getFnoOptionsChain({} as any, 'NIFTY')).toEqual([]);
    });
  });

  // ── getRecentAdverseEvents ───────────────────────────────────────────────────

  describe('getRecentAdverseEvents()', () => {
    it('queries EventIntelligenceLog for adverse events', async () => {
      const rows = [{ event_id: 'e1', symbol: 'ZOMATO', is_adverse: 1 }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getRecentAdverseEvents({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('EventIntelligenceLog');
      expect(sql).toContain('is_adverse = 1');
    });

    it('returns [] when no adverse events', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getRecentAdverseEvents({} as any)).toEqual([]);
    });
  });

  // ── getLatestScanId ──────────────────────────────────────────────────────────

  describe('getLatestScanId()', () => {
    it('returns the scan_id from the latest row', async () => {
      mockDbGet.mockResolvedValue({ scan_id: 'scan_20240115_abc' });
      const result = await freshRepo().getLatestScanId({} as any);
      expect(result).toBe('scan_20240115_abc');
      const [, sql] = mockDbGet.mock.calls[0];
      expect(sql).toContain('strategy_scan_metadata');
    });

    it('returns null when no scans exist', async () => {
      mockDbGet.mockResolvedValue(undefined);
      const result = await freshRepo().getLatestScanId({} as any);
      expect(result).toBeNull();
    });
  });
});
