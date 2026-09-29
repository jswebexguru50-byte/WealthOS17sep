/**
 * ValuationIntelligenceEngine.ts — Gate B.1 Integrity Fix
 *
 * Historical and snapshot valuation analysis using canonical facts exclusively.
 *
 * Constitution invariants:
 * - C1: Evidence before conclusion
 * - C4: All facts resolve from Canonical Fact Repository / company_facts (NO raw endpoint bypass)
 * - C5: Point-In-Time (PIT) gate is availableAt <= asOfDate
 * - C21: No absolute CHEAP/EXPENSIVE labels without full distribution
 * - C16: Financial sector uses specialized valuation metrics (PB, ROE, NIM)
 */

import { getDB, dbAll, dbGet } from '../../../database.js';
import { SecurityIdentityRegistry } from '../../dataAcquisition/SecurityIdentityRegistry.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ValuationMetric = 'PE' | 'PB' | 'EV_EBITDA' | 'EV_SALES' | 'P_CFO' | 'DIVIDEND_YIELD' | 'ROE' | 'ROCE';

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
  current1YPercentile: number | null;
  median1Y: number | null;
  median3Y: number | null;
  median5Y: number | null;
  min1Y: number | null;
  max1Y: number | null;
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
  peerValuation: null;
  evaluatedAt: string;
  dataCompleteness: 'FULL' | 'PARTIAL' | 'MINIMAL';
}

// ─── Metric mapping ───────────────────────────────────────────────────────────

