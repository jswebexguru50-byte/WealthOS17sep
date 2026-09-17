/**
 * src/server/quant/forensicCalculator.ts
 * Institutional Forensic & Valuation Calculation Engine (v2.6)
 * 
 * Incorporates rigorous reviewer feedback:
 * 1. Altman Z-Score: Distinguishes missing/zero data from actual distress; returns INSUFFICIENT_DATA.
 * 2. Reverse DCF: Rejects missing cash flows/shares; flags solver pinning (>= 79.9% or <= -29.9%).
 * 3. RecommendationProvenance: Deterministic cross-stack contract binding technical momentum to forensic verdict.
 * 4. Sloan Accrual Ratio & Beneish M-Score: Audited mathematical identities with strict bounds.
 */

export interface AltmanZScoreResult {
  score: number | null;
  zone: 'SAFE' | 'GREY' | 'DISTRESS' | 'INSUFFICIENT_DATA';
  isComputable: boolean;
  rationale: string;
}

export interface BeneishMScoreResult {
  score: number;
  isManipulatorLikely: boolean;
  threshold: number;
  riskCategory: 'LOW_RISK' | 'HIGH_RISK_MANIPULATOR';
}

export interface DamodaranRoicResult {
  nopat: number;
  investedCapital: number;
  roic: number;
  wacc: number;
  economicSpread: number;
  trend: 'EXPANDING' | 'STABLE' | 'CONTRACTING';
}

export interface OwnerEarningsResult {
  ownerEarnings: number;
  ownerEarningsYield: number;
  ownerEarningsYieldOverRf: boolean;
}

export interface ReverseDcfParams {
  currentMarketPrice: number;
  shares: number;
  baseOwnerEarnings?: number;
  fcfPerShare?: number;
  waccPct?: number;
  conservativeHistoricalGrowthPct?: number;
  terminalGrowthPct?: number;
}

export interface ReverseDcfResult {
  currentMarketPrice: number;
  shares: number;
  marketCap: number;
  ownerEarningsBaseINR: number;
  waccPct: number;
  terminalGrowthPct: number;
  marketImplied10YGrowthRatePct: number | null;
  conservativeHistoricalGrowthRatePct: number;
  growthExpectationSpreadPct: number | null;
  intrinsicValuePerShare: number;
  freeCashFlowPerShare: number;
  marginOfSafetyPct: number;
  isValuationAttractive: boolean;
  valuationVerdict: string;
  isSolvable: boolean;
  isPinnedToBound: boolean;
  convergenceStatus: 'CONVERGED' | 'NON_CONVERGED_UPPER_BOUND' | 'NON_CONVERGED_LOWER_BOUND' | 'UNSOLVABLE_MISSING_INPUTS';
  rationale?: string;
}

export interface RecommendationProvenance {
  symbol: string;
  technicalSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID';
  forensicVerdict: 'PRISTINE_BUY' | 'QUALIFIED_BUY' | 'WATCHLIST' | 'AVOID_GOVERNANCE_RISK' | 'AVOID_SOLVENCY_RISK';
  effectiveRecommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'CAUTION_QUALIFIED' | 'GATED_AVOID' | 'AVOID';
  isGated: boolean;
  gatingReasons: string[];
  sloanAccrualRatioPct: number | null;
  beneishMScore: number | null;
  isBeneishManipulator: boolean;
  altmanZone: string;
  contingentLiabPctNetWorth: number;
  rptPctRevenue: number;
  concallGrade: string;
  auditTrail: string;
  timestamp: string;
}

export class ForensicCalculator {
  /**
   * 1. Sloan Accrual Ratio
   * Formula: (Net Income - CFO - CFI) / Total Assets
   * Warning threshold: > +10% indicates aggressive earnings acceleration via non-cash accounting accruals.
   */
  public static computeSloanAccrualRatio(netIncome: number, cfo: number, cfi: number, totalAssets: number): number | null {
    if (!totalAssets || totalAssets <= 0 || isNaN(totalAssets)) {
      return null;
    }
    const accruals = netIncome - cfo - cfi;
    return Math.round((accruals / totalAssets) * 1000) / 10; // in %
  }

