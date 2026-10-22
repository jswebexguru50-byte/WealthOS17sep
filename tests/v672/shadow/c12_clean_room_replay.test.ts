import { describe, it, expect } from 'vitest';
import { C12IndependentShadowReplayer } from '../../../src/server/services/research/C12IndependentShadowReplayer.js';

describe('V672-R1 — C12 Clean-Room Shadow Replay Independence Tests', () => {
  const replayer = new C12IndependentShadowReplayer();

  it('independently reconstructs C12 trade stream and achieves exact bit-for-bit hash match', () => {
    const res = replayer.runIndependentReplay();
    expect(res.status).toBe('INDEPENDENT_REPLAY_VERIFIED');
    expect(res.ledgersMatch).toBe(true);
    expect(res.tradeCountMatch).toBe(true);
    expect(res.equityMatches).toBe(true);
    expect(res.maxEquityDelta).toBe(0);
    expect(res.producerLedgerHash).toBe(res.shadowLedgerHash);
  });
});
