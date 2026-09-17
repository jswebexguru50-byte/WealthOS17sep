import { describe, it, expect } from 'vitest';
import { NEoWaveEngine, OHLCVBar } from '../../src/server/quant/NEoWaveEngine.js';

describe('Elliott Wave & NEoWave Corrective Pullback Completion Engine', () => {
  const engine = NEoWaveEngine.getInstance();

  function makeBar(date: string, open: number, high: number, low: number, close: number, volume = 100000): OHLCVBar {
    return { date, open, high, low, close, volume };
  }

  it('1. Correctly detects a completed Zigzag A-B-C pullback with 0-B breakout and faster-time reversal', () => {
    // Generate synthetic price bars:
    // Wave 1: 100 -> 200 (10 bars)
    // Wave A: 200 -> 150 (6 bars)
    // Wave B: 150 -> 175 (5 bars, 50% retrace of A)
    // Wave C: 175 -> 130 (7 bars, 0.9x of A, golden pocket of 100-200)
    // Reversal Thrust: 130 -> 180 (3 bars, faster than Wave C duration)
    const bars: OHLCVBar[] = [];
    let d = 1;
    const addBars = (start: number, end: number, count: number) => {
      const step = (end - start) / count;
      for (let i = 0; i < count; i++) {
        const val = start + step * (i + 1);
        bars.push(makeBar(`2026-08-${String(d++).padStart(2, '0')}`, val - 1, val + 2, val - 2, val));
      }
    };

    // Prior impulse 100 -> 200 (10 bars)
    addBars(100, 200, 10);
    // Wave A: 200 -> 150 (6 bars)
    addBars(200, 150, 6);
    // Wave B: 150 -> 175 (5 bars)
    addBars(150, 175, 5);
    // Wave C: 175 -> 130 (7 bars)
    addBars(175, 130, 7);
    // Reversal Thrust: 130 -> 182 (3 bars)
    addBars(130, 182, 3);

    const indicator = engine.detectCorrectivePatternCompletion(bars, undefined, 'TEST_ZIGZAG');

    expect(indicator.isCompleted).toBe(true);
    expect(['CONFIRMED_COMPLETED', 'EARLY_REVERSAL']).toContain(indicator.completionStatus);
    expect(['ZIGZAG_ABC', 'WAVE_2_GOLDEN_POCKET']).toContain(indicator.correctivePatternType);
    expect(indicator.confidenceScore).toBeGreaterThanOrEqual(75);
    expect(indicator.confirmationGates.zeroBLineBroken).toBe(true);
    expect(indicator.confirmationGates.goldenPocketSupportHeld).toBe(true);
    expect(indicator.invalidationLevel).toBeLessThanOrEqual(135);
    expect(indicator.target1Upside).toBeGreaterThan(180);
    expect(indicator.riskRewardRatio).toBeGreaterThan(0.5);
  });

  it('2. Correctly detects Wave (2) Golden Pocket Pullback (50-61.8% Retracement)', () => {
    const bars: OHLCVBar[] = [];
    let d = 1;
    const addBars = (start: number, end: number, count: number) => {
      const step = (end - start) / count;
      for (let i = 0; i < count; i++) {
        const val = start + step * (i + 1);
        bars.push(makeBar(`2026-08-${String(d++).padStart(2, '0')}`, val - 2, val + 3, val - 3, val));
      }
    };

    // Wave 1: 1000 -> 1600 (10 bars, gain = 600)
    addBars(1000, 1600, 10);
    // Wave A: 1600 -> 1350 (6 bars)
    addBars(1600, 1350, 6);
    // Wave B: 1350 -> 1480 (5 bars)
    addBars(1350, 1480, 5);
    // Wave C: 1480 -> 1250 (7 bars, 1250 is ~58% retracement of 600 point Wave 1)
    addBars(1480, 1250, 7);
    // Reversal kickoff: 1250 -> 1520 (4 bars)
    addBars(1250, 1520, 4);

    const indicator = engine.detectCorrectivePatternCompletion(bars, undefined, 'WAVE2_STOCK');

    expect(indicator.isCompleted).toBe(true);
    expect(indicator.correctivePatternType).toBe('WAVE_2_GOLDEN_POCKET');
    expect(indicator.confirmationGates.goldenPocketSupportHeld).toBe(true);
    expect(indicator.invalidationLevel).toBeLessThanOrEqual(1260);
    expect(indicator.invalidationLevel).toBeGreaterThan(1000); // Strictly above Wave 1 origin
  });

  it('3. Correctly detects Wave (4) Alternation Shallow Pullback holding above Wave 1 apex', () => {
    const bars: OHLCVBar[] = [];
    let d = 1;
    const addBars = (start: number, end: number, count: number) => {
      const step = (end - start) / count;
      for (let i = 0; i < count; i++) {
        const val = start + step * (i + 1);
        bars.push(makeBar(`2026-08-${String(d++).padStart(2, '0')}`, val - 2, val + 3, val - 3, val));
      }
    };

    // Wave 1 apex at 500 (100 -> 500)
    // Wave 3 thrust: 400 -> 1200 (length 800)
    addBars(400, 1200, 10);
    // Wave A of 4: 1200 -> 1020 (6 bars)
    addBars(1200, 1020, 6);
    // Wave B of 4: 1020 -> 1120 (5 bars)
    addBars(1020, 1120, 5);
    // Wave C of 4: 1120 -> 980 (7 bars, shallow pullback ~27.5% of Wave 3, holding well above 500)
    addBars(1120, 980, 7);
    // Wave 5 Kickoff: 980 -> 1150 (3 bars)
    addBars(980, 1150, 3);

    const indicator = engine.detectCorrectivePatternCompletion(bars, undefined, 'WAVE4_STOCK');

    expect(indicator.isCompleted).toBe(true);
    expect(indicator.correctivePatternType).toBe('WAVE_4_ALTERNATION');
    expect(indicator.confirmationGates.ruleOfAlternationValid).toBe(true);
    expect(indicator.invalidationLevel).toBeGreaterThanOrEqual(500); // No overlap with Wave 1 apex
  });

  it('4. Marks pattern as INVALIDATED when price violates structural base', () => {
    const bars: OHLCVBar[] = [];
    let d = 1;
    const addBars = (start: number, end: number, count: number) => {
      const step = (end - start) / count;
      for (let i = 0; i < count; i++) {
        const val = start + step * (i + 1);
        bars.push(makeBar(`2026-08-${String(d++).padStart(2, '0')}`, val - 1, val + 1, val - 1, val));
      }
    };

    // Prior impulse: 100 -> 200
    addBars(100, 200, 10);
    // Wave A: 200 -> 150
    addBars(200, 150, 5);
    // Wave B: 150 -> 170
    addBars(150, 170, 4);
    // Catastrophic Wave C breakdown breaching origin: 170 -> 75 (below 100)
    addBars(170, 75, 8);

    const indicator = engine.detectCorrectivePatternCompletion(bars, undefined, 'BROKEN_STOCK');

    expect(indicator.isCompleted).toBe(false);
    expect(indicator.completionStatus).toBe('INVALIDATED');
    expect(indicator.confidenceScore).toBeLessThanOrEqual(25);
  });

  it('5. Marks pattern as DEVELOPING when Wave C is ongoing and 0-B trendline is unbroken', () => {
    const bars: OHLCVBar[] = [];
    let d = 1;
    const addBars = (start: number, end: number, count: number) => {
      const step = (end - start) / count;
      for (let i = 0; i < count; i++) {
        const val = start + step * (i + 1);
        bars.push(makeBar(`2026-08-${String(d++).padStart(2, '0')}`, val - 1, val + 1, val - 1, val));
      }
    };

    // Prior impulse: 100 -> 200
    addBars(100, 200, 10);
    // Wave A: 200 -> 160
    addBars(200, 160, 5);
    // Wave B: 160 -> 185
    addBars(160, 185, 4);
    // Wave C actively falling: 185 -> 145 (no reversal bounce)
    addBars(185, 145, 6);

    const indicator = engine.detectCorrectivePatternCompletion(bars, undefined, 'FALLING_STOCK');

    expect(indicator.isCompleted).toBe(false);
    expect(indicator.completionStatus).toBe('DEVELOPING');
    expect(indicator.confirmationGates.zeroBLineBroken).toBe(false);
  });

  it('6. Seamlessly surfaces correctiveIndicator inside analyzeNEoWave()', () => {
    const bars: OHLCVBar[] = [];
    let d = 1;
    const addBars = (start: number, end: number, count: number) => {
      const step = (end - start) / count;
      for (let i = 0; i < count; i++) {
        const val = start + step * (i + 1);
        bars.push(makeBar(`2026-08-${String(d++).padStart(2, '0')}`, val - 1, val + 2, val - 2, val));
      }
    };

    // Zigzag setup
    addBars(100, 200, 10);
    addBars(200, 150, 6);
    addBars(150, 175, 5);
    addBars(175, 130, 7);
    addBars(130, 182, 3);

    const analysis = engine.analyzeNEoWave('TATATECH', bars);

    expect(analysis.correctiveIndicator).toBeDefined();
    expect(analysis.correctiveIndicator?.isCompleted).toBe(true);
    expect(analysis.currentPattern).toBe('CORRECTION_WAVE_C_COMPLETION');
    expect(analysis.wavePivots.some(p => p.label === '(C)')).toBe(true);
  });
});
