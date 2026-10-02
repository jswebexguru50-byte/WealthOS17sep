/**
 * ExchangeDisclosureAcquisitionAdapter.ts — Production Disclosure Acquisition Adapter
 *
 * Implements Constitution P9:
 * - Adapter responsibilities ONLY:
 *   1. discover
 *   2. download / receive
 *   3. identify company
 *   4. capture source authority
 *   5. capture publication & availability timestamps
 *   6. capture source URL
 *   7. hash
 *   8. submit to SourceDocumentIngestionPipeline
 * - Zero investment analysis inside the adapter.
 * - SourceDocumentIngestionPipeline is the SOLE ingestion entry point.
 */

import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { SourceDocumentType, IngestionResult } from '../contracts/SourceDocument.js';
import {
  SourceDocumentIngestionPipeline,
  IngestionPayload,
} from './SourceDocumentIngestionPipeline.js';

export interface RawExchangeAnnouncement {
  symbol: string;
  isin?: string;
  companyName?: string;
  sourceAuthority: string; // e.g. 'NSE' | 'BSE' | 'COMPANY_IR'
  sourceType: SourceDocumentType;
  title: string;
  body: string;
  sourceUrl?: string;
  publishedAt: string;     // When announced on exchange
  availableAt: string;     // When captured in WealthOS
  financialMetrics?: {
    periodEnd: string;
    periodType: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'FY';
    scope?: 'CONSOLIDATED' | 'STANDALONE';
    revenue_cr?: number;
    ebitda_cr?: number;
    pat_cr?: number;
    rawMetrics?: Record<string, number>;
  };
  forwardLookingStatements?: Array<{
    speaker?: string;
    statement: string;
    metric?: string;
    targetValue?: number | string;
    targetUnit?: string;
    deadline?: string;
  }>;
}

export class ExchangeDisclosureAcquisitionAdapter {
  private static instance: ExchangeDisclosureAcquisitionAdapter;

  private constructor() {}

  public static getInstance(): ExchangeDisclosureAcquisitionAdapter {
    if (!ExchangeDisclosureAcquisitionAdapter.instance) {
      ExchangeDisclosureAcquisitionAdapter.instance = new ExchangeDisclosureAcquisitionAdapter();
    }
    return ExchangeDisclosureAcquisitionAdapter.instance;
  }

  /**
   * Acquire and submit a raw exchange disclosure into the master ingestion pipeline.
   * Pure acquisition layer — does not perform analytical or investment evaluation.
   */
  public async acquireAndIngest(announcement: RawExchangeAnnouncement): Promise<IngestionResult> {
    const isin = announcement.isin || `INE_${announcement.symbol}`;
    const identity: SecurityIdentity = {
      securityId: isin,
      isin,
      nseSymbol: announcement.symbol,
      companyName: announcement.companyName || announcement.symbol,
    };

    let mappedMetrics = undefined;
    if (announcement.financialMetrics) {
      const fm = announcement.financialMetrics;
      const metrics: Record<string, number | string> = { ...(fm.rawMetrics || {}) };
      if (fm.revenue_cr !== undefined) metrics['revenue_cr'] = fm.revenue_cr;
      if (fm.ebitda_cr !== undefined) metrics['ebitda_cr'] = fm.ebitda_cr;
      if (fm.pat_cr !== undefined) metrics['pat_cr'] = fm.pat_cr;

      mappedMetrics = {
        periodEnd: fm.periodEnd,
        periodType: (fm.periodType === 'FY' ? 'ANNUAL' : 'QUARTERLY') as 'ANNUAL' | 'QUARTERLY',
        scope: fm.scope || 'CONSOLIDATED',
        metrics,
      };
    }

    const mappedStatements = announcement.forwardLookingStatements?.map(s => ({
      quote: s.statement,
      speaker: s.speaker,
      pageOrSection: 'Exchange Filing',
    }));

    const payload: IngestionPayload = {
      identity,
      sourceType: announcement.sourceType,
      sourceAuthority: announcement.sourceAuthority,
      title: announcement.title,
      sourceUrl: announcement.sourceUrl || null,
      publishedAt: announcement.publishedAt,
      availableAt: announcement.availableAt || null,
      rawContent: announcement.body,
      financialMetrics: mappedMetrics,
      forwardLookingStatements: mappedStatements,
    };

    const pipeline = SourceDocumentIngestionPipeline.getInstance();
    return await pipeline.ingestDisclosure(payload);
  }
}
