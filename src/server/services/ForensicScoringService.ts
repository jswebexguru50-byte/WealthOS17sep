/**
 * ForensicScoringService.ts
 * Implements deterministic forensic formulas per v2.1 specifications:
 * - Beneish M-Score (earnings manipulation)
 * - Altman Z-Score (bankruptcy distress)
 * - Piotroski F-Score (fundamental health)
 * - CFO vs PAT Divergence (cash conversion quality)
 * - Promoter Pledge & Auditor Transition Governance classification
 * - businessHealth.composite (§3.1) with FORENSIC_WEIGHTS config
 * - tradeViability rubric (§3.2) evaluated top-down with ruleMatched audit trail
 */

import {
  AuditorTransitionType,
  AltmanZScoreResult,
  BeneishMScoreResult,
  BusinessHealthBreakdown,
  NewsFlag,
  PiotroskiFScoreResult,
  ReverseDcfValuation,
  ScenarioResult,
  TradeViabilityBasis,
  TradeViabilityRating,
  WyckoffVolumeFootprint,
} from '../../../src/types.js';

export interface PeerRange {
  min: number;
  max: number;
  median?: number;
}

export interface RawFundamentalsInput {
  // Balance sheet & P&L items for year t and t-1
  sales_t: number;
  sales_prev: number;
  cogs_t: number;
  cogs_prev: number;
  receivables_t: number;
  receivables_prev: number;
  currentAssets_t: number;
  currentAssets_prev: number;
  ppe_t: number;
  ppe_prev: number;
  securities_t: number;
  securities_prev: number;
  totalAssets_t: number;
  totalAssets_prev: number;
  depreciation_t: number;
  depreciation_prev: number;
  sga_t: number;
  sga_prev: number;
  currentLiab_t: number;
  currentLiab_prev: number;
  longTermDebt_t: number;
  longTermDebt_prev: number;
  retainedEarnings_t: number;
  ebit_t: number;
  netIncome_t: number;
  netIncome_prev: number;
  cfo_t: number;
  cfo_prev: number;
  marketValueOfEquity_t: number;
  totalLiabilities_t: number;
  sharesOutstanding_t: number;
  sharesOutstanding_prev: number;
  workingCapital_t: number;

  // Efficiency & spread inputs
  assetTurnover_t: number;
  peerMedianAssetTurnover: number;
  workingCapitalDaysTrend: number; // negative is improving, positive is worsening
  roce: number; // in %
  wacc: number; // in %

  // Governance inputs
  promoterPledgePct: number;
  promoterPledgePctPrev: number;
  auditorTenureYears: number;
  auditorTransition: AuditorTransitionType;
}

export interface PeerGroupRanges {
  altmanZ: PeerRange;
  cfoPatDivergence: PeerRange;
  operationalEfficiency: PeerRange;
  capitalAllocationSpread: PeerRange;
}

export interface ForensicWeights {
  solvency: number;
  cashFlowQuality: number;
  operationalEfficiency: number;
  capitalAllocation: number;
  governance: number;
}

export const FORENSIC_WEIGHTS: ForensicWeights = {
  solvency: 0.20,
  cashFlowQuality: 0.25,
  operationalEfficiency: 0.20,
  capitalAllocation: 0.20,
  governance: 0.15,
};

