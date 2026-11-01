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

import { ReconciliationRepository } from '../../src/server/services/ReconciliationRepository.js';

const db: any = {};

beforeAll(async () => {
  testDb = new sqlite3.Database(':memory:');

  const tables = [
    `CREATE TABLE IF NOT EXISTS CurrencyRates (id INTEGER PRIMARY KEY, currency TEXT, rate_to_inr REAL)`,
    `CREATE TABLE IF NOT EXISTS Holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT, symbol TEXT, isin TEXT, quantity REAL
    )`,
    `CREATE TABLE IF NOT EXISTS Transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT, type TEXT, date TEXT,
      symbol TEXT, isin TEXT, quantity REAL, price REAL, gross_amount REAL, brokerage REAL,
      net_amount REAL, notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS DataQualityAuditLedger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, integrity_status TEXT, as_of_quarter TEXT,
      audited_at TEXT DEFAULT CURRENT_TIMESTAMP, field_accuracy_score REAL, sum_total_pct REAL
    )`,
    `CREATE TABLE IF NOT EXISTS DataSyncDriftLedger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, drift_type TEXT, sync_status TEXT, metric_name TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS HistoricalFinancialStatements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, statement_type TEXT, fiscal_year TEXT,
      revenue REAL, period_label TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS HistoricalShareholdingPattern (
      id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, quarter_label TEXT, promoter_pct REAL
    )`,
  ];
  for (const sql of tables) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }

  const inserts = [
    "INSERT INTO CurrencyRates (currency, rate_to_inr) VALUES ('USD', 84.5)",
    "INSERT INTO Holdings (portfolio, symbol, isin, quantity) VALUES ('cc9', 'INFY', 'INE009A01021', 100)",
    "INSERT INTO Holdings (portfolio, symbol, isin, quantity) VALUES ('Alpha', 'TCS', 'INE467B01029', 50)",
    "INSERT INTO Transactions (portfolio, type, date, net_amount, symbol, isin, quantity, price, gross_amount, brokerage) VALUES ('cc9', 'BUY', '2026-06-01', 150000, 'INFY', 'INE009A01021', 10, 15000, 150000, 0)",
    "INSERT INTO DataQualityAuditLedger (symbol, integrity_status, as_of_quarter) VALUES ('INFY', 'PASSED', 'Q3FY26')",
    "INSERT INTO DataQualityAuditLedger (symbol, integrity_status, as_of_quarter) VALUES ('TCS', 'FAILED', 'Q3FY26')",
    "INSERT INTO DataSyncDriftLedger (symbol, drift_type) VALUES ('INFY', 'PRICE')",
    "INSERT INTO HistoricalFinancialStatements (symbol, statement_type, fiscal_year, revenue) VALUES ('INFY', 'ANNUAL_PL', 'FY26', 1000000)",
    "INSERT INTO HistoricalShareholdingPattern (symbol, quarter_label, promoter_pct) VALUES ('INFY', 'Q3FY26', 13.0)",
  ];
  for (const sql of inserts) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }
});

afterAll(() => { testDb.close(); });

