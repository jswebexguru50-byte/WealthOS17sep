import { describe, it, expect } from 'vitest';
import { BenjaminiHochbergValidator } from '../../../src/server/services/research/BenjaminiHochbergValidator.js';

describe('V672 Track E — Benjamini-Hochberg FDR Validation Tests', () => {
  const validator = new BenjaminiHochbergValidator(80, 0.05);

  it('correctly calculates step-up q-values and asserts C12 statistical significance across m=80 hypotheses', () => {
    const family = Array.from({ length: 80 }, (_, i) => ({
      hypothesisFamilyId: 'TEST_FAMILY',
      hypothesisId: `H_${i + 1}`,
      configurationId: i === 0 ? 'C12' : `C_${i + 1}`,
      testStatistic: i === 0 ? 4.5 : 1.2,
      rawPValue: i === 0 ? 0.0001 : +(0.001 + (i * 0.01)).toFixed(4),
      status: 'EVALUATED' as const
    }));

    const report = validator.validateFamily('TEST_FAMILY', family);
    expect(report.totalHypothesesM).toBe(80);
    expect(report.c12Significant).toBe(true);
    expect(report.c12AdjustedQValue).toBeLessThan(0.05);
    expect(report.discoveryCount).toBeGreaterThan(0);
  });
});
