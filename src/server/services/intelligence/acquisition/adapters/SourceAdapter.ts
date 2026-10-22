/**
 * SourceAdapter.ts — Autonomous Source Acquisition Adapter Contract
 * WealthOS V2 Gate 1
 *
 * Non-negotiable rules:
 * 1. Adapters perform ONLY: discover, download/receive, identify company,
 *    capture authority/timestamps/URL, hash, and format for ingestion.
 * 2. ZERO investment analysis, valuation, or thesis evaluation inside adapters.
 * 3. SourceDocumentIngestionPipeline remains the SOLE ingestion entry point.
 */

import { SecurityIdentity } from '../../contracts/SecurityIdentity.js';
import { SourceDocumentType } from '../../contracts/SourceDocument.js';
import { RawFinancialDisclosure } from '../FinancialResultNormalizer.js';
import { RawStatementCandidate } from '../CommitmentExtractor.js';

export interface DiscoveredDocument {
  discoveryId: string;
  identity: SecurityIdentity;
  sourceType: SourceDocumentType;
  sourceAuthority: 'NSE' | 'BSE' | 'COMPANY_IR' | 'RBI' | 'SEBI';
  title: string;
  sourceUrl: string;
  publishedAt: string; // ISO date string
  availableAt: string; // ISO date string (PIT)
  metadata?: Record<string, any>;
}

export interface RawSourceDocument {
  discoveryId: string;
  text: string;
  binaryPath?: string | null;
  financialMetrics?: RawFinancialDisclosure;
  forwardLookingStatements?: RawStatementCandidate[];
  rawMetadata?: Record<string, any>;
}

export interface SourceAdapter {
  readonly adapterType: SourceDocumentType;
  readonly authority: 'NSE' | 'BSE' | 'COMPANY_IR';

  /**
   * Discover available disclosures for a security since a given date/time.
   */
  discover(identity: SecurityIdentity, since?: string): Promise<DiscoveredDocument[]>;

  /**
   * Fetch the raw content and structured candidate payload for a discovered document.
   */
  fetch(document: DiscoveredDocument): Promise<RawSourceDocument>;
}
