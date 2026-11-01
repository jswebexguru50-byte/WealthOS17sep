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

import { SettingsRepository } from '../../src/server/services/SettingsRepository.js';

const db: any = {};

beforeAll(async () => {
  testDb = new sqlite3.Database(':memory:');

  const tables = [
    `CREATE TABLE IF NOT EXISTS AppConfig (key TEXT PRIMARY KEY, value TEXT)`,
    `CREATE TABLE IF NOT EXISTS MasterTickers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isin TEXT UNIQUE,
      symbol TEXT,
      name TEXT,
      exchange TEXT,
      segment TEXT,
      sector TEXT,
      last_price REAL,
      fmv_31_jan_2018 REAL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS Transactions (id INTEGER PRIMARY KEY, symbol TEXT, isin TEXT)`,
    `CREATE TABLE IF NOT EXISTS Holdings (id INTEGER PRIMARY KEY, symbol TEXT, isin TEXT)`,
    `CREATE TABLE IF NOT EXISTS UserMappings (id INTEGER PRIMARY KEY, raw_name TEXT, canonical TEXT)`,
  ];
  for (const sql of tables) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }

  // Seed data
  await new Promise<void>((res, rej) => testDb.run("INSERT INTO AppConfig (key, value) VALUES ('theme', 'dark')", (e) => e ? rej(e) : res()));
  await new Promise<void>((res, rej) => testDb.run("INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, sector, last_price) VALUES ('INE009A01021', 'INFY', 'Infosys', 'NSE', 'EQ', 'IT', 1500)", (e) => e ? rej(e) : res()));
  await new Promise<void>((res, rej) => testDb.run("INSERT INTO UserMappings (raw_name, canonical) VALUES ('INFOSYS LTD', 'INFY')", (e) => e ? rej(e) : res()));
});

afterAll(() => { testDb.close(); });

describe('SettingsRepository (integration)', () => {
  const repo = () => { (SettingsRepository as any).instance = undefined; return SettingsRepository.getInstance(); };

  it('getAllConfig — returns seeded config', async () => {
    const rows = await repo().getAllConfig(db);
    expect(rows.some((r: any) => r.key === 'theme')).toBe(true);
  });

  it('upsertConfig — inserts new key', async () => {
    await repo().upsertConfig(db, 'lang', 'en');
    const rows = await repo().getAllConfig(db);
    const lang = rows.find((r: any) => r.key === 'lang');
    expect(lang?.value).toBe('en');
  });

  it('upsertConfig — updates existing key', async () => {
    await repo().upsertConfig(db, 'theme', 'light');
    const rows = await repo().getAllConfig(db);
    const theme = rows.find((r: any) => r.key === 'theme');
    expect(theme?.value).toBe('light');
  });

  it('getTickers — returns all tickers without search', async () => {
    const rows = await repo().getTickers(db);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('getTickers — filters with search term', async () => {
    const rows = await repo().getTickers(db, 'INFY');
    expect(rows.some((r: any) => r.symbol === 'INFY')).toBe(true);
  });

  it('getTickers — returns empty for no match', async () => {
    const rows = await repo().getTickers(db, 'ZZZZZZZ');
    expect(rows).toEqual([]);
  });

  it('findTickerById — returns ticker row', async () => {
    const tickers = await repo().getTickers(db, 'INFY');
    const id = tickers[0].id;
    const result: any = await repo().findTickerById(db, id);
    expect(result.symbol).toBe('INFY');
  });

  it('upsertTicker — inserts new ticker', async () => {
    await repo().upsertTicker(db, { isin: 'INE467B01029', symbol: 'TCS', name: 'TCS Ltd', exchange: 'NSE', segment: 'EQ', sector: 'IT', manual_ltp: 3500, fmv_31_jan_2018: 2000 });
    const rows = await repo().getTickers(db, 'TCS');
    expect(rows.some((r: any) => r.symbol === 'TCS')).toBe(true);
  });

  it('deleteTicker — removes ticker', async () => {
    await repo().upsertTicker(db, { isin: 'INE_DEL', symbol: 'DEL', name: 'Del', exchange: 'NSE', segment: 'EQ', sector: '', manual_ltp: null, fmv_31_jan_2018: null });
    const before = await repo().getTickers(db, 'DEL');
    await repo().deleteTicker(db, before[0].id);
    const after = await repo().getTickers(db, 'DEL');
    expect(after).toEqual([]);
  });

  it('getUserMappings — returns seeded mappings', async () => {
    const rows = await repo().getUserMappings(db);
    expect(rows.some((r: any) => r.raw_name === 'INFOSYS LTD')).toBe(true);
  });
});