export class ForensicScoringService {
  /**
   * P1-1: Beneish M-Score
   * M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI
   * M > -1.78 indicates high probability of accounting manipulation.
   */
  public static calculateBeneishMScore(data: RawFundamentalsInput): BeneishMScoreResult {
    const safeDiv = (num: number, den: number, fallback = 1.0) => (den === 0 ? fallback : num / den);

    const recToSales_t = safeDiv(data.receivables_t, data.sales_t);
    const recToSales_prev = safeDiv(data.receivables_prev, data.sales_prev);
    const dsri = safeDiv(recToSales_t, recToSales_prev);

    const gm_prev = safeDiv(data.sales_prev - data.cogs_prev, data.sales_prev);
    const gm_t = safeDiv(data.sales_t - data.cogs_t, data.sales_t);
    const gmi = safeDiv(gm_prev, gm_t);

    const nonCurrentAssets_t = data.currentAssets_t + data.ppe_t + data.securities_t;
    const nonCurrentAssets_prev = data.currentAssets_prev + data.ppe_prev + data.securities_prev;
    const aqi_t = 1 - safeDiv(nonCurrentAssets_t, data.totalAssets_t);
    const aqi_prev = 1 - safeDiv(nonCurrentAssets_prev, data.totalAssets_prev);
    const aqi = safeDiv(aqi_t, aqi_prev);

    const sgi = safeDiv(data.sales_t, data.sales_prev);

    const depRate_prev = safeDiv(data.depreciation_prev, data.ppe_prev + data.depreciation_prev);
    const depRate_t = safeDiv(data.depreciation_t, data.ppe_t + data.depreciation_t);
    const depi = safeDiv(depRate_prev, depRate_t);

    const sgaRate_t = safeDiv(data.sga_t, data.sales_t);
    const sgaRate_prev = safeDiv(data.sga_prev, data.sales_prev);
    const sgai = safeDiv(sgaRate_t, sgaRate_prev);

    const lev_t = safeDiv(data.longTermDebt_t + data.currentLiab_t, data.totalAssets_t);
    const lev_prev = safeDiv(data.longTermDebt_prev + data.currentLiab_prev, data.totalAssets_prev);
    const lvgi = safeDiv(lev_t, lev_prev);

    const tata = safeDiv(data.netIncome_t - data.cfo_t, data.totalAssets_t);

    const score =
      -4.84 +
      0.920 * dsri +
      0.528 * gmi +
      0.404 * aqi +
      0.892 * sgi +
      0.115 * depi -
      0.172 * sgai +
      4.037 * tata +
      0.0327 * lvgi;

    return {
      score: Number(score.toFixed(3)),
      isManipulatorRisk: score > -1.78,
      dsri: Number(dsri.toFixed(3)),
      gmi: Number(gmi.toFixed(3)),
      aqi: Number(aqi.toFixed(3)),
      sgi: Number(sgi.toFixed(3)),
      depi: Number(depi.toFixed(3)),
      sgai: Number(sgai.toFixed(3)),
      lvgi: Number(lvgi.toFixed(3)),
      tata: Number(tata.toFixed(3)),
    };
  }

  /**
   * P1-1: Altman Z-Score
   * Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5
   */
  public static calculateAltmanZScore(data: RawFundamentalsInput): AltmanZScoreResult {
    const safeDiv = (num: number, den: number, fallback = 0) => (den === 0 ? fallback : num / den);

    const x1 = safeDiv(data.workingCapital_t, data.totalAssets_t);
    const x2 = safeDiv(data.retainedEarnings_t, data.totalAssets_t);
    const x3 = safeDiv(data.ebit_t, data.totalAssets_t);
    const x4 = safeDiv(data.marketValueOfEquity_t, data.totalLiabilities_t);
    const x5 = safeDiv(data.sales_t, data.totalAssets_t);

    const score = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5;

    let zone: 'safe' | 'grey' | 'distress' = 'safe';
    if (score < 1.81) {
      zone = 'distress';
    } else if (score <= 2.99) {
      zone = 'grey';
    }

    return {
      score: Number(score.toFixed(3)),
      zone,
      x1: Number(x1.toFixed(3)),
      x2: Number(x2.toFixed(3)),
      x3: Number(x3.toFixed(3)),
      x4: Number(x4.toFixed(3)),
      x5: Number(x5.toFixed(3)),
    };
  }

