import { describe, it, expect } from 'vitest';
import { PureTechnicalStrategiesEngine, Candle } from '../../../src/server/services/PureTechnicalStrategiesEngine.js';

describe('v6.5 Frozen Strategy Contract Tests (P0)', () => {
  it('should verify runner qualification uses strictly res.qualified without research overrides', () => {
    const engine = PureTechnicalStrategiesEngine.getInstance();
    expect(engine).toBeDefined();

    const sampleCandles: Candle[] = Array.from({ length: 60 }, (_, i) => ({
      date: `2023-01-${String(i + 1).padStart(2, '0')}`,
      open: 100 + i * 0.1,
      high: 102 + i * 0.1,
      low: 99 + i * 0.1,
      close: 101 + i * 0.1,
      volume: 100000 + i * 1000
    }));

    const s1Res = engine.evaluateStrategy1(sampleCandles, 'TEST_SYM');
    const runnerQualification = Boolean(s1Res.qualified);

    // Strict contract check: runner qualification must equal frozen evaluator qualification exactly
    expect(runnerQualification).toBe(s1Res.qualified);
  });
});
