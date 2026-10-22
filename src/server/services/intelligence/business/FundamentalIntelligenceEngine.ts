/**
 * FundamentalIntelligenceEngine.ts — Wave 1 Agent A
 *
 * Multi-period trend analysis beyond single-period snapshots.
 *
 * Constitution invariants:
 * - C5: Level ≠ Direction (reported separately)
 * - C6: Growth ≠ Acceleration (acceleration requires ≥2 growth intervals = ≥3 data points)
 * - C16: Sector economics matter (banks use different KPIs)
 * - Never fabricate missing periods — return DATA_INSUFFICIENT
 */

import { getDB, dbAll } from '../../../database.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TrendDirection =
  | 'IMPROVING'
  | 'DETERIORATING'
  | 'STABLE'
  | 'VOLATILE'
  | 'DATA_INSUFFICIENT';

export type AccelerationStatus =
  | 'ACCELERATING'    // growth rate increasing over ≥2 comparable intervals
  | 'DECELERATING'    // growth rate decreasing over ≥2 comparable intervals
  | 'STABLE'          // growth rate flat
  | 'DATA_INSUFFICIENT'; // fewer than 3 data points

export interface PeriodValue {
  period: string;        // e.g. '2026-03-31'
  value: number | null;
  yoyGrowth: number | null;  // null if prior period unavailable
  source: string;
}

export interface TrendAnalysis {
  metric: string;
  unit: string | null;
  periods: PeriodValue[];

  /** Current level */
  latestValue: number | null;
  latestPeriod: string | null;

  /** Direction assessed from available data */
  trend3Y: TrendDirection;   // requires ≥3 annual points
  trend5Y: TrendDirection;   // requires ≥5 annual points

  /**
   * Acceleration requires comparing at least 2 growth intervals:
   * growth(t vs t-1) vs growth(t-1 vs t-2)
   * Needs ≥3 data points.
   */
  acceleration: AccelerationStatus;

  /** Coefficient of variation of values — VOLATILE if >20% */
  volatility: 'HIGH' | 'MEDIUM' | 'LOW' | 'DATA_INSUFFICIENT';

