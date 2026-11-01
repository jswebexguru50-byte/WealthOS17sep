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
      isin TEXT UNIQUE, symbol TEXT, name TEXT, exchange TEXT, sector TEXT, segment TEXT, manual_ltp REAL,
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

  it('inserts mutual fund tickers idempotently and resolves symbol, name and custom ISIN', async () => {
    await repo().insertMutualFundTicker(db, 'CUSTOM_NEW_MF', 'NEW_MF');
    await repo().insertMutualFundTicker(db, 'CUSTOM_NEW_MF', 'NEW_MF');
    expect(await dbAllImpl(db, "SELECT symbol, segment, exchange FROM MasterTickers WHERE isin='CUSTOM_NEW_MF'")).toEqual([{ symbol: 'NEW_MF', segment: 'MF', exchange: 'MUTUAL_FUND' }]);
    expect(await repo().findTickerBySymbolOrName(db, 'Infosys')).toEqual({ isin: 'INE009A01021', symbol: 'INFY' });
    expect(await repo().findIsinBySymbolStrict(db, 'NEW_MF')).toEqual({ isin: 'CUSTOM_NEW_MF' });
    expect(await repo().findIsinBySymbolStrict(db, 'MISSING')).toBeUndefined();
  });

  it('bulk changes affect only selected transaction IDs, including an empty selection', async () => {
    const first = await dbRunImpl(db, "INSERT INTO Transactions (symbol, notes) VALUES ('BULK_A', 'old')");
    const second = await dbRunImpl(db, "INSERT INTO Transactions (symbol, notes) VALUES ('BULK_B', 'old')");
    await repo().bulkUpdateTransactions(db, ['notes=?'], ['new'], [first.lastID]);
    expect((await dbGetImpl(db, 'SELECT notes FROM Transactions WHERE id=?', [first.lastID])).notes).toBe('new');
    expect((await dbGetImpl(db, 'SELECT notes FROM Transactions WHERE id=?', [second.lastID])).notes).toBe('old');
    await repo().bulkDeleteTransactions(db, []);
    await repo().bulkDeleteTransactions(db, [first.lastID]);
    expect(await dbGetImpl(db, 'SELECT id FROM Transactions WHERE id=?', [first.lastID])).toBeUndefined();
    expect(await dbGetImpl(db, 'SELECT id FROM Transactions WHERE id=?', [second.lastID])).toBeDefined();
  });

  it('orders corporate actions by date and holdings by value', async () => {
    await dbRunImpl(db, "INSERT INTO CorporateActions VALUES (1, 'OLD', '2026-01-01', 'DIVIDEND'), (2, 'NEW', '2026-03-01', 'DIVIDEND')");
    expect((await repo().getAllCorporateActions(db)).map(row => row.symbol)).toEqual(['NEW', 'OLD']);
    await dbRunImpl(db, "INSERT INTO Holdings (portfolio, symbol, current_value) VALUES ('Beta', 'LOW', 10)");
    expect((await repo().getAllHoldings(db)).map(row => row.symbol)).toEqual(['INFY', 'LOW']);
  });

  it('updates ticker metadata and upserts an existing ISIN without duplicating it', async () => {
    const ticker = await dbGetImpl(db, "SELECT id FROM MasterTickers WHERE symbol='INFY'");
    await repo().updateMasterTicker(db, String(ticker.id), { isin: 'INE009A01021', symbol: 'INFY', name: 'Infosys Updated', exchange: 'NSE', sector: 'IT', manual_ltp: 1600, manual_ltp_date: '2026-06-01', fmv_31_jan_2018: 100 });
    expect(await dbGetImpl(db, 'SELECT manual_ltp, manual_ltp_date FROM MasterTickers WHERE id=?', [ticker.id])).toEqual({ manual_ltp: 1600, manual_ltp_date: '2026-06-01' });
    await repo().upsertMasterTickerByIsin(db, { isin: 'INE009A01021', symbol: 'INFY_NEW', name: '', exchange: 'NSE', sector: '', manual_ltp: 1700, fmv_31_jan_2018: 100 });
    expect(await dbAllImpl(db, "SELECT symbol, name, sector, manual_ltp FROM MasterTickers WHERE isin='INE009A01021'")).toEqual([{ symbol: 'INFY_NEW', name: 'Infosys Updated', sector: 'IT', manual_ltp: 1700 }]);
  });

  it('updates only the holding matching portfolio, symbol, ISIN and folio', async () => {
    await dbRunImpl(db, "INSERT INTO Holdings (portfolio, symbol, isin, folio, current_value) VALUES ('Target', 'TEST', 'TEST_ISIN', 'A', 1), ('Target', 'TEST', 'TEST_ISIN', 'B', 2), ('Other', 'TEST', 'TEST_ISIN', 'A', 3)");
    await repo().updateHoldingLtp(db, 12, 120, 20, 20, 'Target', 'TEST_ISIN', 'TEST', 'A');
    expect(await dbAllImpl(db, "SELECT portfolio, folio, current_value FROM Holdings WHERE symbol='TEST' ORDER BY id")).toEqual([
      { portfolio: 'Target', folio: 'A', current_value: 120 }, { portfolio: 'Target', folio: 'B', current_value: 2 }, { portfolio: 'Other', folio: 'A', current_value: 3 },
    ]);
    expect(await dbGetImpl(db, "SELECT ltp, unrealized_pnl, unrealized_pct, data_source FROM Holdings WHERE symbol='TEST' AND portfolio='Target' AND folio='A'")).toEqual({ ltp: 12, unrealized_pnl: 20, unrealized_pct: 20, data_source: 'Manual Entry' });
  });

});
