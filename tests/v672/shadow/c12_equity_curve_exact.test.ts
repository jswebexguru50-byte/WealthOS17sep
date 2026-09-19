import { describe, it, expect } from 'vitest';
import { C12IndependentShadowReplayer } from '../../../src/server/services/research/C12IndependentShadowReplayer.js';

describe('V672 Track B — C12 Equity Curve Exact Comparison Tests', () => {
  const replayer = new C12IndependentShadowReplayer();

  it('asserts exact date-by-date session calendar match across all daily equity points', () => {
    const res = replayer.runIndependentReplay();
    expect(res.equityMatches).toBe(true);
    expect(res.maxEquityDelta).toBe(0);
    expect(res.producerEquityHash).toBe(res.shadowEquityHash);
  });
});
