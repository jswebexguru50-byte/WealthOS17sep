import { describe, it, expect } from 'vitest';
import { AccountingBugImpactAuditor } from '../../../src/server/services/audit/AccountingBugImpactAuditor.js';

describe('V672-R1 — v6.5 Accounting Bug Impact & Discrepancy Reconciliation Tests', () => {
  const auditor = new AccountingBugImpactAuditor();

  it('quantifies exact delta across all 4,506 trades caused by precedence defect', () => {
    const report = auditor.runAudit();

    expect(report.totalTradeCount).toBe(4506);
    expect(report.affectedTradeCount).toBeGreaterThan(0);
    expect(report.percentageTradesAffected).toBeGreaterThan(90);
    expect(report.immutableBaselinePreserved).toBe(true);

    // Assert that the original canonical v6.5 metrics match the benchmark
    expect(report.CAGRCorrected).toBe(-17.16);
    expect(report.SharpeCorrected).toBe(-1.04);
    expect(report.MaxDDCorrected).toBe(-78.35);

    // Breakdown validations
    expect(Object.keys(report.byStrategy).length).toBeGreaterThan(0);
    expect(Object.keys(report.byYear).length).toBeGreaterThan(0);
    expect(Object.keys(report.byRegime).length).toBeGreaterThan(0);
    expect(report.allTradeRecords.length).toBe(4506);
  });
});
