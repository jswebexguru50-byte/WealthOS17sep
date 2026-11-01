/**
 * Integration tests for StrategiesRepository
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

function dbGetImpl<T>(db: any, sql: string, params?: any[]): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    testDb.get(sql, params ?? [], (err: Error | null, row: T) => {
      if (err) reject(err); else resolve(row);
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
  dbGet: dbGetImpl,
  dbRun: dbRunImpl,
}));

import { StrategiesRepository } from '../../src/server/services/StrategiesRepository.js';

async function createSchema() {
  await run(testDb, `CREATE TABLE IF NOT EXISTS CustomStrategies (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    short_name       TEXT,
    description      TEXT,
    category         TEXT,
    is_preset        INTEGER DEFAULT 0,
    preset_order     INTEGER,
    color_accent     TEXT,
    is_active        INTEGER DEFAULT 1,
    parameters_json  TEXT DEFAULT '{}',
    base_template_id TEXT,
    last_backtest_at TEXT,
    backtest_win_rate REAL,
    backtest_sharpe  REAL,
    backtest_total_signals INTEGER,
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS strategy_run_results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT,
    result_json TEXT
  )`);
}

describe('StrategiesRepository — integration (real in-memory SQLite)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
    await createSchema();
  });

  afterAll(() => { testDb.close(); });

  beforeEach(async () => {
    (StrategiesRepository as any).instance = undefined;
    await run(testDb, 'DELETE FROM CustomStrategies');
    await run(testDb, 'DELETE FROM strategy_run_results');
  });

  it('listAll returns rows ordered by is_preset DESC, preset_order ASC', async () => {
    await run(testDb, `INSERT INTO CustomStrategies (id, name, is_preset, preset_order) VALUES ('p1','Preset S1',1,1)`);
    await run(testDb, `INSERT INTO CustomStrategies (id, name, is_preset, preset_order) VALUES ('p2','Preset S2',1,2)`);
    await run(testDb, `INSERT INTO CustomStrategies (id, name, is_preset, preset_order) VALUES ('c1','Custom',0,NULL)`);

    const repo = StrategiesRepository.getInstance();
    const rows = await repo.listAll(testDb as any);
    expect(rows[0].id).toBe('p1');
    expect(rows[1].id).toBe('p2');
    expect(rows[2].id).toBe('c1');
  });

  it('findById returns the correct row', async () => {
    await run(testDb, `INSERT INTO CustomStrategies (id, name) VALUES ('abc123', 'Momentum')`);
    const repo = StrategiesRepository.getInstance();
    const row = await repo.findById(testDb as any, 'abc123');
    expect(row).not.toBeNull();
    expect(row.name).toBe('Momentum');
  });

  it('findById returns undefined for missing id', async () => {
    const repo = StrategiesRepository.getInstance();
    expect(await repo.findById(testDb as any, 'no-such-id')).toBeUndefined();
  });

  it('findByName returns row when name exists', async () => {
    await run(testDb, `INSERT INTO CustomStrategies (id, name) VALUES ('s1','VPA Strategy')`);
    const repo = StrategiesRepository.getInstance();
    const row = await repo.findByName(testDb as any, 'VPA Strategy');
    expect(row?.id).toBe('s1');
  });

  it('findByNameExcluding excludes the given id', async () => {
    await run(testDb, `INSERT INTO CustomStrategies (id, name) VALUES ('s1','VPA'),('s2','VPA')`);
    const repo = StrategiesRepository.getInstance();
    const row = await repo.findByNameExcluding(testDb as any, 'VPA', 's1');
    expect(row?.id).toBe('s2');
  });

  it('insert adds a new non-preset active strategy', async () => {
    const repo = StrategiesRepository.getInstance();
    await repo.insert(testDb as any, 'new1', 'My Strategy', 'Desc', 'MOMENTUM', '{"k":1}', 'tmpl1', '2024-01-01');
    const row = await repo.findById(testDb as any, 'new1');
    expect(row.name).toBe('My Strategy');
    expect(row.is_active).toBe(1);
    expect(row.is_preset).toBe(0);
  });

  it('update modifies name, description, category, parameters_json', async () => {
    await run(testDb, `INSERT INTO CustomStrategies (id, name, description) VALUES ('u1','Old Name','Old Desc')`);
    const repo = StrategiesRepository.getInstance();
    await repo.update(testDb as any, 'u1', 'New Name', 'New Desc', 'SMC', '{"x":2}', '2024-06-01');
    const row = await repo.findById(testDb as any, 'u1');
    expect(row.name).toBe('New Name');
    expect(row.description).toBe('New Desc');
    expect(row.parameters_json).toBe('{"x":2}');
  });

  it('insertClone creates a new non-preset row with color_accent', async () => {
    const repo = StrategiesRepository.getInstance();
    await repo.insertClone(testDb as any, 'clone1', 'VPA Copy', 'VPA2', 'Clone Desc', 'VPA', '{}', 'base1', '#00FF00', '2024-06-01');
    const row = await repo.findById(testDb as any, 'clone1');
    expect(row.short_name).toBe('VPA2');
    expect(row.color_accent).toBe('#00FF00');
    expect(row.is_preset).toBe(0);
  });

  it('delete removes the strategy', async () => {
    await run(testDb, `INSERT INTO CustomStrategies (id, name) VALUES ('del1','To Delete')`);
    const repo = StrategiesRepository.getInstance();
    await repo.delete(testDb as any, 'del1');
    expect(await repo.findById(testDb as any, 'del1')).toBeUndefined();
  });

  it('deleteRunResults removes entries for strategy_id', async () => {
    await run(testDb, `INSERT INTO strategy_run_results (strategy_id, result_json) VALUES ('s1','{}'),('s1','{}')`);
    const repo = StrategiesRepository.getInstance();
    await repo.deleteRunResults(testDb as any, 's1');
    const rows = await dbAllImpl(null, `SELECT * FROM strategy_run_results WHERE strategy_id = 's1'`);
    expect(rows).toHaveLength(0);
  });

  it('findByIds returns only active strategies matching ids', async () => {
    await run(testDb, `INSERT INTO CustomStrategies (id, name, is_active) VALUES ('a1','Active',1),('a2','Inactive',0),('a3','Other Active',1)`);
    const repo = StrategiesRepository.getInstance();
    const rows = await repo.findByIds(testDb as any, ['a1', 'a2', 'a3']);
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.id).sort()).toEqual(['a1', 'a3']);
  });
});
