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

import { CommandCenterRepository } from '../../src/server/services/CommandCenterRepository.js';

const db: any = {};

beforeAll(async () => {
  testDb = new sqlite3.Database(':memory:');

  const tables = [
    `CREATE TABLE IF NOT EXISTS PortfolioHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT, date TEXT, xirr REAL
    )`,
    `CREATE TABLE IF NOT EXISTS Transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT, type TEXT,
      net_amount REAL, quantity REAL, price REAL, is_cash_flow INTEGER, is_ca INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS RealizedGains (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT,
      buy_cost REAL, sell_proceeds REAL, realized_pnl REAL, buy_date TEXT, sell_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ValuationSnapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT,
      drift_pct REAL, drift_alert TEXT, trigger_source TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of tables) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }

  // Seed data
  const inserts = [
    "INSERT INTO PortfolioHistory (portfolio, date, xirr) VALUES ('Alpha', '2026-01-01', 0.15)",
    "INSERT INTO PortfolioHistory (portfolio, date, xirr) VALUES ('Alpha', '2026-06-01', 0.18)",
    "INSERT INTO Transactions (portfolio, type, net_amount, quantity, price) VALUES ('cc9', 'BUY', 1000000, 100, 10000)",
    "INSERT INTO RealizedGains (portfolio, buy_cost, sell_proceeds, realized_pnl, buy_date, sell_date) VALUES ('Alpha', 100000, 150000, 50000, '2025-01-01', '2026-01-01')",
    "INSERT INTO ValuationSnapshots (portfolio, drift_pct, drift_alert) VALUES ('Alpha', 5.5, 'DRIFT_HIGH')",
    "INSERT INTO ValuationSnapshots (portfolio, drift_pct, drift_alert) VALUES ('Beta', 2.0, NULL)",
  ];
  for (const sql of inserts) {
    await new Promise<void>((res, rej) => testDb.run(sql, (e) => e ? rej(e) : res()));
  }
});

afterAll(() => { testDb.close(); });

describe('CommandCenterRepository (integration)', () => {
  const repo = () => { (CommandCenterRepository as any).instance = undefined; return CommandCenterRepository.getInstance(); };

  it('getLatestXirrPerPortfolio — returns latest XIRR', async () => {
    const rows = await repo().getLatestXirrPerPortfolio(db);
    const alpha = rows.find((r: any) => r.portfolio === 'Alpha');
    expect(alpha).toBeDefined();
    expect(alpha?.xirr).toBeCloseTo(0.18, 2);
  });

  it('getPmsTransactions — returns cc9 transactions', async () => {
    const rows = await repo().getPmsTransactions(db);
    expect(rows.some((r: any) => r.portfolio === 'cc9')).toBe(true);
  });

  it('getRealizedGainsStats — returns aggregates for Alpha', async () => {
    const rows = await repo().getRealizedGainsStats(db, 'Alpha');
    expect(rows[0].pnl).toBeCloseTo(50000, 0);
  });

  it('getRealizedGainsStats — returns empty for unknown portfolio', async () => {
    const rows = await repo().getRealizedGainsStats(db, 'NOSUCH');
    expect(rows[0].cost).toBeNull();
  });

  it('getRecentDriftAlerts — returns [] for empty array', async () => {
    const rows = await repo().getRecentDriftAlerts(db, []);
    expect(rows).toEqual([]);
  });

  it('getRecentDriftAlerts — returns alerts for Alpha (has drift_alert)', async () => {
    const rows = await repo().getRecentDriftAlerts(db, ['Alpha', 'Beta']);
    expect(rows.some((r: any) => r.portfolio === 'Alpha')).toBe(true);
    expect(rows.every((r: any) => r.drift_alert !== null && r.drift_alert !== '')).toBe(true);
  });

  it('getValuationSnapshotMeta — returns count > 0', async () => {
    const meta: any = await repo().getValuationSnapshotMeta(db);
    expect(meta.count).toBeGreaterThanOrEqual(2);
  });

  it('dismissDriftAlertsForPortfolios — clears drift_alert', async () => {
    await repo().dismissDriftAlertsForPortfolios(db, ['Alpha']);
    const rows = await repo().getRecentDriftAlerts(db, ['Alpha']);
    expect(rows.filter((r: any) => r.portfolio === 'Alpha')).toEqual([]);
  });

  it('dismissAllDriftAlerts — clears all alerts', async () => {
    // Re-insert an alert first
    await new Promise<void>((res, rej) => testDb.run("UPDATE ValuationSnapshots SET drift_alert='DRIFT' WHERE portfolio='Beta'", (e) => e ? rej(e) : res()));
    await repo().dismissAllDriftAlerts(db);
    const rows = await repo().getRecentDriftAlerts(db, ['Alpha', 'Beta']);
    expect(rows).toEqual([]);
  });
});
