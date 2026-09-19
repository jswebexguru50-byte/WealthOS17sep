import { describe, it, expect } from 'vitest';
import { AdversarialAttackSuite } from '../../../src/server/services/audit/AdversarialAttackSuite.js';

describe('V672 Track I — Real Boundary Adversarial Attacks Tests', () => {
  const suite = new AdversarialAttackSuite();

  it('executes and defends all 9 real boundary attacks (Attacks A through Z)', () => {
    const attacks = suite.executeAllAttacks();
    expect(attacks.length).toBe(9);

    for (const a of attacks) {
      expect(a.attackDefended).toBe(true);
    }
  });
});
