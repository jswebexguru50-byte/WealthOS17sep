import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { dbRun, dbGet, dbAll, initializeDatabase, recordValuationSnapshot, runMigrations } from '../../src/server/database';

describe('Delivery 2.x P5-E: recordValuationSnapshot Timestamp Semantics', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await initializeDatabase(db);
    await runMigrations(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()));
  });

  it('persists explicit observation timestamp when provided', async () => {
    const explicitTime = '2024-05-01T15:30:00Z';
    
    await recordValuationSnapshot(db, {
      portfolio: 'PORTFOLIO_A',
      total_value_inr: 15000,
      equity_value: 15000,
      cash_value: 0,
      mf_value: 0,
      aif_value: 0,
      unlisted_value: 0,
      fx_rate_usd: 83.0,
      trigger_source: 'MARKET_SYNC',
      drift_pct: 0,
      drift_alert: null,
      observationTimestamp: explicitTime
    });
    
    const row = await dbGet(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'PORTFOLIO_A'");
    expect(row).toBeDefined();
    expect(row.timestamp).toBe(explicitTime);
    expect(row.observationTimestamp).toBe(explicitTime);
    expect(row.observationDate).toBe('2024-05-01');
    expect(row.timestampPrecision).toBe('EXACT');
  });

  it('persists explicit observation date without timestamp', async () => {
    const explicitDate = '2024-05-02';
    
    await recordValuationSnapshot(db, {
      portfolio: 'PORTFOLIO_B',
      total_value_inr: 20000,
      equity_value: 20000,
      cash_value: 0,
      mf_value: 0,
      aif_value: 0,
      unlisted_value: 0,
      fx_rate_usd: 83.0,
      trigger_source: 'MARKET_SYNC',
      drift_pct: 0,
      drift_alert: null,
      observationDate: explicitDate
    });
    
    const row = await dbGet(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'PORTFOLIO_B'");
    expect(row).toBeDefined();
    expect(row.timestamp).toBe(explicitDate);
    expect(row.observationDate).toBe(explicitDate);
    expect(row.observationTimestamp).toBeNull();
    expect(row.timestampPrecision).toBe('DAY');
  });

  it('rejects valuation snapshots lacking an explicit observation timestamp or date', async () => {
    await expect(recordValuationSnapshot(db, {
      portfolio: 'PORTFOLIO_C',
      total_value_inr: 18000,
      equity_value: 18000,
      cash_value: 0,
      mf_value: 0,
      aif_value: 0,
      unlisted_value: 0,
      fx_rate_usd: 83.0,
      trigger_source: 'MARKET_SYNC',
      drift_pct: 0,
      drift_alert: null
    } as any)).rejects.toThrow('REJECTED: MISSING_OBSERVATION_TIMESTAMP');
    
    const rows = await dbAll(db, "SELECT * FROM ValuationSnapshots WHERE portfolio = 'PORTFOLIO_C'");
    expect(rows.length).toBe(0);
  });
});
