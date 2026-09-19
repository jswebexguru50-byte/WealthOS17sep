import { describe, it, expect } from 'vitest';
import { C12ShadowReplayer } from '../../../src/server/services/research/C12ShadowReplayer.js';

describe('V67.1 C12 Shadow Replay & Independent Comparator Tests', () => {
  const replayer = new C12ShadowReplayer();

  it('1. C12 shadow replayer produces bit-for-bit identical ledger hash', () => {
    const comparison = replayer.runShadowReplayComparison();
    expect(comparison.hashesIdentical).toBe(true);
    expect(comparison.producerLedgerHash).toBe(comparison.shadowLedgerHash);
    expect(comparison.status).toBe('REPLAY_VERIFIED_IDENTICAL');
  });

  it('2. trade counts and daily equity points reconcile exactly', () => {
    const comparison = replayer.runShadowReplayComparison();
    expect(comparison.tradeCountMatched).toBe(true);
    expect(comparison.equityMatched).toBe(true);
    expect(comparison.drawdownMatched).toBe(true);
    expect(comparison.evidenceLevel).toBe('L3');
  });
});
