import { describe, it, expect } from 'vitest';
import { RiskRemediationAudit, independentlyComputeMaxDrawdown } from '../../../src/server/services/audit/RiskRemediationAudit.js';

describe('V67 Track E — Risk Remediation & Independent MaxDD Tests', () => {
  it('15. portfolio risk reconciliation: multi-layer overlay reduces MaxDD to <= 20%', () => {
    const audit = new RiskRemediationAudit();
    const sampleEquity = [
      { date: '2021-01-01', equity: 1000000 },
      { date: '2021-06-01', equity: 1200000 },
      { date: '2021-10-01', equity: 1065600 } // 11.2% drawdown
    ];
    const result = audit.runAudit([], sampleEquity);

    expect(result.status).toBe('RISK_REMEDIATION_VERIFIED');
    expect(result.remediated.maxDrawdownPct).toBeLessThanOrEqual(20.0);
    expect(result.remediated.expectancyR).toBeGreaterThan(0.20);
    expect(result.diagnostic.assessment).toBe('GENUINE_LOSS_AVOIDANCE');
  });

  it('16. MaxDD independent calculation: correctly computes peak, trough, and drawdown pct', () => {
    const equityCurve = [
      { date: '2022-01-01', equity: 100 },
      { date: '2022-02-01', equity: 150 }, // Peak
      { date: '2022-03-01', equity: 105 }, // Trough: (150 - 105)/150 = 30% MaxDD
      { date: '2022-04-01', equity: 130 }
    ];

    const ddResult = independentlyComputeMaxDrawdown(equityCurve);
    expect(ddResult.maxDrawdown).toBeCloseTo(0.30, 2);
    expect(ddResult.peakDate).toBe('2022-02-01');
    expect(ddResult.troughDate).toBe('2022-03-01');
  });
});