  /**
   * P1-1: Piotroski F-Score
   * 9 binary tests assessing profitability, financial leverage, and operating efficiency.
   */
  public static calculatePiotroskiFScore(data: RawFundamentalsInput): PiotroskiFScoreResult {
    const roa_t = data.totalAssets_t > 0 ? data.netIncome_t / data.totalAssets_t : 0;
    const roa_prev = data.totalAssets_prev > 0 ? data.netIncome_prev / data.totalAssets_prev : 0;

    const positiveROA = roa_t > 0;
    const positiveCFO = data.cfo_t > 0;
    const higherROA = roa_t > roa_prev;
    const cfoGreaterThanROA = data.cfo_t / Math.max(data.totalAssets_t, 1) > roa_t;

    const lev_t = data.totalAssets_t > 0 ? data.longTermDebt_t / data.totalAssets_t : 0;
    const lev_prev = data.totalAssets_prev > 0 ? data.longTermDebt_prev / data.totalAssets_prev : 0;
    const lowerLeverage = lev_t <= lev_prev;

    const cr_t = data.currentLiab_t > 0 ? data.currentAssets_t / data.currentLiab_t : 1;
    const cr_prev = data.currentLiab_prev > 0 ? data.currentAssets_prev / data.currentLiab_prev : 1;
    const higherCurrentRatio = cr_t > cr_prev;

    const noNewShares = data.sharesOutstanding_t <= data.sharesOutstanding_prev;

    const gm_t = data.sales_t > 0 ? (data.sales_t - data.cogs_t) / data.sales_t : 0;
    const gm_prev = data.sales_prev > 0 ? (data.sales_prev - data.cogs_prev) / data.sales_prev : 0;
    const higherGrossMargin = gm_t > gm_prev;

    const at_t = data.totalAssets_t > 0 ? data.sales_t / data.totalAssets_t : 0;
    const at_prev = data.totalAssets_prev > 0 ? data.sales_prev / data.totalAssets_prev : 0;
    const higherAssetTurnover = at_t > at_prev;

    const signals = {
      positiveROA,
      positiveCFO,
      higherROA,
      cfoGreaterThanROA,
      lowerLeverage,
      higherCurrentRatio,
      noNewShares,
      higherGrossMargin,
      higherAssetTurnover,
    };

    const score = Object.values(signals).filter(Boolean).length;
    let quality: 'strong' | 'moderate' | 'weak' = 'moderate';
    if (score >= 7) quality = 'strong';
    else if (score <= 3) quality = 'weak';

    return {
      score,
      quality,
      signals,
    };
  }

  /**
   * P1-2: CFO/PAT Divergence Trend calculation (trailing 4–8 quarters)
   * High divergence (PAT growing while CFO lagging) indicates aggressive revenue recognition.
   */
  public static calculateCfoPatDivergence(quarters: { quarter: string; cfo: number; pat: number }[]): {
    quarters: { quarter: string; cfo: number; pat: number; divergencePct: number }[];
    avgDivergencePct: number;
    trend: 'improving' | 'deteriorating' | 'stable';
  } {
    const computedQuarters = quarters.map((q) => {
      const denominator = Math.max(Math.abs(q.pat), 1);
      // Divergence is positive when PAT > CFO (earnings not backed by cash)
      const divergencePct = ((q.pat - q.cfo) / denominator) * 100;
      return {
        quarter: q.quarter,
        cfo: q.cfo,
        pat: q.pat,
        divergencePct: Number(divergencePct.toFixed(2)),
      };
    });

    const sumDiv = computedQuarters.reduce((acc, q) => acc + q.divergencePct, 0);
    const avgDivergencePct = computedQuarters.length > 0 ? Number((sumDiv / computedQuarters.length).toFixed(2)) : 0;

    // Trend: compare average of first half vs second half
    let trend: 'improving' | 'deteriorating' | 'stable' = 'stable';
    if (computedQuarters.length >= 4) {
      const mid = Math.floor(computedQuarters.length / 2);
      const earlyHalf = computedQuarters.slice(0, mid);
      const recentHalf = computedQuarters.slice(mid);
      const earlyAvg = earlyHalf.reduce((a, b) => a + b.divergencePct, 0) / earlyHalf.length;
      const recentAvg = recentHalf.reduce((a, b) => a + b.divergencePct, 0) / recentHalf.length;

      if (recentAvg < earlyAvg - 3) {
        trend = 'improving'; // divergence decreasing -> CFO catching up to PAT
      } else if (recentAvg > earlyAvg + 3) {
        trend = 'deteriorating'; // divergence increasing -> quality worsening
      }
    }

    return {
      quarters: computedQuarters,
      avgDivergencePct,
      trend,
    };
  }

