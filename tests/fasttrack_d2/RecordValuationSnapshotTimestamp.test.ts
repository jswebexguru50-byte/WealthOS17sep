import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getDB, closeDB, initializeDatabase, recordValuationSnapshot } from '../../src/server/database';
import { dbRun, dbGet, dbAll } from '../../src/server/database';

const TEST_DB_PATH = path.join(__dirname, 'timestamp_test.sqlite');

describe('Delivery 2.x P5-E: recordValuationSnapshot Timestamp Semantics', () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    process.env.DB_PATH = TEST_DB_PATH;
    await initializeDatabase(getDB());
  });

  afterAll(async () => {
    await closeDB();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('persists explicit observation timestamp when provided', async () => {
    const explicitTime = '2024-05-01';
    await recordValuationSnapshot(getDB(), 'PORTFOLIO_A', 1000, 1100, 100, null, explicitTime);
    
    const db = getDB();
    const row = await dbGet(db, "SELECT * FROM PortfolioHistory WHERE portfolio = 'PORTFOLIO_A' AND date = ?", [explicitTime]);
    expect(row).toBeDefined();
    expect(row.date).toBe(explicitTime);
  });

  it('rejects valuation snapshots lacking an explicit observation timestamp', async () => {
    let errorCaught = false;
    try {
      await recordValuationSnapshot(getDB(), 'PORTFOLIO_B', 1000, 1100, 100, null, undefined);
      
      const db = getDB();
      const rows = await dbAll(db, "SELECT * FROM PortfolioHistory WHERE portfolio = 'PORTFOLIO_B'");
      if (rows.length > 0) {
         throw new Error('Defect: Fabricated observation timestamp');
      }
    } catch (e: any) {
      if (e.message.includes('Defect')) throw e; // Pass up the defect
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
  });
});
