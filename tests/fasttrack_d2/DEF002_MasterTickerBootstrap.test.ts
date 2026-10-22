import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sqlite3 from 'sqlite3';
import { dbAll, initializeDatabase } from '../../src/server/database';
import { MasterTickerService } from '../../src/server/services/MasterTickerService';

describe('DEF-002: MasterTicker Bootstrap Isolation', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()));
    vi.restoreAllMocks();
  });

  it('A. Database schema initialization does NOT invoke autoInitializeMasterTickers', async () => {
    const initSpy = vi.spyOn(MasterTickerService.getInstance(), 'autoInitializeMasterTickers');

    await initializeDatabase(db, true);

    expect(initSpy).not.toHaveBeenCalled();
  });

  it('B. Database layer completes schema setup independently', async () => {
    await initializeDatabase(db, true);

    const tables = await dbAll(db, "SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map((t: any) => t.name);

    expect(tableNames).toContain('ValuationSnapshots');
    expect(tableNames).toContain('Holdings');
  });
});