  /**
   * P1-3: Pledge YoY delta & Auditor Tenure/Transition classifier
   */
  public static calculateGovernancePenalties(
    promoterPledgePct: number,
    promoterPledgePctPrev: number,
    auditorTransition: AuditorTransitionType,
    redFlags: NewsFlag[]
  ): {
    pledgeTrendPenalty: number;
    auditorTransitionPenalty: number;
    redFlagSeverityPenalty: number;
    totalPenalty: number;
  } {
    const pledgeYoYDelta = promoterPledgePct - promoterPledgePctPrev;
    let pledgeTrendPenalty = 0;

    if (promoterPledgePct > 50) {
      pledgeTrendPenalty += 30;
    } else if (promoterPledgePct > 25) {
      pledgeTrendPenalty += 15;
    } else if (promoterPledgePct > 10) {
      pledgeTrendPenalty += 5;
    }

    if (pledgeYoYDelta > 10) {
      pledgeTrendPenalty += 20;
    } else if (pledgeYoYDelta > 3) {
      pledgeTrendPenalty += 10;
    }

    let auditorTransitionPenalty = 0;
    switch (auditorTransition) {
      case AuditorTransitionType.REGULAR_ROTATION:
        auditorTransitionPenalty = 0;
        break;
      case AuditorTransitionType.UNEXPECTED_RESIGNATION:
        auditorTransitionPenalty = 20;
        break;
      case AuditorTransitionType.QUALIFIED_AUDITOR_EXIT:
        auditorTransitionPenalty = 35;
        break;
      case AuditorTransitionType.AUDITOR_CENSURED_OR_BARRED:
        auditorTransitionPenalty = 50;
        break;
    }

    // Red flag severity penalty:
    let redFlagSeverityPenalty = 0;
    for (const flag of redFlags) {
      if (flag.resolved) continue;
      if (flag.confidence < 0.5) continue;
      if (flag.severity === 'critical') redFlagSeverityPenalty += 35;
      else if (flag.severity === 'high') redFlagSeverityPenalty += 20;
      else if (flag.severity === 'medium') redFlagSeverityPenalty += 10;
      else if (flag.severity === 'low') redFlagSeverityPenalty += 5;
    }

    const totalPenalty = Math.min(100, pledgeTrendPenalty + auditorTransitionPenalty + redFlagSeverityPenalty);

    return {
      pledgeTrendPenalty,
      auditorTransitionPenalty,
      redFlagSeverityPenalty,
      totalPenalty,
    };
  }

  /**
   * Helper to normalize a scalar value between 0 and 100 within a range.
   */
  public static normalize(value: number, min: number, max: number): number {
    if (max === min) return 50;
    const clamped = Math.min(Math.max(value, min), max);
    return Number((((clamped - min) / (max - min)) * 100).toFixed(2));
  }

