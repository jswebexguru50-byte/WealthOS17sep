/**
 * Integration tests for QuantRepository
 * Uses a real in-memory SQLite3 database — no mocks for the DB layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import sqlite3 from 'sqlite3';

let testDb: sqlite3.Database;

function createTestDb(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) reject(err); else resolve(db);
    });
  });
}

function run(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(); });
  });
}

function dbAllImpl<T>(db: any, sql: string, params?: any[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    testDb.all(sql, params ?? [], (err: Error | null, rows: T[]) => {
      if (err) reject(err); else resolve(rows ?? []);
    });
  });
}

function dbRunImpl(db: any, sql: string, params?: any[]): Promise<void> {
  return new Promise((resolve, reject) => {
    testDb.run(sql, params ?? [], function (err: Error | null) {
      if (err) reject(err); else resolve();
    });
  });
}

vi.mock('../../src/server/database.js', () => ({
  getDB: () => testDb,
  dbAll: dbAllImpl,
  dbGet: vi.fn(),
  dbRun: dbRunImpl,
}));

import { QuantRepository } from '../../src/server/services/QuantRepository.js';

async function createSchema() {
  await run(testDb, `CREATE TABLE IF NOT EXISTS paper_trades (
    id           TEXT PRIMARY KEY,
    symbol       TEXT,
    company_name TEXT,
    strategy_ids TEXT,
    gate_snapshot TEXT,
    entry_date   TEXT,
    entry_price  REAL,
    stop_loss    REAL,
    target_1     REAL,
    target_2     REAL,
    position_size REAL,
    position_inr REAL,
    status       TEXT DEFAULT 'OPEN',
    exit_date    TEXT,
    exit_price   REAL,
    pnl_pct      REAL,
    pnl_inr      REAL,
    holding_days INTEGER,
    max_gain_pct REAL,
    max_loss_pct REAL,
    verdict      TEXT,
    notes        TEXT,
    created_at   TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS funnel_presets (
    id               TEXT PRIMARY KEY,
    name             TEXT,
    strategy_ids_json TEXT,
    gate_config_json TEXT,
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS DailyOHLCV (
    symbol     TEXT,
    trade_date TEXT,
    open       REAL,
    high       REAL,
    low        REAL,
    close      REAL,
    volume     INTEGER,
    PRIMARY KEY (symbol, trade_date)
  )`);
}

describe('QuantRepository — integration (real in-memory SQLite)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
    await createSchema();
  });

  afterAll(() => { testDb.close(); });

  beforeEach(async () => {
    (QuantRepository as any).instance = undefined;
    await run(testDb, 'DELETE FROM paper_trades');
    await run(testDb, 'DELETE FROM funnel_presets');
    await run(testDb, 'DELETE FROM DailyOHLCV');
  });

  it('insertPaperTrade creates a row with OPEN status', async () => {
    const repo = QuantRepository.getInstance();
    await repo.insertPaperTrade(
      testDb as any, 'pt_001', 'INFY', 'Infosys Ltd', '["s1"]', '{}',
      '2024-06-01T00:00:00Z', 1500, 1450, 1620, 1700, 100, 150000, 'entry note'
    );
    const rows = await dbAllImpl<any>(null, `SELECT * FROM paper_trades WHERE id = 'pt_001'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('OPEN');
    expect(rows[0].symbol).toBe('INFY');
    expect(rows[0].entry_price).toBe(1500);
  });

  it('listPaperTrades returns all trades', async () => {
    const repo = QuantRepository.getInstance();
    await repo.insertPaperTrade(testDb as any, 'pt_a', 'INFY', 'Infosys', null, null, '2024-01-01', 1500, 1450, 1600, 1700, 10, 15000, null);
    await repo.insertPaperTrade(testDb as any, 'pt_b', 'TCS', 'TCS Ltd', null, null, '2024-01-02', 3500, 3400, 3700, 3900, 5, 17500, null);
    const trades = await repo.listPaperTrades(testDb as any);
    expect(trades.length).toBe(2);
  });

  it('updatePaperTrade changes status, exit fields, and pnl', async () => {
    const repo = QuantRepository.getInstance();
    await repo.insertPaperTrade(testDb as any, 'pt_upd', 'WIPRO', 'Wipro', null, null, '2024-01-01', 450, 430, 490, 510, 200, 90000, null);
    await repo.updatePaperTrade(testDb as any, 'pt_upd', 'CLOSED', '2024-02-01', 485, 7.8, 7000, 31, 10, -3, 'WIN', 'nice exit');
    const rows = await dbAllImpl<any>(null, `SELECT * FROM paper_trades WHERE id = 'pt_upd'`);
    expect(rows[0].status).toBe('CLOSED');
    expect(rows[0].exit_price).toBe(485);
    expect(rows[0].pnl_pct).toBeCloseTo(7.8);
    expect(rows[0].verdict).toBe('WIN');
  });

  it('insertFunnelPreset creates a row and listFunnelPresets returns it', async () => {
    const repo = QuantRepository.getInstance();
    await repo.insertFunnelPreset(testDb as any, 'fp_001', 'Growth Preset', '["s1","s2"]', '{"minScore":70}');
    const presets = await repo.listFunnelPresets(testDb as any);
    expect(presets.length).toBe(1);
    expect(presets[0].name).toBe('Growth Preset');
    expect(presets[0].strategy_ids_json).toBe('["s1","s2"]');
  });

  it('getDailyOhlcv returns candles for symbol ordered by trade_date ASC', async () => {
    const repo = QuantRepository.getInstance();
    await run(testDb, `INSERT INTO DailyOHLCV VALUES ('INFY','2024-01-03',1490,1510,1485,1505,1000000)`);
    await run(testDb, `INSERT INTO DailyOHLCV VALUES ('INFY','2024-01-02',1480,1500,1475,1490,900000)`);
    await run(testDb, `INSERT INTO DailyOHLCV VALUES ('TCS', '2024-01-01',3490,3510,3480,3500,500000)`);
    const candles = await repo.getDailyOhlcv(testDb as any, 'INFY');
    expect(candles.length).toBe(2);
    expect(candles[0].date).toBe('2024-01-02');
    expect(candles[1].date).toBe('2024-01-03');
  });

  it('getDistinctDailyOhlcvSymbols returns unique symbols ordered ASC', async () => {
    await run(testDb, `INSERT INTO DailyOHLCV VALUES ('WIPRO','2024-01-01',450,460,445,455,500000)`);
    await run(testDb, `INSERT INTO DailyOHLCV VALUES ('INFY','2024-01-01',1490,1510,1485,1505,1000000)`);
    await run(testDb, `INSERT INTO DailyOHLCV VALUES ('INFY','2024-01-02',1480,1500,1475,1490,900000)`);
    const repo = QuantRepository.getInstance();
    const symbols = await repo.getDistinctDailyOhlcvSymbols(testDb as any);
    expect(symbols.map((r: any) => r.symbol)).toEqual(['INFY', 'WIPRO']);
  });
});