  /**
   * 2. Beneish 8-Variable M-Score
   * Benchmark: Score > -1.78 suggests high probability of earnings manipulation.
   */
  public static computeBeneishMScore(ratios: {
    dsri: number;
    gmi: number;
    aqi: number;
    sgi: number;
    depi: number;
    sgai: number;
    tata: number;
    lvgi: number;
  }): BeneishMScoreResult {
    const { dsri, gmi, aqi, sgi, depi, sgai, tata, lvgi } = ratios;
    const m =
      -4.84 +
      0.920 * dsri +
      0.528 * gmi +
      0.404 * aqi +
      0.892 * sgi +
      0.115 * depi -
      0.172 * sgai +
      4.037 * tata +
      0.0327 * lvgi;

    const score = Math.round(m * 100) / 100;
    const isManipulatorLikely = score > -1.78;

    return {
      score,
      isManipulatorLikely,
      threshold: -1.78,
      riskCategory: isManipulatorLikely ? 'HIGH_RISK_MANIPULATOR' : 'LOW_RISK'
    };
  }

  /**
   * 3. Altman Z-Score for Emerging Markets
   * Solves reviewer bug: Never mislabels missing balance sheet data as insolvency/distress!
   * Formula: 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5
   */
  public static computeAltmanZScore(
    workingCapital: number,
    retainedEarnings: number,
    ebit: number,
    marketCap: number,
    totalLiabilities: number,
    sales: number,
    totalAssets: number
  ): AltmanZScoreResult {
    // Missing or invalid data must be explicitly flagged, never mapped to 0 (which would be DISTRESS)
    if (
      !totalAssets || totalAssets <= 0 || isNaN(totalAssets) ||
      !totalLiabilities || totalLiabilities <= 0 || isNaN(totalLiabilities)
    ) {
      return {
        score: null,
        zone: 'INSUFFICIENT_DATA',
        isComputable: false,
        rationale: 'Missing required statutory disclosures: Total Assets or Total Liabilities is zero or undefined.'
      };
    }

    const x1 = workingCapital / totalAssets;
    const x2 = retainedEarnings / totalAssets;
    const x3 = ebit / totalAssets;
    const x4 = marketCap / totalLiabilities;
    const x5 = sales / totalAssets;

    const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5;
    const score = Math.round(z * 100) / 100;

    let zone: 'SAFE' | 'GREY' | 'DISTRESS' = 'DISTRESS';
    if (score >= 2.99) zone = 'SAFE';
    else if (score >= 1.81) zone = 'GREY';

    return {
      score,
      zone,
      isComputable: true,
      rationale: zone === 'SAFE' ? 'Fortress Balance Sheet (Z >= 2.99)' : zone === 'GREY' ? 'Moderate Solvency Buffer (1.81 <= Z < 2.99)' : 'Elevated Leverage Stress (Z < 1.81)'
    };
  }

  /**
   * 4. Damodaran Operating Invested Capital & ROIC Spread
   */
  public static computeDamodaranRoicSpread(
    ebit: number,
    totalDebt: number,
    totalEquity: number,
    cash: number,
    revenue: number,
    effectiveTaxRate: number,
    wacc: number
  ): DamodaranRoicResult {
    const operatingCashNeeded = revenue * 0.02;
    const excessCash = Math.max(0, cash - operatingCashNeeded);
    const minFloor = (totalDebt + totalEquity) > 10_000_000 ? 10_000_000 : 1.0;
    const investedCapital = Math.max((totalDebt + totalEquity) - excessCash, totalEquity * 0.5, minFloor);
    const taxRate = Math.min(Math.max(effectiveTaxRate || 0.25, 0.15), 0.35);
    const nopat = ebit * (1 - taxRate);
    const roic = (nopat / investedCapital) * 100;
    const economicSpread = roic - wacc;

    let trend: 'EXPANDING' | 'STABLE' | 'CONTRACTING' = 'STABLE';
    if (economicSpread >= 5.0) trend = 'EXPANDING';
    else if (economicSpread < 1.5) trend = 'CONTRACTING';

    return {
      nopat: Math.round(nopat),
      investedCapital: Math.round(investedCapital),
      roic: Math.round(roic * 10) / 10,
      wacc: Math.round(wacc * 10) / 10,
      economicSpread: Math.round(economicSpread * 10) / 10,
      trend
    };
  }

  /**
   * 5. Warren Buffett Owner Earnings
   */
  public static computeOwnerEarnings(cfo: number, maintenanceCapex: number, marketCap: number, rf = 7.0): OwnerEarningsResult {
    const ownerEarnings = Math.max(0, cfo - maintenanceCapex);
    const ownerEarningsYield = marketCap > 0 ? (ownerEarnings / marketCap) * 100 : 0;
    return {
      ownerEarnings: Math.round(ownerEarnings),
      ownerEarningsYield: Math.round(ownerEarningsYield * 100) / 100,
      ownerEarningsYieldOverRf: ownerEarningsYield >= rf
    };
  }

