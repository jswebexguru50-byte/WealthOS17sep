/**
 * TrendlyneMetricCatalog.ts — Ranked Metric Catalog and Dense 50-Pack Constructor
 * WealthOS V2 Mandatory Amendment — Trendlyne MCP Capacity Utilization
 */

import crypto from 'crypto';
import { TrendlyneMetricDefinition, TrendlynePack } from './TrendlyneContracts.js';

export class TrendlyneMetricCatalog {
  private static instance: TrendlyneMetricCatalog;
  private readonly catalog: Map<string, TrendlyneMetricDefinition> = new Map();

  private constructor() {
    this.initializeDefaultCatalog();
  }

  public static getInstance(): TrendlyneMetricCatalog {
    if (!TrendlyneMetricCatalog.instance) {
      TrendlyneMetricCatalog.instance = new TrendlyneMetricCatalog();
    }
    return TrendlyneMetricCatalog.instance;
  }

  public registerMetric(metric: TrendlyneMetricDefinition): void {
    this.catalog.set(metric.providerMetricId, metric);
  }

  public getMetric(metricId: string): TrendlyneMetricDefinition | undefined {
    return this.catalog.get(metricId);
  }

  public getAllMetrics(): TrendlyneMetricDefinition[] {
    return Array.from(this.catalog.values());
  }

