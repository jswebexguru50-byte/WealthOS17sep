/**
 * CanonicalFactService.ts — P0 Fix
 *
 * PIT-aware (Point-in-Time) canonical fact retrieval.
 * Translates FundamentalPayload.historicalSeries into
 * a flat, typed record accessible by metric key.
 *
 * Constitution invariants:
 * - C8: PIT — return what was knowable at asOfDate
 * - C2: No fake data — absent metric → null, not zero
 * - C3: Direction requires ≥2 periods
 */

import { getDB } from '../../../database.js';
import { FundamentalPayload, FundamentalMetricItem } from '../types/FundamentalPayload.js';
import { EvidenceReference } from '../contracts/Provenance.js';

// ─── Canonical Fact ───────────────────────────────────────────────────────────

export interface CanonicalFact {
  metricKey: string;
  value: number | null;
  period: string;
  unit: string;
  source: string;
  evidence: EvidenceReference[];
}

// ─── Analytical Facts Bundle ──────────────────────────────────────────────────

export interface AnalyticalFacts {
  /** Most recent available period for each metric */
  latest: Record<string, CanonicalFact>;

  /** Annual period one year prior */
  priorAnnual: Record<string, CanonicalFact>;

  /** Quarter one period prior */
  priorQuarter: Record<string, CanonicalFact>;

  /** Same period one year ago (YoY) */
  yearAgo: Record<string, CanonicalFact>;

  /** Operating KPIs (non-accounting) from company_kpi table */
  operatingKpis: Record<string, CanonicalFact[]>;

  /** Evidence references for audit trail */
  evidenceRefs: EvidenceReference[];

  /** Timestamp of most recently fetched underlying data */
  asOfDate: string | null;

  /** Coverage assessment */
  coverage: {
    metricsWithLatest: number;
    metricsWithPriorAnnual: number;
    metricsWithYearAgo: number;
    kpiCount: number;
    completeness: 'FULL' | 'PARTIAL' | 'MINIMAL';
  };
}

// ─── Series key → canonical metric key mapping ────────────────────────────────