describe('ReconciliationRepository (integration)', () => {
  const repo = () => { (ReconciliationRepository as any).instance = undefined; return ReconciliationRepository.getInstance(); };

  it('ensureAuditTable — creates table without error', async () => {
    await expect(repo().ensureAuditTable(db)).resolves.not.toThrow();
  });

  it('getSnapshotCount — returns 0 initially', async () => {
    const result: any = await repo().getSnapshotCount(db);
    expect(result?.c).toBe(0);
  });

  it('insertSnapshot — inserts and count increases', async () => {
    await repo().insertSnapshot(db, {
      statement_date: '2026-01-01', portfolio: 'cc9', statement_filename: 'f.csv',
      baseline_holdings_count: 5, baseline_cost: 500000, baseline_valuation: 750000,
      baseline_cash: 0, currency: 'INR', notes: 'test',
    });
    const result: any = await repo().getSnapshotCount(db);
    expect(result?.c).toBeGreaterThanOrEqual(1);
  });

  it('getUsdRate — returns 84.5', async () => {
    const result: any = await repo().getUsdRate(db);
    expect(result?.rate_to_inr).toBeCloseTo(84.5, 1);
  });

  it('getAllBaselines — returns inserted snapshot', async () => {
    const rows = await repo().getAllBaselines(db);
    expect(rows.some((r: any) => r.portfolio === 'cc9')).toBe(true);
  });

  it('getBaselineForPortfolio — filters by portfolio', async () => {
    const rows = await repo().getBaselineForPortfolio(db, 'cc9');
    expect(rows.every((r: any) => r.portfolio.toLowerCase() === 'cc9')).toBe(true);
  });

  it('getAllHoldings — returns all holdings', async () => {
    const rows = await repo().getAllHoldings(db);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('getHoldingsForPortfolio — returns only cc9 holdings', async () => {
    const rows = await repo().getHoldingsForPortfolio(db, 'cc9');
    expect(rows.every((r: any) => r.portfolio === 'cc9')).toBe(true);
  });

  it('getTransactionsAfterDate — returns transactions after date', async () => {
    const rows = await repo().getTransactionsAfterDate(db, 'cc9', '2026-01-01');
    expect(rows.some((r: any) => r.type === 'BUY')).toBe(true);
  });

  it('getDataQualityLedger — returns all records without filter', async () => {
    const rows = await repo().getDataQualityLedger(db, undefined, 100);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('getDataQualityLedger — filters by status', async () => {
    const rows = await repo().getDataQualityLedger(db, 'PASSED', 100);
    expect(rows.every((r: any) => r.integrity_status === 'PASSED')).toBe(true);
  });

  it('getStockAuditCard — returns card for INFY', async () => {
    const result: any = await repo().getStockAuditCard(db, 'INFY');
    expect(result?.symbol).toBe('INFY');
  });

  it('getDriftRowsForSymbol — returns drift rows for INFY', async () => {
    const rows = await repo().getDriftRowsForSymbol(db, 'INFY');
    expect(rows.some((r: any) => r.symbol === 'INFY')).toBe(true);
  });

  it('getHistoricalFinancials — returns financials for INFY', async () => {
    const rows = await repo().getHistoricalFinancials(db, 'INFY');
    expect(rows.some((r: any) => r.symbol === 'INFY')).toBe(true);
  });

  it('getHistoricalShareholding — returns shareholding for INFY', async () => {
    const rows = await repo().getHistoricalShareholding(db, 'INFY');
    expect(rows.some((r: any) => r.symbol === 'INFY')).toBe(true);
  });

  it('aggregates audit statuses and non-null accuracy scores and groups quarters', async () => {
    await dbRunImpl(db, "UPDATE DataQualityAuditLedger SET field_accuracy_score=90, sum_total_pct=100 WHERE symbol='INFY'");
    await dbRunImpl(db, "INSERT INTO DataQualityAuditLedger (symbol, integrity_status, as_of_quarter, field_accuracy_score, sum_total_pct) VALUES ('WARN', 'WARNING', 'Q2FY26', 70, 98)");
    expect(await repo().getDataQualitySummary(db)).toEqual([{ total_audited: 3, passed_count: 1, warning_count: 1, failed_count: 1, avg_accuracy_score: 80, avg_shareholding_sum: 99 }]);
    expect(await repo().getDataQualityQuarters(db)).toEqual([{ as_of_quarter: 'Q3FY26', count: 2 }, { as_of_quarter: 'Q2FY26', count: 1 }]);
  });

  it('returns an empty list when the optional bank table is absent and rows when available', async () => {
    expect(await repo().getBankFDs(db)).toEqual([]);
    await dbRunImpl(db, 'CREATE TABLE BankAccountsAndFDs (id INTEGER PRIMARY KEY, balance REAL)');
    await dbRunImpl(db, 'INSERT INTO BankAccountsAndFDs VALUES (1, 15000)');
    expect(await repo().getBankFDs(db)).toEqual([{ id: 1, balance: 15000 }]);
  });

});
