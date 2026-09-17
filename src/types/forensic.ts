/**
 * src/types/forensic.ts
 * Forensic Intelligence Layer (v2.1) - Schema & Type Definitions
 * Adheres strictly to §2 Schema Delta and core forensic specifications.
 */

export interface SourceRef {
  sourceType: 'mda' | 'concall' | 'annual_report' | 'news' | 'exchange_filing';
  sourceUrl: string;
  period: string;
  chunkIndex?: number;
  citationSnippet: string;
}

export interface ExtractedInsight {
  id: string;
  title: string;
  detail: string;
  category: 'raw_material' | 'order_book' | 'catalyst' | 'governance' | 'regulatory' | 'operational';
  sourceRef: SourceRef;
  confidence: number; // 0–1
  sentiment: 'positive' | 'negative' | 'neutral';
  flagType?: string;
  isCarriedForward?: boolean; // §3.5 Stage 1 carry-forward flag
  cacheKey?: string;
}

export interface NewsFlag {
  id: string;
  headline: string;
  sourceUrl: string;
  flagType:
    | 'governance_red_flag'
    | 'promoter_pledge_dispute'
    | 'accounting_investigation'
    | 'regulatory_action'
    | 'positive_capex_catalyst'
    | 'order_win_catalyst'
    | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number; // 0–1
  resolved: boolean;
  publishedDate: string;
  snippet: string;
}

export interface ScenarioResult {
  epsForward: number;
  peMultiple: number;
  priceTarget: number;
  assumptionsUsed: string[];
  confidence: number; // 0–1, reflects consensus-vs-fallback data quality (§3.3)
}

export interface BusinessHealthBreakdown {
  solvencyScore: number;        // 0–100 (Altman Z normalized)
  cashFlowQualityScore: number; // 0–100 (100 - avgCfoPatDivergence normalized)
  operationalEfficiencyScore: number; // 0–100 (assetTurnover + workingCapitalDaysTrend normalized)
  capitalAllocationScore: number; // 0–100 (roce_minus_wacc normalized)
  governanceScore: number;      // 0–100 (100 - penalties)
  composite: number;            // 0–100, weighted per §3.1
}

export type TradeViabilityRating = 'STRONG_BUY' | 'ACCUMULATE' | 'NEUTRAL' | 'REDUCE' | 'AVOID';

export interface TradeViabilityBasis {
  rewardRiskRatio: number;
  businessHealthComposite: number;
  unresolvedHighSeverityFlags: number;
  ruleMatched: string; // which rubric row fired for auditability (§3.2)
  notes?: string;
}

export enum AuditorTransitionType {
  REGULAR_ROTATION = 'REGULAR_ROTATION',
  UNEXPECTED_RESIGNATION = 'UNEXPECTED_RESIGNATION',
  QUALIFIED_AUDITOR_EXIT = 'QUALIFIED_AUDITOR_EXIT',
  AUDITOR_CENSURED_OR_BARRED = 'AUDITOR_CENSURED_OR_BARRED',
}

export interface BeneishMScoreResult {
  score: number;
  isManipulatorRisk: boolean; // M > -1.78
  dsri: number; // Days Sales in Receivables Index
  gmi: number;  // Gross Margin Index
  aqi: number;  // Asset Quality Index
  sgi: number;  // Sales Growth Index
  depi: number; // Depreciation Index
  sgai: number; // Sales, General & Administrative expenses Index
  lvgi: number; // Leverage Index
  tata: number; // Total Accruals to Total Assets
}

export interface AltmanZScoreResult {
  score: number;
  zone: 'safe' | 'grey' | 'distress';
  x1: number; // Working Capital / Total Assets
  x2: number; // Retained Earnings / Total Assets
  x3: number; // EBIT / Total Assets
  x4: number; // Market Value of Equity / Total Liabilities
  x5: number; // Sales / Total Assets
}