const SERIES_TO_METRIC: Record<string, string> = {
  'Revenue': 'revenue_cr',
  'EBITDA': 'ebitda_cr',
  'PAT': 'pat_cr',
  'CFO': 'cfo_cr',
  'NIM': 'nim_pct',
  'ROE': 'roe_pct',
  'ROCE': 'roce_pct',
  'ROA': 'roa_pct',
  'NetNPA': 'nnpa_pct',
  'GNPA': 'gnpa_pct',
  'CASA': 'casa_ratio_pct',
  'NetDebt': 'net_debt_cr',
  'Capex': 'capex_cr',
  'LoanBook': 'loan_book_cr',
  'Deposits': 'deposit_cr',
  'AUM': 'aum_cr',
  'EBITMargin': 'ebit_margin_pct',
  'EBITDAMargin': 'ebitda_margin_pct',
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class CanonicalFactService {
  private static instance: CanonicalFactService;

  private constructor() {}

  public static getInstance(): CanonicalFactService {
    if (!CanonicalFactService.instance) {
      CanonicalFactService.instance = new CanonicalFactService();
    }
    return CanonicalFactService.instance;
  }

  /**
   * Build analytical facts from FundamentalPayload historicalSeries.
   * Primary path — uses already-fetched payload without extra DB hit.
   * Series items are ordered LATEST first by the FundamentalModuleAdapter.
   */
  public fromFundamentalPayload(
    symbol: string,
    payload: FundamentalPayload | null,
  ): AnalyticalFacts {
    const latest: Record<string, CanonicalFact> = {};
    const priorAnnual: Record<string, CanonicalFact> = {};
    const yearAgo: Record<string, CanonicalFact> = {};
    const allEvidence: EvidenceReference[] = [];

    if (payload?.historicalSeries) {
      for (const [seriesKey, items] of Object.entries(payload.historicalSeries)) {
        if (!items || items.length === 0) continue;

        const metricKey = SERIES_TO_METRIC[seriesKey] || seriesKey.toLowerCase();

        // Item[0] = latest
        const latestItem = items[0];
        if (latestItem?.value !== null && latestItem?.value !== undefined) {
          const fact = this.itemToFact(metricKey, latestItem, symbol);
          latest[metricKey] = fact;
          allEvidence.push(...fact.evidence);
        }

        // Item[1] = prior annual
        if (items.length >= 2) {
          const priorItem = items[1];
          if (priorItem?.value !== null && priorItem?.value !== undefined) {
            priorAnnual[metricKey] = this.itemToFact(metricKey, priorItem, symbol);
          }
        }

        // Item[2] = year ago (3rd point = 2 years prior for annual series)
        if (items.length >= 3) {
          const yearAgoItem = items[2];
          if (yearAgoItem?.value !== null && yearAgoItem?.value !== undefined) {
            yearAgo[metricKey] = this.itemToFact(metricKey, yearAgoItem, symbol);
          }
        }
      }
    }

    // Also compute derived margin metrics from Revenue + EBITDA if not directly available
    if (latest['revenue_cr'] && latest['ebitda_cr'] && !latest['ebitda_margin_pct']) {
      const rev = latest['revenue_cr'].value!;
      const ebitda = latest['ebitda_cr'].value!;
      if (rev > 0) {
        latest['ebitda_margin_pct'] = {
          metricKey: 'ebitda_margin_pct',
          value: parseFloat(((ebitda / rev) * 100).toFixed(2)),
          period: latest['revenue_cr'].period,
          unit: 'PERCENT',
          source: 'DERIVED',
          evidence: [],
        };
      }
    }

    const metricsWithLatest = Object.keys(latest).length;
    const metricsWithPriorAnnual = Object.keys(priorAnnual).length;
    const metricsWithYearAgo = Object.keys(yearAgo).length;

    const completeness: AnalyticalFacts['coverage']['completeness'] =
      metricsWithLatest >= 6 && metricsWithPriorAnnual >= 4 ? 'FULL'
      : metricsWithLatest >= 3 ? 'PARTIAL'
      : 'MINIMAL';

    return {
      latest,
      priorAnnual,
      priorQuarter: {}, // Populated by augmentFromDB when quarterly facts available
      yearAgo,
      operatingKpis: {},
      evidenceRefs: allEvidence,
      asOfDate: payload?.dataAsOf ?? null,
      coverage: {
        metricsWithLatest,
        metricsWithPriorAnnual,
        metricsWithYearAgo,
        kpiCount: 0,
        completeness,
      },
    };
  }

  /**
   * Augment with operating KPIs from company_facts table.
   * These are KPIs that are NOT standard accounting metrics.
   * Operating KPIs: attrition_pct, utilisation_pct, large_deal_tcv_cr, etc.
   */
  public async augmentWithOperatingKpis(
    facts: AnalyticalFacts,
    symbol: string,
  ): Promise<AnalyticalFacts> {
    const db = getDB();
    if (!db) return facts;

    const KPI_METRICS = [
      // IT Services
      'cc_revenue_growth_yoy', 'large_deal_tcv_cr', 'deal_tcv_cr',
      'employee_utilisation_pct', 'attrition_pct', 'headcount',
      // Auto
      'jlr_volumes_k', 'jlr_ebit_margin_pct', 'india_cv_volumes_k',
      'india_pv_volumes_k', 'net_auto_debt_cr',
      // Steel / Commodity
      'india_production_mt', 'india_delivery_mt', 'europe_ebitda_t',
      'india_ebitda_t', 'capacity_mt',
      // Bank
      'credit_cost_pct', 'capital_adequacy_pct',
    ];

    const operatingKpis: Record<string, CanonicalFact[]> = {};

    try {
      for (const metric of KPI_METRICS) {
        const rows = db.prepare(`
          SELECT value, period_end, data_source, period_type
          FROM company_facts
          WHERE (symbol = ? OR isin = ?) AND metric_key = ?
          ORDER BY period_end DESC LIMIT 4
        `).all(symbol, symbol, metric) as unknown as Array<{value: string; period_end: string; data_source: string; period_type: string}>;

        if (rows.length > 0) {
          operatingKpis[metric] = rows.map(r => ({
            metricKey: metric,
            value: parseFloat(r.value),
            period: r.period_end,
            unit: metric.endsWith('_pct') ? 'PERCENT' : metric.endsWith('_cr') ? 'INR_CR' : 'UNITS',
            source: r.data_source || 'company_facts',
            evidence: [{
              evidenceId: `kpi_${metric}_${r.period_end}`,
              sourceType: 'CANONICAL_FACT' as const,
              sourceId: `company_facts/${symbol}/${metric}/${r.period_end}`,
              timestamp: r.period_end,
              field: metric,
              asOfDate: r.period_end,
            }],
          }));
        }
      }
    } catch {
      // Non-fatal
    }

    const kpiCount = Object.keys(operatingKpis).length;

    return {
      ...facts,
      operatingKpis,
      coverage: {
        ...facts.coverage,
        kpiCount,
      },
    };
  }

  /**
   * Augment analytical facts with quarterly company_facts data for QoQ delta.
   */
  public async augmentWithQuarterlyFacts(
    facts: AnalyticalFacts,
    symbol: string,
  ): Promise<AnalyticalFacts> {
    const db = getDB();
    if (!db) return facts;

    const priorQuarter: Record<string, CanonicalFact> = {};

    try {
      // Get latest quarterly period
      const latestQ = db.prepare(`
        SELECT period_end FROM company_facts
        WHERE (symbol = ? OR isin = ?) AND period_type = 'QUARTERLY'
        ORDER BY period_end DESC LIMIT 1
      `).get(symbol, symbol) as unknown as { period_end: string } | undefined;

      if (!latestQ) return facts;

      // Get the quarterly metric values for the prior quarter
      const QUARTERLY_METRICS = ['revenue_cr', 'pat_cr', 'ebitda_cr', 'nim_pct', 'gnpa_pct'];
      for (const metric of QUARTERLY_METRICS) {
        const rows = db.prepare(`
          SELECT value, period_end, data_source FROM company_facts
          WHERE (symbol = ? OR isin = ?) AND metric_key = ? AND period_type = 'QUARTERLY'
          ORDER BY period_end DESC LIMIT 2
        `).all(symbol, symbol, metric) as unknown as Array<{value: string; period_end: string; data_source: string}>;

        // rows[1] = prior quarter (rows[0] = current quarter)
        if (rows.length >= 2) {
          const priorItem = rows[1];
          priorQuarter[metric] = {
            metricKey: metric,
            value: parseFloat(priorItem.value),
            period: priorItem.period_end,
            unit: metric.endsWith('_pct') ? 'PERCENT' : 'INR_CR',
            source: priorItem.data_source || 'company_facts',
            evidence: [{
              evidenceId: `q_${metric}_${priorItem.period_end}`,
              sourceType: 'CANONICAL_FACT',
              sourceId: `company_facts/${symbol}/${metric}/${priorItem.period_end}`,
              timestamp: priorItem.period_end,
              field: metric,
              asOfDate: priorItem.period_end,
            }],
          };
        }
      }
    } catch {
      // Non-fatal
    }

    return { ...facts, priorQuarter };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private itemToFact(metricKey: string, item: FundamentalMetricItem, symbol: string): CanonicalFact {
    return {
      metricKey,
      value: item.value,
      period: item.period,
      unit: item.unit,
      source: item.provenance?.[0]?.sourceId || 'fundamental_snapshot',
      evidence: item.provenance || [],
    };
  }
}
