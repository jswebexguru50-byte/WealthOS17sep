import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { ClaimLedgerService } from '../../src/server/intelligence/services/ClaimLedgerService.js';
import { ManagementClaim } from '../../src/server/intelligence/types/ManagementClaim.js';

describe('Phase 1B: Claim Ledger & Credibility Scorecard Lifecycle', () => {
  let db: sqlite3.Database;
  let service: ClaimLedgerService;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    service = new ClaimLedgerService(db);

    await new Promise<void>((resolve, reject) => {
      db.run(`
        CREATE TABLE ManagementClaims (
          claim_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          issuer_bse_code TEXT,
          period TEXT NOT NULL,
          category TEXT NOT NULL,
          statement TEXT NOT NULL,
          target_metric TEXT,
          baseline_value REAL,
          expected_value REAL,
          expected_outcome TEXT,
          expected_timeframe TEXT,
          evidence_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          actual_outcome_metric REAL,
          actual_outcome_description TEXT,
          resolution_evidence_id TEXT,
          resolved_at TEXT,
          claim_date TEXT,
          expected_period_start TEXT,
          expected_period_end TEXT,
          evaluation_date TEXT,
          evaluation_basis TEXT,
          evaluation_evidence_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('correctly records an open claim with evidence lineage and temporal bounds', async () => {
    const claim: Omit<ManagementClaim, 'createdAt'> = {
      claimId: 'CLM_SOLAR_001',
      issuerNseSymbol: 'SOLARINDS',
      period: 'FY24',
      category: 'CAPACITY',
      statement: 'Defense ammunition capacity to expand from 10,000 to 25,000 units by Q4-FY25.',
      targetMetric: 'CAPACITY_UNITS',
      baselineValue: 10000,
      expectedValue: 25000,
      expectedOutcome: '+150% ammunition capacity',
      expectedTimeframe: 'Q4-FY25',
      claimDate: '2024-05-15',
      expectedPeriodStart: '2024-04-01',
      expectedPeriodEnd: '2025-03-31',
      evidenceId: 'EV_DOC_SOLAR_AR24_P42',
      status: 'OPEN'
    };

    await service.recordClaim(claim);
    const claims = await service.getClaimsForIssuer('SOLARINDS');

    expect(claims).toHaveLength(1);
    expect(claims[0].claimId).toBe('CLM_SOLAR_001');
    expect(claims[0].status).toBe('OPEN');
    expect(claims[0].expectedValue).toBe(25000);
    expect(claims[0].expectedPeriodEnd).toBe('2025-03-31');
  });

  it('correctly transitions claim to ACHIEVED and computes STRONG credibility', async () => {
    // 1. First claim achieved
    await service.recordClaim({
      claimId: 'CLM_TCS_001',
      issuerNseSymbol: 'TCS',
      period: 'FY24-Q1',
      category: 'MARGIN',
      statement: 'Operating margins to hold above 25% for full year.',
      evidenceId: 'EV_TCS_01',
      status: 'OPEN'
    });
    await service.resolveClaim(
      'CLM_TCS_001',
      26.0,
      'Full year operating margin reached 26.2%',
      'EV_TCS_RES_01',
      'ACHIEVED'
    );

    // 2. Second claim achieved
    await service.recordClaim({
      claimId: 'CLM_TCS_002',
      issuerNseSymbol: 'TCS',
      period: 'FY24-Q2',
      category: 'GROWTH',
      statement: 'TCV deal bookings to exceed $10 Billion per quarter.',
      evidenceId: 'EV_TCS_02',
      status: 'OPEN'
    });
    await service.resolveClaim(
      'CLM_TCS_002',
      12.2,
      'Quarterly TCV bookings reached $12.2 Billion',
      'EV_TCS_RES_02',
      'ACHIEVED'
    );

    const scorecard = await service.getCredibilityScorecard('TCS');

    expect(scorecard.totalClaims).toBe(2);
    expect(scorecard.achievedCount).toBe(2);
    expect(scorecard.missedCount).toBe(0);
    expect(scorecard.grade).toBe('STRONG');
  });

  it('correctly flags MISSED claims and drops credibility to WEAK/MIXED', async () => {
    // 1. First claim missed
    await service.recordClaim({
      claimId: 'CLM_TEST_001',
      issuerNseSymbol: 'TESTCORP',
      period: 'FY24',
      category: 'DEBT',
      statement: 'Net debt will be reduced to zero by end of fiscal year.',
      evidenceId: 'EV_01',
      status: 'OPEN',
      expectedPeriodEnd: '2024-03-31'
    });
    await service.resolveClaim(
      'CLM_TEST_001',
      1500,
      'Net debt increased from ₹1,200 Cr to ₹1,500 Cr',
      'EV_RES_01',
      'MISSED',
      '2024-05-15'
    );

    // 2. Second claim missed
    await service.recordClaim({
      claimId: 'CLM_TEST_002',
      issuerNseSymbol: 'TESTCORP',
      period: 'FY24',
      category: 'MARGIN',
      statement: 'EBITDA margin expected at 20%',
      evidenceId: 'EV_02',
      status: 'OPEN',
      expectedPeriodEnd: '2024-03-31'
    });
    await service.resolveClaim(
      'CLM_TEST_002',
      11.5,
      'EBITDA margin collapsed to 11.5%',
      'EV_RES_02',
      'MISSED',
      '2024-05-15'
    );

    const scorecard = await service.getCredibilityScorecard('TESTCORP');

    expect(scorecard.missedCount).toBe(2);
    expect(scorecard.grade).toBe('WEAK');
  });

  it('enforces temporal constraint: rejects marking claim MISSED before expectedPeriodEnd', async () => {
    await service.recordClaim({
      claimId: 'CLM_FUTURE_001',
      issuerNseSymbol: 'FUTURE',
      period: 'FY25',
      category: 'GROWTH',
      statement: 'Targeting 20% export growth by FY26.',
      expectedPeriodEnd: '2026-03-31',
      evidenceId: 'EV_FUTURE_01',
      status: 'OPEN'
    });

    // Attempt premature resolution in 2024
    await expect(
      service.resolveClaim(
        'CLM_FUTURE_001',
        null,
        'Export growth lagging in early quarters',
        'EV_EARLY_NOTE',
        'MISSED',
        '2024-09-15'
      )
    ).rejects.toThrow(/before expected period end/);
  });

  it('returns INSUFFICIENT_HISTORY when claims evaluated are less than threshold', async () => {
    await service.recordClaim({
      claimId: 'CLM_SOLO_001',
      issuerNseSymbol: 'SOLO',
      period: 'FY24',
      category: 'GROWTH',
      statement: 'Targeting 15% revenue growth.',
      evidenceId: 'EV_01',
      status: 'OPEN'
    });

    const scorecard = await service.getCredibilityScorecard('SOLO');
    expect(scorecard.grade).toBe('INSUFFICIENT_HISTORY');
  });
});