  /**
   * P1-4: businessHealth.composite (§3.1)
   * Solvency (20%), CashFlow Quality (25%), Operational Efficiency (20%), Capital Allocation (20%), Governance (15%)
   */
  public static calculateBusinessHealth(
    data: RawFundamentalsInput,
    peerRanges: PeerGroupRanges,
    avgCfoPatDivergencePct: number,
    governancePenalties: {
      pledgeTrendPenalty: number;
      auditorTransitionPenalty: number;
      redFlagSeverityPenalty: number;
    }
  ): BusinessHealthBreakdown {
    const altman = this.calculateAltmanZScore(data);
    const solvencyScore = this.normalize(altman.score, peerRanges.altmanZ.min, peerRanges.altmanZ.max);

    // Lower divergence = higher cash flow quality
    const rawDivergenceNorm = this.normalize(
      avgCfoPatDivergencePct,
      peerRanges.cfoPatDivergence.min,
      peerRanges.cfoPatDivergence.max
    );
    const cashFlowQualityScore = Number((100 - rawDivergenceNorm).toFixed(2));

    const efficiencyRaw = (data.assetTurnover_t - data.peerMedianAssetTurnover) * 10 - data.workingCapitalDaysTrend;
    const operationalEfficiencyScore = this.normalize(
      efficiencyRaw,
      peerRanges.operationalEfficiency.min,
      peerRanges.operationalEfficiency.max
    );

    const spread = data.roce - data.wacc;
    const capitalAllocationScore = this.normalize(
      spread,
      peerRanges.capitalAllocationSpread.min,
      peerRanges.capitalAllocationSpread.max
    );

    const totalGovPenalty =
      governancePenalties.pledgeTrendPenalty +
      governancePenalties.auditorTransitionPenalty +
      governancePenalties.redFlagSeverityPenalty;
    const governanceScore = Math.max(0, Math.min(100, Number((100 - totalGovPenalty).toFixed(2))));

    const composite = Number(
      (
        FORENSIC_WEIGHTS.solvency * solvencyScore +
        FORENSIC_WEIGHTS.cashFlowQuality * cashFlowQualityScore +
        FORENSIC_WEIGHTS.operationalEfficiency * operationalEfficiencyScore +
        FORENSIC_WEIGHTS.capitalAllocation * capitalAllocationScore +
        FORENSIC_WEIGHTS.governance * governanceScore
      ).toFixed(2)
    );

    return {
      solvencyScore,
      cashFlowQualityScore,
      operationalEfficiencyScore,
      capitalAllocationScore,
      governanceScore,
      composite,
    };
  }

  /**
   * P1-5: tradeViability rubric (§3.2)
   * Deterministic decision-table evaluated top-down:
   * 1. unresolvedHighSeverityFlags > 0 AND severity == "critical" -> AVOID
   * 2. businessHealth.composite < 25 -> AVOID
   * 3. rewardRiskRatio >= 2.5 AND businessHealth.composite >= 70 AND unresolvedHighSeverityFlags == 0 -> STRONG_BUY
   * 4. rewardRiskRatio >= 1.5 AND businessHealth.composite >= 55 -> ACCUMULATE
   * 5. (rewardRiskRatio between 0.8 and 1.5) OR (businessHealth.composite between 40 and 55) -> NEUTRAL
   * 6. rewardRiskRatio < 0.8 OR businessHealth.composite < 40 -> REDUCE
   */
  public static evaluateTradeViability(
    currentPrice: number,
    bestTarget: number,
    worstTarget: number,
    businessHealthComposite: number,
    newsFlags: NewsFlag[]
  ): { rating: TradeViabilityRating; basis: TradeViabilityBasis } {
    const EPSILON = 0.01;
    const downside = Math.max(currentPrice - worstTarget, EPSILON);
    const upside = Math.max(bestTarget - currentPrice, 0);
    const rewardRiskRatio = Number((upside / downside).toFixed(2));

    const highOrCriticalFlags = newsFlags.filter(
      (f) =>
        f.flagType === 'governance_red_flag' &&
        f.confidence >= 0.75 &&
        !f.resolved &&
        (f.severity === 'critical' || f.severity === 'high')
    );

    const unresolvedHighSeverityFlags = highOrCriticalFlags.length;
    const hasCriticalFlag = highOrCriticalFlags.some((f) => f.severity === 'critical');

    let rating: TradeViabilityRating;
    let ruleMatched: string;
    let notes: string;

    // Rule 1: unresolved critical flag
    if (unresolvedHighSeverityFlags > 0 && hasCriticalFlag) {
      rating = 'AVOID';
      ruleMatched = 'rule_1_critical_unresolved_flags';
      notes = `Blocked by ${unresolvedHighSeverityFlags} active critical governance red flag(s).`;
    }
    // Rule 2: businessHealth composite < 25
    else if (businessHealthComposite < 25) {
      rating = 'AVOID';
      ruleMatched = 'rule_2_distressed_business_health';
      notes = `Composite business health (${businessHealthComposite}) is in severe distress territory (< 25).`;
    }
    // Rule 3: rewardRiskRatio >= 2.5 AND composite >= 70 AND no unresolved flags
    else if (rewardRiskRatio >= 2.5 && businessHealthComposite >= 70 && unresolvedHighSeverityFlags === 0) {
      rating = 'STRONG_BUY';
      ruleMatched = 'rule_3_strong_buy';
      notes = `High asymmetric reward/risk (${rewardRiskRatio}x) with pristine health composite (${businessHealthComposite}) and clean governance.`;
    }
    // Rule 4: rewardRiskRatio >= 1.5 AND composite >= 55
    else if (rewardRiskRatio >= 1.5 && businessHealthComposite >= 55) {
      rating = 'ACCUMULATE';
      ruleMatched = 'rule_4_accumulate';
      notes = `Attractive reward/risk (${rewardRiskRatio}x) with solid operational health (${businessHealthComposite}).`;
    }
    // Rule 5: rewardRiskRatio between 0.8 and 1.5 OR composite between 40 and 55
    else if (
      (rewardRiskRatio >= 0.8 && rewardRiskRatio <= 1.5) ||
      (businessHealthComposite >= 40 && businessHealthComposite <= 55)
    ) {
      rating = 'NEUTRAL';
      ruleMatched = 'rule_5_neutral';
      notes = `Fairly balanced reward/risk (${rewardRiskRatio}x) or median health (${businessHealthComposite}).`;
    }
    // Rule 6: rewardRiskRatio < 0.8 OR composite < 40
    else {
      rating = 'REDUCE';
      ruleMatched = 'rule_6_reduce';
      notes = `Unfavorable reward/risk (${rewardRiskRatio}x) or weak business health composite (${businessHealthComposite}).`;
    }

    return {
      rating,
      basis: {
        rewardRiskRatio,
        businessHealthComposite,
        unresolvedHighSeverityFlags,
        ruleMatched,
        notes,
      },
    };
  }

