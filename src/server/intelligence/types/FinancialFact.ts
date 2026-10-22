/**
 * FinancialFact.ts
 *
 * First-class Financial Fact layer (FERE Architecture v3.2.1).
 * Sits strictly between raw EvidenceSpans and high-level ManagementClaims/Targets.
 * Enforces canonical metric naming, units, temporal intervals (periodStart/periodEnd or asOfDate),
 * and formal multi-gate source verification metadata.
 *
 * v3.2.1 Changes:
 * - Added AccountingMethodology and AccountingStandard types (replaces hardcoded sameMethodology=true)
 * - Added VALID_UNITS_BY_FAMILY ontology map for semantic unit validation in Gate A
 * - Made scope non-optional in FinancialFact (required field)
 * - scope and sourceQuotedText are now mandatory in CandidateFactInput (see FactValidationGate.ts)
 *
 * Verification Status:
 * - CANDIDATE: Raw extraction from LLM or heuristic parser before Gate A
 * - SOURCE_SUPPORTED: Deterministically verified against cited source text via Gate A
 * - INDEPENDENTLY_VALIDATED: Confirmed against authoritative secondary/statutory filing via Gate B
 * - CONFLICTING: Divergence detected against source of equivalent authority
 * - SUPERSEDED: Replaced by subsequent audited restatement or amendment
 * - STALE: Outdated past configured metric durability horizon
 * - REJECTED: Failed Gate A extraction validation
 */

export type MeasurementType = 'STOCK' | 'FLOW' | 'RATIO' | 'STRUCTURAL_EVENT';
export type QuantityType = 'CURRENCY' | 'PERCENTAGE' | 'COUNT' | 'RATIO' | 'VOLUME';
export type MetricScope = 'STANDALONE' | 'CONSOLIDATED' | 'SEGMENT';

// v3.2.1: Formal accounting methodology taxonomy (replaces hardcoded sameMethodology=true)
export type AccountingMethodology = 'REPORTED' | 'ADJUSTED' | 'NORMALIZED' | 'STATUTORY' | 'MANAGEMENT_DEFINED';

// v3.2.1: Accounting standard taxonomy
export type AccountingStandard = 'IND_AS' | 'IFRS' | 'US_GAAP' | 'IGAAP' | 'UNKNOWN';

export type MetricFamily =
  | 'ORDER_BOOK'
  | 'DISPATCH'
  | 'REVENUE'
  | 'MARGIN'
  | 'LEVERAGE'
  | 'SOLVENCY'
  | 'CONCENTRATION'
  | 'CAPACITY'
  | 'REGULATORY'
  | 'DIVIDEND';

/**
 * v3.2.1: Canonical unit ontology per metric family.
 * Gate A uses this map to enforce semantic unit consistency (not just presence).
 *
 * INVARIANT: A candidate fact's unit MUST appear in the set for its metric family.
 *            If not, Gate A check unitConsistentWithFamily = false → REJECTED.
 */
export const VALID_UNITS_BY_FAMILY: Record<MetricFamily, Set<string>> = {
  ORDER_BOOK:    new Set(['INR_CRORE', 'INR_LAKH', 'USD_MILLION', 'USD_BILLION', 'CRORE', 'LAKH', 'MILLION', 'BILLION']),
  DISPATCH:      new Set(['MW', 'GW', 'MWH', 'GWH', 'MT', 'TONNES', 'UNITS', 'INR_CRORE', 'CRORE', 'LAKH']),
  REVENUE:       new Set(['INR_CRORE', 'INR_LAKH', 'USD_MILLION', 'USD_BILLION', 'CRORE', 'LAKH', 'MILLION', 'BILLION']),
  MARGIN:        new Set(['%', 'PERCENT', 'BPS', 'BASIS_POINTS']),
  LEVERAGE:      new Set(['X', 'RATIO', 'TIMES', 'MULTIPLE', 'INR_CRORE', 'CRORE', 'LAKH', 'USD_MILLION']),
  SOLVENCY:      new Set(['X', 'RATIO', 'TIMES', 'MULTIPLE', '%', 'PERCENT', 'INR_CRORE', 'CRORE']),
  CONCENTRATION: new Set(['%', 'PERCENT', 'RATIO']),
  CAPACITY:      new Set(['MW', 'GW', 'MWH', 'GWH', 'MT', 'TONNES', 'UNITS']),
  REGULATORY:    new Set(['INR_CRORE', 'CRORE', 'USD_MILLION', 'MILLION', 'UNITS', '%', 'PERCENT']),
  DIVIDEND:      new Set(['INR_PER_SHARE', 'RS_PER_SHARE', '%', 'PERCENT', 'INR_CRORE', 'CRORE']),
};

export interface MetricDefinition {
  metricId: string;
  metricFamily: MetricFamily;
  quantityType: QuantityType;
  defaultUnit: string;
  currency?: string;
  scope: MetricScope;
  flowOrStock: 'STOCK' | 'FLOW';
  periodType?: 'ANNUAL' | 'QUARTERLY' | 'POINT_IN_TIME';
  aggregation?: 'SUM' | 'POINT_IN_TIME' | 'WEIGHTED_AVERAGE';
}

