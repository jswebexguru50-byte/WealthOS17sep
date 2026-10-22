import { describe, it, expect } from 'vitest';
import { AdversarialAttackSuite } from '../../../src/server/services/audit/AdversarialAttackSuite.js';

describe('V672 Track H — Attack Z Hardcoded Evidence Rejection Tests', () => {
  const suite = new AdversarialAttackSuite();

  it('rejects falsified financial metrics injected into evidence artifacts as EVIDENCE_MISMATCH', () => {
    const result = suite.attackZ_HardcodedGateEvidence();
    expect(result.attackDefended).toBe(true);
    expect(result.actualOutcome).toBe('EVIDENCE_MISMATCH');
  });
});
