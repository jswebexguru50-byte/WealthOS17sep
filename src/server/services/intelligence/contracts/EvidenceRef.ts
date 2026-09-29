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
  | 'PRICE_RECORD'
  | 'REGULATORY_DISCLOSURE'
  | 'CORPORATE_ACTION'
  | 'AUDITED_FINANCIAL_STATEMENT'
  | 'CREDIT_RATING_REPORT'
  | 'SHAREHOLDING_DISCLOSURE'
  | 'OTHER';

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
  periodStart?: string | null; // ISO date
  periodEnd?: string | null;   // ISO date
  page?: number | null;
  section?: string | null;
  quote?: string | null;
  contentHash?: string | null;
  extractionMethod: EvidenceExtractionMethod;
}
