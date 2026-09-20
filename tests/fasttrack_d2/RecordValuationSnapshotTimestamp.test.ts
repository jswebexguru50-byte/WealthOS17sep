import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { dbRun, dbGet, dbAll, initializeDatabase } from '../../src/server/database';
import { autoFetchMarketData } from '../../src/server/yahooFinance';

describe('Delivery 2.x P5-E: recordValuationSnapshot Timestamp Semantics', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await initializeDatabase(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()));
  });

  it('persists explicit observation timestamp when provided', async () => {
    const explicitTime = '2024-05-01T15:30:00Z';
    await dbRun(db, `
      INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price, total_cost, current_value, holding_type)
      VALUES ('PORTFOLIO_A', 'INFY', 'INE009A01021', 10, 1500, 15000, 15000, 'EQUITY')
    `);
    await autoFetchMarketData(db, 'PORTFOLIO_A', explicitTime);
    
    const row = await dbGet(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'PORTFOLIO_A'");
    expect(row).toBeDefined();
    expect(row.timestamp).toBe(explicitTime);
  });

  it('rejects valuation snapshots lacking an explicit observation timestamp', async () => {
    await dbRun(db, `
      INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price, total_cost, current_value, holding_type)
      VALUES ('PORTFOLIO_B', 'TCS', 'INE467B01029', 5, 3600, 18000, 18000, 'EQUITY')
    `);
    await autoFetchMarketData(db, 'PORTFOLIO_B', undefined);
    
    const rows = await dbAll(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'PORTFOLIO_B'");
    expect(rows.length).toBe(0);
  });
});
