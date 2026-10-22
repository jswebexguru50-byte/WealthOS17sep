import { describe, it, expect } from 'vitest';
import { CapacityCurveEngine } from '../../../src/server/services/research/CapacityCurveEngine.js';

describe('V672 Track G — Capital Capacity Actual Reproduction Tests', () => {
  const engine = new CapacityCurveEngine();

  it('verifies validated capacity up to ₹10 Crore and marks higher tiers MODELED_UNVALIDATED', () => {
    const report = engine.evaluateCapacity();

    expect(report.validatedCapacityMaxINR).toBe(100000000);
    expect(report.validatedCapacityLabel).toBe('₹10 Crore');

    const tier10Cr = report.tiers.find(t => t.aumLabel === '₹10 Crore')!;
    expect(tier10Cr.validationStatus).toBe('VALIDATED');
    expect(tier10Cr.advParticipationRate).toBeLessThan(0.05);

    const tier100Cr = report.tiers.find(t => t.aumLabel === '₹100 Crore')!;
    expect(tier100Cr.validationStatus).toBe('MODELED_UNVALIDATED');
  });
});