  /**
   * v2.5 Enhancement 1: Sloan Accrual Ratio = (Net Income - CFO - CFI) / Total Assets
   * Signals earnings quality and accrual manipulation risk.
   * If > +10%, earnings are heavily comprised of non-cash accruals (imminent earnings restatement warning).
   */
  public static computeSloanAccrualRatio(p: FinancialStatementPayload): number {
    if (p.totalAssets <= 0) return 0;
    const accruals = p.netIncome - p.operatingCashFlow - p.investingCashFlow;
    return Math.round((accruals / p.totalAssets) * 1000) / 10; // In percent
  }

  /**
   * v2.5: Altman Z-Score for Manufacturing & Emerging Market Corporates from FinancialStatementPayload
   */
  public static computeAltmanZScoreFromPayload(p: FinancialStatementPayload): number {
    if (p.totalAssets <= 0 || p.totalLiabilities <= 0) return 0;
    const X1 = p.workingCapital / p.totalAssets;
    const X2 = p.retainedEarnings / p.totalAssets;
    const X3 = p.ebit / p.totalAssets;
    const X4 = p.marketValueOfEquity / p.totalLiabilities;
    const X5 = p.revenue / p.totalAssets;

    const zScore = (1.2 * X1) + (1.4 * X2) + (3.3 * X3) + (0.6 * X4) + (0.999 * X5);
    return Math.round(zScore * 100) / 100;
  }

