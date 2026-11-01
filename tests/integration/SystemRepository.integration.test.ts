/**
 * Integration tests for SystemRepository
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

import { SystemRepository } from '../../src/server/services/SystemRepository.js';

async function createSchema() {
  await run(testDb, `CREATE TABLE IF NOT EXISTS AppChangeLogs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version_tag TEXT,
    summary     TEXT,
    file_count  INTEGER,
    timestamp   TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS SystemLogs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    level     TEXT,
    message   TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS ActionHistory (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    action    TEXT,
    detail    TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

describe('SystemRepository — integration (real in-memory SQLite)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
    await createSchema();
  });

  afterAll(() => { testDb.close(); });

  beforeEach(async () => {
    (SystemRepository as any).instance = undefined;
    await run(testDb, 'DELETE FROM AppChangeLogs');
    await run(testDb, 'DELETE FROM SystemLogs');
    await run(testDb, 'DELETE FROM ActionHistory');
  });

  it('insertChangeLog creates a log entry', async () => {
    const repo = SystemRepository.getInstance();
    await repo.insertChangeLog(testDb as any, 'v2.5.0', 'Added new feature', 12);
    const rows = await dbAllImpl<any>(null, `SELECT * FROM AppChangeLogs`);
    expect(rows).toHaveLength(1);
    expect(rows[0].version_tag).toBe('v2.5.0');
    expect(rows[0].summary).toBe('Added new feature');
    expect(rows[0].file_count).toBe(12);
  });

  it('getChangeLogs returns rows ordered by timestamp DESC', async () => {
    const repo = SystemRepository.getInstance();
    await repo.insertChangeLog(testDb as any, 'v1.0.0', 'First release', 5);
    await run(testDb, `UPDATE AppChangeLogs SET timestamp='2024-01-01' WHERE version_tag='v1.0.0'`);
    await repo.insertChangeLog(testDb as any, 'v2.0.0', 'Second release', 10);
    await run(testDb, `UPDATE AppChangeLogs SET timestamp='2024-06-01' WHERE version_tag='v2.0.0'`);
    const logs = await repo.getChangeLogs(testDb as any);
    expect(logs.length).toBe(2);
    expect(logs[0].version_tag).toBe('v2.0.0');
    expect(logs[1].version_tag).toBe('v1.0.0');
  });

  it('getChangeLogs returns at most 100 rows', async () => {
    const repo = SystemRepository.getInstance();
    for (let i = 0; i < 105; i++) {
      await repo.insertChangeLog(testDb as any, `v${i}`, 'log', 1);
    }
    const logs = await repo.getChangeLogs(testDb as any);
    expect(logs.length).toBeLessThanOrEqual(100);
  });

  it('getSystemLogs returns logs up to the given limit', async () => {
    await run(testDb, `INSERT INTO SystemLogs (level, message) VALUES ('INFO','start')`);
    await run(testDb, `INSERT INTO SystemLogs (level, message) VALUES ('WARN','slow query')`);
    await run(testDb, `INSERT INTO SystemLogs (level, message) VALUES ('ERROR','crash')`);
    const repo = SystemRepository.getInstance();
    const logs = await repo.getSystemLogs(testDb as any, 2);
    expect(logs.length).toBe(2);
  });

  it('getSystemLogs returns empty array when no logs', async () => {
    const repo = SystemRepository.getInstance();
    expect(await repo.getSystemLogs(testDb as any, 10)).toEqual([]);
  });

  it('getActionHistory returns actions ordered by timestamp DESC limited to 200', async () => {
    for (let i = 0; i < 5; i++) {
      await run(testDb, `INSERT INTO ActionHistory (action) VALUES ('SIGNAL')`);
    }
    const repo = SystemRepository.getInstance();
    const history = await repo.getActionHistory(testDb as any);
    expect(history.length).toBe(5);
    expect(history[0].action).toBe('SIGNAL');
  });
});
