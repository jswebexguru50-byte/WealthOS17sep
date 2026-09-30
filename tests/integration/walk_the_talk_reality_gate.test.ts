/**
 * walk_the_talk_reality_gate.test.ts — Walk-the-Talk Retrospective Reality Gate
 *
 * Verifies that the Walk-the-Talk governance evaluation:
 * 1. Derives all retrospective outcomes strictly from database records (management_commitments,
 *    source_documents, company_facts).
 * 2. Evaluates >= 5 companies and >= 10 retrospective commitments.
 * 3. Enforces 0 PENDING records and 100% source and evidence verification.
 * 4. Yields a genuine distribution containing at least 1 MET and at least 1 MISSED or PARTIALLY_MET.
 * 5. Passes strict anti-hardcoding assertions (no hardcoded cohort fixtures, no runtime DB mutations).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildWalkTheTalkRealityReport,
  type RealityTestReport
} from '../../scripts/readiness/walkTheTalkRealityEngine.js';

describe('Walk-the-Talk Retrospective Reality Gate', () => {
  it('derives retrospective outcomes from stored evidence without runtime mutations', async () => {
    const report: RealityTestReport = await buildWalkTheTalkRealityReport({
      symbols: ['DYCL', 'TCS', 'RELIANCE', 'HDFCBANK', 'BEL']
    });

    // Invariant: >= 5 companies evaluated
    expect(report.companiesEvaluated).toBeGreaterThanOrEqual(5);

    // Invariant: >= 10 retrospective commitments evaluated
    expect(report.totalCommitments).toBeGreaterThanOrEqual(10);

    // Invariant: 0 PENDING records
    expect(report.pendingObservations).toBe(0);

    // Invariant: 100% source and evidence verification with valid deterministic classifications
    for (const c of report.commitments) {
      expect(c.sourceVerified).toBe(true);
      expect(c.evidenceVerified).toBe(true);
      expect(c.sourceExcerpt.length).toBeGreaterThan(0);
      expect(c.statementDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(c.evidenceDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(c.actualValue).not.toBeNull();
      expect(typeof c.actualValue).toBe('number');
      expect(c.comparisonRule.length).toBeGreaterThan(0);
      expect(['MET', 'PARTIALLY_MET', 'MISSED', 'NOT_MEASURABLE']).toContain(c.status);
    }
  });

  it('demonstrates varied real-world distribution (at least 1 MET, at least 1 MISSED or PARTIALLY_MET)', async () => {
    const report: RealityTestReport = await buildWalkTheTalkRealityReport({
      symbols: ['DYCL', 'TCS', 'RELIANCE', 'HDFCBANK', 'BEL']
    });

    expect(report.statusBreakdown.MET).toBeGreaterThanOrEqual(1);
    expect(report.statusBreakdown.MISSED + report.statusBreakdown.PARTIALLY_MET).toBeGreaterThanOrEqual(1);
  });

  it('verifies anti-hardcoding compliance across reality test modules', () => {
    const runnerPath = path.resolve('scripts', 'readiness', 'run_walk_the_talk_reality_test.ts');
    const enginePath = path.resolve('scripts', 'readiness', 'walkTheTalkRealityEngine.ts');

    const runnerCode = fs.readFileSync(runnerPath, 'utf-8');
    const engineCode = fs.readFileSync(enginePath, 'utf-8');

    // Runner must NOT define REALITY_TEST_COHORT
    expect(runnerCode).not.toMatch(/export\s+const\s+REALITY_TEST_COHORT/);
    expect(runnerCode).not.toMatch(/const\s+REALITY_TEST_COHORT\s*=/);

    // Runner must NOT execute mutations
    expect(runnerCode).not.toMatch(/DELETE\s+FROM/i);
    expect(runnerCode).not.toMatch(/INSERT\s+INTO/i);
    expect(runnerCode).not.toMatch(/UPDATE\s+[a-z_]+\s+SET/i);

    // Engine must NOT define REALITY_TEST_COHORT or hardcoded status arrays
    expect(engineCode).not.toMatch(/REALITY_TEST_COHORT/);
    expect(engineCode).not.toMatch(/DELETE\s+FROM/i);
    expect(engineCode).not.toMatch(/INSERT\s+INTO/i);
    expect(engineCode).not.toMatch(/UPDATE\s+[a-z_]+\s+SET/i);
  });
});
