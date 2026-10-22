import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import request from 'supertest';
import Database from 'better-sqlite3';

function getFileSha256(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function getDbShas(dbPath: string) {
  return {
    db: getFileSha256(dbPath),
    wal: getFileSha256(`${dbPath}-wal`),
    shm: getFileSha256(`${dbPath}-shm`),
  };
}

describe('Disposable-DB Smoke Test: Discover -> Analyze -> FERE', () => {
  const TEST_DB_PATH = path.resolve('smoke_test.sqlite');
  const PROD_DB_PATH = path.resolve('portfolio.db');
  let initialProdDbShas: any = null;
  
  let app: any;
  let closeDB: any;
  let getDB: any;

  beforeAll(async () => {
    initialProdDbShas = getDbShas(PROD_DB_PATH);

    const reportsDir = path.resolve('tests/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    ['', '-wal', '-shm'].forEach(ext => {
      const p = `${TEST_DB_PATH}${ext}`;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    process.env.READ_ONLY_RUNTIME = 'true';
    
    // SQLite consistent backup
    if (fs.existsSync(PROD_DB_PATH)) {
      const prodDb = new Database(PROD_DB_PATH, { readonly: true });
      await prodDb.backup(TEST_DB_PATH);
      prodDb.close();
    } else {
      throw new Error("Production DB not found for backup");
    }
    
    process.env.DB_PATH = TEST_DB_PATH;
    process.env.DATABASE_URL = TEST_DB_PATH;
    
    const serverModule = await import('../../server.js');
    app = serverModule.app;
    
    const dbModule = await import('../../src/server/database.js');
    closeDB = dbModule.closeDB;
    getDB = dbModule.getDB;
  }, 60000);

  afterAll(async () => {
    if (closeDB) {
      await closeDB();
    }
    
    ['', '-wal', '-shm'].forEach(ext => {
      const p = `${TEST_DB_PATH}${ext}`;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    const finalProdDbShas = getDbShas(PROD_DB_PATH);
    expect(finalProdDbShas.db).toBe(initialProdDbShas.db);
    expect(finalProdDbShas.wal).toBe(initialProdDbShas.wal);
    expect(finalProdDbShas.shm).toBe(initialProdDbShas.shm);
  });

  it('runs Discover -> Analyze -> FERE via API safely without breaking', async () => {
    // 1. Discover
    const candidatesRes = await request(app).get('/api/strategies/seven-strategies-candidates');
    expect(candidatesRes.status).toBe(200);
    expect(candidatesRes.body.success).toBe(true);
    expect(Array.isArray(candidatesRes.body.candidates)).toBe(true);
    
    const candidates = candidatesRes.body.candidates;
    expect(candidates.length).toBeGreaterThan(0);
    const testSymbol = candidates[0].symbol;

    // 2. Analyze Candidate
    const intelRes = await request(app).get(`/api/scrip-intelligence/${testSymbol}`);
    expect([200, 400]).toContain(intelRes.status);
    
    const data = intelRes.body.data;
    expect(data).toBeDefined();
    expect(data.status).toBeDefined();
    
    if (data.status === 'DATA_INSUFFICIENT') {
      expect(data.compositeScore).toBeNull();
      expect(data.probabilityPct).toBeNull();
      expect(data.targetPrice).toBeNull();
    }

    // 3. FERE for Candidate
    const fereRes = await request(app).get(`/api/forensic/${testSymbol}/evidence`);
    expect(fereRes.status).toBe(200);
    
    const evidenceArray = fereRes.body.evidence || fereRes.body.facts;
    expect(Array.isArray(evidenceArray)).toBe(true);

    const db = getDB();
    const persistedEvidence = db.prepare('SELECT COUNT(*) as count FROM ForensicEvidence WHERE symbol = ?').get(testSymbol);
    expect(evidenceArray.length).toBe(persistedEvidence.count);
    
    // 4. Analyze Unknown Ticker
    const unknownRes = await request(app).get('/api/scrip-intelligence/UNLIKELY_TICKER');
    expect([200, 400]).toContain(unknownRes.status);
    
    const unknownData = unknownRes.body.data;
    expect(unknownData).toBeDefined();
    expect(unknownData.status).toBe('DATA_INSUFFICIENT');
    expect(unknownData.compositeScore).toBeNull();
    expect(unknownData.probabilityPct).toBeNull();
    expect(unknownData.targetPrice).toBeNull();
  });
});
