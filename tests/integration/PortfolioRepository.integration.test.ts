import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';

let testDb: sqlite3.Database;

function dbAllImpl(db: any, sql: string, params?: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    testDb.all(sql, params ?? [], (err, rows) => { if (err) reject(err); else resolve(rows as any[]); });
  });
}
function dbGetImpl(db: any, sql: string, params?: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    testDb.get(sql, params ?? [], (err, row) => { if (err) reject(err); else resolve(row); });
  });
}
function dbRunImpl(db: any, sql: string, params?: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    testDb.run(sql, params ?? [], function(this: any, err: any) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
  });
}

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: dbAllImpl,
  dbGet: dbGetImpl,
  dbRun: dbRunImpl,
}));

import { PortfolioRepository } from '../../src/server/services/PortfolioRepository.js';

const db: any = {};

beforeAll(async () => {
  testDb = new sqlite3.Database(':memory:');
  await new Promise<void>((res, rej) => testDb.run('PRAGMA journal_mode=WAL', (e) => e ? rej(e) : res()));

  const tables = [
    `CREATE TABLE IF NOT EXISTS Portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      type TEXT DEFAULT 'EQUITY',
      status TEXT DEFAULT 'ACTIVE',
      base_currency TEXT DEFAULT 'INR',
      member_id INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS MemberPortfolioPermissions (
      member_id INTEGER,
      portfolio TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS Transactions (id INTEGER PRIMARY KEY, portfolio TEXT, net_amount REAL, date TEXT)`,
    `CREATE TABLE IF NOT EXISTS Holdings (id INTEGER PRIMARY KEY, portfolio TEXT, current_value REAL, quantity REAL)`,
    `CREATE TABLE IF NOT EXISTS ZerodhaHoldings (id INTEGER PRIMARY KEY, portfolio TEXT)`,
    `CREATE TABLE IF NOT EXISTS CamsConfigurations (id INTEGER PRIMARY KEY, portfolio_name TEXT)`,
  ];
  for (const sql of tables) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }

  // Seed data
  await new Promise<void>((res, rej) => testDb.run("INSERT INTO Portfolios (name, type, status, member_id) VALUES ('Alpha', 'EQUITY', 'ACTIVE', 1)", (e) => e ? rej(e) : res()));
  await new Promise<void>((res, rej) => testDb.run("INSERT INTO Portfolios (name, type, status, member_id) VALUES ('Beta', 'PMS', 'ACTIVE', 2)", (e) => e ? rej(e) : res()));
  await new Promise<void>((res, rej) => testDb.run("INSERT INTO MemberPortfolioPermissions (member_id, portfolio) VALUES (1, 'Alpha')", (e) => e ? rej(e) : res()));
});

afterAll(() => { testDb.close(); });

describe('PortfolioRepository (integration)', () => {
  const repo = () => { (PortfolioRepository as any).instance = undefined; return PortfolioRepository.getInstance(); };

  it('findByName — finds existing portfolio', async () => {
    const result: any = await repo().findByName(db, 'Alpha');
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });

  it('findByName — returns undefined for missing portfolio', async () => {
    expect(await repo().findByName(db, 'NOSUCH')).toBeUndefined();
  });

  it('getAllDetailed — returns all portfolios', async () => {
    const rows = await repo().getAllDetailed(db);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('create — inserts new portfolio', async () => {
    await repo().create(db, 'Gamma', 'EQUITY', 'USD');
    const found: any = await repo().findByName(db, 'Gamma');
    expect(found).toBeDefined();
  });

  it('insertWithType — inserts portfolio with type', async () => {
    await repo().insertWithType(db, 'Delta', 'MF');
    const found: any = await repo().findByName(db, 'Delta');
    expect(found).toBeDefined();
  });

  it('updateType — changes portfolio type', async () => {
    await repo().updateType(db, 'Gamma', 'PMS');
    const rows: any[] = await repo().getAllDetailed(db);
    const gamma = rows.find((r: any) => r.name === 'Gamma');
    expect(gamma?.type).toBe('PMS');
  });

  it('renamePortfolio — renames a portfolio', async () => {
    await repo().renamePortfolio(db, 'GammaNew', 'Gamma');
    expect(await repo().findByName(db, 'GammaNew')).toBeDefined();
    expect(await repo().findByName(db, 'Gamma')).toBeUndefined();
  });

  it('archive — sets status to ARCHIVED', async () => {
    await repo().archive(db, 'Delta');
    const rows: any[] = await repo().getAllDetailed(db);
    const delta = rows.find((r: any) => r.name === 'Delta');
    expect(delta?.status).toBe('ARCHIVED');
  });

  it('beginTransaction / commit — round-trips successfully', async () => {
    await repo().beginTransaction(db);
    await repo().commit(db);
  });

  it('rollback — does not throw', async () => {
    await expect(repo().rollback(db)).resolves.not.toThrow();
  });
});
