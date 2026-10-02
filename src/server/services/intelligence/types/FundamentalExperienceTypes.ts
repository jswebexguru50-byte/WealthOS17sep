/**
 * FundamentalExperienceTypes.ts
 *
 * WealthOS — Fundamental Experience Expansion 001 Data Contracts.
 * Every displayed material field retains full provenance, status, period, and source semantics.
 * No synthetic, default, zero-substituted, or LLM-generated values allowed.
 */

export type EvidenceFieldStatus =
  | 'VERIFIED'
  | 'VERIFIED_PARTIAL'
  | 'STALE'
  | 'SOURCE_UNAVAILABLE'
  | 'NOT_YET_REQUESTED'
  | 'DATA_INSUFFICIENT'
  | 'CONFLICTING'
  | 'NOT_APPLICABLE';

export interface EvidenceField<T> {
  value: T | null;
  status: EvidenceFieldStatus;
  provider: string;
  source: string;
  sourceDocumentId?: string | null;
  fetchedAt: string | null;
  periodType?: 'ANNUAL' | 'QUARTERLY' | 'TTM' | 'POINT_IN_TIME' | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  scope?: 'CONSOLIDATED' | 'STANDALONE' | null;
  reason?: string | null;
  conflictingValues?: Array<{
    provider: string;
    value: any;
    period?: string;
    reason?: string;
  }>;
}

export type BriefCategory =
  | 'REPORTED_FACT'
  | 'DERIVED_METRIC'
  | 'MANAGEMENT_OUTLOOK'
  | 'MARKET_ACTIVITY_EVIDENCE'
  | 'MISSING_OR_CONFLICTING';

export interface ExecutiveBriefElement {
  category: BriefCategory;
  text: string;
  evidenceRef?: string;
}

export interface ExecutiveBrief {
  wordCount: number;
  text: string;
  dataConfidence: 'HIGH' | 'MODERATE' | 'LOW' | 'DATA_INSUFFICIENT';
  sourceCoverage: string;
  elements: ExecutiveBriefElement[];
}

export interface GrowthTrajectory {
  revenueLatestAnnual: EvidenceField<number>;
  revenuePriorAnnual: EvidenceField<number>;
  revenueGrowthYoY: EvidenceField<number>;
  revenueCAGR3Y: EvidenceField<number>;
  revenueCAGR5Y: EvidenceField<number>;
  quarterlyRevenueLatest: EvidenceField<number>;
  quarterlyYoY: EvidenceField<number>;
  quarterlyQoQ: EvidenceField<number>;
  operatingProfit: EvidenceField<number>;
  operatingMarginPct: EvidenceField<number>;
  pat: EvidenceField<number>;
  netMarginPct: EvidenceField<number>;
  eps: EvidenceField<number>;
  ebitdaCAGR3Y: EvidenceField<number>;
  patCAGR3Y: EvidenceField<number>;
  marginDirection: EvidenceField<'EXPANDING' | 'STABLE' | 'CONTRACTING' | 'DATA_INSUFFICIENT' | 'CONFLICTING'>;
  earningsConcentration: {
    isConcentrated: boolean;
    topQuarterPct: number | null;
    observation: string;
    status: 'EVALUATED' | 'DATA_INSUFFICIENT';
  };
  orderBook: EvidenceField<number>;
  orderInflow: EvidenceField<number>;
}

export interface BusinessLongevitySection {
  businessModel: string;
  revenueDrivers: string[];
  productRelevance: {
    assessment: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING';
    summary: string;
    evidenceRef?: string;
  };
  demandDriversAndCyclicality: {
    assessment: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING';
    summary: string;
    evidenceRef?: string;
  };
  competitivePosition: {
    assessment: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING';
    summary: string;
    evidenceRef?: string;
  };
  customerConcentration: {
    assessment: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING';
    summary: string;
    evidenceRef?: string;
  };
  capacityAndVisibility: {
    assessment: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING';
    summary: string;
    evidenceRef?: string;
  };
  disruptionRisks: string[];
  managementOutlook: Array<{
    statement: string;
    source: string;
    period: string;
    label: 'MANAGEMENT_OUTLOOK';
  }>;
}

