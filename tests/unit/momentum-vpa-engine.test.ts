import { describe, it, expect, beforeEach } from 'vitest';
import {
  MomentumVpaEngine,
  Candle,
  MacroRegimeResult,
  ImpulseResult,
  BaseCompactionResult,
  TrancheDefinition
} from '../../src/server/services/MomentumVpaEngine.js';

describe('Smart Money Momentum & Volume Price Alignment (VPA) Engine (WOS-FS-MOM-VPA-01)', () => {
  let engine: MomentumVpaEngine;

  beforeEach(() => {
    engine = MomentumVpaEngine.getInstance();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 0: Macro Regime Filter
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stage 0: Macro Market Regime Filter (CNX500 Benchmark)', () => {
    it('evaluates NORMAL market regime when CNX500 Close >= 50-day SMA', () => {
      // 60 candles with upward trend, close > SMA50
      const candles: Candle[] = [];
      for (let i = 60; i >= 0; i--) {
        const close = 24000 + (60 - i) * 20;
        candles.push({
          date: `2026-01-${String(65 - i).padStart(2, '0')}`,
          open: close - 10,
          high: close + 20,
          low: close - 20,
          close,
          volume: 1000000
        });
      }

      const regime = engine.evaluateMacroRegime(candles);
      expect(regime.regime).toBe('NORMAL');
      expect(regime.emergencyStopArmed).toBe(false);
      expect(regime.emergencyStopLossPct).toBe(0);
      expect(regime.currentClose).toBeGreaterThan(regime.sma50);
    });

    it('evaluates BEARISH regime and arms -12% Emergency Circuit Breaker when CNX500 < 50-day SMA', () => {
      // 60 candles with downward trend, close < SMA50
      const candles: Candle[] = [];
      for (let i = 60; i >= 0; i--) {
        const close = 26000 - (60 - i) * 35;
        candles.push({
          date: `2026-01-${String(65 - i).padStart(2, '0')}`,
          open: close + 10,
          high: close + 20,
          low: close - 20,
          close,
          volume: 1000000
        });
      }

      const regime = engine.evaluateMacroRegime(candles);
      expect(regime.regime).toBe('BEARISH');
      expect(regime.emergencyStopArmed).toBe(true);
      expect(regime.emergencyStopLossPct).toBe(12.0);
      expect(regime.currentClose).toBeLessThan(regime.sma50);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 1: Momentum Impulse & Smart Money Verification
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stage 1: Momentum Impulse & Turnover Floor', () => {
    it('TC-01: Rejects setup when stock gains 22% in 12 days but impulse turnover is ₹38 Cr (< ₹50 Cr floor)', () => {
      const candles: Candle[] = [];
      // 5 days pre-impulse base at 1020
      for (let i = 0; i < 5; i++) {
        candles.push({
          date: `2026-02-${String(i + 1).padStart(2, '0')}`,
          open: 1020, high: 1030, low: 1015, close: 1020, volume: 10000
        });
      }
      // 12 days impulse from 1000 to 1222 (+22.2%), low turnover: ~₹38 Cr total (< ₹50 Cr)
      for (let i = 0; i < 12; i++) {
        const price = 1000 + i * (220 / 11);
        candles.push({
          date: `2026-02-${String(i + 6).padStart(2, '0')}`,
          open: price,
          high: price + 5,
          low: i === 0 ? 1000 : price - 2,
          close: price + 2,
          volume: 28000, // Turnover ~ ₹38 Cr
          turnover: 28000 * price
        });
      }
      // 18 days base compaction
      for (let i = 0; i < 18; i++) {
        candles.push({
          date: `2026-03-${String(i + 1).padStart(2, '0')}`,
          open: 1190, high: 1205, low: 1180, close: 1195, volume: 15000
        });
      }

      const impulse = engine.detectImpulse(candles, 18);
      expect(impulse.priceExpansionPct).toBeGreaterThanOrEqual(20.0);
      expect(impulse.cumulativeTurnoverCr).toBeLessThan(50.0);
      expect(impulse.qualified).toBe(false);
      expect(impulse.rejectionReason).toContain('fails institutional floor of ₹50 Cr (TC-01)');
    });

    it('Qualifies setup when stock gains >= +20% on >= ₹50 Cr cumulative turnover', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 5; i++) {
        candles.push({
          date: `2026-02-${String(i + 1).padStart(2, '0')}`,
          open: 1020, high: 1030, low: 1015, close: 1020, volume: 50000
        });
      }
      // 12 days impulse from 1000 to 1250 (+25%), turnover ~₹70 Cr (> ₹50 Cr)
      for (let i = 0; i < 12; i++) {
        const price = 1000 + i * (250 / 11);
        candles.push({
          date: `2026-02-${String(i + 6).padStart(2, '0')}`,
          open: price,
          high: price + 8,
          low: i === 0 ? 1000 : price - 4,
          close: price + 4,
          volume: 520000,
          turnover: 520000 * price
        });
      }
      // 18 days base compaction
      for (let i = 0; i < 18; i++) {
        candles.push({
          date: `2026-03-${String(i + 1).padStart(2, '0')}`,
          open: 1200, high: 1220, low: 1180, close: 1210, volume: 150000
        });
      }

      const impulse = engine.detectImpulse(candles, 18);
      expect(impulse.qualified).toBe(true);
      expect(impulse.priceExpansionPct).toBeGreaterThanOrEqual(20.0);
      expect(impulse.cumulativeTurnoverCr).toBeGreaterThanOrEqual(50.0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 2: Extended Base Compaction & VPA
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stage 2: Base Compaction & Volume Price Alignment (VPA)', () => {
    it('TC-02: Holds setup in "COMPACTING" status when base duration is only 8 trading days (< 15 days / 3 weeks)', () => {
      const synthetic = engine.generateSyntheticCandles('TEST_SHORT_BASE', 45);
      const impulse = engine.detectImpulse(synthetic, 8);
      const base = engine.evaluateBaseCompaction(synthetic, impulse, 8);

      expect(base.baseDurationBars).toBe(8);
      expect(base.qualified).toBe(false);
      expect(base.status).toBe('COMPACTING');
      expect(base.rejectionReason).toContain('requires >= 15 days / 3 weeks, TC-02');
    });

    it('Validates upper 50% quadrant retention, ATR contraction (<0.70), volume drying (<0.60), and VPA ratio >= 1.25', () => {
      const synthetic = engine.generateSyntheticCandles('TEST_IDEAL', 60);
      const impulse = engine.detectImpulse(synthetic, 20);
      const base = engine.evaluateBaseCompaction(synthetic, impulse, 20);

      expect(base.baseDurationBars).toBeGreaterThanOrEqual(15);
      expect(base.holdsUpperQuadrant).toBe(true);
      expect(base.atrRatio).toBeLessThan(0.70);
      expect(base.volumeDryingRatio).toBeLessThan(0.60);
      expect(base.vpaAsymmetryRatio).toBeGreaterThanOrEqual(1.25);
      expect(base.qualified).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 3 & 4: 3-Tranche Execution, Risk Boundaries, and Invalidation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stage 3 & 4: 3-Tranche Staggered Execution & Risk Engine', () => {
    it('evaluates 3-tranche equal split (33.33%, 33.33%, 33.34%) and calculates Blended VWAP correctly', () => {
      const synthetic = engine.generateSyntheticCandles('TEST_TRANCHES', 60);
      const setup = engine.evaluateStock('TEST_TRANCHES', 'Test Tranches Ltd', synthetic);

      expect(setup.tranches).toHaveLength(3);
      expect(setup.tranches[0].allocationPct).toBe(33.33);
      expect(setup.tranches[1].allocationPct).toBe(33.33);
      expect(setup.tranches[2].allocationPct).toBe(33.34);

      // Verify profit targets are strictly +20% and +25% above Blended VWAP
      expect(setup.targetMinPrice).toBeCloseTo(setup.blendedVwap * 1.20, 1);
      expect(setup.targetMaxPrice).toBeCloseTo(setup.blendedVwap * 1.25, 1);
    });

    it('TC-03: Invalidation - Liquidates filled Tranche 1 and cancels queued tranches when price breaches Point Zero (P0)', async () => {
      const order = await engine.armStaggeredOrder('TCS', 'Combined', 300000);
      expect(order.status).toBe('ARMED');

      // Update tranche 1 status to FILLED in SQLite
      await engine.updateOrderTrancheStatus(order.id, 'FILLED');

      // Price drops below Point Zero (P0)
      const breachPrice = order.p0 - 50;
      const updated = await engine.processOrderPriceUpdate(order.id, breachPrice);

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('STOPPED_OUT');
      expect(updated!.tranche1Status).toBe('LIQUIDATED');
      expect(updated!.tranche2Status).toBe('CANCELLED');
      expect(updated!.tranche3Status).toBe('CANCELLED');
      expect(updated!.notes).toContain('TC-03 Invalidation: Price');
    });

    it('TC-04: Executes Tranche 3 on breakout above Base High with Volume > 1.5x SMA20 and recalibrates Blended VWAP and Target Band', async () => {
      const order = await engine.armStaggeredOrder('RELIANCE', 'Combined', 300000);

      // Set Tranche 1 and 2 to FILLED in SQLite
      await engine.updateOrderTrancheStatus(order.id, 'FILLED', 'FILLED');

      // Now price breaks out above Base High
      const breakoutPrice = order.baseHigh * 1.01;
      const breakoutVolume = 2000000;
      const volSma = 1000000; // Vol is 2.0x SMA20 (> 1.5x)

      const updated = await engine.processOrderPriceUpdate(order.id, breakoutPrice, breakoutVolume, volSma);

      expect(updated).not.toBeNull();
      expect(updated!.tranche3Status).toBe('FILLED');
      expect(updated!.status).toBe('FULLY_FILLED');
      // Verify Target Band recalibrated to +20-25% of the updated Blended VWAP
      expect(updated!.targetMinPrice).toBeCloseTo(updated!.blendedVwap * 1.20, 1);
      expect(updated!.targetMaxPrice).toBeCloseTo(updated!.blendedVwap * 1.25, 1);
      expect(updated!.notes).toContain('TC-04 Breakout Execution: Tranche 3 filled');
    });

    it('TC-05: Emergency Circuit Breaker - Triggers liquidation at -12.0% loss from VWAP when Macro Regime is BEARISH', async () => {
      const order = await engine.armStaggeredOrder('BEAR_TEST', 'Combined', 100000);
      const emergencyStop = Number((order.blendedVwap * 0.88).toFixed(2));
      const { dbRun, getDB } = await import('../../src/server/database.js');
      await dbRun(getDB(), 'UPDATE MomentumVpaOrders SET macroRegime = ?, emergencyStopPrice = ?, tranche1Status = ?, tranche2Status = ?, tranche3Status = ? WHERE id = ?', [
        'BEARISH', emergencyStop, 'FILLED', 'ARMED', 'PENDING', order.id
      ]);

      // Price drops to -13% from VWAP (hitting emergency stop before P0 if P0 is 15% away)
      const hitEmergencyPrice = emergencyStop - 5;
      const updated = await engine.processOrderPriceUpdate(order.id, hitEmergencyPrice);

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('CIRCUIT_BREAKER_TRIGGERED');
      expect(updated!.tranche1Status).toBe('LIQUIDATED');
      expect(updated!.tranche2Status).toBe('CANCELLED');
      expect(updated!.tranche3Status).toBe('CANCELLED');
      expect(updated!.notes).toContain('TC-05 Emergency Circuit Breaker');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Universe Scanner & Real-Time Alerts
  // ─────────────────────────────────────────────────────────────────────────
  describe('Universe Scanner & Real-Time Alerts', () => {
    it('scans multi-symbol universe and returns ordered setups with all required attributes', async () => {
      const results = await engine.scanUniverse(['RELIANCE', 'TCS', 'INFY']);
      expect(results.length).toBeGreaterThanOrEqual(3);

      for (const item of results) {
        expect(item.symbol).toBeDefined();
        expect(item.currentPrice).toBeGreaterThan(0);
        expect(item.blendedVwap).toBeGreaterThan(0);
        expect(item.pointZeroStopLoss).toBeGreaterThan(0);
        expect(item.targetMinPrice).toBeGreaterThan(0);
        expect(item.targetMaxPrice).toBeGreaterThan(item.targetMinPrice);
        expect(item.probabilityScore).toBeGreaterThanOrEqual(25);
        expect(item.confidenceLevel).toBeDefined();
        expect(item.rationale.length).toBeGreaterThanOrEqual(4);
        expect(item.tranches).toHaveLength(3);
      }
    });

    it('generates real-time alerts when momentum conditions break or trigger', () => {
      const synthetic = engine.generateSyntheticCandles('ALERT_SYM', 60);
      const setup = engine.evaluateStock('ALERT_SYM', 'Alert Symbol Ltd', synthetic);
      const alerts = engine.generateAlerts([setup]);

      expect(Array.isArray(alerts)).toBe(true);
      if (alerts.length > 0) {
        expect(alerts[0].symbol).toBe('ALERT_SYM');
        expect(alerts[0].headline).toBeDefined();
        expect(alerts[0].message).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 5, 6 & 7: Fundamental Analysis, Market Sentiment & Triad Synergy
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stage 5, 6 & 7: Fundamental Analysis, Market Sentiment & Triad Synergy', () => {
    it('evaluates fundamental quality metrics and passes high-ROCE compounders', () => {
      const fundTrent = engine.evaluateFundamentalQuality('TRENT', 4500);
      expect(fundTrent.score).toBeGreaterThanOrEqual(75);
      expect(fundTrent.grade).toMatch(/A|A\+/);
      expect(fundTrent.gateStatus).toBe('PASSED_COMPOUNDER');
      expect(fundTrent.metrics.roce).toBeGreaterThan(20);
      expect(fundTrent.metrics.debtToEquity).toBeLessThan(0.5);
      expect(fundTrent.metrics.piotroskiScore).toBeGreaterThanOrEqual(7);
      expect(fundTrent.strengths.length).toBeGreaterThan(0);

      const fundPolycab = engine.evaluateFundamentalQuality('POLYCAB', 5200);
      expect(fundPolycab.gateStatus).toBe('PASSED_COMPOUNDER');
      expect(fundPolycab.metrics.debtToEquity).toBeLessThanOrEqual(0.15); // Virtually debt-free
    });

    it('evaluates market sentiment and sector relative strength leaders', () => {
      const normalRegime: any = { regime: 'NORMAL', emergencyStopArmed: false, emergencyStopLossPct: 0 };
      const sentimentHal = engine.evaluateMarketSentiment('HAL', normalRegime, []);

      expect(sentimentHal.sectorName).toBe('Defence & Aerospace');
      expect(sentimentHal.sectorRelativeStrength).toBeGreaterThan(10);
      expect(sentimentHal.sectorTrend).toBe('OUTPERFORMING');
      expect(sentimentHal.benchmarkMode).toBe('NORMAL');
      expect(sentimentHal.sentimentScore).toBeGreaterThanOrEqual(75);
      expect(sentimentHal.institutionalBias).toBe('STRONG_ACCUMULATION');
    });

    it('synthesizes Triad Conviction (40% VPA + 35% Fundamentals + 25% Sentiment) and categorizes Dual-Fit vs Investing Compounder vs Trading', () => {
      const fund = engine.evaluateFundamentalQuality('POLYCAB', 5000);
      const normalRegime: any = { regime: 'NORMAL', emergencyStopArmed: false, emergencyStopLossPct: 0 };
      const sentiment = engine.evaluateMarketSentiment('POLYCAB', normalRegime, []);

      // Dual-Fit: High Momentum (85) + High Fundamentals (85+)
      const dualFit = engine.synthesizeTriadConviction(85, fund, sentiment, 'ACTIONABLE_TRANCHE_READY');
      expect(dualFit.primaryRecommendation).toBe('DUAL_FIT');
      expect(dualFit.recommendationBadge).toContain('Dual-Fit');
      expect(dualFit.recommendedDuration).toContain('Swing Leg');
      expect(dualFit.compositeScore).toBeCloseTo(85 * 0.40 + fund.score * 0.35 + sentiment.sentimentScore * 0.25, 1);
      expect(dualFit.integratedRationale.length).toBe(4);

      // Investing Compounder: High Fundamentals + Compacting Base (Momentum 65)
      const investingOnly = engine.synthesizeTriadConviction(65, fund, sentiment, 'COMPACTING_BASE');
      expect(investingOnly.primaryRecommendation).toBe('INVESTING_COMPOUNDER');
      expect(investingOnly.recommendationBadge).toContain('Prime Investing');
      expect(investingOnly.recommendedDuration).toBe('6 to 24 Months');
    });

    it('evaluates entire stock setup with full triad conviction and multi-factor rationale', () => {
      const synthetic = engine.generateSyntheticCandles('TRENT', 60);
      const setup = engine.evaluateStock('TRENT', 'Trent Ltd', synthetic);

      expect(setup.sector).toBe('Retail & Consumption');
      expect(setup.suitability).toBeDefined();
      expect(setup.recommendedDuration).toBeDefined();
      expect(setup.fundamental).toBeDefined();
      expect(setup.fundamental.metrics.roce).toBe(24.8);
      expect(setup.sentiment).toBeDefined();
      expect(setup.compositeConviction).toBeDefined();
      expect(setup.compositeConviction.compositeScore).toBeGreaterThan(60);
      expect(setup.rationale.length).toBeGreaterThanOrEqual(8);
    });
  });
});

