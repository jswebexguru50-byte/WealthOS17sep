/**
 * src/server/services/Analyze360FieldSourceMap.ts
 *
 * Deterministic Field-Source Mapping & Resolvers for Analyze360, QGLP, and Fundamental Snapshots.
 * Consumes existing persisted sources strictly:
 * - company_facts (audited FERE XBRL facts, Trendlyne facts)
 * - DataQualityAuditLedger & MasterTickers
 * - HistoricalFinancialStatements (QUARTERLY_PL, ANNUAL_PL, CASH_FLOW)
 * - HistoricalShareholdingPattern & shareholding_snapshot
 * - FEREEnrichedLedger (promoter pledge, CCC, DSO, DIO, DPO, forensic scores)
 * - SecurityDossierSnapshots (businessProfile, catalystRadar, thesis)
 *
 * Constitutional Invariants:
 * - No external provider calls.
 * - No LLM calls.
 * - Zero synthetic or fabricated values.
 * - Explicit fail-closed status: MISSING / DATA_INSUFFICIENT with missingReason.
 * - Full PIT source-table, period, and derivation metadata preserved.
 */

import * as dbModule from '../database.js';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

export interface FieldSourceDefinition {
  key: string;
  label: string;
  preferredSource: string;
  fallbackSource?: string;
  allowedPeriodTypes: string[];
  requiredUnits: string;
  isDerived: boolean;
  derivationFormula?: string;
  missingReason: string;
}

export interface ResolvedFactField<T = number | string | boolean | null> {
  value: T;
  status: 'AVAILABLE' | 'MISSING' | 'DATA_INSUFFICIENT';
  missingReason: string | null;
  provider: string | null;
  sourceTable: string | null;
  sourceFactId: string | null;
  periodType: string | null;
  periodEnd: string | null;
  availableAt: string | null;
  fetchedAt: string | null;
  note: string | null;
  derivationFormula?: string | null;
}

