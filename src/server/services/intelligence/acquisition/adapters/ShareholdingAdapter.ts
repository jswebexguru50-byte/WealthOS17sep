/**
 * ShareholdingAdapter.ts — Adapter for Shareholding Pattern Disclosures (Clause 31)
 * WealthOS V2 Gate 1
 */

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

  /**
   * No real NSE/BSE Reg-31 source is wired up yet. Zero-synthetic policy: discover nothing
   * (and therefore persist nothing) rather than fabricate a filing.
   */
  public async discover(_identity: SecurityIdentity, _since?: string): Promise<DiscoveredDocument[]> {
    return [];
  }

  public async fetch(doc: DiscoveredDocument): Promise<RawSourceDocument> {
    throw new Error(`[ShareholdingAdapter] unavailable: no real shareholding source configured (${doc.discoveryId})`);
  }
}
