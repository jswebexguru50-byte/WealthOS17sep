import { describe, it, expect } from 'vitest';
import { BootstrapValidator } from '../../../src/server/services/research/BootstrapValidator.js';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';

describe('V672-R1 — Deterministic IID & Moving Block Bootstrap Tests', () => {
  const validator = new BootstrapValidator(1000, 42);
  const base = new V65BaselineReproducer().loadCanonicalBaseline();

  it('runs both IID and Moving Block bootstrap and asserts P(E > 0) > 95%', () => {
    const report = validator.runBootstrap(base.trades);

    expect(report.iidBootstrap.iterationsN).toBe(1000);
    expect(report.iidBootstrap.seed).toBe(42);
    expect(report.iidBootstrap.probabilityExpectancyPositive).toBeGreaterThan(0.95);
    expect(report.iidBootstrap.confidenceInterval95[0]).toBeGreaterThan(0);

    expect(report.blockBootstrap.iterationsN).toBe(1000);
    expect(report.blockBootstrap.seed).toBe(42);
    expect(report.blockBootstrap.blockSize).toBeGreaterThanOrEqual(10);
    expect(report.blockBootstrap.probabilityExpectancyPositive).toBeGreaterThan(0.95);
    expect(report.blockBootstrap.confidenceInterval95[0]).toBeGreaterThan(0);
  });
});
