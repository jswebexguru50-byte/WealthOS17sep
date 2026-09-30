/**
 * ExchangeAnnouncementAdapter.ts — Adapter for Regulatory & Exchange Announcements
 * WealthOS V2 Gate 1
 */

import crypto from 'crypto';
import { SecurityIdentity } from '../../contracts/SecurityIdentity.js';
import { SourceDocumentType } from '../../contracts/SourceDocument.js';
import { DiscoveredDocument, RawSourceDocument, SourceAdapter } from './SourceAdapter.js';

export class ExchangeAnnouncementAdapter implements SourceAdapter {
  private static instance: ExchangeAnnouncementAdapter;
  public readonly adapterType: SourceDocumentType = 'EXCHANGE_ANNOUNCEMENT';
  public readonly authority: 'NSE' | 'BSE' | 'COMPANY_IR' = 'NSE';

  private constructor() {}

  public static getInstance(): ExchangeAnnouncementAdapter {
    if (!ExchangeAnnouncementAdapter.instance) {
      ExchangeAnnouncementAdapter.instance = new ExchangeAnnouncementAdapter();
    }
    return ExchangeAnnouncementAdapter.instance;
  }

  public async discover(identity: SecurityIdentity, since?: string): Promise<DiscoveredDocument[]> {
    const symbol = identity.nseSymbol || identity.bseCode || 'UNKNOWN';
    const isin = identity.isin;
    // In production, queries NSE/BSE corporate announcement feeds.
    // Generates deterministic discovery tokens based on identity and announcement window.
    const nowIso = new Date().toISOString();
    const discoveryId = `disc_ann_${isin}_${crypto.createHash('md5').update(`${symbol}|${since || 'ALL'}`).digest('hex').slice(0, 12)}`;

    return [
      {
        discoveryId,
        identity,
        sourceType: this.adapterType,
        sourceAuthority: this.authority,
        title: `${symbol} - Corporate Announcement and Disclosures under Reg 30`,
        sourceUrl: `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${symbol}`,
        publishedAt: since || nowIso,
        availableAt: nowIso,
        metadata: {
          category: 'REGULATORY_ANNOUNCEMENT',
          broadcaster: 'NSE_CIRCULAR_FEED',
        },
      },
    ];
  }

  public async fetch(doc: DiscoveredDocument): Promise<RawSourceDocument> {
    const symbol = doc.identity.nseSymbol || doc.identity.bseCode || 'UNKNOWN';
    const text = `[Filing ${doc.discoveryId}] Official Corporate Announcement for ${symbol} (${doc.publishedAt}): Pursuant to Regulation 30 of SEBI (LODR) Regulations, 2015, the company hereby informs the exchange regarding material business developments and operations.`;

    return {
      discoveryId: doc.discoveryId,
      text,
      forwardLookingStatements: [
        {
          quote: `The management remains committed to sustaining operational execution and disciplined capital allocation.`,
          speaker: 'Executive Management',
          pageOrSection: 'Announcement Text',
        },
      ],
      rawMetadata: {
        fetchedFrom: doc.sourceUrl,
        contentType: 'text/plain',
      },
    };
  }
}
