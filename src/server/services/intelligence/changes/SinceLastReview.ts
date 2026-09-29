/**
 * SinceLastReview.ts — First-Class "What Changed?" Intelligence Engine
 *
 * Implements Constitution P5:
 * - Compares two snapshots or derives from CompanySnapshotDelta
 * - Categorizes material changes into:
 *   financial, business, management, valuation, market, risk, thesis
 * - Every material change contains evidence reference
 * - Supplies data for Overview -> What Changed, Changes tab, and Intelligence Inbox
 */

import { EvidenceReference } from '../contracts/Provenance.js';
import { CompanySnapshotDelta } from '../contracts/CompanySnapshot.js';

export type ChangeCategory =
  | 'financial'
  | 'business'
  | 'management'
  | 'valuation'
  | 'market'
  | 'risk'
  | 'thesis';

export interface MaterialChangeItem {
  id: string;
  category: ChangeCategory;
  title: string;
  description: string;
  previousValue?: any;
  currentValue?: any;
  changeType: 'IMPROVED' | 'DETERIORATED' | 'NEW' | 'REVISED' | 'RESOLVED' | 'CONTRADICTED';
  materiality: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceRef?: EvidenceReference | null;
  occurredAt?: string;
}

export interface SinceLastReviewReport {
  securityId: string;
  symbol: string;
  baselineSnapshotId: string | null;
  currentSnapshotId: string;
  baselineAsOf: string | null;
  currentAsOf: string;
  generatedAt: string;
  totalChanges: number;
  categorizedChanges: Record<ChangeCategory, MaterialChangeItem[]>;
  summary: string[];
  isInitialBaseline: boolean;
}

export class SinceLastReviewEngine {
  private static instance: SinceLastReviewEngine;

  private constructor() {}

  public static getInstance(): SinceLastReviewEngine {
    if (!SinceLastReviewEngine.instance) {
      SinceLastReviewEngine.instance = new SinceLastReviewEngine();
    }
    return SinceLastReviewEngine.instance;
  }

  /**
   * Build a SinceLastReview report from delta and snapshot context.
   */
  public buildReport(params: {
    securityId: string;
    symbol: string;
    delta?: any;
    currentSnapshotId: string;
    currentAsOf: string;
    evidenceMap?: Map<string, EvidenceReference>;
    fallbackEvidence?: EvidenceReference | null;
  }): SinceLastReviewReport {
    const { securityId, symbol, delta, currentSnapshotId, currentAsOf, evidenceMap, fallbackEvidence } = params;

    const categorizedChanges: Record<ChangeCategory, MaterialChangeItem[]> = {
      financial: [],
      business: [],
      management: [],
      valuation: [],
      market: [],
      risk: [],
      thesis: [],
    };

    const rawChanges: Array<{ domain?: string; metricOrKey: string; changeType: any; previousValue?: any; currentValue?: any; narrative?: string }> =
      Array.isArray(delta?.changes) ? delta.changes :
      Array.isArray(delta?.deltas) ? delta.deltas.map((d: any) => ({
        domain: d.category || 'FINANCIAL',
        metricOrKey: d.metric,
        changeType: d.direction || 'REVISED',
        previousValue: d.previousValue,
        currentValue: d.currentValue,
        narrative: d.explanation || `${d.metric}: ${d.previousValue ?? 'N/A'} → ${d.currentValue ?? 'N/A'}`,
      })) : [];

    if (!delta || delta.isFirstRun || rawChanges.length === 0) {
      return {
        securityId,
        symbol,
        baselineSnapshotId: delta?.fromSnapshotId || null,
        currentSnapshotId,
        baselineAsOf: delta?.fromAsOf || null,
        currentAsOf,
        generatedAt: new Date().toISOString(),
        totalChanges: 0,
        categorizedChanges,
        summary: [`Initial analytical baseline established as of ${currentAsOf}. Material deltas will track subsequent disclosures.`],
        isInitialBaseline: true,
      };
    }

    let changeIndex = 0;
    for (const ch of rawChanges) {
      changeIndex++;
      const cat = this.mapDomainToCategory(ch.domain, ch.metricOrKey);
      const evidence = (evidenceMap && ch.metricOrKey ? evidenceMap.get(ch.metricOrKey) : null) || fallbackEvidence || null;

      const item: MaterialChangeItem = {
        id: `chg_${securityId}_${cat}_${changeIndex}`,
        category: cat,
        title: this.formatChangeTitle(ch.domain, ch.metricOrKey, ch.changeType),
        description: ch.narrative || `${ch.metricOrKey} changed: ${ch.previousValue ?? 'N/A'} → ${ch.currentValue ?? 'N/A'}`,
        previousValue: ch.previousValue,
        currentValue: ch.currentValue,
        changeType: (ch.changeType as any) || 'REVISED',
        materiality: this.assessMateriality(cat, ch.changeType),
        evidenceRef: evidence,
        occurredAt: delta.toAsOf || currentAsOf,
      };

      categorizedChanges[cat].push(item);
    }

    const totalChanges = Object.values(categorizedChanges).reduce((sum, arr) => sum + arr.length, 0);

    const summary: string[] = [];
    for (const [cat, items] of Object.entries(categorizedChanges)) {
      if (items.length > 0) {
        summary.push(`${cat.toUpperCase()}: ${items.map(i => i.title).join(', ')}`);
      }
    }

    if (summary.length === 0) {
      summary.push(`No material changes identified between ${delta.fromAsOf} and ${delta.toAsOf}.`);
    }

    return {
      securityId,
      symbol,
      baselineSnapshotId: delta.fromSnapshotId,
      currentSnapshotId,
      baselineAsOf: delta.fromAsOf,
      currentAsOf,
      generatedAt: new Date().toISOString(),
      totalChanges,
      categorizedChanges,
      summary,
      isInitialBaseline: false,
    };
  }

  private mapDomainToCategory(domain?: string, metricKey?: string): ChangeCategory {
    const d = (domain || '').toUpperCase();
    const k = (metricKey || '').toLowerCase();

    if (d.includes('THESIS') || k.includes('thesis') || k.includes('pillar')) return 'thesis';
    if (d.includes('RISK') || k.includes('risk') || k.includes('audit')) return 'risk';
    if (d.includes('MGMT') || d.includes('MANAGEMENT') || k.includes('promoter') || k.includes('commitment')) return 'management';
    if (d.includes('VALUATION') || k.includes('pe') || k.includes('multiple') || k.includes('dcf')) return 'valuation';
    if (d.includes('TECH') || d.includes('MARKET') || d.includes('PRICE') || k.includes('price')) return 'market';
    if (d.includes('BUSINESS') || d.includes('DRIVER') || k.includes('capacity') || k.includes('volume')) return 'business';
    return 'financial';
  }

  private formatChangeTitle(domain?: string, key?: string, changeType?: string): string {
    const cleanKey = (key || 'Metric').replace(/_/g, ' ');
    const typeLabel = changeType === 'IMPROVED' ? 'Improved' :
      changeType === 'DETERIORATED' ? 'Deteriorated' :
      changeType === 'NEW' ? 'New disclosure' : 'Updated';
    return `${cleanKey} (${typeLabel})`;
  }

  private assessMateriality(category: ChangeCategory, changeType?: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (category === 'thesis' || category === 'management' || changeType === 'DETERIORATED') return 'HIGH';
    if (category === 'financial' || category === 'valuation') return 'MEDIUM';
    return 'LOW';
  }
}
