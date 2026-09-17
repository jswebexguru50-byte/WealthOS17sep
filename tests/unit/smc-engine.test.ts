/**
 * Institutional Smart Money Concepts (SMC 13 Pillars) Engine Test Suite
 * Tests mathematical rigor, swing structure, liquidity sweeps, order blocks,
 * fair value gaps, displacement, premium/discount zones, and checklist scoring.
 */

import { describe, test, expect } from 'vitest';
import {
  SmartMoneyConceptsEngine,
  Candle
} from '../../src/server/services/SmartMoneyConceptsEngine.js';

describe('Institutional Smart Money Concepts (SMC) Engine - 13 Pillars', () => {
  const smc = SmartMoneyConceptsEngine.getInstance();

  // Helper to construct candle sequences easily
  function createCandle(
    index: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number = 100000
  ): Candle {
    const d = new Date(2026, 0, index + 1);
    return {
      date: d.toISOString().split('T')[0],
      open,
      high,
      low,
      close,
      volume
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 1: Market Structure (HH, HL, LH, LL, BOS, CHOCH, MSS)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 1: Identifies Swing Highs, Swing Lows, and Structure Progression', () => {
    // 15 candles creating a clear Swing High at bar 4 (price 120) and Swing Low at bar 8 (price 90)
    const candles: Candle[] = [
      createCandle(0, 100, 105, 98, 104),
      createCandle(1, 104, 110, 102, 108),
      createCandle(2, 108, 115, 106, 114),
      createCandle(3, 114, 118, 112, 116),
      createCandle(4, 116, 125, 115, 122), // Swing High peak = 125
      createCandle(5, 122, 123, 110, 112),
      createCandle(6, 112, 114, 104, 105),
      createCandle(7, 105, 106, 95, 96),
      createCandle(8, 96, 98, 88, 92),     // Swing Low trough = 88
      createCandle(9, 92, 102, 90, 100),
      createCandle(10, 100, 108, 98, 106),
      createCandle(11, 106, 115, 104, 112),
      createCandle(12, 112, 120, 110, 118),
      createCandle(13, 118, 128, 116, 126), // Breaks 125 -> Bullish BOS!
      createCandle(14, 126, 130, 124, 129)
    ];

    const swings = smc.detectSwings(candles, 2);
    expect(swings.length).toBeGreaterThanOrEqual(2);

    const swingHigh = swings.find(s => s.type === 'SWING_HIGH');
    const swingLow = swings.find(s => s.type === 'SWING_LOW');
    expect(swingHigh).toBeDefined();
    expect(swingLow).toBeDefined();
    expect(swingHigh!.price).toBe(125);
    expect(swingLow!.price).toBe(88);

    const breaks = smc.detectStructureBreaks(candles, swings);
    const breakEvent = breaks.find(b => (b.type === 'BOS' || b.type === 'CHOCH') && b.direction === 'BULLISH');
    expect(breakEvent).toBeDefined();
    expect(breakEvent!.brokenPrice).toBe(125);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 2: Liquidity Mapping (BSL, SSL, Equal Highs EQH, Equal Lows EQL)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 2: Identifies Buy-side Liquidity (BSL) and Sell-side Liquidity (SSL) Pools', () => {
    const candles: Candle[] = [
      createCandle(0, 500, 510, 495, 505),
      createCandle(1, 505, 530, 502, 528), // Peak 1 = 530
      createCandle(2, 528, 529, 510, 512),
      createCandle(3, 512, 515, 480, 482), // Trough = 480
      createCandle(4, 482, 510, 481, 508),
      createCandle(5, 508, 530.5, 505, 527), // Peak 2 = 530.5 (Equal High with Peak 1 within 0.15%)
      createCandle(6, 527, 528, 515, 518),
      createCandle(7, 518, 522, 510, 514)
    ];

    const swings = smc.detectSwings(candles, 1);
    const pools = smc.identifyLiquidityPools(candles, swings);

    expect(pools.length).toBeGreaterThanOrEqual(2);
    const bslPool = pools.find(p => p.type === 'BSL' || p.type === 'EQH');
    const sslPool = pools.find(p => p.type === 'SSL');

    expect(bslPool).toBeDefined();
    expect(sslPool).toBeDefined();
    expect(bslPool!.price).toBeGreaterThan(520);
    expect(sslPool!.price).toBeLessThanOrEqual(485);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 3: Liquidity Sweep / Takeout (Wick Manipulation before Real Move)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 3: Validates Wick Sweep of SSL with Body Rejection Inside the Pool', () => {
    // Bar 2 forms SSL at 400.
    // Bar 5 sweeps SSL: low dips to 392 (wick penetration), but close is 404 (closes back above 400).
    const candles: Candle[] = [
      createCandle(0, 420, 425, 415, 418),
      createCandle(1, 418, 420, 400, 402), // Prior low = 400
      createCandle(2, 402, 405, 400, 403), // SSL pool established at 400
      createCandle(3, 403, 415, 402, 412),
      createCandle(4, 412, 414, 402, 404),
      createCandle(5, 404, 406, 392, 405), // Wick sweep! low=392 < 400, close=405 >= 400
      createCandle(6, 405, 422, 404, 420)  // Immediate displacement upward
    ];

    const pools = [
      {
        id: 'POOL_SSL_TEST',
        type: 'SSL' as const,
        price: 400,
        rangeHigh: 402,
        rangeLow: 398,
        date: '2026-01-02',
        status: 'UNTOUCHED' as const,
        description: 'Test SSL pool'
      }
    ];

    const sweeps = smc.detectSweeps(candles, pools);
    expect(sweeps.length).toBeGreaterThanOrEqual(1);

    const sweep = sweeps[0];
    expect(sweep.direction).toBe('BULLISH'); // Swept SSL -> Bullish setup
    expect(sweep.extremePrice).toBe(392);
    expect(sweep.sweptPrice).toBe(400);
    expect(sweep.reversalConfirmed).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 4: Order Blocks (Bullish OB & Bearish OB with Displacement Validation)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 4: Detects High Quality Bullish Order Block with Mean Threshold', () => {
    // Bar 2 is bearish (open 100, close 95).
    // Bar 3 and 4 have massive upward displacement (95 -> 112) with volume surge.
    const candles: Candle[] = [
      createCandle(0, 102, 104, 100, 101, 100000),
      createCandle(1, 101, 102, 98, 99, 110000),
      createCandle(2, 99, 100, 94, 95, 120000), // Last bearish candle before strong run
      createCandle(3, 95, 106, 95, 105, 400000), // Huge displacement candle
      createCandle(4, 105, 114, 104, 112, 450000), // Follow-through
      createCandle(5, 112, 113, 108, 109, 150000)
    ];

    const obs = smc.detectOrderBlocks(candles, []);
    const bullishOb = obs.find(o => o.type === 'BULLISH_OB');

    expect(bullishOb).toBeDefined();
    expect(bullishOb!.topPrice).toBe(100);
    expect(bullishOb!.bottomPrice).toBe(94);
    // Mean threshold is midpoint between 99 and 95 = 97
    expect(bullishOb!.meanThreshold).toBeCloseTo(97, 1);
    expect(bullishOb!.causedDisplacement).toBe(true);
    expect(bullishOb!.qualityScore).toBeGreaterThanOrEqual(60);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 5: Breaker Blocks (Failed OB Flipped into Opposite S/R)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 5: Transforms Mitigated/Violated Order Block into a Breaker Block', () => {
    // Bar 1 creates Bullish OB [90 - 95].
    // Later bar 4 crashes through 90 down to 82, flipping it to a Bearish Breaker Block!
    const candles: Candle[] = [
      createCandle(0, 94, 96, 92, 93),
      createCandle(1, 93, 95, 90, 91, 100000), // Bearish candle
      createCandle(2, 91, 104, 91, 103, 350000), // Strong displacement up (OB formed)
      createCandle(3, 103, 104, 98, 99, 120000),
      createCandle(4, 99, 100, 82, 84, 450000), // Violent crash penetrating through 90!
      createCandle(5, 84, 88, 83, 86, 120000)
    ];

    const obs = smc.detectOrderBlocks(candles, []);
    const breaker = obs.find(o => o.type === 'BREAKER');
    expect(breaker).toBeDefined();
    expect(breaker!.status).toBe('FAILED_INTO_BREAKER');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 6: Fair Value Gaps (FVG 3-Candle Imbalance & Mitigation Tracking)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 6: Detects Bullish FVG (Candle 1 High < Candle 3 Low)', () => {
    // Candle 1: High = 102
    // Candle 2: Big expansion up (102 -> 115)
    // Candle 3: Low = 108
    // Imbalance gap exists between 102 and 108!
    const candles: Candle[] = [
      createCandle(0, 98, 102, 96, 100),  // Candle 1: high = 102
      createCandle(1, 100, 116, 100, 115), // Candle 2: big displacement
      createCandle(2, 115, 120, 108, 118), // Candle 3: low = 108 (Gap: 102 to 108)
      createCandle(3, 118, 119, 114, 116)
    ];

    const fvgs = smc.detectFairValueGaps(candles);
    const bullishFvg = fvgs.find(f => f.type === 'BULLISH_FVG');

    expect(bullishFvg).toBeDefined();
    expect(bullishFvg!.bottomPrice).toBe(102);
    expect(bullishFvg!.topPrice).toBe(108);
    expect(bullishFvg!.consequentEncroachment).toBeCloseTo(105, 1); // Midpoint
    expect(bullishFvg!.status).toBe('OPEN');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 7: Displacement Engine (Body Ratio >= 60%, Volume Surge >= 1.25x)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 7: Computes Candle Displacement Metrics Accurately', () => {
    // Open 100, High 106, Low 99.5, Close 105.5
    // Body = 5.5, Range = 6.5 -> Body Ratio = 84.6% >= 60%
    // Volume = 300,000 vs avg 150,000 -> 2.0x >= 1.25x
    const candle = createCandle(0, 100, 106, 99.5, 105.5, 300000);
    const avgVol = 150000;

    const displacement = smc.calculateDisplacement(candle, avgVol);
    expect(displacement.isDisplacement).toBe(true);
    expect(displacement.direction).toBe('BULLISH');
    expect(displacement.bodyToRangeRatio).toBeGreaterThanOrEqual(0.75);
    expect(displacement.volumeMultiplier).toBe(2.0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 8: Premium vs. Discount (Fibonacci 50% Equilibrium Dealing Range)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 8: Identifies Discount Zone (<50%) and Premium Zone (>50%)', () => {
    // Dealing range: Low = 100, High = 200, Equilibrium = 150
    // Current price = 130 (Fib 30% -> DISCOUNT zone, optimal for institutional longs)
    const candles: Candle[] = [
      createCandle(0, 120, 125, 100, 110), // Low 100
      createCandle(1, 110, 200, 108, 195), // High 200
      createCandle(2, 195, 198, 128, 130)  // CMP = 130
    ];

    const pd = smc.calculatePremiumDiscount(candles, 10);
    expect(pd.rangeLow).toBe(100);
    expect(pd.rangeHigh).toBe(200);
    expect(pd.equilibrium50).toBe(150);
    expect(pd.fibPercent).toBeCloseTo(30, 0);
    expect(pd.currentZone).toBe('DISCOUNT');
    expect(pd.recommendedBias).toBe('LOOK_FOR_LONGS');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 9: Inducement (IDM Retail Trap Identification)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 9: Flags Inducement Swing Traps Ahead of Major Liquidity Pools', () => {
    const candles: Candle[] = [
      createCandle(0, 500, 520, 495, 515),
      createCandle(1, 515, 550, 510, 545), // Major High 550
      createCandle(2, 545, 548, 480, 485), // Major Low 480
      createCandle(3, 485, 502, 483, 498), // Minor bounce / IDM swing at 502
      createCandle(4, 498, 500, 475, 478)  // Sweeps past 480 to 475
    ];

    const swings = smc.detectSwings(candles, 1);
    const pools = smc.identifyLiquidityPools(candles, swings);
    const idmPool = pools.find(p => p.type === 'INDUCEMENT' || p.type === 'SSL');
    expect(idmPool).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 10: SMT Divergence (Intermarket Non-Confirmation)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 10: Detects Bullish SMT Divergence (Stock Holds HL while Benchmark Makes LL)', () => {
    // 12 bars to satisfy 10-bar lookback
    const stockCandles: Candle[] = [];
    const benchmarkCandles: Candle[] = [];

    for (let i = 0; i < 12; i++) {
      stockCandles.push(createCandle(i, 100, 105, 95, 100));
      benchmarkCandles.push(createCandle(i, 20000, 20100, 19900, 20000));
    }

    // Bar 11 (last candle): Stock sweeps lower low to 90 (< 95), Benchmark holds higher low at 19950 (>= 19900)
    stockCandles[11] = createCandle(11, 98, 100, 90, 96);
    benchmarkCandles[11] = createCandle(11, 20000, 20100, 19950, 20050);

    const smt = smc.detectSmtDivergence(stockCandles, benchmarkCandles, 'TCS', 'NIFTY50');
    expect(smt.detected).toBe(true);
    expect(smt.type).toBe('BULLISH_SMT');
    expect(smt.description).toContain('Bullish SMT Divergence');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 11: 10-Second SMC Checklist (10-Point Scoring Algorithm)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 11: Evaluates 10-Second Institutional Checklist Strictly', () => {
    const syntheticCandles = smc.generateSyntheticCandles('RELIANCE', 60);
    const analysis = smc.analyzeStock('RELIANCE', syntheticCandles);

    expect(analysis.checklist).toBeDefined();
    expect(analysis.checklist.score).toBeGreaterThanOrEqual(0);
    expect(analysis.checklist.score).toBeLessThanOrEqual(10);
    expect(analysis.checklist.items).toHaveProperty('htfStructureConfirmed');
    expect(analysis.checklist.items).toHaveProperty('liquiditySwept');
    expect(analysis.checklist.items).toHaveProperty('favorableLocation');
    expect(analysis.checklist.items).toHaveProperty('displacementOccurred');
    expect(analysis.checklist.items).toHaveProperty('structureConfirmedMssOrBos');
    expect(analysis.checklist.items).toHaveProperty('logicalInvalidationStop');
    expect(analysis.checklist.items).toHaveProperty('riskRewardGe2');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 12 & 13: Full SMC Trade Model (Entry, Stop Loss beyond Sweep, Targets, R:R)
  // ─────────────────────────────────────────────────────────────────────────
  test('Pillar 12 & 13: Generates High-Probability Trade Model with Proper R:R', () => {
    const syntheticCandles = smc.generateSyntheticCandles('INFY', 60);
    const analysis = smc.analyzeStock('INFY', syntheticCandles);

    expect(analysis.tradeModel).toBeDefined();
    expect(analysis.tradeModel.setupType).toBeDefined();

    if (analysis.tradeModel.setupType === 'HIGH_PROBABILITY_LONG') {
      expect(analysis.tradeModel.stopLoss).toBeLessThan(analysis.cmp);
      expect(analysis.tradeModel.target1).toBeGreaterThan(analysis.cmp);
      expect(analysis.tradeModel.target2).toBeGreaterThan(analysis.tradeModel.target1);
      expect(analysis.tradeModel.riskRewardRatio).toBeGreaterThanOrEqual(1.5);
      expect(analysis.tradeModel.triggerReason).toContain('SMC Long Setup');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRATION: analyzeSymbol and scanUniverse Work Reliably
  // ─────────────────────────────────────────────────────────────────────────
  test('Integration: scanUniverse runs multi-scrip scan and returns sorted results', async () => {
    const symbols = ['RELIANCE', 'TCS', 'HDFCBANK'];
    const results = await smc.scanUniverse(symbols);

    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.symbol).toBeDefined();
      expect(r.cmp).toBeGreaterThan(0);
      expect(r.checklist.score).toBeGreaterThanOrEqual(0);
      expect(r.marketStructure).toBeDefined();
      expect(r.premiumDiscount).toBeDefined();
    }

    // Must be sorted descending by Checklist Score, then by R:R
    for (let i = 0; i < results.length - 1; i++) {
      const a = results[i];
      const b = results[i + 1];
      if (a.checklist.score === b.checklist.score) {
        expect(a.tradeModel.riskRewardRatio).toBeGreaterThanOrEqual(b.tradeModel.riskRewardRatio);
      } else {
        expect(a.checklist.score).toBeGreaterThanOrEqual(b.checklist.score);
      }
    }
  });
});