export type DebtServicingClassification =
  | 'STRONG'
  | 'ADEQUATE'
  | 'WATCH'
  | 'WEAK'
  | 'MISSING'
  | 'CONFLICTING'
  | 'NOT_APPLICABLE';

export interface FinancialStrengthDebt {
  totalDebt: EvidenceField<number>;
  netDebt: EvidenceField<number>;
  debtToEquity: EvidenceField<number>;
  longTermDebt: EvidenceField<number>;
  shortTermDebt: EvidenceField<number>;
  cashBalance: EvidenceField<number>;
  debtTrend: EvidenceField<string>;
  financeCost: EvidenceField<number>;
  interestCoverage: EvidenceField<number>;
  dscr: EvidenceField<number>;
  debtMaturities: EvidenceField<string>;
  ebitdaToDebt: EvidenceField<number>;
  cfo: EvidenceField<number>;
  classification: DebtServicingClassification;
  classificationReason: string;
}

export interface CashFlowWorkingCapital {
  cfo: EvidenceField<number>;
  cfoToPat: EvidenceField<number>;
  cfoToEbitda: EvidenceField<number>;
  fcf: EvidenceField<number>;
  capex: EvidenceField<number>;
  receivables: EvidenceField<number>;
  receivableDays: EvidenceField<number>;
  inventory: EvidenceField<number>;
  inventoryDays: EvidenceField<number>;
  payables: EvidenceField<number>;
  cashConversionCycle: EvidenceField<number>;
  workingCapitalMovement: EvidenceField<number>;
  cashConversionStatus: DebtServicingClassification;
  unresolvedConflict: {
    exists: boolean;
    description?: string;
    details?: Array<{
      provider: string;
      value: any;
      period: string;
      definition: string;
    }>;
  };
}

export interface CapitalEfficiency {
  roe: EvidenceField<number>;
  roce: EvidenceField<number>;
  roa: EvidenceField<number>;
  roic: EvidenceField<number>;
  roe3YTrend: EvidenceField<string>;
  roce3YTrend: EvidenceField<string>;
  sectorComparison: {
    peerMedianRoce?: number | null;
    status: string;
  };
}

export interface DisclosedMajorHolder {
  name: string;
  pct: number;
  category: string;
  source: string;
}

export interface OwnershipTrend {
  latestDisclosedPeriod: string; // e.g. "JUN-2026"
  isStale: boolean;
  promoterPct: EvidenceField<number>;
  promoterChangeQoQ: EvidenceField<number>;
  promoterChangeYoY: EvidenceField<number>;
  promoterPledgePct: EvidenceField<number>;
  promoterPledgeChange: EvidenceField<number>;
  fiiPct: EvidenceField<number>;
  fiiChange: EvidenceField<number>;
  diiPct: EvidenceField<number>;
  diiChange: EvidenceField<number>;
  mfPct: EvidenceField<number>;
  mfChange: EvidenceField<number>;
  insurancePct: EvidenceField<number>;
  publicPct: EvidenceField<number>;
  disclosedMajorHolders: DisclosedMajorHolder[];
}

export type QglpDimensionName = 'QUALITY' | 'GROWTH' | 'LONGEVITY' | 'PRICE';

export type QDimensionStatus = 'SUPPORTIVE' | 'MIXED' | 'WEAK' | 'MISSING' | 'CONFLICTING';
export type GDimensionStatus = 'SUPPORTIVE' | 'EARLY_INFLECTION' | 'MIXED' | 'WEAK' | 'MISSING' | 'CONFLICTING';
export type LDimensionStatus = 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING' | 'CONFLICTING';
export type PDimensionStatus =
  | 'ATTRACTIVE_IF_EARNINGS_HOLD'
  | 'REASONABLE'
  | 'DEMANDING'
  | 'LOW_MULTIPLE_WITH_EARNINGS_RISK'
  | 'VALUE_TRAP_RISK'
  | 'MISSING'
  | 'CONFLICTING';

