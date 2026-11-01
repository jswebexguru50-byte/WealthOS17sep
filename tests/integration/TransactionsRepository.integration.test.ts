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

import { TransactionsRepository } from '../../src/server/services/TransactionsRepository.js';

const db: any = {};

beforeAll(async () => {
  testDb = new sqlite3.Database(':memory:');

  const tables = [
    `CREATE TABLE IF NOT EXISTS Transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT, portfolio TEXT, type TEXT, isin TEXT, symbol TEXT,
      quantity REAL, price REAL, gross_amount REAL, brokerage REAL, net_amount REAL,
      notes TEXT, is_cash_flow INTEGER, broker_name TEXT, account_number TEXT, folio TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS MasterTickers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isin TEXT UNIQUE, symbol TEXT, name TEXT, exchange TEXT, sector TEXT,
      last_price REAL, fmv_31_jan_2018 REAL, manual_ltp_date TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS CorporateActions (id INTEGER PRIMARY KEY, symbol TEXT, record_date TEXT, action_type TEXT)`,
    `CREATE TABLE IF NOT EXISTS Holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio TEXT, symbol TEXT, isin TEXT, folio TEXT,
      quantity REAL, current_value REAL, unrealized_pnl REAL, unrealized_pct REAL,
      total_cost REAL, ltp REAL, last_update TEXT, data_source TEXT
    )`,
  ];
  for (const sql of tables) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }

  const inserts = [
    "INSERT INTO MasterTickers (isin, symbol, name, exchange, sector) VALUES ('INE009A01021', 'INFY', 'Infosys', 'NSE', 'IT')",
    "INSERT INTO MasterTickers (isin, symbol, name, exchange, sector) VALUES ('CUSTOM_MF001', 'HDFC_MF', 'HDFC Mutual Fund', 'MF', 'MF')",
    "INSERT INTO Holdings (portfolio, symbol, isin, quantity, current_value) VALUES ('Alpha', 'INFY', 'INE009A01021', 100, 150000)",
  ];
  for (const sql of inserts) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }
});

afterAll(() => { testDb.close(); });

describe('TransactionsRepository (integration)', () => {
  const repo = () => { (TransactionsRepository as any).instance = undefined; return TransactionsRepository.getInstance(); };

  it('insertTransaction — inserts and returns lastID', async () => {
    const result = await repo().insertTransaction(db, {
      date: '2026-01-01', portfolio: 'Alpha', type: 'BUY', isin: 'INE009A01021',
      symbol: 'INFY', quantity: 10, price: 1500, gross_amount: 15000, brokerage: 50,
      net_amount: 15050, notes: '', isCashFlow: 0, broker_name: 'Zerodha', account_number: '', folio: '',
    });
    expect((result as any).lastID).toBeGreaterThan(0);
  });

  it('countTransactions — counts rows', async () => {
    const result: any = await repo().countTransactions(db, 'FROM Transactions WHERE 1=1', []);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it('getTransactions — returns paginated rows', async () => {
    const rows = await repo().getTransactions(db, 'SELECT *', 'FROM Transactions WHERE 1=1', 'date DESC', 50, 0, []);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('findTickerBySymbolOrIsin — finds by symbol', async () => {
    const result: any = await repo().findTickerBySymbolOrIsin(db, 'INFY', '');
    expect(result?.symbol).toBe('INFY');
  });

  it('findIsinBySymbol — excludes CUSTOM_ prefix tickers', async () => {
    const result = await repo().findIsinBySymbol(db, 'HDFC_MF');
    expect(result).toBeUndefined();
  });

  it('findIsinBySymbol — returns real ISIN for valid symbol', async () => {
    const result: any = await repo().findIsinBySymbol(db, 'INFY');
    expect(result?.isin).toBe('INE009A01021');
  });

  it('getAllTransactions — returns rows ordered by date', async () => {
    const rows = await repo().getAllTransactions(db);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('getAllMasterTickers — returns all tickers', async () => {
    const rows = await repo().getAllMasterTickers(db);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('getHoldingsBySymbolOrIsin — returns Alpha holdings for INFY', async () => {
    const rows = await repo().getHoldingsBySymbolOrIsin(db, 'INFY', 'INE009A01021');
    expect(rows.some((r: any) => r.portfolio === 'Alpha')).toBe(true);
  });

  it('updateTransaction — updates fields', async () => {
    const rows = await repo().getTransactions(db, 'SELECT id', 'FROM Transactions WHERE 1=1', 'date DESC', 1, 0, []);
    const id = (rows[0] as any).id;
    await repo().updateTransaction(db, String(id), {
      date: '2026-02-01', portfolio: 'Alpha', type: 'SELL', isin: 'INE009A01021',
      symbol: 'INFY', quantity: 5, price: 1600, gross_amount: 8000, brokerage: 20, net_amount: 7980, notes: 'partial', isCashFlow: 0,
    });
    const updated: any = await dbGetImpl(db, 'SELECT * FROM Transactions WHERE id = ?', [id]);
    expect(updated.type).toBe('SELL');
  });

  it('deleteTransaction — removes row', async () => {
    const result = await repo().insertTransaction(db, {
      date: '2026-03-01', portfolio: 'Beta', type: 'BUY', isin: 'INE467B01029',
      symbol: 'TCS', quantity: 5, price: 3500, gross_amount: 17500, brokerage: 50,
      net_amount: 17550, notes: '', isCashFlow: 0, broker_name: '', account_number: '', folio: '',
    });
    const newId = (result as any).lastID;
    await repo().deleteTransaction(db, String(newId));
    const found = await dbGetImpl(db, 'SELECT id FROM Transactions WHERE id = ?', [newId]);
    expect(found).toBeUndefined();
  });
});
