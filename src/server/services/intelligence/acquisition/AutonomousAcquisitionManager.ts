/**
 * AutonomousAcquisitionManager.ts — Master Multi-Source Autonomous Acquisition Manager
 * WealthOS V2 Gate 1
 *
 * Implements Constitution P9 & Gate 1:
 * - Orchestrates autonomous source discovery and fetching across all 6 core disclosure channels:
 *   1. Exchange announcements (NSE/BSE)
 *   2. Quarterly/annual financial results
 *   3. Integrated annual reports
 *   4. Investor presentations
 *   5. Shareholding pattern filings (Clause 31)
 *   6. Corporate actions (Dividends, Splits, Bonus)
 * - Single Write Authority: all discovered documents pass strictly through
 *   SourceDocumentIngestionPipeline.
 * - Zero analytical or investment evaluation inside acquisition layer.
 * - Cryptographic SHA-256 idempotency: re-fetching unchanged documents generates 0 duplicate facts.
 */

import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { SourceDocumentType, IngestionResult } from '../contracts/SourceDocument.js';
import { SourceDocumentIngestionPipeline, IngestionPayload } from './SourceDocumentIngestionPipeline.js';
import { SourceAdapter, DiscoveredDocument } from './adapters/SourceAdapter.js';
import { ExchangeAnnouncementAdapter } from './adapters/ExchangeAnnouncementAdapter.js';
import { FinancialResultsAdapter } from './adapters/FinancialResultsAdapter.js';
import { AnnualReportAdapter } from './adapters/AnnualReportAdapter.js';
import { InvestorPresentationAdapter } from './adapters/InvestorPresentationAdapter.js';
import { ShareholdingAdapter } from './adapters/ShareholdingAdapter.js';
import { CorporateActionAdapter } from './adapters/CorporateActionAdapter.js';

export interface AcquisitionReport {
  securityId: string;
  symbol: string;
  asOfDate: string;
  documentsDiscovered: number;
  documentsIngested: number;
  duplicatesSkipped: number;
  factsCreated: number;
  eventsCreated: number;
  commitmentsCreated: number;
  affectedModules: string[];
  results: IngestionResult[];
}

export class AutonomousAcquisitionManager {
  private static instance: AutonomousAcquisitionManager;
  private readonly adapters: Map<SourceDocumentType, SourceAdapter> = new Map();

  private constructor() {
    this.registerAdapter(ExchangeAnnouncementAdapter.getInstance());
    this.registerAdapter(FinancialResultsAdapter.getInstance());
    this.registerAdapter(AnnualReportAdapter.getInstance());
    this.registerAdapter(InvestorPresentationAdapter.getInstance());
    this.registerAdapter(ShareholdingAdapter.getInstance());
    this.registerAdapter(CorporateActionAdapter.getInstance());
  }

  public static getInstance(): AutonomousAcquisitionManager {
    if (!AutonomousAcquisitionManager.instance) {
      AutonomousAcquisitionManager.instance = new AutonomousAcquisitionManager();
    }
    return AutonomousAcquisitionManager.instance;
  }

  public registerAdapter(adapter: SourceAdapter): void {
    this.adapters.set(adapter.adapterType, adapter);
  }

  public getRegisteredAdapters(): SourceDocumentType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Autonomously discovers and ingests all newly available disclosures across all adapters.
   */
  public async acquireDisclosuresForCompany(
    identity: SecurityIdentity,
    since?: string
  ): Promise<AcquisitionReport> {
    const pipeline = SourceDocumentIngestionPipeline.getInstance();
    const symbol = identity.nseSymbol || identity.bseCode || 'UNKNOWN';
    const isin = identity.isin;

    const report: AcquisitionReport = {
      securityId: isin,
      symbol,
      asOfDate: new Date().toISOString(),
      documentsDiscovered: 0,
      documentsIngested: 0,
      duplicatesSkipped: 0,
      factsCreated: 0,
      eventsCreated: 0,
      commitmentsCreated: 0,
      affectedModules: [],
      results: [],
    };

    const affectedSet = new Set<string>();

    for (const [type, adapter] of this.adapters.entries()) {
      try {
        const discovered = await adapter.discover(identity, since);
        report.documentsDiscovered += discovered.length;

        for (const doc of discovered) {
          const raw = await adapter.fetch(doc);

          const payload: IngestionPayload = {
            identity: doc.identity,
            sourceType: doc.sourceType,
            sourceAuthority: doc.sourceAuthority,
            title: doc.title,
            sourceUrl: doc.sourceUrl,
            publishedAt: doc.publishedAt,
            availableAt: doc.availableAt,
            rawContent: raw.text,
            financialMetrics: raw.financialMetrics,
            forwardLookingStatements: raw.forwardLookingStatements,
          };

          const ingestionRes = await pipeline.ingestDisclosure(payload);
          report.results.push(ingestionRes);

          if (ingestionRes.isDuplicate) {
            report.duplicatesSkipped++;
          } else {
            report.documentsIngested++;
            report.factsCreated += ingestionRes.factsCreated;
            report.eventsCreated += ingestionRes.eventsCreated;
            report.commitmentsCreated += ingestionRes.commitmentsCreated;
            for (const mod of ingestionRes.affectedModules) {
              affectedSet.add(mod);
            }
          }
        }
      } catch (adapterErr) {
        console.warn(`[AutonomousAcquisitionManager] Error running adapter for ${type} on ${symbol}:`, adapterErr);
      }
    }

    report.affectedModules = Array.from(affectedSet);
    return report;
  }

  /**
   * Acquire a specific document type for a company.
   */
  public async acquireSpecificType(
    identity: SecurityIdentity,
    type: SourceDocumentType,
    since?: string
  ): Promise<IngestionResult[]> {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`[AutonomousAcquisitionManager] No registered adapter for type: ${type}`);
    }

    const pipeline = SourceDocumentIngestionPipeline.getInstance();
    const discovered = await adapter.discover(identity, since);
    const results: IngestionResult[] = [];

    for (const doc of discovered) {
      const raw = await adapter.fetch(doc);
      const payload: IngestionPayload = {
        identity: doc.identity,
        sourceType: doc.sourceType,
        sourceAuthority: doc.sourceAuthority,
        title: doc.title,
        sourceUrl: doc.sourceUrl,
        publishedAt: doc.publishedAt,
        availableAt: doc.availableAt,
        rawContent: raw.text,
        financialMetrics: raw.financialMetrics,
        forwardLookingStatements: raw.forwardLookingStatements,
      };
      const res = await pipeline.ingestDisclosure(payload);
      results.push(res);
    }

    return results;
  }
}
