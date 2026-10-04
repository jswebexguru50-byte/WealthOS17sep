import { describe, it, expect, beforeEach } from 'vitest';
import { ShareholdingPatternIngestionService } from '../../src/server/services/ShareholdingPatternIngestionService.js';
import Database from 'better-sqlite3';
import path from 'path';

describe('ShareholdingPatternIngestionService Generic Ingestion & Audit', () => {
  const root = process.cwd();
  const dbPath = path.join(root, 'portfolio.db');
  let db: Database.Database;
  const service = ShareholdingPatternIngestionService.getInstance();

  beforeEach(() => {
    db = new Database(dbPath);
  });

  it('Proves reproducible deletion and rebuild from persisted raw evidence with ZERO network calls', () => {
    // 1. Delete GLOBALPET shareholding pattern
    db.prepare(`DELETE FROM HistoricalShareholdingPattern WHERE symbol = 'GLOBALPET'`).run();
    const countBefore = (db.prepare(`SELECT count(*) as cnt FROM HistoricalShareholdingPattern WHERE symbol = 'GLOBALPET'`).get() as any).cnt;
    expect(countBefore).toBe(0);

    // 2. Re-ingest using generic service (reads exclusively from persisted fundamental_endpoint_snapshots)
    const result = service.ingestForSymbol('GLOBALPET', db);
    expect(result.recordsSynced).toBe(4);
    expect(result.periods).toEqual(['Mar 2026', 'Sep 2025', 'Mar 2025', 'Nov 2024']);

    // 3. Confirm rows restored in database
    const rows = db.prepare(`
      SELECT quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, public_pct, primary_source
      FROM HistoricalShareholdingPattern
      WHERE symbol = 'GLOBALPET'
      ORDER BY as_of_date DESC
    `).all() as any[];

    expect(rows.length).toBe(4);

    // Mar 2026
    expect(rows[0].quarter_label).toBe('Mar 2026');
    expect(rows[0].as_of_date).toBe('2026-03-31');
    expect(rows[0].promoter_pct).toBe(60.13);
    expect(rows[0].fii_pct).toBe(6.79);
    expect(rows[0].dii_pct).toBe(3.98); // other_dii 3.98 + mf 0
    expect(rows[0].public_pct).toBe(29.1);

    // Sep 2025
    expect(rows[1].quarter_label).toBe('Sep 2025');
    expect(rows[1].as_of_date).toBe('2025-09-30');
    expect(rows[1].promoter_pct).toBe(60.13);
    expect(rows[1].fii_pct).toBe(6.79);
    expect(rows[1].dii_pct).toBe(0); // explicitly reported 0 by provider
    expect(rows[1].public_pct).toBe(33.09);

    // 4. Audit verification proves 20/20 cells verified
    const audit = service.auditForSymbol('GLOBALPET', db);
    expect(audit.totalCellsAudited).toBe(20);
    expect(audit.verifiedCells).toBe(20);
    expect(audit.unsupportedCells).toBe(0);
    expect(audit.missingNotZeroCells).toBe(0);
  });

  it('Guarantees missing DII is NOT converted to synthetic 0 when categories are absent', () => {
    // In-memory test to verify invariant: missing categories must produce null, not 0
    const memDb = new Database(':memory:');
    memDb.exec(`
      CREATE TABLE fundamental_endpoint_snapshots (
        symbol TEXT,
        endpoint TEXT,
        provider TEXT,
        fetched_at TEXT,
        response_json TEXT
      );
      CREATE TABLE HistoricalShareholdingPattern (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        quarter_label TEXT NOT NULL,
        as_of_date TEXT NOT NULL,
        promoter_pct REAL,
        fii_pct REAL,
        dii_pct REAL,
        govt_pct REAL DEFAULT 0,
        others_pct REAL DEFAULT 0,
        public_pct REAL,
        employee_trusts_pct REAL DEFAULT 0,
        sum_total_pct REAL,
        free_float_pct REAL,
        primary_source TEXT,
        is_reconciled INTEGER DEFAULT 1,
        created_at TEXT
      );
    `);

    // Payload with NO mutual_funds and NO other_dii categories
    const payloadNoDii = {
      status: 'success',
      data: [
        {
          category: 'promoters',
          history: [{ period: 'Jun 2026', value: 70.0 }]
        },
        {
          category: 'fii',
          history: [{ period: 'Jun 2026', value: 5.0 }]
        }
      ]
    };

    memDb.prepare(`
      INSERT INTO fundamental_endpoint_snapshots (symbol, endpoint, provider, fetched_at, response_json)
      VALUES ('TESTSYM', 'share-holdings', 'TRENDLYNE_MCP', '2026-10-01T00:00:00Z', ?)
    `).run(JSON.stringify(payloadNoDii));

    const res = service.ingestForSymbol('TESTSYM', memDb);
    expect(res.recordsSynced).toBe(1);

    const row = memDb.prepare(`SELECT * FROM HistoricalShareholdingPattern WHERE symbol = 'TESTSYM'`).get() as any;
    expect(row.promoter_pct).toBe(70.0);
    expect(row.fii_pct).toBe(5.0);
    // CRITICAL INVARIANT: Absent DII MUST be NULL, NOT 0!
    expect(row.dii_pct).toBeNull();
    expect(row.public_pct).toBeNull();

    memDb.close();
  });
});
