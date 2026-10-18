/**
 * TrendlyneNormalizer.ts — Normalizes raw Trendlyne responses into typed intermediate representation
 * WealthOS V2 Mandatory Amendment
 */

import { TrendlyneMetricCatalog } from './TrendlyneMetricCatalog.js';

export interface NormalizedTrendlyneMetric {
  symbol: string;
  providerMetricId: string;
  canonicalMetric: string | null;
  value: number | string | null;
  unit: string | null;
  periodType: string | null;
  retrievedAt: string;
  sourceDocId?: string;
  periodEnd?: string;
}

export class TrendlyneNormalizer {
  private static instance: TrendlyneNormalizer;
  private readonly catalog: TrendlyneMetricCatalog;

  private constructor(catalog = TrendlyneMetricCatalog.getInstance()) {
    this.catalog = catalog;
  }

  public static getInstance(): TrendlyneNormalizer {
    if (!TrendlyneNormalizer.instance) {
      TrendlyneNormalizer.instance = new TrendlyneNormalizer();
    }
    return TrendlyneNormalizer.instance;
  }

  public normalizeStructuredData(
    rawData: Record<string, Record<string, any>>,
    rawResponseId: string
  ): NormalizedTrendlyneMetric[] {
    const results: NormalizedTrendlyneMetric[] = [];
    const now = new Date().toISOString();

    for (const [symbol, metrics] of Object.entries(rawData)) {
      for (const [paramId, val] of Object.entries(metrics)) {
        if (val === null || val === undefined) continue;

        const def = this.catalog.getMetric(paramId);
        let parsedVal: number | string = val;
        if (typeof val === 'string') {
          const num = parseFloat(val.replace(/,/g, '').trim());
          if (!isNaN(num)) parsedVal = num;
        }

        results.push({
          symbol,
          providerMetricId: paramId,
          canonicalMetric: def?.canonicalMetric ?? paramId,
          value: parsedVal,
          unit: def?.unit ?? null,
          periodType: def?.periodType ?? null,
          retrievedAt: now,
          sourceDocId: rawResponseId,
        });
      }
    }

    return results;
  }
}
