import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService.js';

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
}

function all<T>(db: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows as T[])));
}

describe('PublicWaterfallPromotion', () => {
  it('public exchange artifact promotes usable facts without requiring an MCP snapshot', async () => {
    const db = new sqlite3.Database(':memory:');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wealthos-public-waterfall-'));
    const artifactPath = path.join(tempDir, 'raw.json');
    try {
      await run(db, 'CREATE TABLE MasterTickers (id TEXT, isin TEXT, symbol TEXT)');
      await run(db, "INSERT INTO MasterTickers VALUES ('company-1','INE001A01036','DEMO')");
      await run(db, `CREATE TABLE company_facts (
        factId TEXT PRIMARY KEY, companyId TEXT, symbol TEXT, isin TEXT, metric TEXT, value TEXT, unit TEXT,
        currency TEXT, periodType TEXT, periodEnd TEXT, asOfDate TEXT, factType TEXT, sourceType TEXT,
        scope TEXT, provider TEXT, verificationStatus TEXT, fetchedAt TEXT, availableAt TEXT,
        availabilityStatus TEXT, sourceDocumentId TEXT, providerToken TEXT, exactProviderLabel TEXT,
        sourceUrl TEXT, evidenceText TEXT, calculationMethod TEXT
      )`);
      fs.writeFileSync(artifactPath, JSON.stringify({
        raw: {
          exchangeAcquiredAt: '2026-10-25T06:00:00.000Z',
          exchange: {
            screenerSource: 'https://www.screener.in/company/DEMO/consolidated/',
            annualPL: [{ period: 'Mar 2025', revenue_cr: 120, operating_profit_cr: 30, pat_cr: 20, cfo_cr: 18 }],
            quarterlyPL: [{ period: 'Jun 2025', revenue_cr: 35, pat_cr: 6 }],
            balanceSheet: { latestPeriod: 'Mar 2025', borrowings_cr: 10, inventory_cr: 5 }
          }
        }
      }));
      const result = await new CanonicalFactIngestionService(db).ingestExchangeArtifactForSymbol('demo', artifactPath);
      expect(result.factsInserted).toBe(8);
      const rows = await all<{ metric: string; provider: string; sourceUrl: string; verificationStatus: string }>(
        db, 'SELECT metric, provider, sourceUrl, verificationStatus FROM company_facts ORDER BY metric'
      );
      expect(rows.map(row => row.metric)).toEqual([
        'borrowings', 'cfo', 'inventory', 'operating_profit', 'pat', 'pat', 'revenue', 'revenue'
      ]);
      expect(rows.every(row => row.provider === 'SCREENER_PUBLIC')).toBe(true);
      expect(rows.every(row => row.verificationStatus === 'VERIFIED_PARTIAL')).toBe(true);
      expect(rows.every(row => row.sourceUrl.includes('/DEMO/'))).toBe(true);
    } finally {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