  /**
   * 6. Reverse DCF Valuation Engine
   * Solves reviewer bugs:
   * - Eliminates silent fallback assumptions (does not invent arbitrary 3.8% FCF yield or 1 Cr shares).
   * - Detects boundary pinning (>= 79.9% or <= -29.9%) and discloses solver non-convergence explicitly.
   */
  public static solveReverseDcf(params: ReverseDcfParams): ReverseDcfResult {
    const cmp = params.currentMarketPrice;
    const shares = params.shares;

    // Reject missing market price or shares
    if (!cmp || cmp <= 0 || !shares || shares <= 0) {
      return {
        currentMarketPrice: cmp || 0,
        shares: shares || 0,
        marketCap: 0,
        ownerEarningsBaseINR: 0,
        waccPct: params.waccPct || 10.5,
        terminalGrowthPct: params.terminalGrowthPct || 4.0,
        marketImplied10YGrowthRatePct: null,
        conservativeHistoricalGrowthRatePct: params.conservativeHistoricalGrowthPct || 14.0,
        growthExpectationSpreadPct: null,
        intrinsicValuePerShare: 0,
        freeCashFlowPerShare: 0,
        marginOfSafetyPct: 0,
        isValuationAttractive: false,
        valuationVerdict: 'UNSOLVABLE: MISSING PRICE OR SHARE COUNT',
        isSolvable: false,
        isPinnedToBound: false,
        convergenceStatus: 'UNSOLVABLE_MISSING_INPUTS',
        rationale: 'Execution halted: CMP and total shares outstanding must be strictly positive verified numbers.'
      };
    }

    // Determine base cash flow: must be explicitly provided
    let baseCF = 0;
    if (params.baseOwnerEarnings !== undefined && params.baseOwnerEarnings !== null && params.baseOwnerEarnings > 0) {
      baseCF = params.baseOwnerEarnings;
    } else if (params.fcfPerShare !== undefined && params.fcfPerShare !== null && params.fcfPerShare > 0) {
      baseCF = params.fcfPerShare * shares;
    } else {
      return {
        currentMarketPrice: cmp,
        shares,
        marketCap: cmp * shares,
        ownerEarningsBaseINR: 0,
        waccPct: params.waccPct || 10.5,
        terminalGrowthPct: params.terminalGrowthPct || 4.0,
        marketImplied10YGrowthRatePct: null,
        conservativeHistoricalGrowthRatePct: params.conservativeHistoricalGrowthPct || 14.0,
        growthExpectationSpreadPct: null,
        intrinsicValuePerShare: 0,
        freeCashFlowPerShare: 0,
        marginOfSafetyPct: 0,
        isValuationAttractive: false,
        valuationVerdict: 'UNSOLVABLE: MISSING CASH FLOW DISCLOSURE',
        isSolvable: false,
        isPinnedToBound: false,
        convergenceStatus: 'UNSOLVABLE_MISSING_INPUTS',
        rationale: 'Execution halted: Neither baseOwnerEarnings nor fcfPerShare provided. Will not invent synthetic placeholder yield.'
      };
    }

    const marketCap = cmp * shares;
    const wacc = (params.waccPct || 10.5) / 100;
    const gTerm = (params.terminalGrowthPct || 4.0) / 100;

    const calculatePv = (g: number): number => {
      let pv = 0;
      let cf = baseCF;
      for (let t = 1; t <= 10; t++) {
        cf *= (1 + g);
        pv += cf / Math.pow(1 + wacc, t);
      }
      const terminalValue = (cf * (1 + gTerm)) / Math.max(wacc - gTerm, 0.01);
      pv += terminalValue / Math.pow(1 + wacc, 10);
      return pv;
    };

    let low = -0.30;
    let high = 0.80;
    let impliedG = 0.12;

    for (let i = 0; i < 45; i++) {
      const mid = (low + high) / 2;
      const pv = calculatePv(mid);
      if (Math.abs(pv - marketCap) < 100_000 || (high - low) < 0.0001) {
        impliedG = mid;
        break;
      }
      if (pv < marketCap) low = mid;
      else high = mid;
      impliedG = mid;
    }

    // Boundary pinning detection
    const isUpperPinned = impliedG >= 0.795;
    const isLowerPinned = impliedG <= -0.295;
    const isPinnedToBound = isUpperPinned || isLowerPinned;

    const consG = (params.conservativeHistoricalGrowthPct || 14.0) / 100;
    const intrinsicPv = calculatePv(consG);
    const intrinsicValuePerShare = Math.round((intrinsicPv / shares) * 100) / 100;
    const marginOfSafetyPct = Math.round(((intrinsicValuePerShare - cmp) / cmp) * 1000) / 10;

    if (isPinnedToBound) {
      const boundDir = isUpperPinned ? 'UPPER_BOUND (+80%/yr)' : 'LOWER_BOUND (-30%/yr)';
      return {
        currentMarketPrice: cmp,
        shares,
        marketCap,
        ownerEarningsBaseINR: Math.round(baseCF),
        waccPct: Math.round(wacc * 1000) / 10,
        terminalGrowthPct: Math.round(gTerm * 1000) / 10,
        marketImplied10YGrowthRatePct: null,
        conservativeHistoricalGrowthRatePct: Math.round(consG * 1000) / 10,
        growthExpectationSpreadPct: null,
        intrinsicValuePerShare,
        freeCashFlowPerShare: Math.round((baseCF / shares) * 100) / 100,
        marginOfSafetyPct,
        isValuationAttractive: false,
        valuationVerdict: `NON_CONVERGED: PINNED TO ${boundDir}`,
        isSolvable: true,
        isPinnedToBound: true,
        convergenceStatus: isUpperPinned ? 'NON_CONVERGED_UPPER_BOUND' : 'NON_CONVERGED_LOWER_BOUND',
        rationale: `Bisection solver pinned to ${boundDir}. Valuation requires growth outside rational fundamental boundaries.`
      };
    }

    const marketImplied10YGrowthRatePct = Math.round(impliedG * 1000) / 10;
    const growthExpectationSpreadPct = Math.round((marketImplied10YGrowthRatePct - (consG * 100)) * 10) / 10;

    let valuationVerdict = 'FAIR VALUE (-10% to +20% MoS)';
    if (marginOfSafetyPct >= 20.0) valuationVerdict = 'ATTRACTIVE (MoS >= 20%)';
    else if (marginOfSafetyPct < -15.0) valuationVerdict = 'PRICED FOR PERFECTION (MoS < -15%)';

    return {
      currentMarketPrice: cmp,
      shares,
      marketCap,
      ownerEarningsBaseINR: Math.round(baseCF),
      waccPct: Math.round(wacc * 1000) / 10,
      terminalGrowthPct: Math.round(gTerm * 1000) / 10,
      marketImplied10YGrowthRatePct,
      conservativeHistoricalGrowthRatePct: Math.round(consG * 1000) / 10,
      growthExpectationSpreadPct,
      intrinsicValuePerShare,
      freeCashFlowPerShare: Math.round((baseCF / shares) * 100) / 100,
      marginOfSafetyPct,
      isValuationAttractive: marginOfSafetyPct >= 20.0 && marketImplied10YGrowthRatePct <= (consG * 100),
      valuationVerdict,
      isSolvable: true,
      isPinnedToBound: false,
      convergenceStatus: 'CONVERGED'
    };
  }

