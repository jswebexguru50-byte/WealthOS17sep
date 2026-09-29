/**
 * CompanyDeltaEngine.ts — Wave 2 Agent C
 *
 * Detects and ranks material changes across four comparison types.
 *
 * Constitution invariants:
 * - C18: Change is often more useful than state
 * - C5: Level ≠ Direction (delta compares two specific states)
 * - C8: PIT — compare what was knowable at each point
 * - Snapshots are NOT saved on every GET (only on material state change)
 * - Materiality thresholds are metric-aware (not universal %)
 */

import { getDB, dbAll, dbGet, dbRun } from '../../../database.js';
import {
  IntelligenceDelta,
  DeltaCategory,
  DeltaDirection,
  DeltaMateriality,
  DeltaComparisonType,
  MaterialityRule,
  DEFAULT_MATERIALITY_RULES,
  CompanyIntelligenceSnapshot,
} from '../contracts/DeltaContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import crypto from 'crypto';

// ─── Snapshot Store ───────────────────────────────────────────────────────────

export class CompanySnapshotStore {
  private static instance: CompanySnapshotStore;
  private constructor() {}

  public static getInstance(): CompanySnapshotStore {
    if (!CompanySnapshotStore.instance) {
      CompanySnapshotStore.instance = new CompanySnapshotStore();
    }
    return CompanySnapshotStore.instance;
  }

