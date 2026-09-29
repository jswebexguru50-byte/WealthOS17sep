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
  documentDate: string | null;    // YYYY-MM-DD — best known publication date; null = genuinely unknown, do NOT fabricate today
  /**
   * When the document was first publicly available (PIT invariant).
   * null means genuinely unknown — do NOT substitute today, periodEnd, or reportedAt.
   * Historical replay must reject evidence where availableAt is null or pitStatus !== 'PIT_VERIFIED'.
   */
  availableAt: string | null;
  /**
   * Mandatory PIT classification. The compiler enforces this on every producer.
   * PIT_VERIFIED   — availableAt is explicitly known from the source record.
   * PIT_INFERRED   — availableAt was absent; documentDate/periodEnd was substituted.
   *                  Acceptable for current analysis; excluded from strict historical replay.
   * PIT_UNKNOWN    — No date can be determined. availableAt must be null.
   *                  Evidence is surfaced but excluded from all historical replay.
   */
  pitStatus: PitStatus;
  periodStart?: string | null;    // ISO date
  periodEnd?: string | null;      // ISO date
  page?: number | null;
  section?: string | null;
  quote?: string | null;
  contentHash?: string | null;
  extractionMethod: EvidenceExtractionMethod;
}