export interface PiotroskiFScoreResult {
  score: number; // 0–9
  quality: 'strong' | 'moderate' | 'weak';
  signals: {
    positiveROA: boolean;
    positiveCFO: boolean;
    higherROA: boolean;
    cfoGreaterThanROA: boolean;
    lowerLeverage: boolean;
    higherCurrentRatio: boolean;
    noNewShares: boolean;
    higherGrossMargin: boolean;
    higherAssetTurnover: boolean;
  };
}

export interface CfoPatDivergencePoint {
  quarter: string;
  cfo: number;
  pat: number;
  divergencePct: number;
}

export interface GuidanceAuditItem {
  period: string;
  metric: string;
  guidedMin: number;
  guidedMax: number;
  actual: number;
  hit: boolean;
  variancePct: number;
}

export interface WalkTheTalkAudit {
  guidanceHistory: GuidanceAuditItem[];
  hitRatePct: number; // e.g. 75%
  avgGuidanceVariancePct: number;
  directionalBias: 'conservative' | 'aggressive' | 'unbiased';
  peerConcallSignals: {
    peer: string;
    commonHeadwinds: string[];
    divergentSignals: string[];
  }[];
}

export interface ForensicDossier {
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  marketCapCr: number;
  stage: 1 | 2 | 3;
  priorityTier: 'high' | 'normal';
  stage1CompositeScore: number;
  isPromotedToStage2: boolean;

  // Deterministic Accounting Scores
  forensicScores: {
    beneish: BeneishMScoreResult;
    altman: AltmanZScoreResult;
    piotroski: PiotroskiFScoreResult;
    cfoPatDivergence: {
      quarters: CfoPatDivergencePoint[];
      avgDivergencePct: number;
      trend: 'improving' | 'deteriorating' | 'stable';
    };
    governanceAudit: {
      promoterPledgePct: number;
      pledgeYoYDelta: number;
      auditorTenureYears: number;
      auditorTransition: AuditorTransitionType;
      pledgeTrendPenalty: number;
      auditorTransitionPenalty: number;
      redFlagSeverityPenalty: number;
    };
  };

  // Section 2 Schema: Operations
  operations: {
    businessHealth: BusinessHealthBreakdown;
    rawMaterialConstraints: ExtractedInsight[];
    orderBookVisibility: ExtractedInsight[];
    positiveCatalysts: ExtractedInsight[]; // Stage 1 carry-forward ∪ Stage 2 net-new (§3.5)
  };

  // Section 2 Schema: Analyst Recommendation Context
  analystRecommendationContext: {
    tradeViability: TradeViabilityRating;
    tradeViabilityBasis: TradeViabilityBasis;
    keyInvestmentThesis: string;
    keyBearThesis: string;
    healthReviewSummary: string;
  };

  // Tri-Scenario Valuation (§3.3 & §7 T-VAL)
  triScenarioValuation: {
    baseCase: ScenarioResult;
    bullCase: ScenarioResult;
    bearCase: ScenarioResult;
    dataSourceType: 'live_consensus' | 'eps_stdev_fallback';
    historicalOutcome?: {
      realizedPrice: number;
      fallsInsideModeledBand: boolean;
      historicalVolatility: number;
      deviationNotes: string;
    };
  };

  // Peer Comparative Synthesis
  peerComparison?: {
    peers: string[];
    outperformanceDrivers: ExtractedInsight[];
    sectorRiskFlags: ExtractedInsight[];
  };

  // Stage 3 On-Demand Deep Intelligence (gated on P3-0)
  walkTheTalk?: WalkTheTalkAudit;

  // Audit metadata & telemetry
  telemetry: {
    stage1RuntimeMs: number;
    stage2RuntimeMs?: number;
    stage3RuntimeMs?: number;
    tokensConsumed: number;
    estimatedCostUsd: number;
    cacheHitCount: number;
    p3GateStatus: 'SIGNED_OFF' | 'BLOCKED_PENDING_LEGAL';
    modelTierUsed: 'flash' | 'pro';
  };

