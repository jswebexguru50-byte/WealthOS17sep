/**
 * ThesisDefinition.ts
 *
 * Layer 5 Decision & Thesis Breaker model.
 * Connects verified claims, events, and contradictions directly to testable investment theses.
 * Features machine-executable breaker evaluation rules (Constitution Article 28).
 */

export type BreakerEvaluationMethod =
  | 'METRIC_THRESHOLD'
  | 'EVENT_MATCH'
  | 'EVENT_ABSENCE'
  | 'MANAGEMENT_CLAIM_FAILURE'
  | 'MANUAL_REVIEW';

export type BreakerStatus =
  | 'ACTIVE'                 // Breached -> Triggers hard thesis veto (BROKEN)
  | 'INACTIVE'               // Evaluated -> Threshold not breached
  | 'EVALUATION_UNRESOLVED'  // Evidence exists, but regulatory/legal interpretation is pending
  | 'EVIDENCE_UNKNOWN'       // Primary documentation absent (Article 25)
  | 'NOT_APPLICABLE'         // Breaker condition does not apply to entity structure
  | 'NOT_DUE';               // Observation horizon not yet reached

/**
 * Maps domain BreakerStatus to legacy presentation string if required by external consumers.
 * Strictly confined to presentation boundaries; never allowed in reasoning engines.
 */
export function mapBreakerStatusToPresentation(status: BreakerStatus): string {
  if (status === 'EVALUATION_UNRESOLVED' || status === 'EVIDENCE_UNKNOWN') {
    return 'UNRESOLVED';
  }
  return status;
}

export interface QuantitativeBreakerCondition {
  metric: string; // e.g., "net_debt_to_ebitda", "ebitda_margin_pct", "operating_cash_flow"
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  evaluationPeriod: string; // e.g. "quarterly", "FY2025"
  evidenceRequired: boolean;
}

export interface QualitativeBreakerCondition {
  eventCategory: string; // e.g., "REGULATORY", "GOVERNANCE", "AUDITOR"
  materiality: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  requiresPrimaryEvidence: boolean;
}

export interface ThesisBreaker {
  breakerId: string;
  name: string;
  description: string;
  type: 'QUANTITATIVE' | 'QUALITATIVE';
  evaluationMethod: BreakerEvaluationMethod;
  conditionText: string; // e.g. "Net Debt / EBITDA > 3.0x" or "Major regulatory action on core licenses"
  quantitativeCondition?: QuantitativeBreakerCondition;
  qualitativeCondition?: QualitativeBreakerCondition;
  currentObservedValue?: string | number;
  status: BreakerStatus;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rationale: string;
  evidenceIds: string[];
}

export interface InvestmentThesis {
  thesisId: string;
  issuerNseSymbol: string;
  thesisStatement: string; // e.g., "Solar Industries can compound earnings at 25%+ driven by defense export scaling"
  corePillars: Array<{
    pillar: string;
    status: 'CONFIRMED' | 'CHALLENGED' | 'UNKNOWN';
    supportingClaims: string[];
    supportingEvents: string[];
  }>;
  thesisBreakers: ThesisBreaker[];
  activeStatus: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UnknownState =
  | 'NOT_YET_CHECKED'
  | 'SEARCHED_AND_NOT_FOUND'
  | 'UNRESOLVED'
  | 'CONFIRMED_ABSENT'
  | 'NOT_APPLICABLE';

export interface ImportantUnknown {
  domain:
    | 'GOVERNANCE'
    | 'CAPEX_PROGRESS'
    | 'LITIGATION'
    | 'RELATED_PARTY'
    | 'OFF_BALANCE_SHEET'
    | 'ORDER_BOOK_RUNWAY'
    | 'CUSTOMER_CONCENTRATION';
  question: string;
  state: UnknownState;
  decisionImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  lastSearchedAt?: string;
  searchSummary?: string;
}