export const FIELD_SOURCE_DEFINITIONS: Record<string, FieldSourceDefinition> = {
  salesCagr3yPct: {
    key: 'salesCagr3yPct',
    label: '3-Year Revenue CAGR',
    preferredSource: 'company_facts (metric=revenue, periodType=ANNUAL)',
    allowedPeriodTypes: ['ANNUAL'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: '((revenue_Y3 / revenue_Y0) ** (1/3) - 1) * 100 (where Y3 - Y0 == 3 and 4 consecutive annual filings exist)',
    missingReason: 'NO_TRUE_3Y_CAGR_AVAILABLE'
  },
  profitCagr3yPct: {
    key: 'profitCagr3yPct',
    label: '3-Year PAT CAGR',
    preferredSource: 'company_facts (metric=pat, periodType=ANNUAL)',
    allowedPeriodTypes: ['ANNUAL'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: '((pat_Y3 / pat_Y0) ** (1/3) - 1) * 100 (where Y3 - Y0 == 3, 4 consecutive annual filings exist, and pat > 0)',
    missingReason: 'NO_TRUE_3Y_CAGR_AVAILABLE'
  },
  cfoToPatPct: {
    key: 'cfoToPatPct',
    label: 'CFO / PAT Conversion %',
    preferredSource: 'company_facts (metric=cfo & pat, same period)',
    fallbackSource: 'DataQualityAuditLedger (cfo_cr / latest_pat_cr * 100)',
    allowedPeriodTypes: ['ANNUAL', 'QUARTERLY', 'TTM'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: '(cfo / pat) * 100',
    missingReason: 'NO_MATCHED_PERIOD_CFO_AND_PAT'
  },
  cfoToOperatingProfitPct: {
    key: 'cfoToOperatingProfitPct',
    label: 'CFO / Operating Profit %',
    preferredSource: 'company_facts (metric=cfo & operating_profit, same period)',
    fallbackSource: 'DataQualityAuditLedger (cfo_cr / latest_op_profit_cr * 100)',
    allowedPeriodTypes: ['ANNUAL', 'QUARTERLY', 'TTM'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: '(cfo / operating_profit) * 100',
    missingReason: 'NO_MATCHED_PERIOD_CFO_AND_OP_PROFIT'
  },
  operatingMarginTrend: {
    key: 'operatingMarginTrend',
    label: 'Operating Margin Trend',
    preferredSource: 'HistoricalFinancialStatements (statement_type=QUARTERLY_PL, opm_pct)',
    fallbackSource: 'company_facts (operating_profit / revenue * 100 across sequential quarters)',
    allowedPeriodTypes: ['QUARTERLY'],
    requiredUnits: 'EXPANDING | CONTRACTING | STABLE',
    isDerived: true,
    derivationFormula: 'latest_opm - prev_opm > 0.5 ? EXPANDING : (latest_opm - prev_opm < -0.5 ? CONTRACTING : STABLE)',
    missingReason: 'NO_SEQUENTIAL_QUARTERLY_MARGINS'
  },
  promoterPledgePct: {
    key: 'promoterPledgePct',
    label: 'Promoter Pledge %',
    preferredSource: 'fere_evidence.db.shareholding_snapshot (promoter_pledge)',
    fallbackSource: 'FEREEnrichedLedger (promoter_pledge_pct)',
    allowedPeriodTypes: ['QUARTERLY', 'POINT_IN_TIME'],
    requiredUnits: '%',
    isDerived: false,
    missingReason: 'NO_PROMOTER_PLEDGE_DATA'
  },
  fiiTrend: {
    key: 'fiiTrend',
    label: 'FII Holding & Trend',
    preferredSource: 'HistoricalShareholdingPattern (fii_pct sequential quarters)',
    allowedPeriodTypes: ['QUARTERLY'],
    requiredUnits: '% & Direction',
    isDerived: true,
    derivationFormula: 'delta = latest_fii - prev_fii; direction = delta > 0.05 ? INCREASING : (delta < -0.05 ? DECREASING : STABLE)',
    missingReason: 'NO_FII_HOLDING_TREND'
  },
  diiTrend: {
    key: 'diiTrend',
    label: 'DII Holding & Trend',
    preferredSource: 'HistoricalShareholdingPattern (dii_pct sequential quarters)',
    allowedPeriodTypes: ['QUARTERLY'],
    requiredUnits: '% & Direction',
    isDerived: true,
    derivationFormula: 'delta = latest_dii - prev_dii; direction = delta > 0.05 ? INCREASING : (delta < -0.05 ? DECREASING : STABLE)',
    missingReason: 'NO_DII_HOLDING_TREND'
  },
  profitableQuarterCount: {
    key: 'profitableQuarterCount',
    label: 'Profitable Quarters (Last 8Q)',
    preferredSource: 'HistoricalFinancialStatements (statement_type=QUARTERLY_PL count(pat > 0))',
    fallbackSource: 'company_facts (metric=pat, periodType=QUARTERLY)',
    allowedPeriodTypes: ['QUARTERLY'],
    requiredUnits: 'count',
    isDerived: true,
    derivationFormula: 'count of quarters where pat > 0 in last 8 quarters',
    missingReason: 'NO_HISTORICAL_QUARTERLY_PAT'
  },
  profitableYears: {
    key: 'profitableYears',
    label: 'Profitable Financial Years',
    preferredSource: 'company_facts (metric=pat, periodType=ANNUAL count(pat > 0))',
    fallbackSource: 'HistoricalFinancialStatements (statement_type=ANNUAL_PL count(pat > 0))',
    allowedPeriodTypes: ['ANNUAL'],
    requiredUnits: 'count',
    isDerived: true,
    derivationFormula: 'count of annual periods where pat > 0',
    missingReason: 'NO_HISTORICAL_ANNUAL_PAT'
  },
  positiveCfoYears: {
    key: 'positiveCfoYears',
    label: 'Positive Cash Flow from Operations Years',
    preferredSource: 'company_facts (metric=cfo, periodType=ANNUAL count(cfo > 0))',
    fallbackSource: 'HistoricalFinancialStatements (statement_type=CASH_FLOW count(cfo_cr > 0))',
    allowedPeriodTypes: ['ANNUAL'],
    requiredUnits: 'count',
    isDerived: true,
    derivationFormula: 'count of annual periods where cfo > 0',
    missingReason: 'NO_HISTORICAL_ANNUAL_CFO'
  },
  roceConsistencyPct: {
    key: 'roceConsistencyPct',
    label: 'ROCE Consistency %',
    preferredSource: 'company_facts (metric=roce_reported, periodType=ANNUAL)',
    fallbackSource: 'HistoricalFinancialStatements',
    allowedPeriodTypes: ['ANNUAL'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: 'percentage of recorded annual periods (min 3) where ROCE >= 15%',
    missingReason: 'NO_HISTORICAL_ROCE_SERIES'
  },
  marginStabilityPct: {
    key: 'marginStabilityPct',
    label: 'Margin Stability %',
    preferredSource: 'HistoricalFinancialStatements (statement_type=QUARTERLY_PL)',
    allowedPeriodTypes: ['QUARTERLY'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: 'clamp(100 - (opm_std_dev / opm_mean * 100), 0, 100) over at least 4 quarters',
    missingReason: 'NO_MULTI_QUARTER_MARGIN_DATA'
  },
  peVsHistoryPct: {
    key: 'peVsHistoryPct',
    label: 'PE vs Historical Range %',
    preferredSource: 'company_facts (metric=pe_ratio)',
    fallbackSource: 'FundamentalSnapshots (pe_ratio)',
    allowedPeriodTypes: ['POINT_IN_TIME', 'TTM'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: 'clamp((current_pe - min_pe) / (max_pe - min_pe) * 100, 0, 100)',
    missingReason: 'NO_HISTORICAL_PE_SPAN'
  },
  peVsSectorPct: {
    key: 'peVsSectorPct',
    label: 'PE vs Sector Median %',
    preferredSource: 'MasterTickers + DataQualityAuditLedger (pe_ratio vs sector median)',
    allowedPeriodTypes: ['POINT_IN_TIME'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: '((company_pe - sector_median_pe) / sector_median_pe) * 100',
    missingReason: 'NO_SECTOR_PE_BENCHMARK'
  },
  pegRatio: {
    key: 'pegRatio',
    label: 'PEG Ratio',
    preferredSource: 'company_facts (metric=peg_ratio)',
    fallbackSource: 'derived: pe_ratio / profit_growth_pct',
    allowedPeriodTypes: ['TTM', 'ANNUAL'],
    requiredUnits: 'ratio',
    isDerived: true,
    derivationFormula: 'pe_ratio / profit_growth_pct',
    missingReason: 'NO_PEG_DATA'
  },
  freeCashFlow: {
    key: 'freeCashFlow',
    label: 'Free Cash Flow (₹ Cr)',
    preferredSource: 'company_facts (cfo - capex_cash_outflow)',
    allowedPeriodTypes: ['ANNUAL', 'QUARTERLY', 'TTM'],
    requiredUnits: '₹ Cr',
    isDerived: true,
    derivationFormula: 'cfo - Math.abs(capex_cash_outflow)',
    missingReason: 'NO_MATCHED_CFO_AND_CAPEX'
  },
  fcfYield: {
    key: 'fcfYield',
    label: 'FCF Yield %',
    preferredSource: 'company_facts + MasterTickers ((freeCashFlow / marketCap) * 100)',
    allowedPeriodTypes: ['ANNUAL', 'TTM'],
    requiredUnits: '%',
    isDerived: true,
    derivationFormula: '(freeCashFlow / marketCap) * 100',
    missingReason: 'NO_MATCHED_CFO_AND_CAPEX'
  },
  workingCapital: {
    key: 'workingCapital',
    label: 'Working Capital & Cash Conversion Cycle',
    preferredSource: 'FEREEnrichedLedger (cash_conversion_cycle, dso, dio, dpo)',
    fallbackSource: 'company_facts (inventory_change, purchases_stock_trade)',
    allowedPeriodTypes: ['ANNUAL'],
    requiredUnits: 'days',
    isDerived: false,
    missingReason: 'NO_WORKING_CAPITAL_DATA'
  },
  demandOutlook: {
    key: 'demandOutlook',
    label: 'Demand Outlook & Industry Tailwinds',
    preferredSource: 'SecurityDossierSnapshots (catalystRadar.nearTermTriggers / mediumTermTailwinds)',
    fallbackSource: 'sunrise_industrial_universe.catalysts_summary',
    allowedPeriodTypes: ['POINT_IN_TIME'],
    requiredUnits: 'qualitative_text',
    isDerived: false,
    missingReason: 'NO_DEMAND_OUTLOOK_EVIDENCE'
  },
  peerContext: {
    key: 'peerContext',
    label: 'Peer Context & Competitive Position',
    preferredSource: 'SecurityDossierSnapshots (businessProfile.marketPosition)',
    allowedPeriodTypes: ['POINT_IN_TIME'],
    requiredUnits: 'qualitative_text',
    isDerived: false,
    missingReason: 'NO_PEER_CONTEXT_EVIDENCE'
  },
  keyRisks: {
    key: 'keyRisks',
    label: 'Key Fundamental & Operating Risks',
    preferredSource: 'SecurityDossierSnapshots (thesis.brutalBearAntithesis)',
    fallbackSource: 'fere_evidence.db.company_material_event',
    allowedPeriodTypes: ['POINT_IN_TIME'],
    requiredUnits: 'qualitative_text',
    isDerived: false,
    missingReason: 'NO_RISK_EVIDENCE'
  },
  whatToWatchNext: {
    key: 'whatToWatchNext',
    label: 'What To Watch Next / Invalidation Triggers',
    preferredSource: 'SecurityDossierSnapshots (thesis.invalidationTriggers)',
    fallbackSource: 'SecurityDossierSnapshots (catalystRadar.nearTermTriggers)',
    allowedPeriodTypes: ['POINT_IN_TIME'],
    requiredUnits: 'qualitative_text',
    isDerived: false,
    missingReason: 'NO_WATCH_EVIDENCE'
  }
};

// Aliases for alternate key naming conventions
FIELD_SOURCE_DEFINITIONS.roceConsistency = FIELD_SOURCE_DEFINITIONS.roceConsistencyPct;
FIELD_SOURCE_DEFINITIONS.marginStability = FIELD_SOURCE_DEFINITIONS.marginStabilityPct;
FIELD_SOURCE_DEFINITIONS.peVsHistory = FIELD_SOURCE_DEFINITIONS.peVsHistoryPct;
FIELD_SOURCE_DEFINITIONS.peVsSector = FIELD_SOURCE_DEFINITIONS.peVsSectorPct;
FIELD_SOURCE_DEFINITIONS.fcfAndYield = FIELD_SOURCE_DEFINITIONS.freeCashFlow;
// fcfYield defined directly

export class Analyze360FieldResolver {
  private static fereDbPath = path.resolve('data/fere/verified_filings/fere_evidence.db');

  /**
   * Helper to parse an integer calendar year from periodEnd string.
   * Handles: '2026-03-31', 'FY2026', '2026', etc.
   */
  public static parsePeriodYear(periodEnd: string | null | undefined): number | null {
    if (!periodEnd) return null;
    const str = String(periodEnd).trim();
    const isoMatch = str.match(/^(\d{4})-\d{2}-\d{2}/);
    if (isoMatch) return parseInt(isoMatch[1], 10);
    const fyMatch = str.match(/^FY\s*(\d{4})/i);
    if (fyMatch) return parseInt(fyMatch[1], 10);
    const plainMatch = str.match(/^(\d{4})$/);
    if (plainMatch) return parseInt(plainMatch[1], 10);
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getUTCFullYear();
    return null;
  }

  /**
   * Resolves all required Analyze360, QGLP, and Fundamental Snapshot fields
   * deterministically from local persistence.
   */
  public static async resolveAllFields(symbol: string, masterRow: any = null): Promise<{
    fields: Record<string, ResolvedFactField<any>>;
    qglpInputs: {
      roePct: number | null;
      rocePct: number | null;
      cfoToPatPct: number | null;
      cfoToOperatingProfitPct: number | null;
      debtToEquity: number | null;
      promoterPledgePct: number | null;
      profitableQuarterCount: number | null;
      salesCagr3yPct: number | null;
      profitCagr3yPct: number | null;
      profitableYears: number | null;
      positiveCfoYears: number | null;
      roceConsistencyPct: number | null;
      marginStabilityPct: number | null;
      peVsHistoryPct: number | null;
      peVsSectorPct: number | null;
      peg: number | null;
      fcfYieldPct: number | null;
      evidenceIds?: string[];
    };
  }> {
    const db = typeof dbModule.getDB === 'function' ? dbModule.getDB() : null;
    const dbAll = (dbModule as any).dbAll;
    const dbGet = (dbModule as any).dbGet;

    // 1. Fetch company_facts
    let facts: any[] = [];
    if (typeof dbAll === 'function') {
      try {
        facts = await dbAll(db, `
          SELECT factId, metric, periodType, periodEnd, value, unit, provider, sourceUrl, availableAt
          FROM company_facts
          WHERE symbol = ?
          ORDER BY periodEnd DESC
        `, [symbol]) as any[];
      } catch (e) {
        console.warn(`[Analyze360FieldResolver] company_facts query error for ${symbol}:`, e);
      }
    }

    const factsByMetric = new Map<string, any[]>();
    for (const f of facts) {
      const list = factsByMetric.get(f.metric) || [];
      list.push(f);
      factsByMetric.set(f.metric, list);
    }

    // 2. Fetch HistoricalFinancialStatements
    let hfsRows: any[] = [];
    if (typeof dbAll === 'function') {
      try {
        hfsRows = await dbAll(db, `
          SELECT statement_type, period_label, period_date, sales_cr, operating_profit_cr, net_profit_pat_cr, opm_pct, cfo_cr, primary_source
          FROM HistoricalFinancialStatements
          WHERE symbol = ?
          ORDER BY id ASC
        `, [symbol]) as any[];
      } catch (e) {
        console.warn(`[Analyze360FieldResolver] HistoricalFinancialStatements query error for ${symbol}:`, e);
      }
    }

    // 3. Fetch HistoricalShareholdingPattern
    let hspRows: any[] = [];
    if (typeof dbAll === 'function') {
      try {
        hspRows = await dbAll(db, `
          SELECT quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, public_pct
          FROM HistoricalShareholdingPattern
          WHERE symbol = ?
          ORDER BY as_of_date DESC
        `, [symbol]) as any[];
      } catch (e) {
        console.warn(`[Analyze360FieldResolver] HistoricalShareholdingPattern query error for ${symbol}:`, e);
      }
    }

    // 4. Fetch FERE shareholding_snapshot
    let fereShRows: any[] = [];
    if (fs.existsSync(Analyze360FieldResolver.fereDbPath)) {
      try {
        const fereDb = new Database(Analyze360FieldResolver.fereDbPath, { readonly: true });
        fereShRows = fereDb.prepare(`
          SELECT period_end, promoter_holding, promoter_pledge, public_holding, source_url, available_at
          FROM shareholding_snapshot
          WHERE symbol = ?
          ORDER BY period_end DESC
          LIMIT 1
        `).all(symbol) as any[];
        fereDb.close();
      } catch (e) {
        console.warn(`[Analyze360FieldResolver] fere shareholding_snapshot error for ${symbol}:`, e);
      }
    }

    // 5. Fetch FEREEnrichedLedger
    let fereLedger: any = null;
    if (typeof dbGet === 'function') {
      try {
        fereLedger = await dbGet(db, `
          SELECT promoter_pledge_pct, cfo_to_ebitda_pct, cash_conversion_cycle, dso, dio, dpo, altman_z_score, beneish_m_score, piotroski_f_score
          FROM FEREEnrichedLedger
          WHERE symbol = ?
          LIMIT 1
        `, [symbol]);
      } catch (e) {
        console.warn(`[Analyze360FieldResolver] FEREEnrichedLedger query error for ${symbol}:`, e);
      }
    }

    // 6. Fetch SecurityDossierSnapshots
    let dossierParsed: any = null;
    if (typeof dbGet === 'function') {
      try {
        const dRow = await dbGet(db, `
          SELECT full_dossier_json
          FROM SecurityDossierSnapshots
          WHERE symbol = ?
          LIMIT 1
        `, [symbol]) as any;
        if (dRow?.full_dossier_json) {
          dossierParsed = JSON.parse(dRow.full_dossier_json);
        }
      } catch (e) {
        console.warn(`[Analyze360FieldResolver] SecurityDossierSnapshots query error for ${symbol}:`, e);
      }
    }

    const fields: Record<string, ResolvedFactField<any>> = {};
    const evidenceIds: string[] = [];

    const build = (
      val: any,
      missingReason: string,
      periodType: string | null = null,
      periodEnd: string | null = null,
      sourceTable: string | null = null,
      provider: string | null = null,
      sourceFactId: string | null = null,
      availableAt: string | null = null,
      note: string | null = null,
      derivationFormula: string | null = null
    ): ResolvedFactField<any> => {
      const isMissing = val === null || val === undefined;
      return {
        value: isMissing ? null : val,
        status: isMissing ? 'MISSING' : 'AVAILABLE',
        missingReason: isMissing ? missingReason : null,
        provider: isMissing ? null : provider,
        sourceTable: isMissing ? null : sourceTable,
        sourceFactId: isMissing ? null : sourceFactId,
        periodType: isMissing ? null : periodType,
        periodEnd: isMissing ? null : periodEnd,
        availableAt: isMissing ? null : availableAt,
        fetchedAt: null,
        note: isMissing ? null : note,
        derivationFormula: isMissing ? null : derivationFormula
      };
    };

    const latestNumericFact = (metricNames: string[], periodTypes?: string[]): any | null => {
      for (const metricName of metricNames) {
        const candidates = (factsByMetric.get(metricName) || [])
          .filter(f => f.value != null && !isNaN(Number(f.value)))
          .filter(f => !periodTypes || periodTypes.includes(String(f.periodType || '').toUpperCase()));
        if (candidates.length > 0) return candidates[0];
      }
      return null;
    };

    /**
     * Helper to compute true 3Y CAGR over exactly 4 consecutive annual filings (latestYear - startYear == 3)
     */
    const computeTrue3yCagr = (metricName: string) => {
      const rawFacts = (factsByMetric.get(metricName) || [])
        .filter(f => f.periodType === 'ANNUAL' && f.value != null && Number(f.value) > 0);

      // Deduplicate facts by parsed year (take latest available/factId if duplicate for same year)
      const factsByYear = new Map<number, any>();
      for (const f of rawFacts) {
        const y = Analyze360FieldResolver.parsePeriodYear(f.periodEnd);
        if (y != null) {
          const existing = factsByYear.get(y);
          if (!existing || (f.availableAt && (!existing.availableAt || f.availableAt > existing.availableAt))) {
            factsByYear.set(y, { ...f, parsedYear: y });
          }
        }
      }

      const sorted = Array.from(factsByYear.values()).sort((a, b) => a.parsedYear - b.parsedYear);

      if (sorted.length >= 4) {
        const y0 = sorted[sorted.length - 4];
        const y1 = sorted[sorted.length - 3];
        const y2 = sorted[sorted.length - 2];
        const y3 = sorted[sorted.length - 1];

        // Strict consecutive verification: no missing intermediate years and exact 3-year span
        if (
          y1.parsedYear === y0.parsedYear + 1 &&
          y2.parsedYear === y1.parsedYear + 1 &&
          y3.parsedYear === y2.parsedYear + 1 &&
          y3.parsedYear - y0.parsedYear === 3
        ) {
          const v0 = Number(y0.value);
          const v3 = Number(y3.value);
          if (v0 > 0 && v3 > 0) {
            const cagr = Number(((Math.pow(v3 / v0, 1 / 3) - 1) * 100).toFixed(2));
            const factIdJoin = y0.factId && y3.factId ? `${y0.factId}+${y3.factId}` : (y3.factId || y0.factId || null);
            if (y3.factId) evidenceIds.push(y3.factId);
            if (y0.factId) evidenceIds.push(y0.factId);
            return {
              value: cagr,
              period: `${y0.periodEnd} to ${y3.periodEnd}`,
              sourceTable: 'company_facts',
              provider: y3.provider || y0.provider || 'company_facts',
              sourceFactId: factIdJoin,
              availableAt: y3.availableAt || y0.availableAt || null,
              note: `Calculated from 4 consecutive audited annual filings (${y0.parsedYear}-${y3.parsedYear})`,
              derivation: `((Metric_${y3.parsedYear} / Metric_${y0.parsedYear}) ** (1/3) - 1) * 100`
            };
          }
        }
      }

      // If company_facts does not have 4 consecutive annual filings, check HistoricalFinancialStatements
      const hfsAnnual = (hfsRows || []).filter(h => h.statement_type === 'ANNUAL_PL');
      if (hfsAnnual.length >= 4) {
        const hfsWithYear = hfsAnnual.map(h => {
          const yr = Analyze360FieldResolver.parsePeriodYear(h.period_date || h.period_label);
          const val = metricName === 'revenue' ? Number(h.sales_cr) : Number(h.net_profit_pat_cr);
          return { ...h, parsedYear: yr, val };
        }).filter(h => h.parsedYear != null && h.val > 0);

        const hfsMap = new Map<number, any>();
        for (const item of hfsWithYear) {
          hfsMap.set(item.parsedYear, item);
        }
        const hfsSorted = Array.from(hfsMap.values()).sort((a, b) => a.parsedYear - b.parsedYear);

        if (hfsSorted.length >= 4) {
          const y0 = hfsSorted[hfsSorted.length - 4];
          const y1 = hfsSorted[hfsSorted.length - 3];
          const y2 = hfsSorted[hfsSorted.length - 2];
          const y3 = hfsSorted[hfsSorted.length - 1];

          if (
            y1.parsedYear === y0.parsedYear + 1 &&
            y2.parsedYear === y1.parsedYear + 1 &&
            y3.parsedYear === y2.parsedYear + 1 &&
            y3.parsedYear - y0.parsedYear === 3
          ) {
            const v0 = y0.val;
            const v3 = y3.val;
            if (v0 > 0 && v3 > 0) {
              const cagr = Number(((Math.pow(v3 / v0, 1 / 3) - 1) * 100).toFixed(2));
              return {
                value: cagr,
                period: `${y0.period_label || y0.period_date} to ${y3.period_label || y3.period_date}`,
                sourceTable: 'HistoricalFinancialStatements',
                provider: y3.primary_source || 'HISTORICAL_FINANCIAL_STATEMENTS',
                sourceFactId: null,
                availableAt: null,
                note: `Calculated from 4 consecutive audited annual statutory filings (${y0.parsedYear}-${y3.parsedYear})`,
                derivation: `((Metric_${y3.parsedYear} / Metric_${y0.parsedYear}) ** (1/3) - 1) * 100`
              };
            }
          }
        }
      }

      return null;
    };

    // --- A. 3Y Revenue CAGR ---
    const salesCagrRes = computeTrue3yCagr('revenue');
    fields.salesCagr3yPct = build(
      salesCagrRes?.value ?? null,
      'NO_TRUE_3Y_CAGR_AVAILABLE',
      'ANNUAL (3Y)',
      salesCagrRes?.period ?? null,
      salesCagrRes?.sourceTable ?? null,
      salesCagrRes?.provider ?? null,
      salesCagrRes?.sourceFactId ?? null,
      salesCagrRes?.availableAt ?? null,
      salesCagrRes?.note ?? null,
      salesCagrRes?.derivation ?? null
    );

    // --- B. 3Y Profit CAGR ---
    const patCagrRes = computeTrue3yCagr('pat');
    fields.profitCagr3yPct = build(
      patCagrRes?.value ?? null,
      'NO_TRUE_3Y_CAGR_AVAILABLE',
      'ANNUAL (3Y)',
      patCagrRes?.period ?? null,
      patCagrRes?.sourceTable ?? null,
      patCagrRes?.provider ?? null,
      patCagrRes?.sourceFactId ?? null,
      patCagrRes?.availableAt ?? null,
      patCagrRes?.note ?? null,
      patCagrRes?.derivation ?? null
    );

    // --- C. CFO / PAT ---
    let cfoToPat: number | null = null;
    let cfoToPatSource: string | null = null;
    let cfoToPatProvider: string | null = null;
    let cfoToPatFactId: string | null = null;
    let cfoToPatPeriod: string | null = null;
    let cfoToPatAvailableAt: string | null = null;

    const cfoFacts = factsByMetric.get('cfo') || [];
    const patFacts = factsByMetric.get('pat') || [];
    for (const cfoF of cfoFacts) {
      const pF = patFacts.find(p => p.periodEnd === cfoF.periodEnd && p.periodType === cfoF.periodType && p.value != null);
      if (pF && Number(pF.value) !== 0 && cfoF.value != null) {
        cfoToPat = Number(((Number(cfoF.value) / Number(pF.value)) * 100).toFixed(1));
        cfoToPatSource = 'company_facts';
        cfoToPatProvider = cfoF.provider || pF.provider || 'company_facts';
        cfoToPatFactId = cfoF.factId && pF.factId ? `${cfoF.factId}+${pF.factId}` : (cfoF.factId || pF.factId || null);
        cfoToPatPeriod = `${cfoF.periodEnd} (${cfoF.periodType})`;
        cfoToPatAvailableAt = cfoF.availableAt || pF.availableAt || null;
        if (cfoF.factId) evidenceIds.push(cfoF.factId);
        if (pF.factId) evidenceIds.push(pF.factId);
        break;
      }
    }

    // Fallback only to DataQualityAuditLedger if it has explicit cfo_cr and latest_pat_cr
    if (cfoToPat === null && masterRow?.cfo_cr != null && masterRow?.latest_pat_cr != null && Number(masterRow.latest_pat_cr) !== 0) {
      cfoToPat = Number(((Number(masterRow.cfo_cr) / Number(masterRow.latest_pat_cr)) * 100).toFixed(1));
      cfoToPatSource = 'DataQualityAuditLedger';
      cfoToPatProvider = 'DATA_QUALITY_AUDIT_LEDGER';
      cfoToPatPeriod = masterRow.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : 'Latest Audit';
      cfoToPatAvailableAt = masterRow.audited_at || null;
    }

    fields.cfoToPatPct = build(
      cfoToPat,
      'NO_MATCHED_PERIOD_CFO_AND_PAT',
      'ANNUAL / TTM',
      cfoToPatPeriod,
      cfoToPatSource,
      cfoToPatProvider,
      cfoToPatFactId,
      cfoToPatAvailableAt,
      cfoToPat != null ? 'Cash Flow Conversion of Net Profit' : null,
      cfoToPat != null ? '(CFO / PAT) * 100' : null
    );

    // --- D. CFO / Operating Profit ---
    let cfoToOp: number | null = null;
    let cfoToOpSource: string | null = null;
    let cfoToOpProvider: string | null = null;
    let cfoToOpFactId: string | null = null;
    let cfoToOpPeriod: string | null = null;
    let cfoToOpAvailableAt: string | null = null;

    const opProfitFacts = factsByMetric.get('operating_profit') || [];
    for (const cfoF of cfoFacts) {
      const opF = opProfitFacts.find(p => p.periodEnd === cfoF.periodEnd && p.periodType === cfoF.periodType && p.value != null);
      if (opF && Number(opF.value) !== 0 && cfoF.value != null) {
        cfoToOp = Number(((Number(cfoF.value) / Number(opF.value)) * 100).toFixed(1));
        cfoToOpSource = 'company_facts';
        cfoToOpProvider = cfoF.provider || opF.provider || 'company_facts';
        cfoToOpFactId = cfoF.factId && opF.factId ? `${cfoF.factId}+${opF.factId}` : (cfoF.factId || opF.factId || null);
        cfoToOpPeriod = `${cfoF.periodEnd} (${cfoF.periodType})`;
        cfoToOpAvailableAt = cfoF.availableAt || opF.availableAt || null;
        if (cfoF.factId) evidenceIds.push(cfoF.factId);
        if (opF.factId) evidenceIds.push(opF.factId);
        break;
      }
    }

    if (cfoToOp === null && masterRow?.cfo_cr != null && masterRow?.latest_op_profit_cr != null && Number(masterRow.latest_op_profit_cr) !== 0) {
      cfoToOp = Number(((Number(masterRow.cfo_cr) / Number(masterRow.latest_op_profit_cr)) * 100).toFixed(1));
      cfoToOpSource = 'DataQualityAuditLedger';
      cfoToOpProvider = 'DATA_QUALITY_AUDIT_LEDGER';
      cfoToOpPeriod = masterRow.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : 'Latest Audit';
      cfoToOpAvailableAt = masterRow.audited_at || null;
    }

    fields.cfoToOperatingProfitPct = build(
      cfoToOp,
      'NO_MATCHED_PERIOD_CFO_AND_OP_PROFIT',
      'ANNUAL / TTM',
      cfoToOpPeriod,
      cfoToOpSource,
      cfoToOpProvider,
      cfoToOpFactId,
      cfoToOpAvailableAt,
      cfoToOp != null ? 'CFO to Operating Cash Conversion' : null,
      cfoToOp != null ? '(CFO / Operating Profit) * 100' : null
    );

    // --- E. Operating Margin Trend ---
    let marginTrend: string | null = null;
    let marginPeriod: string | null = null;
    let marginSource: string | null = null;
    let marginProvider: string | null = null;

    const qHfs = hfsRows.filter(h => h.statement_type === 'QUARTERLY_PL' && h.opm_pct != null);
    if (qHfs.length >= 2) {
      const latestOpm = Number(qHfs[qHfs.length - 1].opm_pct);
      const prevOpm = Number(qHfs[qHfs.length - 2].opm_pct);
      const diff = latestOpm - prevOpm;
      marginTrend = diff > 0.5 ? 'EXPANDING' : (diff < -0.5 ? 'CONTRACTING' : 'STABLE');
      marginPeriod = `${qHfs[qHfs.length - 2].period_label} -> ${qHfs[qHfs.length - 1].period_label} (${latestOpm}% vs ${prevOpm}%)`;
      marginSource = 'HistoricalFinancialStatements';
      marginProvider = qHfs[qHfs.length - 1].primary_source || 'HISTORICAL_FINANCIAL_STATEMENTS';
    }
    fields.operatingMarginTrend = build(
      marginTrend,
      'NO_SEQUENTIAL_QUARTERLY_MARGINS',
      'QUARTERLY',
      marginPeriod,
      marginSource,
      marginProvider,
      null,
      null,
      marginTrend ? `Sequential quarterly operating margin direction: ${marginTrend}` : null
    );

    // --- F. Promoter Pledge ---
    let pledge: number | null = null;
    let pledgePeriod: string | null = null;
    let pledgeSource: string | null = null;
    let pledgeProvider: string | null = null;
    let pledgeFactId: string | null = null;
    let pledgeAvailableAt: string | null = null;

    if (fereShRows.length > 0 && fereShRows[0].promoter_pledge != null) {
      pledge = Number(fereShRows[0].promoter_pledge);
      pledgePeriod = fereShRows[0].period_end;
      pledgeSource = 'shareholding_snapshot';
      pledgeProvider = 'EXCHANGE_SHAREHOLDING';
      pledgeAvailableAt = fereShRows[0].available_at || null;
    } else if (fereLedger?.promoter_pledge_pct != null) {
      pledge = Number(fereLedger.promoter_pledge_pct);
      pledgePeriod = 'Latest Audit';
      pledgeSource = 'FEREEnrichedLedger';
      pledgeProvider = 'FERE_ENRICHED_LEDGER';
    } else if (dossierParsed?.governanceAndAccounting?.balanceSheetForensics?.promoterPledgePct != null) {
      pledge = Number(dossierParsed.governanceAndAccounting.balanceSheetForensics.promoterPledgePct);
      pledgePeriod = 'Latest Dossier';
      pledgeSource = 'SecurityDossierSnapshots';
      pledgeProvider = 'SECURITY_DOSSIER_SNAPSHOT';
    } else {
      const plF = factsByMetric.get('promoter_pledge') || [];
      if (plF.length > 0 && plF[0].value != null) {
        pledge = Number(plF[0].value);
        pledgePeriod = plF[0].periodEnd;
        pledgeSource = 'company_facts';
        pledgeProvider = plF[0].provider || 'company_facts';
        pledgeFactId = plF[0].factId || null;
        pledgeAvailableAt = plF[0].availableAt || null;
      }
    }
    fields.promoterPledgePct = build(
      pledge,
      'NO_PROMOTER_PLEDGE_DATA',
      'QUARTERLY',
      pledgePeriod,
      pledgeSource,
      pledgeProvider,
      pledgeFactId,
      pledgeAvailableAt,
      pledge != null ? `Promoter shares pledged: ${pledge}%` : null
    );

    // --- G. FII / DII Trends (STRICT: require at least 2 dated periods; do NOT present single-period as trend) ---
    let fiiTrend: { direction: string; latestPct: number; previousPct: number; deltaPct: number } | null = null;
    let diiTrend: { direction: string; latestPct: number; previousPct: number; deltaPct: number } | null = null;

    let fiiTrendSource: string | null = null;
    let fiiTrendProvider: string | null = null;
    let fiiTrendPeriod: string | null = null;
    let fiiTrendFactId: string | null = null;
    let fiiTrendAvailableAt: string | null = null;
    let diiTrendSource: string | null = null;
    let diiTrendProvider: string | null = null;
    let diiTrendPeriod: string | null = null;
    let diiTrendFactId: string | null = null;
    let diiTrendAvailableAt: string | null = null;

    if (hspRows.length >= 2) {
      const latest = hspRows[0];
      const prev = hspRows[1];
      const fiiDelta = Number((Number(latest.fii_pct) - Number(prev.fii_pct)).toFixed(2));
      const diiDelta = Number((Number(latest.dii_pct) - Number(prev.dii_pct)).toFixed(2));
      fiiTrend = {
        latestPct: Number(latest.fii_pct),
        previousPct: Number(prev.fii_pct),
        deltaPct: fiiDelta,
        direction: fiiDelta > 0.05 ? 'INCREASING' : (fiiDelta < -0.05 ? 'DECREASING' : 'STABLE')
      };
      diiTrend = {
        latestPct: Number(latest.dii_pct),
        previousPct: Number(prev.dii_pct),
        deltaPct: diiDelta,
        direction: diiDelta > 0.05 ? 'INCREASING' : (diiDelta < -0.05 ? 'DECREASING' : 'STABLE')
      };
      fiiTrendSource = 'HistoricalShareholdingPattern';
      fiiTrendProvider = 'HISTORICAL_SHAREHOLDING';
      fiiTrendPeriod = `${hspRows[1]?.quarter_label || ''} to ${hspRows[0]?.quarter_label || ''}`.trim();
      diiTrendSource = 'HistoricalShareholdingPattern';
      diiTrendProvider = 'HISTORICAL_SHAREHOLDING';
      diiTrendPeriod = fiiTrendPeriod;
    } else {
      const fiiChangeFact = latestNumericFact(['fii_change_qoq_pct', 'fii_change_qoq'], ['QUARTERLY']);
      const diiChangeFact = latestNumericFact(['dii_change_qoq_pct', 'dii_change_qoq', 'mf_change_qoq_pct'], ['QUARTERLY']);
      const fiiHoldingFact = latestNumericFact(['fii_holding', 'fii_pct'], ['QUARTERLY', 'POINT_IN_TIME']);
      const diiHoldingFact = latestNumericFact(['dii_holding', 'dii_pct', 'mf_holding'], ['QUARTERLY', 'POINT_IN_TIME']);

      if (fiiChangeFact) {
        const delta = Number(fiiChangeFact.value);
        const latestPct = fiiHoldingFact?.value != null ? Number(fiiHoldingFact.value) : null;
        fiiTrend = {
          latestPct: latestPct ?? delta,
          previousPct: latestPct != null ? Number((latestPct - delta).toFixed(2)) : 0,
          deltaPct: Number(delta.toFixed(2)),
          direction: delta > 0.05 ? 'INCREASING' : (delta < -0.05 ? 'DECREASING' : 'STABLE')
        };
        fiiTrendSource = 'company_facts';
        fiiTrendProvider = fiiChangeFact.provider || 'company_facts';
        fiiTrendPeriod = fiiChangeFact.periodEnd ? `${fiiChangeFact.periodEnd} (${fiiChangeFact.periodType || 'QUARTERLY'})` : 'Latest quarter';
        fiiTrendFactId = fiiChangeFact.factId || null;
        fiiTrendAvailableAt = fiiChangeFact.availableAt || null;
      }

      if (diiChangeFact) {
        const delta = Number(diiChangeFact.value);
        const latestPct = diiHoldingFact?.value != null ? Number(diiHoldingFact.value) : null;
        diiTrend = {
          latestPct: latestPct ?? delta,
          previousPct: latestPct != null ? Number((latestPct - delta).toFixed(2)) : 0,
          deltaPct: Number(delta.toFixed(2)),
          direction: delta > 0.05 ? 'INCREASING' : (delta < -0.05 ? 'DECREASING' : 'STABLE')
        };
        diiTrendSource = 'company_facts';
        diiTrendProvider = diiChangeFact.provider || 'company_facts';
        diiTrendPeriod = diiChangeFact.periodEnd ? `${diiChangeFact.periodEnd} (${diiChangeFact.periodType || 'QUARTERLY'})` : 'Latest quarter';
        diiTrendFactId = diiChangeFact.factId || null;
        diiTrendAvailableAt = diiChangeFact.availableAt || null;
      }
    }

    fields.fiiTrend = build(
      fiiTrend?.direction ?? null,
      'NO_FII_HOLDING_TREND',
      'QUARTERLY',
      fiiTrendPeriod,
      fiiTrendSource,
      fiiTrendProvider,
      fiiTrendFactId,
      fiiTrendAvailableAt,
      fiiTrend ? (fiiTrendSource === 'company_facts'
        ? `FII QoQ change: ${fiiTrend.deltaPct >= 0 ? '+' : ''}${fiiTrend.deltaPct}%${fiiTrend.latestPct != null ? `; latest holding ${fiiTrend.latestPct}%` : ''}`
        : `FII shifted from ${fiiTrend.previousPct}% to ${fiiTrend.latestPct}% (${fiiTrend.deltaPct >= 0 ? '+' : ''}${fiiTrend.deltaPct}%)`) : null,
      fiiTrend ? (fiiTrendSource === 'company_facts' ? 'provider_reported_fii_qoq_change' : 'latest_fii_pct - prev_fii_pct') : null
    );

    fields.diiTrend = build(
      diiTrend?.direction ?? null,
      'NO_DII_HOLDING_TREND',
      'QUARTERLY',
      diiTrendPeriod,
      diiTrendSource,
      diiTrendProvider,
      diiTrendFactId,
      diiTrendAvailableAt,
      diiTrend ? (diiTrendSource === 'company_facts'
        ? `DII/MF QoQ change: ${diiTrend.deltaPct >= 0 ? '+' : ''}${diiTrend.deltaPct}%${diiTrend.latestPct != null ? `; latest holding ${diiTrend.latestPct}%` : ''}`
        : `DII shifted from ${diiTrend.previousPct}% to ${diiTrend.latestPct}% (${diiTrend.deltaPct >= 0 ? '+' : ''}${diiTrend.deltaPct}%)`) : null,
      diiTrend ? (diiTrendSource === 'company_facts' ? 'provider_reported_dii_qoq_change' : 'latest_dii_pct - prev_dii_pct') : null
    );

    // --- H. Profitable Quarters Count ---
    let profQuarters: number | null = null;
    let profQuartersSource: string | null = null;
    let profQuartersProvider: string | null = null;

    const qPats = hfsRows.filter(h => h.statement_type === 'QUARTERLY_PL' && h.net_profit_pat_cr != null);
    if (qPats.length > 0) {
      const recent8 = qPats.slice(-8);
      profQuarters = recent8.filter(q => Number(q.net_profit_pat_cr) > 0).length;
      profQuartersSource = 'HistoricalFinancialStatements';
      profQuartersProvider = qPats[qPats.length - 1].primary_source || 'HISTORICAL_FINANCIAL_STATEMENTS';
    } else {
      const qFacts = (factsByMetric.get('pat') || []).filter(f => f.periodType === 'QUARTERLY' && f.value != null);
      if (qFacts.length > 0) {
        profQuarters = qFacts.slice(0, 8).filter(f => Number(f.value) > 0).length;
        profQuartersSource = 'company_facts';
        profQuartersProvider = qFacts[0].provider || 'company_facts';
      }
    }
    fields.profitableQuarterCount = build(
      profQuarters,
      'NO_HISTORICAL_QUARTERLY_PAT',
      'QUARTERLY (Last 8Q)',
      null,
      profQuartersSource,
      profQuartersProvider,
      null,
      null,
      profQuarters != null ? `${profQuarters} of last ${Math.min(8, qPats.length || 8)} quarters profitable` : null
    );

    // --- I. Profitable Years & Positive CFO Years ---
    const aPats = (factsByMetric.get('pat') || []).filter(f => f.periodType === 'ANNUAL' && f.value != null);
    const profYears = aPats.length > 0 ? aPats.filter(f => Number(f.value) > 0).length : null;
    fields.profitableYears = build(
      profYears,
      'NO_HISTORICAL_ANNUAL_PAT',
      'ANNUAL',
      null,
      profYears != null ? 'company_facts' : null,
      profYears != null ? (aPats[0].provider || 'company_facts') : null,
      profYears != null ? aPats[0].factId : null,
      profYears != null ? aPats[0].availableAt : null,
      profYears != null ? `${profYears} positive PAT years recorded` : null
    );

    const aCfos = (factsByMetric.get('cfo') || []).filter(f => f.periodType === 'ANNUAL' && f.value != null);
    const posCfoYears = aCfos.length > 0 ? aCfos.filter(f => Number(f.value) > 0).length : null;
    fields.positiveCfoYears = build(
      posCfoYears,
      'NO_HISTORICAL_ANNUAL_CFO',
      'ANNUAL',
      null,
      posCfoYears != null ? 'company_facts' : null,
      posCfoYears != null ? (aCfos[0].provider || 'company_facts') : null,
      posCfoYears != null ? aCfos[0].factId : null,
      posCfoYears != null ? aCfos[0].availableAt : null,
      posCfoYears != null ? `${posCfoYears} positive CFO years recorded` : null
    );

    // --- J. Working Capital & Cash Conversion Cycle (Item 8: NO zero default for DSO/DIO/DPO) ---
    const wcFact = latestNumericFact(['working_capital', 'working_capital_cr'], ['QUARTERLY', 'ANNUAL', 'TTM']);
    let ccc = fereLedger?.cash_conversion_cycle != null ? Number(fereLedger.cash_conversion_cycle) : null;
    const dsoStr = fereLedger?.dso != null ? `DSO: ${fereLedger.dso}` : 'DSO: N/A';
    const dioStr = fereLedger?.dio != null ? `DIO: ${fereLedger.dio}` : 'DIO: N/A';
    const dpoStr = fereLedger?.dpo != null ? `DPO: ${fereLedger.dpo}` : 'DPO: N/A';
    fields.workingCapital = build(
      wcFact?.value != null ? Number(wcFact.value) : ccc,
      'NO_WORKING_CAPITAL_DATA',
      wcFact?.periodType || 'ANNUAL',
      wcFact?.periodEnd || null,
      wcFact ? 'company_facts' : (ccc != null ? 'FEREEnrichedLedger' : null),
      wcFact ? (wcFact.provider || 'company_facts') : (ccc != null ? 'FERE_ENRICHED_LEDGER' : null),
      wcFact?.factId || null,
      wcFact?.availableAt || null,
      wcFact
        ? `Working Capital: ₹${Number(wcFact.value)} Cr${ccc != null ? `; CCC also available: ${ccc} days (${dsoStr}, ${dioStr}, ${dpoStr})` : ''}`
        : (ccc != null ? `Cash Conversion Cycle: ${ccc} days (${dsoStr}, ${dioStr}, ${dpoStr})` : null)
    );

    // --- K. Qualitative Outlook & Moat from Dossier ---
    const demand = dossierParsed?.catalystRadar?.nearTermTriggers?.[0] || dossierParsed?.catalystRadar?.mediumTermTailwinds?.[0] || null;
    fields.demandOutlook = build(
      demand,
      'NO_DEMAND_OUTLOOK_EVIDENCE',
      'POINT_IN_TIME',
      null,
      demand ? 'SecurityDossierSnapshots' : null,
      demand ? 'SECURITY_DOSSIER_SNAPSHOT' : null,
      null,
      null,
      demand ? 'Institutional catalyst radar' : null
    );

    const peerCtx = dossierParsed?.businessProfile?.marketPosition || null;
    fields.peerContext = build(
      peerCtx,
      'NO_PEER_CONTEXT_EVIDENCE',
      'POINT_IN_TIME',
      null,
      peerCtx ? 'SecurityDossierSnapshots' : null,
      peerCtx ? 'SECURITY_DOSSIER_SNAPSHOT' : null,
      null,
      null,
      peerCtx ? 'Market positioning and peer context' : null
    );

    const risks = dossierParsed?.thesis?.brutalBearAntithesis || null;
    fields.keyRisks = build(
      risks,
      'NO_RISK_EVIDENCE',
      'POINT_IN_TIME',
      null,
      risks ? 'SecurityDossierSnapshots' : null,
      risks ? 'SECURITY_DOSSIER_SNAPSHOT' : null,
      null,
      null,
      risks ? 'Operating & cyclical risk factors' : null
    );

    const watch = dossierParsed?.thesis?.invalidationTriggers?.[0] || dossierParsed?.catalystRadar?.nearTermTriggers?.[1] || null;
    fields.whatToWatchNext = build(
      watch,
      'NO_WATCH_EVIDENCE',
      'POINT_IN_TIME',
      null,
      watch ? 'SecurityDossierSnapshots' : null,
      watch ? 'SECURITY_DOSSIER_SNAPSHOT' : null,
      null,
      null,
      watch ? 'Execution checkpoints & invalidation triggers' : null
    );

    // --- L. Valuation: PEG Ratio ---
    let peg: number | null = null;
    let pegSource: string | null = null;
    let pegProvider: string | null = null;
    let pegFactId: string | null = null;
    let pegAvailableAt: string | null = null;

    const pegFacts = factsByMetric.get('peg_ratio') || [];
    if (pegFacts.length > 0 && pegFacts[0].value != null && Number(pegFacts[0].value) > 0) {
      peg = Number(pegFacts[0].value);
      pegSource = 'company_facts';
      pegProvider = pegFacts[0].provider || 'company_facts';
      pegFactId = pegFacts[0].factId || null;
      pegAvailableAt = pegFacts[0].availableAt || null;
    } else if (masterRow?.pe_ratio != null && masterRow?.profit_growth_5y_pct != null && masterRow.profit_growth_5y_pct > 0) {
      peg = Number((masterRow.pe_ratio / masterRow.profit_growth_5y_pct).toFixed(2));
      pegSource = 'DataQualityAuditLedger';
      pegProvider = 'DATA_QUALITY_AUDIT_LEDGER';
    }
    fields.pegRatio = build(
      peg,
      'NO_PEG_DATA',
      'TTM',
      null,
      pegSource,
      pegProvider,
      pegFactId,
      pegAvailableAt,
      peg != null ? `Price/Earnings to Growth Ratio: ${peg}` : null
    );

    // --- M. ROCE Consistency (Item 7: requires multi-year ROCE series >= 3 points; no single-period proxy) ---
    let roceConsistencyPct: number | null = null;
    const roceFacts = (factsByMetric.get('roce_reported') || factsByMetric.get('roce') || [])
      .filter(f => f.periodType === 'ANNUAL' && f.value != null);
    if (roceFacts.length >= 3) {
      const validPoints = roceFacts.map(f => Number(f.value));
      const passed = validPoints.filter(v => v >= 15).length;
      roceConsistencyPct = Number(((passed / validPoints.length) * 100).toFixed(1));
    }
    fields.roceConsistency = build(
      roceConsistencyPct,
      'NO_HISTORICAL_ROCE_SERIES',
      'ANNUAL',
      null,
      roceConsistencyPct != null ? 'company_facts' : null,
      roceConsistencyPct != null ? (roceFacts[0]?.provider || 'company_facts') : null,
      null,
      null,
      roceConsistencyPct != null ? `ROCE >= 15% in ${roceConsistencyPct}% of recorded annual periods (${roceFacts.length} years)` : null
    );

    // --- N. Margin Stability (Item 7: requires at least 4 quarterly margins and actual coefficient of variation) ---
    let marginStabilityPct: number | null = null;
    if (qHfs.length >= 4) {
      const opmValues = qHfs.map(q => Number(q.opm_pct)).filter(v => !isNaN(v));
      if (opmValues.length >= 4) {
        const mean = opmValues.reduce((acc, v) => acc + v, 0) / opmValues.length;
        if (mean > 0) {
          const variance = opmValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / opmValues.length;
          const stdDev = Math.sqrt(variance);
          const cv = stdDev / mean;
          marginStabilityPct = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
        }
      }
    }
    fields.marginStability = build(
      marginStabilityPct,
      'NO_MULTI_QUARTER_MARGIN_DATA',
      'QUARTERLY',
      null,
      marginStabilityPct != null ? 'HistoricalFinancialStatements' : null,
      marginStabilityPct != null ? (qHfs[0]?.primary_source || 'HISTORICAL_FINANCIAL_STATEMENTS') : null,
      null,
      null,
      marginStabilityPct != null ? `Operating margin stability score: ${marginStabilityPct}/100 over ${qHfs.length} quarters` : null
    );

        // --- O. Free Cash Flow & FCF Yield ---
    let fcfVal: number | null = null;
    let fcfSourceTable: string | null = null;
    let fcfProvider: string | null = null;
    let fcfFactId: string | null = null;
    let fcfPeriodType: string | null = null;
    let fcfPeriodEnd: string | null = null;
    let fcfAvailableAt: string | null = null;

    // Real capex facts only: capex_cash_outflow or capex.
    // Total investing cash flow is NOT accepted as capex.
    const capexFacts = (factsByMetric.get('capex_cash_outflow') || factsByMetric.get('capex') || [])
      .filter(f => f.value != null && !isNaN(Number(f.value)));

    for (const cfoF of cfoFacts) {
      if (cfoF.value == null || isNaN(Number(cfoF.value))) continue;
      const cpF = capexFacts.find(cp => cp.periodEnd === cfoF.periodEnd && cp.periodType === cfoF.periodType);
      if (cpF) {
        const cfoNum = Number(cfoF.value);
        const capexNum = Math.abs(Number(cpF.value));
        fcfVal = Number((cfoNum - capexNum).toFixed(2));
        fcfSourceTable = 'company_facts';
        fcfProvider = cfoF.provider || cpF.provider || 'company_facts';
        fcfFactId = cfoF.factId && cpF.factId ? `${cfoF.factId}+${cpF.factId}` : (cfoF.factId || cpF.factId || null);
        fcfPeriodType = cfoF.periodType;
        fcfPeriodEnd = cfoF.periodEnd;
        fcfAvailableAt = cfoF.availableAt || cpF.availableAt || null;
        if (cfoF.factId) evidenceIds.push(cfoF.factId);
        if (cpF.factId) evidenceIds.push(cpF.factId);
        break;
      }
    }

    fields.freeCashFlow = build(
      fcfVal,
      'NO_MATCHED_CFO_AND_CAPEX',
      fcfPeriodType,
      fcfPeriodEnd,
      fcfSourceTable,
      fcfProvider,
      fcfFactId,
      fcfAvailableAt,
      fcfVal != null ? `Free Cash Flow: ₹${fcfVal} Cr (CFO - Capex Outflow)` : null,
      fcfVal != null ? 'cfo - Math.abs(capex_cash_outflow)' : null
    );

    // FCF Yield calculation: requires FCF and positive market cap
    let fcfYieldVal: number | null = null;
    let fcfYieldMissingReason = 'NO_MATCHED_CFO_AND_CAPEX';
    let marketCap = masterRow?.market_cap_cr != null 
      ? Number(masterRow.market_cap_cr) 
      : (masterRow?.market_cap != null ? Number(masterRow.market_cap) : null);
    if (marketCap == null) {
      const mcapFact = (factsByMetric.get('market_cap_cr') || [])[0];
      if (mcapFact?.value != null && Number(mcapFact.value) > 0) {
        marketCap = Number(mcapFact.value);
      }
    }

    if (fcfVal !== null) {
      if (marketCap != null && marketCap > 0) {
        fcfYieldVal = Number(((fcfVal / marketCap) * 100).toFixed(2));
      } else {
        fcfYieldMissingReason = 'NO_MARKET_CAP_FOR_FCF_YIELD';
      }
    }

    fields.fcfYield = build(
      fcfYieldVal,
      fcfYieldMissingReason,
      fcfPeriodType,
      fcfPeriodEnd,
      fcfYieldVal != null ? 'company_facts' : null,
      fcfYieldVal != null ? fcfProvider : null,
      fcfYieldVal != null ? fcfFactId : null,
      fcfYieldVal != null ? fcfAvailableAt : null,
      fcfYieldVal != null ? `FCF Yield: ${fcfYieldVal}% on Market Cap ₹${marketCap} Cr` : null,
      fcfYieldVal != null ? '(freeCashFlow / marketCap) * 100' : null
    );

    
    // --- P. ROE (from masterRow or company_facts roe_pct) ---
    let roeVal = masterRow?.roe_pct ?? null;
    let roeSource = roeVal != null ? 'DataQualityAuditLedger' : null;
    let roeProvider = roeVal != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
    let roePeriod = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;
    if (roeVal == null) {
      const roeFacts = (factsByMetric.get('roe_pct') || factsByMetric.get('roe') || [])
        .filter(f => f.value != null && !isNaN(Number(f.value)));
      if (roeFacts.length > 0) {
        roeVal = Number(roeFacts[0].value);
        roeSource = 'company_facts';
        roeProvider = roeFacts[0].provider || 'company_facts';
        roePeriod = roeFacts[0].periodEnd ? `${roeFacts[0].periodEnd} (${roeFacts[0].periodType || 'TTM'})` : null;
      }
    }
    fields.roe = build(
      roeVal,
      'NO_ROE',
      roePeriod,
      null,
      roeSource,
      roeProvider,
      null,
      null,
      roeVal != null ? `Return on Equity: ${roeVal}%` : null
    );

    // --- Q. Operating Profit & PAT (from masterRow or HistoricalFinancialStatements) ---
    let opProfitVal = masterRow?.latest_op_profit_cr ?? null;
    let opProfitSource = opProfitVal != null ? 'DataQualityAuditLedger' : null;
    let opProfitProvider = opProfitVal != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
    let opProfitPeriod = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;

    if (opProfitVal == null && hfsRows.length > 0) {
      const validOpHfs = hfsRows.filter(h => h.operating_profit_cr != null);
      if (validOpHfs.length > 0) {
        const latestH = validOpHfs[validOpHfs.length - 1];
        opProfitVal = Number(latestH.operating_profit_cr);
        opProfitSource = 'HistoricalFinancialStatements';
        opProfitProvider = latestH.primary_source || 'HISTORICAL_FINANCIAL_STATEMENTS';
        opProfitPeriod = latestH.period_label || latestH.period_date || null;
      }
    }
    if (opProfitVal == null) {
      const opFact = latestNumericFact(['operating_profit', 'operating_profit_cr'], ['QUARTERLY', 'ANNUAL', 'TTM']);
      if (opFact) {
        opProfitVal = Number(opFact.value);
        opProfitSource = 'company_facts';
        opProfitProvider = opFact.provider || 'company_facts';
        opProfitPeriod = opFact.periodEnd ? `${opFact.periodEnd} (${opFact.periodType || 'LATEST'})` : null;
      }
    }
    fields.operatingProfit = build(
      opProfitVal,
      'NO_OP_PROFIT',
      opProfitPeriod,
      null,
      opProfitSource,
      opProfitProvider,
      null,
      null,
      opProfitVal != null ? `Operating Profit: ₹${opProfitVal} Cr` : null
    );

    let patVal = masterRow?.latest_pat_cr ?? null;
    let patSource = patVal != null ? 'DataQualityAuditLedger' : null;
    let patProvider = patVal != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
    let patPeriod = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;

    if (patVal == null && hfsRows.length > 0) {
      const validPatHfs = hfsRows.filter(h => h.net_profit_pat_cr != null);
      if (validPatHfs.length > 0) {
        const latestH = validPatHfs[validPatHfs.length - 1];
        patVal = Number(latestH.net_profit_pat_cr);
        patSource = 'HistoricalFinancialStatements';
        patProvider = latestH.primary_source || 'HISTORICAL_FINANCIAL_STATEMENTS';
        patPeriod = latestH.period_label || latestH.period_date || null;
      }
    }
    if (patVal == null) {
      const patFact = latestNumericFact(['pat', 'net_profit', 'reported_pat'], ['QUARTERLY', 'ANNUAL', 'TTM']);
      if (patFact) {
        patVal = Number(patFact.value);
        patSource = 'company_facts';
        patProvider = patFact.provider || 'company_facts';
        patPeriod = patFact.periodEnd ? `${patFact.periodEnd} (${patFact.periodType || 'LATEST'})` : null;
      }
    }
    fields.pat = build(
      patVal,
      'NO_PAT',
      patPeriod,
      null,
      patSource,
      patProvider,
      null,
      null,
      patVal != null ? `Profit After Tax: ₹${patVal} Cr` : null
    );

    // --- R. ROCE (from masterRow or company_facts: roce_reported, roce, rocea) ---
    let roceVal = masterRow?.roce_pct ?? null;
    let roceSource = roceVal != null ? 'DataQualityAuditLedger' : null;
    let roceProvider = roceVal != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
    let rocePeriod = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;
    if (roceVal == null) {
      const rFacts = (factsByMetric.get('roce_reported') || factsByMetric.get('roce') || factsByMetric.get('rocea') || [])
        .filter(f => f.value != null && !isNaN(Number(f.value)));
      if (rFacts.length > 0) {
        roceVal = Number(rFacts[0].value);
        roceSource = 'company_facts';
        roceProvider = rFacts[0].provider || 'company_facts';
        rocePeriod = rFacts[0].periodEnd ? `${rFacts[0].periodEnd} (${rFacts[0].periodType || 'ANNUAL'})` : null;
      }
    }
    fields.roce = build(
      roceVal,
      'NO_ROCE',
      rocePeriod,
      null,
      roceSource,
      roceProvider,
      null,
      null,
      roceVal != null ? `Return on Capital Employed: ${roceVal}%` : null
    );

    // --- S. Debt to Equity (from masterRow or company_facts: debt_to_equity_reported, debt_to_equity, debtcea) ---
    let deVal = masterRow?.debt_to_equity ?? null;
    let deSource = deVal != null ? 'DataQualityAuditLedger' : null;
    let deProvider = deVal != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
    let dePeriod = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;
    if (deVal == null) {
      const deFacts = (factsByMetric.get('debt_to_equity_reported') || factsByMetric.get('debt_to_equity') || factsByMetric.get('debtcea') || [])
        .filter(f => f.value != null && !isNaN(Number(f.value)));
      if (deFacts.length > 0) {
        deVal = Number(deFacts[0].value);
        deSource = 'company_facts';
        deProvider = deFacts[0].provider || 'company_facts';
        dePeriod = deFacts[0].periodEnd ? `${deFacts[0].periodEnd} (${deFacts[0].periodType || 'ANNUAL'})` : null;
      }
    }
    fields.debtToEquity = build(
      deVal,
      'NO_DEBT_RATIO',
      dePeriod,
      null,
      deSource,
      deProvider,
      null,
      null,
      deVal != null ? `Debt to Equity Ratio: ${deVal}` : null
    );

    // --- T. Total Borrowings (from masterRow or company_facts: total_debt, borrowings, borrowingsa) ---
    let tbVal = masterRow?.total_borrowings_cr ?? null;
    let tbSource = tbVal != null ? 'DataQualityAuditLedger' : null;
    let tbProvider = tbVal != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
    let tbPeriod = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;
    if (tbVal == null) {
      const tbFact = latestNumericFact(['total_debt', 'borrowings', 'borrowingsa', 'net_debt', 'total_borrowings_cr'], ['ANNUAL', 'QUARTERLY', 'TTM']);
      if (tbFact) {
        tbVal = Number(tbFact.value);
        tbSource = 'company_facts';
        tbProvider = tbFact.provider || 'company_facts';
        tbPeriod = tbFact.periodEnd ? `${tbFact.periodEnd} (${tbFact.periodType || 'ANNUAL'})` : null;
      }
    }
    fields.totalBorrowings = build(
      tbVal,
      'NO_BORROWINGS_DATA',
      tbPeriod,
      null,
      tbSource,
      tbProvider,
      null,
      null,
      tbVal != null ? `Total Borrowings: ₹${tbVal} Cr` : null
    );

    // --- U. Price to Earnings (PE) ---
    let peVal = masterRow?.pe_ratio ?? null;
    let peSource = peVal != null ? 'DataQualityAuditLedger' : null;
    let peProvider = peVal != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
    let pePeriod = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;
    if (peVal == null) {
      const peFacts = (factsByMetric.get('pe_ratio') || factsByMetric.get('pettm') || [])
        .filter(f => f.value != null && !isNaN(Number(f.value)));
      if (peFacts.length > 0) {
        peVal = Number(peFacts[0].value);
        peSource = 'company_facts';
        peProvider = peFacts[0].provider || 'company_facts';
        pePeriod = peFacts[0].periodEnd ? `${peFacts[0].periodEnd} (${peFacts[0].periodType || 'TTM'})` : null;
      }
    }
    fields.pe = build(
      peVal,
      'NO_PE',
      pePeriod,
      null,
      peSource,
      peProvider,
      null,
      null,
      peVal != null ? `Price to Earnings: ${peVal}` : null
    );

    // --- V. Additional Basic Facts (CFO, Promoter, FII, DII, 5Y CAGR) ---
    const getScalarFact = (keys: string[], masterVal: any) => {
      let val = masterVal ?? null;
      let source = val != null ? 'DataQualityAuditLedger' : null;
      let provider = val != null ? 'DATA_QUALITY_AUDIT_LEDGER' : null;
      let period = masterRow?.as_of_quarter ? `${masterRow.as_of_quarter} ${masterRow.as_of_year || ''}`.trim() : null;
      if (val == null) {
        for (const k of keys) {
          const f = (factsByMetric.get(k) || []).filter((x: any) => x.value != null && !isNaN(Number(x.value)));
          if (f.length > 0) {
            val = Number(f[0].value);
            source = 'company_facts';
            provider = f[0].provider || 'company_facts';
            period = f[0].periodEnd ? `${f[0].periodEnd} (${f[0].periodType || 'TTM'})` : null;
            break;
          }
        }
      }
      return { val, source, provider, period };
    };

    const cfoData = getScalarFact(['cfo', 'cfo_cr'], masterRow?.cfo_cr);
    fields.cfo = build(cfoData.val, 'NO_CFO_DATA', cfoData.period, null, cfoData.source, cfoData.provider, null, null, cfoData.val != null ? `CFO: ₹${cfoData.val} Cr` : null);

    const promData = getScalarFact(['promoter_holding', 'promoter_pct'], masterRow?.promoter_pct);
    fields.promoterHolding = build(promData.val, 'NO_PROMOTER_HOLDING', promData.period, null, promData.source, promData.provider, null, null, promData.val != null ? `Promoter Holding: ${promData.val}%` : null);

    const fiiData = getScalarFact(['fii_holding', 'fii_pct'], masterRow?.fii_pct);
    fields.fiiHolding = build(fiiData.val, 'NO_FII_DATA', fiiData.period, null, fiiData.source, fiiData.provider, null, null, fiiData.val != null ? `FII Holding: ${fiiData.val}%` : null);

    const diiData = getScalarFact(['dii_holding', 'dii_pct'], masterRow?.dii_pct);
    fields.diiHolding = build(diiData.val, 'NO_DII_DATA', diiData.period, null, diiData.source, diiData.provider, null, null, diiData.val != null ? `DII Holding: ${diiData.val}%` : null);

    const cagr5yData = getScalarFact(['sales_growth_5y', 'sales_growth_5y_pct'], masterRow?.sales_growth_5y_pct);
    fields.salesGrowth5y = build(cagr5yData.val, 'NO_SALES_GROWTH_5Y', '5-Year CAGR', cagr5yData.period || null, cagr5yData.source, cagr5yData.provider, null, null, cagr5yData.val != null ? `5-Year CAGR: ${cagr5yData.val}%` : null);


    // Build QGLP inputs (Item 7: strict absence of proxy values)
    const qglpInputs = {
      roePct: roeVal,
      rocePct: roceVal,
      cfoToPatPct: cfoToPat,
      cfoToOperatingProfitPct: cfoToOp,
      debtToEquity: deVal,
      promoterPledgePct: pledge,
      profitableQuarterCount: profQuarters,
      salesCagr3yPct: salesCagrRes?.value ?? null,
      profitCagr3yPct: patCagrRes?.value ?? null,
      profitableYears: profYears,
      positiveCfoYears: posCfoYears,
      roceConsistencyPct: roceConsistencyPct,
      marginStabilityPct: marginStabilityPct,
      peVsHistoryPct: null,
      peVsSectorPct: null,
      peg: peg,
      fcfYieldPct: fcfYieldVal,
      evidenceIds
    };

    return { fields, qglpInputs };
  }
}