  // v2.5 360-Degree Institutional Enhancements
  governanceAndAccounting?: {
    deterministicScores: {
      beneishMScore: number;
      altmanZScore: number;
      piotroskiFScore: number;
      sloanAccrualRatio: number;
    };
    balanceSheetForensics: {
      contingentLiabilitiesPctNetWorth: number;
      relatedPartyTransactionsPctRevenue: number;
      pledgeTrend: { currentPct: number; yoyDeltaPct: number };
      cfoPatDivergenceRatio: number;
    };
    auditorIntegrity: {
      auditorName: string;
      tenureYears: number;
      changedInLast3Years: boolean;
      transitionType: "none" | "lateral" | "big4_to_nonbig4" | "nonbig4_to_big4";
      auditorQualificationsFlag: boolean;
    };
    materialNewsRedFlags: Array<ExtractedInsight & { flagCategory: string }>;
  };

  operationalMoat?: {
    roicSpread5Y: {
      averageRoic: number;
      wacc: number;
      economicSpread: number;
      trend: "EXPANDING" | "STABLE" | "CONTRACTING";
    };
    operatingConstraints: {
      rawMaterialPriceExposure: ExtractedInsight[];
      pricingPowerEvidence: ExtractedInsight[];
      orderBookVisibilityMonths: number;
      capacityUtilizationPct: number;
    };
  };

  catalystRadar?: {
    activeCatalysts: EventCatalyst[];
    netForwardEpsImpactPct: number;
    regulatoryRiskHorizon: ExtractedInsight[];
  };

  valuation?: {
    reverseDcf: ReverseDcfValuation;
    scenarioTargets: {
      bear: { priceTarget: number; multiple: number; driver: string };
      base: { priceTarget: number; multiple: number; driver: string };
      bull: { priceTarget: number; multiple: number; driver: string };
    };
  };

  marketActionConfirmation?: WyckoffVolumeFootprint;

  synthesis?: {
    verdict: "STRONG_BUY_MOAT" | "TACTICAL_SWING_ACCUMULATION" | "WATCHLIST_EXPENSIVE" | "AVOID_GOVERNANCE_RISK";
    coreThesisSummary: string;
    keyRiskToMonitor: string;
    nextCatalystDate: string;
  };

  disclaimer?: string;
}

export interface ForensicDossierV25 {
  symbol: string;
  generatedAt: string;
  pipelineStage: 1 | 2 | 3;
  dataCompleteness: number; // 0.0 to 1.0

  // 1. Hard Forensic & Governance Integrity (No Hallucination)
  governanceAndAccounting: {
    deterministicScores: {
      beneishMScore: number;       // > -1.78 indicates earnings manipulation risk
      altmanZScore: number;        // < 1.81 indicates distress; > 2.99 safe
      piotroskiFScore: number;     // 8-9 elite; <= 3 weak
      sloanAccrualRatio: number;   // > +10% indicates poor cash flow conversion
    };
    balanceSheetForensics: {
      contingentLiabilitiesPctNetWorth: number; // > 25% flags hidden legal/tax risk
      relatedPartyTransactionsPctRevenue: number;
      pledgeTrend: { currentPct: number; yoyDeltaPct: number };
      cfoPatDivergenceRatio: number; // 3-year avg CFO / PAT (must be >= 0.85)
    };
    auditorIntegrity: {
      auditorName: string;
      tenureYears: number;
      changedInLast3Years: boolean;
      transitionType: "none" | "lateral" | "big4_to_nonbig4" | "nonbig4_to_big4";
      auditorQualificationsFlag: boolean;
    };
    materialNewsRedFlags: Array<ExtractedInsight & { flagCategory: string }>;
  };

  // 2. Business Moat & Operational Realities (Damodaran & Buffett)
  operationalMoat: {
    roicSpread5Y: {
      averageRoic: number;
      wacc: number;
      economicSpread: number; // ROIC - WACC (Must be >= 3.0%)
      trend: "EXPANDING" | "STABLE" | "CONTRACTING";
    };
    operatingConstraints: {
      rawMaterialPriceExposure: ExtractedInsight[];
      pricingPowerEvidence: ExtractedInsight[]; // Evidence of passing cost inflation to buyers
      orderBookVisibilityMonths: number;
      capacityUtilizationPct: number;
    };
  };

