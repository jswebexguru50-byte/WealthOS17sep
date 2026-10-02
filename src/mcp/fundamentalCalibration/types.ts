/**
 * WealthOS Fundamental Interpretation Calibration Loop — Types
 * Master Specification — Sections 1 to 7, 20
 */

export type ReviewOutcome =
  | 'SUPPORTED'
  | 'REASONABLE'
  | 'QUESTIONABLE'
  | 'UNSUPPORTED'
  | 'INSUFFICIENT_EVIDENCE';

export type FailureTaxonomy =
  | 'DATA_ERROR'
  | 'DERIVATION_ERROR'
  | 'PERIOD_ALIGNMENT_ERROR'
  | 'SCOPE_ERROR'
  | 'UNIT_ERROR'
  | 'INTERPRETATION_RULE_ERROR'
  | 'CONTEXT_MISSING'
  | 'SECTOR_CONTEXT_MISSING'
  | 'EVIDENCE_ERROR'
  | 'STALE_DATA'
  | 'INSUFFICIENT_EVIDENCE'
  | 'OTHER';

export type ReviewConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CompanyIdentity {
  symbol: string;
  companyName: string;
  isin: string | null;
  industry: string | null;
  sector: string | null;
  listingClassification: string;
  businessModel: 'NON_FINANCIAL' | 'BANK' | 'NBFC' | 'INSURANCE' | 'CONGLOMERATE' | 'UNKNOWN';
}

export interface PeriodContext {
  latestFiscalYear: string | null;
  latestQuarter: string | null;
  ttmAvailable: boolean;
  periodsAvailable: string[];
  consolidatedOrStandalone: 'CONSOLIDATED' | 'STANDALONE' | 'UNKNOWN';
  asOfDate: string | null;
}

export interface FinancialFactItem {
  metric: string;
  value: number | string | null;
  unit: string;
  period: string;
  scope: string;
  source: string;
  factId: string;
  availabilityDate: string | null;
  factType: 'REPORTED' | 'DERIVED' | 'MISSING';
}

export interface DerivedMetricItem {
  metric: string;
  value: number | string | null;
  unit: string;
  formula: string;
  periodsCompared?: string;
  verificationStatus: 'MATCH' | 'MISMATCH' | 'UNVERIFIED';
  independentValue?: number | string | null;
  discrepancyNotes?: string;
}

export interface InterpretationClaim {
  claimId: string;
  module: 'FUNDAMENTAL' | 'QGLP' | 'VALUATION' | 'MANAGEMENT' | 'BUSINESS_INFLECTION';
  dimension:
    | 'REVENUE_GROWTH'
    | 'MARGIN_TRAJECTORY'
    | 'DEBT_TRAJECTORY'
    | 'RETURN_PROFILE'
    | 'QUALITY_OF_BUSINESS'
    | 'QUALITY_OF_MANAGEMENT'
    | 'GROWTH_LONGEVITY'
    | 'VALUATION_MULTIPLE'
    | 'CASH_CONVERSION'
    | 'WORKING_CAPITAL';
  claimStatement: string;
  wealthosStatus: string;
  underlyingMetricValues: Record<string, any>;
  supportingFactIds: string[];
  caveatsOrWarnings: string[];
}

export interface FundamentalReviewInputPackage {
  symbol: string;
  evaluationTimestamp: string;
  identity: CompanyIdentity;
  periodContext: PeriodContext;
  financialFacts: FinancialFactItem[];
  derivedMetrics: DerivedMetricItem[];
  interpretations: InterpretationClaim[];
  evidenceManifest: Array<{
    factId: string;
    source: string;
    period: string;
    availabilityDate: string | null;
    status: 'REPORTED' | 'DERIVED' | 'MISSING';
  }>;
  missingData: string[];
}

export interface ReviewedClaimResult {
  reviewRunId: string;
  symbol: string;
  module: string;
  claimId: string;
  dimension: string;
  wealthosInterpretation: {
    status: string;
    statement: string;
    metrics: Record<string, any>;
  };
  reviewStatus: ReviewOutcome;
  factsSupportingWealthos: string[];
  factsContradictingWealthos: string[];
  missingContext: string[];
  issueTypes: FailureTaxonomy[];
  reviewerExplanation: string;
  potentialGeneralRule: string | null;
  requiresCodeChange: boolean;
  confidence: ReviewConfidence;
  independentArithmeticCheck?: {
    metric: string;
    productionValue: any;
    oracleValue: any;
    status: 'MATCH' | 'MISMATCH';
  };
}

export interface SystemicCluster {
  clusterId: string;
  clusterName: string;
  category:
    | 'CASH_CONVERSION'
    | 'WORKING_CAPITAL'
    | 'GROWTH_INTERPRETATION'
    | 'MARGIN_INTERPRETATION'
    | 'ROCE_ROE_INTERPRETATION'
    | 'DEBT_INTERPRETATION'
    | 'CAPITAL_ALLOCATION'
    | 'PERIOD_SELECTION'
    | 'SCOPE_SELECTION'
    | 'SECTOR_CONTEXT'
    | 'DATA_SANITY';
  affectedSymbols: string[];
  affectedClaimIds: string[];
  rootCauseSummary: string;
  issueTypes: FailureTaxonomy[];
  suggestedGeneralRemediation: string;
  forbiddenCompanyHardcoding: string[];
}

export interface FundamentalReviewRun {
  runId: string;
  name: string;
  phase: 'PILOT' | 'CALIBRATION' | 'FULL';
  createdAt: string;
  status: 'IN_PROGRESS' | 'FROZEN' | 'COMPLETED';
  cohort: Array<{
    symbol: string;
    companyName: string;
    sector: string | null;
    capCategory: string;
    rationale: string;
  }>;
  totalCompanies: number;
  totalClaimsReviewed: number;
  outcomesSummary: {
    SUPPORTED: number;
    REASONABLE: number;
    QUESTIONABLE: number;
    UNSUPPORTED: number;
    INSUFFICIENT_EVIDENCE: number;
  };
  moduleBreakdown: Record<string, { supported: number; questionedOrUnsupported: number; missing: number }>;
  issueTypeCounts: Record<FailureTaxonomy, number>;
  reviewedClaims: ReviewedClaimResult[];
  clusters: SystemicCluster[];
}
