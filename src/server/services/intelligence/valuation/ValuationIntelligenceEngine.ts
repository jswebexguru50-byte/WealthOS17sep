/**
 * ValuationIntelligenceEngine.ts — Wave 2 Agent D
 *
 * Historical valuation analysis with honest coverage assessment.
 *
 * Constitution invariants:
 * - C2: No fake history — run coverage audit first
 * - C7: Every valuation comparison needs evidence lineage
 * - C21: No absolute CHEAP/EXPENSIVE labels without full distribution
 * - C16: Financial sector uses different valuation metrics
 * - Peer/sector valuation deferred — company history first
 */

import { getDB, dbAll, dbGet } from '../../../database.js';
import { EvidenceReference } from '../contracts/Provenance.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ValuationMetric = 'PE' | 'PB' | 'EV_EBITDA' | 'EV_SALES' | 'P_CFO' | 'DIVIDEND_YIELD' | 'ROE' | 'P_EV';

export interface ValuationPoint {
  period: string;          // ISO date
  price: number | null;
  metric: ValuationMetric;
  value: number | null;    // e.g. PE ratio
  source: string;
}

export type HistoricalDensity = 'DENSE' | 'SPARSE' | 'INSUFFICIENT';

export interface ValuationCoverageAudit {
  symbol: string;
  snapshotCount: number;
  earliestSnapshot: string | null;
  latestSnapshot: string | null;
  spanDays: number;
  density: HistoricalDensity;
  canCompute1YMedian: boolean;
  canCompute3YMedian: boolean;
  canCompute5YMedian: boolean;
  missingYears: number[];
  limitation: string | null;
}

export interface ValuationHistoricalContext {
  metric: ValuationMetric;
  currentValue: number | null;
  current1YPercentile: number | null;   // null if insufficient data
  median1Y: number | null;
  median3Y: number | null;
  median5Y: number | null;
  min1Y: number | null;
  max1Y: number | null;
  /**
   * Descriptive note ONLY — never CHEAP/EXPENSIVE labels
   * Example: "Currently trading at 28.4x PE — above the 3Y median of 24.1x (75th percentile)"
   */
  contextNote: string | null;
  coverage: HistoricalDensity;
  limitation: string | null;
}

