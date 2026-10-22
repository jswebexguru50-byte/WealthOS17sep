/**
 * tests/unit/signal_quality_and_risk_guardrails.test.ts
 *
 * Unit test suite verifying Signal Quality Overlay, Independent Evidence Buckets,
 * Adaptive Liquidity, Gap Risk Sizing, and the Capital Preservation State Machine.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSignalQuality,
  calculateEvidenceAdjustment,
  verifySignalAuditRecord,
  getIndependentEvidenceBuckets,
  evaluateSignalQualityOverlay,
  CandidateSignal
} from '../../src/server/services/SignalQualityOverlay.js';
import {
  calculateAdaptivePositionSize,
  evaluateOvernightGapRisk,
  evaluateCapitalPreservationState,
  evaluatePositionExit
} from '../../src/server/services/CapitalProtectionEngine.js';

describe('Signal Quality Overlay & Independent Evidence Buckets', () => {
  it('1. Correctly maps strategies to Independent Evidence Buckets and detects false consensus', () => {
    // S1 (VPA) and S9 (Volume Dry-Up) both reside in Bucket B (Volume / Accumulation)
    const correlatedResult = getIndependentEvidenceBuckets(['S1', 'S9']);
    expect(correlatedResult.bucketCount).toBe(1);
    expect(correlatedResult.activeBuckets).toEqual(['BUCKET_B_VOLUME_ACCUMULATION']);

    // S6 (RS Breakout - Bucket A) + S18 (Block Absorption - Bucket B) = 2 Independent Buckets
    const independentResult = getIndependentEvidenceBuckets(['S6', 'S18']);
    expect(independentResult.bucketCount).toBe(2);
    expect(independentResult.activeBuckets).toContain('BUCKET_A_TREND');
    expect(independentResult.activeBuckets).toContain('BUCKET_B_VOLUME_ACCUMULATION');

    // S6 (Trend) + S13 (Fundamental) + S20 (Structural NEoWave) = 3 Independent Buckets
    const multiPillarResult = getIndependentEvidenceBuckets(['S6', 'S13', 'S20']);
    expect(multiPillarResult.bucketCount).toBe(3);
    expect(multiPillarResult.activeBuckets).toContain('BUCKET_A_TREND');
    expect(multiPillarResult.activeBuckets).toContain('BUCKET_C_CATALYST_FUNDAMENTAL');
    expect(multiPillarResult.activeBuckets).toContain('BUCKET_F_STRUCTURAL');
  });

  it('2. Computes Signal Quality Score within 0-100 range and weights pillars properly', () => {
    const highQuality = calculateSignalQuality({
      strategyCount: 3,
      independentBuckets: 3,
      relativeStrengthPercentile: 90,
      volumeRatio: 2.2,
      regimeScore: 1.0,
      liquidityScore: 1.0,
      eventRiskScore: 1.0,
      forensicScore: 1.0,
      valuationScore: 0.8,
      riskReward: 3.2
    });
    expect(highQuality).toBeGreaterThanOrEqual(85);
    expect(highQuality).toBeLessThanOrEqual(100);

    const poorQuality = calculateSignalQuality({
      strategyCount: 1,
      independentBuckets: 1,
      relativeStrengthPercentile: 45,
      volumeRatio: 0.9,
      regimeScore: 0.3,
      liquidityScore: 0.4,
      eventRiskScore: 0.0,
      forensicScore: 0.2,
      valuationScore: 0.1,
      riskReward: 1.5
    });
    expect(poorQuality).toBeLessThan(50);
  });

  it('3. Rejects candidate signals failing independent bucket criteria (< 2 buckets)', () => {
    const candidate: CandidateSignal = {
      symbol: 'TATASTEEL',
      strategyIds: ['S1', 'S9'], // Both Bucket B
      strategyTriggered: true,
      regimeAllowed: true,
      forensicClean: true,
      liquidityPass: true,
      eventRiskPass: true,
      riskReward: 3.0,
      gapRiskTooHigh: false,
      portfolioConcentrationTooHigh: false,
      positionRiskTooHigh: false,
      qualityInput: {
        strategyCount: 2,
        independentBuckets: 1,
        relativeStrengthPercentile: 80,
        volumeRatio: 1.6,
        regimeScore: 1.0,
        liquidityScore: 1.0,
        eventRiskScore: 1.0,
        forensicScore: 1.0,
        valuationScore: 0.7,
        riskReward: 3.0
      }
    };

    const decision = evaluateSignalQualityOverlay(candidate);
    expect(decision.approved).toBe(false);
    expect(decision.status).toBe('WATCH');
    expect(decision.rejectionReasons.some(r => r.includes('INSUFFICIENT_INDEPENDENT_CONFIRMATION'))).toBe(true);
  });

  it('4. Approves high-conviction signals with >= 2 independent evidence buckets', () => {
    const candidate: CandidateSignal = {
      symbol: 'BHARTIARTL',
      strategyIds: ['S6', 'S18'], // Bucket A (Trend) + Bucket B (Volume)
      strategyTriggered: true,
      regimeAllowed: true,
      forensicClean: true,
      liquidityPass: true,
      eventRiskPass: true,
      riskReward: 3.2,
      gapRiskTooHigh: false,
      portfolioConcentrationTooHigh: false,
      positionRiskTooHigh: false,
      qualityInput: {
        strategyCount: 2,
        independentBuckets: 2,
        relativeStrengthPercentile: 92,
        volumeRatio: 2.1,
        regimeScore: 1.0,
        liquidityScore: 1.0,
        eventRiskScore: 1.0,
        forensicScore: 1.0,
        valuationScore: 0.8,
        riskReward: 3.2
      }
    };

    const decision = evaluateSignalQualityOverlay(candidate);
    expect(decision.approved).toBe(true);
    expect(decision.status).toBe('APPROVED');
    expect(decision.independentBucketsCount).toBe(2);
    expect(decision.qualityScore).toBeGreaterThanOrEqual(75);
  });
});

describe('Capital Protection, Adaptive Liquidity & Risk Guardrails', () => {
  it('5. Enforces multi-constraint position sizing (minimum of risk, liquidity, and concentration)', () => {
    const sizing = calculateAdaptivePositionSize({
      portfolioEquity: 10000000, // ₹1.00 Cr
      entryPrice: 1000,
      stopPrice: 950, // Risk per share = ₹50 (5% stop)
      riskFraction: 0.015, // Max ₹1,50,000 risk (3,000 shares)
      maxPortfolioFraction: 0.08, // Max ₹8,00,000 capital (800 shares)
      advValue: 50000000, // ₹5.00 Cr ADV
      maxAdvParticipation: 0.05 // Max ₹25,00,000 liquidity cap (2,500 shares)
    });

    // Sizing should be constrained by concentration: 800 shares
    expect(sizing.shares).toBe(800);
    expect(sizing.limitingConstraint).toBe('PORTFOLIO_CONCENTRATION');
    expect(sizing.allocatedCapital).toBe(800000);
    expect(sizing.capitalPctOfPortfolio).toBe(8.0);
  });

  it('6. Dynamically restricts position sizing when overnight gap risk exceeds planned stop', () => {
    const normalSizing = calculateAdaptivePositionSize({
      portfolioEquity: 10000000,
      entryPrice: 500,
      stopPrice: 475, // 5% stop distance
      riskFraction: 0.015,
      maxPortfolioFraction: 0.08,
      advValue: 100000000,
      adverseGap95Pct: 3.5 // Gap (3.5%) is less than stop (5.0%) -> No scale-down
    });

    const gapRestrictedSizing = calculateAdaptivePositionSize({
      portfolioEquity: 10000000,
      entryPrice: 500,
      stopPrice: 485, // 3% stop distance
      riskFraction: 0.015,
      maxPortfolioFraction: 0.20, // Research-only high concentration limit so gap-risk is the primary constraint
      allowUnconstrainedConcentrationForResearch: true,
      advValue: 100000000,
      adverseGap95Pct: 8.0 // Gap (8.0%) > Stop (3.0%) -> Scale down!
    });

    expect(gapRestrictedSizing.limitingConstraint).toBe('GAP_RISK_SCALE');
    expect(gapRestrictedSizing.shares).toBeLessThan(normalSizing.sizingBreakdown.riskBasedShares);
  });

  it('7. Correctly transitions through the 5-State Capital Preservation State Machine', () => {
    const normal = evaluateCapitalPreservationState({
      dailyLossPct: 0.5,
      weeklyLossPct: 1.2,
      peakToTroughDrawdownPct: 3.0
    });
    expect(normal.currentState).toBe('NORMAL');
    expect(normal.newTacticalEntriesAllowed).toBe(true);

    const caution = evaluateCapitalPreservationState({
      dailyLossPct: 2.2, // >= 2% daily loss
      weeklyLossPct: 2.2,
      peakToTroughDrawdownPct: 4.0
    });
    expect(caution.currentState).toBe('CAUTION');
    expect(caution.newTacticalEntriesAllowed).toBe(false);

    const defensive = evaluateCapitalPreservationState({
      dailyLossPct: 3.2, // >= 3% daily loss
      weeklyLossPct: 5.5,
      peakToTroughDrawdownPct: 6.0
    });
    expect(defensive.currentState).toBe('DEFENSIVE');
    expect(defensive.exposureCapPct).toBe(50);

    const preservation = evaluateCapitalPreservationState({
      dailyLossPct: 1.0,
      weeklyLossPct: 4.0,
      peakToTroughDrawdownPct: 9.5 // >= 8% drawdown
    });
    expect(preservation.currentState).toBe('CAPITAL_PRESERVATION');
    expect(preservation.newTacticalEntriesAllowed).toBe(false);
    expect(preservation.hedgeRequired).toBe(true);

    const modelReview = evaluateCapitalPreservationState({
      dailyLossPct: 1.0,
      weeklyLossPct: 4.0,
      peakToTroughDrawdownPct: 16.0 // >= 15% drawdown
    });
    expect(modelReview.currentState).toBe('MODEL_REVIEW');
    expect(modelReview.exposureCapPct).toBe(0);
  });

  it('8. Evaluates 4-Tier Exit Architecture (Hard Stop, Thesis Failure, Trailing ATR, Parabolic Exhaustion)', () => {
    // Hard stop violated
    const hardExit = evaluatePositionExit({
      currentPrice: 940,
      initialStop: 950,
      highestPriceSinceEntry: 1020,
      entryPrice: 1000,
      barsInTrade: 5,
      atr14: 20,
      ema20: 980,
      ema50: 950,
      rsi14: 40,
      volumeRatio: 1.0,
      dayHigh: 960,
      dayLow: 935,
      dayClose: 940
    });
    expect(hardExit.action).toBe('EXIT_FULL');
    expect(hardExit.tier).toBe('EXIT_A_HARD_STOP');

    // Confirmed Parabolic Exhaustion (Extension > 30%, RSI > 85, Vol > 3x, lower 35% close)
    const exhaustionExit = evaluatePositionExit({
      currentPrice: 1350,
      initialStop: 950,
      highestPriceSinceEntry: 1380,
      entryPrice: 1000,
      barsInTrade: 15,
      atr14: 25,
      ema20: 1100,
      ema50: 1000, // 35% extension above 50 EMA
      rsi14: 88,
      volumeRatio: 3.4,
      dayHigh: 1380,
      dayLow: 1340,
      dayClose: 1348 // (1348 - 1340) / 40 = 20% in range
    });
    expect(exhaustionExit.action).toBe('SCALE_OUT_50');
    expect(exhaustionExit.tier).toBe('EXIT_C_PARABOLIC_EXHAUSTION');
  });

  it('9. Computes adaptive Delivery Z-Score normalized against 90-day baseline', async () => {
    const { calculateDeliveryZScore } = await import('../../src/server/services/SignalQualityOverlay.js');
    
    // Stable baseline: 90 days around 50% delivery with std ~ 5%
    const baseline: number[] = [];
    for (let i = 0; i < 90; i++) {
      baseline.push(50 + (i % 5) * 2 - 4); // mean 50
    }

    // Normal delivery (52%): z-score near 0.6 -> NORMAL
    const normalRes = calculateDeliveryZScore(52, baseline);
    expect(normalRes.classification).toBe('NORMAL');
    expect(normalRes.zScore).toBeGreaterThan(0.4);

    // High delivery spike (68%): z-score > 2.5 -> EXCEPTIONAL
    const exceptionalRes = calculateDeliveryZScore(68, baseline);
    expect(exceptionalRes.classification).toBe('EXCEPTIONAL');
    expect(exceptionalRes.zScore).toBeGreaterThan(2.5);
    expect(exceptionalRes.normalizedScore).toBeGreaterThanOrEqual(85);
  });

  it('10. Enforces Portfolio Correlation Guardrail (8% stock cap, 25% sector cap, 30% cluster cap)', async () => {
    const { evaluatePortfolioCorrelationGuard } = await import('../../src/server/services/CapitalProtectionEngine.js');

    const existingPortfolio = [
      { symbol: 'SBIN', sector: 'Financial Services', allocationPct: 7.0 },
      { symbol: 'PNB', sector: 'Financial Services', allocationPct: 6.0 },
      { symbol: 'BANKBARODA', sector: 'Financial Services', allocationPct: 6.0 },
      { symbol: 'TATAMOTORS', sector: 'Automobile', allocationPct: 7.5 }
    ];

    // Single stock cap violation: Adding 2% to TATAMOTORS (7.5 + 2 = 9.5% > 8%)
    const stockCapViolation = evaluatePortfolioCorrelationGuard(existingPortfolio, 'TATAMOTORS', 'Automobile', 2.0);
    expect(stockCapViolation.allowed).toBe(false);
    expect(stockCapViolation.rejectionReason).toContain('SINGLE_STOCK_CEILING');

    // Sector cap violation: Financial Services already at 19%, adding 7% = 26% > 25%
    const sectorCapViolation = evaluatePortfolioCorrelationGuard(existingPortfolio, 'CANBK', 'Financial Services', 7.0);
    expect(sectorCapViolation.allowed).toBe(false);
    expect(sectorCapViolation.rejectionReason).toContain('SECTOR_CEILING');

    // Valid allocation within limits: Adding 5% in Healthcare
    const validAlloc = evaluatePortfolioCorrelationGuard(existingPortfolio, 'CIPLA', 'Healthcare', 5.0);
    expect(validAlloc.allowed).toBe(true);
    expect(validAlloc.proposedStockWeight).toBe(5.0);
  });

  it('11. S10 Intraday ORB Confirmation: Requires 15-min close > opening high and RVOL >= 1.5', async () => {
    const { evaluateS10_IntradayORBConfirmation } = await import('../../src/server/services/NewTechnicalStrategiesEngine.js');

    const mockIntraday = [
      { timestamp: '09:15', open: 100, high: 105, low: 99, close: 103, volume: 50000 },
      // Candle 2 wicks above 105 to 106 but closes at 104 (intra-candle wick trap)
      { timestamp: '09:30', open: 103, high: 106, low: 102, close: 104, volume: 60000 },
      // Candle 3 closes decisively above 105 at 107.5 on 80,000 volume (RVOL = 1.6x)
      { timestamp: '09:45', open: 104, high: 108, low: 104, close: 107.5, volume: 80000 }
    ];

    const confirmedResult = evaluateS10_IntradayORBConfirmation('TCS', mockIntraday, true, true, 50000);
    expect(confirmedResult.confirmed).toBe(true);
    expect(confirmedResult.status).toBe('CONFIRMED');
    expect(confirmedResult.openingRangeHigh).toBe(105);
    expect(confirmedResult.breakoutClose).toBe(107.5);
    expect(confirmedResult.rvol).toBeGreaterThanOrEqual(1.5);
  });

  it('12. Generates Machine-Readable Signal Audit Record for complete production traceability', async () => {
    const { generateSignalAuditRecord, evaluateSignalQualityOverlay } = await import('../../src/server/services/SignalQualityOverlay.js');

    const decision = evaluateSignalQualityOverlay({
      symbol: 'HFCL',
      strategyIds: ['S6', 'S18'],
      strategyTriggered: true,
      regimeAllowed: true,
      forensicClean: true,
      liquidityPass: true,
      eventRiskPass: true,
      riskReward: 3.1,
      gapRiskTooHigh: false,
      portfolioConcentrationTooHigh: false,
      positionRiskTooHigh: false,
      qualityInput: {
        strategyCount: 2,
        independentBuckets: 2,
        relativeStrengthPercentile: 85,
        volumeRatio: 2.1,
        regimeScore: 1.0,
        liquidityScore: 1.0,
        eventRiskScore: 1.0,
        forensicScore: 1.0,
        valuationScore: 0.8,
        riskReward: 3.1
      }
    });

    const auditRecord = generateSignalAuditRecord({
      symbol: 'HFCL',
      companyName: 'HFCL Limited',
      strategyIds: ['S6', 'S18'],
      regime: 'BULLISH_EXPANSION',
      relativeStrengthPercentile: 85,
      volumeRatio: 2.1,
      riskReward: 3.1,
      gapRiskTooHigh: false,
      sectorExposurePct: 12.5,
      portfolioExposurePct: 4.5,
      overlayDecision: decision
    });

    expect(auditRecord.symbol).toBe('HFCL');
    expect(auditRecord.decision).toBe('APPROVED');
    expect(auditRecord.executionTicketAllowed).toBe(true);
    expect(auditRecord.independentEvidenceBuckets).toBe(2);
    expect(auditRecord.signalQualityScore).toBeGreaterThanOrEqual(70);
    expect(auditRecord.timestamp).toBeDefined();
  });

  it('13. TC-KILL: Strategy Kill Switch quarantines strategy after 6 consecutive losses or 1.5x expected drawdown breach', async () => {
    const { evaluateStrategyKillSwitch } = await import('../../src/server/services/CapitalProtectionEngine.js');

    // TC-KILL-001: 6 consecutive losses
    const lossStreakProfile = {
      strategyId: 'S5_50_EMA_PULLBACK',
      totalTrades: 45,
      consecutiveLosses: 6,
      expectancyR: 0.85,
      profitFactor: 1.45,
      winRate: 48,
      avgWinR: 2.5,
      avgLossR: 1.0,
      maxDrawdownPct: 8.5,
      currentDrawdownPct: 7.2,
      expectedMaxDrawdownPct: 10.0,
      regimeStats: {},
      sectorStats: {},
      lastUpdated: '2026-09-16',
      status: 'ACTIVE' as const
    };

    const killDecision1 = evaluateStrategyKillSwitch(lossStreakProfile);
    expect(killDecision1.killSwitchTriggered).toBe(true);
    expect(killDecision1.action).toBe('QUARANTINE_PAUSE');
    expect(killDecision1.status).toBe('QUARANTINED');
    expect(killDecision1.quarantineDays).toBe(20);

    // TC-KILL-002: Drawdown exceeds 1.5x expected max (16% > 1.5 * 10% = 15%)
    const drawdownBreachProfile = {
      ...lossStreakProfile,
      consecutiveLosses: 2,
      currentDrawdownPct: 16.5,
      expectedMaxDrawdownPct: 10.0
    };

    const killDecision2 = evaluateStrategyKillSwitch(drawdownBreachProfile);
    expect(killDecision2.killSwitchTriggered).toBe(true);
    expect(killDecision2.action).toBe('QUARANTINE_PAUSE');
    expect(killDecision2.rejectionReason).toContain('Current drawdown 16.5% exceeds 1.5x expected max');

    // TC-KILL-003: Sub-par expectancy degrades status to DEGRADED
    const subParProfile = {
      ...lossStreakProfile,
      consecutiveLosses: 1,
      currentDrawdownPct: 4.0,
      expectancyR: -0.05,
      profitFactor: 0.85
    };

    const subParDecision = evaluateStrategyKillSwitch(subParProfile);
    expect(subParDecision.killSwitchTriggered).toBe(false);
    expect(subParDecision.action).toBe('DEGRADE_HALF_SIZE');
    expect(subParDecision.status).toBe('DEGRADED');
  });

  it('14. TC-COST: Indian statutory & institutional transaction cost model calculates true post-friction net PnL', async () => {
    const { calculateTransactionCost } = await import('../../src/server/services/CapitalProtectionEngine.js');

    // Buy 500 shares at 1000, sell at 1100 (Gross PnL = +50,000)
    // 30D ADV = 10 Cr (100,000,000) -> Trade size = 500k = 0.5% of ADV (low slippage: 0.08%)
    const costBreakdown = calculateTransactionCost({
      entryPrice: 1000,
      exitPrice: 1100,
      shares: 500,
      advValue: 100000000,
      tradeType: 'DELIVERY'
    });

    expect(costBreakdown.buyTurnover).toBe(500000);
    expect(costBreakdown.sellTurnover).toBe(550000);
    expect(costBreakdown.totalTurnover).toBe(1050000);
    // STT for delivery = 0.1% of total turnover = 1,050
    expect(costBreakdown.stt).toBe(1050);
    // Brokerage capped at ₹20 per leg = ₹40 total
    expect(costBreakdown.brokerage).toBe(40);
    // Stamp duty = 0.015% of buy = 75
    expect(costBreakdown.stampDuty).toBe(75);
    // Total frictional cost > 0
    expect(costBreakdown.totalFrictionalCost).toBeGreaterThan(1500);
    expect(costBreakdown.frictionalCostPct).toBeGreaterThan(0.15);
    // Net realized PnL = Gross PnL (50,000) - Total frictional cost
    expect(costBreakdown.grossPnL).toBe(50000);
    expect(costBreakdown.netRealizedPnL).toBeLessThan(50000);
    expect(costBreakdown.netRealizedPnL).toBe(50000 - costBreakdown.totalFrictionalCost);
  });

  it('15. TC-FALSE: False Breakout Metric correctly flags trades failing to reach +1R before hitting -1R', async () => {
    const { evaluateFalseBreakout } = await import('../../src/server/services/CapitalProtectionEngine.js');

    // Breakout at 100, stop at 95 (1R = 5 pts, +1R target = 105, -1R stop = 95)
    // Day 1: 101, Day 2: 102, Day 3: dumps to 94 (hits -1R without reaching 105)
    const falseBreakout = evaluateFalseBreakout({
      breakoutPrice: 100,
      stopPrice: 95,
      sessionCloses: [101, 101.5, 94.5],
      sessionHighs: [102, 102.5, 98],
      sessionLows: [99.5, 99, 94]
    });

    expect(falseBreakout.isFalseBreakout).toBe(true);
    expect(falseBreakout.sessionsToFailure).toBe(3);
    expect(falseBreakout.maxRReached).toBe(0.5); // (102.5 - 100) / 5 = 0.5R
    expect(falseBreakout.explanation).toContain('FALSE_BREAKOUT: Failed at session 3');

    // Genuine breakout: Day 1: 102, Day 2: 106 (+1R reached)
    const genuineBreakout = evaluateFalseBreakout({
      breakoutPrice: 100,
      stopPrice: 95,
      sessionCloses: [102, 106],
      sessionHighs: [103, 107],
      sessionLows: [99.5, 101]
    });

    expect(genuineBreakout.isFalseBreakout).toBe(false);
    expect(genuineBreakout.maxRReached).toBeGreaterThanOrEqual(1.0);
    expect(genuineBreakout.explanation).toContain('GENUINE_BREAKOUT');
  });

  it('16. UpstoxIntradayIngestor: Evaluates 15m ORB confirmation and returns structured result', async () => {
    const { UpstoxIntradayIngestor } = await import('../../src/server/services/UpstoxIntradayIngestor.js');
    const ingestor = UpstoxIntradayIngestor.getInstance();

    const result = await ingestor.get15MinORBStatus('RELIANCE', true, true, 50000);
    expect(result.symbol).toBe('RELIANCE');
    expect(result.timeframe).toBe('15m');
    expect(['CONFIRMED', 'WATCH', 'REJECT', 'DATA_UNAVAILABLE']).toContain(result.status);
  });

  it('17. TC-FALSE-002: Intrabar ambiguity detection and conservative order resolution', async () => {
    const { evaluateFalseBreakout } = await import('../../src/server/services/CapitalProtectionEngine.js');

    // Scenario: High reaches +1R (110) AND Low touches -1R (90) on Day 1
    const ambiguousCandle = evaluateFalseBreakout({
      breakoutPrice: 100,
      stopPrice: 90, // 1R = 10 pts. +1R target = 110
      sessionHighs: [112],
      sessionLows: [88],
      sessionCloses: [102],
      orderingPolicy: 'CONSERVATIVE' // Conservative policy: assume stop hit before target
    });

    expect(ambiguousCandle.hasIntrabarAmbiguity).toBe(true);
    expect(ambiguousCandle.isFalseBreakout).toBe(true);
    expect(ambiguousCandle.explanation).toContain('AMBIGUOUS_INTRABAR_ORDER');
  });

  it('18. TC-GAP-002: Multi-Tier Gap Stress Framework distinguishes G50, G90, G95, and G99', async () => {
    const { calculateAdaptivePositionSize } = await import('../../src/server/services/CapitalProtectionEngine.js');

    // Stop distance = (1000 - 950) / 1000 = 5%
    // Case A: Low gap risk (G95 = 3.5% < 5% stop) -> NORMAL
    const normalSizing = calculateAdaptivePositionSize({
      portfolioEquity: 1000000,
      entryPrice: 1000,
      stopPrice: 950,
      maxPortfolioFraction: 0.25,
      allowUnconstrainedConcentrationForResearch: true,
      advValue: 200000000,
      gapPercentiles: { g50: 1.2, g90: 2.8, g95: 3.5, g99: 4.8 }
    });
    expect(normalSizing.gapRiskTier).toBe('NORMAL');

    // Case B: Moderate gap risk (G95 = 6.5% > 5% stop, G99 <= 7.5%) -> REDUCED
    const reducedSizing = calculateAdaptivePositionSize({
      portfolioEquity: 1000000,
      entryPrice: 1000,
      stopPrice: 950,
      maxPortfolioFraction: 0.25,
      allowUnconstrainedConcentrationForResearch: true,
      advValue: 200000000,
      gapPercentiles: { g50: 2.5, g90: 5.5, g95: 6.5, g99: 7.2 }
    });
    expect(reducedSizing.gapRiskTier).toBe('REDUCED');
    expect(reducedSizing.shares).toBeLessThan(normalSizing.shares);

    // Case C: High tail gap risk (G99 = 15.0% > 2x stop) -> RESTRICTED
    const restrictedSizing = calculateAdaptivePositionSize({
      portfolioEquity: 1000000,
      entryPrice: 1000,
      stopPrice: 950,
      maxPortfolioFraction: 0.25,
      allowUnconstrainedConcentrationForResearch: true,
      advValue: 200000000,
      gapPercentiles: { g50: 3.5, g90: 8.0, g95: 11.0, g99: 15.0 }
    });
    expect(restrictedSizing.gapRiskTier).toBe('RESTRICTED');
    expect(restrictedSizing.shares).toBeLessThan(reducedSizing.shares);
  });

  it('19. TC-AUDIT-002: Cryptographic SHA-256 hash chaining establishes immutable audit trail', async () => {
    const { generateSignalAuditRecord } = await import('../../src/server/services/SignalQualityOverlay.js');

    const mockDecision: any = {
      approved: true,
      status: 'APPROVED',
      qualityScore: 88,
      independentBucketsCount: 3,
      activeBuckets: ['BUCKET_A_TREND', 'BUCKET_B_VOLUME_ACCUMULATION', 'BUCKET_F_STRUCTURAL'],
      rejectionReasons: []
    };

    // First record in chain
    const rec1 = generateSignalAuditRecord({
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      strategyIds: ['S6', 'S18', 'S21'],
      regime: 'BULLISH_EXPANSION',
      relativeStrengthPercentile: 92,
      volumeRatio: 2.4,
      riskReward: 3.5,
      gapRiskTooHigh: false,
      sectorExposurePct: 8.0,
      portfolioExposurePct: 4.0,
      overlayDecision: mockDecision
    });

    expect(rec1.recordHash).toBeDefined();
    expect(rec1.recordHash.length).toBe(64); // SHA-256 hex string

    // Second record in chain referencing rec1
    const rec2 = generateSignalAuditRecord({
      symbol: 'INFY',
      companyName: 'Infosys Limited',
      strategyIds: ['S6', 'S22'],
      regime: 'BULLISH_EXPANSION',
      relativeStrengthPercentile: 88,
      volumeRatio: 1.8,
      riskReward: 3.0,
      gapRiskTooHigh: false,
      sectorExposurePct: 12.0,
      portfolioExposurePct: 4.0,
      overlayDecision: mockDecision,
      previousRecordHash: rec1.recordHash
    });

    expect(rec2.previousRecordHash).toBe(rec1.recordHash);
    expect(rec2.recordHash).not.toBe(rec1.recordHash);
  });

  it('20. TC-PROFILE-001: Strategy-Specific Quality Profiles prevent penalizing momentum breakouts for zero valuation MOS', async () => {
    const { calculateSignalQuality, STRATEGY_QUALITY_PROFILES } = await import('../../src/server/services/SignalQualityOverlay.js');

    // A pure momentum breakout with high RS, heavy volume, high RR, clean regime and forensic,
    // but 0 valuation score (trading at all-time high P/E or beyond conservative DCF)
    const momentumInput = {
      strategyCount: 3,
      independentBuckets: 3,
      relativeStrengthPercentile: 94,
      volumeRatio: 2.8,
      regimeScore: 1.0,
      liquidityScore: 1.0,
      eventRiskScore: 1.0,
      forensicScore: 1.0,
      valuationScore: 0.0, // 0 Margin of Safety
      riskReward: 3.4
    };

    // Under default BALANCED profile (where valuation has 5-10 pts), score is discounted
    const balancedScore = calculateSignalQuality(momentumInput);

    // Under MOMENTUM profile (valuation weight = 0, weight redistributed to RS, Buckets, and Volume)
    const momentumProfileScore = calculateSignalQuality(momentumInput, STRATEGY_QUALITY_PROFILES.MOMENTUM);

    expect(momentumProfileScore).toBeGreaterThan(balancedScore);
    expect(momentumProfileScore).toBeGreaterThanOrEqual(85); // High conviction approval preserved
  });

  it('21. TC-RISK-003: Production concentration request above 8% is hard-clamped to 8%', () => {
    const sizing = calculateAdaptivePositionSize({
      portfolioEquity: 10000000, entryPrice: 1000, stopPrice: 950,
      riskFraction: 0.02, maxPortfolioFraction: 0.50, advValue: 100000000
    });
    expect(sizing.capitalPctOfPortfolio).toBeLessThanOrEqual(8.0);
    expect(sizing.shares).toBe(800);
  });

  it('22. TC-RISK-004: Research concentration override is explicit and isolated', () => {
    const sizing = calculateAdaptivePositionSize({
      portfolioEquity: 10000000, entryPrice: 1000, stopPrice: 990,
      riskFraction: 0.005, maxPortfolioFraction: 0.20, advValue: 100000000,
      allowUnconstrainedConcentrationForResearch: true
    });
    expect(sizing.capitalPctOfPortfolio).toBeGreaterThan(8.0);
  });

  it('23. TC-QUALITY-003: Empirical redundancy reduces correlated consensus score', () => {
    const input = {
      strategyCount: 2, independentBuckets: 2, relativeStrengthPercentile: 90, volumeRatio: 2.0,
      regimeScore: 1, liquidityScore: 1, eventRiskScore: 1, forensicScore: 1, valuationScore: 1, riskReward: 3.5
    };
    const correlatedFactor = calculateEvidenceAdjustment(['S1','S9'], 10).redundancyFactor;
    const independentFactor = calculateEvidenceAdjustment(['S6','S18'], 10).redundancyFactor;
    const correlated = calculateSignalQuality(input, undefined, correlatedFactor);
    const independent = calculateSignalQuality(input, undefined, independentFactor);
    expect(correlatedFactor).toBeLessThan(1);
    expect(correlated).toBeLessThan(independent);
  });

  it('24. TC-AUDIT-003: Tampering with auditable fields invalidates the record hash', async () => {
    const { generateSignalAuditRecord } = await import('../../src/server/services/SignalQualityOverlay.js');
    const decision: any = { approved: true, status: 'APPROVED', qualityScore: 80, independentBucketsCount: 2, activeBuckets: ['BUCKET_A_TREND','BUCKET_B_VOLUME_ACCUMULATION'], rejectionReasons: [] };
    const record = generateSignalAuditRecord({ symbol: 'TESTAUDIT', companyName: 'Test', strategyIds: ['S6','S18'], regime: 'BULLISH_EXPANSION', relativeStrengthPercentile: 90, volumeRatio: 2, riskReward: 3, gapRiskTooHigh: false, sectorExposurePct: 5, portfolioExposurePct: 5, overlayDecision: decision });
    expect(verifySignalAuditRecord(record)).toBe(true);
    const fields: (keyof typeof record)[] = ['symbol','regime','signalQualityScore','volumeRatio','riskReward','executionTicketAllowed'];
    for (const field of fields) {
      const tampered: any = { ...record };
      tampered[field] = typeof tampered[field] === 'number' ? tampered[field] + 1 : (typeof tampered[field] === 'boolean' ? !tampered[field] : `${tampered[field]}-TAMPERED`);
      expect(verifySignalAuditRecord(tampered)).toBe(false);
    }
  });

  it('25. TC-STATE-003: Capital preservation accepts numeric and object inputs', () => {
    expect(evaluateCapitalPreservationState(100, 94).currentState).toBe('DEFENSIVE');
    expect(evaluateCapitalPreservationState({ peakToTroughDrawdownPct: 8.0 }).currentState).toBe('CAPITAL_PRESERVATION');
    expect(evaluateCapitalPreservationState({ dailyLossPct: 6.0 }).currentState).toBe('MODEL_REVIEW');
  });

});