  /**
   * Retrieves useful metrics sorted by importance and expected coverage.
   */
  public getRankedUsefulMetrics(archetype?: string): TrendlyneMetricDefinition[] {
    const importanceWeight: Record<string, number> = {
      MANDATORY: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    return this.getAllMetrics()
      .filter((m) => {
        if (m.mappingStatus === 'REJECTED') return false;
        if (!archetype || archetype === 'ALL') return true;
        return (
          m.applicableArchetypes.includes('ALL') ||
          m.applicableArchetypes.includes(archetype)
        );
      })
      .sort((a, b) => {
        const diff = (importanceWeight[b.importance] || 0) - (importanceWeight[a.importance] || 0);
        if (diff !== 0) return diff;
        return (b.expectedCoverage ?? 0.5) - (a.expectedCoverage ?? 0.5);
      });
  }

  /**
   * Builds dense 50-metric transport packs ordered by investment usefulness.
   * Every normal pack MUST contain exactly 50 metrics.
   * Only the final residual pack may contain fewer than 50.
   */
  public buildDense50Packs(metrics: TrendlyneMetricDefinition[], packPrefix = 'TL_DENSE'): TrendlynePack[] {
    const packs: TrendlynePack[] = [];
    const packSize = 50;

    for (let i = 0; i < metrics.length; i += packSize) {
      const chunk = metrics.slice(i, i + packSize);
      const metricIds = chunk.map((m) => m.providerMetricId);
      const sortedIds = [...metricIds].sort();
      const packHash = crypto.createHash('sha256').update(sortedIds.join('|')).digest('hex');
      const packIndex = Math.floor(i / packSize) + 1;
      const packId = `${packPrefix}_${String(packIndex).padStart(3, '0')}`;

      packs.push({
        packId,
        packVersion: 1,
        packHash,
        metricCount: chunk.length,
        metricIds,
        createdAt: new Date().toISOString(),
      });
    }

    return packs;
  }

  /**
   * Builds a dense 50-metric archetype pack.
   * If sector-specific metrics < 50, fills remaining slots with compatible universal metrics.
   */
  public buildArchetypeDensePack(
    archetype: string,
    sectorSpecificMetrics: TrendlyneMetricDefinition[],
    universalMetrics: TrendlyneMetricDefinition[],
    alreadySelectedMetricIds: Set<string> = new Set()
  ): TrendlynePack {
    const packSize = 50;
    const selected: string[] = [];

    // 1. Add eligible sector-specific metrics
    for (const m of sectorSpecificMetrics) {
      if (selected.length >= packSize) break;
      if (!alreadySelectedMetricIds.has(m.providerMetricId)) {
        selected.push(m.providerMetricId);
      }
    }

    // 2. Fill remaining slots with compatible universal metrics
    if (selected.length < packSize) {
      for (const m of universalMetrics) {
        if (selected.length >= packSize) break;
        if (!selected.includes(m.providerMetricId) && !alreadySelectedMetricIds.has(m.providerMetricId)) {
          selected.push(m.providerMetricId);
        }
      }
    }

    const sortedIds = [...selected].sort();
    const packHash = crypto.createHash('sha256').update(sortedIds.join('|')).digest('hex');

    return {
      packId: `TL_${archetype}_001`,
      packVersion: 1,
      packHash,
      metricCount: selected.length,
      metricIds: selected,
      createdAt: new Date().toISOString(),
      archetype,
    };
  }

  private initializeDefaultCatalog(): void {
    const coreMetrics: Array<Partial<TrendlyneMetricDefinition> & { providerMetricId: string; providerLabel: string }> = [
      // 1. Core Financials & P&L (1-15)
      { providerMetricId: 'reportedpatq', providerLabel: 'Reported Net Profit Quarterly', canonicalMetric: 'pat_cr', applicableArchetypes: ['ALL'], usefulFor: ['profitability'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'totalsrq', providerLabel: 'Total Sales / Revenue Quarterly', canonicalMetric: 'revenue_cr', applicableArchetypes: ['ALL'], usefulFor: ['growth'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'opq', providerLabel: 'Operating Profit Quarterly', canonicalMetric: 'ebitda_cr', applicableArchetypes: ['NON_FINANCIAL', 'INDUSTRIAL', 'IT_SERVICES'], usefulFor: ['operating_performance'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'opa', providerLabel: 'Operating Profit Annual', canonicalMetric: 'ebitda_annual_cr', applicableArchetypes: ['NON_FINANCIAL', 'INDUSTRIAL', 'IT_SERVICES'], usefulFor: ['operating_performance'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'opma', providerLabel: 'Operating Profit Margin Annual %', canonicalMetric: 'ebitda_margin_pct', applicableArchetypes: ['NON_FINANCIAL', 'INDUSTRIAL', 'IT_SERVICES'], usefulFor: ['margin'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'roea', providerLabel: 'Return on Equity Annual %', canonicalMetric: 'roe_pct', applicableArchetypes: ['ALL'], usefulFor: ['profitability', 'quality'], importance: 'MANDATORY', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'rocea', providerLabel: 'Return on Capital Employed Annual %', canonicalMetric: 'roce_pct', applicableArchetypes: ['NON_FINANCIAL', 'INDUSTRIAL'], usefulFor: ['capital_efficiency'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'roica', providerLabel: 'Return on Invested Capital Annual %', canonicalMetric: 'roic_pct', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['capital_efficiency'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'roaa', providerLabel: 'Return on Assets Annual %', canonicalMetric: 'roa_pct', applicableArchetypes: ['ALL'], usefulFor: ['asset_efficiency'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'npq', providerLabel: 'Net Profit Quarterly (Consolidated)', canonicalMetric: 'net_profit_q_cr', applicableArchetypes: ['ALL'], usefulFor: ['profitability'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'ebita', providerLabel: 'EBIT Annual', canonicalMetric: 'ebit_cr', applicableArchetypes: ['ALL'], usefulFor: ['operating_performance'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.94 },
      { providerMetricId: 'cepsa', providerLabel: 'Cash EPS Annual', canonicalMetric: 'cash_eps', applicableArchetypes: ['ALL'], usefulFor: ['cash_flow'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'INR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'extraordinaryitemqmq6', providerLabel: 'Extraordinary Items History', canonicalMetric: 'extraordinary_items_cr', applicableArchetypes: ['ALL'], usefulFor: ['forensic', 'earnings_quality'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },

      // 2. Valuation & Market Data (16-25)
      { providerMetricId: 'currentprice', providerLabel: 'Current Market Price', canonicalMetric: 'cmp', applicableArchetypes: ['ALL'], usefulFor: ['market_pricing'], importance: 'MANDATORY', historical: false, periodType: 'LATEST', unit: 'INR', mappingStatus: 'VERIFIED', expectedCoverage: 1.0 },
      { providerMetricId: 'mcapq', providerLabel: 'Market Capitalization', canonicalMetric: 'market_cap_cr', applicableArchetypes: ['ALL'], usefulFor: ['size', 'valuation'], importance: 'MANDATORY', historical: false, periodType: 'LATEST', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 1.0 },
      { providerMetricId: 'pettm', providerLabel: 'P/E TTM', canonicalMetric: 'pe_ttm', applicableArchetypes: ['ALL'], usefulFor: ['valuation'], importance: 'MANDATORY', historical: false, periodType: 'TTM', unit: 'RATIO', mappingStatus: 'VERIFIED', expectedCoverage: 0.97 },
      { providerMetricId: 'bvshq', providerLabel: 'Book Value Per Share Quarterly', canonicalMetric: 'book_value_per_share', applicableArchetypes: ['ALL'], usefulFor: ['valuation'], importance: 'HIGH', historical: false, periodType: 'QUARTERLY', unit: 'INR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'debtcea', providerLabel: 'Debt to Equity Annual', canonicalMetric: 'debt_to_equity', applicableArchetypes: ['NON_FINANCIAL', 'INDUSTRIAL'], usefulFor: ['leverage', 'solvency'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'RATIO', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'ltdea', providerLabel: 'Long Term Debt to Equity Annual', canonicalMetric: 'long_term_debt_equity', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['leverage'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'RATIO', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'netdebta', providerLabel: 'Net Debt Annual', canonicalMetric: 'net_debt_cr', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['leverage', 'solvency'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'dividendpayout', providerLabel: 'Dividend Payout Ratio %', canonicalMetric: 'dividend_payout_pct', applicableArchetypes: ['ALL'], usefulFor: ['capital_return'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'dividendpayoutnpa', providerLabel: 'Dividend Payout from Net Profit', canonicalMetric: 'dividend_payout_np', applicableArchetypes: ['ALL'], usefulFor: ['capital_return'], importance: 'LOW', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.88 },
      { providerMetricId: 'dividendpersharea', providerLabel: 'Dividend Per Share Annual', canonicalMetric: 'dps', applicableArchetypes: ['ALL'], usefulFor: ['capital_return'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'INR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },

      // 3. Cash Flow & Working Capital (26-35)
      { providerMetricId: 'cfoa', providerLabel: 'Cash Flow from Operating Activities Annual', canonicalMetric: 'cfo_cr', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['cash_flow', 'earnings_quality'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'cfoagrowth', providerLabel: 'CFO Annual Growth %', canonicalMetric: 'cfo_growth_pct', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['cash_flow_growth'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.88 },
      { providerMetricId: 'ncfa', providerLabel: 'Net Cash Flow Annual', canonicalMetric: 'net_cash_flow_cr', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['cash_flow'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'capitalexpenditurea', providerLabel: 'Capital Expenditure Annual', canonicalMetric: 'capex_cr', applicableArchetypes: ['NON_FINANCIAL', 'INDUSTRIAL'], usefulFor: ['capex', 'free_cash_flow'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'wcq', providerLabel: 'Working Capital Quarterly', canonicalMetric: 'working_capital_cr', applicableArchetypes: ['NON_FINANCIAL', 'INDUSTRIAL'], usefulFor: ['liquidity', 'working_capital'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.88 },
      { providerMetricId: 'inventoriesq', providerLabel: 'Inventories Quarterly', canonicalMetric: 'inventory_cr', applicableArchetypes: ['INDUSTRIAL', 'AUTO', 'CONSUMER', 'PHARMA'], usefulFor: ['working_capital'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },
      { providerMetricId: 'finishedgoodsq', providerLabel: 'Finished Goods Inventory Quarterly', canonicalMetric: 'finished_goods_cr', applicableArchetypes: ['INDUSTRIAL', 'AUTO'], usefulFor: ['working_capital', 'forensic'], importance: 'LOW', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.80 },
      { providerMetricId: 'tradereceivablesa', providerLabel: 'Trade Receivables Annual', canonicalMetric: 'trade_receivables_cr', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['forensic', 'working_capital'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'contingentliabilitiesa', providerLabel: 'Contingent Liabilities Annual', canonicalMetric: 'contingent_liabilities_cr', applicableArchetypes: ['ALL'], usefulFor: ['governance', 'forensic'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.88 },
      { providerMetricId: 'currentdebtcapleaseobligationa', providerLabel: 'Current Debt & Lease Obligations', canonicalMetric: 'current_lease_debt_cr', applicableArchetypes: ['NON_FINANCIAL'], usefulFor: ['solvency'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },

      // 4. Ownership & Forensic (36-50)
      { providerMetricId: 'prompct', providerLabel: 'Promoter Holding %', canonicalMetric: 'promoter_holding_pct', applicableArchetypes: ['ALL'], usefulFor: ['ownership'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.99 },
      { providerMetricId: 'prompct1q', providerLabel: 'Promoter Holding QoQ Change %', canonicalMetric: 'promoter_change_qoq', applicableArchetypes: ['ALL'], usefulFor: ['ownership_trend'], importance: 'HIGH', historical: false, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'prompledge', providerLabel: 'Promoter Pledged Shares %', canonicalMetric: 'promoter_pledge_pct', applicableArchetypes: ['ALL'], usefulFor: ['governance', 'risk'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.99 },
      { providerMetricId: 'prompledge1q', providerLabel: 'Promoter Pledge QoQ Change %', canonicalMetric: 'promoter_pledge_change_qoq', applicableArchetypes: ['ALL'], usefulFor: ['governance_trend'], importance: 'HIGH', historical: false, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'fiihold', providerLabel: 'FII Holding %', canonicalMetric: 'fii_holding_pct', applicableArchetypes: ['ALL'], usefulFor: ['institutional_ownership'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'fiipct1q', providerLabel: 'FII Holding QoQ Change %', canonicalMetric: 'fii_change_qoq', applicableArchetypes: ['ALL'], usefulFor: ['institutional_trend'], importance: 'HIGH', historical: false, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'instihold', providerLabel: 'Institutional Holding %', canonicalMetric: 'institutional_holding_pct', applicableArchetypes: ['ALL'], usefulFor: ['institutional_ownership'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'instipct1q', providerLabel: 'Institutional Holding QoQ Change %', canonicalMetric: 'institutional_change_qoq', applicableArchetypes: ['ALL'], usefulFor: ['institutional_trend'], importance: 'MEDIUM', historical: false, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'mfhold', providerLabel: 'Mutual Fund Holding %', canonicalMetric: 'mf_holding_pct', applicableArchetypes: ['ALL'], usefulFor: ['domestic_institutional'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'mfpct1q', providerLabel: 'Mutual Fund QoQ Change %', canonicalMetric: 'mf_change_qoq', applicableArchetypes: ['ALL'], usefulFor: ['domestic_trend'], importance: 'MEDIUM', historical: false, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'prompct4q', providerLabel: 'Promoter Holding 1-Year Change %', canonicalMetric: 'promoter_change_1y', applicableArchetypes: ['ALL'], usefulFor: ['ownership_trend'], importance: 'MEDIUM', historical: false, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'fiipct4q', providerLabel: 'FII Holding 1-Year Change %', canonicalMetric: 'fii_change_1y', applicableArchetypes: ['ALL'], usefulFor: ['institutional_trend'], importance: 'MEDIUM', historical: false, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'pubpct', providerLabel: 'Public Holding %', canonicalMetric: 'public_holding_pct', applicableArchetypes: ['ALL'], usefulFor: ['ownership'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'insiderpinvokedyesterday', providerLabel: 'Insider Pledge Invoked Yesterday', canonicalMetric: 'insider_pledge_invoked', applicableArchetypes: ['ALL'], usefulFor: ['forensic', 'governance'], importance: 'MEDIUM', historical: false, periodType: 'LATEST', unit: 'COUNT', mappingStatus: 'VERIFIED', expectedCoverage: 0.80 },
      { providerMetricId: 'pitroskif', providerLabel: 'Piotroski F-Score', canonicalMetric: 'piotroski_f_score', applicableArchetypes: ['ALL'], usefulFor: ['quality', 'forensic'], importance: 'HIGH', historical: false, periodType: 'LATEST', unit: 'SCORE', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },

      // 5. Growth & Profit History (51-60)
      { providerMetricId: 'npqmq1', providerLabel: 'Net Profit 1 Quarter Ago', canonicalMetric: 'net_profit_q1', applicableArchetypes: ['ALL'], usefulFor: ['growth_depth'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'npqmq2', providerLabel: 'Net Profit 2 Quarters Ago', canonicalMetric: 'net_profit_q2', applicableArchetypes: ['ALL'], usefulFor: ['growth_depth'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'npqmq3', providerLabel: 'Net Profit 3 Quarters Ago', canonicalMetric: 'net_profit_q3', applicableArchetypes: ['ALL'], usefulFor: ['growth_depth'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'npqmy1', providerLabel: 'Net Profit 1 Year Ago (YoY)', canonicalMetric: 'net_profit_yoy', applicableArchetypes: ['ALL'], usefulFor: ['growth_depth'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'npqmq5', providerLabel: 'Net Profit 5 Quarters Ago', canonicalMetric: 'net_profit_q5', applicableArchetypes: ['ALL'], usefulFor: ['growth_depth'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'npqmq6', providerLabel: 'Net Profit 6 Quarters Ago', canonicalMetric: 'net_profit_q6', applicableArchetypes: ['ALL'], usefulFor: ['growth_depth'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'npqmq7', providerLabel: 'Net Profit 7 Quarters Ago', canonicalMetric: 'net_profit_q7', applicableArchetypes: ['ALL'], usefulFor: ['growth_depth'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'insidersellmonthplustoday', providerLabel: 'Insider Sell Month + Today', canonicalMetric: 'insider_selling', applicableArchetypes: ['ALL'], usefulFor: ['forensic', 'governance'], importance: 'MEDIUM', historical: false, periodType: 'LATEST', unit: 'COUNT', mappingStatus: 'VERIFIED', expectedCoverage: 0.80 },
      { providerMetricId: 'delivery6mavg', providerLabel: 'Delivery % 6-Month Average', canonicalMetric: 'delivery_pct_avg_6m', applicableArchetypes: ['ALL'], usefulFor: ['institutional_conviction'], importance: 'MEDIUM', historical: false, periodType: 'LATEST', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },

      // 6. Sector Specific Metrics (Bank / NBFC) (61-70)
      { providerMetricId: 'gnpapct', providerLabel: 'Gross NPA %', canonicalMetric: 'gnpa_pct', applicableArchetypes: ['BANK', 'NBFC'], usefulFor: ['asset_quality'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'nnpapct', providerLabel: 'Net NPA %', canonicalMetric: 'nnpa_pct', applicableArchetypes: ['BANK', 'NBFC'], usefulFor: ['asset_quality'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.98 },
      { providerMetricId: 'nimq', providerLabel: 'Net Interest Margin Quarterly %', canonicalMetric: 'nim_pct', applicableArchetypes: ['BANK', 'NBFC'], usefulFor: ['margin', 'banking'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'carq', providerLabel: 'Capital Adequacy Ratio %', canonicalMetric: 'car_pct', applicableArchetypes: ['BANK', 'NBFC'], usefulFor: ['solvency', 'banking'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'casapct', providerLabel: 'CASA Ratio %', canonicalMetric: 'casa_pct', applicableArchetypes: ['BANK'], usefulFor: ['deposit_quality', 'banking'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'costtoincome', providerLabel: 'Cost to Income Ratio %', canonicalMetric: 'cost_to_income_pct', applicableArchetypes: ['BANK', 'NBFC'], usefulFor: ['efficiency', 'banking'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'advancesgrowth', providerLabel: 'Advances Growth YoY %', canonicalMetric: 'advances_growth_pct', applicableArchetypes: ['BANK', 'NBFC'], usefulFor: ['credit_growth'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'depositgrowth', providerLabel: 'Deposit Growth YoY %', canonicalMetric: 'deposit_growth_pct', applicableArchetypes: ['BANK'], usefulFor: ['deposit_growth'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },
      { providerMetricId: 'pcrpct', providerLabel: 'Provision Coverage Ratio %', canonicalMetric: 'pcr_pct', applicableArchetypes: ['BANK', 'NBFC'], usefulFor: ['loss_absorption'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.95 },

      // 7. Sector Specific Metrics (Industrial / Manufacturing / Metals) (71-76)
      { providerMetricId: 'capacityutilization', providerLabel: 'Capacity Utilization %', canonicalMetric: 'capacity_utilization_pct', applicableArchetypes: ['INDUSTRIAL', 'METALS', 'AUTO'], usefulFor: ['operating_efficiency'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },
      { providerMetricId: 'orderbookcr', providerLabel: 'Order Book Size (Cr)', canonicalMetric: 'order_book_cr', applicableArchetypes: ['INDUSTRIAL'], usefulFor: ['visibility', 'revenue_runway'], importance: 'MANDATORY', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },
      { providerMetricId: 'orderinflowcr', providerLabel: 'Order Inflow Quarterly (Cr)', canonicalMetric: 'order_inflow_cr', applicableArchetypes: ['INDUSTRIAL'], usefulFor: ['growth_inflow'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },
      { providerMetricId: 'rawmaterialpctsales', providerLabel: 'Raw Material Cost % of Sales', canonicalMetric: 'raw_material_pct', applicableArchetypes: ['INDUSTRIAL', 'AUTO', 'METALS'], usefulFor: ['gross_margin'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },
      { providerMetricId: 'powerfuelpctsales', providerLabel: 'Power & Fuel Cost % of Sales', canonicalMetric: 'power_fuel_pct', applicableArchetypes: ['INDUSTRIAL', 'METALS'], usefulFor: ['energy_sensitivity'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.88 },
      { providerMetricId: 'assetturnovera', providerLabel: 'Fixed Asset Turnover Annual', canonicalMetric: 'asset_turnover', applicableArchetypes: ['INDUSTRIAL', 'AUTO', 'METALS'], usefulFor: ['capital_efficiency'], importance: 'HIGH', historical: true, periodType: 'ANNUAL', unit: 'RATIO', mappingStatus: 'VERIFIED', expectedCoverage: 0.92 },

      // 8. Sector Specific Metrics (IT Services) (77-81)
      { providerMetricId: 'attritionpct', providerLabel: 'LTM Attrition Rate %', canonicalMetric: 'attrition_pct', applicableArchetypes: ['IT_SERVICES'], usefulFor: ['talent_retention'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'utilizationpct', providerLabel: 'Employee Utilization Rate %', canonicalMetric: 'utilization_pct', applicableArchetypes: ['IT_SERVICES'], usefulFor: ['productivity'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.90 },
      { providerMetricId: 'offshoremixpct', providerLabel: 'Offshore Revenue Mix %', canonicalMetric: 'offshore_mix_pct', applicableArchetypes: ['IT_SERVICES'], usefulFor: ['delivery_mix'], importance: 'MEDIUM', historical: true, periodType: 'QUARTERLY', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },
      { providerMetricId: 'tcvdealscr', providerLabel: 'Total Contract Value (TCV) Deals', canonicalMetric: 'tcv_deals_cr', applicableArchetypes: ['IT_SERVICES'], usefulFor: ['deal_wins'], importance: 'HIGH', historical: true, periodType: 'QUARTERLY', unit: 'INR_CR', mappingStatus: 'VERIFIED', expectedCoverage: 0.88 },
      { providerMetricId: 'clientconcentrationtop10', providerLabel: 'Top 10 Clients Revenue Share %', canonicalMetric: 'client_concentration_top10', applicableArchetypes: ['IT_SERVICES'], usefulFor: ['concentration_risk'], importance: 'MEDIUM', historical: true, periodType: 'ANNUAL', unit: 'PERCENT', mappingStatus: 'VERIFIED', expectedCoverage: 0.85 },
    ];

    for (const m of coreMetrics) {
      this.registerMetric({
        providerMetricId: m.providerMetricId,
        providerLabel: m.providerLabel,
        canonicalMetric: m.canonicalMetric ?? null,
        applicableArchetypes: m.applicableArchetypes ?? ['ALL'],
        usefulFor: m.usefulFor ?? ['general'],
        importance: m.importance ?? 'MEDIUM',
        historical: m.historical ?? false,
        periodType: m.periodType ?? 'ANNUAL',
        unit: m.unit ?? null,
        mappingStatus: m.mappingStatus ?? 'VERIFIED',
        expectedCoverage: m.expectedCoverage ?? 0.9,
      });
    }
  }
}
