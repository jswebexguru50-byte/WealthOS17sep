import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbRun, getDB, closeDB, initializeDatabase } from '../../src/server/database.js';
import { OpportunityScannerEngine } from '../../src/server/services/OpportunityScannerEngine.js';
import fs from 'fs';

describe('Disposable-DB Smoke Test: Discover -> Analyze -> FERE', () => {
  const TEST_DB_PATH = 'smoke_test.sqlite';

  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const db = getDB();
    await initializeDatabase(db, true);
  }, 30000);

  afterAll(async () => {
    await closeDB();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('runs Discover -> Analyze -> FERE safely without breaking', async () => {
    const scanner = new OpportunityScannerEngine();
    
    // Smoke test scan for a known ticker
    const result = await scanner.scanSingleScrip('RELIANCE');
    
    // We expect it to fail closed with DATA_INSUFFICIENT due to missing data in this fresh DB
    expect(result).toBeDefined();
    expect((result as any).status).toBe('DATA_INSUFFICIENT');
  });
});
