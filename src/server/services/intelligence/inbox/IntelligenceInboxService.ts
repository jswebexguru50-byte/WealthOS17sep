/**
 * IntelligenceInboxService.ts — Evidence-Backed Intelligence Inbox Service
 *
 * Implements Constitution P6 & P7:
 * - Aggregates monitored companies, material changes, watch triggers, and freshness
 * - Replaces legacy BUY/SELL composite-score watchlist with evidence-traceable inbox
 * - Strictly zero composite-scores or BUY/SELL recommendations
 */

import { WatchRuleRepository } from '../core/WatchRuleRepository.js';
import { CompanySnapshotRepository } from '../core/CompanySnapshotRepository.js';
import { CompanyIntelligenceOrchestrator } from '../CompanyIntelligenceOrchestrator.js';
import Database from 'better-sqlite3';
import path from 'path';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

export interface InboxItem {
  securityId: string;
  symbol: string;
  companyName: string;
  materialChangeCount: number;
  latestChangeTime: string | null;
  changeSummaries: string[];
  watchEventsCount: number;
  latestWatchEventSummary: string | null;
  freshnessStatus: string;
  coverageStatus: string;
  stance: string;
}

export interface IntelligenceInboxResponse {
  totalMonitored: number;
  items: InboxItem[];
  generatedAt: string;
}

export class IntelligenceInboxService {
  private static instance: IntelligenceInboxService;

  private constructor() {}

  public static getInstance(): IntelligenceInboxService {
    if (!IntelligenceInboxService.instance) {
      IntelligenceInboxService.instance = new IntelligenceInboxService();
    }
    return IntelligenceInboxService.instance;
  }

  public async getInbox(): Promise<IntelligenceInboxResponse> {
    const generatedAt = new Date().toISOString();
    const symbolsToInspect = new Set<string>();

    // 1. Collect securities from watch rules
    try {
      const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
      try {
        const rules = db.prepare(`SELECT DISTINCT symbol FROM watch_rules WHERE status = 'ACTIVE' LIMIT 20`).all() as any[];
        for (const r of rules) {
          if (r.symbol) symbolsToInspect.add(r.symbol.toUpperCase());
        }
      } finally {
        try { db.close(); } catch {}
      }
    } catch {}

    // 2. Add standard sample universe if empty
    if (symbolsToInspect.size === 0) {
      ['DYCL', 'TCS', 'HDFCBANK', 'TATAMOTORS', 'TATASTEEL'].forEach(s => symbolsToInspect.add(s));
    }

    const items: InboxItem[] = [];
    const orchestrator = CompanyIntelligenceOrchestrator.getInstance();

    for (const sym of Array.from(symbolsToInspect)) {
      try {
        // Zero-write inspection
        const intel = await orchestrator.orchestrate(sym, null, false);
        const watchEvents = await WatchRuleRepository.getInstance().getWatchEvents(intel.security.securityId, 5);

        const changeSummaries = intel.sinceLastReview?.summary || intel.overview?.whatChanged || [];
        const changeCount = intel.sinceLastReview?.totalChanges ?? 0;

        items.push({
          securityId: intel.security.securityId,
          symbol: intel.security.symbol,
          companyName: intel.security.companyName,
          materialChangeCount: changeCount,
          latestChangeTime: intel.sinceLastReview?.generatedAt || intel.generatedAt,
          changeSummaries: changeSummaries.slice(0, 3),
          watchEventsCount: watchEvents.length,
          latestWatchEventSummary: watchEvents[0]?.summary || null,
          freshnessStatus: intel.freshness?.overallStatus || 'UNKNOWN',
          coverageStatus: intel.coverage?.level || 'PARTIAL',
          stance: intel.overview?.thesisSummary?.stance || 'INSUFFICIENT_EVIDENCE',
        });
      } catch (err) {
        console.warn(`[IntelligenceInboxService] Failed to load intelligence for ${sym}:`, err);
      }
    }

    // Sort by material change count descending
    items.sort((a, b) => b.materialChangeCount - a.materialChangeCount);

    return {
      totalMonitored: items.length,
      items,
      generatedAt,
    };
  }
}