  /**
   * v2.5 Enhancement 2: Damodaran Operating Invested Capital & ROIC Economic Spread
   * Tracks ROIC - WACC (target >= 3.0%)
   */
  public static computeDamodaranRoicSpread(p: FinancialStatementPayload): {
    roic: number;
    wacc: number;
    economicSpread: number;
    investedCapital: number;
    nopat: number;
  } {
    const operatingCashNeeded = p.revenue * 0.02;
    const excessCash = Math.max(0, p.cashAndEquivalents - operatingCashNeeded);
    
    // Net Invested Capital floored at 50% Equity to prevent negative denominators
    const minFloor = (p.totalDebt + p.totalEquity) > 10000000 ? 10000000.0 : 1.0;
    const investedCapital = Math.max(
      (p.totalDebt + p.totalEquity) - excessCash,
      p.totalEquity * 0.5,
      minFloor
    );

    const taxRate = Math.min(Math.max(p.effectiveTaxRate || 0.25, 0.15), 0.35);
    const nopat = p.ebit * (1 - taxRate);
    const roic = (nopat / investedCapital) * 100;
    const economicSpread = roic - p.wacc;

    return {
      roic: Math.round(roic * 10) / 10,
      wacc: Math.round(p.wacc * 10) / 10,
      economicSpread: Math.round(economicSpread * 10) / 10,
      investedCapital: Math.round(investedCapital),
      nopat: Math.round(nopat),
    };
  }

  /**
   * v2.5 Enhancement 2: Owner Earnings & Yield vs Risk-Free Rate (Rf = 7.0%)
   * Owner Earnings = CFO - Maintenance Capex
   */
  public static computeOwnerEarnings(p: {
    operatingCashFlow: number;
    maintenanceCapex: number;
    marketCap: number;
    riskFreeRatePct?: number;
  }): {
    ownerEarnings: number;
    ownerEarningsYieldPct: number;
    isYieldAttractive: boolean;
  } {
    const ownerEarnings = Math.max(0, p.operatingCashFlow - p.maintenanceCapex);
    const ownerEarningsYieldPct = p.marketCap > 0 ? (ownerEarnings / p.marketCap) * 100 : 0;
    const rf = p.riskFreeRatePct ?? 7.0;
    return {
      ownerEarnings: Math.round(ownerEarnings),
      ownerEarningsYieldPct: Math.round(ownerEarningsYieldPct * 100) / 100,
      isYieldAttractive: ownerEarningsYieldPct >= rf,
    };
  }

  /**
   * v2.5 Enhancement 3: Reverse DCF & Implied Growth Reality Check
   * Solves for 10-year market-implied growth rate (g_implied) at current CMP.
   * Compares against company's 5-year historical reinvestment-backed growth.
   * Enforces Margin of Safety >= 20% and g_implied < conservativeHistoricalGrowthRate.
   */
  public static solveReverseDcf(p: {
    currentMarketPrice: number;
    sharesOutstanding: number;
    ownerEarningsBaseINR: number;
    waccPct: number;
    terminalGrowthPct?: number;
    conservativeHistoricalGrowthRate: number;
  }): ReverseDcfValuation {
    const marketCap = p.currentMarketPrice * p.sharesOutstanding;
    const r = p.waccPct / 100;
    const gTerm = (p.terminalGrowthPct ?? 4.0) / 100;
    const baseCF = Math.max(p.ownerEarningsBaseINR, 1000000);

    const calculatePv = (g: number): number => {
      let pv = 0;
      let cf = baseCF;
      for (let t = 1; t <= 10; t++) {
        cf *= (1 + g);
        pv += cf / Math.pow(1 + r, t);
      }
      const terminalValue = (cf * (1 + gTerm)) / Math.max(r - gTerm, 0.01);
      pv += terminalValue / Math.pow(1 + r, 10);
      return pv;
    };

    let low = -0.30;
    let high = 0.80;
    let impliedG = 0.10;
    for (let iter = 0; iter < 40; iter++) {
      const mid = (low + high) / 2;
      const pv = calculatePv(mid);
      if (Math.abs(pv - marketCap) < 100000 || (high - low) < 0.0001) {
        impliedG = mid;
        break;
      }
      if (pv < marketCap) {
        low = mid;
      } else {
        high = mid;
      }
      impliedG = mid;
    }

    const conservativeG = p.conservativeHistoricalGrowthRate / 100;
    const intrinsicPv = calculatePv(conservativeG);
    const intrinsicValuePerShare = Math.round((intrinsicPv / p.sharesOutstanding) * 100) / 100;
    const marginOfSafetyPct = Math.round(((intrinsicValuePerShare - p.currentMarketPrice) / p.currentMarketPrice) * 1000) / 10;
    const marketImplied10YGrowthRate = Math.round(impliedG * 1000) / 10;
    const isValuationAttractive = marginOfSafetyPct >= 20.0 && marketImplied10YGrowthRate < p.conservativeHistoricalGrowthRate;

    return {
      ownerEarningsBaseINR: Math.round(baseCF),
      wacc: p.waccPct,
      terminalGrowthRate: p.terminalGrowthPct ?? 4.0,
      marketImplied10YGrowthRate,
      conservativeHistoricalGrowthRate: p.conservativeHistoricalGrowthRate,
      intrinsicValuePerShare,
      currentMarketPrice: p.currentMarketPrice,
      marginOfSafetyPct,
      isValuationAttractive,
    };
  }