  /** Get the most recent snapshot for a company */
  public async getLatest(symbol: string): Promise<CompanyIntelligenceSnapshot | null> {
    const db = getDB();
    if (!db) return null;
    try {
      const row = await dbGet<any>(
        db,
        `SELECT * FROM company_intelligence_snapshot
         WHERE symbol = ?
         ORDER BY created_at DESC LIMIT 1`,
        [symbol]
      );
      if (!row) return null;
      return {
        securityId: row.security_id || symbol,
        symbol: row.symbol,
        asOfDate: row.as_of_date,
        contentHash: row.content_hash,
        fundamentalState: row.fundamental_state ? JSON.parse(row.fundamental_state) : null,
        managementState: row.management_state ? JSON.parse(row.management_state) : null,
        valuationState: row.valuation_state ? JSON.parse(row.valuation_state) : null,
        businessDriverState: row.business_driver_state ? JSON.parse(row.business_driver_state) : null,
        technicalState: row.technical_state ? JSON.parse(row.technical_state) : null,
        createdAt: row.created_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Save snapshot ONLY when content hash differs from previous.
   * Never saves on every GET — only on material state change.
   */
  public async saveIfChanged(snapshot: Omit<CompanyIntelligenceSnapshot, 'contentHash' | 'createdAt'>): Promise<boolean> {
    const db = getDB();
    if (!db) return false;

    try {
      // Compute content hash from ALL durable analytical states
      const hashInput = JSON.stringify({
        fundamentalState: snapshot.fundamentalState,
        managementState: snapshot.managementState,
        valuationState: snapshot.valuationState,
        businessDriverState: snapshot.businessDriverState,
        technicalState: snapshot.technicalState,
      });
      const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);

      // Check if latest snapshot has same hash
      const latest = await this.getLatest(snapshot.symbol);
      if (latest?.contentHash === contentHash) {
        return false; // No material change — do not save
      }

      await dbRun(
        db,
        `INSERT INTO company_intelligence_snapshot
          (security_id, symbol, as_of_date, content_hash, fundamental_state, management_state, valuation_state, business_driver_state, technical_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshot.securityId,
          snapshot.symbol,
          snapshot.asOfDate,
          contentHash,
          snapshot.fundamentalState ? JSON.stringify(snapshot.fundamentalState) : null,
          snapshot.managementState ? JSON.stringify(snapshot.managementState) : null,
          snapshot.valuationState ? JSON.stringify(snapshot.valuationState) : null,
          snapshot.businessDriverState ? JSON.stringify(snapshot.businessDriverState) : null,
          snapshot.technicalState ? JSON.stringify(snapshot.technicalState) : null,
          new Date().toISOString(),
        ]
      );
      return true; // Saved
    } catch {
      return false;
    }
  }

  /**
   * Load the most recent snapshot for delta comparison.
   * Alias for getLatest with securityId fallback.
   */
  public async loadPriorSnapshot(securityId: string): Promise<CompanyIntelligenceSnapshot | null> {
    const db = getDB();
    if (!db) return null;
    try {
      const row = await dbGet<any>(
        db,
        `SELECT * FROM company_intelligence_snapshot
         WHERE security_id = ? OR symbol = ?
         ORDER BY created_at DESC LIMIT 1`,
        [securityId, securityId]
      );
      if (!row) return null;
      return {
        securityId: row.security_id || securityId,
        symbol: row.symbol,
        asOfDate: row.as_of_date,
        contentHash: row.content_hash,
        fundamentalState: row.fundamental_state ? JSON.parse(row.fundamental_state) : null,
        managementState: row.management_state ? JSON.parse(row.management_state) : null,
        valuationState: row.valuation_state ? JSON.parse(row.valuation_state) : null,
        businessDriverState: row.business_driver_state ? JSON.parse(row.business_driver_state) : null,
        technicalState: row.technical_state ? JSON.parse(row.technical_state) : null,
        createdAt: row.created_at,
      };
    } catch {
      return null;
    }
  }
}

// ─── Delta Engine ──────────────────────────────────────────────────────────────

export class CompanyDeltaEngine {
  private static instance: CompanyDeltaEngine;
  private readonly materialityRules: MaterialityRule[];

  private constructor() {
    this.materialityRules = DEFAULT_MATERIALITY_RULES;
  }

  public static getInstance(): CompanyDeltaEngine {
    if (!CompanyDeltaEngine.instance) {
      CompanyDeltaEngine.instance = new CompanyDeltaEngine();
    }
    return CompanyDeltaEngine.instance;
  }

  /**
   * Compare current analytical state against a prior state.
   * Returns only MATERIAL and above deltas by default.
   */
  public compare(
    current: Record<string, any>,
    previous: Record<string, any>,
    comparisonType: DeltaComparisonType,
    category: DeltaCategory = 'FUNDAMENTALS',
    primaryDriverMetrics: string[] = [],
  ): IntelligenceDelta[] {
    const deltas: IntelligenceDelta[] = [];
    const now = new Date().toISOString();

    const allKeys = new Set([...Object.keys(current), ...Object.keys(previous)]);

    for (const key of allKeys) {
      const curr = current[key];
      const prev = previous[key];

      if (curr === undefined || prev === undefined) continue;
      if (typeof curr !== 'number' || typeof prev !== 'number') {
        // String comparison for non-numeric states
        if (curr !== prev) {
          deltas.push({
            deltaId: `delta_${comparisonType}_${key}_${crypto.createHash('sha256').update(`${comparisonType}|${key}|${prev}|${curr}`).digest('hex').substring(0, 12)}`,
            category,
            comparisonType,
            item: this.formatMetricName(key),
            metric: key,
            previousState: prev,
            currentState: curr,
            direction: 'CHANGED',
            materiality: 'LOW',
            explanation: `${this.formatMetricName(key)} changed from "${prev}" to "${curr}".`,
            affectsThesis: primaryDriverMetrics.includes(key),
            evidence: [],
          });
        }
        continue;
      }

      const delta = curr - prev;
      if (Math.abs(delta) < 0.0001) continue; // Ignore noise

      const materiality = this.computeMateriality(key, curr, prev, delta);
      if (materiality === null) continue; // Below minimum threshold

      const pctChange = Math.abs(prev) > 0 ? delta / Math.abs(prev) : 0;
      const direction = this.computeDirection(key, curr, prev);

      deltas.push({
        deltaId: `delta_${comparisonType}_${key}_${crypto.createHash('sha256').update(`${comparisonType}|${key}|${prev}|${curr}`).digest('hex').substring(0, 12)}`,
        category,
        comparisonType,
        item: this.formatMetricName(key),
        metric: key,
        previousState: prev,
        currentState: curr,
        direction,
        materiality,
        explanation: this.buildExplanation(key, curr, prev, delta, pctChange, direction, comparisonType),
        affectsThesis: primaryDriverMetrics.includes(key),
        affectedDriverIds: primaryDriverMetrics.includes(key) ? [key] : [],
        evidence: [],
      });
    }

    // Sort: HIGH first, then MEDIUM, then LOW; within same materiality, thesis-affecting first
    return deltas.sort((a, b) => {
      const mScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const diff = (mScore[b.materiality] || 0) - (mScore[a.materiality] || 0);
      if (diff !== 0) return diff;
      return (b.affectsThesis ? 1 : 0) - (a.affectsThesis ? 1 : 0);
    });
  }

  /**
   * Compute materiality using metric-specific rules.
   * Returns null if change is below minimum threshold (not worth surfacing).
   */
  private computeMateriality(
    metric: string,
    current: number,
    previous: number,
    delta: number,
  ): DeltaMateriality | null {
    const rule = this.materialityRules.find(r => metric.toLowerCase().includes(r.metric.toLowerCase()));

    if (rule) {
      const multiplier = rule.highMultiplier || 2;

      if (rule.basisPointThreshold !== undefined) {
        const bps = Math.abs(delta) * 100; // Convert to basis points (assumes pct values)
        if (bps < rule.basisPointThreshold) return null;
        if (bps >= rule.basisPointThreshold * multiplier) return 'HIGH';
        return 'MEDIUM';
      }

      if (rule.percentageThreshold !== undefined && Math.abs(previous) > 0) {
        const pct = Math.abs(delta) / Math.abs(previous);
        if (pct < rule.percentageThreshold) return null;
        if (pct >= rule.percentageThreshold * multiplier) return 'HIGH';
        return 'MEDIUM';
      }

      if (rule.absoluteThreshold !== undefined) {
        if (Math.abs(delta) < rule.absoluteThreshold) return null;
        if (Math.abs(delta) >= rule.absoluteThreshold * multiplier) return 'HIGH';
        return 'MEDIUM';
      }
    }

    // Default: percentage-based with 5% threshold
    if (Math.abs(previous) > 0) {
      const pct = Math.abs(delta) / Math.abs(previous);
      if (pct < 0.05) return null;
      if (pct >= 0.15) return 'HIGH';
      if (pct >= 0.05) return 'MEDIUM';
    }

    return 'LOW';
  }

  private computeDirection(metric: string, current: number, previous: number): DeltaDirection {
    const lowerIsBetter = ['gnpa', 'nnpa', 'net_debt', 'credit_cost', 'npa', 'attrition'].some(
      s => metric.toLowerCase().includes(s)
    );

    const delta = current - previous;
    if (Math.abs(delta) < 0.0001) return 'UNCHANGED';

    if (lowerIsBetter) {
      return delta < 0 ? 'IMPROVED' : 'DETERIORATED';
    }
    return delta > 0 ? 'IMPROVED' : 'DETERIORATED';
  }

  private buildExplanation(
    metric: string,
    current: number,
    previous: number,
    delta: number,
    pctChange: number,
    direction: DeltaDirection,
    comparisonType: DeltaComparisonType,
  ): string {
    const name = this.formatMetricName(metric);
    const compLabel = { QOQ: 'QoQ', YOY: 'YoY', LAST_ANALYSIS: 'since last analysis', THESIS_BASELINE: 'vs thesis baseline' }[comparisonType];
    const changeStr = Math.abs(pctChange) > 0
      ? ` (${pctChange >= 0 ? '+' : ''}${(pctChange * 100).toFixed(1)}%)`
      : '';
    const arrow = direction === 'IMPROVED' ? '↑' : direction === 'DETERIORATED' ? '↓' : '→';
    return `${name} ${arrow} ${previous.toFixed(2)} → ${current.toFixed(2)}${changeStr} ${compLabel}.`;
  }

  private formatMetricName(metric: string): string {
    return metric
      .replace(/_/g, ' ')
      .replace(/pct$/, '%')
      .replace(/cr$/, '(₹cr)')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * P0 Fix: computeDeltas wrapper for orchestrator integration.
   * Converts AnalyticalFacts (CanonicalFact records) to flat numeric dicts
   * and runs compare() with LAST_ANALYSIS comparison type.
   */
  public computeDeltas(params: {
    symbol: string;
    securityId: string;
    current: Record<string, any>;
    prior: Record<string, any>;
    currentFacts: any;
  }): { deltas: IntelligenceDelta[]; comparisonTypes: DeltaComparisonType[] } {
    // Flatten CanonicalFact records to plain numeric dicts
    const flatCurrent: Record<string, number> = {};
    const flatPrior: Record<string, number> = {};

    for (const [key, fact] of Object.entries(params.current)) {
      const val = typeof fact === 'object' ? fact?.value : fact;
      if (typeof val === 'number' && !isNaN(val)) flatCurrent[key] = val;
    }
    for (const [key, fact] of Object.entries(params.prior)) {
      const val = typeof fact === 'object' ? fact?.value : fact;
      if (typeof val === 'number' && !isNaN(val)) flatPrior[key] = val;
    }

    const deltas = this.compare(flatCurrent, flatPrior, 'LAST_ANALYSIS', 'FUNDAMENTALS');
    return {
      deltas,
      comparisonTypes: ['LAST_ANALYSIS'],
    };
  }
}
