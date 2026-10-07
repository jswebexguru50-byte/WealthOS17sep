import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  TRENDLYNE_MIRROR_SCHEMA_SQL,
  TRENDLYNE_PACKS_V1,
  TRENDLYNE_PARAMETER_CATALOG_SEED,
  TrendlyneMirrorService,
} from '../../src/server/services/trendlyne-mirror/TrendlyneMirrorService';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE dossier_runs (
      dossierRunId TEXT PRIMARY KEY,
      requestMode TEXT NOT NULL,
      actualTradingDates TEXT NOT NULL,
      scanAsOf TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      status TEXT NOT NULL,
      candidateCount INTEGER
    );
    CREATE TABLE dossier_candidates (
      candidateId TEXT PRIMARY KEY,
      dossierRunId TEXT NOT NULL,
      symbol TEXT NOT NULL,
      convergenceCount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    );
    CREATE TABLE fundamental_endpoint_snapshots (
      symbol TEXT NOT NULL,
      isin TEXT,
      provider TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      authority TEXT NOT NULL,
      source_url TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      status TEXT NOT NULL,
      http_status INTEGER,
      error TEXT,
      response_json TEXT,
      PRIMARY KEY(symbol, provider, endpoint)
    );
    CREATE TABLE company_facts (
      factId TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      symbol TEXT NOT NULL,
      metric TEXT NOT NULL,
      value TEXT,
      periodType TEXT NOT NULL,
      periodEnd TEXT,
      asOfDate TEXT NOT NULL,
      factType TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      scope TEXT NOT NULL,
      provider TEXT,
      verificationStatus TEXT NOT NULL,
      availabilityStatus TEXT NOT NULL DEFAULT 'AVAILABLE'
    );
    CREATE TABLE trendlyne_quota_ledger (created_at TEXT);
  `);
  db.exec(TRENDLYNE_MIRROR_SCHEMA_SQL);
  return db;
}

function seedCohort(db: Database.Database, count = 19) {
  db.prepare(`
    INSERT INTO dossier_runs
    (dossierRunId, requestMode, actualTradingDates, scanAsOf, createdAt, status, candidateCount)
    VALUES ('DR-20261001-7D-B0A8466C', 'LAST_N', '[]', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z', 'COMPLETED', ?)
  `).run(count);
  const stmt = db.prepare(`
    INSERT INTO dossier_candidates(candidateId, dossierRunId, symbol, convergenceCount, status)
    VALUES (?, 'DR-20261001-7D-B0A8466C', ?, 1, 'ANALYZED')
  `);
  for (let i = 1; i <= count; i++) stmt.run(`CAN-${i}`, `SYM${String(i).padStart(2, '0')}`);
}

describe('TrendlyneMirrorService', () => {
  it('loads the frozen cohort from dossier persistence and plans 10+9 batches', () => {
    const db = makeDb();
    seedCohort(db);
    const service = new TrendlyneMirrorService(db as any);
    service.seedCatalog('2026-10-04T00:00:00Z');
    service.seedPacks('2026-10-04T00:00:00Z');

    const symbols = service.loadCohort('DR-20261001-7D-B0A8466C');
    const batches = service.planBatches(symbols);

    expect(symbols).toHaveLength(19);
    expect(batches).toHaveLength(TRENDLYNE_PACKS_V1.length * 2);
    expect(batches[0].symbols).toHaveLength(10);
    expect(batches[1].symbols).toHaveLength(9);
    expect(batches.every(b => b.symbols.length <= 10)).toBe(true);
    expect(batches.every(b => b.tokens.length <= 50)).toBe(true);
  });

  it('rejects accidental non-19 cohort changes', () => {
    const db = makeDb();
    seedCohort(db, 18);
    const service = new TrendlyneMirrorService(db as any);
    expect(() => service.loadCohort('DR-20261001-7D-B0A8466C')).toThrow(/Expected frozen 19-stock cohort/);
  });

  it('keeps provider null distinct from zero and does not synthesize period dates', () => {
    const db = makeDb();
    seedCohort(db);
    const service = new TrendlyneMirrorService(db as any);
    service.seedCatalog('2026-10-04T00:00:00Z');
    service.seedPacks('2026-10-04T00:00:00Z');
    const snapshotId = service.persistRawSnapshot({
      provider: 'TRENDLYNE_MCP',
      endpoint: 'parameters',
      packId: 'F02_ANNUAL',
      packVersion: 1,
      symbols: ['SYM01'],
      tokens: ['sra'],
      responseJson: '{"sra":null}',
      providerStatus: 'SUCCESS',
      requestedAt: '2026-10-04T00:00:00Z',
      receivedAt: '2026-10-04T00:00:01Z',
    });
    service.persistObservations(snapshotId, [{
      symbol: 'SYM01',
      providerToken: 'sra',
      providerLabel: 'Total Revenue Ann.',
      canonicalMetric: 'revenue',
      rawValue: null,
      rawUnit: 'INR_CR',
      periodType: 'ANNUAL',
      relativePeriod: 'LATEST',
      providerPeriod: null,
      providerAsOf: null,
    }], '2026-10-04T00:00:02Z');

    const obs = db.prepare('SELECT rawValue, status, providerPeriod, relativePeriod FROM trendlyne_mirror_observations').get() as any;
    expect(obs.rawValue).toBeNull();
    expect(obs.status).toBe('PROVIDER_EXPLICIT_NULL');
    expect(obs.providerPeriod).toBeNull();
    expect(obs.relativePeriod).toBe('LATEST');
  });

  it('excludes provider proprietary scores from production packs', () => {
    const rejected = TRENDLYNE_PARAMETER_CATALOG_SEED.filter(t => t.trustState === 'REJECTED').map(t => t.providerToken);
    const packTokens = new Set(TRENDLYNE_PACKS_V1.flatMap(p => p.tokens));
    for (const token of rejected) expect(packTokens.has(token)).toBe(false);
  });

  it('treats unchanged raw response hash as a refresh no-op', () => {
    const db = makeDb();
    seedCohort(db);
    const service = new TrendlyneMirrorService(db as any);
    const batch = { packId: 'F06_VALUATION', packVersion: 1, symbols: ['SYM01'], tokens: ['pettm'], requestedCells: 1 };
    service.updateRefreshState(batch, 'abc', 'SUCCESS', '2026-10-04T00:00:00Z');
    service.updateRefreshState(batch, 'abc', 'SUCCESS', '2026-10-04T01:00:00Z');
    const state = db.prepare('SELECT consecutiveUnchangedChecks, lastChangedAt FROM trendlyne_mirror_refresh_state').get() as any;
    expect(state.consecutiveUnchangedChecks).toBe(1);
    expect(state.lastChangedAt).toBe('2026-10-04T00:00:00Z');
  });
});