  /** Most recent YoY change */
  latestYoY: number | null;
  latestYoYLabel: string | null; // e.g. "+12.3% YoY"
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class FundamentalIntelligenceEngine {
  private static instance: FundamentalIntelligenceEngine;

  private constructor() {}

  public static getInstance(): FundamentalIntelligenceEngine {
    if (!FundamentalIntelligenceEngine.instance) {
      FundamentalIntelligenceEngine.instance = new FundamentalIntelligenceEngine();
    }
    return FundamentalIntelligenceEngine.instance;
  }

  /**
   * Computes multi-period trend analysis for a metric.
   * Returns DATA_INSUFFICIENT when fewer than 2 data points.
   */
  public async analyzeTrend(
    symbol: string,
    metric: string,
    periodType: 'ANNUAL' | 'QUARTERLY' = 'ANNUAL',
    unit?: string,
  ): Promise<TrendAnalysis> {
    const empty = (reason: string): TrendAnalysis => ({
      metric, unit: unit || null, periods: [],
      latestValue: null, latestPeriod: null,
      trend3Y: 'DATA_INSUFFICIENT', trend5Y: 'DATA_INSUFFICIENT',
      acceleration: 'DATA_INSUFFICIENT',
      volatility: 'DATA_INSUFFICIENT',
      latestYoY: null, latestYoYLabel: null,
    });

    const db = getDB();
    if (!db) return empty('No database connection');

    try {
      const rows = await dbAll(
        db,
        `SELECT value, periodEnd as period_end, provider as data_source
         FROM company_facts
         WHERE (symbol = ? OR isin = ?)
           AND metric = ?
           AND periodType = ?
         ORDER BY periodEnd DESC
         LIMIT 10`,
        [symbol, symbol, metric, periodType]
      ) as Array<{ value: string; period_end: string; data_source: string }>;

      if (!rows || !rows.length) return empty('No data found');

      // Parse and sort chronologically
      const sorted = rows
        .map(r => ({ period: r.period_end, raw: parseFloat(r.value), source: r.data_source }))
        .filter(r => !isNaN(r.raw))
        .sort((a, b) => a.period.localeCompare(b.period));

      if (sorted.length < 1) return empty('No valid numeric values');

      // Build period values with YoY growth
      const periods: PeriodValue[] = sorted.map((curr, i) => {
        const prior = i > 0 ? sorted[i - 1] : null;
        let yoyGrowth: number | null = null;
        if (prior && Math.abs(prior.raw) > 0) {
          yoyGrowth = (curr.raw - prior.raw) / Math.abs(prior.raw);
        }
        return { period: curr.period, value: curr.raw, yoyGrowth, source: curr.source };
      });

      const latest = sorted[sorted.length - 1];
      const latestPeriod = periods[periods.length - 1];
      const latestYoY = latestPeriod.yoyGrowth;

      // Trend assessment (requires ≥3 for 3Y, ≥5 for 5Y)
      const trend3Y = this.assessTrend(sorted.slice(-4));  // last 3 growth intervals = 4 points
      const trend5Y = sorted.length >= 5 ? this.assessTrend(sorted.slice(-6)) : 'DATA_INSUFFICIENT';

      // Acceleration (requires ≥3 points → 2 growth intervals)
      const acceleration = this.assessAcceleration(periods);

      // Volatility: coefficient of variation
      const volatility = this.assessVolatility(sorted.map(r => r.raw));

      return {
        metric, unit: unit || null, periods,
        latestValue: latest.raw,
        latestPeriod: latest.period,
        trend3Y, trend5Y, acceleration, volatility,
        latestYoY,
        latestYoYLabel: latestYoY !== null
          ? `${latestYoY >= 0 ? '+' : ''}${(latestYoY * 100).toFixed(1)}% YoY`
          : null,
      };
    } catch {
      return empty('Query failed');
    }
  }

  /**
   * Assess trend direction from a sequence of values.
   * Requires ≥3 values to determine direction.
   * Returns DATA_INSUFFICIENT for <3 values.
   */
  private assessTrend(sorted: Array<{ raw: number }>): TrendDirection {
    if (sorted.length < 3) return 'DATA_INSUFFICIENT';
    const vals = sorted.map(r => r.raw);
    const growths = vals.slice(1).map((v, i) =>
      Math.abs(vals[i]) > 0 ? (v - vals[i]) / Math.abs(vals[i]) : 0
    );

    const posCount = growths.filter(g => g > 0.02).length;
    const negCount = growths.filter(g => g < -0.02).length;
    const total = growths.length;

    if (posCount >= total * 0.75) return 'IMPROVING';
    if (negCount >= total * 0.75) return 'DETERIORATING';

    // Check volatility
    const cv = this.coefficientOfVariation(vals);
    if (cv > 0.20) return 'VOLATILE';

    return 'STABLE';
  }

  /**
   * Assess acceleration/deceleration.
   * C6: Requires ≥2 comparable growth intervals (≥3 data points).
   */
  private assessAcceleration(periods: PeriodValue[]): AccelerationStatus {
    const growths = periods.map(p => p.yoyGrowth).filter(g => g !== null) as number[];

    if (growths.length < 2) return 'DATA_INSUFFICIENT';

    const latest = growths[growths.length - 1];
    const prior = growths[growths.length - 2];
    const diff = latest - prior;

    if (Math.abs(diff) < 0.02) return 'STABLE'; // <2pp change = stable
    return diff > 0 ? 'ACCELERATING' : 'DECELERATING';
  }

  /**
   * Coefficient of variation for volatility assessment.
   */
  private assessVolatility(values: number[]): TrendAnalysis['volatility'] {
    if (values.length < 2) return 'DATA_INSUFFICIENT';
    const cv = this.coefficientOfVariation(values);
    if (cv > 0.25) return 'HIGH';
    if (cv > 0.10) return 'MEDIUM';
    return 'LOW';
  }

  private coefficientOfVariation(values: number[]): number {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    if (Math.abs(mean) < 0.001) return 0;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) / Math.abs(mean);
  }

  /**
   * Convenience: analyze the core fundamental metrics for a company.
   */
  public async analyzeCoreMetrics(
    symbol: string,
    businessModel: string,
  ): Promise<Record<string, TrendAnalysis>> {
    const coreMetrics = businessModel === 'BANK'
      ? ['nim_pct', 'loan_book_cr', 'gnpa_pct', 'roa_pct', 'roe_pct', 'casa_ratio_pct']
      : businessModel === 'NBFC'
      ? ['aum_cr', 'nim_pct', 'gnpa_pct', 'roa_pct', 'roe_pct']
      : ['revenue_cr', 'ebitda_margin_pct', 'pat_cr', 'cfo_cr', 'roce_pct', 'net_debt_cr'];

    const results: Record<string, TrendAnalysis> = {};
    await Promise.all(
      coreMetrics.map(async m => {
        results[m] = await this.analyzeTrend(symbol, m);
      })
    );
    return results;
  }
}
