import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { BootstrapValidator } from '../../../src/server/services/research/BootstrapValidator.js';

describe('V672 Track G — Bootstrap Uncertainty Actual Reproduction Tests', () => {
  const base = new V65BaselineReproducer().loadCanonicalBaseline();
  const validator = new BootstrapValidator(500, 42); // 500 iterations for fast test suite execution

  it('runs deterministic IID and moving block bootstrap', () => {
    const report = validator.runBootstrap(base.trades);

    expect(report.iidBootstrap.iterationsN).toBe(500);
    expect(report.blockBootstrap.iterationsN).toBe(500);
    expect(report.blockBootstrap.blockSize).toBe(20);
    expect(report.blockBootstrap.probabilityExpectancyPositive).toBeGreaterThan(0.90);
    expect(report.blockBootstrap.confidenceInterval95[0]).toBeLessThan(report.blockBootstrap.confidenceInterval95[1]);
  });
});