export type FactAuditStatus = 'AUDITED' | 'UNAUDITED' | 'LIMITED_REVIEW' | 'PROVISIONAL';
export type FactExtractionMethod = 'LLM' | 'RULE' | 'MANUAL';
export type FactVerificationStatus =
  | 'CANDIDATE'
  | 'SOURCE_SUPPORTED'
  | 'INDEPENDENTLY_VALIDATED'
  | 'CONFLICTING'
  | 'SUPERSEDED'
  | 'STALE'
  | 'UNKNOWN'
  | 'REJECTED';

export type FactVerificationMethod =
  | 'DETERMINISTIC_GATE_PASSED'
  | 'INDEPENDENT_AUDIT_VERIFIED'
  | 'SECONDARY_SOURCE_CORROBORATED'
  | 'PROVISIONAL_EXTRACTION'
  | 'REJECTED';

export interface SourceAuditMetadata {
  sourceEvidenceId: string;
  sourceAuthority?: string;
  filingType?: string;
  filingDate?: string;
  auditStatus?: FactAuditStatus;
  auditor?: string;
  documentHash?: string;
  hierarchyRank?: number; // 5 = BSE/NSE Audited, 4 = Annual Report, 3 = Presentation, 2 = Concall, 1 = Press Release
}

export interface FactVerificationMetadata {
  extractionMethod: FactExtractionMethod;
  verificationStatus: FactVerificationStatus;
  verificationMethod: FactVerificationMethod;
  gatePassedAt?: string;
  gateAChecks?: {
    metricRegistered: boolean;
    unitConsistentWithFamily: boolean;  // v3.2.1: Now checks against VALID_UNITS_BY_FAMILY ontology
    issuerMatchesScope: boolean;
    datesChronologicallySound: boolean;
    numericalEquivalenceInQuote: boolean;
    sourceSpanAuthentic: boolean;
    scopeDeclared: boolean;             // v3.2.1: undefined scope now FAILS (strict)
    quotePresent: boolean;              // v3.2.1: sourceQuotedText now mandatory
    currencyConsistent: boolean;        // v3.2.1: currency must match across candidate and quote
  };
  metricBinding?: import('./MetricBinding.js').MetricBinding;
  humanOverrideProvenance?: import('./MetricBinding.js').HumanOverrideProvenance;
}

export interface IndependentVerificationMetadata {
  independentAuthority?: string;
  secondaryEvidenceId?: string;
  corroborationMethod?: string;
  restatementChecked?: boolean;
  isRestated?: boolean;
  validatedAt?: string;
}

export interface FinancialFact {
  factId: string;
  issuerSymbol: string;
  metric: string;
  metricId?: string;
  metricFamily: MetricFamily;
  value: number | string;
  unit: string;
  currency?: string;
  scope: MetricScope;  // v3.2.1: Now required (non-optional). All facts must declare scope.
  measurementType: MeasurementType;

  // v3.2.1: Accounting methodology and standard (replaces hardcoded sameMethodology = true)
  accountingMethodology?: AccountingMethodology;
  accountingStandard?: AccountingStandard;

  // Explicit Temporal Boundaries
  asOfDate?: string;          // Point-in-time / STOCK observation date (YYYY-MM-DD)
  periodStart?: string;       // FLOW start date (YYYY-MM-DD)
  periodEnd?: string;         // FLOW end date (YYYY-MM-DD)
  measurementPeriod?: string; // Human label e.g. "FY24", "Q4-FY24"

  /**
   * Date on which this evidence became publicly available to FERE.
   *
   * IMPORTANT:
   * This is distinct from:
   * - asOfDate: observation date for STOCK metrics
   * - periodEnd: accounting period end for FLOW metrics
   * - filingDate: regulatory filing date
   *
   * Historical replay MUST use publicationDate for admissibility.
   */
  publicationDate?: string;

  /**
   * Type of public availability event.
   */
  publicationDateType?:
    | 'FILING'
    | 'PRESS_RELEASE'
    | 'MANAGEMENT_COMMENT'
    | 'TRANSCRIPT'
    | 'WEBSITE_PUBLICATION'
    | 'SOCIAL_MEDIA'
    | 'VIDEO_PUBLICATION'
    | 'OTHER';

  sourceEvidenceId: string;

  // Source Provenance Metadata
  sourceAuthority?: string;
  filingType?: string;
  filingDate?: string;
  auditStatus?: FactAuditStatus;
  auditor?: string;
  sourceMetadata?: SourceAuditMetadata;

  // Fact Verification Metadata (strictly decoupled from source audit status)
  extractionMethod?: FactExtractionMethod;
  verificationStatus?: FactVerificationStatus;
  verificationMethod?: FactVerificationMethod;
  gatePassedAt?: string;
  verificationMetadata?: FactVerificationMetadata;

  // Gate B Independent Validation Metadata
  independentVerification?: IndependentVerificationMetadata;

  // Versioning
  schemaVersion?: string; // "3.2.1"
  ontologyVersion?: string; // "1.3"

  notes?: string;
}
