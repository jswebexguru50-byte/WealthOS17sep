/**
 * canonical_fact_eligibility.test.ts
 *
 * Durable permanent tests for:
 * - CanonicalFactSelector eligibility rules (NULL, REJECTED, AMBIGUOUS excluded)
 * - Scope and periodType exclusion
 * - PIT gate (post-as-of facts excluded)
 * - Persisted provenance fields preserved (never eval timestamp substituted)
 * - FundamentalModuleAdapter uses canonical selector (NULL-status facts excluded)
 * - FundamentalExperienceBuilder direct metric reads use canonical selector
 * - DB override prevents production DB access
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  assessFactEligibility,
  selectBestFact,
  eligibilityWhereClause,
  type CanonicalFactRow,
} from '../../src/server/services/intelligence/modules/CanonicalFactSelector.js';
import { FundamentalModuleAdapter } from '../../src/server/services/intelligence/modules/FundamentalModuleAdapter.js';
import { FundamentalExperienceBuilder } from '../../src/server/services/intelligence/modules/FundamentalExperienceBuilder.js';
import { closeDB, getEffectiveDbPath } from '../../src/server/database.js';

// ─────────────────────────────────────────────────────────────────────────────
// Disposable in-memory DB factory with full canonical schema
// ─────────────────────────────────────────────────────────────────────────────
function makeDb() {
  const db = new Database(':memory:');
  db.prepare(`
    CREATE TABLE MasterTickers (
      id INTEGER PRIMARY KEY, symbol TEXT, name TEXT, sector TEXT, industry TEXT, isin TEXT
    )
  `).run();
  db.prepare(`
    CREATE TABLE company_facts (
      factId TEXT PRIMARY KEY,
      symbol TEXT,
      metric TEXT,
      value REAL,
      unit TEXT,
      periodType TEXT,
      periodEnd TEXT,
      periodStart TEXT,
      scope TEXT,
      provider TEXT,
      sourceType TEXT,
      verificationStatus TEXT,
      sourceDocumentId TEXT,
      fetchedAt TEXT,
      availableAt TEXT,
      reportedAt TEXT,
      asOfDate TEXT
    )
  `).run();
  db.prepare(`
    CREATE TABLE HistoricalShareholdingPattern (
      id INTEGER, symbol TEXT, quarter_label TEXT, as_of_date TEXT,
      promoter_pct REAL, fii_pct REAL, dii_pct REAL, public_pct REAL
    )
  `).run();
  db.prepare(`
    CREATE TABLE fundamental_endpoint_snapshots (
      symbol TEXT, provider TEXT, endpoint TEXT, fetched_at TEXT, response_json TEXT
    )
  `).run();
  db.prepare(`
    CREATE TABLE InstitutionalDeals (
      id INTEGER, deal_date TEXT, symbol TEXT, company_name TEXT, client_name TEXT,
      deal_type TEXT, quantity INTEGER, price REAL, category TEXT, remarks TEXT
    )
  `).run();
  db.prepare(`
    CREATE TABLE DailyOHLCV (
      symbol TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL,
      volume INTEGER, turnover REAL, delivery_qty INTEGER, delivery_pct REAL, prev_close REAL
    )
  `).run();
  db.prepare(`
    CREATE TABLE NseBhavcopy (
      symbol TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL,
      volume INTEGER, turnover REAL, delivery_qty INTEGER, delivery_pct REAL,
      prev_close REAL, timestamp TEXT
    )
  `).run();
  return db;
}

const PERSISTED_FETCHED_AT = '2026-08-01T00:00:00Z';
const PERSISTED_AVAILABLE_AT = '2026-08-02T00:00:00Z';

function baseRow(overrides: Partial<CanonicalFactRow> = {}): CanonicalFactRow {
  return {
    factId: 'F1',
    symbol: 'TEST',
    metric: 'revenue_cr',
    value: 100,
    periodType: 'ANNUAL',
    periodEnd: 'Mar 2025',
    scope: 'CONSOLIDATED',
    provider: 'UPSTOX_FUNDAMENTALS',
    verificationStatus: 'VERIFIED',
    fetchedAt: PERSISTED_FETCHED_AT,
    availableAt: PERSISTED_AVAILABLE_AT,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CanonicalFactSelector — eligibility rules
// ─────────────────────────────────────────────────────────────────────────────
describe('CanonicalFactSelector — eligibility rules', () => {

  it('NULL verificationStatus is excluded with status NULL_VERIFICATION_STATUS', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: null }));
    expect(result.eligibilityStatus).toBe('NULL_VERIFICATION_STATUS');
    expect(result.numericValue).toBeNull();
  });

  it('undefined verificationStatus is excluded', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: undefined }));
    expect(result.eligibilityStatus).toBe('NULL_VERIFICATION_STATUS');
    expect(result.numericValue).toBeNull();
  });

  it('empty-string verificationStatus is excluded', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: '' }));
    expect(result.eligibilityStatus).toBe('NULL_VERIFICATION_STATUS');
    expect(result.numericValue).toBeNull();
  });

  it('REJECTED verificationStatus is excluded', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: 'REJECTED' }));
    expect(result.eligibilityStatus).toBe('REJECTED');
    expect(result.numericValue).toBeNull();
  });

  it('AMBIGUOUS verificationStatus is excluded', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: 'AMBIGUOUS' }));
    expect(result.eligibilityStatus).toBe('AMBIGUOUS');
    expect(result.numericValue).toBeNull();
  });

  it('CONFLICTING verificationStatus is excluded as AMBIGUOUS', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: 'CONFLICTING' }));
    expect(result.eligibilityStatus).toBe('AMBIGUOUS');
    expect(result.numericValue).toBeNull();
  });

  it('PENDING_REVIEW verificationStatus is excluded by default with status PENDING_REVIEW', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: 'PENDING_REVIEW' }));
    expect(result.eligibilityStatus).toBe('PENDING_REVIEW');
    expect(result.numericValue).toBeNull();
  });

  it('PENDING_REVIEW verificationStatus is admitted only when includePendingReview is explicitly true', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: 'PENDING_REVIEW' }), { includePendingReview: true });
    expect(result.eligibilityStatus).toBe('ELIGIBLE');
    expect(result.numericValue).toBe(100);
  });

  it('missing availableAt when pointInTime is specified returns MISSING_AVAILABLE_AT', () => {
    const result = assessFactEligibility(baseRow({ availableAt: null }), { pointInTime: '2026-09-01T00:00:00Z' });
    expect(result.eligibilityStatus).toBe('MISSING_AVAILABLE_AT');
    expect(result.numericValue).toBeNull();
  });

  it('VERIFIED is admitted and value is parsed', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: 'VERIFIED', value: 42.5 }));
    expect(result.eligibilityStatus).toBe('ELIGIBLE');
    expect(result.numericValue).toBe(42.5);
  });

  it('VERIFIED_PARTIAL is admitted', () => {
    const result = assessFactEligibility(baseRow({ verificationStatus: 'VERIFIED_PARTIAL', value: 10 }));
    expect(result.eligibilityStatus).toBe('ELIGIBLE');
    expect(result.numericValue).toBe(10);
  });

  it('unsupported scope is excluded', () => {
    const result = assessFactEligibility(baseRow({ scope: 'SEGMENT' }));
    expect(result.eligibilityStatus).toBe('UNSUPPORTED_SCOPE');
    expect(result.numericValue).toBeNull();
  });

  it('unsupported periodType is excluded', () => {
    const result = assessFactEligibility(baseRow({ periodType: 'DAILY' }));
    expect(result.eligibilityStatus).toBe('UNSUPPORTED_PERIOD_TYPE');
    expect(result.numericValue).toBeNull();
  });

  it('fact with availableAt after pointInTime is excluded', () => {
    const result = assessFactEligibility(
      baseRow({ availableAt: '2026-09-01T00:00:00Z' }),
      { pointInTime: '2026-08-01T00:00:00Z' }
    );
    expect(result.eligibilityStatus).toBe('POST_POINT_IN_TIME');
    expect(result.numericValue).toBeNull();
  });

  it('fact with availableAt on the pointInTime boundary is admitted', () => {
    const result = assessFactEligibility(
      baseRow({ availableAt: '2026-08-01T00:00:00Z' }),
      { pointInTime: '2026-08-01T00:00:00Z' }
    );
    expect(result.eligibilityStatus).toBe('ELIGIBLE');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Persisted provenance fields are never replaced by evaluation timestamp
// ─────────────────────────────────────────────────────────────────────────────
describe('CanonicalFactSelector — provenance preservation', () => {

  it('persistedFetchedAt is the stored fetchedAt column value', () => {
    const result = assessFactEligibility(baseRow());
    expect(result.persistedFetchedAt).toBe(PERSISTED_FETCHED_AT);
  });

  it('persistedAvailableAt is the stored availableAt column value', () => {
    const result = assessFactEligibility(baseRow());
    expect(result.persistedAvailableAt).toBe(PERSISTED_AVAILABLE_AT);
  });

  it('periodEnd, periodType, scope, provider, sourceDocumentId come from the stored row', () => {
    const result = assessFactEligibility(baseRow({
      periodEnd: 'Mar 2025',
      periodType: 'ANNUAL',
      scope: 'CONSOLIDATED',
      provider: 'UPSTOX_FUNDAMENTALS',
      sourceDocumentId: 'DOC-001',
    }));
    expect(result.periodEnd).toBe('Mar 2025');
    expect(result.periodType).toBe('ANNUAL');
    expect(result.scope).toBe('CONSOLIDATED');
    expect(result.provider).toBe('UPSTOX_FUNDAMENTALS');
    expect(result.sourceDocumentId).toBe('DOC-001');
  });

  it('a row with NULL fetchedAt produces null persistedFetchedAt, not evaluation time', () => {
    const before = Date.now();
    const result = assessFactEligibility(baseRow({ fetchedAt: null }));
    const after = Date.now();
    expect(result.persistedFetchedAt).toBeNull();
    // Must not be an evaluation-time ISO string
    if (result.persistedFetchedAt !== null) {
      const ts = new Date(result.persistedFetchedAt).getTime();
      expect(ts >= before && ts <= after).toBe(false);
    }
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. selectBestFact — returns DATA_INSUFFICIENT when all candidates are ineligible
// ─────────────────────────────────────────────────────────────────────────────
describe('CanonicalFactSelector — selectBestFact', () => {

  it('returns first eligible row when one is present', () => {
    const rows: CanonicalFactRow[] = [
      baseRow({ verificationStatus: 'REJECTED', value: 999 }),
      baseRow({ factId: 'F2', verificationStatus: 'VERIFIED', value: 42 }),
    ];
    const result = selectBestFact(rows);
    expect(result.eligibilityStatus).toBe('ELIGIBLE');
    expect(result.numericValue).toBe(42);
  });

  it('returns DATA_INSUFFICIENT when all rows are ineligible', () => {
    const rows: CanonicalFactRow[] = [
      baseRow({ verificationStatus: null }),
      baseRow({ factId: 'F2', verificationStatus: 'REJECTED' }),
    ];
    const result = selectBestFact(rows);
    expect(result.eligibilityStatus).toBe('DATA_INSUFFICIENT');
    expect(result.numericValue).toBeNull();
    expect(result.persistedFetchedAt).toBeNull();
  });

  it('returns DATA_INSUFFICIENT on empty input', () => {
    const result = selectBestFact([]);
    expect(result.eligibilityStatus).toBe('DATA_INSUFFICIENT');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. eligibilityWhereClause — correct SQL output
// ─────────────────────────────────────────────────────────────────────────────
describe('eligibilityWhereClause — SQL output', () => {

  it('excludes PENDING_REVIEW by default and includes VERIFIED, VERIFIED_PARTIAL', () => {
    const clause = eligibilityWhereClause();
    expect(clause).toContain("'VERIFIED'");
    expect(clause).toContain("'VERIFIED_PARTIAL'");
    expect(clause).not.toContain("'PENDING_REVIEW'");
  });

  it('excludes NULL keyword (not an IS NULL check)', () => {
    const clause = eligibilityWhereClause();
    expect(clause).not.toContain('IS NULL');
    expect(clause).not.toContain('NULL,');
  });

  it('when includePendingReview=true includes PENDING_REVIEW for diagnostic callers', () => {
    const clause = eligibilityWhereClause(true);
    expect(clause).toContain("'PENDING_REVIEW'");
    expect(clause).toContain("'VERIFIED'");
    expect(clause).toContain("'VERIFIED_PARTIAL'");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FundamentalModuleAdapter — NULL-status facts excluded in canonical query
// ─────────────────────────────────────────────────────────────────────────────
describe('FundamentalModuleAdapter — canonical eligibility enforcement', () => {

  it('fact with NULL verificationStatus is excluded; adapter returns DATA_INSUFFICIENT trajectory', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'NULL_STS', 'Null Status Ltd', 'IT', 'Software', 'INE000NULL01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus)
      VALUES ('CF_NULL', 'NULL_STS', 'revenue_cr', 500, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', NULL)
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('NULL_STS', db);
    // Null-status fact should be excluded → treated as no eligible facts
    expect(result.result).toBeDefined();
    expect(result.result?.trajectory.revenueGrowthYoY.status).toBe('DATA_INSUFFICIENT');
  });

  it('fact with REJECTED verificationStatus is excluded', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'REJ_STS', 'Rejected Ltd', 'IT', 'Software', 'INE000REJ001')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus)
      VALUES ('CF_REJ', 'REJ_STS', 'revenue_cr', 999, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'REJECTED')
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('REJ_STS', db);
    expect(result.result?.trajectory.revenueGrowthYoY.status).toBe('DATA_INSUFFICIENT');
  });

  it('fact with AMBIGUOUS verificationStatus is excluded', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'AMB_STS', 'Ambiguous Ltd', 'IT', 'Software', 'INE000AMB001')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus)
      VALUES ('CF_AMB', 'AMB_STS', 'revenue_cr', 123, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'AMBIGUOUS')
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('AMB_STS', db);
    expect(result.result?.trajectory.revenueGrowthYoY.status).toBe('DATA_INSUFFICIENT');
  });

  it('fact with PENDING_REVIEW verificationStatus is excluded by default; adapter returns DATA_INSUFFICIENT trajectory', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'PEND_CO', 'Pending Co', 'IT', 'Software', 'INE000PEN01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_PEND', 'PEND_CO', 'revenue_cr', 500, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'PENDING_REVIEW', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('PEND_CO', db);
    expect(result.status).toBe('DATA_INSUFFICIENT');
    expect(result.result?.historicalSeries['Revenue']).toBeUndefined();
  });

  it('normal adapter invocation, without caller-supplied PIT, excludes unsupported scope', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'BAD_SCOPE', 'Bad Scope Ltd', 'IT', 'Software', 'INE000BAD01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_BS', 'BAD_SCOPE', 'revenue_cr', 500, 'ANNUAL', 'Mar 2025', 'UNSUPPORTED_REGION', 'UPSTOX_FUNDAMENTALS', 'VERIFIED', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('BAD_SCOPE', db);
    expect(result.status).toBe('DATA_INSUFFICIENT');
    expect(result.result?.historicalSeries['Revenue']).toBeUndefined();
  });

  it('normal adapter invocation excludes unsupported period type', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'BAD_PT', 'Bad Period Type Ltd', 'IT', 'Software', 'INE000BPT01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_BPT', 'BAD_PT', 'revenue_cr', 500, 'DAILY', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'VERIFIED', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('BAD_PT', db);
    expect(result.status).toBe('DATA_INSUFFICIENT');
    expect(result.result?.historicalSeries['Revenue']).toBeUndefined();
  });

  it('normal adapter invocation excludes null availableAt', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'NULL_AVAIL_A', 'Null AvailableAt Ltd', 'IT', 'Software', 'INE000NAA01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_NAA', 'NULL_AVAIL_A', 'revenue_cr', 500, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'VERIFIED', '${PERSISTED_FETCHED_AT}', NULL)
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('NULL_AVAIL_A', db);
    expect(result.status).toBe('DATA_INSUFFICIENT');
    expect(result.result?.historicalSeries['Revenue']).toBeUndefined();
  });

  it('timestamp-less verified fact cannot yield VERIFIED analytical evidence', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'NOTS_CO', 'No Timestamp Co', 'IT', 'Software', 'INE000NOT01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt, reportedAt, asOfDate)
      VALUES ('CF_NOTS', 'NOTS_CO', 'revenue_cr', 500, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'VERIFIED', NULL, NULL, NULL, NULL)
    `).run();

    // Direct assessment
    const assessed = assessFactEligibility({
      factId: 'CF_NOTS',
      symbol: 'NOTS_CO',
      metric: 'revenue_cr',
      value: 500,
      periodType: 'ANNUAL',
      periodEnd: 'Mar 2025',
      scope: 'CONSOLIDATED',
      provider: 'UPSTOX_FUNDAMENTALS',
      verificationStatus: 'VERIFIED',
      fetchedAt: null,
      availableAt: null,
      reportedAt: null,
      asOfDate: null,
    });
    expect(assessed.eligibilityStatus).not.toBe('ELIGIBLE');

    // Adapter execution
    const result = await FundamentalModuleAdapter.getInstance().run('NOTS_CO', db);
    expect(result.status).toBe('DATA_INSUFFICIENT');
    expect(result.result?.historicalSeries['Revenue']).toBeUndefined();
    expect(result.evidenceRefs.some(e => e.notes?.includes('(VERIFIED)'))).toBe(false);
  });

  it('verified eligible facts are admitted and retain persisted provenance', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'GOOD_STS', 'Good Status Ltd', 'IT', 'Software', 'INE000GD001')`).run();
    // Insert two revenue entries for YoY calculation
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider,
        verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_G1', 'GOOD_STS', 'revenue_cr', 200, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS',
        'VERIFIED', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider,
        verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_G2', 'GOOD_STS', 'revenue_cr', 100, 'ANNUAL', 'Mar 2024', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS',
        'VERIFIED', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();

    const result = await FundamentalModuleAdapter.getInstance().run('GOOD_STS', db);
    // Eligible facts are processed — growth should show actual growth
    expect(result.result).toBeDefined();
    expect(result.status).not.toBe('DATA_INSUFFICIENT');
    const prov = result.evidenceRefs.find(e => e.evidenceId === 'CF_G1');
    expect(prov?.timestamp).toBe(PERSISTED_AVAILABLE_AT);
    expect(prov?.timestamp).not.toBe(result.evaluationTimestamp);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. FundamentalExperienceBuilder — direct metric reads use canonical selector
// ─────────────────────────────────────────────────────────────────────────────
describe('FundamentalExperienceBuilder — canonical selector for direct metrics', () => {

  it('D/E ratio fact with NULL verificationStatus is excluded; debtToEquity is DATA_INSUFFICIENT', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'DE_NULL', 'DE Null Ltd', 'Industrials', 'Machinery', 'INE000DEN01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus)
      VALUES ('CF_DE', 'DE_NULL', 'debt_to_equity', 1.5, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', NULL)
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('DE_NULL', db);
    expect(exp.financialStrength.debtToEquity.value).toBeNull();
    expect(exp.financialStrength.debtToEquity.status).toBe('DATA_INSUFFICIENT');
  });

  it('ICR fact with REJECTED verificationStatus is excluded; interestCoverage is DATA_INSUFFICIENT', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'ICR_REJ', 'ICR Rejected Ltd', 'Industrials', 'Steel', 'INE000ICR01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus)
      VALUES ('CF_ICR', 'ICR_REJ', 'interest_coverage', 10.0, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'REJECTED')
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('ICR_REJ', db);
    expect(exp.financialStrength.interestCoverage.value).toBeNull();
    expect(exp.financialStrength.interestCoverage.status).toBe('DATA_INSUFFICIENT');
  });

  it('verified D/E fact is admitted; value is used with DATA_INSUFFICIENT cleared', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'DE_OK', 'DE OK Ltd', 'Chemicals', 'Specialty', 'INE000DEO01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_DEV', 'DE_OK', 'debt_to_equity', 0.3, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'VERIFIED_PARTIAL', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('DE_OK', db);
    expect(exp.financialStrength.debtToEquity.value).toBe(0.3);
    expect(exp.financialStrength.debtToEquity.status).toBe('VERIFIED_PARTIAL');
  });

  it('PENDING_REVIEW fact is excluded; debtToEquity is DATA_INSUFFICIENT', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'DE_PEND', 'DE Pend Ltd', 'Industrials', 'Machinery', 'INE000DEP01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_PEND_DE', 'DE_PEND', 'debt_to_equity', 0.25, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'PENDING_REVIEW', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('DE_PEND', db);
    expect(exp.financialStrength.debtToEquity.value).toBeNull();
    expect(exp.financialStrength.debtToEquity.status).toBe('DATA_INSUFFICIENT');
  });

  it('normal builder invocation excludes null availableAt', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'NULL_AVAIL_B', 'Null Avail Builder Ltd', 'Industrials', 'Machinery', 'INE000NAB01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_NAB_DE', 'NULL_AVAIL_B', 'debt_to_equity', 0.35, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'VERIFIED', '${PERSISTED_FETCHED_AT}', NULL)
    `).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_NAB_REV', 'NULL_AVAIL_B', 'revenue_cr', 1000, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'VERIFIED', '${PERSISTED_FETCHED_AT}', NULL)
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('NULL_AVAIL_B', db);
    expect(exp.financialStrength.debtToEquity.value).toBeNull();
    expect(exp.financialStrength.debtToEquity.status).toBe('DATA_INSUFFICIENT');
    expect(exp.growthTrajectory.revenueLatestAnnual.value).toBeNull();
    expect(exp.growthTrajectory.revenueLatestAnnual.status).toBe('DATA_INSUFFICIENT');
    expect(exp.sourcesUsed.some(s => s.status === 'VERIFIED_CANONICAL')).toBe(false);
  });

  it('sourcesUsed excludes rejected and pending facts and never marks them VERIFIED_CANONICAL', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'REJ_SRC', 'Rejected Src Ltd', 'Metals', 'Steel', 'INE000REJ01')`).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt, sourceType)
      VALUES ('CF_REJ', 'REJ_SRC', 'revenue_cr', 100, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'BAD_PROVIDER', 'REJECTED', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}', 'bad_source')
    `).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt, sourceType)
      VALUES ('CF_PEND', 'REJ_SRC', 'pat_cr', 20, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'PEND_PROVIDER', 'PENDING_REVIEW', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}', 'pending_source')
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('REJ_SRC', db);
    const badSrc = exp.sourcesUsed.find(s => s.provider === 'BAD_PROVIDER');
    const pendSrc = exp.sourcesUsed.find(s => s.provider === 'PEND_PROVIDER');
    expect(badSrc).toBeUndefined();
    expect(pendSrc).toBeUndefined();
    expect(exp.sourcesUsed.some(s => s.status === 'VERIFIED_CANONICAL')).toBe(false);
  });

  it('CFO conflict check compares only like-for-like reporting periods and scopes', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'PERIOD_DIFF', 'Period Diff Ltd', 'Metals', 'Steel', 'INE000PDI01')`).run();
    // Two providers reporting CFO for DIFFERENT periods — should NOT be flagged as conflict
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_2024', 'PERIOD_DIFF', 'cfo_cr', 100, 'Mar 2024', 'CONSOLIDATED', 'PROVIDER_A', 'VERIFIED_PARTIAL', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_2025', 'PERIOD_DIFF', 'cfo_cr', 20, 'Mar 2025', 'CONSOLIDATED', 'PROVIDER_B', 'VERIFIED_PARTIAL', '${PERSISTED_FETCHED_AT}', '${PERSISTED_AVAILABLE_AT}')
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('PERIOD_DIFF', db);
    // Should NOT have CFO conflict because periods differ (Mar 2024 vs Mar 2025)
    expect(exp.cashFlowWorkingCapital.cfo.status).not.toBe('CONFLICTING');
    expect(exp.unresolvedConflicts.some(c => c.field === 'cash_flow_operating')).toBe(false);
  });

  it('pointInTime lookup filters facts missing availableAt or after PIT', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO MasterTickers VALUES (1, 'PIT_TEST', 'PIT Test Ltd', 'IT', 'Software', 'INE000PIT01')`).run();
    // Fact missing availableAt
    db.prepare(`
      INSERT INTO company_facts (factId, symbol, metric, value, periodType, periodEnd, scope, provider, verificationStatus, fetchedAt, availableAt)
      VALUES ('CF_NO_AVAIL', 'PIT_TEST', 'debt_to_equity', 0.4, 'ANNUAL', 'Mar 2025', 'CONSOLIDATED', 'UPSTOX_FUNDAMENTALS', 'VERIFIED', '${PERSISTED_FETCHED_AT}', NULL)
    `).run();

    const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('PIT_TEST', db, '2026-09-01T00:00:00Z');
    expect(exp.financialStrength.debtToEquity.value).toBeNull();
    expect(exp.financialStrength.debtToEquity.status).toBe('DATA_INSUFFICIENT');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. DB override & Real Production DB Immutability Test
// ─────────────────────────────────────────────────────────────────────────────
async function computeSha256(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) return 'ABSENT';
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('data', chunk => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
    rs.on('error', reject);
  });
}

describe('Real Production DB Immutability & Disposable Isolation', () => {
  // Resolve and record the real effective production DB path BEFORE any test override
  const REAL_PRODUCTION_DB_PATH = process.env.DATABASE_URL
    ? path.resolve(process.env.DATABASE_URL)
    : path.resolve(process.cwd(), 'portfolio.db');
  const REAL_WAL_PATH = `${REAL_PRODUCTION_DB_PATH}-wal`;
  const REAL_SHM_PATH = `${REAL_PRODUCTION_DB_PATH}-shm`;

  let baselineDbHash: string = '';
  let baselineWalHash: string = '';
  let baselineShmHash: string = '';

  beforeAll(async () => {
    baselineDbHash = await computeSha256(REAL_PRODUCTION_DB_PATH);
    baselineWalHash = await computeSha256(REAL_WAL_PATH);
    baselineShmHash = await computeSha256(REAL_SHM_PATH);
  }, 60000);

  it('FundamentalModuleAdapter overrideDb never touches effective production portfolio.db', async () => {
    const statBefore = fs.existsSync(REAL_PRODUCTION_DB_PATH) ? fs.statSync(REAL_PRODUCTION_DB_PATH) : null;

    // Run against a disposable in-memory DB
    const disposableDb = makeDb();
    disposableDb.prepare(`INSERT INTO MasterTickers VALUES (1, 'ISO_TEST', 'Isolation Test', 'IT', 'Software', 'INE000ISO01')`).run();

    await FundamentalModuleAdapter.getInstance().run('ISO_TEST', disposableDb);

    const statAfter = fs.existsSync(REAL_PRODUCTION_DB_PATH) ? fs.statSync(REAL_PRODUCTION_DB_PATH) : null;
    expect(statBefore?.mtimeMs).toBe(statAfter?.mtimeMs);
    expect(statBefore?.size).toBe(statAfter?.size);
  });

  it('FundamentalExperienceBuilder overrideDb never touches effective production portfolio.db', async () => {
    const statBefore = fs.existsSync(REAL_PRODUCTION_DB_PATH) ? fs.statSync(REAL_PRODUCTION_DB_PATH) : null;

    const disposableDb = makeDb();
    disposableDb.prepare(`INSERT INTO MasterTickers VALUES (1, 'ISO2', 'Isolation 2', 'Finance', 'Banks', 'INE000IS201')`).run();

    await FundamentalExperienceBuilder.getInstance().buildExperience('ISO2', disposableDb);

    const statAfter = fs.existsSync(REAL_PRODUCTION_DB_PATH) ? fs.statSync(REAL_PRODUCTION_DB_PATH) : null;
    expect(statBefore?.mtimeMs).toBe(statAfter?.mtimeMs);
    expect(statBefore?.size).toBe(statAfter?.size);
  });

  it('original production DB and sidecars remain byte-identical while disposable DB is used', async () => {
    if (!fs.existsSync(REAL_PRODUCTION_DB_PATH)) {
      expect(true).toBe(true);
      return;
    }

    const scratchDir = path.resolve(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    const disposableDbPath = path.resolve(
      scratchDir,
      `disposable_prod_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
    );
    const disposableWalPath = `${disposableDbPath}-wal`;
    const disposableShmPath = `${disposableDbPath}-shm`;

    // Copy original DB and sidecars to the uniquely named disposable path
    fs.copyFileSync(REAL_PRODUCTION_DB_PATH, disposableDbPath);
    if (fs.existsSync(REAL_WAL_PATH)) {
      fs.copyFileSync(REAL_WAL_PATH, disposableWalPath);
    }
    if (fs.existsSync(REAL_SHM_PATH)) {
      fs.copyFileSync(REAL_SHM_PATH, disposableShmPath);
    }

    const prevDbUrl = process.env.DATABASE_URL;
    const prevReadOnly = process.env.READ_ONLY_RUNTIME;

    try {
      await closeDB();
      process.env.DATABASE_URL = disposableDbPath;
      process.env.READ_ONLY_RUNTIME = 'true';

      // Execute adapter and builder through the disposable database (no overrideDb passed, uses getDB())
      const modRes = await FundamentalModuleAdapter.getInstance().run('TCS');
      expect(modRes).toBeDefined();

      const expRes = await FundamentalExperienceBuilder.getInstance().buildExperience('TCS');
      expect(expRes).toBeDefined();

      await closeDB();

      // Hash the original source production DB and sidecars after execution
      const postDbHash = await computeSha256(REAL_PRODUCTION_DB_PATH);
      const postWalHash = await computeSha256(REAL_WAL_PATH);
      const postShmHash = await computeSha256(REAL_SHM_PATH);

      expect(postDbHash).toBe(baselineDbHash);
      expect(postWalHash).toBe(baselineWalHash);
      expect(postShmHash).toBe(baselineShmHash);
    } finally {
      await closeDB();
      if (prevDbUrl !== undefined) {
        process.env.DATABASE_URL = prevDbUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      if (prevReadOnly !== undefined) {
        process.env.READ_ONLY_RUNTIME = prevReadOnly;
      } else {
        delete process.env.READ_ONLY_RUNTIME;
      }

      // Delete ONLY the uniquely named disposable copy after completion
      try { if (fs.existsSync(disposableDbPath)) fs.unlinkSync(disposableDbPath); } catch {}
      try { if (fs.existsSync(disposableWalPath)) fs.unlinkSync(disposableWalPath); } catch {}
      try { if (fs.existsSync(disposableShmPath)) fs.unlinkSync(disposableShmPath); } catch {}
    }
  }, 120000);

  it('portfolio.db and sidecars have same SHA-256 before and after all tests in this file', async () => {
    if (!fs.existsSync(REAL_PRODUCTION_DB_PATH)) {
      expect(true).toBe(true);
      return;
    }
    const currentDbHash = await computeSha256(REAL_PRODUCTION_DB_PATH);
    const currentWalHash = await computeSha256(REAL_WAL_PATH);
    const currentShmHash = await computeSha256(REAL_SHM_PATH);

    expect(currentDbHash).toBe(baselineDbHash);
    expect(currentWalHash).toBe(baselineWalHash);
    expect(currentShmHash).toBe(baselineShmHash);
  }, 60000);

});
