import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../../src/server/database';
import { autoFetchMarketData } from '../../src/server/yahooFinance';

describe('DEF-001: ValuationSnapshots Timestamp Semantics & Fail-Closed Guard', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    
    // Explicit minimal schema setup for isolated unit test
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE ValuationSnapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            portfolio TEXT NOT NULL,
            total_value_inr REAL NOT NULL DEFAULT 0,
            equity_value REAL NOT NULL DEFAULT 0,
            cash_value REAL NOT NULL DEFAULT 0,
            mf_value REAL NOT NULL DEFAULT 0,
            aif_value REAL NOT NULL DEFAULT 0,
            unlisted_value REAL NOT NULL DEFAULT 0,
            fx_rate_usd REAL DEFAULT 0,
            trigger_source TEXT NOT NULL,
            drift_pct REAL DEFAULT 0,
            drift_alert TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE Holdings (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            symbol TEXT NOT NULL,
            isin TEXT NOT NULL,
            folio TEXT DEFAULT 'NA',
            quantity REAL NOT NULL DEFAULT 0,
            avg_buy_price REAL NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0,
            native_total_cost REAL NOT NULL DEFAULT 0,
            current_value REAL NOT NULL DEFAULT 0,
            holding_type TEXT NOT NULL,
            price_authority TEXT,
            data_source TEXT,
            last_update TEXT
          )
        `);

        db.run(`
          CREATE TABLE MasterTickers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            isin TEXT,
            exchange TEXT
          )
        `);

        db.run(`
          CREATE TABLE AppConfig (
            key TEXT PRIMARY KEY,
            value TEXT
          )
        `);

        db.run(`
          CREATE TABLE CurrencyRates (
            currency TEXT PRIMARY KEY,
            rate_to_inr REAL NOT NULL
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()));
  });

  it('A. ValuationSnapshots schema enforces NOT NULL with no DEFAULT CURRENT_TIMESTAMP', async () => {
    const tableInfo = await dbAll(db, "PRAGMA table_info(ValuationSnapshots)");
    const timestampCol = tableInfo.find((col: any) => col.name === 'timestamp');

    expect(timestampCol).toBeDefined();
    expect(timestampCol.notnull).toBe(1);
    expect(timestampCol.dflt_value).toBeNull();
  });

  it('B. Persists explicit source observation timestamp accurately', async () => {
    const sourceTs = '2026-09-18T15:30:00+05:30';

    await dbRun(db, `
      INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price, total_cost, current_value, holding_type, last_update)
      VALUES ('TEST_PORTFOLIO', 'RELIANCE', 'INE002A01018', 10, 2500, 25000, 25000, 'EQUITY', '2026-09-20T10:00:00Z')
    `);

    await autoFetchMarketData(db, 'TEST_PORTFOLIO', sourceTs);

    const snapshot = await dbGet(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'TEST_PORTFOLIO'");
    expect(snapshot).toBeDefined();
    expect(snapshot.timestamp).toBe(sourceTs);
  });

  it('C. Rejects manufactured timestamps when source observation timestamp is absent (fails closed)', async () => {
    await dbRun(db, `
      INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price, total_cost, current_value, holding_type, last_update)
      VALUES ('TEST_PORTFOLIO_MISSING', 'TCS', 'INE467B01029', 5, 3600, 18000, 18000, 'EQUITY', '2026-09-20T12:00:00Z')
    `);

    // Call without sourceObservationTimestamp
    await autoFetchMarketData(db, 'TEST_PORTFOLIO_MISSING');

    const snapshots = await dbAll(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'TEST_PORTFOLIO_MISSING'");
    expect(snapshots.length).toBe(0);
  });

  it('D. Does NOT derive observation timestamp from Holdings.last_update', async () => {
    const explicitObsTs = '2026-09-19T09:15:00Z';
    const fakeHoldingsUpdate = '2026-09-20T08:00:00Z';

    await dbRun(db, `
      INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price, total_cost, current_value, holding_type, last_update)
      VALUES ('TEST_PORTFOLIO_DIFF', 'INFY', 'INE009A01021', 20, 1500, 30000, 30000, 'EQUITY', ?)
    `, [fakeHoldingsUpdate]);

    await autoFetchMarketData(db, 'TEST_PORTFOLIO_DIFF', explicitObsTs);

    const snapshot = await dbGet(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'TEST_PORTFOLIO_DIFF'");
    expect(snapshot).toBeDefined();
    expect(snapshot.timestamp).toBe(explicitObsTs);
    expect(snapshot.timestamp).not.toBe(fakeHoldingsUpdate);
  });
});
