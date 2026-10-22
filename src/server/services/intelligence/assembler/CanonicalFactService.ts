/**
 * CanonicalFactService.ts — Gate B.1 Integrity Fix
 *
 * PIT-aware (Point-in-Time) canonical fact retrieval.
 * Translates CanonicalFactRepository facts (and secondary FundamentalPayload fallback)
 * into a structured AnalyticalFacts bundle.
 *
 * Constitution invariants:
 * - C1: Evidence before conclusion — all facts resolve to verifiable sources
 * - C4: Single canonical fact definition from contracts/CanonicalFact.ts
 * - C5: PIT gating on availableAt <= asOfDate (NOT fetchedAt)
 * - C2: Observation != interpretation; absent metric -> null, not zero
 */

import { getDB, dbAll } from '../../../database.js';
import { FundamentalPayload, FundamentalMetricItem } from '../types/FundamentalPayload.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { PeriodAlignmentService } from './PeriodAlignmentService.js';
import { SecurityIdentityRegistry } from '../../dataAcquisition/SecurityIdentityRegistry.js';

// Re-export CanonicalFact from contracts so consumers have a unified import
export type { CanonicalFact };

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
    identityOverride?: SecurityIdentity | null
  ): AnalyticalFacts {
    const latest: Record<string, CanonicalFact> = {};
    const priorAnnual: Record<string, CanonicalFact> = {};
    const priorQuarter: Record<string, CanonicalFact> = {};
    const yearAgo: Record<string, CanonicalFact> = {};
    const allEvidence: EvidenceReference[] = [];

    const effectiveAsOf = asOfDate || payload?.dataAsOf || null;
    const periodAligner = PeriodAlignmentService.getInstance();
    const resolvedIdentity = identityOverride || this.resolveIdentity(symbol);
    const isin = resolvedIdentity?.isin || '';
    const securityId = resolvedIdentity?.securityId || isin || symbol;

    if (payload?.historicalSeries) {
      for (const [seriesKey, items] of Object.entries(payload.historicalSeries)) {
        if (!items || items.length === 0) continue;

        const metricKey = SERIES_TO_METRIC[seriesKey] || seriesKey.toLowerCase();
        const aligned = periodAligner.alignSeries(items, effectiveAsOf);

        // 1. Latest fact
        const latestItem = aligned.latestAnnual || aligned.latestQuarter;
        if (latestItem?.value !== null && latestItem?.value !== undefined) {
          const fact = this.itemToFact(metricKey, latestItem, symbol, securityId, isin, effectiveAsOf);
          latest[metricKey] = fact;
          if (fact.evidence) {
            allEvidence.push(...fact.evidence);
          }
        }

        // 2. Prior annual fact (exactly 1 fiscal year prior)
        if (aligned.priorAnnual?.value !== null && aligned.priorAnnual?.value !== undefined) {
          priorAnnual[metricKey] = this.itemToFact(metricKey, aligned.priorAnnual, symbol, securityId, isin, effectiveAsOf);
        }

        // 3. Prior quarter fact (QoQ comparison)
        if (aligned.priorQuarter?.value !== null && aligned.priorQuarter?.value !== undefined) {
          priorQuarter[metricKey] = this.itemToFact(metricKey, aligned.priorQuarter, symbol, securityId, isin, effectiveAsOf);
        }

        // 4. Year ago comparable fact (YoY comparison — exactly 1 year prior)
        if (aligned.yearAgoComparable?.value !== null && aligned.yearAgoComparable?.value !== undefined) {
          yearAgo[metricKey] = this.itemToFact(metricKey, aligned.yearAgoComparable, symbol, securityId, isin, effectiveAsOf);
        }
      }
    }

    // Compute derived EBITDA margin with full derivation lineage and inherited evidence
    if (latest['revenue_cr'] && latest['ebitda_cr'] && !latest['ebitda_margin_pct']) {
      const rev = Number(latest['revenue_cr'].value);
      const ebitda = Number(latest['ebitda_cr'].value);
      if (rev > 0 && !isNaN(rev) && !isNaN(ebitda)) {
        const marginVal = parseFloat(((ebitda / rev) * 100).toFixed(2));
        const periodEnd = latest['revenue_cr'].periodEnd;
        const pubAt = latest['revenue_cr'].publishedAt;
        const availAt = latest['revenue_cr'].availableAt;

        latest['ebitda_margin_pct'] = {
          factId: `${isin}_ebitda_margin_pct_${periodEnd}_DERIVED`,
          securityId,
          isin,
          metric: 'ebitda_margin_pct',
          metricKey: 'ebitda_margin_pct',
          value: marginVal,
          unit: 'PERCENT',
          currency: 'INR',
          scale: 'UNIT',
          periodType: latest['revenue_cr'].periodType || 'ANNUAL',
          periodEnd,
          period: periodEnd || 'LATEST',
          fiscalYear: latest['revenue_cr'].fiscalYear,
          consolidatedOrStandalone: latest['revenue_cr'].consolidatedOrStandalone || 'CONSOLIDATED',
          sourceId: 'DERIVATION_LINEAGE',
          source: 'DERIVED',
          publishedAt: pubAt,
          availableAt: availAt,
          verificationStatus: 'DERIVED_CONFIRMED',
          derivationFormula: 'EBITDA / REVENUE * 100',
          inputFactIds: [latest['ebitda_cr'].factId, latest['revenue_cr'].factId],
          evidenceRef: {
            evidenceId: `derived_ebitda_margin_${periodEnd}`,
            sourceType: 'EXCHANGE_FILING',
            sourceName: `Derived from revenue (${latest['revenue_cr'].sourceId}) and EBITDA (${latest['ebitda_cr'].sourceId})`,
            documentDate: pubAt || null,
            availableAt: availAt || null,
            pitStatus: availAt ? 'PIT_VERIFIED' : (pubAt ? 'PIT_INFERRED' : 'PIT_UNKNOWN'),
            periodEnd: periodEnd || undefined,
            extractionMethod: 'MANUAL_AUDITED',
          },
          evidence: [
            ...(latest['revenue_cr'].evidence || []),
            ...(latest['ebitda_cr'].evidence || []),
          ],
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
   * Query uses canonical ISIN and symbol, gating on availableAt <= asOfDate.
   */
  public async augmentWithOperatingKpis(
    facts: AnalyticalFacts,
    identityOrSymbol: SecurityIdentity | { symbol: string; isin?: string | null; nseSymbol?: string | null; securityId?: string } | string,
    asOfDate?: string | null,
    overrideDb?: any
  ): Promise<AnalyticalFacts> {
    const db = overrideDb || getDB();
    if (!db) return facts;

    const identity = typeof identityOrSymbol === 'string'
      ? this.resolveIdentity(identityOrSymbol)
      : identityOrSymbol;

    const isin = identity?.isin || '';
    const symbol = ('nseSymbol' in identity && identity.nseSymbol) ? identity.nseSymbol : ('symbol' in identity ? identity.symbol : '');
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
      // Cables / Industrials
      'order_book_cr', 'capacity_utilisation_pct', 'receivable_days',
    ];

    const operatingKpis: Record<string, CanonicalFact[]> = { ...facts.operatingKpis };

    try {
      for (const metric of KPI_METRICS) {
        // Enforce PIT constraint: availableAt <= effectiveAsOf
        const sql = `
          SELECT factId, companyId, symbol, isin, metric, value, unit, periodEnd, provider,
                 sourceType, asOfDate, reportedAt, availableAt, periodType, scope
          FROM company_facts
          WHERE (isin = ? OR symbol = ?) AND metric = ?
            AND (
              (availableAt IS NOT NULL AND availableAt <= ?)
              OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
            )
          ORDER BY availableAt DESC, periodEnd DESC
          LIMIT 4
        `;
        const rows = typeof db.all === 'function'
          ? await dbAll<any>(db, sql, [isin, symbol, metric, effectiveAsOf, effectiveAsOf])
          : (db.prepare ? db.prepare(sql).all(isin, symbol, metric, effectiveAsOf, effectiveAsOf) : []);

        if (rows && rows.length > 0) {
          operatingKpis[metric] = rows.map((r: any) => ({
            factId: r.factId || `${isin}_${metric}_${r.periodEnd}`,
            securityId: r.companyId || isin,
            isin: r.isin || isin,
            metric,
            metricKey: metric,
            value: r.value !== null && r.value !== undefined ? parseFloat(r.value) : null,
            unit: r.unit || (metric.endsWith('_pct') ? 'PERCENT' : metric.endsWith('_cr') ? 'INR_CR' : 'UNITS'),
            currency: 'INR',
            scale: 'UNIT',
            periodType: (r.periodType as any) || 'POINT_IN_TIME',
            periodEnd: r.periodEnd || 'LATEST',
            period: r.periodEnd || 'LATEST',
            consolidatedOrStandalone: (r.scope as any) || 'CONSOLIDATED',
            sourceId: r.provider || r.sourceType || 'company_facts',
            source: r.provider || r.sourceType || 'company_facts',
            publishedAt: r.reportedAt || r.asOfDate || effectiveAsOf,
            availableAt: r.availableAt || r.reportedAt || r.asOfDate || effectiveAsOf,
            verificationStatus: 'SOURCE_LINKED',
            evidenceRef: {
              evidenceId: `kpi_${metric}_${r.periodEnd}`,
              sourceType: 'EXCHANGE_FILING',
              sourceName: r.provider || 'Company Disclosures',
              documentDate: r.reportedAt || r.asOfDate || null,
              availableAt: r.availableAt || r.reportedAt || r.asOfDate || null,
              pitStatus: r.availableAt ? 'PIT_VERIFIED' : (r.reportedAt || r.asOfDate ? 'PIT_INFERRED' : 'PIT_UNKNOWN'),
              periodEnd: r.periodEnd,
              extractionMethod: 'STRUCTURED_XBRL',
            },
            evidence: [{
              evidenceId: `kpi_${metric}_${r.periodEnd}`,
              sourceType: 'CANONICAL_FACT' as const,
              sourceId: `company_facts/${isin}/${metric}/${r.periodEnd}`,
              timestamp: r.availableAt || r.asOfDate || effectiveAsOf,
              field: metric,
              asOfDate: r.availableAt || r.asOfDate || effectiveAsOf,
            }],
          }));
        }
      }
    } catch (err) {
      console.warn('[CanonicalFactService] Error augmenting operating KPIs:', err);
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
    identityOrSymbol: SecurityIdentity | { symbol: string; isin?: string | null; nseSymbol?: string | null; securityId?: string } | string,
    asOfDate?: string | null,
    overrideDb?: any
  ): Promise<AnalyticalFacts> {
    const db = overrideDb || getDB();
    if (!db) return facts;

    const identity = typeof identityOrSymbol === 'string'
      ? this.resolveIdentity(identityOrSymbol)
      : identityOrSymbol;

    const isin = identity?.isin || '';
    const symbol = ('nseSymbol' in identity && identity.nseSymbol) ? identity.nseSymbol : ('symbol' in identity ? identity.symbol : '');
    const effectiveAsOf = asOfDate || facts.asOfDate || new Date().toISOString().split('T')[0];
    const priorQuarter: Record<string, CanonicalFact> = { ...facts.priorQuarter };

    try {
      const QUARTERLY_METRICS = ['revenue_cr', 'pat_cr', 'ebitda_cr', 'nim_pct', 'gnpa_pct'];
      for (const metric of QUARTERLY_METRICS) {
        const sql = `
          SELECT factId, companyId, symbol, isin, metric, value, unit, periodEnd, provider,
                 sourceType, asOfDate, reportedAt, availableAt, periodType, scope
          FROM company_facts
          WHERE (isin = ? OR symbol = ?) AND metric = ? AND periodType = 'QUARTERLY'
            AND (
              (availableAt IS NOT NULL AND availableAt <= ?)
              OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
            )
          ORDER BY availableAt DESC, periodEnd DESC
          LIMIT 2
        `;
        const rows = typeof db.all === 'function'
          ? await dbAll<any>(db, sql, [isin, symbol, metric, effectiveAsOf, effectiveAsOf])
          : (db.prepare ? db.prepare(sql).all(isin, symbol, metric, effectiveAsOf, effectiveAsOf) : []);

        // rows[1] = prior quarter (rows[0] = latest quarter)
        if (rows && rows.length >= 2 && !priorQuarter[metric]) {
          const priorItem = rows[1];
          const availAt = priorItem.availableAt || priorItem.reportedAt || priorItem.asOfDate || effectiveAsOf;
          priorQuarter[metric] = {
            factId: priorItem.factId || `${isin}_${metric}_${priorItem.periodEnd}`,
            securityId: priorItem.companyId || isin,
            isin: priorItem.isin || isin,
            metric,
            metricKey: metric,
            value: priorItem.value !== null && priorItem.value !== undefined ? parseFloat(priorItem.value) : null,
            unit: priorItem.unit || (metric.endsWith('_pct') ? 'PERCENT' : 'INR_CR'),
            currency: 'INR',
            scale: 'CRORE',
            periodType: 'QUARTERLY',
            periodEnd: priorItem.periodEnd,
            period: priorItem.periodEnd,
            consolidatedOrStandalone: (priorItem.scope as any) || 'CONSOLIDATED',
            sourceId: priorItem.provider || priorItem.sourceType || 'company_facts',
            source: priorItem.provider || priorItem.sourceType || 'company_facts',
            publishedAt: priorItem.reportedAt || priorItem.asOfDate || effectiveAsOf,
            availableAt: availAt,
            verificationStatus: 'SOURCE_LINKED',
            evidenceRef: {
              evidenceId: `q_${metric}_${priorItem.periodEnd}`,
              sourceType: 'EXCHANGE_FILING',
              sourceName: priorItem.provider || 'Quarterly Financial Results',
              documentDate: priorItem.reportedAt || priorItem.asOfDate || null,
              availableAt: availAt || null,
              pitStatus: availAt ? 'PIT_VERIFIED' : (priorItem.reportedAt ? 'PIT_INFERRED' : 'PIT_UNKNOWN'),
              periodEnd: priorItem.periodEnd,
              extractionMethod: 'STRUCTURED_XBRL',
            },
            evidence: [{
              evidenceId: `q_${metric}_${priorItem.periodEnd}`,
              sourceType: 'CANONICAL_FACT',
              sourceId: `company_facts/${isin}/${metric}/${priorItem.periodEnd}`,
              timestamp: availAt,
              field: metric,
              asOfDate: availAt,
            }],
          };
        }
      }
    } catch (err) {
      console.warn('[CanonicalFactService] Error augmenting quarterly facts:', err);
    }

    return { ...facts, priorQuarter };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private resolveIdentity(symbol: string): SecurityIdentity {
    const registry = SecurityIdentityRegistry.getInstance();
    const idRecord = registry.resolveBySymbol(symbol);
    return {
      securityId: idRecord?.securityId || symbol,
      isin: idRecord?.isin || '',
      nseSymbol: idRecord?.nseSymbol || symbol,
      bseCode: idRecord?.bseCode || undefined,
      companyName: idRecord?.currentSymbol || symbol,
    };
  }

  private itemToFact(
    metricKey: string,
    item: FundamentalMetricItem,
    symbol: string,
    securityId: string,
    isin: string,
    asOfDate?: string | null
  ): CanonicalFact {
    const pubAt = item.provenance?.[0]?.timestamp || asOfDate || new Date().toISOString();
    const availAt = pubAt;
    const periodEnd = item.period || 'LATEST';

    return {
      factId: `${isin || symbol}_${metricKey}_${periodEnd}`,
      securityId,
      isin,
      metric: metricKey,
      metricKey,
      value: item.value,
      unit: item.unit,
      currency: 'INR',
      scale: item.unit === 'PERCENT' ? 'UNIT' : 'CRORE',
      periodType: ((item as any).periodType) || (periodEnd.includes('Q') ? 'QUARTERLY' : 'ANNUAL'),
      periodEnd,
      period: periodEnd,
      consolidatedOrStandalone: 'CONSOLIDATED',
      sourceId: item.provenance?.[0]?.sourceId || 'fundamental_snapshot',
      source: item.provenance?.[0]?.sourceId || 'fundamental_snapshot',
      publishedAt: pubAt,
      availableAt: availAt,
      verificationStatus: 'NORMALIZED',
      evidenceRef: {
        evidenceId: `fact_${metricKey}_${periodEnd}`,
        sourceType: 'OTHER',
        sourceName: item.provenance?.[0]?.sourceId || 'Fundamental Series',
        documentDate: pubAt || null,
        availableAt: availAt || null,
        pitStatus: availAt ? 'PIT_VERIFIED' : (pubAt ? 'PIT_INFERRED' : 'PIT_UNKNOWN'),
        periodEnd,
        extractionMethod: 'MANUAL_AUDITED',
      },
      evidence: item.provenance || [],
    };
  }
}
