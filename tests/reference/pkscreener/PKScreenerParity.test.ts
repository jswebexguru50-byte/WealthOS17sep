import { describe, it, expect } from 'vitest';
import { PKScreenerParityEngine } from '../../../src/server/services/reference/pkscreener/PKScreenerParityEngine.js';
import { ReferenceParityEngine } from '../../../src/server/services/reference/ReferenceParityEngine.js';

describe('PKScreener Parity Engine', () => {
  it('correctly reports numerical match within specified tolerance', () => {
    const engine = ReferenceParityEngine.getInstance();
    const results = engine.compare({ vcpScore: 0.82 }, { vcpScore: 0.8205 }, { vcpScore: 0.001 });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('MATCH');
  });

  it('correctly reports mismatch when exceeding tolerance', () => {
    const engine = ReferenceParityEngine.getInstance();
    const results = engine.compare({ vcpScore: 0.82 }, { vcpScore: 0.825 }, { vcpScore: 0.001 });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('MISMATCH');
  });

  it('correctly handles REFERENCE_ONLY and UNSUPPORTED features', () => {
    const engine = ReferenceParityEngine.getInstance();
    const results = engine.compare({ onlyInWealthOS: 10 }, { onlyInRef: 20 });
    const refOnly = results.find(r => r.featureId === 'onlyInRef');
    const wealthOSOnly = results.find(r => r.featureId === 'onlyInWealthOS');

    expect(refOnly?.status).toBe('REFERENCE_ONLY');
    expect(wealthOSOnly?.status).toBe('UNSUPPORTED');
  });

  it('executes full benchmark parity across S1, S3, S5, S6, S7 strategies', () => {
    const parityEngine = new PKScreenerParityEngine();
    const summaries = parityEngine.runBenchmarkParity('TEST_RUN_PARITY');
    expect(summaries.length).toBeGreaterThanOrEqual(5);
    for (const s of summaries) {
      expect(s.parityStatus).toBe('MATCH');
    }
  });
});
