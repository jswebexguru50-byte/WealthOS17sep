/**
 * Contradiction.ts
 *
 * Layer 4 Contradiction Engine model (FERE Architecture v3.2).
 *
 * Implements clean orthogonal separation between:
 * 1. ContradictionState: Epistemic status of truth/conflict between facts
 * 2. ComparabilityState: Semantic status of whether facts can be mathematically joined (e.g. for YoY growth)
 *
 * Cases A–E:
 * - Case A (FY24 vs FY25 revenue): NO_CONTRADICTION, COMPARABLE (Growth calculation allowed)
 * - Case B (Provisional vs Audited restatement): SUPERSEDED, NOT_COMPARABLE
 * - Case C (Filing A vs Filing B, same authority/period, different values): CONFLICTING, COMPARABLE
 * - Case D (Standalone vs Consolidated): NO_CONTRADICTION, NOT_COMPARABLE
 * - Case E (Dispatches vs Order Book, flow vs stock): NO_CONTRADICTION, NOT_COMPARABLE
 */

export type ContradictionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ContradictionType =
  | 'CLAIM_VS_RESULT'
  | 'CLAIM_VS_EVENT'
  | 'CLAIM_VS_EXTERNAL'
  | 'DISCLOSURE_INCONSISTENCY'
  | 'HISTORICAL_PROMISE'
  | 'GOVERNANCE'
  | 'OTHER';

export type ContradictionState =
  | 'NO_CONTRADICTION'
  | 'CONFLICTING'
  | 'SUPERSEDED'
  | 'STALE'
  | 'UNRESOLVED';

export type ComparabilityState =
  | 'COMPARABLE'
  | 'NOT_COMPARABLE'
  | 'CONDITIONALLY_COMPARABLE';

// Legacy status alias for backward compatibility
export type ContradictionResolutionStatus =
  | 'OPEN'
  | 'CONFIRMED'
  | 'CONFLICTING'
  | 'SUPERSEDED'
  | 'STALE'
  | 'NOT_COMPARABLE'
  | 'RESOLVED';

export interface ContradictionResolutionFactorEvaluation {
  sameIssuer: boolean;
  sameMetric: boolean;
  sameScope: boolean;
  sameUnit: boolean;
  sameMeasurementPeriod: boolean;
  sameMethodology: boolean;
  isRestatementOrAmendment: boolean;
  sourceAuthorityComparison: 'LEFT_HIGHER' | 'RIGHT_HIGHER' | 'EQUIVALENT';
  publicationChronology: 'LEFT_EARLIER' | 'RIGHT_EARLIER' | 'CONTEMPORANEOUS';

  // FERE v3.2 Orthogonal States
  contradictionState: ContradictionState;
  comparabilityState: ComparabilityState;

  // Legacy field
  resolutionOutcome: ContradictionResolutionStatus;
  policyRationale: string;
}

export interface Contradiction {
  contradictionId: string;
  issuerNseSymbol: string;
  issuerBseCode?: string;
  severity: ContradictionSeverity;
  type: ContradictionType;
  claimId?: string; // Optional reference to a specific ManagementClaim
  eventId?: string; // Optional reference to a contradicting factual event
  description: string;
  divergenceDetails: {
    whatManagementClaimed?: string;
    whatActuallyHappened?: string;
    deltaMetric?: string;
  };

  // Multi-Evidence Lineage (Constitution Article 27)
  leftEvidenceId: string;           // Evidence ID for initial claim / statement / promise
  rightEvidenceId: string;          // Evidence ID for observed result / subsequent report
  supportingEvidenceIds: string[];  // Supplementary evidence IDs (rating reports, regulator orders)

  materiality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: ContradictionResolutionStatus;
  contradictionState?: ContradictionState;
  comparabilityState?: ComparabilityState;
  resolutionPolicyEvaluation?: ContradictionResolutionFactorEvaluation;
  detectedAt: string;
  createdAt: string;
  resolvedAt?: string;
  resolutionBasis?: string;
}
