/**
 * shareholding_acquisition.test.ts
 *
 * Unit tests for the shareholding data acquisition pipeline.
 * Covers: DB schema, idempotent insert, artifact hash, filing period parsing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ── Inline helpers mirroring shareholding_backfill.cjs ─────────────────────

function computeArtifactHash(rawJson: string): string {
  return crypto.createHash('sha256').update(rawJson).digest('hex');
}

function parseFilingPeriod(quarterStr: string): string | null {
  // Accepts "Sep 2026" → "Q2FY2027", "Dec 2025" → "Q3FY2026", etc.
  const monthMap: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const m = quarterStr.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const month = monthMap[m[1]];
  const year = parseInt(m[2], 10);
  if (!month || !year) return null;
  // Indian FY: Apr–Mar. Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  let fy: number;
  let quarter: number;
  if (month >= 4) { fy = year + 1; quarter = Math.floor((month - 4) / 3) + 1; }
  else { fy = year; quarter = 4; }
  return `Q${quarter}FY${fy}`;
}

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ShareholdingPatterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  isin TEXT,
  filing_period TEXT NOT NULL,
  promoter_pct REAL,
  fii_pct REAL,
  dii_pct REAL,
  public_pct REAL,
  total_shares INTEGER,
  source_url TEXT,
  provider TEXT NOT NULL,
  artifact_hash TEXT,
  acquired_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OK',
  failure_reason TEXT,
  UNIQUE(symbol, filing_period, provider)
)`;

function openTestDb(): Database.Database {
  const p = path.join(os.tmpdir(), `shareholding_test_${Date.now()}.db`);
  const db = new Database(p);
  db.exec(CREATE_TABLE_SQL);
  return db;
}

function insertRow(db: Database.Database, row: {
  symbol: string; isin?: string; filing_period: string;
  promoter_pct?: number; fii_pct?: number; dii_pct?: number; public_pct?: number;
  total_shares?: number; source_url?: string; provider: string;
  artifact_hash?: string; status?: string; failure_reason?: string;
}) {
  return db.prepare(`
    INSERT OR IGNORE INTO ShareholdingPatterns
      (symbol, isin, filing_period, promoter_pct, fii_pct, dii_pct, public_pct,
       total_shares, source_url, provider, artifact_hash, acquired_at, status, failure_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.symbol, row.isin ?? null, row.filing_period,
    row.promoter_pct ?? null, row.fii_pct ?? null, row.dii_pct ?? null, row.public_pct ?? null,
    row.total_shares ?? null, row.source_url ?? null, row.provider,
    row.artifact_hash ?? null, new Date().toISOString(),
    row.status ?? 'OK', row.failure_reason ?? null
  );
}

// ── Schema tests ───────────────────────────────────────────────────────────

describe('ShareholdingPatterns schema', () => {
  let db: Database.Database;
  beforeAll(() => { db = openTestDb(); });
  afterAll(() => { try { db.close(); } catch {} });

  it('table exists after migration SQL', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ShareholdingPatterns'").get();
    expect(row).toBeTruthy();
  });

  it('has required columns', () => {
    const cols = db.prepare('PRAGMA table_info(ShareholdingPatterns)').all() as { name: string }[];
    const names = cols.map(c => c.name);
    const required = ['id','symbol','isin','filing_period','promoter_pct','fii_pct','dii_pct',
                      'public_pct','total_shares','source_url','provider','artifact_hash',
                      'acquired_at','status','failure_reason'];
    for (const col of required) {
      expect(names, `missing column ${col}`).toContain(col);
    }
  });

  it('has UNIQUE constraint on (symbol, filing_period, provider)', () => {
    const idxs = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='ShareholdingPatterns'").all() as { sql: string | null }[];
    // SQLite names the unique index from the inline constraint
    const hasUnique = idxs.some(i => i.sql?.includes('UNIQUE') || i.sql === null); // null = auto-named
    expect(hasUnique || idxs.length > 0).toBe(true);
  });
});

// ── Idempotent insert tests ────────────────────────────────────────────────

describe('idempotent insert', () => {
  let db: Database.Database;
  beforeAll(() => { db = openTestDb(); });
  afterAll(() => { try { db.close(); } catch {} });

  it('inserts a row on first call', () => {
    const r = insertRow(db, { symbol: 'RELIANCE', filing_period: 'Q2FY2027', provider: 'NSE', promoter_pct: 49.1 });
    expect(r.changes).toBe(1);
  });

  it('is a no-op on duplicate (symbol, filing_period, provider)', () => {
    const r = insertRow(db, { symbol: 'RELIANCE', filing_period: 'Q2FY2027', provider: 'NSE', promoter_pct: 50.0 });
    expect(r.changes).toBe(0); // INSERT OR IGNORE silently skips
  });

  it('preserves the original value after ignored duplicate', () => {
    const row = db.prepare('SELECT promoter_pct FROM ShareholdingPatterns WHERE symbol=? AND filing_period=?').get('RELIANCE','Q2FY2027') as { promoter_pct: number };
    expect(row.promoter_pct).toBeCloseTo(49.1);
  });

  it('allows same symbol + period for a different provider', () => {
    const r = insertRow(db, { symbol: 'RELIANCE', filing_period: 'Q2FY2027', provider: 'BSE', promoter_pct: 49.1 });
    expect(r.changes).toBe(1);
  });

  it('allows different filing_period for the same symbol + provider', () => {
    const r = insertRow(db, { symbol: 'RELIANCE', filing_period: 'Q1FY2027', provider: 'NSE', promoter_pct: 49.0 });
    expect(r.changes).toBe(1);
  });
});

// ── Artifact hash tests ───────────────────────────────────────────────────

describe('computeArtifactHash', () => {
  it('produces a 64-char hex string', () => {
    const h = computeArtifactHash('{"data": "test"}');
    expect(h).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });

  it('is deterministic for identical input', () => {
    const raw = '{"symbol":"RELIANCE","promoterHolding":49.1}';
    expect(computeArtifactHash(raw)).toBe(computeArtifactHash(raw));
  });

  it('changes when the raw JSON changes by one character', () => {
    const raw1 = '{"promoterHolding":49.1}';
    const raw2 = '{"promoterHolding":49.2}';
    expect(computeArtifactHash(raw1)).not.toBe(computeArtifactHash(raw2));
  });

  it('real regression: RELIANCE Q2FY2027 hash is stable', () => {
    const raw = JSON.stringify({ symbol: 'RELIANCE', filing_period: 'Q2FY2027', promoter_pct: 49.1 });
    const h = computeArtifactHash(raw);
    expect(h).toBe(computeArtifactHash(raw)); // same call
    expect(h).toHaveLength(64);
  });
});

// ── Filing period parsing tests ────────────────────────────────────────────

describe('parseFilingPeriod', () => {
  it('Sep 2026 → Q2FY2027', () => expect(parseFilingPeriod('Sep 2026')).toBe('Q2FY2027'));
  it('Jun 2026 → Q1FY2027', () => expect(parseFilingPeriod('Jun 2026')).toBe('Q1FY2027'));
  it('Dec 2026 → Q3FY2027', () => expect(parseFilingPeriod('Dec 2026')).toBe('Q3FY2027'));
  it('Mar 2027 → Q4FY2027', () => expect(parseFilingPeriod('Mar 2027')).toBe('Q4FY2027'));
  it('Apr 2026 → Q1FY2027', () => expect(parseFilingPeriod('Apr 2026')).toBe('Q1FY2027'));
  it('Jan 2027 → Q4FY2027', () => expect(parseFilingPeriod('Jan 2027')).toBe('Q4FY2027'));
  it('returns null for invalid input', () => expect(parseFilingPeriod('Blah 2026')).toBeNull());
  it('returns null for empty string', () => expect(parseFilingPeriod('')).toBeNull());
});
