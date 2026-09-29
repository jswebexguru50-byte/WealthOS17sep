/**
 * SourceDocument.ts — First-Class Source Document Contract
 * WealthOS V2 Wave B (Live Data and Evidence Ingestion)
 *
 * All raw external evidence, exchange filings, earnings releases, and disclosures
 * are ingested first as immutable SourceDocuments before being parsed into
 * CanonicalFacts, CompanyEvents, and ManagementCommitments.
 */

export type SourceDocumentType =
  | 'EXCHANGE_ANNOUNCEMENT'
  | 'FINANCIAL_RESULTS'
  | 'ANNUAL_REPORT'
  | 'INVESTOR_PRESENTATION'
  | 'SHAREHOLDING_DISCLOSURE'
  | 'CORPORATE_ACTION'
  | 'DAILY_PRICE'
  | 'TRANSCRIPT'
  | 'OTHER';

export type SourceDocumentParseStatus = 'PENDING' | 'PARSED' | 'FAILED' | 'SKIPPED';

export type SourceDocumentVerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';

export interface SourceDocument {
  documentId: string;
  securityId: string;
  symbol: string;
  sourceType: SourceDocumentType;
  sourceAuthority: string; // e.g. 'NSE' | 'BSE' | 'COMPANY_IR' | 'RBI' | 'SEBI'
  title: string;
  sourceUrl: string | null;
  publishedAt: string; // ISO date string
  availableAt: string; // ISO date string (Point-in-Time availability)
  fetchedAt: string; // ISO date string
  contentHash: string; // SHA-256 of raw content (Strict Idempotency Key)
  localPath: string | null;
  parseStatus: SourceDocumentParseStatus;
  verificationStatus: SourceDocumentVerificationStatus;
  rawMetadata?: Record<string, any>;
}

export interface IngestionResult {
  document: SourceDocument;
  isDuplicate: boolean;
  factsCreated: number;
  eventsCreated: number;
  commitmentsCreated: number;
  affectedModules: string[];
}
