/**
 * tests/unit/test_independent_dossier_audit.test.ts
 *
 * Vitest Test Suite for NRI WealthOS Independent Auditor on Master Dossier (49 Stocks).
 *
 * Test Assertions:
 * 1. Artifact & DB Integrity: All master files, databases, and schemas exist.
 * 2. Universe Size: Exactly 49 qualified equities.
 * 3. FERE v3.2.1 Cohort Architecture: 11 canonical files exist for each of the 49 equities (539 files).
 * 4. FERE SQLite Lineage: Database rows exist in dossier_cohort.db.
 * 5. FERE Alignment Parity: Scorecard grades and directives match with 0 divergence.
 * 6. Market Data & Technical Recency: Valid CMP, ATR, Trailing Stop-Loss, +2R/+3R/+4R targets.
 * 7. Forensic Accounting Safety: Altman Z > 1.81, Beneish M < -1.78, Piotroski F >= 5.
 * 8. Source Data Transparency: Items 6 to 12 links intact for all 49 stocks.
 * 9. Multi-Format Parity: 100% equivalence across JSON, Excel, and Markdown.
 * 10. Adverse Veto Hard Firewall: PAYTM and RBLBANK have 0.0% allocation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runIndependentDossierAudit, IndependentAuditReport } from '../../scripts/audit_dossier_independent_auditor.js';

describe('ITAS 49-Stock Master Dossier Independent Auditor & FERE Alignment Suite', () => {
  let report: IndependentAuditReport;

  beforeAll(async () => {
    report = await runIndependentDossierAudit();
  });

  it('verifies that the overall audit status is PASSED with 100% compliance', () => {
    expect(report.overallStatus).toBe('PASSED');
    expect(report.complianceRatePct).toBe(100);
    expect(report.failedChecks).toBe(0);
  });

  it('verifies artifact and database existence across all 7 essential files', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_01_ARTIFACT_INTEGRITY');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });

  it('verifies exactly 49 qualified equities in the master dossier universe', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_02_UNIVERSE_SIZE');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
    expect(report.dossierSummary.totalStocks).toBe(49);
  });

  it('verifies FERE canonical 11-file directory tree for all 49 stocks (539 canonical JSON files)', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_03_FERE_CANONICAL_DOSSIERS');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });

  it('verifies FERE SQLite database persistence in data/dossier_cohort/dossier_cohort.db', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_04_FERE_SQLITE_PERSISTENCE');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });

  it('verifies FERE decision alignment parity with zero active breakers and 100% Gate A validation', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_05_FERE_ALIGNMENT_PARITY');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
    expect(report.dossierSummary.gradeACount).toBe(4);
    expect(report.dossierSummary.gradeBCount).toBe(45);
    expect(report.dossierSummary.fullTargetSizingCount).toBe(4);
    expect(report.dossierSummary.normalSizingCount).toBe(45);
  });

  it('verifies market data recency and ascending +2R/+3R/+4R technical target progression', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_06_TECHNICAL_EXECUTION_RECENCY');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });

  it('verifies forensic accounting safety thresholds across all 49 equities', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_07_FORENSIC_SAFETY_THRESHOLDS');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });

  it('verifies full source data transparency with verified Items 6 to 12 document links', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_08_SOURCE_DATA_TRANSPARENCY');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });

  it('verifies tri-format parity across JSON, Excel worksheets, and Markdown Dossier', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_09_TRI_FORMAT_PARITY');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });

  it('verifies adverse veto hard firewall enforcement for PAYTM and RBLBANK', () => {
    const check = report.checks.find(c => c.checkId === 'CHK_10_ADVERSE_VETO_ENFORCEMENT');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
  });
});
