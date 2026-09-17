import {
  MacroLiquidityMetrics,
  MacroRegimeState,
  MacroRegimeV5,
  PositionSizingInput,
  PositionSizingOutput,
  EPVValuationInput,
  EPVValuationOutput,
  Level2OrderBook,
  OrderBookImbalanceOutput,
  EpisodicPivotInput,
  EpisodicPivotOutput,
  LimitPullbackEntryResult,
  DisplacementQualityScore,
  OrderBlockDecayModel,
  S13EarningsAccelerationInput,
  S13EarningsAccelerationResult,
} from '../types';

// ============================================================================
// 1. MACRO REGIME & VOLATILITY CLASSIFIER SERVICE
// ============================================================================
export function classifyMacroRegimeV5(metrics: MacroLiquidityMetrics): MacroRegimeState {
  const {
    nifty50,
    nifty50Ema50,
    nifty50Sma200,
    breadthAbove200SmaPct,
    advanceDeclineRatio,
    indiaVix,
    vixTermStructure,
    fiiNetFlow10DayCr,
    us10YRealYieldPct,
  } = metrics;

  // Compute Macro Liquidity Index (MLI)
  const fiiComponent = Math.min(100, Math.max(-100, fiiNetFlow10DayCr / 250)); // Scale 25,000 Cr to 100
  const yieldComponent = (2.0 - us10YRealYieldPct) * 25; // Lower yields boost liquidity
  const breadthComponent = (breadthAbove200SmaPct - 50) * 2;
  const mliScore = Math.round((fiiComponent * 0.4) + (yieldComponent * 0.3) + (breadthComponent * 0.3));

  let currentRegime: MacroRegimeV5 = 'SIDEWAYS_RANGE';
  let activeStrategyIds: string[] = ['S5', 'S7', 'S10'];
  let maxPortfolioEquityExposurePct = 50;
  let hedgingRequired = false;

  // State 5: Systemic Tail-Risk Crisis
  if (indiaVix >= 32.0 || (vixTermStructure === 'BACKWARDATION' && indiaVix >= 28.0)) {
    currentRegime = 'SYSTEMIC_TAIL_RISK_CRISIS';
    activeStrategyIds = ['S7', 'SHORT_FUTURES_HEDGE'];
    maxPortfolioEquityExposurePct = 0; // 100% Cash/Sovereign debt
    hedgingRequired = true;
  }
  // State 4: Bearish Correction
  else if (nifty50 < nifty50Ema50 && breadthAbove200SmaPct < 40.0 && advanceDeclineRatio < 0.70) {
    currentRegime = 'BEARISH_CORRECTION';
    activeStrategyIds = ['S7', 'S10']; // Pause trend breakouts S1-S6
    maxPortfolioEquityExposurePct = 20;
    hedgingRequired = true;
  }
  // State 2: High-Beta Volatility Expansion
  else if (nifty50 >= nifty50Sma200 && indiaVix >= 22.0) {
    currentRegime = 'HIGH_BETA_VOLATILITY_EXPANSION';
    activeStrategyIds = ['S1', 'S6', 'S10', 'S12', 'OPTION_CREDIT_SPREADS'];
    maxPortfolioEquityExposurePct = 70;
    hedgingRequired = false;
  }
  // State 1: Bullish Expansion
  else if (nifty50 >= nifty50Ema50 && nifty50Ema50 >= nifty50Sma200 && breadthAbove200SmaPct >= 60.0 && indiaVix < 20.0) {
    currentRegime = 'BULLISH_EXPANSION';
    activeStrategyIds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S8', 'S10', 'S11', 'S12'];
    maxPortfolioEquityExposurePct = 100;
    hedgingRequired = false;
  }
  // State 3: Sideways Range (Default)
  else {
    currentRegime = 'SIDEWAYS_RANGE';
    activeStrategyIds = ['S5', 'S7', 'S10', 'S12'];
    maxPortfolioEquityExposurePct = 50;
    hedgingRequired = false;
  }

  return {
    currentRegime,
    activeStrategyIds,
    maxPortfolioEquityExposurePct,
    hedgingRequired,
    metrics: { ...metrics, macroLiquidityIndex: mliScore },
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 2. FRACTIONAL KELLY & ATR RISK PARITY POSITION SIZING ENGINE
// ============================================================================
export function calculatePositionSizeV5(input: PositionSizingInput): PositionSizingOutput {
  const {
    portfolioEquity,
    entryPrice,
    atr14,
    historicalWinRatePct,
    rewardToRiskRatio,
    stopLossDistancePrice,
  } = input;

  const winRate = historicalWinRatePct / 100;
  const lossRate = 1 - winRate;

  // Full Kelly Criterion = [ W - (L / R) ]
  const fullKelly = winRate - (lossRate / rewardToRiskRatio);
  // Half Kelly (Fractional 0.5x for safety)
  const fractionalKelly = Math.max(0.01, Math.min(0.25, 0.5 * fullKelly));

  // Hard risk cap: Never risk more than 2.0% of portfolio equity on a single trade
  const MAX_SINGLE_TRADE_RISK_PCT = 0.02;
  const maxRiskAmount = portfolioEquity * MAX_SINGLE_TRADE_RISK_PCT;

  // Risk per share based on ATR or explicit stop loss
  const riskPerShare = Math.max(stopLossDistancePrice, 2.5 * atr14);
  
  // Shares derived from risk cap
  const sharesFromRiskCap = Math.floor(maxRiskAmount / riskPerShare);

  // Shares derived from Kelly allocation cap
  const maxKellyCapital = portfolioEquity * fractionalKelly;
  const sharesFromKellyCap = Math.floor(maxKellyCapital / entryPrice);

  // Final recommended shares is the conservative minimum
  const recommendedShares = Math.max(1, Math.min(sharesFromRiskCap, sharesFromKellyCap));
  const totalCapitalAllocation = recommendedShares * entryPrice;
  const capitalAllocationPct = (totalCapitalAllocation / portfolioEquity) * 100;
  const actualRiskAmount = recommendedShares * riskPerShare;
  const riskPctOfEquity = (actualRiskAmount / portfolioEquity) * 100;

  return {
    fractionalKellyFactor: Number(fractionalKelly.toFixed(4)),
    recommendedShares,
    totalCapitalAllocation: Number(totalCapitalAllocation.toFixed(2)),
    capitalAllocationPct: Number(capitalAllocationPct.toFixed(2)),
    maxRiskAmount: Number(actualRiskAmount.toFixed(2)),
    riskPctOfEquity: Number(riskPctOfEquity.toFixed(2)),
    atrStopLossPrice: Number((entryPrice - riskPerShare).toFixed(2)),
  };
}

// ============================================================================
// 3. EARNING POWER VALUE (EPV) VS. DCF VALUATION TRIANGULATION
// ============================================================================
export function calculateEPVValuationV5(input: EPVValuationInput): EPVValuationOutput {
  const {
    ticker,
    ebitCr,
    taxRatePct,
    depreciationCr,
    maintenanceCapexCr,
    sbcExpenseCr,
    operatingLeaseCommitments7YrCr,
    netDebtCr,
    waccPct,
    dcfIntrinsicValuePerShare,
    totalSharesOutstandingCr,
    currentStockPrice,
  } = input;

  const taxRate = taxRatePct / 100;
  const wacc = waccPct / 100;

  // Adjusted NOPAT = EBIT * (1 - T) + Depr - Maint Capex - SBC Dilution
  const rawNopat = ebitCr * (1 - taxRate);
  const adjustedNopatCr = rawNopat + depreciationCr - maintenanceCapexCr - sbcExpenseCr;

  // Earning Power Value (EPV) = Adjusted NOPAT / WACC
  const epvEnterpriseValueCr = adjustedNopatCr / wacc;
  const epvEquityValueCr = epvEnterpriseValueCr - netDebtCr;
  const epvPerShare = epvEquityValueCr / totalSharesOutstandingCr;

  // Capitalized Operating Leases (IND-AS 116): 7-year commitment discounted at 6.0%
  const leaseDiscountRate = 0.06;
  const capitalizedLeaseLiabilityCr = operatingLeaseCommitments7YrCr * (1 - Math.pow(1 + leaseDiscountRate, -7)) / leaseDiscountRate;
  const adjustedEnterpriseValueCr = (currentStockPrice * totalSharesOutstandingCr) + netDebtCr + capitalizedLeaseLiabilityCr;

  // Growth Value Premium = (DCF - EPV) / DCF * 100
  const growthValuePremiumPct = dcfIntrinsicValuePerShare > 0
    ? ((dcfIntrinsicValuePerShare - epvPerShare) / dcfIntrinsicValuePerShare) * 100
    : 0;

  let valuationGateStatus: 'EPV_MOAT_BUY' | 'SPECULATIVE_GROWTH_WARNING' | 'OVERVALUED_TRAP' = 'SPECULATIVE_GROWTH_WARNING';

  if (currentStockPrice <= epvPerShare) {
    valuationGateStatus = 'EPV_MOAT_BUY'; // Buying steady-state cash flow at zero growth cost
  } else if (growthValuePremiumPct > 45.0) {
    valuationGateStatus = 'SPECULATIVE_GROWTH_WARNING'; // Price relies heavily on unproven future growth
  } else if (currentStockPrice > dcfIntrinsicValuePerShare * 1.2) {
    valuationGateStatus = 'OVERVALUED_TRAP';
  }

  return {
    ticker,
    adjustedNopatCr: Number(adjustedNopatCr.toFixed(2)),
    earningPowerValueCr: Number(epvEquityValueCr.toFixed(2)),
    epvPerShare: Number(epvPerShare.toFixed(2)),
    capitalizedLeaseLiabilityCr: Number(capitalizedLeaseLiabilityCr.toFixed(2)),
    adjustedEnterpriseValueCr: Number(adjustedEnterpriseValueCr.toFixed(2)),
    dcfIntrinsicValuePerShare: Number(dcfIntrinsicValuePerShare.toFixed(2)),
    growthValuePremiumPct: Number(growthValuePremiumPct.toFixed(2)),
    valuationGateStatus,
    piotroskiFScore: 8, // Placeholder for score pipeline
    altmanZScore: 3.45,
    beneishMScore: -2.85,
  };
}

// ============================================================================
// 4. LEVEL-2 ORDER BOOK IMBALANCE (OBI) MICROSTRUCTURE GATE
// ============================================================================
export function evaluateOrderBookImbalanceV5(orderBook: Level2OrderBook): OrderBookImbalanceOutput {
  const totalBidVolume = orderBook.bids.slice(0, 5).reduce((acc, b) => acc + b.quantity, 0);
  const totalAskVolume = orderBook.asks.slice(0, 5).reduce((acc, a) => acc + a.quantity, 0);

  const totalVolume = totalBidVolume + totalAskVolume;
  const obiRatio = totalVolume > 0 ? (totalBidVolume - totalAskVolume) / totalVolume : 0;

  const isInstitutionalBuyAggression = obiRatio >= 0.35;

  return {
    totalBidVolume,
    totalAskVolume,
    obiRatio: Number(obiRatio.toFixed(4)),
    isInstitutionalBuyAggression,
    passMicrostructureGate: isInstitutionalBuyAggression,
  };
}

// ============================================================================
// 5. STRATEGY S12: EPISODIC PIVOT GAP-UP MOMENTUM
// ============================================================================
export function evaluateEpisodicPivotS12(input: EpisodicPivotInput): EpisodicPivotOutput {
  const {
    ticker,
    gapUpPct,
    opening5MinVolume,
    average50DayVolume,
    opening5MinHigh,
    opening5MinLow,
    currentPrice,
    hasPositiveEarningsOrCapexSurprise,
  } = input;

  const volumeRatio = opening5MinVolume / (average50DayVolume / 75); // Normalized 5-min volume vs daily average
  const isVolumeSurgeValid = volumeRatio >= 3.5;
  const isGapValid = gapUpPct >= 4.5;

  if (!isGapValid || !isVolumeSurgeValid || !hasPositiveEarningsOrCapexSurprise) {
    return {
      isSetupValid: false,
      entryTriggerPrice: opening5MinHigh,
      stopLossPrice: opening5MinLow,
      targetPrice1: opening5MinHigh + (opening5MinHigh - opening5MinLow) * 2,
      recommendedShares: 0,
      reason: `Failed filters: Gap (${gapUpPct.toFixed(1)}% vs >=4.5%), VolRatio (${volumeRatio.toFixed(1)}x vs >=3.5x), Surprise (${hasPositiveEarningsOrCapexSurprise})`,
    };
  }

  const riskPerShare = opening5MinHigh - opening5MinLow;
  const targetPrice1 = opening5MinHigh + (riskPerShare * 2.0); // 1:2 R:R

  return {
    isSetupValid: true,
    entryTriggerPrice: opening5MinHigh,
    stopLossPrice: opening5MinLow,
    targetPrice1: Number(targetPrice1.toFixed(2)),
    recommendedShares: Math.floor(100000 / riskPerShare),
    reason: `Valid S12 Episodic Pivot! Gap-up +${gapUpPct}% with ${volumeRatio.toFixed(1)}x institutional volume surge.`,
  };
}

// ============================================================================
// 6. STRATEGY S1 ENHANCEMENT: LIMIT PULLBACK ENTRY (LPE) & FAST BREAKEVEN
// ============================================================================

export function calculateLimitPullbackEntryV6(
  breakoutPrice: number,
  baseHigh: number,
  atr14: number,
  stockReturn63d: number,
  indexReturn63d: number,
  ema21: number
): LimitPullbackEntryResult {
  // Tranche A: 35% on breakout close
  const trancheAPrice = breakoutPrice;
  // Tranche B: 65% limit order on base ceiling retest (baseHigh +/- 0.3%)
  const trancheBPrice = Number((baseHigh * 1.002).toFixed(2));
  
  // Blended average entry (assuming both tranches fill or weighted potential)
  const blendedEntryPrice = Number(((trancheAPrice * 0.35) + (trancheBPrice * 0.65)).toFixed(2));
  
  // Mansfield Relative Strength Score vs Index
  const rsRatio = indexReturn63d !== 0 ? stockReturn63d / indexReturn63d : 1.0;
  const mansfieldRsScore = Number(((rsRatio - 1.0) * 100).toFixed(2));
  const mansfieldRsPassed = mansfieldRsScore > 0;

  // Fast Breakeven Trigger Price (+5.0% from blended entry)
  const fastBreakevenPrice = Number((blendedEntryPrice * 1.05).toFixed(2));

  // Dynamic ATR Target Ladder
  const t1 = Number((blendedEntryPrice + (1.8 * atr14)).toFixed(2));
  const t2 = Number((blendedEntryPrice + (3.2 * atr14)).toFixed(2));
  const t3TrailingEma = ema21;

  return {
    trancheAPrice,
    trancheBPrice,
    blendedEntryPrice,
    mansfieldRsScore,
    mansfieldRsPassed,
    fastBreakevenPrice,
    dynamicTargetLadder: {
      t1,
      t2,
      t3TrailingEma,
    },
  };
}

// ============================================================================
// 7. STRATEGY S2 ENHANCEMENT: DISPLACEMENT QUALITY SCORE (DQS)
// ============================================================================
export function evaluateDisplacementQualityScoreV6(
  candleBody: number,
  atr14: number,
  volume: number,
  volumeSma20: number,
  htfOrderBlockConfluence: boolean
): DisplacementQualityScore {
  const bodyToAtrRatio = atr14 > 0 ? Number((candleBody / atr14).toFixed(2)) : 1.0;
  const volumeToSmaRatio = volumeSma20 > 0 ? Number((volume / volumeSma20).toFixed(2)) : 1.0;

  let displacementScore = 0;
  if (bodyToAtrRatio >= 1.8) displacementScore += 35;
  else if (bodyToAtrRatio >= 1.4) displacementScore += 20;

  if (volumeToSmaRatio >= 2.2) displacementScore += 35;
  else if (volumeToSmaRatio >= 1.5) displacementScore += 20;

  if (htfOrderBlockConfluence) displacementScore += 30;

  const isInstitutionalGrade = displacementScore >= 70;

  return {
    bodyToAtrRatio,
    volumeToSmaRatio,
    htfOrderBlockConfluence,
    displacementScore,
    isInstitutionalGrade,
  };
}

// ============================================================================
// 8. SMC ENHANCEMENT: ORDER BLOCK FRESHNESS DECAY & BREAKER INVERSION
// ============================================================================
export function calculateOrderBlockDecayV6(
  originalQuality: number,
  creationDate: string,
  daysActive: number,
  isMitigated: boolean,
  brokenDecisively: boolean,
  obTop: number,
  obBottom: number,
  isBullishOriginal: boolean
): OrderBlockDecayModel {
  // Exponential decay: Q(t) = Q0 * exp(-0.025 * days)
  const decayFactor = Math.exp(-0.025 * Math.max(0, daysActive));
  const decayedFreshnessScore = Number((originalQuality * decayFactor).toFixed(1));
  const isExpired = decayedFreshnessScore < 40.0;

  let flippedIntoBreaker = false;
  let breakerLevel: OrderBlockDecayModel['breakerLevel'];

  // If a high quality unmitigated OB is broken decisively by close, invert polarity into a Breaker Block
  if (brokenDecisively && !isMitigated) {
    flippedIntoBreaker = true;
    breakerLevel = {
      top: obTop,
      bottom: obBottom,
      meanThreshold: Number(((obTop + obBottom) / 2).toFixed(2)),
      polarity: isBullishOriginal ? 'BEARISH_BREAKER' : 'BULLISH_BREAKER',
    };
  }

  return {
    originalQuality,
    creationDate,
    daysActive,
    decayedFreshnessScore,
    isExpired,
    isMitigated,
    flippedIntoBreaker,
    breakerLevel,
  };
}

// ============================================================================
// 9. STRATEGY S13: EARNINGS ACCELERATION MOMENTUM (EAM)
// ============================================================================
export function evaluateS13EarningsAccelerationV6(
  input: S13EarningsAccelerationInput
): S13EarningsAccelerationResult {
  const {
    symbol,
    currentPatYoYGrowthPct,
    priorQuarterPatYoYGrowthPct,
    qoqAccelerationBps,
    revenueGrowthYoYPct,
    grossMarginDeltaBps,
    pegRatio,
    fiiDiiCombinedStakeChangePct,
    priceAboveEma50,
    ema50AboveEma200,
  } = input;

  let accelerationScore = 0;

  // 1. PAT Growth >= 25% (20 pts)
  if (currentPatYoYGrowthPct >= 25) accelerationScore += 20;
  // 2. QoQ Acceleration >= 500 bps (20 pts)
  if (qoqAccelerationBps >= 500) accelerationScore += 20;
  // 3. Revenue Growth >= 15% (15 pts)
  if (revenueGrowthYoYPct >= 15) accelerationScore += 15;
  // 4. Gross Margin Expansion >= 100 bps (15 pts)
  if (grossMarginDeltaBps >= 100) accelerationScore += 15;
  // 5. PEG Ratio < 1.2 (15 pts)
  if (pegRatio < 1.2 && pegRatio > 0) accelerationScore += 15;
  // 6. Institutional Stake Expansion (10 pts)
  if (fiiDiiCombinedStakeChangePct >= 1.5) accelerationScore += 10;
  // 7. Technical Golden Alignment (5 pts)
  if (priceAboveEma50 && ema50AboveEma200) accelerationScore += 5;

  const qualified = accelerationScore >= 75;
  let suitability: 'INVESTMENT_COMPOUNDER' | 'TACTICAL_SWING' | 'DISQUALIFIED' = 'DISQUALIFIED';

  if (qualified) {
    suitability = pegRatio < 0.9 ? 'INVESTMENT_COMPOUNDER' : 'TACTICAL_SWING';
  }

  return {
    symbol,
    qualified,
    accelerationScore,
    reratingTarget1: Number((pegRatio * 1.3).toFixed(2)),
    reratingTarget2: Number((pegRatio * 1.7).toFixed(2)),
    invalidationCriteria: 'Two consecutive quarters of decelerating PAT growth or Daily close below EMA 200',
    holdingHorizonMonths: 6,
    suitability,
  };
}

// 10. STRATEGY S14: BEARISH SHORT FUTURES HEDGE
// Systematic delta hedge using short index & high-beta futures when Nifty < 50 EMA and breadth < 40%.
export function evaluateS14_BearishHedge(niftyEma50: number, niftyClose: number, breadthPct: number): boolean {
    if (niftyClose < niftyEma50 && breadthPct < 40) {
        return true;
    }
    return false;
}

// 11. STRATEGY S15: OPTION CREDIT SPREADS HARVEST
// Systematic volatility premium harvesting via bull put and bear call spreads during low-trend sideways regimes.
export function evaluateS15_CreditSpreads(adx: number, regime: string): boolean {
    // ADX < 20 indicates sideways/choppy regime
    if (adx < 20 && (regime === 'SIDEWAYS' || regime === 'CHOPPY')) {
        return true;
    }
    return false;
}