export interface ValuationIntelligenceResult {
  securityId: string;
  symbol: string;
  businessModel: string;
  coverageAudit: ValuationCoverageAudit;
  currentMetrics: Array<{ metric: ValuationMetric; value: number | null; asOf: string | null }>;
  historicalContext: ValuationHistoricalContext[];
  peerValuation: null;   // Deferred — implement in Wave 5
  evaluatedAt: string;
  dataCompleteness: 'FULL' | 'PARTIAL' | 'MINIMAL';
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class ValuationIntelligenceEngine {
  private static instance: ValuationIntelligenceEngine;

  private constructor() {}

  public static getInstance(): ValuationIntelligenceEngine {
    if (!ValuationIntelligenceEngine.instance) {
      ValuationIntelligenceEngine.instance = new ValuationIntelligenceEngine();
    }
    return ValuationIntelligenceEngine.instance;
  }

  /**
   * Main entry point.
   * Step 1: Run coverage audit.
   * Step 2: Only if coverage sufficient → compute historical percentiles.
   * Step 3: Never fake history.
   */
  public async evaluate(
    symbol: string,
    businessModel: string,
  ): Promise<ValuationIntelligenceResult> {
    const evaluatedAt = new Date().toISOString();
    const securityId = symbol;

    // Step 1: Coverage audit
    const audit = await this.runCoverageAudit(symbol);

    // Step 2: Current valuation snapshot
    const currentMetrics = await this.getCurrentValuation(symbol, businessModel);

    // Step 3: Historical context (only if density ≥ SPARSE)
    const historicalContext: ValuationHistoricalContext[] = [];
    const preferredMetrics = this.getPreferredMetrics(businessModel);

    if (audit.density !== 'INSUFFICIENT') {
      for (const metric of preferredMetrics) {
        const ctx = await this.buildHistoricalContext(symbol, metric, audit);
        historicalContext.push(ctx);
      }
    } else {
      // Return DATA_INSUFFICIENT for each metric
      for (const metric of preferredMetrics) {
        historicalContext.push({
          metric,
          currentValue: null,
          current1YPercentile: null,
          median1Y: null, median3Y: null, median5Y: null,
          min1Y: null, max1Y: null,
          contextNote: null,
          coverage: 'INSUFFICIENT',
          limitation: `Insufficient snapshot history for ${symbol}. Only ${audit.snapshotCount} snapshots available over ${audit.spanDays} days.`,
        });
      }
    }

    const completeness = audit.density === 'DENSE' ? 'FULL'
      : audit.density === 'SPARSE' ? 'PARTIAL'
      : 'MINIMAL';

    return {
      securityId, symbol, businessModel,
      coverageAudit: audit,
      currentMetrics,
      historicalContext,
      peerValuation: null,  // deferred
      evaluatedAt,
      dataCompleteness: completeness,
    };
  }

  // ─── Coverage Audit ───────────────────────────────────────────────────────

  public async runCoverageAudit(symbol: string): Promise<ValuationCoverageAudit> {
    const db = getDB();
    if (!db) {
      return {
        symbol, snapshotCount: 0, earliestSnapshot: null, latestSnapshot: null,
        spanDays: 0, density: 'INSUFFICIENT',
        canCompute1YMedian: false, canCompute3YMedian: false, canCompute5YMedian: false,
        missingYears: [], limitation: 'No database connection',
      };
    }

    try {
      // Check fundamental_endpoint_snapshots
      const summary = await dbGet(
        db,
        `SELECT COUNT(*) as cnt, MIN(fetched_at) as earliest, MAX(fetched_at) as latest
         FROM fundamental_endpoint_snapshots
         WHERE symbol = ? OR isin = ?`,
        [symbol, symbol]
      ) as any;

      const count = summary?.cnt || 0;
      const earliest = summary?.earliest || null;
      const latest = summary?.latest || null;

      let spanDays = 0;
      if (earliest && latest) {
        spanDays = Math.floor((new Date(latest).getTime() - new Date(earliest).getTime()) / (86400 * 1000));
      }

      // Determine density
      let density: HistoricalDensity = 'INSUFFICIENT';
      if (count >= 50 && spanDays >= 365) density = 'DENSE';
      else if (count >= 12 && spanDays >= 90) density = 'SPARSE';

      // Check which year ranges are computable
      const canCompute1Y = count >= 12 && spanDays >= 250;
      const canCompute3Y = count >= 36 && spanDays >= 900;
      const canCompute5Y = count >= 60 && spanDays >= 1500;

      // Identify missing years
      const missingYears: number[] = [];
      if (latest) {
        const latestYear = new Date(latest).getFullYear();
        for (let y = latestYear - 4; y <= latestYear; y++) {
          const yearCount = await dbGet(
            db,
            `SELECT COUNT(*) as cnt FROM fundamental_endpoint_snapshots
             WHERE (symbol = ? OR isin = ?) AND substr(fetched_at, 1, 4) = ?`,
            [symbol, symbol, String(y)]
          ) as any;
          if (!yearCount?.cnt || yearCount.cnt < 4) missingYears.push(y);
        }
      }

      let limitation: string | null = null;
      if (density === 'INSUFFICIENT') {
        limitation = `Only ${count} snapshots available over ${spanDays} days — insufficient for reliable historical percentile calculation.`;
      } else if (density === 'SPARSE') {
        limitation = `${count} snapshots available — 1Y analysis possible but 3Y/5Y percentiles may not be reliable.`;
      }

      return {
        symbol, snapshotCount: count, earliestSnapshot: earliest, latestSnapshot: latest,
        spanDays, density, canCompute1YMedian: canCompute1Y,
        canCompute3YMedian: canCompute3Y, canCompute5YMedian: canCompute5Y,
        missingYears, limitation,
      };
    } catch {
      return {
        symbol, snapshotCount: 0, earliestSnapshot: null, latestSnapshot: null,
        spanDays: 0, density: 'INSUFFICIENT',
        canCompute1YMedian: false, canCompute3YMedian: false, canCompute5YMedian: false,
        missingYears: [], limitation: 'Coverage audit query failed',
      };
    }
  }

  // ─── Current Valuation ────────────────────────────────────────────────────

  private async getCurrentValuation(
    symbol: string,
    businessModel: string,
  ): Promise<ValuationIntelligenceResult['currentMetrics']> {
    const db = getDB();
    if (!db) return [];

    try {
      const snap = await dbGet(
        db,
        `SELECT snapshot_json, fetched_at FROM fundamental_endpoint_snapshots
         WHERE symbol = ? OR isin = ?
         ORDER BY fetched_at DESC LIMIT 1`,
        [symbol, symbol]
      ) as any;
      if (!snap?.snapshot_json) return [];

      const data = JSON.parse(snap.snapshot_json);
      const metrics = this.getPreferredMetrics(businessModel);

      return metrics.map(m => {
        const key = m.toLowerCase().replace('_', '');
        const val = data[m] ?? data[m.toLowerCase()] ?? data[key] ?? null;
        return { metric: m, value: val !== null ? parseFloat(val) || null : null, asOf: snap.fetched_at };
      });
    } catch {
      return [];
    }
  }

  // ─── Historical Context ───────────────────────────────────────────────────

  private async buildHistoricalContext(
    symbol: string,
    metric: ValuationMetric,
    audit: ValuationCoverageAudit,
  ): Promise<ValuationHistoricalContext> {
    if (!audit.canCompute1YMedian) {
      return {
        metric, currentValue: null, current1YPercentile: null,
        median1Y: null, median3Y: null, median5Y: null,
        min1Y: null, max1Y: null, contextNote: null,
        coverage: audit.density,
        limitation: audit.limitation,
      };
    }

    const db = getDB();
    if (!db) return { metric, currentValue: null, current1YPercentile: null, median1Y: null, median3Y: null, median5Y: null, min1Y: null, max1Y: null, contextNote: null, coverage: 'INSUFFICIENT', limitation: 'No DB' };

    try {
      const metricKey = metric.toLowerCase();

      const rows = await dbAll(
        db,
        `SELECT json_extract(snapshot_json, '$.' || ?) as val, fetched_at
         FROM fundamental_endpoint_snapshots
         WHERE (symbol = ? OR isin = ?) AND json_extract(snapshot_json, '$.' || ?) IS NOT NULL
         ORDER BY fetched_at DESC`,
        [metricKey, symbol, symbol, metricKey]
      ) as any[];

      const vals = rows.map(r => parseFloat(r.val)).filter(v => !isNaN(v) && isFinite(v));
      if (!vals.length) {
        return { metric, currentValue: null, current1YPercentile: null, median1Y: null, median3Y: null, median5Y: null, min1Y: null, max1Y: null, contextNote: null, coverage: 'INSUFFICIENT', limitation: 'No data points for this metric' };
      }

      const current = vals[0];
      const sorted1Y = vals.slice(0, Math.min(vals.length, 52)).sort((a, b) => a - b);
      const sorted3Y = audit.canCompute3YMedian ? vals.slice(0, Math.min(vals.length, 156)).sort((a, b) => a - b) : null;
      const sorted5Y = audit.canCompute5YMedian ? vals.sort((a, b) => a - b) : null;

      const median = (arr: number[]) => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
      };

      const percentile = (arr: number[], val: number) => {
        const below = arr.filter(v => v <= val).length;
        return Math.round(below / arr.length * 100);
      };

      const median1Y = median(sorted1Y);
      const median3Y = sorted3Y ? median(sorted3Y) : null;
      const min1Y = sorted1Y[0];
      const max1Y = sorted1Y[sorted1Y.length - 1];
      const pct = percentile(sorted1Y, current);

      // Descriptive note — NO CHEAP/EXPENSIVE labels
      let contextNote: string | null = null;
      if (audit.canCompute1YMedian) {
        const vsMedian = median1Y !== 0 ? ((current - median1Y) / Math.abs(median1Y) * 100).toFixed(1) : null;
        contextNote = `Currently ${current.toFixed(1)}x ${metric} — ${pct}th percentile vs 1Y range [${min1Y.toFixed(1)}x–${max1Y.toFixed(1)}x], 1Y median ${median1Y.toFixed(1)}x${vsMedian ? ` (${parseFloat(vsMedian) >= 0 ? '+' : ''}${vsMedian}% vs median)` : ''}.`;
        if (audit.canCompute3YMedian && median3Y) {
          contextNote += ` 3Y median: ${median3Y.toFixed(1)}x.`;
        }
      }

      return {
        metric, currentValue: current,
        current1YPercentile: pct,
        median1Y, median3Y, median5Y: sorted5Y ? median(sorted5Y) : null,
        min1Y, max1Y, contextNote,
        coverage: audit.density,
        limitation: audit.limitation,
      };
    } catch {
      return { metric, currentValue: null, current1YPercentile: null, median1Y: null, median3Y: null, median5Y: null, min1Y: null, max1Y: null, contextNote: null, coverage: 'INSUFFICIENT', limitation: 'Historical query failed' };
    }
  }

  // ─── Sector-appropriate metrics ───────────────────────────────────────────

  private getPreferredMetrics(businessModel: string): ValuationMetric[] {
    switch (businessModel) {
      case 'BANK': return ['PB', 'ROE'];
      case 'NBFC': return ['PB', 'ROE'];
      case 'INSURANCE': return ['P_EV', 'PB'];
      case 'IT_SERVICES': return ['PE', 'EV_EBITDA', 'P_CFO'];
      case 'COMMODITY': return ['EV_EBITDA', 'EV_SALES'];
      default: return ['PE', 'EV_EBITDA'];
    }
  }
}