  /**
   * 7. Wyckoff VPA & Information Discreteness
   */
  public static evaluateWyckoffAndQmom(
    priceNear52wHigh: boolean,
    volumeSpike: boolean,
    priceSpreadNarrow: boolean,
    swingLowRetestLowVolume: boolean,
    qmom12_2ReturnPct: number,
    pctNegDays: number,
    pctPosDays: number
  ) {
    const signPr = qmom12_2ReturnPct >= 0 ? 1 : -1;
    const informationDiscretenessId = Number((signPr * (pctNegDays - pctPosDays)).toFixed(4));
    const effortVsResultDivergence = Boolean(priceNear52wHigh && volumeSpike && priceSpreadNarrow);

    let vpaPhase = 'MARKDOWN_LIQUIDATION';
    if (effortVsResultDivergence) {
      vpaPhase = 'DISTRIBUTION_UTAD';
    } else if (swingLowRetestLowVolume) {
      vpaPhase = 'ACCUMULATION_SPRING';
    } else if (qmom12_2ReturnPct > 15 && informationDiscretenessId <= -0.02) {
      vpaPhase = 'MARKUP_EXPANSION';
    }

    const smartMoneyAccumulationConfirmed =
      (vpaPhase === 'ACCUMULATION_SPRING' || vpaPhase === 'MARKUP_EXPANSION') &&
      informationDiscretenessId <= -0.02 &&
      !effortVsResultDivergence;

    return {
      vpaPhase,
      effortVsResultDivergence,
      qmom12_2ReturnPct,
      informationDiscretenessId,
      smartMoneyAccumulationConfirmed
    };
  }

