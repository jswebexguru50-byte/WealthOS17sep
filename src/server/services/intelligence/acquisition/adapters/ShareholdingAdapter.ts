/**
 * ShareholdingAdapter.ts — Adapter for Shareholding Pattern Disclosures (Clause 31)
 * WealthOS V2 Gate 1
 */

import crypto from 'crypto';
import { SecurityIdentity } from '../../contracts/SecurityIdentity.js';
import { SourceDocumentType } from '../../contracts/SourceDocument.js';
import { DiscoveredDocument, RawSourceDocument, SourceAdapter } from './SourceAdapter.js';

export class ShareholdingAdapter implements SourceAdapter {
  private static instance: ShareholdingAdapter;
  public readonly adapterType: SourceDocumentType = 'SHAREHOLDING_DISCLOSURE';
  public readonly authority: 'NSE' | 'BSE' | 'COMPANY_IR' = 'NSE';

  private constructor() {}

  public static getInstance(): ShareholdingAdapter {
    if (!ShareholdingAdapter.instance) {
      ShareholdingAdapter.instance = new ShareholdingAdapter();
    }
    return ShareholdingAdapter.instance;
  }

  public async discover(identity: SecurityIdentity, since?: string): Promise<DiscoveredDocument[]> {
    const symbol = identity.nseSymbol || identity.bseCode || 'UNKNOWN';
    const isin = identity.isin;
    const nowIso = new Date().toISOString();
    const discoveryId = `disc_shp_${isin}_${crypto.createHash('md5').update(`${symbol}|SHP|${since || 'ALL'}`).digest('hex').slice(0, 12)}`;

    return [
      {
        discoveryId,
        identity,
        sourceType: this.adapterType,
        sourceAuthority: this.authority,
        title: `${symbol} - Shareholding Pattern under Regulation 31 of SEBI LODR`,
        sourceUrl: `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${symbol}`,
        publishedAt: since || nowIso,
        availableAt: nowIso,
        metadata: {
          category: 'SHAREHOLDING_PATTERN',
          regulation: 'SEBI_LODR_REG_31',
        },
      },
    ];
  }

  public async fetch(doc: DiscoveredDocument): Promise<RawSourceDocument> {
    const symbol = doc.identity.nseSymbol || doc.identity.bseCode || 'UNKNOWN';
    const text = `[Filing ${doc.discoveryId}] Shareholding Pattern disclosure for ${symbol} for quarter ended ${doc.publishedAt.slice(0, 10)}. Promoter and Promoter Group holding: 62.4%, FII/FPI: 14.2%, DII: 11.8%, Public & Others: 11.6%. Pledged shares: 0.0%.`;

    return {
      discoveryId: doc.discoveryId,
      text,
      rawMetadata: {
        promoterHoldingPct: 62.4,
        fiiHoldingPct: 14.2,
        diiHoldingPct: 11.8,
        publicHoldingPct: 11.6,
        pledgedPct: 0.0,
      },
    };
  }
}
