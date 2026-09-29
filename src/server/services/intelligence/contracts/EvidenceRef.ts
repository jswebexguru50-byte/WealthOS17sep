/**
 * EvidenceRef.ts — Constitution Article C1
 *
 * Grounding contract for all evidence citations across the WealthOS intelligence stack.
 * Every assertion must trace back to at least one valid EvidenceRef.
 */

export type EvidenceDocSourceType =
  | 'EXCHANGE_FILING'
  | 'ANNUAL_REPORT'
  | 'EARNINGS_TRANSCRIPT'
  | 'INVESTOR_PRESENTATION'
  | 'PRICE_RECORD'
  | 'REGULATORY_DISCLOSURE'
  | 'CORPORATE_ACTION'
  | 'AUDITED_FINANCIAL_STATEMENT'
  | 'CREDIT_RATING_REPORT'
  | 'SHAREHOLDING_DISCLOSURE'
  | 'OTHER';

/**
 * PIT (Point-In-Time) status for every resolved EvidenceRef.
 *
 * PIT_VERIFIED   — availableAt is explicitly known and <= asOfDate.
 * PIT_INFERRED   — availableAt was absent; periodEnd/reportedAt was substituted.
 *                  Acceptable for current analysis; excluded from strict historical replay.
 * PIT_UNKNOWN    — No date could be determined. Evidence is surfaced but excluded from
 *                  historical replay and flagged in coverage reports.
 */
export type PitStatus = 'PIT_VERIFIED' | 'PIT_INFERRED' | 'PIT_UNKNOWN';


export type EvidenceExtractionMethod =
  | 'MANUAL_AUDITED'
  | 'STRUCTURED_XBRL'
  | 'PARSED_REGEX'
  | 'LLM_EXTRACTED_VERIFIED'
  | 'DIRECT_EXCHANGE_FEED';

export interface EvidenceRef {
  evidenceId: string;
  sourceType: EvidenceDocSourceType;
  sourceName: string;
  sourceUrl?: string | null;
  documentDate: string;        // YYYY-MM-DD
  availableAt: string;         // ISO timestamp (PIT invariant)
  /**
   * Explicit PIT classification.
   * When absent, consumers MUST treat as PIT_INFERRED.
   * Set explicitly in EvidenceRepository.resolve() for all newly resolved refs.
   * Existing code that omits this field is implicitly PIT_INFERRED (availableAt may be a substitute).
   */
  pitStatus?: PitStatus;
  periodStart?: string | null; // ISO date
  periodEnd?: string | null;   // ISO date
  page?: number | null;
  section?: string | null;
  quote?: string | null;
  contentHash?: string | null;
  extractionMethod: EvidenceExtractionMethod;
}
