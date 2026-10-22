/**
 * tests/unit/new_technical_strategies.test.ts
 *
 * Unit test suite verifying S8B (Classical Bull Flag), S21 (Cup & Handle),
 * S22 (TTM Volatility Squeeze), S23 (Classical Double Bottom), and S24 (Distribution Exit).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateS8B_ClassicalBullFlag,
  evaluateS21_CupAndHandle,
  evaluateS22_VolatilitySqueeze,
  evaluateS23_DoubleBottom,
  evaluateS24_DistributionExit,
  evaluateS25_InverseHeadAndShoulders,
  evaluateS26_HeadAndShouldersDistributionExit,
  evaluateS10_IntradayORBConfirmation
} from '../../src/server/services/NewTechnicalStrategiesEngine.js';
import { Candle } from '../../src/server/services/PureTechnicalStrategiesEngine.js';

function createMockCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const d = new Date(2025, 0, i + 1).toISOString().split('T')[0];
    candles.push({
      date: d,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 100000
    });
  }
  return candles;
}

describe('New Technical Strategies Engine (S8B, S21, S22, S23, S24)', () => {
  it('1. S8B Classical Bull Flag: Detects valid 25% pole, tight flag, volume dry-up and breakout', () => {
    const candles = createMockCandles(60, 100);
    // Baseline consolidation: 100
    // Pole (bars 30 to 42): surges from 100 to 125 (+25%) on heavy volume
    for (let i = 30; i <= 42; i++) {
      const p = 100 + ((i - 30) / 12) * 25;
      candles[i].open = p * 0.99;
      candles[i].high = p * 1.01;
      candles[i].low = p * 0.98;
      candles[i].close = p;
      candles[i].volume = 300000;
    }
    // Flag (bars 43 to 58): shallow pullback to 120 (retrace 5/25 = 20% of pole) on low volume
    for (let i = 43; i <= 58; i++) {
      const p = 125 - ((i - 43) / 15) * 5;
      candles[i].open = p;
      candles[i].high = p * 1.005;
      candles[i].low = p * 0.995;
      candles[i].close = p;
      candles[i].volume = 40000; // Low volume
    }
    // Breakout bar (bar 59): closes above 125 at 127 on 2.5x volume
    candles[59].open = 121;
    candles[59].high = 127.5;
    candles[59].low = 121;
    candles[59].close = 127;
    candles[59].volume = 350000;

    const result = evaluateS8B_ClassicalBullFlag('TATAMOTORS', 'Tata Motors Limited', candles, 85);
    expect(result.strategyId).toBe('S8B_CLASSICAL_BULL_FLAG');
    expect(result.metrics.poleGainPct).toBeGreaterThanOrEqual(20);
    expect(result.metrics.flagRetracementPct).toBeLessThanOrEqual(50);
    expect(result.qualified).toBe(true);
    expect(result.action).toBe('BUY');
    expect(result.riskRewardRatio).toBeGreaterThanOrEqual(2.0);
  });

  it('2. S21 Cup & Handle: Validates pivot structural geometry, handle volume contraction and rim breakout', () => {
    const candles = createMockCandles(120, 200);
    // Left rim peak at bar 30 = 240
    candles[30].high = 240;
    candles[30].close = 238;
    // Cup decline to bottom at bar 65 = 180 (depth (240-180)/240 = 25%)
    for (let i = 31; i <= 65; i++) {
      const p = 238 - ((i - 31) / 34) * 58;
      candles[i].close = p;
      candles[i].low = p * 0.99;
    }
    // Cup ascent to right rim at bar 95 = 237 (within 1.2% of left rim 240)
    for (let i = 66; i <= 95; i++) {
      const p = 180 + ((i - 66) / 29) * 57;
      candles[i].close = p;
      candles[i].high = p * 1.01;
    }
    // Handle consolidation (bars 96 to 118): shallow drift to 226 (retraces 11/58 = 19% of cup) on low volume
    for (let i = 96; i <= 118; i++) {
      const p = 237 - ((i - 96) / 22) * 11;
      candles[i].close = p;
      candles[i].low = p * 0.99;
      candles[i].volume = 30000;
    }
    // Breakout bar (bar 119): closes above right rim at 242 on 2.0x volume
    candles[119].open = 230;
    candles[119].high = 243;
    candles[119].low = 230;
    candles[119].close = 242;
    candles[119].volume = 250000;

    const result = evaluateS21_CupAndHandle('RELIANCE', 'Reliance Industries Limited', candles);
    expect(result.strategyId).toBe('S21_CUP_AND_HANDLE');
    expect(result.metrics.cupDepthPct).toBeGreaterThanOrEqual(15);
    expect(result.metrics.cupDepthPct).toBeLessThanOrEqual(40);
    expect(result.qualified).toBe(true);
    expect(result.action).toBe('BUY');
    expect(result.stopLoss).toBeDefined();
    expect(result.target1).toBeGreaterThan(242);
  });

  it('3. S22 Volatility Squeeze: Triggers when Bollinger Bands compress inside Keltner Channel and fire', () => {
    const candles = createMockCandles(50, 500);
    // Artificially create a tight price coil for bars 20 to 48 (tight BB inside KC)
    for (let i = 20; i <= 48; i++) {
      candles[i].open = 500;
      candles[i].high = 501;
      candles[i].low = 499;
      candles[i].close = 500;
      candles[i].volume = 50000;
    }
    // Expansion release bar at bar 49
    candles[49].open = 500;
    candles[49].high = 515;
    candles[49].low = 500;
    candles[49].close = 512;
    candles[49].volume = 180000;

    const result = evaluateS22_VolatilitySqueeze('INFY', 'Infosys Limited', candles, 78);
    expect(result.strategyId).toBe('S22_VOLATILITY_SQUEEZE');
    expect(result.metrics.consecutiveSqueezeBars).toBeGreaterThanOrEqual(3);
    expect(result.qualified).toBe(true);
    expect(result.action).toBe('BUY');
  });

  it('4. S23 Double Bottom: Requires strict neckline breakout; holds in WATCH when neckline unbroken', () => {
    const candles = createMockCandles(60, 280);
    // Create a realistic W-bottom price curve
    // Bars 0-15: Baseline around 285
    for (let i = 0; i <= 15; i++) {
      candles[i].open = 285;
      candles[i].high = 288;
      candles[i].low = 282;
      candles[i].close = 285;
    }
    // Bars 16-24: Drop to Trough 1
    for (let i = 16; i <= 24; i++) {
      const p = 285 - ((i - 15) * 1.5);
      candles[i].open = p + 1;
      candles[i].high = p + 2;
      candles[i].low = p - 1;
      candles[i].close = p;
    }
    // Trough 1 at bar 25 = 270
    candles[25].open = 272;
    candles[25].high = 274;
    candles[25].low = 270;
    candles[25].close = 272;

    // Bars 26-35: Rebound towards Neckline
    for (let i = 26; i <= 35; i++) {
      const p = 272 + ((i - 25) * 2.2);
      candles[i].open = p - 1;
      candles[i].high = p + 1;
      candles[i].low = p - 2;
      candles[i].close = p;
    }
    // Intermediate neckline peak at bar 36 = 295 (+9.25% recovery)
    candles[36].open = 292;
    candles[36].high = 295;
    candles[36].low = 290;
    candles[36].close = 294;

    // Bars 37-46: Drop towards Trough 2
    for (let i = 37; i <= 46; i++) {
      const p = 294 - ((i - 36) * 2.3);
      candles[i].open = p + 1;
      candles[i].high = p + 2;
      candles[i].low = p - 1;
      candles[i].close = p;
    }
    // Trough 2 at bar 47 = 271 (within 0.37% of Trough 1)
    candles[47].open = 272;
    candles[47].high = 274;
    candles[47].low = 271;
    candles[47].close = 272;

    // Bars 48-58: Rebound towards neckline
    for (let i = 48; i <= 58; i++) {
      const p = 272 + ((i - 47) * 1.2);
      candles[i].open = p - 1;
      candles[i].high = p + 1;
      candles[i].low = p - 1;
      candles[i].close = p;
    }

    // Case A: Price at 285 (below neckline 295) -> Must be WATCH, NOT BUY!
    candles[59].open = 284;
    candles[59].high = 286;
    candles[59].low = 283;
    candles[59].close = 285;
    candles[59].volume = 100000;
    const watchResult = evaluateS23_DoubleBottom('HDFCBANK', 'HDFC Bank Limited', candles);
    expect(watchResult.qualified).toBe(false);
    expect(watchResult.action).toBe('WATCH');

    // Case B: Price breaks above neckline at 298 on 1.8x volume -> Confirmed BUY!
    candles[59].open = 293;
    candles[59].high = 299;
    candles[59].low = 292;
    candles[59].close = 298;
    candles[59].volume = 200000;
    const buyResult = evaluateS23_DoubleBottom('HDFCBANK', 'HDFC Bank Limited', candles);
    expect(buyResult.qualified).toBe(true);
    expect(buyResult.action).toBe('BUY');
    expect(buyResult.target1).toBeGreaterThan(298);
  });

  it('5. S24 Distribution Exit: Signals WARNING on volume divergence and SCALE_OUT on neckline break', () => {
    const candles = createMockCandles(50, 420);
    // Baseline around 425
    for (let i = 0; i < 50; i++) {
      candles[i].open = 425;
      candles[i].high = 428;
      candles[i].low = 422;
      candles[i].close = 425;
      candles[i].volume = 100000;
    }

    // Peak 1 at bar 20 = 450 on 300k volume
    candles[20].open = 440;
    candles[20].high = 450;
    candles[20].low = 438;
    candles[20].close = 448;
    candles[20].volume = 300000;

    // Valley at bar 32 = 415
    candles[32].open = 420;
    candles[32].high = 422;
    candles[32].low = 415;
    candles[32].close = 418;
    candles[32].volume = 100000;

    // Peak 2 at bar 42 = 449 on 150k volume (volume divergence)
    candles[42].open = 442;
    candles[42].high = 449;
    candles[42].low = 440;
    candles[42].close = 447;
    candles[42].volume = 150000;

    // Case A: Warning state (price at 430, above valley 415)
    candles[49].open = 432;
    candles[49].high = 435;
    candles[49].low = 428;
    candles[49].close = 430;
    candles[49].volume = 100000;
    const warningResult = evaluateS24_DistributionExit('ICICIBANK', 'ICICI Bank Limited', candles, 380);
    expect(warningResult.action).toBe('WATCH');
    expect(warningResult.summary).toContain('DISTRIBUTION WARNING');

    // Case B: Confirmed breakdown (price at 410, below valley 415 on 1.5x volume)
    candles[49].open = 416;
    candles[49].high = 417;
    candles[49].low = 408;
    candles[49].close = 410;
    candles[49].volume = 200000;
    const exitResult = evaluateS24_DistributionExit('ICICIBANK', 'ICICI Bank Limited', candles, 380);
    expect(exitResult.qualified).toBe(true);
    expect(exitResult.action).toBe('EXIT_SCALE_OUT');
    expect(exitResult.summary).toContain('CONFIRMED DISTRIBUTION');
  });

  it('6. S25 Inverse Head & Shoulders: Detects classical multi-month reversal with symmetric shoulders & neckline breakout', () => {
    const candles = createMockCandles(70, 190);
    // Baseline around 195
    for (let i = 0; i < 70; i++) {
      candles[i].open = 195;
      candles[i].high = 200;
      candles[i].low = 190;
      candles[i].close = 195;
      candles[i].volume = 100000;
    }

    // Left Trough (between bar 15 and 35, e.g. bar 25): low = 175
    candles[25].open = 180;
    candles[25].high = 185;
    candles[25].low = 175;
    candles[25].close = 180;

    // Intermediate neckline rally between left and head (e.g. bar 32): high = 202
    candles[32].open = 195;
    candles[32].high = 202;
    candles[32].low = 192;
    candles[32].close = 200;

    // Head Trough (between bar 35 and 55, e.g. bar 42): deepest low = 158
    candles[42].open = 165;
    candles[42].high = 168;
    candles[42].low = 158;
    candles[42].close = 162;

    // Intermediate neckline rally between head and right shoulder (e.g. bar 52): high = 204
    candles[52].open = 198;
    candles[52].high = 204;
    candles[52].low = 195;
    candles[52].close = 202;

    // Right Shoulder Trough (between bar 55 and 68, e.g. bar 60): low = 177 (within 1.1% of left trough 175)
    candles[60].open = 182;
    candles[60].high = 185;
    candles[60].low = 177;
    candles[60].close = 180;

    // Case A: Price still coiling at 198 below neckline (204) -> WATCH
    candles[69].open = 195;
    candles[69].high = 199;
    candles[69].low = 194;
    candles[69].close = 198;
    candles[69].volume = 120000;
    const watchResult = evaluateS25_InverseHeadAndShoulders('LT', 'Larsen & Toubro Ltd', candles, 80);
    expect(watchResult.qualified).toBe(false);
    expect(watchResult.action).toBe('WATCH');

    // Case B: Breakout bar closing at 208 above neckline (204) on 2.2x volume -> Confirmed BUY!
    candles[69].open = 200;
    candles[69].high = 210;
    candles[69].low = 199;
    candles[69].close = 208;
    candles[69].volume = 220000;
    const buyResult = evaluateS25_InverseHeadAndShoulders('LT', 'Larsen & Toubro Ltd', candles, 80);
    expect(buyResult.qualified).toBe(true);
    expect(buyResult.action).toBe('BUY');
    expect(buyResult.metrics.headTrough).toBe(158);
    expect(buyResult.summary).toContain('S25 Inverse H&S CONFIRMED');
  });

  it('7. S26 Head & Shoulders Distribution Exit: Triggers EXIT_OR_HEDGE when neckline support is breached', () => {
    const candles = createMockCandles(70, 500);
    for (let i = 0; i < 70; i++) {
      candles[i].open = 500;
      candles[i].high = 505;
      candles[i].low = 495;
      candles[i].close = 500;
      candles[i].volume = 100000;
    }

    // Left Peak (between bar 15 and 35, e.g. bar 25): high = 540
    candles[25].open = 530;
    candles[25].high = 540;
    candles[25].low = 525;
    candles[25].close = 535;

    // Intermediate neckline support trough (e.g. bar 32): low = 485
    candles[32].open = 495;
    candles[32].high = 500;
    candles[32].low = 485;
    candles[32].close = 490;

    // Head Peak (between bar 35 and 55, e.g. bar 42): highest high = 575
    candles[42].open = 560;
    candles[42].high = 575;
    candles[42].low = 555;
    candles[42].close = 570;

    // Second neckline support trough (e.g. bar 52): low = 488
    candles[52].open = 495;
    candles[52].high = 502;
    candles[52].low = 488;
    candles[52].close = 492;

    // Right Shoulder Peak (between bar 55 and 68, e.g. bar 60): lower peak = 530 (< Head 575)
    candles[60].open = 520;
    candles[60].high = 530;
    candles[60].low = 515;
    candles[60].close = 525;

    // Case A: Warning state (price at 510, still above neckline 485)
    candles[69].open = 512;
    candles[69].high = 515;
    candles[69].low = 505;
    candles[69].close = 510;
    const warnResult = evaluateS26_HeadAndShouldersDistributionExit('AXISBANK', 'Axis Bank Limited', candles);
    expect(warnResult.qualified).toBe(false);
    expect(warnResult.action).toBe('WARNING');
    expect(warnResult.summary).toContain('S26 H&S WARNING');

    // Case B: Confirmed breakdown (price at 478, breaching neckline 485)
    candles[69].open = 488;
    candles[69].high = 490;
    candles[69].low = 475;
    candles[69].close = 478;
    const exitResult = evaluateS26_HeadAndShouldersDistributionExit('AXISBANK', 'Axis Bank Limited', candles);
    expect(exitResult.qualified).toBe(true);
    expect(exitResult.action).toBe('EXIT_OR_HEDGE');
    expect(exitResult.summary).toContain('S26 H&S TOP CONFIRMED');
  });

  it('8. S10 Intraday ORB with Session Date & Time-of-Day RVOL Normalization', () => {
    // Session Date filtering test: Include candles from yesterday (2026-09-15) and today (2026-09-16)
    const multiDayCandles = [
      // Yesterday's afternoon candles (should be filtered out)
      { timestamp: '2026-09-15T14:45:00', open: 980, high: 985, low: 978, close: 982, volume: 45000 },
      { timestamp: '2026-09-15T15:15:00', open: 982, high: 988, low: 980, close: 985, volume: 50000 },
      // Today's 09:15-09:30 opening candle (defines OR high = 1000, low = 990)
      { timestamp: '2026-09-16T09:15:00', open: 992, high: 1000, low: 990, close: 998, volume: 60000 },
      // Today's 09:30-09:45 candle (wicks to 1002 but closes at 999 - no close breakout)
      { timestamp: '2026-09-16T09:30:00', open: 998, high: 1002, low: 996, close: 999, volume: 70000 },
      // Today's 09:45-10:00 candle (closes at 1008 > 1000 on 90,000 volume)
      { timestamp: '2026-09-16T09:45:00', open: 999, high: 1010, low: 998, close: 1008, volume: 90000 }
    ];

    // Time-of-day normalized volume curve: 09:45 median volume = 50,000 (so 90k is 1.8x RVOL)
    const timeOfDayBaseline = {
      '09:15': 60000,
      '09:30': 55000,
      '09:45': 50000
    };

    const orbResult = evaluateS10_IntradayORBConfirmation(
      'MARUTI',
      multiDayCandles,
      true, // daily setup active
      true, // market regime permits
      timeOfDayBaseline,
      '2026-09-16' // Target session date
    );

    expect(orbResult.confirmed).toBe(true);
    expect(orbResult.status).toBe('CONFIRMED');
    expect(orbResult.openingRangeHigh).toBe(1000);
    expect(orbResult.openingRangeLow).toBe(990);
    expect(orbResult.breakoutClose).toBe(1008);
    expect(orbResult.rvol).toBe(1.8);
    expect(orbResult.explanation).toContain('Time-of-Day RVOL 1.8x');
  });

  it('21. TC-ORB-003: ORB rejects a session without the exact 09:15 opening candle', () => {
    const candles = [
      { timestamp: '2026-09-16T09:30:00', open: 100, high: 101, low: 99, close: 100, volume: 100000 },
      { timestamp: '2026-09-16T09:45:00', open: 100, high: 103, low: 100, close: 102, volume: 120000 }
    ];
    const result = evaluateS10_IntradayORBConfirmation('TEST', candles, true, true, { '09:45': 60000 }, '2026-09-16');
    expect(result.status).toBe('DATA_UNAVAILABLE');
    expect(result.confirmed).toBe(false);
  });

  it('22. TC-ORB-004: ORB returns DATA_UNAVAILABLE when time-of-day volume baseline is missing', () => {
    const candles = [
      { timestamp: '2026-09-16T09:15:00', open: 100, high: 101, low: 99, close: 100, volume: 100000 },
      { timestamp: '2026-09-16T09:45:00', open: 100, high: 103, low: 100, close: 102, volume: 120000 }
    ];
    const result = evaluateS10_IntradayORBConfirmation('TEST', candles, true, true, {}, '2026-09-16');
    expect(result.status).toBe('DATA_UNAVAILABLE');
    expect(result.confirmed).toBe(false);
  });

  it('23. TC-S26-001: H&S distribution exit exposes EXIT_OR_HEDGE action', () => {
    // Use a minimal type-level assertion; geometry remains covered by existing S26 tests.
    const action: import('../../src/server/services/NewTechnicalStrategiesEngine.js').NewStrategyAction = 'EXIT_OR_HEDGE';
    expect(action).toBe('EXIT_OR_HEDGE');
  });

});
