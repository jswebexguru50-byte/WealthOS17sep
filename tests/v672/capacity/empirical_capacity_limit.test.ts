import { describe, it, expect } from 'vitest';
import { CapacityCurveEngine } from '../../../src/server/services/research/CapacityCurveEngine.js';

describe('V672-R1 — Empirical Capacity Limit & Unvalidated Tier Boundary Tests', () => {
  const engine = new CapacityCurveEngine();

  it('strictly limits validated capacity to <= ₹10 Crore and marks higher tiers MODELED_UNVALIDATED', () => {
    const report = engine.evaluateCapacity();

    expect(report.validatedCapacityMaxINR).toBe(100000000);
    expect(report.validatedCapacityLabel).toBe('₹10 Crore');

    const validatedTiers = report.tiers.filter(t => t.validationStatus === 'VALIDATED');
    const unvalidatedTiers = report.tiers.filter(t => t.validationStatus === 'MODELED_UNVALIDATED');

    expect(validatedTiers.length).toBe(4); // 1Cr, 2Cr, 5Cr, 10Cr
    expect(unvalidatedTiers.length).toBe(3); // 25Cr, 50Cr, 100Cr

    for (const t of validatedTiers) {
      expect(t.aumINR).toBeLessThanOrEqual(100000000);
      expect(t.advParticipationRate).toBeLessThanOrEqual(0.025);
    }

    for (const t of unvalidatedTiers) {
      expect(t.aumINR).toBeGreaterThan(100000000);
      expect(t.validationStatus).toBe('MODELED_UNVALIDATED');
    }
  });
});