const METRIC_TO_DB_METRICS: Record<ValuationMetric, string[]> = {
  PE: ['pe', 'pe_ratio'],
  PB: ['pb', 'pb_ratio'],
  EV_EBITDA: ['ev_ebitda'],
  EV_SALES: ['ev_sales'],
  P_CFO: ['p_cfo'],
  DIVIDEND_YIELD: ['dividend_yield', 'dividend_payout'],
  ROE: ['roe', 'roe_pct'],
  ROCE: ['roce', 'roce_pct', 'roce_reported'],
};

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
   */
  public async evaluate(
    symbol: string,
    businessModel: string,
    asOfDate?: string | null
  ): Promise<ValuationIntelligenceResult> {
    const evaluatedAt = new Date().toISOString();
    const registry = SecurityIdentityRegistry.getInstance();
    const idRecord = registry.resolveBySymbol(symbol);
    const securityId = idRecord?.securityId || symbol;
    const isin = idRecord?.isin || '';

    // Step 1: Coverage audit from canonical facts
    const audit = await this.runCoverageAudit(symbol, isin, asOfDate);

    // Step 2: Current valuation snapshot from canonical facts
    const currentMetrics = await this.getCurrentValuation(symbol, isin, businessModel, asOfDate);

    // Step 3: Historical context
    const historicalContext: ValuationHistoricalContext[] = [];
    const preferredMetrics = this.getPreferredMetrics(businessModel);

    if (audit.density !== 'INSUFFICIENT') {
      for (const metric of preferredMetrics) {
        const ctx = await this.buildHistoricalContext(symbol, isin, metric, audit, asOfDate);
        historicalContext.push(ctx);
      }
    } else {
      for (const metric of preferredMetrics) {
        const currentMetricObj = currentMetrics.find(m => m.metric === metric);
        historicalContext.push({
          metric,
          currentValue: currentMetricObj?.value ?? null,
          current1YPercentile: null,
          median1Y: null,
          median3Y: null,
          median5Y: null,
          min1Y: null,
          max1Y: null,
          contextNote: currentMetricObj?.value !== null
            ? `Current observed multiple is ${currentMetricObj?.value}x; insufficient historical periods for percentile derivation.`
            : null,
          coverage: 'INSUFFICIENT',
          limitation: `Insufficient historical valuation facts for ${symbol}. Available: ${audit.snapshotCount} records over ${audit.spanDays} days.`,
        });
      }
    }

    const completeness = audit.density === 'DENSE' ? 'FULL'
      : audit.density === 'SPARSE' ? 'PARTIAL'
      : 'MINIMAL';

    return {
      securityId,
      symbol,
      businessModel,
      coverageAudit: audit,
      currentMetrics,
      historicalContext,
      peerValuation: null,
      evaluatedAt,
      dataCompleteness: completeness,
    };
  }

  // ─── Coverage Audit ───────────────────────────────────────────────────────

  public async runCoverageAudit(
    symbol: string,
    isin?: string,
    asOfDate?: string | null
  ): Promise<ValuationCoverageAudit> {
    const db = getDB();
    if (!db) {
      return {
        symbol, snapshotCount: 0, earliestSnapshot: null, latestSnapshot: null,
        spanDays: 0, density: 'INSUFFICIENT',
        canCompute1YMedian: false, canCompute3YMedian: false, canCompute5YMedian: false,
        missingYears: [], limitation: 'No database connection',
      };
    }

    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isinVal = isin || symbol;

    try {
      const summary = await dbGet(
        db,
        `SELECT COUNT(*) as cnt, MIN(availableAt) as earliest, MAX(availableAt) as latest
         FROM company_facts
         WHERE (isin = ? OR symbol = ?)
           AND (
             (availableAt IS NOT NULL AND availableAt <= ?)
             OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
           )`,
        [isinVal, symbol, effectiveAsOf, effectiveAsOf]
      ) as any;

      const count = summary?.cnt || 0;
      const earliest = summary?.earliest || null;
      const latest = summary?.latest || null;

      let spanDays = 0;
      if (earliest && latest) {
        spanDays = Math.floor((new Date(latest).getTime() - new Date(earliest).getTime()) / (86400 * 1000));
      }

      let density: HistoricalDensity = 'INSUFFICIENT';
      if (count >= 30 && spanDays >= 365) density = 'DENSE';
      else if (count >= 10 && spanDays >= 60) density = 'SPARSE';

      const canCompute1Y = count >= 10 && spanDays >= 180;
      const canCompute3Y = count >= 25 && spanDays >= 700;
      const canCompute5Y = count >= 40 && spanDays >= 1400;

      const missingYears: number[] = [];
      if (latest) {
        const latestYear = new Date(latest).getFullYear();
        for (let y = latestYear - 4; y <= latestYear; y++) {
          const yearCount = await dbGet(
            db,
            `SELECT COUNT(*) as cnt FROM company_facts
             WHERE (isin = ? OR symbol = ?) AND (substr(periodEnd, 1, 4) = ? OR substr(availableAt, 1, 4) = ?)`,
            [isinVal, symbol, String(y), String(y)]
          ) as any;
          if (!yearCount?.cnt || yearCount.cnt < 2) missingYears.push(y);
        }
      }

      let limitation: string | null = null;
      if (density === 'INSUFFICIENT') {
        limitation = `Only ${count} canonical facts available over ${spanDays} days — insufficient for reliable historical percentile calculation.`;
      } else if (density === 'SPARSE') {
        limitation = `${count} canonical facts available — multi-year distribution requires further historical filings.`;
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

  // ─── Current Valuation from Canonical Facts ────────────────────────────────

  private async getCurrentValuation(
    symbol: string,
    isin: string,
    businessModel: string,
    asOfDate?: string | null
  ): Promise<ValuationIntelligenceResult['currentMetrics']> {
    const db = getDB();
    if (!db) return [];

    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isinVal = isin || symbol;
    const metrics = this.getPreferredMetrics(businessModel);
    const results: ValuationIntelligenceResult['currentMetrics'] = [];

    try {
      for (const m of metrics) {
        const dbKeys = METRIC_TO_DB_METRICS[m] || [m.toLowerCase()];
        const placeholders = dbKeys.map(() => '?').join(',');

        const row = await dbGet(
          db,
          `SELECT value, availableAt, reportedAt, asOfDate
           FROM company_facts
           WHERE (isin = ? OR symbol = ?) AND metric IN (${placeholders})
             AND (
               (availableAt IS NOT NULL AND availableAt <= ?)
               OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
             )
           ORDER BY availableAt DESC, periodEnd DESC
           LIMIT 1`,
          [isinVal, symbol, ...dbKeys, effectiveAsOf, effectiveAsOf]
        ) as any;

        if (row && row.value !== null && row.value !== undefined) {
          const num = parseFloat(row.value);
          results.push({
            metric: m,
            value: isNaN(num) ? null : num,
            asOf: row.availableAt || row.reportedAt || row.asOfDate || effectiveAsOf,
          });
        } else {
          results.push({
            metric: m,
            value: null,
            asOf: null,
          });
        }
      }
    } catch (err) {
      console.warn('[ValuationIntelligenceEngine] Error fetching current valuation facts:', err);
    }

    return results;
  }

  // ─── Historical Context ───────────────────────────────────────────────────

  private async buildHistoricalContext(
    symbol: string,
    isin: string,
    metric: ValuationMetric,
    audit: ValuationCoverageAudit,
    asOfDate?: string | null
  ): Promise<ValuationHistoricalContext> {
    const db = getDB();
    if (!db) {
      return {
        metric, currentValue: null, current1YPercentile: null,
        median1Y: null, median3Y: null, median5Y: null,
        min1Y: null, max1Y: null, contextNote: null,
        coverage: 'INSUFFICIENT', limitation: 'No DB',
      };
    }

    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isinVal = isin || symbol;
    const dbKeys = METRIC_TO_DB_METRICS[metric] || [metric.toLowerCase()];
    const placeholders = dbKeys.map(() => '?').join(',');

    try {
      const rows = await dbAll<any>(
        db,
        `SELECT value, availableAt, periodEnd
         FROM company_facts
         WHERE (isin = ? OR symbol = ?) AND metric IN (${placeholders})
           AND (
             (availableAt IS NOT NULL AND availableAt <= ?)
             OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
           )
         ORDER BY periodEnd ASC`,
        [isinVal, symbol, ...dbKeys, effectiveAsOf, effectiveAsOf]
      );

      const validValues = rows
        .map(r => parseFloat(r.value))
        .filter(v => !isNaN(v) && v > 0);

      if (validValues.length === 0) {
        return {
          metric, currentValue: null, current1YPercentile: null,
          median1Y: null, median3Y: null, median5Y: null,
          min1Y: null, max1Y: null, contextNote: null,
          coverage: 'INSUFFICIENT', limitation: 'No valid historical numeric values found',
        };
      }

      const currentValue = validValues[validValues.length - 1];
      const median = this.computeMedian(validValues);
      const min = Math.min(...validValues);
      const max = Math.max(...validValues);

      let percentile: number | null = null;
      if (validValues.length >= 4) {
        const belowCount = validValues.filter(v => v < currentValue).length;
        percentile = Math.round((belowCount / validValues.length) * 100);
      }

      const note = percentile !== null
        ? `Observed ${metric} is ${currentValue}x against multi-period median of ${median}x (${percentile}th percentile)`
        : `Observed ${metric} is ${currentValue}x`;

      return {
        metric,
        currentValue,
        current1YPercentile: percentile,
        median1Y: median,
        median3Y: validValues.length >= 6 ? median : null,
        median5Y: validValues.length >= 10 ? median : null,
        min1Y: min,
        max1Y: max,
        contextNote: note,
        coverage: audit.density,
        limitation: audit.limitation,
      };
    } catch {
      return {
        metric, currentValue: null, current1YPercentile: null,
        median1Y: null, median3Y: null, median5Y: null,
        min1Y: null, max1Y: null, contextNote: null,
        coverage: 'INSUFFICIENT', limitation: 'Query failed',
      };
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private getPreferredMetrics(businessModel: string): ValuationMetric[] {
    switch (businessModel) {
      case 'BANK':
      case 'NBFC':
        return ['PB', 'ROE', 'PE'];
      case 'IT_SERVICES':
        return ['PE', 'EV_EBITDA', 'ROCE'];
      case 'MANUFACTURING':
      case 'COMMODITY':
        return ['EV_EBITDA', 'PE', 'PB', 'ROCE'];
      default:
        return ['PE', 'PB', 'EV_EBITDA', 'ROCE'];
    }
  }

  private computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }
}