  // 3. 360-Degree News & Catalyst Intelligence
  catalystRadar: {
    activeCatalysts: EventCatalyst[];
    netForwardEpsImpactPct: number; // Consolidated projected EPS drift
    regulatoryRiskHorizon: ExtractedInsight[];
  };

  // 4. Reverse DCF & Tri-Scenario Valuation
  valuation: {
    reverseDcf: ReverseDcfValuation;
    scenarioTargets: {
      bear: { priceTarget: number; multiple: number; driver: string };
      base: { priceTarget: number; multiple: number; driver: string };
      bull: { priceTarget: number; multiple: number; driver: string };
    };
  };

  // 5. Smart Money & Price-Volume Confirmation (Wyckoff & QMOM)
  marketActionConfirmation: WyckoffVolumeFootprint;

  // 6. Synthesis & Executive Recommendation
  synthesis: {
    verdict: "STRONG_BUY_MOAT" | "TACTICAL_SWING_ACCUMULATION" | "WATCHLIST_EXPENSIVE" | "AVOID_GOVERNANCE_RISK";
    coreThesisSummary: string;
    keyRiskToMonitor: string;
    nextCatalystDate: string; // Next earnings concall or regulatory filing date
  };

  disclaimer: string;
}

export interface TestResultItem {
  testId: string;
  name: string;
  type: 'Unit' | 'Integration' | 'Cost' | 'Backtest' | 'Regression' | 'Manual';
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  assertion?: string;
  details?: string;
}

export interface EventCatalyst {
  headline: string;
  category: "CAPEX_EXPANSION" | "MARGIN_COMPRESSION" | "REGULATORY_TARIFF" | "GOVERNANCE_DILUTION" | "EARNINGS_SURPRISE";
  transmissionMechanism: string; // How this directly impacts forward EPS or WACC
  estimatedEpsImpactPct: number; // e.g. +8.5% or -12.0%
  conviction: number;
  source: SourceRef;
}

export interface ReverseDcfValuation {
  ownerEarningsBaseINR: number;
  wacc: number;
  terminalGrowthRate: number;
  marketImplied10YGrowthRate: number; // g implied by current market cap
  conservativeHistoricalGrowthRate: number;
  intrinsicValuePerShare: number;
  currentMarketPrice: number;
  marginOfSafetyPct: number;
  isValuationAttractive: boolean; // True if margin of safety >= 20% and implied g < conservative g
}

export interface WyckoffVolumeFootprint {
  vpaPhase: "ACCUMULATION_SPRING" | "MARKUP_EXPANSION" | "DISTRIBUTION_UTAD" | "MARKDOWN_LIQUIDATION";
  effortVsResultDivergence: boolean;
  qmom12_2ReturnPct: number;
  informationDiscretenessId: number; // <= -0.02 confirms smooth institutional flow
  smartMoneyAccumulationConfirmed: boolean;
}

export interface FootnotesForensicAudit {
  sloanAccrualRatio: number; // > +10% earnings manipulation / cash decay risk
  contingentLiabilitiesPctNetWorth: number; // > 25% flags off-balance-sheet solvency vulnerability
  relatedPartyTransactionsPctRevenue: number; // > 5% flags leakage to promoter entities
  unbilledRevenuePctTotalRevenue?: number;
  auditorQualificationNotes?: string;
}

export interface DamodaranRoicSpread {
  nopat: number;
  investedCapital: number;
  roic: number;
  wacc: number;
  economicSpread: number; // ROIC - WACC (Must be >= 3.0%)
  trend: "EXPANDING" | "STABLE" | "CONTRACTING";
  ownerEarningsYield: number; // Owner Earnings / Market Cap
  ownerEarningsYieldOverRf: boolean; // Owner Earnings Yield > Rf (7.0%)
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