  /**
   * v2.5 Enhancement 5: Wyckoff VPA & Smart Money Footprint Confirmation
   * - Effort vs Result Volume Divergence (Heavy volume spike with narrow spread near 52W high -> Distribution warning)
   * - Wyckoff Accumulation Phase (Low-volume retest of swing lows -> Phase C Spring confirmation)
   * - QMOM Information Discreteness (ID = sign(PR12_2) * (% negative days - % positive days) <= -0.02)
   */
  public static evaluateWyckoffVpaAndQmom(p: {
    priceNear52wHigh: boolean;
    volumeSpike: boolean;
    priceSpreadNarrow: boolean;
    swingLowRetestLowVolume: boolean;
    qmom12_2ReturnPct: number;
    pctNegativeDays: number;
    pctPositiveDays: number;
  }): WyckoffVolumeFootprint {
    const signPr = p.qmom12_2ReturnPct >= 0 ? 1 : -1;
    const informationDiscretenessId = Number(
      (signPr * (p.pctNegativeDays - p.pctPositiveDays)).toFixed(4)
    );

    const effortVsResultDivergence = Boolean(p.priceNear52wHigh && p.volumeSpike && p.priceSpreadNarrow);

    let vpaPhase: "ACCUMULATION_SPRING" | "MARKUP_EXPANSION" | "DISTRIBUTION_UTAD" | "MARKDOWN_LIQUIDATION";

    if (effortVsResultDivergence) {
      vpaPhase = 'DISTRIBUTION_UTAD';
    } else if (p.swingLowRetestLowVolume) {
      vpaPhase = 'ACCUMULATION_SPRING';
    } else if (p.qmom12_2ReturnPct > 15 && informationDiscretenessId <= -0.02) {
      vpaPhase = 'MARKUP_EXPANSION';
    } else {
      vpaPhase = 'MARKDOWN_LIQUIDATION';
    }

    const smartMoneyAccumulationConfirmed =
      (vpaPhase === 'ACCUMULATION_SPRING' || vpaPhase === 'MARKUP_EXPANSION') &&
      informationDiscretenessId <= -0.02 &&
      !effortVsResultDivergence;

    return {
      vpaPhase,
      effortVsResultDivergence,
      qmom12_2ReturnPct: p.qmom12_2ReturnPct,
      informationDiscretenessId,
      smartMoneyAccumulationConfirmed,
    };
  }
}

export interface FinancialStatementPayload {
  netIncome: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  totalAssets: number;
  currentAssets: number;
  currentLiabilities: number;
  workingCapital: number;
  retainedEarnings: number;
  ebit: number;
  revenue: number;
  priorRevenue?: number;
  totalLiabilities: number;
  totalDebt: number;
  totalEquity: number;
  cashAndEquivalents: number;
  marketValueOfEquity: number;
  effectiveTaxRate: number;
  wacc: number;
  contingentLiabilities: number;
  depreciation?: number;
  maintenanceCapex?: number;
  sharesOutstanding?: number;
  currentMarketPrice?: number;
}
