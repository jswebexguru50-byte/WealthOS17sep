import { describe, it, expect } from 'vitest';
import { PKScreenerParityEngine } from '../../../src/server/services/reference/pkscreener/PKScreenerParityEngine.js';

describe('V67 Track J — External Reference Parity Tests', () => {
  const engine = new PKScreenerParityEngine();

  it('25. PKScreener provenance: records provider, version, commit, and hashes', () => {
    const runId = 'RUN_TEST_PROVENANCE';
    const summaries = engine.runBenchmarkParity(runId);
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(s.strategyId).toBeDefined();
      expect(s.referenceCapabilityId).toBeDefined();
      expect(s.parityStatus).toBeDefined();
    }
  });

  it('26. PKScreener parity: validates parity across S1, S3, S5, S6, S7 breakout patterns', () => {
    const summaries = engine.runBenchmarkParity('RUN_TEST_PARITY');
    const matched = summaries.filter(s => s.parityStatus === 'MATCH');
    expect(matched.length).toBe(summaries.length);
  });
});