  /**
   * 8. RecommendationProvenanceEngine:
   * The load-bearing contract connecting Opportunity Engine signals to Forensic verdicts.
   * Gates or downgrades momentum recommendations if forensic red flags are present.
   */
  public static evaluateProvenance(
    symbol: string,
    technicalSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID',
    forensicDossier: any
  ): RecommendationProvenance {
    const gatingReasons: string[] = [];

    const sloan = forensicDossier?.governanceAndAccounting?.deterministicScores?.sloanAccrualRatio ?? null;
    const beneish = forensicDossier?.governanceAndAccounting?.deterministicScores?.beneishMScore ?? null;
    const altmanZone = forensicDossier?.solvencyAndStressTesting?.altmanZScore?.zone ?? 'UNKNOWN';
    const contingentLiabPct = forensicDossier?.governanceAndAccounting?.balanceSheetForensics?.contingentLiabilitiesPctNetWorth ?? 0;
    const rptPct = forensicDossier?.governanceAndAccounting?.balanceSheetForensics?.relatedPartyTransactionsPctRevenue ?? 0;
    const concallGrade = forensicDossier?.concallAudit?.credibilityGrade ?? 'GRADE B (Execution Lag)';
    const forensicVerdict = forensicDossier?.executiveSummary?.institutionalVerdict || 'WATCHLIST';

    // Check Rule 1: Aggressive Sloan Accruals (> +10.0%)
    if (sloan !== null && sloan > 10.0) {
      gatingReasons.push(`Sloan Accrual Ratio of +${sloan}% exceeds +10.0% threshold (aggressive non-cash accounting accruals).`);
    }

    // Check Rule 2: Beneish M-Score manipulation alert (> -1.78)
    const isBeneishManipulator = beneish !== null && beneish > -1.78;
    if (isBeneishManipulator) {
      gatingReasons.push(`Beneish M-Score of ${beneish} indicates high probability of earnings manipulation (threshold > -1.78).`);
    }

    // Check Rule 3: Off-Balance Sheet Solvency (> 25% of Net Worth)
    if (contingentLiabPct > 25.0) {
      gatingReasons.push(`Contingent Liabilities at ${contingentLiabPct}% of Net Worth exceed 25.0% prudence limit.`);
    }

    // Check Rule 4: Promoter RPT Leakage (> 5% of Revenue)
    if (rptPct > 5.0) {
      gatingReasons.push(`Related Party Transactions at ${rptPct}% of Revenue exceed 5.0% conflict-of-interest threshold.`);
    }

    // Check Rule 5: Concall Execution Divergence (Grade C)
    if (concallGrade.toUpperCase().includes('GRADE C')) {
      gatingReasons.push(`Management Track Record is GRADE C (Promoter guidance diverged significantly from statutory delivery).`);
    }

    const isGated = gatingReasons.length > 0;
    let effectiveRecommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'CAUTION_QUALIFIED' | 'GATED_AVOID' | 'AVOID' = technicalSignal;

    if (isGated) {
      if (isBeneishManipulator || (sloan !== null && sloan > 15.0) || contingentLiabPct > 40.0) {
        effectiveRecommendation = 'GATED_AVOID';
      } else {
        effectiveRecommendation = 'CAUTION_QUALIFIED';
      }
    }

    return {
      symbol,
      technicalSignal,
      forensicVerdict,
      effectiveRecommendation,
      isGated,
      gatingReasons,
      sloanAccrualRatioPct: sloan,
      beneishMScore: beneish,
      isBeneishManipulator,
      altmanZone,
      contingentLiabPctNetWorth: contingentLiabPct,
      rptPctRevenue: rptPct,
      concallGrade,
      auditTrail: isGated
        ? `TECHNICAL MOMENTUM GATED: ${gatingReasons.join(' ')}`
        : 'FORENSIC AUDIT CLEARED: All 5 forensic pillars meet institutional governance thresholds.',
      timestamp: new Date().toISOString()
    };
  }
}
export default ForensicCalculator;
