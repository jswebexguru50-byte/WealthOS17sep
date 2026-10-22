import { describe, it, expect } from 'vitest';
import { RedTeamAuditEngine } from '../../../src/server/services/audit/RedTeamAuditEngine.js';

describe('V67.1 Agent R — Red Team Adversarial Audit Tests', () => {
  const redTeam = new RedTeamAuditEngine();
  const summary = redTeam.executeRedTeamAudit();

  it('1. tests 20 vulnerability vectors independently', () => {
    expect(summary.totalAttacksTested).toBe(20);
    expect(summary.findings.length).toBe(20);
  });

  it('2. all 20 vulnerability vectors defended without breach', () => {
    expect(summary.overallStatus).toBe('RED_TEAM_DEFENDED');
    expect(summary.totalDefended).toBe(20);
    expect(summary.vulnerabilitiesDetected).toBe(0);
    expect(summary.evidenceLevel).toBe('L3');
  });

  it('3. critical vectors (lookahead, current-universe, missing losing trades, auditor dependency) pass invariants', () => {
    const criticals = summary.findings.filter(f => f.severity === 'CRITICAL');
    expect(criticals.length).toBeGreaterThan(0);
    for (const c of criticals) {
      expect(c.result).toBe('INVARIANT_HELD');
    }
  });
});
