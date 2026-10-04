#!/usr/bin/env tsx
/**
 * scripts/fundamental/trendlyne_metric_pack_planner.ts
 *
 * Phase 4 — Trendlyne Capacity Utilization & Metric Pack Planner
 *
 * Requirements:
 * 1. Inspect missing fields from data gap inventory.
 * 2. Map missing fields to exact Trendlyne parameter tokens.
 * 3. Pack up to 50 metrics per call.
 * 4. Batch up to 10 symbols per call.
 * 5. Skip fresh complete symbols (15-day staleness threshold).
 * 6. Mark fields as SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE where provider lacks data.
 * 7. Output planned calls before executing.
 * 8. If --execute flag is passed, execute deterministic queries and persist to company_facts.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = path.resolve(process.cwd());
const inventoryPath = path.join(root, 'reports', 'data_quality', 'analyze360_missing_data_inventory.json');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');

export interface FieldMappingInfo {
  appField: string;
  trendlyneToken: string | null;
  providerLabel?: string;
  sourceCategory: 'TRENDLYNE_AVAILABLE' | 'SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE';
  alternativeSource?: string;
  periodType: 'ANNUAL' | 'QUARTERLY' | 'LATEST';
}

export const TRENDLYNE_FIELD_MAP: Record<string, FieldMappingInfo> = {
  // Annual statement & growth series
  revenueGrowth3Y: {
    appField: 'revenueGrowth3Y',
    trendlyneToken: 'sramy3', // sra, sramy1, sramy2, sramy3 give the 4 consecutive points
    providerLabel: 'Rev. Ann. 3Y ago',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  patGrowth3Y: {
    appField: 'patGrowth3Y',
    trendlyneToken: 'npamy3', // npa, npamy1, npamy2, npamy3 give the 4 consecutive points
    providerLabel: 'Net Profit Ann. 3Y Ago',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  operatingProfit: {
    appField: 'operatingProfit',
    trendlyneToken: 'opa',
    providerLabel: 'Operating Profit Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  pat: {
    appField: 'pat',
    trendlyneToken: 'npa',
    providerLabel: 'Net Profit Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  marginTrend: {
    appField: 'marginTrend',
    trendlyneToken: 'opmpctqmq1', // combined with opmpctq
    providerLabel: 'OPM 1Q ago %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  debtToEquity: {
    appField: 'debtToEquity',
    trendlyneToken: 'debtcea',
    providerLabel: 'Total Debt to Total Equity Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  totalBorrowings: {
    appField: 'totalBorrowings',
    trendlyneToken: 'borrowingsa',
    providerLabel: 'Borrowings Ann.',
    sourceCategory: 'SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE', // Trendlyne returns None for borrowingsa for most NSE firms
    alternativeSource: 'XBRL balance sheet / annual report',
    periodType: 'ANNUAL'
  },
  interestCoverage: {
    appField: 'interestCoverage',
    trendlyneToken: 'ica',
    providerLabel: 'Interest Coverage Ratio Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  cfo: {
    appField: 'cfo',
    trendlyneToken: 'cfoa',
    providerLabel: 'Cash from Operating Act. Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  freeCashFlow: {
    appField: 'freeCashFlow',
    trendlyneToken: 'capitalexpenditurea',
    providerLabel: 'Capex Ann.',
    sourceCategory: 'SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE', // Trendlyne capex is None for most NSE issuers
    alternativeSource: 'XBRL cash flow statement / annual report',
    periodType: 'ANNUAL'
  },
  promoterHolding: {
    appField: 'promoterHolding',
    trendlyneToken: 'prompct',
    providerLabel: 'Promoter holding latest %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  },
  promoterPledge: {
    appField: 'promoterPledge',
    trendlyneToken: 'prompledge',
    providerLabel: 'Promoter holding pledge % Qtr',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  fiiHolding: {
    appField: 'fiiHolding',
    trendlyneToken: 'fiihold',
    providerLabel: 'FII holding current Qtr %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  diiHolding: {
    appField: 'diiHolding',
    trendlyneToken: 'mfhold',
    providerLabel: 'MF holding current Qtr %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  fiiTrend: {
    appField: 'fiiTrend',
    trendlyneToken: 'fiipct1q',
    providerLabel: 'FII holding change QoQ %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  diiTrend: {
    appField: 'diiTrend',
    trendlyneToken: 'mfpct1q',
    providerLabel: 'MF holding change QoQ %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  roe: {
    appField: 'roe',
    trendlyneToken: 'roea',
    providerLabel: 'ROE Ann. %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  roce: {
    appField: 'roce',
    trendlyneToken: 'rocea',
    providerLabel: 'ROCE Ann. %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  pe: {
    appField: 'pe',
    trendlyneToken: 'pettm',
    providerLabel: 'PE TTM',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  },
  peg: {
    appField: 'peg',
    trendlyneToken: 'pegttm',
    providerLabel: 'PEG TTM',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  },
  marketCap: {
    appField: 'marketCap',
    trendlyneToken: 'mcapq',
    providerLabel: 'Market Cap',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  }
};

export const METRIC_PACK_CAPACITY = 50;
export const METRIC_PACK_USED = 50;
export const METRIC_PACK_UNUSED_REASON = 'FULLY_UTILIZED_WITH_VERIFIED_SAFE_TOKENS';

// Canonical 50-token dense pack covering all Trendlyne-supported reusable inputs.
// Keep this deterministic: every token here must either be explicitly promoted
// to canonical facts/statement tables or preserved in the raw provider snapshot.
export const CANONICAL_50_METRIC_PACK: string[] = [
  'sra', 'sramy1', 'sramy2', 'sramy3', 'totalsrq',
  'npa', 'npamy1', 'npamy2', 'npamy3', 'reportedpatq',
  'opa', 'opq', 'opmpctq', 'opmpctqmq1',
  'roea', 'rocea', 'debtcea', 'ica',
  'pettm', 'pegttm', 'pbva', 'mcapq',
  'prompct', 'prompledge', 'fiihold', 'mfhold',
  'fiipct1q', 'mfpct1q', 'cfoa', 'wcq',
  'currentprice', 'opma', 'roica', 'roaa', 'npq',
  'ebita', 'cepsa', 'ltdea', 'netdebta', 'dividendpayout',
  'dividendpersharea', 'cfoagrowth', 'ncfa', 'capitalexpenditurea',
  'inventoriesq', 'tradereceivablesa', 'contingentliabilitiesa',
  'prompct1q', 'prompledge1q', 'instihold'
];

// Backward-compatible alias for older imports/tests.
export const CANONICAL_30_METRIC_PACK = CANONICAL_50_METRIC_PACK;

export interface MetricTokenDestination {
  token: string;
  destination: 'company_facts' | 'HistoricalFinancialStatements' | 'fundamental_endpoint_snapshots';
  targetMetricOrColumn?: string;
  rationale: string;
}

export const METRIC_TOKEN_DESTINATIONS: Record<string, MetricTokenDestination> = {
  sra: { token: 'sra', destination: 'company_facts', targetMetricOrColumn: 'revenue', rationale: 'Annual revenue current fiscal year' },
  sramy1: { token: 'sramy1', destination: 'company_facts', targetMetricOrColumn: 'revenue', rationale: 'Annual revenue 1 year prior' },
  sramy2: { token: 'sramy2', destination: 'company_facts', targetMetricOrColumn: 'revenue', rationale: 'Annual revenue 2 years prior' },
  sramy3: { token: 'sramy3', destination: 'company_facts', targetMetricOrColumn: 'revenue', rationale: 'Annual revenue 3 years prior' },
  totalsrq: { token: 'totalsrq', destination: 'fundamental_endpoint_snapshots', rationale: 'captured_raw_snapshot: Quarterly total revenue raw payload' },
  npa: { token: 'npa', destination: 'company_facts', targetMetricOrColumn: 'pat', rationale: 'Annual net profit current fiscal year' },
  npamy1: { token: 'npamy1', destination: 'company_facts', targetMetricOrColumn: 'pat', rationale: 'Annual net profit 1 year prior' },
  npamy2: { token: 'npamy2', destination: 'company_facts', targetMetricOrColumn: 'pat', rationale: 'Annual net profit 2 years prior' },
  npamy3: { token: 'npamy3', destination: 'company_facts', targetMetricOrColumn: 'pat', rationale: 'Annual net profit 3 years prior' },
  reportedpatq: { token: 'reportedpatq', destination: 'fundamental_endpoint_snapshots', rationale: 'captured_raw_snapshot: Quarterly reported PAT raw payload' },
  opa: { token: 'opa', destination: 'company_facts', targetMetricOrColumn: 'operating_profit', rationale: 'Annual operating profit current fiscal year' },
  opq: { token: 'opq', destination: 'company_facts', targetMetricOrColumn: 'operating_profit', rationale: 'Quarterly operating profit latest reporting quarter' },
  opmpctq: { token: 'opmpctq', destination: 'HistoricalFinancialStatements', targetMetricOrColumn: 'opm_pct', rationale: 'Latest quarter operating profit margin %' },
  opmpctqmq1: { token: 'opmpctqmq1', destination: 'HistoricalFinancialStatements', targetMetricOrColumn: 'opm_pct', rationale: 'Operating profit margin % 1 quarter prior' },
  roea: { token: 'roea', destination: 'company_facts', targetMetricOrColumn: 'roe_pct', rationale: 'Annual return on equity %' },
  rocea: { token: 'rocea', destination: 'company_facts', targetMetricOrColumn: 'roce_reported', rationale: 'Annual return on capital employed %' },
  debtcea: { token: 'debtcea', destination: 'company_facts', targetMetricOrColumn: 'debt_to_equity_reported', rationale: 'Annual debt to equity ratio' },
  ica: { token: 'ica', destination: 'company_facts', targetMetricOrColumn: 'interest_coverage', rationale: 'Annual interest coverage ratio' },
  pettm: { token: 'pettm', destination: 'company_facts', targetMetricOrColumn: 'pe_ratio', rationale: 'Price to earnings ratio trailing twelve months' },
  pegttm: { token: 'pegttm', destination: 'company_facts', targetMetricOrColumn: 'peg_ratio', rationale: 'Price/Earnings to growth ratio trailing twelve months' },
  pbva: { token: 'pbva', destination: 'company_facts', targetMetricOrColumn: 'pb_ratio', rationale: 'Price to book value adjusted ratio' },
  mcapq: { token: 'mcapq', destination: 'company_facts', targetMetricOrColumn: 'market_cap_cr', rationale: 'Market capitalization in crore' },
  prompct: { token: 'prompct', destination: 'company_facts', targetMetricOrColumn: 'promoter_holding', rationale: 'Promoter holding % latest' },
  prompledge: { token: 'prompledge', destination: 'company_facts', targetMetricOrColumn: 'promoter_pledge', rationale: 'Promoter pledge % latest quarter' },
  fiihold: { token: 'fiihold', destination: 'company_facts', targetMetricOrColumn: 'fii_holding', rationale: 'FII holding % latest quarter' },
  mfhold: { token: 'mfhold', destination: 'company_facts', targetMetricOrColumn: 'mf_holding', rationale: 'MF holding % latest quarter' },
  fiipct1q: { token: 'fiipct1q', destination: 'company_facts', targetMetricOrColumn: 'fii_change_qoq', rationale: 'FII holding QoQ % change' },
  mfpct1q: { token: 'mfpct1q', destination: 'company_facts', targetMetricOrColumn: 'mf_change_qoq', rationale: 'MF holding QoQ % change' },
  cfoa: { token: 'cfoa', destination: 'company_facts', targetMetricOrColumn: 'cfo', rationale: 'Cash flow from operating activities annual' },
  wcq: { token: 'wcq', destination: 'company_facts', targetMetricOrColumn: 'working_capital', rationale: 'Quarterly working capital' },
  currentprice: { token: 'currentprice', destination: 'company_facts', targetMetricOrColumn: 'current_price', rationale: 'Current market price from provider' },
  opma: { token: 'opma', destination: 'company_facts', targetMetricOrColumn: 'operating_margin_annual_pct', rationale: 'Annual operating profit margin %' },
  roica: { token: 'roica', destination: 'company_facts', targetMetricOrColumn: 'roic_pct', rationale: 'Annual return on invested capital %' },
  roaa: { token: 'roaa', destination: 'company_facts', targetMetricOrColumn: 'roa_pct', rationale: 'Annual return on assets %' },
  npq: { token: 'npq', destination: 'company_facts', targetMetricOrColumn: 'pat', rationale: 'Quarterly net profit' },
  ebita: { token: 'ebita', destination: 'company_facts', targetMetricOrColumn: 'ebit', rationale: 'Annual EBIT' },
  cepsa: { token: 'cepsa', destination: 'company_facts', targetMetricOrColumn: 'cash_eps', rationale: 'Annual cash EPS' },
  ltdea: { token: 'ltdea', destination: 'company_facts', targetMetricOrColumn: 'long_term_debt_to_equity', rationale: 'Annual long-term debt/equity' },
  netdebta: { token: 'netdebta', destination: 'company_facts', targetMetricOrColumn: 'net_debt', rationale: 'Annual net debt' },
  dividendpayout: { token: 'dividendpayout', destination: 'company_facts', targetMetricOrColumn: 'dividend_payout_pct', rationale: 'Dividend payout ratio' },
  dividendpersharea: { token: 'dividendpersharea', destination: 'company_facts', targetMetricOrColumn: 'dividend_per_share', rationale: 'Annual dividend per share' },
  cfoagrowth: { token: 'cfoagrowth', destination: 'company_facts', targetMetricOrColumn: 'cfo_growth_pct', rationale: 'Annual CFO growth %' },
  ncfa: { token: 'ncfa', destination: 'company_facts', targetMetricOrColumn: 'net_cash_flow', rationale: 'Annual net cash flow' },
  capitalexpenditurea: { token: 'capitalexpenditurea', destination: 'company_facts', targetMetricOrColumn: 'capex_cash_outflow', rationale: 'Annual capex cash outflow' },
  inventoriesq: { token: 'inventoriesq', destination: 'company_facts', targetMetricOrColumn: 'inventory', rationale: 'Quarterly inventories' },
  tradereceivablesa: { token: 'tradereceivablesa', destination: 'company_facts', targetMetricOrColumn: 'trade_receivables', rationale: 'Annual trade receivables' },
  contingentliabilitiesa: { token: 'contingentliabilitiesa', destination: 'company_facts', targetMetricOrColumn: 'contingent_liabilities', rationale: 'Annual contingent liabilities' },
  prompct1q: { token: 'prompct1q', destination: 'company_facts', targetMetricOrColumn: 'promoter_change_qoq_pct', rationale: 'Promoter holding QoQ change' },
  prompledge1q: { token: 'prompledge1q', destination: 'company_facts', targetMetricOrColumn: 'promoter_pledge_change_qoq_pct', rationale: 'Promoter pledge QoQ change' },
  instihold: { token: 'instihold', destination: 'company_facts', targetMetricOrColumn: 'institutional_holding', rationale: 'Institutional holding %' }
};

export interface FreshSkippedSymbol {
  symbol: string;
  reason: 'SKIPPED_FRESH';
  lastFetched: string;
}

export interface UnresolvedSymbol {
  symbol: string;
  reason: 'UNRESOLVED_PROVIDER_CODE';
  details?: string;
}

export interface EligibleResolvedSymbol {
  symbol: string;
  providerCode: string;
  isin?: string;
  name?: string;
}

export interface PlannedBatch {
  batchIndex: number;
  symbols: string[];
  parameterTokens: string[];
  metricsPacked: number;
}

export type PlanStatus =
  | 'READY'
  | 'PARTIAL_BATCH_NOT_EXECUTED'
  | 'DATA_INSUFFICIENT'
  | 'NO_DUE_SYMBOLS'
  | 'SKIPPED_FRESH'
  | 'SUCCESS_WITH_NO_FACTS';

export interface PlanResult {
  status: PlanStatus;
  targetBatchSize: number;
  maxSymbols?: number;
  allowPartialFinalBatch: boolean;
  totalCandidateScanned: number;
  freshSkippedSymbols: FreshSkippedSymbol[];
  unresolvedSymbols: UnresolvedSymbol[];
  eligibleResolvedSymbols: EligibleResolvedSymbol[];
  plannedBatches: PlannedBatch[];
  message: string;
}

export interface PlanOptions {
  candidateSymbols?: string[];
  maxSymbols?: number;
  batchSize?: number;
  allowPartialFinalBatch?: boolean;
  scanUniverseIfDeficient?: boolean;
  forceRefresh?: boolean;
}

export class TrendlyneMetricPackPlanner {
  private db: sqlite3.Database;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  public queryAll(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Check 15-day freshness for symbols in fundamental_endpoint_snapshots.
   */
  public async getFreshnessStatus(symbols: string[]): Promise<Map<string, { isFresh: boolean; lastFetched: string | null }>> {
    const map = new Map<string, { isFresh: boolean; lastFetched: string | null }>();
    if (!symbols.length) return map;

    const placeholders = symbols.map(() => '?').join(',');
    const rows = await this.queryAll(`
      SELECT UPPER(symbol) as symbol, MAX(fetched_at) as last_fetched
      FROM fundamental_endpoint_snapshots
      WHERE provider = 'TRENDLYNE_MCP' AND UPPER(symbol) IN (${placeholders}) AND status = 'SUCCESS'
      GROUP BY UPPER(symbol)
    `, symbols.map(s => s.toUpperCase()));

    const fifteenDaysAgo = Date.now() - 15 * 86_400_000;
    const fetchMap = new Map<string, string>();
    for (const r of rows) {
      if (r.symbol && r.last_fetched) fetchMap.set(r.symbol, r.last_fetched);
    }

    for (const s of symbols) {
      const upper = s.toUpperCase();
      const last = fetchMap.get(upper);
      if (last) {
        const ts = new Date(last).getTime();
        map.set(upper, { isFresh: ts > fifteenDaysAgo, lastFetched: last });
      } else {
        map.set(upper, { isFresh: false, lastFetched: null });
      }
    }

    return map;
  }

  /**
   * Resolve provider identity using local DB:
   * 1. MasterTickers.symbol
   * 2. MasterTickers.isin
   * 3. MasterTickers.company_name / name
   * 4. Existing successful snapshot cache
   */
  public async resolveProviderCode(rawInput: string): Promise<EligibleResolvedSymbol | null> {
    const clean = rawInput.trim();
    if (!clean) return null;
    const upper = clean.toUpperCase();

    // 1. Direct match on MasterTickers.symbol
    const bySymbol = await this.queryAll(`
      SELECT symbol, isin, name, company_name, exchange
      FROM MasterTickers
      WHERE UPPER(symbol) = ? AND (status IS NULL OR status = 'ACTIVE')
      LIMIT 1
    `, [upper]);
    if (bySymbol.length > 0 && bySymbol[0].symbol) {
      return {
        symbol: upper,
        providerCode: bySymbol[0].symbol.toUpperCase(),
        isin: bySymbol[0].isin || undefined,
        name: bySymbol[0].name || bySymbol[0].company_name || undefined
      };
    }

    // 2. Match on MasterTickers.isin
    const byIsin = await this.queryAll(`
      SELECT symbol, isin, name, company_name, exchange
      FROM MasterTickers
      WHERE UPPER(isin) = ? AND (status IS NULL OR status = 'ACTIVE')
      LIMIT 1
    `, [upper]);
    if (byIsin.length > 0 && byIsin[0].symbol) {
      return {
        symbol: upper,
        providerCode: byIsin[0].symbol.toUpperCase(),
        isin: byIsin[0].isin || undefined,
        name: byIsin[0].name || byIsin[0].company_name || undefined
      };
    }

    // 3. Match on MasterTickers.company_name or name
    const byName = await this.queryAll(`
      SELECT symbol, isin, name, company_name, exchange
      FROM MasterTickers
      WHERE (UPPER(company_name) = ? OR UPPER(name) = ?) AND (status IS NULL OR status = 'ACTIVE')
      LIMIT 1
    `, [upper, upper]);
    if (byName.length > 0 && byName[0].symbol) {
      return {
        symbol: upper,
        providerCode: byName[0].symbol.toUpperCase(),
        isin: byName[0].isin || undefined,
        name: byName[0].name || byName[0].company_name || undefined
      };
    }

    // 4. Check existing snapshot cache
    const bySnapshot = await this.queryAll(`
      SELECT symbol
      FROM fundamental_endpoint_snapshots
      WHERE provider = 'TRENDLYNE_MCP' AND UPPER(symbol) = ? AND status = 'SUCCESS'
      LIMIT 1
    `, [upper]);
    if (bySnapshot.length > 0 && bySnapshot[0].symbol) {
      return {
        symbol: upper,
        providerCode: bySnapshot[0].symbol.toUpperCase()
      };
    }

    return null;
  }

  /**
   * Batching helper enforcing the full batch rule.
   * Partial final batch is only included if allowPartialFinalBatch is explicitly true.
   */
  public planBatches(
    targetSymbols: string[],
    freshnessMap: Map<string, { isFresh: boolean }>,
    allowPartialFinalBatch: boolean = false
  ): PlannedBatch[] {
    const dueSymbols = targetSymbols.filter(s => !freshnessMap.get(s)?.isFresh);
    const batches: PlannedBatch[] = [];
    const batchSize = 10;
    const fullBatchCount = Math.floor(dueSymbols.length / batchSize);
    const remainder = dueSymbols.length % batchSize;

    for (let i = 0; i < fullBatchCount; i++) {
      const chunk = dueSymbols.slice(i * batchSize, (i + 1) * batchSize);
      batches.push({
        batchIndex: i + 1,
        symbols: chunk,
        parameterTokens: CANONICAL_30_METRIC_PACK,
        metricsPacked: CANONICAL_30_METRIC_PACK.length
      });
    }

    if (remainder > 0 && allowPartialFinalBatch) {
      const chunk = dueSymbols.slice(fullBatchCount * batchSize);
      batches.push({
        batchIndex: fullBatchCount + 1,
        symbols: chunk,
        parameterTokens: CANONICAL_30_METRIC_PACK,
        metricsPacked: CANONICAL_30_METRIC_PACK.length
      });
    }

    return batches;
  }

  /**
   * Full provider-resolved batch planner maximizing capacity:
   * - 15-day freshness check -> SKIPPED_FRESH
   * - Local DB provider identity resolution -> UNRESOLVED_PROVIDER_CODE
   * - Continuous universe scanning until target full batches are satisfied
   * - Full batch rule: batches of 10 symbols, no partial batch unless allowPartialFinalBatch is true
   */
  public async planBatchRun(options: PlanOptions = {}): Promise<PlanResult> {
    const targetBatchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 10;
    const maxSymbols = options.maxSymbols && options.maxSymbols > 0 ? options.maxSymbols : undefined;
    const allowPartialFinalBatch = !!options.allowPartialFinalBatch;
    const scanUniverseIfDeficient = options.scanUniverseIfDeficient !== false;
    const forceRefresh = !!options.forceRefresh;

    const freshSkippedSymbols: FreshSkippedSymbol[] = [];
    const unresolvedSymbols: UnresolvedSymbol[] = [];
    const eligibleResolvedSymbols: EligibleResolvedSymbol[] = [];
    const plannedBatches: PlannedBatch[] = [];

    const seenInputs = new Set<string>();
    const seenResolvedCodes = new Set<string>();

    const candidateInputs = options.candidateSymbols ? [...options.candidateSymbols] : [];

    const evaluateCandidate = async (rawInput: string): Promise<boolean> => {
      const trimmed = rawInput.trim();
      if (!trimmed) return false;
      const upper = trimmed.toUpperCase();
      if (seenInputs.has(upper)) return false;
      seenInputs.add(upper);

      // Step 1: Check 15-day freshness on candidate input directly
      const inputFreshness = await this.getFreshnessStatus([upper]);
      const inputFreshInfo = inputFreshness.get(upper);
      if (!forceRefresh && inputFreshInfo?.isFresh && inputFreshInfo.lastFetched) {
        freshSkippedSymbols.push({
          symbol: upper,
          reason: 'SKIPPED_FRESH',
          lastFetched: inputFreshInfo.lastFetched
        });
        return false;
      }

      // Step 2: Resolve provider identity using local DB
      const resolved = await this.resolveProviderCode(upper);
      if (!resolved || !resolved.providerCode) {
        unresolvedSymbols.push({
          symbol: upper,
          reason: 'UNRESOLVED_PROVIDER_CODE',
          details: 'Could not resolve trading ticker in MasterTickers or snapshot cache'
        });
        return false;
      }

      // Step 3: Check freshness on resolved provider code if different from input
      if (resolved.providerCode !== upper) {
        const resolvedFreshness = await this.getFreshnessStatus([resolved.providerCode]);
        const resolvedFreshInfo = resolvedFreshness.get(resolved.providerCode);
        if (!forceRefresh && resolvedFreshInfo?.isFresh && resolvedFreshInfo.lastFetched) {
          freshSkippedSymbols.push({
            symbol: upper,
            reason: 'SKIPPED_FRESH',
            lastFetched: resolvedFreshInfo.lastFetched
          });
          return false;
        }
      }

      // Check duplicate in resolved symbols
      if (seenResolvedCodes.has(resolved.providerCode)) {
        return false;
      }
      seenResolvedCodes.add(resolved.providerCode);

      eligibleResolvedSymbols.push(resolved);
      return true;
    };

    // 1. Process candidate inputs first
    for (const cand of candidateInputs) {
      await evaluateCandidate(cand);
      if (maxSymbols && eligibleResolvedSymbols.length >= maxSymbols) break;
    }

    // Determine target count needed:
    let targetCount = targetBatchSize;
    if (maxSymbols) {
      targetCount = maxSymbols;
    } else if (candidateInputs.length > 0) {
      targetCount = Math.max(targetBatchSize, Math.ceil(candidateInputs.length / targetBatchSize) * targetBatchSize);
      if (eligibleResolvedSymbols.length > 0 && eligibleResolvedSymbols.length % targetBatchSize === 0) {
        targetCount = eligibleResolvedSymbols.length;
      }
    }

    // 2. Scan active universe if deficient and allowed
    if (scanUniverseIfDeficient && eligibleResolvedSymbols.length < targetCount) {
      const universeRows = await this.queryAll(`
        SELECT symbol, isin, name, company_name
        FROM MasterTickers
        WHERE symbol IS NOT NULL AND (status IS NULL OR status = 'ACTIVE')
        ORDER BY symbol ASC
      `);

      for (const row of universeRows) {
        if (eligibleResolvedSymbols.length >= targetCount) break;
        if (maxSymbols && eligibleResolvedSymbols.length >= maxSymbols) break;

        const sym = (row.symbol || '').trim();
        if (!sym) continue;
        await evaluateCandidate(sym);
      }
    }

    // 3. Batch formation following the full batch rule
    const effectiveEligible = maxSymbols ? eligibleResolvedSymbols.slice(0, maxSymbols) : eligibleResolvedSymbols;
    const fullBatchCount = Math.floor(effectiveEligible.length / targetBatchSize);
    const remainder = effectiveEligible.length % targetBatchSize;

    for (let i = 0; i < fullBatchCount; i++) {
      const chunk = effectiveEligible.slice(i * targetBatchSize, (i + 1) * targetBatchSize);
      plannedBatches.push({
        batchIndex: i + 1,
        symbols: chunk.map(c => c.providerCode),
        parameterTokens: CANONICAL_30_METRIC_PACK,
        metricsPacked: CANONICAL_30_METRIC_PACK.length
      });
    }

    if (remainder > 0 && allowPartialFinalBatch) {
      const chunk = effectiveEligible.slice(fullBatchCount * targetBatchSize);
      plannedBatches.push({
        batchIndex: fullBatchCount + 1,
        symbols: chunk.map(c => c.providerCode),
        parameterTokens: CANONICAL_30_METRIC_PACK,
        metricsPacked: CANONICAL_30_METRIC_PACK.length
      });
    }

    // 4. Status determination
    let status: PlanStatus;
    let message: string;

    if (plannedBatches.length > 0) {
      status = 'READY';
      const totalSymbolsPacked = plannedBatches.reduce((acc, b) => acc + b.symbols.length, 0);
      message = `Planned ${plannedBatches.length} batch(es) covering ${totalSymbolsPacked} provider-resolved symbols.`;
    } else if (effectiveEligible.length > 0) {
      status = 'PARTIAL_BATCH_NOT_EXECUTED';
      message = `Found ${effectiveEligible.length} valid provider-resolved symbol(s), but full batch requires ${targetBatchSize}. Override with --allow-partial-final-batch.`;
    } else if (freshSkippedSymbols.length > 0 && unresolvedSymbols.length === 0) {
      status = 'SKIPPED_FRESH';
      message = `All ${freshSkippedSymbols.length} candidate symbol(s) are fresh (< 15 days).`;
    } else {
      status = 'NO_DUE_SYMBOLS';
      message = `No eligible due symbols found (scanned ${seenInputs.size} symbols; ${freshSkippedSymbols.length} fresh, ${unresolvedSymbols.length} unresolved).`;
    }

    return {
      status,
      targetBatchSize,
      maxSymbols,
      allowPartialFinalBatch,
      totalCandidateScanned: seenInputs.size,
      freshSkippedSymbols,
      unresolvedSymbols,
      eligibleResolvedSymbols: effectiveEligible,
      plannedBatches,
      message
    };
  }

  /**
   * Ingest parsed metrics into fundamental_endpoint_snapshots, company_facts,
   * and HistoricalFinancialStatements.
   *
   * Guardrail against synthetic dates:
   * - Never uses new Date().toISOString() as periodEnd or asOfDate for annual/quarterly facts.
   * - If provider asOfDate is missing/invalid, skips annual/quarterly periodEnd facts.
   * - Local fetch timestamp is strictly stored as fetchedAt/datetime('now').
   */
  public async ingestParsedMetrics(
    parsedData: Map<string, Record<string, number | string | null>>
  ): Promise<{ factsPersisted: number; skippedUnanchoredCount: number }> {
    let factsPersisted = 0;
    let skippedUnanchoredCount = 0;

    for (const [symbol, metrics] of parsedData) {
      const rawAsOf = typeof metrics.asOfDate === 'string' ? metrics.asOfDate.trim() : '';
      const hasValidProviderDate = /^\d{4}-\d{2}-\d{2}$/.test(rawAsOf);
      const providerAsOf = hasValidProviderDate ? rawAsOf : null;
      const asOfYear = providerAsOf ? parseInt(providerAsOf.substring(0, 4), 10) : null;

      // Always persist raw snapshot to preserve freshness and auditability
      await new Promise<void>((resolve, reject) => {
        this.db.run(
          `
          INSERT OR REPLACE INTO fundamental_endpoint_snapshots
          (symbol, provider, endpoint, authority, source_url, fetched_at, status, response_json)
          VALUES (?, 'TRENDLYNE_MCP', 'get_stock_parameter_values', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', datetime('now'), 'SUCCESS', ?)
        `,
          [symbol, JSON.stringify(metrics)],
          (err) => (err ? reject(err) : resolve())
        );
      });

      if (!providerAsOf || !asOfYear) {
        skippedUnanchoredCount++;
        // Notice: do NOT invent annual/quarterly periodEnd or asOfDate from local clock!
        // Skip dated statement facts when provider did not supply verified reporting date anchor.
        continue;
      }

      // 1. Annual Revenue Series (4 consecutive annual points)
      const revPoints = [
        { yr: asOfYear, val: metrics.sra },
        { yr: asOfYear - 1, val: metrics.sramy1 },
        { yr: asOfYear - 2, val: metrics.sramy2 },
        { yr: asOfYear - 3, val: metrics.sramy3 }
      ];
      for (const pt of revPoints) {
        if (pt.val != null && Number(pt.val) > 0) {
          const periodEnd = `${pt.yr}-03-31`;
          const factId = `tl:${symbol}:revenue:${periodEnd}`;
          await new Promise<void>((resolve, reject) => {
            this.db.run(
              `
              INSERT OR REPLACE INTO company_facts
              (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
              VALUES (?, ?, ?, 'revenue', 'ANNUAL', ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, 'INR_CR', 'TRENDLYNE_MCP', ?)
            `,
              [factId, symbol, symbol, periodEnd, providerAsOf, String(pt.val), providerAsOf],
              (err) => (err ? reject(err) : resolve())
            );
          });
          factsPersisted++;
        }
      }

      // 2. Annual Net Profit / PAT Series (4 consecutive annual points)
      const patPoints = [
        { yr: asOfYear, val: metrics.npa },
        { yr: asOfYear - 1, val: metrics.npamy1 },
        { yr: asOfYear - 2, val: metrics.npamy2 },
        { yr: asOfYear - 3, val: metrics.npamy3 }
      ];
      for (const pt of patPoints) {
        if (pt.val != null && !isNaN(Number(pt.val))) {
          const periodEnd = `${pt.yr}-03-31`;
          const factId = `tl:${symbol}:pat:${periodEnd}`;
          await new Promise<void>((resolve, reject) => {
            this.db.run(
              `
              INSERT OR REPLACE INTO company_facts
              (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
              VALUES (?, ?, ?, 'pat', 'ANNUAL', ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, 'INR_CR', 'TRENDLYNE_MCP', ?)
            `,
              [factId, symbol, symbol, periodEnd, providerAsOf, String(pt.val), providerAsOf],
              (err) => (err ? reject(err) : resolve())
            );
          });
          factsPersisted++;
        }
      }

      // 3. Persist every fetched long-lived metric that the app can reuse.
      // Do not let the 50-metric provider-call capacity go to waste: if a
      // parameter was requested and returned as a real number, promote it into
      // company_facts with exact token provenance. Missing provider values stay
      // absent/null and are handled by Analyze360 as DATA_INSUFFICIENT.
      const ratioMetrics: Array<{ metric: string; val: any; unit: string; pType: string; pEnd?: string }> = [
        { metric: 'roce_reported', val: metrics.rocea, unit: '%', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'roe_pct', val: metrics.roea, unit: '%', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'debt_to_equity_reported', val: metrics.debtcea, unit: 'RATIO', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'interest_coverage', val: metrics.ica, unit: 'RATIO', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'pe_ratio', val: metrics.pettm, unit: 'RATIO', pType: 'TTM', pEnd: providerAsOf },
        { metric: 'peg_ratio', val: metrics.pegttm, unit: 'RATIO', pType: 'TTM', pEnd: providerAsOf },
        { metric: 'market_cap_cr', val: metrics.mcapq, unit: 'INR_CR', pType: 'LATEST', pEnd: providerAsOf },
        { metric: 'operating_profit', val: metrics.opa, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'operating_profit', val: metrics.opq, unit: 'INR_CR', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'promoter_holding', val: metrics.prompct, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'promoter_pledge', val: metrics.prompledge, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'fii_holding', val: metrics.fiihold, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'dii_holding', val: metrics.mfhold, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'fii_change_qoq_pct', val: metrics.fiipct1q, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'dii_change_qoq_pct', val: metrics.mfpct1q, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'working_capital', val: metrics.wcq, unit: 'INR_CR', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'current_price', val: metrics.currentprice, unit: 'INR', pType: 'LATEST', pEnd: providerAsOf },
        { metric: 'operating_margin_annual_pct', val: metrics.opma, unit: '%', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'roic_pct', val: metrics.roica, unit: '%', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'roa_pct', val: metrics.roaa, unit: '%', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'pat', val: metrics.npq, unit: 'INR_CR', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'ebit', val: metrics.ebita, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'cash_eps', val: metrics.cepsa, unit: 'INR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'long_term_debt_to_equity', val: metrics.ltdea, unit: 'RATIO', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'net_debt', val: metrics.netdebta, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'dividend_payout_pct', val: metrics.dividendpayout, unit: '%', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'dividend_per_share', val: metrics.dividendpersharea, unit: 'INR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'cfo_growth_pct', val: metrics.cfoagrowth, unit: '%', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'net_cash_flow', val: metrics.ncfa, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'capex_cash_outflow', val: metrics.capitalexpenditurea, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'inventory', val: metrics.inventoriesq, unit: 'INR_CR', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'trade_receivables', val: metrics.tradereceivablesa, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'contingent_liabilities', val: metrics.contingentliabilitiesa, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` },
        { metric: 'promoter_change_qoq_pct', val: metrics.prompct1q, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'promoter_pledge_change_qoq_pct', val: metrics.prompledge1q, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'institutional_holding', val: metrics.instihold, unit: '%', pType: 'QUARTERLY', pEnd: providerAsOf },
        { metric: 'cfo', val: metrics.cfoa, unit: 'INR_CR', pType: 'ANNUAL', pEnd: `${asOfYear}-03-31` }
      ];

      for (const rm of ratioMetrics) {
        if (rm.val != null && !isNaN(Number(rm.val))) {
          const factId = `tl:${symbol}:${rm.metric}:${rm.pType}`;
          const periodEnd = rm.pEnd || providerAsOf;
          await new Promise<void>((resolve, reject) => {
            this.db.run(
              `
              INSERT OR REPLACE INTO company_facts
              (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, ?, 'TRENDLYNE_MCP', ?)
            `,
              [factId, symbol, symbol, rm.metric, rm.pType, periodEnd, providerAsOf, String(rm.val), rm.unit, providerAsOf],
              (err) => (err ? reject(err) : resolve())
            );
          });
          factsPersisted++;
        }
      }

      // Also update HistoricalFinancialStatements with sequential quarterly margins
      if (metrics.opmpctq != null) {
        const qLabel = `${providerAsOf} (Latest Qtr)`;
        await new Promise<void>((resolve) => {
          this.db.run(
            `
            INSERT OR REPLACE INTO HistoricalFinancialStatements
            (symbol, statement_type, period_label, period_date, opm_pct, primary_source)
            VALUES (?, 'QUARTERLY_PL', ?, ?, ?, 'TRENDLYNE_MCP')
          `,
            [symbol, qLabel, providerAsOf, Number(metrics.opmpctq)],
            () => resolve()
          );
        });
      }
      if (metrics.opmpctqmq1 != null) {
        const prevQLabel = `1Q Ago`;
        await new Promise<void>((resolve) => {
          this.db.run(
            `
            INSERT OR REPLACE INTO HistoricalFinancialStatements
            (symbol, statement_type, period_label, period_date, opm_pct, primary_source)
            VALUES (?, 'QUARTERLY_PL', ?, NULL, ?, 'TRENDLYNE_MCP')
          `,
            [symbol, prevQLabel, Number(metrics.opmpctqmq1)],
            () => resolve()
          );
        });
      }
    }

    return { factsPersisted, skippedUnanchoredCount };
  }
}

function endpointUrl(): string | undefined {
  const env = process.env.TRENDLYNE_MCP_URL?.trim();
  if (env && !env.includes('\x16')) return env;
  for (const configPath of [
    path.join(root, '.agents', 'mcp_config.json'),
    path.join(process.env.USERPROFILE || '', '.gemini', 'config', 'mcp_config.json')
  ]) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const url = config.mcpServers?.trendlyne?.url || config.mcpServers?.trendlyne?.serverUrl;
      if (typeof url === 'string' && url.trim() && !url.includes('\x16')) return url.trim();
    } catch {}
  }
  return undefined;
}

export function parseTrendlyneResponse(responseText: string): Map<string, Record<string, number | string | null>> {
  const results = new Map<string, Record<string, number | string | null>>();
  if (!responseText) return results;

  const blocks = responseText.split('\n\n---\n\n');
  const headerBlock = blocks[0] || '';
  const metricBlocks = blocks.slice(1);

  // Parse header lines: e.g. 630|Infosys|INFY|500209|2026-10-01
  const headerLines = headerBlock.trim().split('\n').filter(Boolean);
  const metadataBySymbol = new Map<string, { asOfDate: string; companyName: string }>();

  for (const line of headerLines) {
    const parts = line.split('|');
    if (parts.length >= 5) {
      const sym = parts[2].trim().toUpperCase();
      metadataBySymbol.set(sym, {
        companyName: parts[1].trim(),
        asOfDate: parts[4].trim()
      });
      results.set(sym, { asOfDate: parts[4].trim(), companyName: parts[1].trim() });
    }
  }

  // Label to token mapping
  const labelMap: Record<string, string> = {
    'Total Rev. Ann.': 'sra',
    'Total Rev. Ann. 1Y Ago': 'sramy1',
    'Rev. Ann. 2Y ago': 'sramy2',
    'Rev. Ann. 3Y ago': 'sramy3',
    'Total Rev. Qtr': 'totalsrq',
    'Net Profit Ann.': 'npa',
    'Net Profit Ann. 1Y Ago': 'npamy1',
    'Net Profit Ann. 2Y ago': 'npamy2',
    'Net Profit Ann. 3Y Ago': 'npamy3',
    'Reported PAT Qtr': 'reportedpatq',
    'Operating Profit Ann.': 'opa',
    'Operating Profit Qtr': 'opq',
    'Operating Profit Margin Qtr %': 'opmpctq',
    'OPM 1Q ago %': 'opmpctqmq1',
    'ROE Ann. %': 'roea',
    'ROCE Ann. %': 'rocea',
    'Total Debt to Total Equity Ann.': 'debtcea',
    'Interest Coverage Ratio Ann.': 'ica',
    'PE TTM': 'pettm',
    'PEG TTM': 'pegttm',
    'PBV Adjusted': 'pbva',
    'Market Cap': 'mcapq',
    'Promoter holding latest %': 'prompct',
    'Promoter holding pledge percentage % Qtr': 'prompledge',
    'FII holding current Qtr %': 'fiihold',
    'MF holding current Qtr %': 'mfhold',
    'FII holding change QoQ %': 'fiipct1q',
    'MF holding change QoQ %': 'mfpct1q',
    'Cash from Operating Act. Ann.': 'cfoa',
    'Working Capital Quarterly': 'wcq',
    'Current Market Price': 'currentprice',
    'Operating Profit Margin Annual %': 'opma',
    'Return on Invested Capital Annual %': 'roica',
    'Return on Assets Annual %': 'roaa',
    'Net Profit Quarterly (Consolidated)': 'npq',
    'EBIT Annual': 'ebita',
    'Cash EPS Annual': 'cepsa',
    'Long Term Debt to Equity Annual': 'ltdea',
    'Net Debt Annual': 'netdebta',
    'Dividend Payout Ratio %': 'dividendpayout',
    'Dividend Per Share Annual': 'dividendpersharea',
    'CFO Annual Growth %': 'cfoagrowth',
    'Net Cash Flow Annual': 'ncfa',
    'Capital Expenditure Annual': 'capitalexpenditurea',
    'Inventories Quarterly': 'inventoriesq',
    'Trade Receivables Annual': 'tradereceivablesa',
    'Contingent Liabilities Annual': 'contingentliabilitiesa',
    'Promoter Holding QoQ Change %': 'prompct1q',
    'Promoter Pledge QoQ Change %': 'prompledge1q',
    'Institutional Holding %': 'instihold'
  };

  for (const block of metricBlocks) {
    const lines = block.trim().split('\n').filter(Boolean);
    if (!lines.length) continue;
    const label = lines[0].trim();
    const token = labelMap[label];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const sym = line.substring(0, colonIdx).trim().toUpperCase();
      const valStr = line.substring(colonIdx + 1).trim();

      if (!results.has(sym)) results.set(sym, {});
      const record = results.get(sym)!;

      if (valStr === 'None' || valStr === '' || valStr.toLowerCase() === 'null') {
        if (token) record[token] = null;
      } else {
        const num = Number(valStr);
        if (token) record[token] = isNaN(num) ? valStr : num;
      }
    }
  }

  return results;
}

export function writeProgressFiles(progressData: Record<string, any>) {
  const targets = [
    path.join(root, 'reports', 'data_quality', 'jobs', 'trendlyne_fundamental_refresh_progress.json'),
    path.join(root, 'reports', 'data_quality', 'jobs', 'valuation_metric_refresh_progress.json')
  ];
  for (const p of targets) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(progressData, null, 2));
    } catch {}
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldExecute = args.includes('--execute');
  const allowPartialFinalBatch = args.includes('--allow-partial-final-batch');
  const forceRefresh = args.includes('--force-refresh');
  const allowUnderfilledProviderCall = args.includes('--allow-underfilled-provider-call');
  const isJson = args.includes('--json');

  let maxSymbols: number | undefined;
  const maxIdx = args.indexOf('--max-symbols');
  if (maxIdx >= 0 && args[maxIdx + 1]) {
    maxSymbols = parseInt(args[maxIdx + 1], 10);
  }

  let batchSize = 10;
  const batchIdx = args.indexOf('--batch-size');
  if (batchIdx >= 0 && args[batchIdx + 1]) {
    batchSize = parseInt(args[batchIdx + 1], 10);
  }

  if (
    !allowUnderfilledProviderCall &&
    maxSymbols != null &&
    maxSymbols > 0 &&
    maxSymbols < batchSize
  ) {
    console.log(`[!] Requested --max-symbols ${maxSymbols} is below batch size ${batchSize}. Raising maxSymbols to ${batchSize} to avoid wasting a provider call. Use --allow-underfilled-provider-call only for explicit diagnostics.`);
    maxSymbols = batchSize;
  }

  let candidateSymbols: string[] = [];
  const symIdx = args.indexOf('--symbols');
  if (symIdx >= 0 && args[symIdx + 1]) {
    candidateSymbols = args[symIdx + 1].split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  } else if (fs.existsSync(inventoryPath)) {
    const inv = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    candidateSymbols = (inv.symbols || []).map((s: any) => (typeof s === 'string' ? s : s?.symbol || '').trim().toUpperCase()).filter(Boolean);
  } else {
    candidateSymbols = ['INFY', 'TCS', 'RELIANCE', 'EMAMIREAL', 'PRAJIND', '20MICRONS'];
  }

  const db = new sqlite3.Database(dbPath);
  const planner = new TrendlyneMetricPackPlanner(db);

  const planResult = await planner.planBatchRun({
    candidateSymbols,
    maxSymbols,
    batchSize,
    allowPartialFinalBatch,
    scanUniverseIfDeficient: true,
    forceRefresh
  });

  if (isJson) {
    console.log(JSON.stringify(planResult, null, 2));
  } else {
    console.log('===============================================================');
    console.log('WealthOS Phase 4: Trendlyne Metric Pack Planner');
    console.log('===============================================================\n');
    console.log(`[+] Total candidate symbols scanned: ${planResult.totalCandidateScanned}`);
    if (forceRefresh) console.log('[!] Force refresh enabled: 15-day snapshot freshness skip is bypassed for this run.');
    console.log(`[+] Freshness audit: ${planResult.freshSkippedSymbols.length} symbol(s) fresh (< 15 days) [SKIPPED_FRESH].`);
    if (planResult.unresolvedSymbols.length > 0) {
      console.log(`[!] Unresolved provider codes: ${planResult.unresolvedSymbols.length} symbol(s) skipped with UNRESOLVED_PROVIDER_CODE:`);
      for (const u of planResult.unresolvedSymbols) {
        console.log(`    - ${u.symbol}: ${u.reason}`);
      }
    }
    console.log(`[+] Eligible provider-resolved symbols: ${planResult.eligibleResolvedSymbols.length}`);
    console.log(`[+] Total planned batches: ${planResult.plannedBatches.length} (target: up to ${planResult.targetBatchSize} symbols/batch, 30 metrics/call).`);

    console.log('\n--- Field Source Mapping & Route Summary ---');
    let availableCount = 0;
    let routedCount = 0;
    for (const [key, mapping] of Object.entries(TRENDLYNE_FIELD_MAP)) {
      if (mapping.sourceCategory === 'TRENDLYNE_AVAILABLE') {
        availableCount++;
        console.log(`  ✓ ${key.padEnd(20)} -> Token: ${mapping.trendlyneToken?.padEnd(12)} [TRENDLYNE_AVAILABLE]`);
      } else {
        routedCount++;
        console.log(`  ✗ ${key.padEnd(20)} -> [SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE] -> Route to: ${mapping.alternativeSource}`);
      }
    }
    console.log(`\nTrendlyne supported: ${availableCount} fields | Routed to XBRL/Statutory: ${routedCount} fields`);

    console.log('\n--- Planned Calls Detail ---');
    if (planResult.plannedBatches.length === 0) {
      console.log('  (No batches planned for execution)');
    } else {
      for (const b of planResult.plannedBatches) {
        console.log(`  Batch ${b.batchIndex}: ${b.symbols.length} symbols (${b.symbols.join(', ')}) -> ${b.metricsPacked} metrics`);
      }
    }

    console.log(`\nPlanner Status: ${planResult.status}`);
    console.log(`Message: ${planResult.message}\n`);
  }

  if (!shouldExecute) {
    if (!isJson) {
      console.log('[INFO] Dry-run completed. To execute queries and persist data, run:');
      console.log('       npx tsx scripts/fundamental/trendlyne_metric_pack_planner.ts --execute\n');
    }
    db.close();
    return;
  }

  // Execution mode
  const startTimeIso = new Date().toISOString();
  if (planResult.plannedBatches.length === 0) {
    const progressStatus =
      planResult.status === 'PARTIAL_BATCH_NOT_EXECUTED'
        ? 'DATA_INSUFFICIENT'
        : planResult.status === 'SKIPPED_FRESH'
        ? 'SKIPPED_FRESH'
        : 'DATA_INSUFFICIENT';

    const completedAtIso = new Date().toISOString();
    writeProgressFiles({
      jobName: 'trendlyne_long_term_fundamental_refresh',
      status: progressStatus,
      startedAt: startTimeIso,
      completedAt: completedAtIso,
      startTime: startTimeIso,
      completedTime: completedAtIso,
      totalCandidateScanned: planResult.totalCandidateScanned,
      freshSkippedCount: planResult.freshSkippedSymbols.length,
      unresolvedCount: planResult.unresolvedSymbols.length,
      eligibleResolvedCount: planResult.eligibleResolvedSymbols.length,
      plannedBatchCount: 0,
      executedCalls: 0,
      factsPersisted: 0,
      freshSkippedSymbols: planResult.freshSkippedSymbols,
      unresolvedSymbols: planResult.unresolvedSymbols,
      eligibleResolvedSymbols: planResult.eligibleResolvedSymbols,
      plannedBatches: [],
      metricPackUsed: METRIC_PACK_USED,
      metricPackCapacity: METRIC_PACK_CAPACITY,
      metricPackUnusedReason: METRIC_PACK_UNUSED_REASON,
      allowPartialFinalBatch: planResult.allowPartialFinalBatch,
      message: planResult.message,
      error: planResult.status === 'PARTIAL_BATCH_NOT_EXECUTED' ? planResult.message : null
    });

    console.log(`[INFO] Execution skipped: ${planResult.message}`);
    db.close();
    return;
  }

  // Record initial RUNNING state
  writeProgressFiles({
    jobName: 'trendlyne_long_term_fundamental_refresh',
    status: 'RUNNING',
    startedAt: startTimeIso,
    completedAt: null,
    startTime: startTimeIso,
    completedTime: null,
    totalCandidateScanned: planResult.totalCandidateScanned,
    freshSkippedCount: planResult.freshSkippedSymbols.length,
    unresolvedCount: planResult.unresolvedSymbols.length,
    eligibleResolvedCount: planResult.eligibleResolvedSymbols.length,
    plannedBatchCount: planResult.plannedBatches.length,
    executedCalls: 0,
    factsPersisted: 0,
    freshSkippedSymbols: planResult.freshSkippedSymbols,
    unresolvedSymbols: planResult.unresolvedSymbols,
    eligibleResolvedSymbols: planResult.eligibleResolvedSymbols,
    plannedBatches: planResult.plannedBatches,
    metricPackUsed: METRIC_PACK_USED,
    metricPackCapacity: METRIC_PACK_CAPACITY,
    metricPackUnusedReason: METRIC_PACK_UNUSED_REASON,
    allowPartialFinalBatch: planResult.allowPartialFinalBatch,
    message: 'Trendlyne fundamental refresh in progress...',
    error: null
  });

  console.log('\n[EXECUTE] Connecting to Trendlyne MCP server...');
  const url = endpointUrl();
  if (!url) {
    console.error('[-] Could not find Trendlyne MCP URL in configuration.');
    const completedAtIso = new Date().toISOString();
    writeProgressFiles({
      jobName: 'trendlyne_long_term_fundamental_refresh',
      status: 'FAILED',
      startedAt: startTimeIso,
      completedAt: completedAtIso,
      startTime: startTimeIso,
      completedTime: completedAtIso,
      totalCandidateScanned: planResult.totalCandidateScanned,
      freshSkippedCount: planResult.freshSkippedSymbols.length,
      unresolvedCount: planResult.unresolvedSymbols.length,
      eligibleResolvedCount: planResult.eligibleResolvedSymbols.length,
      plannedBatchCount: planResult.plannedBatches.length,
      executedCalls: 0,
      factsPersisted: 0,
      freshSkippedSymbols: planResult.freshSkippedSymbols,
      unresolvedSymbols: planResult.unresolvedSymbols,
      eligibleResolvedSymbols: planResult.eligibleResolvedSymbols,
      plannedBatches: planResult.plannedBatches,
      metricPackUsed: METRIC_PACK_USED,
      metricPackCapacity: METRIC_PACK_CAPACITY,
      metricPackUnusedReason: METRIC_PACK_UNUSED_REASON,
      allowPartialFinalBatch: planResult.allowPartialFinalBatch,
      message: 'Could not find Trendlyne MCP URL in configuration',
      error: 'Could not find Trendlyne MCP URL in configuration'
    });
    db.close();
    process.exit(1);
  }

  const client = new Client({ name: 'wealthos-trendlyne-planner', version: '2.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));

  let executedCalls = 0;
  let factsPersisted = 0;

  for (const batch of planResult.plannedBatches) {
    let currentSymbols = [...batch.symbols];
    let parsedData = new Map<string, Record<string, number | string | null>>();

    while (currentSymbols.length > 0) {
      console.log(`\nExecuting Batch ${batch.batchIndex}/${planResult.plannedBatches.length} for ${currentSymbols.join(', ')}...`);
      try {
        const res = await client.callTool({
          name: 'get_stock_parameter_values',
          arguments: {
            stock_codes: currentSymbols,
            parameters: batch.parameterTokens
          }
        });
        executedCalls++;

        const content = (res as any)?.content?.[0]?.text;
        if (!content) {
          console.warn(`[-] Empty response for batch ${batch.batchIndex}`);
          break;
        }

        let textToParse = content;
        try {
          const parsedJson = JSON.parse(content);
          if (parsedJson?.status === 'error') {
            const msg = String(parsedJson.message || '');
            const match = msg.match(/Could not resolve stock code\(s\):\s*([^.]+)/i);
            if (match) {
              const badCodes = match[1].split(',').map(s => s.trim().toUpperCase());
              console.warn(`[!] Provider could not resolve codes: ${badCodes.join(', ')}. Routing to FERE/Statutory.`);
              currentSymbols = currentSymbols.filter(s => !badCodes.includes(s));
              continue; // retry with remaining
            } else {
              console.warn(`[-] Provider error: ${msg}`);
              break;
            }
          }
          if (parsedJson?.data) textToParse = parsedJson.data;
        } catch {}

        parsedData = parseTrendlyneResponse(textToParse);
        break; // Success!
      } catch (err: any) {
        console.error(`[-] Batch call error:`, err?.message || err);
        break;
      }
    }

    // Ingest into SQLite company_facts and fundamental_endpoint_snapshots via deterministic method
    const { factsPersisted: batchFacts } = await planner.ingestParsedMetrics(parsedData);
    factsPersisted += batchFacts;
    console.log(`  [✓] Batch ingestion complete: ${batchFacts} facts persisted for batch ${batch.batchIndex}`);

    // Small throttle between batches
    await new Promise(r => setTimeout(r, 1000));
  }

  let finalStatus: 'SUCCESS' | 'SUCCESS_WITH_NO_FACTS' | 'DATA_INSUFFICIENT';
  if (executedCalls > 0 && factsPersisted === 0) {
    finalStatus = 'SUCCESS_WITH_NO_FACTS';
  } else if (executedCalls === 0) {
    finalStatus = 'DATA_INSUFFICIENT';
  } else {
    finalStatus = 'SUCCESS';
  }
  const completedAtIso = new Date().toISOString();

  writeProgressFiles({
    jobName: 'trendlyne_long_term_fundamental_refresh',
    status: finalStatus,
    startedAt: startTimeIso,
    completedAt: completedAtIso,
    startTime: startTimeIso,
    completedTime: completedAtIso,
    totalCandidateScanned: planResult.totalCandidateScanned,
    freshSkippedCount: planResult.freshSkippedSymbols.length,
    unresolvedCount: planResult.unresolvedSymbols.length,
    eligibleResolvedCount: planResult.eligibleResolvedSymbols.length,
    plannedBatchCount: planResult.plannedBatches.length,
    executedCalls,
    factsPersisted,
    freshSkippedSymbols: planResult.freshSkippedSymbols,
    unresolvedSymbols: planResult.unresolvedSymbols,
    eligibleResolvedSymbols: planResult.eligibleResolvedSymbols,
    plannedBatches: planResult.plannedBatches,
    metricPackUsed: METRIC_PACK_USED,
    metricPackCapacity: METRIC_PACK_CAPACITY,
    metricPackUnusedReason: METRIC_PACK_UNUSED_REASON,
    allowPartialFinalBatch: planResult.allowPartialFinalBatch,
    message:
      finalStatus === 'SUCCESS_WITH_NO_FACTS'
        ? `Executed ${executedCalls} call(s) but provider returned no usable facts (SUCCESS_WITH_NO_FACTS).`
        : `Completed refresh: ${executedCalls} calls executed, ${factsPersisted} facts persisted.`,
    error: finalStatus === 'SUCCESS_WITH_NO_FACTS' ? 'Provider returned no usable facts' : null
  });

  console.log(`\nExecution complete: ${executedCalls} calls executed, ${factsPersisted} facts persisted (Status: ${finalStatus}).`);
  db.close();
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('trendlyne_metric_pack_planner.ts') ||
  process.argv[1].endsWith('trendlyne_metric_pack_planner.js')
);
if (isMain) {
  main().catch(console.error);
}
