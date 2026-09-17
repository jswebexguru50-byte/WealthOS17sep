/**
 * EvidenceSpan.ts
 *
 * Trust Layer (Layer 2) concrete evidence lineage model.
 * Every material assertion, management claim, or intelligence event must trace
 * to a verified EvidenceSpan anchored to a specific document, page, and hash.
 */

export type DocumentType =
  | 'ANNUAL_REPORT'
  | 'QUARTERLY_RESULT'
  | 'CONCALL_TRANSCRIPT'
  | 'EXCHANGE_FILING'
  | 'CREDIT_RATING_REPORT'
  | 'REGULATORY_ORDER'
  | 'INVESTOR_PRESENTATION'
  | 'EXTERNAL_DISCLOSURE';

export type VerificationStatus =
  | 'EXACT'
  | 'SEMANTICALLY_SUPPORTED'
  | 'HUMAN_CONFIRMED'
  | 'INSUFFICIENT_EVIDENCE_HEADING_ONLY'
  | 'UNVERIFIED';

export interface EvidenceSpan {
  evidenceId: string;
  issuerNseSymbol: string;
  issuerBseCode?: string;
  documentId: string;
  documentHash: string; // SHA-256 of physical source document
  documentType: DocumentType;
  reportingPeriod?: string; // e.g., "FY24", "Q1-FY25"
  page?: number;
  section?: string;
  quotedText: string;
  verificationStatus: VerificationStatus;
  sourceUrl?: string;
  capturedAt: string;
}
