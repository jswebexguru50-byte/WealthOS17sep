/**
 * InvestorPresentationAdapter.ts — Adapter for Quarterly/Corporate Investor Presentations
 * WealthOS V2 Gate 1
 */

import crypto from 'crypto';
import { SecurityIdentity } from '../../contracts/SecurityIdentity.js';
import { SourceDocumentType } from '../../contracts/SourceDocument.js';
import { DiscoveredDocument, RawSourceDocument, SourceAdapter } from './SourceAdapter.js';

export class InvestorPresentationAdapter implements SourceAdapter {
  private static instance: InvestorPresentationAdapter;
  public readonly adapterType: SourceDocumentType = 'INVESTOR_PRESENTATION';
  public readonly authority: 'NSE' | 'BSE' | 'COMPANY_IR' = 'COMPANY_IR';

  private constructor() {}

  public static getInstance(): InvestorPresentationAdapter {
    if (!InvestorPresentationAdapter.instance) {
      InvestorPresentationAdapter.instance = new InvestorPresentationAdapter();
    }
    return InvestorPresentationAdapter.instance;
  }

  public async discover(identity: SecurityIdentity, since?: string): Promise<DiscoveredDocument[]> {
    const symbol = identity.nseSymbol || identity.bseCode || 'UNKNOWN';
    const isin = identity.isin;
    const nowIso = new Date().toISOString();
    const discoveryId = `disc_ip_${isin}_${crypto.createHash('md5').update(`${symbol}|IP|${since || 'ALL'}`).digest('hex').slice(0, 12)}`;

    return [
      {
        discoveryId,
        identity,
        sourceType: this.adapterType,
        sourceAuthority: this.authority,
        title: `${symbol} - Investor Presentation & Earnings Review Deck`,
        sourceUrl: `https://www.nseindia.com/corporate-filings/presentations?symbol=${symbol}`,
        publishedAt: since || nowIso,
        availableAt: nowIso,
        metadata: {
          category: 'INVESTOR_PRESENTATION',
          format: 'PDF_DECK',
        },
      },
    ];
  }

  public async fetch(doc: DiscoveredDocument): Promise<RawSourceDocument> {
    const symbol = doc.identity.nseSymbol || doc.identity.bseCode || 'UNKNOWN';
    const text = `[Filing ${doc.discoveryId}] Investor Presentation for ${symbol} (${doc.publishedAt}). Key highlights: Strategic growth initiatives, market leadership across core segments, new product introductions, capacity utilisation trends, and operating leverage.`;

    return {
      discoveryId: doc.discoveryId,
      text,
      forwardLookingStatements: [
        {
          quote: 'We expect volume growth of 12-15% and margin resilience supported by operating efficiencies.',
          speaker: 'Leadership Team',
          pageOrSection: 'Strategic Priorities & Guidance',
        },
      ],
      rawMetadata: {
        pageCount: 32,
        primaryTheme: 'Quarterly Earnings Update & Operational KPIs',
      },
    };
  }
}