export interface QglpDimensionDetail<TStatus> {
  dimension: QglpDimensionName;
  status: TStatus;
  summary: string;
  evidenceList: Array<{
    parameter: string;
    value: string | number | null;
    status: string;
    source: string;
    period?: string | null;
    notes?: string;
  }>;
  missingInputs: string[];
}

export interface QglpFourDimensions {
  quality: QglpDimensionDetail<QDimensionStatus>;
  growth: QglpDimensionDetail<GDimensionStatus>;
  longevity: QglpDimensionDetail<LDimensionStatus>;
  price: QglpDimensionDetail<PDimensionStatus>;
}

export type SmartMoneyClassification =
  | 'VERIFIED_SMART_MONEY_ACCUMULATION'
  | 'POSSIBLE_ACCUMULATION'
  | 'NO_CONFIRMATION'
  | 'DISTRIBUTION_WARNING';

export type BuyerType =
  | 'PROMOTER'
  | 'FII'
  | 'DII'
  | 'MUTUAL_FUND'
  | 'INSURANCE'
  | 'KNOWN_INVESTOR'
  | 'INDIVIDUAL'
  | 'CORPORATE'
  | 'UNKNOWN';

export interface DisclosedTransaction {
  date: string;
  buyer: string;
  seller: string;
  quantity: number;
  averagePrice: number;
  transactionValue: number;
  equityPct?: number | null;
  buyerType: BuyerType;
  source: string;
  evidenceReference: string;
}

export interface AbnormalVolumeDay {
  date: string;
  volume: number;
  avgVolume20D: number;
  ratio: number;
  deliveryPct?: number | null;
  priceChangePct: number;
  closePositionPct: number; // (close - low) / (high - low)
}

export interface RecentAccumulationPayload {
  classification: SmartMoneyClassification;
  classificationRationale: string;
  analysisStartDate: string;
  analysisEndDate: string;
  latestOwnershipDate: string;
  totalSessions: number;
  upVolumeVsDownVolume: {
    upVolume: number;
    downVolume: number;
    ratio: number;
  };
  cumulativePositivePriceVolume: number;
  cumulativeNegativePriceVolume: number;
  abnormalVolumeDays: AbnormalVolumeDay[];
  deliveryEvidence: {
    avgDeliveryPct: number | null;
    highDeliverySessions: number;
    trend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'DATA_INSUFFICIENT';
  };
  namedBuyers: DisclosedTransaction[];
  namedSellers: DisclosedTransaction[];
  historicalDisclosedDeals: DisclosedTransaction[];
  evidence: string[];
  limitations: string[];
}

export interface GovernanceRedFlagItem {
  event: string;
  date: string;
  severity: 'CONCERN' | 'WATCH' | 'INFO';
  whyItMatters: string;
  source: string;
  evidenceRef?: string;
}

export interface MonitoringWatchItem {
  item: string;
  currentStatus: string;
  triggerOrTarget: string;
  whyImportant: string;
  priority: number;
}

export interface FundamentalExperiencePayload {
  symbol: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  businessModel: string;
  asOfDate: string;
  dataConfidence: 'HIGH' | 'MODERATE' | 'LOW' | 'DATA_INSUFFICIENT';
  sourceCoverage: string;

  // 12 Structured Sections
  executiveBrief: ExecutiveBrief;
  whatMattersNow: string[];
  growthTrajectory: GrowthTrajectory;
  businessLongevity: BusinessLongevitySection;
  financialStrength: FinancialStrengthDebt;
  cashFlowWorkingCapital: CashFlowWorkingCapital;
  capitalEfficiency: CapitalEfficiency;
  ownershipTrend: OwnershipTrend;
  qglp: QglpFourDimensions;
  recentAccumulation: RecentAccumulationPayload;
  governanceRedFlags: GovernanceRedFlagItem[];
  whatToWatch: MonitoringWatchItem[];
  unresolvedConflicts: Array<{
    field: string;
    providerA: string;
    valueA: any;
    periodA: string;
    providerB: string;
    valueB: any;
    periodB: string;
    reason: string;
  }>;
  sourcesUsed: Array<{
    provider: string;
    endpoint: string;
    fetchedAt: string;
    period?: string;
    status: string;
  }>;
}
