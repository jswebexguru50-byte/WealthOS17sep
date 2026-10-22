/**
 * IntelligenceResult.ts — Wave 0 Contract Freeze
 *
 * Common result wrapper for all WealthOS V2 intelligence outputs.
 *
 * Keeps the system honest:
 * - evidenceCoverage is separate from execution status
 * - limitations must be explicit, not hidden
 * - No "pretending to be complete" (C20)
 */

export type IntelligenceStatus =
  | 'WORKING'           // computed successfully with adequate evidence
  | 'PARTIAL'           // computed but evidence is incomplete
  | 'DATA_INSUFFICIENT' // insufficient data to produce meaningful output
  | 'ERROR';            // execution failed

export type EvidenceCoverage =
  | 'COMPLETE'          // all required evidence present
  | 'PARTIAL'           // some evidence missing but output still useful
  | 'LOW'               // minimal evidence — interpret with caution
  | 'NONE';             // no evidence found

export interface IntelligenceResult<T> {
  asOfDate: string;

  status: IntelligenceStatus;

  data: T | null;

  evidenceCoverage: EvidenceCoverage;

  /**
   * Explicit limitations.
   * If something is missing or uncertain, say so here.
   * NEVER leave empty when status is PARTIAL.
   */
  limitations: string[];
}

// ─── Business Model Registry ──────────────────────────────────────────────────

/**
 * Canonical business model classification.
 *
 * IMPORTANT: Two-layer architecture:
 * - data/business_model_registry.json = seed file (versioned reference)
 * - company_business_model DB table = canonical runtime source
 *
 * After seeding, DB is authoritative. JSON is never queried at runtime.
 * BusinessModelClassifier queries DB first, falls back to sector/industry heuristics.
 */
export type PrimaryBusinessModel =
  | 'BANK'
  | 'NBFC'
  | 'INSURANCE'
  | 'ASSET_MANAGER'
  | 'IT_SERVICES'
  | 'MANUFACTURING'
  | 'COMMODITY'
  | 'CONSUMER'
  | 'RETAIL'
  | 'HEALTHCARE'
  | 'REAL_ESTATE'
  | 'UTILITY'
  | 'OTHER';

export interface CompanyBusinessModelRecord {
  securityId: string;
  symbol: string;
  primaryModel: PrimaryBusinessModel;
  sector: string;
  industry: string;
  requiredMetrics: string[];    // must have these for meaningful analysis
  optionalMetrics: string[];    // enriching if present
  valuationMetrics: string[];   // e.g. PE for IT, P/Book for banks, EV/EBITDA for manufacturing
  operatingKpis: string[];      // sector-specific e.g. 'loan_growth', 'utilisation_pct'
}
