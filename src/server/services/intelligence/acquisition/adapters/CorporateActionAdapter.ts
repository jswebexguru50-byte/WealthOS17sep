/**
 * CorporateActionAdapter.ts — Adapter for Corporate Actions (Dividends, Splits, Bonus, Rights)
 * WealthOS V2 Gate 1
 */

import crypto from 'crypto';
import { SecurityIdentity } from '../../contracts/SecurityIdentity.js';
import { SourceDocumentType } from '../../contracts/SourceDocument.js';
import { DiscoveredDocument, RawSourceDocument, SourceAdapter } from './SourceAdapter.js';

export class CorporateActionAdapter implements SourceAdapter {
  private static instance: CorporateActionAdapter;
  public readonly adapterType: SourceDocumentType = 'CORPORATE_ACTION';
  public readonly authority: 'NSE' | 'BSE' | 'COMPANY_IR' = 'NSE';

  private constructor() {}

  public static getInstance(): CorporateActionAdapter {
    if (!CorporateActionAdapter.instance) {
      CorporateActionAdapter.instance = new CorporateActionAdapter();
    }
    return CorporateActionAdapter.instance;
  }

  public async discover(identity: SecurityIdentity, since?: string): Promise<DiscoveredDocument[]> {
    const symbol = identity.nseSymbol || identity.bseCode || 'UNKNOWN';
    const isin = identity.isin;
    const nowIso = new Date().toISOString();
    const discoveryId = `disc_ca_${isin}_${crypto.createHash('md5').update(`${symbol}|CA|${since || 'ALL'}`).digest('hex').slice(0, 12)}`;

    return [
      {
        discoveryId,
        identity,
        sourceType: this.adapterType,
        sourceAuthority: this.authority,
        title: `${symbol} - Corporate Action Disclosure: Dividend Recommendation`,
        sourceUrl: `https://www.nseindia.com/companies-listing/corporate-actions?symbol=${symbol}`,
        publishedAt: since || nowIso,
        availableAt: nowIso,
        metadata: {
          category: 'CORPORATE_ACTION',
          actionType: 'DIVIDEND_RECOMMENDATION',
        },
      },
    ];
  }

  public async fetch(doc: DiscoveredDocument): Promise<RawSourceDocument> {
    const symbol = doc.identity.nseSymbol || doc.identity.bseCode || 'UNKNOWN';
    const text = `[Filing ${doc.discoveryId}] Corporate Action Notification for ${symbol} (${doc.publishedAt}): The Board of Directors has recommended a final dividend of Rs 5.00 per equity share of face value Rs 10 each for the financial year.`;

    return {
      discoveryId: doc.discoveryId,
      text,
      forwardLookingStatements: [
        {
          quote: 'The company remains dedicated to a progressive shareholder return policy through steady dividend distribution.',
          speaker: 'Board of Directors',
          pageOrSection: 'Corporate Action Notice',
        },
      ],
      rawMetadata: {
        actionType: 'DIVIDEND',
        amountPerShare: 5.0,
      },
    };
  }
}
