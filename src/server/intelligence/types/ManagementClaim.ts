/**
 * ManagementClaim.ts
 *
 * Layer 3 Management Claim model.
 * Management statements become first-class, testable objects within the Claim Ledger.
 * Enhanced with temporal semantics to prevent premature MISSED classifications.
 */

export type ClaimCategory =
  | 'GROWTH'
  | 'MARGIN'
  | 'CAPEX'
  | 'DEBT'
  | 'ORDER_BOOK'
  | 'CAPACITY'
  | 'MARKET'
  | 'GUIDANCE'
  | 'STRATEGY'
  | 'GOVERNANCE'
  | 'OTHER';

export type TargetTemporalSemantics =
  | 'DEADLINE'          // "Reach threshold by/before FY25" (Early fulfillment permitted for stock metrics)
  | 'YEAR_END'          // "Position as of FY25 close" (Earlier observation is NOT_DUE)
  | 'PERIOD'            // "Flow over FY25" (Earlier observation is NOT_COMPARABLE)
  | 'ONGOING'           // "Maintain ratio continuously"
  | 'POINT_IN_TIME';    // "Specific single-date statutory or covenant requirement"

export type ClaimStatus =
  | 'OPEN'
  | 'DUE_FOR_EVALUATION'
  | 'ACHIEVED'
  | 'ACHIEVED_EARLY'
  | 'PARTIALLY_ACHIEVED'
  | 'MISSED'
  | 'REVERSED'
  | 'NOT_DUE'
  | 'NOT_COMPARABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNRESOLVED';

export interface ManagementClaim {
  claimId: string;
  issuerNseSymbol: string;
  issuerBseCode?: string;
  period: string;             // e.g. "FY24", "Q4-FY24"
  category: ClaimCategory;
  statement: string;
  targetMetric?: string;      // e.g. "REVENUE_GROWTH_PCT", "EBITDA_MARGIN", "CAPACITY_MT"
  baselineValue?: number;     // e.g. 100
  expectedValue?: number;     // e.g. 150
  expectedOutcome?: string;   // e.g. "+50% capacity expansion to 150 units"
  expectedTimeframe?: string; // e.g. "Q4-FY25"

  // Temporal Semantics (Constitution v1.1 & FERE Architecture)
  targetTemporalSemantics?: TargetTemporalSemantics;
  claimDate?: string;               // When the claim was uttered/published (YYYY-MM-DD)
  /**
   * Date the claim/evidence became publicly available.
   *
   * Historical replay uses this field, not the date of the
   * underlying event or accounting period.
   */
  publicationDate?: string;

  publicationDateType?:
    | 'FILING'
    | 'PRESS_RELEASE'
    | 'MANAGEMENT_COMMENT'
    | 'TRANSCRIPT'
    | 'WEBSITE_PUBLICATION'
    | 'SOCIAL_MEDIA'
    | 'VIDEO_PUBLICATION'
    | 'OTHER';

  sourceFilingDate?: string;
  filingDate?: string;

  expectedPeriodStart?: string;     // Earliest observation date (YYYY-MM-DD)
  expectedPeriodEnd?: string;       // Due date / deadline (YYYY-MM-DD)
  evaluationDate?: string;          // When the evaluation occurred
  evaluationBasis?: string;         // Formula or reasoning applied
  evaluationEvidenceId?: string;    // Lineage to verifying subsequent EvidenceSpan
  factId?: string;                  // Link to canonical FinancialFact

  evidenceId: string;               // Foreign key to initial EvidenceSpan
  status: ClaimStatus;
  actualOutcomeMetric?: number;
  actualOutcomeDescription?: string;
  resolutionEvidenceId?: string;    // Subsequent EvidenceSpan proving achievement or miss
  resolvedAt?: string;
  createdAt: string;
}

export type CredibilityGrade =
  | 'STRONG'
  | 'GENERALLY_CREDIBLE'
  | 'MIXED'
  | 'WEAK'
  | 'INSUFFICIENT_HISTORY';

export interface ManagementCredibilityScorecard {
  symbol: string;
  grade: CredibilityGrade;
  totalClaims: number;
  achievedCount: number;
  partiallyAchievedCount: number;
  missedCount: number;
  reversedCount: number;
  openCount: number;
  dueForEvaluationCount: number;
  unresolvedCount: number;
  keyEvidencedExamples: Array<{
    claimId: string;
    statement: string;
    period: string;
    expected: string;
    actual: string;
    status: ClaimStatus;
    evidenceLineage: string;
  }>;
}
