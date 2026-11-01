/**
 * Integration tests for InfraRepository — real in-memory SQLite3, real SQL.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';

// ── Real async DB helpers ─────────────────────────────────────────────────────

function dbAllImpl<T = any>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

function dbGetImpl<T = any>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T)));
  });
}

function dbRunImpl(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

// ── Mock database module ──────────────────────────────────────────────────────

let testDb: sqlite3.Database;

vi.mock('../../src/server/database.js', () => ({
  getDB: () => testDb,
  dbAll: (db: sqlite3.Database, sql: string, params?: any[]) => dbAllImpl(db, sql, params),
  dbGet: (db: sqlite3.Database, sql: string, params?: any[]) => dbGetImpl(db, sql, params),
  dbRun: (db: sqlite3.Database, sql: string, params?: any[]) => dbRunImpl(db, sql, params),
}));

import { InfraRepository } from '../../src/server/services/InfraRepository.js';

// ── Schema helpers ────────────────────────────────────────────────────────────

async function createSchema(db: sqlite3.Database): Promise<void> {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS data_sources (
      source_id TEXT PRIMARY KEY,
      reliability_tier INTEGER NOT NULL,
      name TEXT,
      is_active INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS CorporateActions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      isin TEXT,
      record_date TEXT NOT NULL,
      action_type TEXT NOT NULL,
      details TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS HistoricalPrices (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      close_price REAL,
      PRIMARY KEY (symbol, date)
    )`,
    `CREATE TABLE IF NOT EXISTS DailyOHLCV (
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      data_source TEXT,
      date TEXT,
      PRIMARY KEY (symbol, trade_date)
    )`,
    `CREATE TABLE IF NOT EXISTS MasterTickers (
      symbol TEXT NOT NULL,
      isin TEXT,
      name TEXT,
      exchange TEXT,
      segment TEXT,
      PRIMARY KEY (symbol, exchange)
    )`,
    `CREATE TABLE IF NOT EXISTS CustomStrategies (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      base_template_id TEXT,
      description TEXT,
      parameters_json TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      last_backtest_at TEXT,
      backtest_win_rate REAL,
      backtest_sharpe REAL,
      backtest_total_signals INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS derived_options_metrics (
      symbol TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      unusual_oi_buildup_strikes TEXT,
      PRIMARY KEY (symbol, as_of_date)
    )`,
    `CREATE TABLE IF NOT EXISTS options_chain_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      expiry TEXT,
      strike REAL,
      option_type TEXT,
      oi REAL,
      oi_change REAL,
      iv REAL,
      volume REAL,
      ltp REAL,
      as_of_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS EventIntelligenceLog (
      event_id TEXT PRIMARY KEY,
      symbol TEXT,
      headline TEXT,
      event_type TEXT,
      materiality_score REAL,
      is_adverse INTEGER DEFAULT 0,
      source_url TEXT,
      published_at TEXT,
      data_source TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS strategy_scan_metadata (
      scan_id TEXT PRIMARY KEY,
      created_at TEXT
    )`,
  ];
  for (const sql of ddl) {
    await dbRunImpl(db, sql);
  }
}

async function clearTable(db: sqlite3.Database, table: string): Promise<void> {
  await dbRunImpl(db, `DELETE FROM ${table}`);
}

function freshRepo(): InfraRepository {
  // @ts-ignore
  InfraRepository.instance = undefined;
  return InfraRepository.getInstance();
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeAll(async () => {
  testDb = new sqlite3.Database(':memory:');
  await createSchema(testDb);
});

afterAll(() => {
  testDb.close();
});

beforeEach(async () => {
  // @ts-ignore
  InfraRepository.instance = undefined;
  // Clear all tables between tests
  const tables = [
    'data_sources', 'CorporateActions', 'HistoricalPrices', 'DailyOHLCV',
    'MasterTickers', 'CustomStrategies', 'derived_options_metrics',
    'options_chain_snapshot', 'EventIntelligenceLog', 'strategy_scan_metadata',
  ];
  for (const t of tables) {
    await clearTable(testDb, t);
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InfraRepository (integration)', () => {

  // ── getDataSources ─────────────────────────────────────────────────────────

  describe('getDataSources()', () => {
    it('returns rows ordered by reliability_tier', async () => {
      await dbRunImpl(testDb, `INSERT INTO data_sources VALUES ('B', 2, 'BSE', 1)`);
      await dbRunImpl(testDb, `INSERT INTO data_sources VALUES ('A', 1, 'NSE', 1)`);
      const rows = await freshRepo().getDataSources(testDb);
      expect(rows[0].source_id).toBe('A');
      expect(rows[1].source_id).toBe('B');
    });

    it('returns [] when table is empty', async () => {
      const rows = await freshRepo().getDataSources(testDb);
      expect(rows).toEqual([]);
    });
  });

  // ── getCorporateActionsAll ─────────────────────────────────────────────────

  describe('getCorporateActionsAll()', () => {
    it('returns actions up to the limit ordered by record_date DESC', async () => {
      await dbRunImpl(testDb, `INSERT INTO CorporateActions (symbol, record_date, action_type) VALUES ('INFY', '2024-01-01', 'DIVIDEND')`);
      await dbRunImpl(testDb, `INSERT INTO CorporateActions (symbol, record_date, action_type) VALUES ('TCS', '2024-06-01', 'BONUS')`);
      const rows = await freshRepo().getCorporateActionsAll(testDb, 5);
      expect(rows).toHaveLength(2);
      expect(rows[0].symbol).toBe('TCS'); // more recent first
    });

    it('respects the limit', async () => {
      for (let i = 0; i < 5; i++) {
        await dbRunImpl(testDb, `INSERT INTO CorporateActions (symbol, record_date, action_type) VALUES ('SYM${i}', '2024-01-0${i + 1}', 'SPLIT')`);
      }
      const rows = await freshRepo().getCorporateActionsAll(testDb, 3);
      expect(rows).toHaveLength(3);
    });
  });

  // ── getHistoricalPricesUniverseCount ───────────────────────────────────────

  describe('getHistoricalPricesUniverseCount()', () => {
    it('returns count of distinct symbols', async () => {
      await dbRunImpl(testDb, `INSERT INTO HistoricalPrices VALUES ('INFY', '2024-01-01', 1500)`);
      await dbRunImpl(testDb, `INSERT INTO HistoricalPrices VALUES ('INFY', '2024-01-02', 1510)`);
      await dbRunImpl(testDb, `INSERT INTO HistoricalPrices VALUES ('TCS', '2024-01-01', 3500)`);
      const count = await freshRepo().getHistoricalPricesUniverseCount(testDb);
      expect(count).toBe(2);
    });

    it('returns 0 when table is empty', async () => {
      expect(await freshRepo().getHistoricalPricesUniverseCount(testDb)).toBe(0);
    });
  });

  // ── getDailyOHLCVSymbols ───────────────────────────────────────────────────

  describe('getDailyOHLCVSymbols()', () => {
    it('returns distinct symbols', async () => {
      await dbRunImpl(testDb, `INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source) VALUES ('WIPRO', '2024-01-01', 400, 410, 395, 405, 1000, 'NSE')`);
      await dbRunImpl(testDb, `INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source) VALUES ('WIPRO', '2024-01-02', 405, 415, 400, 410, 1100, 'NSE')`);
      await dbRunImpl(testDb, `INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source) VALUES ('INFY', '2024-01-01', 1500, 1520, 1490, 1510, 5000, 'NSE')`);
      const rows = await freshRepo().getDailyOHLCVSymbols(testDb);
      expect(rows.map((r: any) => r.symbol)).toEqual(['INFY', 'WIPRO']); // alphabetical
    });

    it('returns [] when table is empty', async () => {
      expect(await freshRepo().getDailyOHLCVSymbols(testDb)).toEqual([]);
    });
  });

  // ── getDailyOHLCVSymbolsForBacktest ───────────────────────────────────────

  describe('getDailyOHLCVSymbolsForBacktest()', () => {
    it('only returns symbols with >= 100 rows', async () => {
      // 99 rows for SMALLCAP
      for (let i = 0; i < 99; i++) {
        await dbRunImpl(testDb, `INSERT OR IGNORE INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source) VALUES ('SMALLCAP', '2023-01-${String(i + 1).padStart(2, '0')}', 1, 1, 1, 1, 1, 'NSE')`);
      }
      // 100 rows for LARGECAP
      for (let i = 0; i < 100; i++) {
        await dbRunImpl(testDb, `INSERT OR IGNORE INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source) VALUES ('LARGECAP', '2023-01-${String(i + 1).padStart(2, '0')}', 1, 1, 1, 1, 1, 'NSE')`);
      }
      const rows = await freshRepo().getDailyOHLCVSymbolsForBacktest(testDb);
      const symbols = rows.map((r: any) => r.symbol);
      expect(symbols).toContain('LARGECAP');
      expect(symbols).not.toContain('SMALLCAP');
    });

    it('returns [] when table is empty', async () => {
      expect(await freshRepo().getDailyOHLCVSymbolsForBacktest(testDb)).toEqual([]);
    });
  });

  // ── getCandlesForSymbol ────────────────────────────────────────────────────

  describe('getCandlesForSymbol()', () => {
    it('returns candles for the given symbol in ASC date order', async () => {
      await dbRunImpl(testDb, `INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source, date) VALUES ('RELIANCE', '2024-01-02', 2900, 2920, 2880, 2910, 8000, 'NSE', '2024-01-02')`);
      await dbRunImpl(testDb, `INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source, date) VALUES ('RELIANCE', '2024-01-01', 2850, 2900, 2840, 2870, 7000, 'NSE', '2024-01-01')`);
      const candles = await freshRepo().getCandlesForSymbol(testDb, 'RELIANCE');
      expect(candles).toHaveLength(2);
      expect(candles[0].date).toBe('2024-01-01');
      expect(candles[1].date).toBe('2024-01-02');
    });

    it('returns [] for unknown symbol', async () => {
      expect(await freshRepo().getCandlesForSymbol(testDb, 'NOTEXIST')).toEqual([]);
    });
  });

  // ── bulkInsertDailyOHLCVRows ───────────────────────────────────────────────

  describe('bulkInsertDailyOHLCVRows()', () => {
    it('inserts rows and returns count', async () => {
      const rows = [
        ['INFY', '2024-01-01', 1500, 1520, 1490, 1510, 5000],
        ['TCS', '2024-01-01', 3500, 3550, 3480, 3520, 2000],
      ];
      const stored = await freshRepo().bulkInsertDailyOHLCVRows(testDb, rows as any[][]);
      expect(stored).toBe(2);
      const all = await dbAllImpl(testDb, 'SELECT * FROM DailyOHLCV');
      expect(all).toHaveLength(2);
    });

    it('skips duplicate rows silently (INSERT OR IGNORE)', async () => {
      const row = [['INFY', '2024-01-01', 1500, 1520, 1490, 1510, 5000]];
      await freshRepo().bulkInsertDailyOHLCVRows(testDb, row as any[][]);
      const stored = await freshRepo().bulkInsertDailyOHLCVRows(testDb, row as any[][]);
      expect(stored).toBe(1); // second call tries 1 row, but OR IGNORE means no error
      const all = await dbAllImpl(testDb, 'SELECT * FROM DailyOHLCV WHERE symbol = ?', ['INFY']);
      expect(all).toHaveLength(1);
    });

    it('returns 0 for empty rows array', async () => {
      const stored = await freshRepo().bulkInsertDailyOHLCVRows(testDb, []);
      expect(stored).toBe(0);
    });
  });

  // ── getMasterTickerNseEqSymbols ────────────────────────────────────────────

  describe('getMasterTickerNseEqSymbols()', () => {
    it('returns NSE EQ symbols', async () => {
      await dbRunImpl(testDb, `INSERT INTO MasterTickers VALUES ('INFY', 'INE009A01021', 'Infosys', 'NSE', 'EQ')`);
      await dbRunImpl(testDb, `INSERT INTO MasterTickers VALUES ('SBIN', 'INE062A01020', 'SBI', 'BSE', 'EQ')`); // wrong exchange
      const rows = await freshRepo().getMasterTickerNseEqSymbols(testDb);
      expect(rows.map((r: any) => r.symbol)).toEqual(['INFY']);
    });

    it('returns [] when no matching tickers', async () => {
      expect(await freshRepo().getMasterTickerNseEqSymbols(testDb)).toEqual([]);
    });
  });

  // ── getMasterTickerNseEqSymbolsStrict ──────────────────────────────────────

  describe('getMasterTickerNseEqSymbolsStrict()', () => {
    it('excludes rows with empty-string symbol', async () => {
      await dbRunImpl(testDb, `INSERT INTO MasterTickers VALUES ('INFY', 'INE009A01021', 'Infosys', 'NSE', 'EQ')`);
      await dbRunImpl(testDb, `INSERT INTO MasterTickers VALUES ('', 'EMPTY', 'EmptySymbol', 'NSE', 'EQ')`);
      const rows = await freshRepo().getMasterTickerNseEqSymbolsStrict(testDb);
      expect(rows.map((r: any) => r.symbol)).toEqual(['INFY']);
    });

    it('returns [] when table is empty', async () => {
      expect(await freshRepo().getMasterTickerNseEqSymbolsStrict(testDb)).toEqual([]);
    });
  });

  // ── listCustomStrategies ───────────────────────────────────────────────────

  describe('listCustomStrategies()', () => {
    it('returns only active strategies', async () => {
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, base_template_id, is_active) VALUES ('1', 'Active', 'S1', 1)`);
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, base_template_id, is_active) VALUES ('2', 'Deleted', 'S1', 0)`);
      const rows = await freshRepo().listCustomStrategies(testDb);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Active');
    });

    it('returns [] when no active strategies', async () => {
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, is_active) VALUES ('1', 'Gone', 0)`);
      expect(await freshRepo().listCustomStrategies(testDb)).toEqual([]);
    });
  });

  // ── listActiveCustomStrategies ─────────────────────────────────────────────

  describe('listActiveCustomStrategies()', () => {
    it('returns the 4-field subset', async () => {
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, base_template_id, parameters_json, is_active) VALUES ('1', 'S1', 'S1_VPA', '{}', 1)`);
      const rows = await freshRepo().listActiveCustomStrategies(testDb);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveProperty('base_template_id');
      expect(rows[0]).toHaveProperty('parameters_json');
    });
  });

  // ── getCustomStrategyById ──────────────────────────────────────────────────

  describe('getCustomStrategyById()', () => {
    it('returns the active strategy by id', async () => {
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, is_active) VALUES ('abc', 'VPA', 1)`);
      const row = await freshRepo().getCustomStrategyById(testDb, 'abc');
      expect(row).toBeDefined();
      expect(row.id).toBe('abc');
    });

    it('returns undefined for soft-deleted strategy', async () => {
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, is_active) VALUES ('del', 'Old', 0)`);
      const row = await freshRepo().getCustomStrategyById(testDb, 'del');
      expect(row).toBeUndefined();
    });
  });

  // ── insertCustomStrategy ───────────────────────────────────────────────────

  describe('insertCustomStrategy()', () => {
    it('inserts a new strategy', async () => {
      await freshRepo().insertCustomStrategy(testDb, 'id1', 'MyStrat', 'S1_VPA', 'desc', '{"k":1}');
      const row = await dbGetImpl(testDb, 'SELECT * FROM CustomStrategies WHERE id = ?', ['id1']);
      expect(row).toBeDefined();
      expect((row as any).name).toBe('MyStrat');
    });

    it('upserts on duplicate name', async () => {
      await freshRepo().insertCustomStrategy(testDb, 'id1', 'MyStrat', 'S1', null, '{"k":1}');
      await freshRepo().insertCustomStrategy(testDb, 'id2', 'MyStrat', 'S2', 'new desc', '{"k":2}');
      const rows = await dbAllImpl(testDb, 'SELECT * FROM CustomStrategies WHERE name = ?', ['MyStrat']);
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).base_template_id).toBe('S2');
    });
  });

  // ── softDeleteCustomStrategy ───────────────────────────────────────────────

  describe('softDeleteCustomStrategy()', () => {
    it('sets is_active = 0', async () => {
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, is_active) VALUES ('del-me', 'ToDelete', 1)`);
      await freshRepo().softDeleteCustomStrategy(testDb, 'del-me');
      const row = await dbGetImpl<any>(testDb, 'SELECT is_active FROM CustomStrategies WHERE id = ?', ['del-me']);
      expect(row?.is_active).toBe(0);
    });
  });

  // ── updateCustomStrategyBacktestResults ───────────────────────────────────

  describe('updateCustomStrategyBacktestResults()', () => {
    it('updates backtest stats', async () => {
      await dbRunImpl(testDb, `INSERT INTO CustomStrategies (id, name, is_active) VALUES ('s1', 'Test', 1)`);
      await freshRepo().updateCustomStrategyBacktestResults(testDb, 72.5, 1.85, 100, 's1');
      const row = await dbGetImpl<any>(testDb, 'SELECT * FROM CustomStrategies WHERE id = ?', ['s1']);
      expect(row?.backtest_win_rate).toBeCloseTo(72.5);
      expect(row?.backtest_sharpe).toBeCloseTo(1.85);
      expect(row?.backtest_total_signals).toBe(100);
    });
  });

  // ── getCustomStrategyTableColumns ─────────────────────────────────────────

  describe('getCustomStrategyTableColumns()', () => {
    it('returns column names for CustomStrategies', async () => {
      const cols = await freshRepo().getCustomStrategyTableColumns(testDb);
      const names = cols.map((c: any) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('name');
      expect(names).toContain('parameters_json');
    });
  });

  // ── addCustomStrategyColumn + dropCustomStrategyColumn ─────────────────────

  describe('addCustomStrategyColumn() + dropCustomStrategyColumn()', () => {
    it('adds and then drops a column', async () => {
      const repo = freshRepo();
      await repo.addCustomStrategyColumn(testDb, 'test_col_xyz', 'TEXT');
      let cols = await repo.getCustomStrategyTableColumns(testDb);
      expect(cols.map((c: any) => c.name)).toContain('test_col_xyz');

      await repo.dropCustomStrategyColumn(testDb, 'test_col_xyz');
      cols = await repo.getCustomStrategyTableColumns(testDb);
      expect(cols.map((c: any) => c.name)).not.toContain('test_col_xyz');
    });
  });

  // ── getFnoOptionsMetrics ───────────────────────────────────────────────────

  describe('getFnoOptionsMetrics()', () => {
    it('returns the most recent row for the symbol', async () => {
      await dbRunImpl(testDb, `INSERT INTO derived_options_metrics VALUES ('NIFTY', '2024-01-10', NULL)`);
      await dbRunImpl(testDb, `INSERT INTO derived_options_metrics VALUES ('NIFTY', '2024-01-15', '45500,46000')`);
      const row = await freshRepo().getFnoOptionsMetrics(testDb, 'NIFTY') as any;
      expect(row.as_of_date).toBe('2024-01-15');
    });

    it('returns undefined for unknown symbol', async () => {
      expect(await freshRepo().getFnoOptionsMetrics(testDb, 'NOTEXIST')).toBeUndefined();
    });
  });

  // ── getFnoOptionsChain ─────────────────────────────────────────────────────

  describe('getFnoOptionsChain()', () => {
    it('returns options chain rows for symbol', async () => {
      await dbRunImpl(testDb, `INSERT INTO options_chain_snapshot (symbol, expiry, strike, option_type, as_of_date) VALUES ('BANKNIFTY', '2024-01-25', 45000, 'CE', '2024-01-15')`);
      await dbRunImpl(testDb, `INSERT INTO options_chain_snapshot (symbol, expiry, strike, option_type, as_of_date) VALUES ('NIFTY', '2024-01-25', 22000, 'CE', '2024-01-15')`);
      const rows = await freshRepo().getFnoOptionsChain(testDb, 'BANKNIFTY');
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).strike).toBe(45000);
    });

    it('returns [] when no data for symbol', async () => {
      expect(await freshRepo().getFnoOptionsChain(testDb, 'UNKNOWN')).toEqual([]);
    });
  });

  // ── getRecentAdverseEvents ─────────────────────────────────────────────────

  describe('getRecentAdverseEvents()', () => {
    it('returns only adverse events', async () => {
      await dbRunImpl(testDb, `INSERT INTO EventIntelligenceLog VALUES ('e1', 'ZOMATO', 'Bad news', 'FRAUD', 0.9, 1, NULL, NULL, 'NSE', '2024-01-15 10:00')`);
      await dbRunImpl(testDb, `INSERT INTO EventIntelligenceLog VALUES ('e2', 'TCS', 'Good news', 'QUARTERLY', 0.1, 0, NULL, NULL, 'NSE', '2024-01-15 11:00')`);
      const rows = await freshRepo().getRecentAdverseEvents(testDb);
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).event_id).toBe('e1');
    });

    it('returns [] when no adverse events', async () => {
      await dbRunImpl(testDb, `INSERT INTO EventIntelligenceLog VALUES ('e3', 'TCS', 'Fine', 'QUARTERLY', 0.1, 0, NULL, NULL, 'NSE', '2024-01-15')`);
      expect(await freshRepo().getRecentAdverseEvents(testDb)).toEqual([]);
    });
  });

  // ── getLatestScanId ────────────────────────────────────────────────────────

  describe('getLatestScanId()', () => {
    it('returns the most recent scan_id', async () => {
      await dbRunImpl(testDb, `INSERT INTO strategy_scan_metadata VALUES ('scan_001', '2024-01-10 08:00')`);
      await dbRunImpl(testDb, `INSERT INTO strategy_scan_metadata VALUES ('scan_002', '2024-01-15 09:00')`);
      const id = await freshRepo().getLatestScanId(testDb);
      expect(id).toBe('scan_002');
    });

    it('returns null when table is empty', async () => {
      expect(await freshRepo().getLatestScanId(testDb)).toBeNull();
    });
  });
});
