/**
 * Integration tests for ImportsRepository
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

import { ImportsRepository } from '../../src/server/services/ImportsRepository.js';

async function createSchema() {
  await run(testDb, `CREATE TABLE IF NOT EXISTS CamsConfigurations (
    pan            TEXT PRIMARY KEY,
    email          TEXT NOT NULL,
    password       TEXT,
    portfolio_name TEXT NOT NULL,
    status         TEXT DEFAULT 'ACTIVE'
  )`);
}

describe('ImportsRepository — integration (real in-memory SQLite)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
    await createSchema();
  });

  afterAll(() => { testDb.close(); });

  beforeEach(async () => {
    (ImportsRepository as any).instance = undefined;
    await run(testDb, 'DELETE FROM CamsConfigurations');
  });

  it('getCamsConfigurations returns empty array when no data', async () => {
    const repo = ImportsRepository.getInstance();
    expect(await repo.getCamsConfigurations(testDb as any)).toEqual([]);
  });

  it('upsertCamsConfiguration inserts a new row', async () => {
    const repo = ImportsRepository.getInstance();
    await repo.upsertCamsConfiguration(testDb as any, 'ABCDE1234F', 'user@test.com', 'pass123', 'FundAlpha');
    const rows = await dbAllImpl<any>(null, `SELECT * FROM CamsConfigurations WHERE pan = 'ABCDE1234F'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('user@test.com');
    expect(rows[0].portfolio_name).toBe('FundAlpha');
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('upsertCamsConfiguration updates existing row on conflict', async () => {
    const repo = ImportsRepository.getInstance();
    await repo.upsertCamsConfiguration(testDb as any, 'ABCDE1234F', 'old@test.com', 'pass1', 'FundA');
    await repo.upsertCamsConfiguration(testDb as any, 'ABCDE1234F', 'new@test.com', 'pass2', 'FundB');
    const rows = await dbAllImpl<any>(null, `SELECT * FROM CamsConfigurations`);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('new@test.com');
    expect(rows[0].portfolio_name).toBe('FundB');
  });

  it('upsertCamsConfiguration preserves existing password when null is passed', async () => {
    const repo = ImportsRepository.getInstance();
    await repo.upsertCamsConfiguration(testDb as any, 'PAN123', 'a@b.com', 'original-pass', 'FundX');
    await repo.upsertCamsConfiguration(testDb as any, 'PAN123', 'a@b.com', null, 'FundX');
    const rows = await dbAllImpl<any>(null, `SELECT * FROM CamsConfigurations WHERE pan = 'PAN123'`);
    expect(rows[0].password).toBe('original-pass');
  });

  it('getCamsConfigurations returns all rows ordered by pan ASC', async () => {
    const repo = ImportsRepository.getInstance();
    await repo.upsertCamsConfiguration(testDb as any, 'ZZZZZ9999Z', 'z@test.com', null, 'FundZ');
    await repo.upsertCamsConfiguration(testDb as any, 'AAAAA1111A', 'a@test.com', null, 'FundA');
    const configs = await repo.getCamsConfigurations(testDb as any);
    expect(configs[0].pan).toBe('AAAAA1111A');
    expect(configs[1].pan).toBe('ZZZZZ9999Z');
  });

  it('deleteCamsConfiguration removes the row by PAN', async () => {
    const repo = ImportsRepository.getInstance();
    await repo.upsertCamsConfiguration(testDb as any, 'DEL123', 'd@test.com', null, 'FundDel');
    await repo.deleteCamsConfiguration(testDb as any, 'DEL123');
    const rows = await dbAllImpl<any>(null, `SELECT * FROM CamsConfigurations WHERE pan = 'DEL123'`);
    expect(rows).toHaveLength(0);
  });

  it('deleteCamsConfiguration is idempotent for missing PAN', async () => {
    const repo = ImportsRepository.getInstance();
    await expect(repo.deleteCamsConfiguration(testDb as any, 'NOSUCHPAN')).resolves.toBeUndefined();
  });
});
