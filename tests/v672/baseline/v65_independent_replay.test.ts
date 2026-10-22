import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';

describe('V672 Track A — v6.5 Independent Replay Reproduction Tests', () => {
  const reproducer = new V65BaselineReproducer();

  it('reproduces canonical v6.5 baseline exactly from raw input files', () => {
    const result = reproducer.reproduceAndAssert();
    expect(result.exact).toBe(true);
    expect(result.validation.ledgerReconciliation.passed).toBe(true);
    expect(result.validation.independentReplayReproduction.passed).toBe(true);
    expect(result.validation.tradeIdentityEquality.passed).toBe(true);
    expect(result.validation.accountingEquality.passed).toBe(true);
    expect(result.validation.equityEquality.passed).toBe(true);
  });
});
