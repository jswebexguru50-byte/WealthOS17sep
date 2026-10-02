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

import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
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

    for (const metric of preferredMetrics) {
      if (audit.density !== 'INSUFFICIENT') {
        const ctx = await this.buildHistoricalContext(symbol, isin, metric, audit, asOfDate);
        historicalContext.push(ctx);
      } else {
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

    const denseMetrics = historicalContext.filter(c => c.coverage === 'DENSE').length;
    const usableMetrics = historicalContext.filter(c => c.coverage === 'DENSE' || c.coverage === 'SPARSE').length;

    let completeness: 'FULL' | 'PARTIAL' | 'MINIMAL' = 'MINIMAL';
    if (audit.density === 'DENSE' && denseMetrics >= Math.ceil(preferredMetrics.length / 2)) {
      completeness = 'FULL';
    } else if (audit.density !== 'INSUFFICIENT' && usableMetrics > 0) {
      completeness = 'PARTIAL';
    } else {
      completeness = 'MINIMAL';
    }

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
    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isinVal = isin || symbol;
    const identity: SecurityIdentity = {
      securityId: isinVal,
      isin: isinVal,
      nseSymbol: symbol,
      companyName: symbol,
    };

    try {
      const summary = await CanonicalFactRepository.getInstance().getCoverageSummary(
        identity,
        effectiveAsOf,
        'ALLOW_INFERRED'
      );

      const count = summary.count;
      const earliest = summary.earliest;
      const latest = summary.latest;
      const spanDays = summary.spanDays;
      const missingYears = summary.missingYears;

      let density: HistoricalDensity = 'INSUFFICIENT';
      if (count >= 30 && spanDays >= 365) density = 'DENSE';
      else if (count >= 10 && spanDays >= 60) density = 'SPARSE';

      const canCompute1Y = count >= 10 && spanDays >= 180;
      const canCompute3Y = count >= 25 && spanDays >= 700;
      const canCompute5Y = count >= 40 && spanDays >= 1400;

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
    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isinVal = isin || symbol;
    const identity: SecurityIdentity = {
      securityId: isinVal,
      isin: isinVal,
      nseSymbol: symbol,
      companyName: symbol,
    };
    const metrics = this.getPreferredMetrics(businessModel);
    const results: ValuationIntelligenceResult['currentMetrics'] = [];

    try {
      const factRepo = CanonicalFactRepository.getInstance();
      const latestFacts = await factRepo.getLatestFactsByMetric(identity, effectiveAsOf, 'ALLOW_INFERRED');

      for (const m of metrics) {
        const dbKeys = METRIC_TO_DB_METRICS[m] || [m.toLowerCase()];
        let matchedFact = null;
        for (const k of dbKeys) {
          if (latestFacts[k.toLowerCase()]) {
            matchedFact = latestFacts[k.toLowerCase()];
            break;
          }
        }

        if (matchedFact && matchedFact.value !== null && matchedFact.value !== undefined) {
          const num = typeof matchedFact.value === 'number' ? matchedFact.value : parseFloat(String(matchedFact.value));
          results.push({
            metric: m,
            value: isNaN(num) ? null : num,
            asOf: matchedFact.availableAt || matchedFact.publishedAt || effectiveAsOf,
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
    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isinVal = isin || symbol;
    const identity: SecurityIdentity = {
      securityId: isinVal,
      isin: isinVal,
      nseSymbol: symbol,
      companyName: symbol,
    };
    const dbKeys = METRIC_TO_DB_METRICS[metric] || [metric.toLowerCase()];

    try {
      const factRepo = CanonicalFactRepository.getInstance();
      const facts = await factRepo.getHistoricalSeriesMultiMetric(
        identity,
        dbKeys,
        effectiveAsOf,
        'ALLOW_INFERRED'
      );

      const validFacts = facts.filter(f => {
        const v = typeof f.value === 'number' ? f.value : parseFloat(String(f.value));
        return !isNaN(v) && v > 0;
      });

      const validValues = validFacts.map(f =>
        typeof f.value === 'number' ? f.value : parseFloat(String(f.value))
      );

      if (validValues.length === 0) {
        return {
          metric, currentValue: null, current1YPercentile: null,
          median1Y: null, median3Y: null, median5Y: null,
          min1Y: null, max1Y: null, contextNote: null,
          coverage: 'INSUFFICIENT', limitation: 'No valid historical numeric values found',
        };
      }

      if (validValues.length === 1) {
        const currentValue = validValues[0];
        return {
          metric,
          currentValue,
          current1YPercentile: null,
          median1Y: null,
          median3Y: null,
          median5Y: null,
          min1Y: null,
          max1Y: null,
          contextNote: `Observed ${metric} is ${currentValue}x; single observation — insufficient historical periods for distribution.`,
          coverage: 'INSUFFICIENT',
          limitation: 'Single observation available — minimum 2 dated historical observations required for distribution calculation.',
        };
      }

      const validDates = validFacts
        .map(f => f.periodEnd || f.availableAt || f.publishedAt)
        .filter((d): d is string => Boolean(d))
        .sort();
      let metricSpanDays = 0;
      if (validDates.length >= 2) {
        metricSpanDays = Math.floor(
          (new Date(validDates[validDates.length - 1]).getTime() - new Date(validDates[0]).getTime()) / (86400 * 1000)
        );
      }

      let metricDensity: HistoricalDensity = 'INSUFFICIENT';
      if (validValues.length >= 8 && metricSpanDays >= 365) {
        metricDensity = 'DENSE';
      } else if (validValues.length >= 2) {
        metricDensity = 'SPARSE';
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
        : `Observed ${metric} is ${currentValue}x against multi-period median of ${median}x`;

      const metricLimitation = metricDensity === 'DENSE'
        ? null
        : `${validValues.length} historical observations over ${metricSpanDays} days — multi-year distribution requires further historical filings.`;

      return {
        metric,
        currentValue,
        current1YPercentile: percentile,
        median1Y: median,
        median3Y: validValues.length >= 6 && metricSpanDays >= 700 ? median : null,
        median5Y: validValues.length >= 10 && metricSpanDays >= 1400 ? median : null,
        min1Y: min,
        max1Y: max,
        contextNote: note,
        coverage: metricDensity,
        limitation: metricLimitation,
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
