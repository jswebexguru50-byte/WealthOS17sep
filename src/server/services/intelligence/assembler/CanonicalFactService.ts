/**
 * CanonicalFactService.ts — P0.1 Integrity Fix
 *
 * PIT-aware (Point-in-Time) canonical fact retrieval.
 * Translates FundamentalPayload.historicalSeries into
 * a flat, typed record accessible by metric key.
 *
 * Constitution invariants:
 * - C8: PIT — return what was knowable at asOfDate (availableAt <= asOfDate)
 * - C2: No fake data — absent metric → null, not zero
 * - C3: Direction requires ≥2 periods
 * - C5: Explicit period alignment — YoY compares matching 1-year periods
 */

import { getDB, dbAll, dbGet } from '../../../database.js';
import { FundamentalPayload, FundamentalMetricItem } from '../types/FundamentalPayload.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import { PeriodAlignmentService } from './PeriodAlignmentService.js';

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

  /** Same period one year ago (YoY comparable — exactly 1 year prior) */
  yearAgo: Record<string, CanonicalFact>;

  /** Operating KPIs (non-accounting) from company_facts / company_kpi table */
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
   * Primary path — uses already-fetched payload with exact PeriodAlignmentService logic.
   * Enforces PIT boundary using asOfDate cutoff.
   */
  public fromFundamentalPayload(
    symbol: string,
    payload: FundamentalPayload | null,
    asOfDate?: string | null,
  ): AnalyticalFacts {
    const latest: Record<string, CanonicalFact> = {};
    const priorAnnual: Record<string, CanonicalFact> = {};
    const priorQuarter: Record<string, CanonicalFact> = {};
    const yearAgo: Record<string, CanonicalFact> = {};
    const allEvidence: EvidenceReference[] = [];

    const effectiveAsOf = asOfDate || payload?.dataAsOf || null;
    const periodAligner = PeriodAlignmentService.getInstance();

    if (payload?.historicalSeries) {
      for (const [seriesKey, items] of Object.entries(payload.historicalSeries)) {
        if (!items || items.length === 0) continue;

        const metricKey = SERIES_TO_METRIC[seriesKey] || seriesKey.toLowerCase();
        const aligned = periodAligner.alignSeries(items, effectiveAsOf);

        // 1. Latest fact
        const latestItem = aligned.latestAnnual || aligned.latestQuarter;
        if (latestItem?.value !== null && latestItem?.value !== undefined) {
          const fact = this.itemToFact(metricKey, latestItem, symbol);
          latest[metricKey] = fact;
          allEvidence.push(...fact.evidence);
        }

        // 2. Prior annual fact (exactly 1 fiscal year prior)
        if (aligned.priorAnnual?.value !== null && aligned.priorAnnual?.value !== undefined) {
          priorAnnual[metricKey] = this.itemToFact(metricKey, aligned.priorAnnual, symbol);
        }

        // 3. Prior quarter fact (QoQ comparison)
        if (aligned.priorQuarter?.value !== null && aligned.priorQuarter?.value !== undefined) {
          priorQuarter[metricKey] = this.itemToFact(metricKey, aligned.priorQuarter, symbol);
        }

        // 4. Year ago comparable fact (YoY comparison — exactly 1 year prior)
        if (aligned.yearAgoComparable?.value !== null && aligned.yearAgoComparable?.value !== undefined) {
          yearAgo[metricKey] = this.itemToFact(metricKey, aligned.yearAgoComparable, symbol);
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
      priorQuarter,
      yearAgo,
      operatingKpis: {},
      evidenceRefs: allEvidence,
      asOfDate: effectiveAsOf,
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
   * Augment with operating KPIs from company_facts table with strict Point-In-Time (PIT) boundary.
   * Query only data availableAt <= asOfDate.
   */
  public async augmentWithOperatingKpis(
    facts: AnalyticalFacts,
    symbol: string,
    asOfDate?: string | null,
  ): Promise<AnalyticalFacts> {
    const db = getDB();
    if (!db) return facts;

    const effectiveAsOf = asOfDate || facts.asOfDate || new Date().toISOString().split('T')[0];

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
      'credit_cost_pct', 'capital_adequacy_pct', 'nim_pct', 'casa_ratio_pct',
    ];

    const operatingKpis: Record<string, CanonicalFact[]> = { ...facts.operatingKpis };

    try {
      for (const metric of KPI_METRICS) {
        // Enforce PIT constraint: availableAt / asOfDate must be <= effectiveAsOf
        const sql = `
          SELECT value, periodEnd, provider, sourceType, asOfDate, periodType
          FROM company_facts
          WHERE (symbol = ? OR isin = ?) AND metric = ?
            AND (
              fetchedAt IS NOT NULL AND fetchedAt <= ?
            )
          ORDER BY fetchedAt DESC, periodEnd DESC
          LIMIT 4
        `;
        const rows = await dbAll<any>(db, sql, [symbol, symbol, metric, effectiveAsOf]);

        if (rows && rows.length > 0) {
          operatingKpis[metric] = rows.map((r: any) => ({
            metricKey: metric,
            value: r.value !== null && r.value !== undefined ? parseFloat(r.value) : null,
            period: r.periodEnd || 'LATEST',
            unit: metric.endsWith('_pct') ? 'PERCENT' : metric.endsWith('_cr') ? 'INR_CR' : 'UNITS',
            source: r.provider || r.sourceType || 'company_facts',
            evidence: [{
              evidenceId: `kpi_${metric}_${r.periodEnd}`,
              sourceType: 'CANONICAL_FACT' as const,
              sourceId: `company_facts/${symbol}/${metric}/${r.periodEnd}`,
              timestamp: r.asOfDate || r.periodEnd || effectiveAsOf,
              field: metric,
              asOfDate: r.asOfDate || r.periodEnd || effectiveAsOf,
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
   * Augment analytical facts with quarterly company_facts data for QoQ delta with strict PIT.
   */
  public async augmentWithQuarterlyFacts(
    facts: AnalyticalFacts,
    symbol: string,
    asOfDate?: string | null,
  ): Promise<AnalyticalFacts> {
    const db = getDB();
    if (!db) return facts;

    const effectiveAsOf = asOfDate || facts.asOfDate || new Date().toISOString().split('T')[0];
    const priorQuarter: Record<string, CanonicalFact> = { ...facts.priorQuarter };

    try {
      // Get the quarterly metric values for the prior quarter enforcing PIT
      const QUARTERLY_METRICS = ['revenue_cr', 'pat_cr', 'ebitda_cr', 'nim_pct', 'gnpa_pct'];
      for (const metric of QUARTERLY_METRICS) {
        const sql = `
          SELECT value, periodEnd, provider, sourceType, asOfDate
          FROM company_facts
          WHERE (symbol = ? OR isin = ?) AND metric = ? AND periodType = 'QUARTERLY'
            AND (
              fetchedAt IS NOT NULL AND fetchedAt <= ?
            )
          ORDER BY fetchedAt DESC, periodEnd DESC
          LIMIT 2
        `;
        const rows = await dbAll<any>(db, sql, [symbol, symbol, metric, effectiveAsOf]);

        // rows[1] = prior quarter (rows[0] = latest quarter)
        if (rows && rows.length >= 2 && !priorQuarter[metric]) {
          const priorItem = rows[1];
          priorQuarter[metric] = {
            metricKey: metric,
            value: priorItem.value !== null && priorItem.value !== undefined ? parseFloat(priorItem.value) : null,
            period: priorItem.periodEnd,
            unit: metric.endsWith('_pct') ? 'PERCENT' : 'INR_CR',
            source: priorItem.provider || priorItem.sourceType || 'company_facts',
            evidence: [{
              evidenceId: `q_${metric}_${priorItem.periodEnd}`,
              sourceType: 'CANONICAL_FACT',
              sourceId: `company_facts/${symbol}/${metric}/${priorItem.periodEnd}`,
              timestamp: priorItem.asOfDate || priorItem.periodEnd,
              field: metric,
              asOfDate: priorItem.asOfDate || priorItem.periodEnd,
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
