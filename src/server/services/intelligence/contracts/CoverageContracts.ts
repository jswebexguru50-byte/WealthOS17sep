/**
 * CoverageContracts.ts — Constitution Article C5
 *
 * Replaces simplistic row or snapshot count with granular field-level coverage contracts.
 */

export type DataCoverageStatus =
  | 'COMPLETE'              // All required core fields verified with unbroken time series
  | 'SUFFICIENT'            // Minimum analytical requirements met to form robust conclusions
  | 'PARTIAL'               // Some core metrics present; certain dimensions unobservable
  | 'INSUFFICIENT'          // Below analytical threshold; module MUST report DATA_INSUFFICIENT
  | 'SOURCE_UNAVAILABLE'    // No primary or secondary source documents available
  | 'STALE'                 // Data exists but exceeds fresh lookback cutoff
  | 'CONFLICTED';           // Incompatible numbers between reputable providers

export interface FieldCoverage {
  field: string;
  status: 'VERIFIED' | 'DERIVED' | 'PARTIAL' | 'MISSING' | 'CONFLICTED';
  periodsAvailable: number; // e.g. 5 for 5 fiscal years
  latestPeriod?: string | null;
  earliestPeriod?: string | null;
  sourceType?: string | null;
}

export interface DomainCoverage {
  domain: 'FUNDAMENTALS' | 'BUSINESS_DRIVERS' | 'MANAGEMENT' | 'VALUATION' | 'TECHNICAL' | 'FERE_FILINGS';
  overallStatus: DataCoverageStatus;
  requiredFieldsPresent: number;
  totalRequiredFields: number;
  fields: Record<string, FieldCoverage>;
  unobservableDimensions: string[];
}

export interface CompanyDataCoverage {
  securityId: string;
  isin: string;
  asOfDate: string;
  overallSuitability: 'FULL_ANALYSIS' | 'CONDITIONAL_ANALYSIS' | 'DATA_INSUFFICIENT';
  domains: Record<string, DomainCoverage>;
  lastAuditedAt: string;
}
