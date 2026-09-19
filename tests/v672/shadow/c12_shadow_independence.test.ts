import { describe, it, expect } from 'vitest';
import { C12IndependentShadowReplayer } from '../../../src/server/services/research/C12IndependentShadowReplayer.js';

describe('V672 Track B — C12 Shadow Replay Independence Tests', () => {
  const replayer = new C12IndependentShadowReplayer();

  it('independently reconstructs C12 trade stream and matches producer ledger hash', () => {
    const res = replayer.runIndependentReplay();
    expect(res.status).toBe('INDEPENDENT_REPLAY_VERIFIED');
    expect(res.ledgersMatch).toBe(true);
    expect(res.tradeCountMatch).toBe(true);
    expect(res.totalProducerTrades).toBe(4506);
    expect(res.totalShadowTrades).toBe(4506);
    expect(res.shadowLedgerHash).toBe(res.producerLedgerHash);
  });
});
