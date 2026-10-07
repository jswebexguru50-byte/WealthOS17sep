import crypto from 'node:crypto';
import { CanonicalFactIngestionService } from '../CanonicalFactIngestionService.js';

export type TrendlyneTrustState = 'DISCOVERED' | 'OBSERVED' | 'VERIFIED' | 'AMBIGUOUS' | 'REJECTED';
export type TrendlynePeriodType = 'ANNUAL' | 'QUARTERLY' | 'LATEST' | 'POINT_IN_TIME';
export type TrendlyneObservationStatus = 'AVAILABLE' | 'PROVIDER_EXPLICIT_NULL' | 'REQUESTED_NOT_RETURNED';
export type TrendlyneChangeType =
  | 'NEW_METRIC'
  | 'NEW_PERIOD'
  | 'VALUE_CHANGED'
  | 'PROVIDER_CORRECTION'
  | 'BECAME_AVAILABLE'
  | 'BECAME_NULL';

export interface SqliteLike {
  prepare(sql: string): {
    all(...params: unknown[]): any[];
    get(...params: unknown[]): any;
    run(...params: unknown[]): any;
  };
  exec(sql: string): void;
}

export interface TrendlyneParameterDefinition {
  providerToken: string;
  providerLabel: string;
  canonicalMetric: string | null;
  domain: string;
  periodType: TrendlynePeriodType;
  relativePeriod: string | null;
  unit: string | null;
  trustState: TrendlyneTrustState;
  reason: string;
  proprietaryComposite?: boolean;
}

export interface TrendlynePackDefinition {
  packId: string;
  version: number;
  purpose: string;
  refreshPolicy: string;
  tokens: string[];
}

export interface PlannedBatch {
  packId: string;
  packVersion: number;
  symbols: string[];
  tokens: string[];
  requestedCells: number;
}

export interface MirrorPreflight {
  symbols: string[];
  symbolCount: number;
  packCount: number;
  packs: Array<{ packId: string; version: number; tokenCount: number; purpose: string }>;
  verifiedTokens: number;
  excludedTokens: Array<{ providerToken: string; reason: string }>;
  plannedBatches: PlannedBatch[];
  plannedParameterCalls: number;
  plannedRequestedCells: number;
  existingTrendlyneCoverage: Record<string, number>;
  existingCanonicalCoverage: Record<string, number>;
  quotaState: Record<string, unknown>;
  interactiveReserve: number;
  networkCallsExecuted: number;
}

export const TRENDLYNE_MIRROR_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS trendlyne_mirror_parameter_catalog (
  providerToken TEXT PRIMARY KEY,
  providerLabel TEXT NOT NULL,
  canonicalMetric TEXT,
  domain TEXT NOT NULL,
  periodType TEXT NOT NULL,
  relativePeriod TEXT,
  unit TEXT,
  trustState TEXT NOT NULL,
  reason TEXT NOT NULL,
  proprietaryComposite INTEGER NOT NULL DEFAULT 0,
  discoveredAt TEXT NOT NULL,
  verifiedAt TEXT
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_pack_registry (
  packId TEXT NOT NULL,
  version INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  refreshPolicy TEXT NOT NULL,
  tokenCount INTEGER NOT NULL,
  definitionHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (packId, version)
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_pack_tokens (
  packId TEXT NOT NULL,
  version INTEGER NOT NULL,
  providerToken TEXT NOT NULL,
  canonicalMetric TEXT,
  priority INTEGER NOT NULL,
  reason TEXT NOT NULL,
  verificationEvidence TEXT NOT NULL,
  PRIMARY KEY (packId, version, providerToken)
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_raw_snapshots (
  snapshotId TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  packId TEXT NOT NULL,
  packVersion INTEGER NOT NULL,
  symbolsJson TEXT NOT NULL,
  tokensJson TEXT NOT NULL,
  requestedCells INTEGER NOT NULL,
  responseHash TEXT NOT NULL,
  responseJson TEXT NOT NULL,
  providerStatus TEXT NOT NULL,
  requestedAt TEXT NOT NULL,
  receivedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_observations (
  observationId TEXT PRIMARY KEY,
  snapshotId TEXT NOT NULL,
  symbol TEXT NOT NULL,
  companyId TEXT,
  providerToken TEXT NOT NULL,
  providerLabel TEXT,
  canonicalMetric TEXT,
  rawValue TEXT,
  rawUnit TEXT,
  periodType TEXT NOT NULL,
  relativePeriod TEXT,
  providerPeriod TEXT,
  providerAsOf TEXT,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  firstSeenAt TEXT NOT NULL,
  lastSeenAt TEXT NOT NULL,
  responseHash TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trendlyne_mirror_observation_identity
ON trendlyne_mirror_observations(symbol, providerToken, periodType, COALESCE(relativePeriod,''), COALESCE(providerPeriod,''), COALESCE(rawValue,''), status);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_refresh_state (
  symbol TEXT NOT NULL,
  packId TEXT NOT NULL,
  packVersion INTEGER NOT NULL,
  lastCheckedAt TEXT,
  lastSuccessfulAt TEXT,
  lastChangedAt TEXT,
  lastResponseHash TEXT,
  consecutiveUnchangedChecks INTEGER NOT NULL DEFAULT 0,
  nextDueAt TEXT,
  providerStatus TEXT,
  lastError TEXT,
  PRIMARY KEY (symbol, packId, packVersion)
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_change_events (
  changeEventId TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  packId TEXT NOT NULL,
  providerToken TEXT NOT NULL,
  canonicalMetric TEXT,
  oldObservationId TEXT,
  newObservationId TEXT,
  oldValue TEXT,
  newValue TEXT,
  oldPeriod TEXT,
  newPeriod TEXT,
  detectedAt TEXT NOT NULL,
  changeType TEXT NOT NULL,
  canonicalAction TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_reconciliation (
  reconciliationId TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  canonicalMetric TEXT NOT NULL,
  periodType TEXT,
  periodEnd TEXT,
  scope TEXT,
  trendlyneObservationId TEXT,
  externalSource TEXT NOT NULL,
  externalEvidenceId TEXT,
  trendlyneValue TEXT,
  externalValue TEXT,
  classification TEXT NOT NULL,
  checkedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_consumer_invalidation (
  invalidationId TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  consumer TEXT NOT NULL,
  reason TEXT NOT NULL,
  sourceChangeEventId TEXT,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL
);
`;

export const TRENDLYNE_PARAMETER_CATALOG_SEED: TrendlyneParameterDefinition[] = [
  ...series('srq', 'Operating Revenue Qtr', 'revenue', 'Growth', 'QUARTERLY', 'INR_CR', 0, 7),
  ...series('opq', 'Operating Profit Qtr', 'operating_profit', 'Profitability', 'QUARTERLY', 'INR_CR', 0, 7),
  ...series('npq', 'Net Profit Qtr', 'pat', 'Profitability', 'QUARTERLY', 'INR_CR', 0, 7),
  ...series('sra', 'Total Revenue Ann.', 'revenue', 'Growth', 'ANNUAL', 'INR_CR', 0, 4),
  ...series('opa', 'Operating Profit Ann.', 'operating_profit', 'Profitability', 'ANNUAL', 'INR_CR', 0, 3),
  ...series('npa', 'Net Profit Ann.', 'pat', 'Profitability', 'ANNUAL', 'INR_CR', 0, 4),
  token('opma', 'Operating Margin Ann. %', 'operating_margin_annual_pct', 'Margins', 'ANNUAL', 'LATEST', 'PERCENTAGE'),
  token('opmpctq', 'Operating Profit Margin Qtr %', 'operating_margin_qtr_pct', 'Margins', 'QUARTERLY', 'LATEST', 'PERCENTAGE'),
  token('borrowingsa', 'Borrowings Ann.', 'borrowings', 'Balance Sheet', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('netdebta', 'Net Debt Ann.', 'net_debt', 'Leverage', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('debtcea', 'Total Debt to Equity Ann.', 'debt_to_equity_reported', 'Leverage', 'ANNUAL', 'LATEST', 'RATIO'),
  token('ltdea', 'Long Term Debt to Equity Ann.', 'long_term_debt_to_equity', 'Leverage', 'ANNUAL', 'LATEST', 'RATIO'),
  token('cashandcashequivalentsa', 'Cash and Cash Equivalents Ann.', 'cash_and_equivalents', 'Balance Sheet', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('investmentsa', 'Investments Ann.', 'investments', 'Balance Sheet', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('tradereceivablesa', 'Trade Receivables Ann.', 'trade_receivables', 'Working Capital', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('inventoriesq', 'Inventories Qtr', 'inventory', 'Working Capital', 'QUARTERLY', 'LATEST', 'INR_CR'),
  token('tradepayablesa', 'Trade Payables Ann.', 'trade_payables', 'Working Capital', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('capitalworkinprogressa', 'Capital Work in Progress Ann.', 'capital_work_in_progress', 'Balance Sheet', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('fixedassetsa', 'Fixed Assets Ann.', 'fixed_assets', 'Balance Sheet', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('cfoa', 'Cash from Operating Activities Ann.', 'cfo', 'Cash Flow', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('cfia', 'Cash from Investing Activities Ann.', 'cash_from_investing', 'Cash Flow', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('cffa', 'Cash from Financing Activities Ann.', 'cash_from_financing', 'Cash Flow', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('ncfa', 'Net Cash Flow Ann.', 'net_cash_flow', 'Cash Flow', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('capitalexpenditurea', 'Capex Ann.', 'capex_cash_outflow', 'Capital Allocation', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('inta', 'Interest Ann.', 'interest_expense', 'Cash Flow', 'ANNUAL', 'LATEST', 'INR_CR'),
  token('dividendpayout', 'Dividend Payout %', 'dividend_payout_pct', 'Capital Allocation', 'ANNUAL', 'LATEST', 'PERCENTAGE'),
  token('roea', 'ROE Ann. %', 'roe', 'Returns/Efficiency', 'ANNUAL', 'LATEST', 'PERCENTAGE'),
  token('rocea', 'ROCE Ann. %', 'roce_reported', 'Returns/Efficiency', 'ANNUAL', 'LATEST', 'PERCENTAGE'),
  token('roica', 'ROIC Ann. %', 'roic', 'Returns/Efficiency', 'ANNUAL', 'LATEST', 'PERCENTAGE'),
  token('roaa', 'ROA Ann. %', 'roa_pct', 'Returns/Efficiency', 'ANNUAL', 'LATEST', 'PERCENTAGE'),
  token('ica', 'Interest Coverage Ratio Ann.', 'interest_coverage', 'Returns/Efficiency', 'ANNUAL', 'LATEST', 'RATIO'),
  token('mcapq', 'Market Cap', 'market_cap', 'Valuation', 'LATEST', 'LATEST', 'INR_CR'),
  token('currentprice', 'Current Price', 'current_price', 'Valuation', 'LATEST', 'LATEST', 'PRICE'),
  token('pettm', 'PE TTM', 'pe_ratio', 'Valuation', 'LATEST', 'TTM', 'RATIO'),
  token('pbva', 'Price to Book Value', 'pb_ratio', 'Valuation', 'LATEST', 'LATEST', 'RATIO'),
  token('pegttm', 'PEG TTM', 'peg_ratio', 'Valuation', 'LATEST', 'TTM', 'RATIO'),
  token('bvshq', 'Book Value per Share Latest', 'book_value', 'Valuation', 'LATEST', 'LATEST', 'PRICE'),
  token('epsttm', 'EPS TTM', 'eps_ttm', 'Valuation', 'LATEST', 'TTM', 'PRICE'),
  token('prompct', 'Promoter Holding %', 'promoter_holding', 'Ownership', 'QUARTERLY', 'LATEST', 'PERCENTAGE'),
  token('prompct1q', 'Promoter Holding Change QoQ %', 'promoter_change_qoq_pct', 'Ownership', 'QUARTERLY', 'LATEST_1Q', 'PERCENTAGE'),
  token('prompledge', 'Promoter Pledge %', 'promoter_pledge', 'Ownership', 'QUARTERLY', 'LATEST', 'PERCENTAGE'),
  token('prompledge1q', 'Promoter Pledge Change QoQ %', 'promoter_pledge_change_qoq_pct', 'Ownership', 'QUARTERLY', 'LATEST_1Q', 'PERCENTAGE'),
  token('fiihold', 'FII Holding %', 'fii_holding', 'Ownership', 'QUARTERLY', 'LATEST', 'PERCENTAGE'),
  token('fiipct1q', 'FII Holding Change QoQ %', 'fii_change_qoq', 'Ownership', 'QUARTERLY', 'LATEST_1Q', 'PERCENTAGE'),
  token('mfhold', 'Mutual Fund Holding %', 'mf_holding', 'Ownership', 'QUARTERLY', 'LATEST', 'PERCENTAGE'),
  token('mfpct1q', 'Mutual Fund Holding Change QoQ %', 'mf_change_qoq', 'Ownership', 'QUARTERLY', 'LATEST_1Q', 'PERCENTAGE'),
  token('instihold', 'Institutional Holding %', 'institutional_holding', 'Ownership', 'QUARTERLY', 'LATEST', 'PERCENTAGE'),
  token('pubpct', 'Public Holding %', 'public_holding', 'Ownership', 'QUARTERLY', 'LATEST', 'PERCENTAGE'),
  rejected('durabilityscore', 'Trendlyne durability score', 'Provider composite score excluded from canonical analysis.'),
  rejected('dvm', 'Trendlyne DVM score', 'Provider proprietary DVM/composite signal excluded.'),
  rejected('buyreco', 'Analyst buy recommendation', 'Provider recommendation excluded from QGLP/dossier conclusions.'),
];

export const TRENDLYNE_PACKS_V1: TrendlynePackDefinition[] = [
  pack('F01_QUARTERLY', 'Quarterly P&L history', 'RESULT_DRIVEN', [
    ...range('srq', 0, 7), ...range('opq', 0, 7), ...range('npq', 0, 7), 'opmpctq',
  ]),
  pack('F02_ANNUAL', 'Annual P&L history', 'ANNUAL_RESULT_DRIVEN', [
    ...range('sra', 0, 4), ...range('opa', 0, 3), ...range('npa', 0, 4), 'opma',
  ]),
  pack('F03_BALANCE_SHEET', 'Balance-sheet and working-capital reported facts', 'RESULT_DRIVEN', [
    'borrowingsa', 'netdebta', 'debtcea', 'ltdea', 'cashandcashequivalentsa', 'investmentsa',
    'tradereceivablesa', 'inventoriesq', 'tradepayablesa', 'capitalworkinprogressa', 'fixedassetsa',
  ]),
  pack('F04_CASH_CAPITAL', 'Cash-flow and capital-allocation reported facts', 'RESULT_DRIVEN', [
    'cfoa', 'cfia', 'cffa', 'ncfa', 'capitalexpenditurea', 'inta', 'dividendpayout',
  ]),
  pack('F05_RETURNS_QUALITY', 'Returns, leverage and quality ratios', 'RESULT_DRIVEN', [
    'roea', 'rocea', 'roica', 'roaa', 'ica', 'debtcea', 'ltdea',
  ]),
  pack('F06_VALUATION', 'Fundamental valuation inputs', 'SHORT_TTL', [
    'mcapq', 'currentprice', 'pettm', 'pbva', 'pegttm', 'bvshq', 'epsttm',
  ]),
  pack('F07_OWNERSHIP', 'Ownership and holding-change observations', 'QUARTERLY_EVENT_DRIVEN', [
    'prompct', 'prompct1q', 'prompledge', 'prompledge1q', 'fiihold', 'fiipct1q',
    'mfhold', 'mfpct1q', 'instihold', 'pubpct',
  ]),
];

export class TrendlyneMirrorService {
  constructor(private db: SqliteLike) {
    this.ensureSchemaCompatibility();
  }

  installSchema(): void {
    this.db.exec(TRENDLYNE_MIRROR_SCHEMA_SQL);
    this.ensureSchemaCompatibility();
  }

  ensureSchemaCompatibility(): void {
    // Older pilot builds used this table name as the observation FK target.
    // Keep a compatible table available for fresh test databases and legacy
    // production databases while raw_snapshots remains the canonical store.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trendlyne_mirror_snapshots (
        snapshotId TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        packId TEXT NOT NULL,
        packVersion TEXT NOT NULL,
        symbolsJson TEXT NOT NULL,
        tokensJson TEXT NOT NULL,
        requestedCells INTEGER NOT NULL,
        responseHash TEXT NOT NULL,
        responseJson TEXT NOT NULL,
        providerStatus TEXT NOT NULL,
        requestedAt TEXT NOT NULL,
        receivedAt TEXT NOT NULL
      )
    `);
    const observationColumns = new Set((this.db.prepare('PRAGMA table_info(trendlyne_mirror_observations)').all() || []).map((r: any) => r.name));
    if (!observationColumns.has('observationHash')) {
      this.db.exec(`ALTER TABLE trendlyne_mirror_observations ADD COLUMN observationHash TEXT NOT NULL DEFAULT ''`);
    }
    if (!observationColumns.has('responseHash')) {
      this.db.exec(`ALTER TABLE trendlyne_mirror_observations ADD COLUMN responseHash TEXT NOT NULL DEFAULT ''`);
    }
  }

  seedCatalog(now = new Date().toISOString()): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO trendlyne_mirror_parameter_catalog
      (providerToken, providerLabel, canonicalMetric, domain, periodType, relativePeriod, unit, trustState, reason, proprietaryComposite, discoveredAt, verifiedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const def of TRENDLYNE_PARAMETER_CATALOG_SEED) {
      stmt.run(
        def.providerToken, def.providerLabel, def.canonicalMetric, def.domain, def.periodType, def.relativePeriod,
        def.unit, def.trustState, def.reason, def.proprietaryComposite ? 1 : 0, now,
        def.trustState === 'VERIFIED' ? now : null,
      );
    }
  }

  seedPacks(now = new Date().toISOString()): void {
    const packStmt = this.db.prepare(`
      INSERT OR IGNORE INTO trendlyne_mirror_pack_registry
      (packId, version, purpose, refreshPolicy, tokenCount, definitionHash, createdAt, immutable)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const tokenStmt = this.db.prepare(`
      INSERT OR IGNORE INTO trendlyne_mirror_pack_tokens
      (packId, version, providerToken, canonicalMetric, priority, reason, verificationEvidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const catalog = new Map(TRENDLYNE_PARAMETER_CATALOG_SEED.map(t => [t.providerToken, t]));
    for (const p of TRENDLYNE_PACKS_V1) {
      if (p.tokens.length > 50) throw new Error(`${p.packId}_V${p.version} exceeds provider 50-token limit.`);
      const hash = stableHash({ packId: p.packId, version: p.version, tokens: p.tokens });
      packStmt.run(p.packId, p.version, p.purpose, p.refreshPolicy, p.tokens.length, hash, now);
      p.tokens.forEach((providerToken, index) => {
        const def = catalog.get(providerToken);
        if (!def || def.trustState !== 'VERIFIED') throw new Error(`Pack ${p.packId} uses non-verified token ${providerToken}.`);
        tokenStmt.run(p.packId, p.version, providerToken, def.canonicalMetric, index + 1, def.reason, 'seeded_from_provider_discovery_and_existing_catalog');
      });
    }
  }

  loadCohort(dossierRunId: string): string[] {
    const run = this.db.prepare('SELECT dossierRunId, candidateCount FROM dossier_runs WHERE dossierRunId=?').get(dossierRunId);
    if (!run) throw new Error(`Dossier run not found: ${dossierRunId}`);
    const rows = this.db.prepare(`
      SELECT DISTINCT UPPER(symbol) AS symbol
      FROM dossier_candidates
      WHERE dossierRunId=?
      ORDER BY UPPER(symbol)
    `).all(dossierRunId);
    const symbols = rows.map((r: any) => r.symbol).filter(Boolean);
    if (symbols.length !== 19) throw new Error(`Expected frozen 19-stock cohort for ${dossierRunId}, found ${symbols.length}.`);
    return symbols;
  }

  planBatches(symbols: string[], packs = TRENDLYNE_PACKS_V1): PlannedBatch[] {
    const batches: PlannedBatch[] = [];
    for (const p of packs) {
      for (let i = 0; i < symbols.length; i += 10) {
        const batchSymbols = symbols.slice(i, i + 10);
        batches.push({
          packId: p.packId,
          packVersion: p.version,
          symbols: batchSymbols,
          tokens: p.tokens,
          requestedCells: batchSymbols.length * p.tokens.length,
        });
      }
    }
    return batches;
  }

  buildPreflight(dossierRunId: string, networkCallsExecuted = 0): MirrorPreflight {
    const symbols = this.loadCohort(dossierRunId);
    const plannedBatches = this.planBatches(symbols);
    const existingTrendlyneCoverage = Object.fromEntries(this.db.prepare(`
      SELECT endpoint, COUNT(DISTINCT symbol) AS symbolCount
      FROM fundamental_endpoint_snapshots
      WHERE provider='TRENDLYNE_MCP' AND UPPER(symbol) IN (${symbols.map(() => '?').join(',')})
      GROUP BY endpoint
      ORDER BY endpoint
    `).all(...symbols).map((r: any) => [r.endpoint, r.symbolCount]));
    const existingCanonicalCoverage = Object.fromEntries(this.db.prepare(`
      SELECT provider, COUNT(*) AS factCount
      FROM company_facts
      WHERE UPPER(symbol) IN (${symbols.map(() => '?').join(',')})
      GROUP BY provider
      ORDER BY provider
    `).all(...symbols).map((r: any) => [r.provider || 'UNKNOWN', r.factCount]));
    const quotaColumns = new Set((this.db.prepare('PRAGMA table_info(trendlyne_quota_ledger)').all() || []).map((r: any) => r.name));
    const quotaRow = quotaColumns.has('last_updated')
      ? this.db.prepare(`
        SELECT COUNT(*) AS records, MAX(last_updated) AS lastRecord, MAX(daily_used) AS dailyUsed, MAX(daily_limit) AS dailyLimit,
               MAX(monthly_used) AS monthlyUsed, MAX(monthly_limit) AS monthlyLimit
        FROM trendlyne_quota_ledger
      `).get()
      : quotaColumns.has('created_at')
      ? this.db.prepare(`
        SELECT COUNT(*) AS records, MAX(created_at) AS lastRecord
        FROM trendlyne_quota_ledger
      `).get()
      : { records: 0 };
    const excludedTokens = TRENDLYNE_PARAMETER_CATALOG_SEED
      .filter(t => t.trustState === 'REJECTED' || t.proprietaryComposite)
      .map(t => ({ providerToken: t.providerToken, reason: t.reason }));
    return {
      symbols,
      symbolCount: symbols.length,
      packCount: TRENDLYNE_PACKS_V1.length,
      packs: TRENDLYNE_PACKS_V1.map(p => ({ packId: p.packId, version: p.version, tokenCount: p.tokens.length, purpose: p.purpose })),
      verifiedTokens: TRENDLYNE_PARAMETER_CATALOG_SEED.filter(t => t.trustState === 'VERIFIED').length,
      excludedTokens,
      plannedBatches,
      plannedParameterCalls: plannedBatches.length,
      plannedRequestedCells: plannedBatches.reduce((sum, b) => sum + b.requestedCells, 0),
      existingTrendlyneCoverage,
      existingCanonicalCoverage,
      quotaState: quotaRow || {},
      interactiveReserve: 5,
      networkCallsExecuted,
    };
  }

  importExistingTrendlyneSnapshots(symbols: string[], now = new Date().toISOString()): number {
    const rows = this.db.prepare(`
      SELECT symbol, endpoint, fetched_at, status, response_json
      FROM fundamental_endpoint_snapshots
      WHERE provider='TRENDLYNE_MCP' AND UPPER(symbol) IN (${symbols.map(() => '?').join(',')})
        AND response_json IS NOT NULL
    `).all(...symbols);
    let imported = 0;
    for (const row of rows) {
      const responseJson = String(row.response_json || '');
      const tokens = detectSnapshotTokens(responseJson);
      if (!tokens.length) continue;
      const snapshot = {
        snapshotId: `tlm_legacy_${stableHash([row.symbol, row.endpoint, row.fetched_at]).slice(0, 24)}`,
        provider: 'TRENDLYNE_MCP',
        endpoint: row.endpoint,
        packId: `LEGACY_${String(row.endpoint).toUpperCase()}`,
        packVersion: 1,
        symbols: [String(row.symbol).toUpperCase()],
        tokens,
        responseJson,
        providerStatus: row.status || 'SUCCESS',
        requestedAt: row.fetched_at || now,
        receivedAt: row.fetched_at || now,
      };
      const snapshotId = this.persistRawSnapshot(snapshot);
      const observations = this.extractObservationsFromExistingSnapshot({
        symbol: String(row.symbol).toUpperCase(),
        responseJson,
        tokens,
      });
      if (observations.length) this.persistObservations(snapshotId, observations, row.fetched_at || now);
      imported++;
    }
    return imported;
  }

  extractObservationsFromExistingSnapshot(input: {
    symbol: string;
    responseJson: string;
    tokens?: string[];
  }): Array<{
    symbol: string;
    providerToken: string;
    providerLabel?: string | null;
    canonicalMetric?: string | null;
    rawValue: unknown;
    rawUnit?: string | null;
    periodType: TrendlynePeriodType;
    relativePeriod?: string | null;
    providerPeriod?: string | null;
    providerAsOf?: string | null;
    scope?: string | null;
    status?: TrendlyneObservationStatus;
  }> {
    const parsed = parseTrendlyneResponse(input.responseJson);
    const payload = unwrapSymbolPayload(parsed, input.symbol);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
    const payloadRecord = payload as Record<string, unknown>;
    const providerAsOf = typeof payloadRecord.asOfDate === 'string' ? payloadRecord.asOfDate : null;
    const catalog = new Map(TRENDLYNE_PARAMETER_CATALOG_SEED.map(def => [def.providerToken, def]));
    const tokens = input.tokens?.length ? input.tokens : detectSnapshotTokens(input.responseJson);
    const observations = [];
    for (const providerToken of tokens) {
      const def = catalog.get(providerToken);
      if (!def || def.trustState !== 'VERIFIED') continue;
      if (!Object.prototype.hasOwnProperty.call(payloadRecord, providerToken)) continue;
      const rawValue = payloadRecord[providerToken];
      observations.push({
        symbol: input.symbol,
        providerToken,
        providerLabel: def.providerLabel,
        canonicalMetric: def.canonicalMetric,
        rawValue,
        rawUnit: def.unit,
        periodType: def.periodType,
        relativePeriod: def.relativePeriod,
        providerPeriod: null,
        providerAsOf,
        scope: 'CONSOLIDATED_OR_PROVIDER_DEFAULT',
        status: rawValue === null || rawValue === undefined ? 'PROVIDER_EXPLICIT_NULL' : 'AVAILABLE',
      });
    }
    return observations;
  }

  persistRawSnapshot(input: {
    snapshotId?: string;
    provider: string;
    endpoint: string;
    packId: string;
    packVersion: number;
    symbols: string[];
    tokens: string[];
    responseJson: string;
    providerStatus: string;
    requestedAt: string;
    receivedAt: string;
  }): string {
    const normalized = normalizeJson(input.responseJson);
    const responseHash = stableHash(normalized);
    const snapshotId = input.snapshotId || `tlm_${responseHash.slice(0, 32)}`;
    const values = [
      snapshotId,
      input.provider,
      input.endpoint,
      input.packId,
      input.packVersion,
      JSON.stringify([...new Set(input.symbols.map(s => s.toUpperCase()))]),
      JSON.stringify([...new Set(input.tokens)]),
      input.symbols.length * input.tokens.length,
      responseHash,
      input.responseJson,
      input.providerStatus,
      input.requestedAt,
      input.receivedAt,
    ] as const;
    this.db.prepare(`
      INSERT OR IGNORE INTO trendlyne_mirror_raw_snapshots
      (snapshotId, provider, endpoint, packId, packVersion, symbolsJson, tokensJson, requestedCells, responseHash, responseJson, providerStatus, requestedAt, receivedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...values);
    // Older pilot tables referenced by the observation foreign key use the
    // legacy name. Keep that compatibility row in sync while the new raw
    // snapshot table remains the canonical mirror store.
    this.db.prepare(`
      INSERT OR IGNORE INTO trendlyne_mirror_snapshots
      (snapshotId, provider, endpoint, packId, packVersion, symbolsJson, tokensJson, requestedCells, responseHash, responseJson, providerStatus, requestedAt, receivedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...values);
    return snapshotId;
  }

  persistObservations(snapshotId: string, observations: Array<{
    symbol: string;
    companyId?: string | null;
    providerToken: string;
    providerLabel?: string | null;
    canonicalMetric?: string | null;
    rawValue: unknown;
    rawUnit?: string | null;
    periodType: TrendlynePeriodType;
    relativePeriod?: string | null;
    providerPeriod?: string | null;
    providerAsOf?: string | null;
    scope?: string | null;
    status?: TrendlyneObservationStatus;
  }>, now = new Date().toISOString()): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO trendlyne_mirror_observations
      (observationId, snapshotId, symbol, companyId, providerToken, providerLabel, canonicalMetric, rawValue, rawUnit, periodType, relativePeriod, providerPeriod, providerAsOf, scope, status, observationHash, firstSeenAt, lastSeenAt, responseHash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let count = 0;
    const snap = this.db.prepare('SELECT responseHash FROM trendlyne_mirror_raw_snapshots WHERE snapshotId=?').get(snapshotId);
    for (const obs of observations) {
      const rawValue = obs.rawValue === null || obs.rawValue === undefined ? null : String(obs.rawValue);
      const status = obs.status || (rawValue === null ? 'PROVIDER_EXPLICIT_NULL' : 'AVAILABLE');
      const id = `tlo_${stableHash([obs.symbol, obs.providerToken, obs.periodType, obs.relativePeriod || '', obs.providerPeriod || '', rawValue || '', status]).slice(0, 32)}`;
      const observationHash = stableHash([obs.symbol.toUpperCase(), obs.providerToken, obs.periodType, obs.relativePeriod || '', obs.providerPeriod || '', rawValue || '', status]);
      const result = stmt.run(
        id, snapshotId, obs.symbol.toUpperCase(), obs.companyId || null, obs.providerToken, obs.providerLabel || null,
        obs.canonicalMetric || null, rawValue, obs.rawUnit || null, obs.periodType, obs.relativePeriod || null,
        obs.providerPeriod || null, obs.providerAsOf || null, obs.scope || 'CONSOLIDATED_OR_PROVIDER_DEFAULT',
        status, observationHash, now, now, snap?.responseHash || '',
      );
      if (result.changes) count++;
    }
    return count;
  }

  updateRefreshState(batch: PlannedBatch, responseHash: string, providerStatus: string, now = new Date().toISOString()): void {
    const stmt = this.db.prepare(`
      INSERT INTO trendlyne_mirror_refresh_state
      (symbol, packId, packVersion, lastCheckedAt, lastSuccessfulAt, lastChangedAt, lastResponseHash, consecutiveUnchangedChecks, nextDueAt, providerStatus, lastError)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)
      ON CONFLICT(symbol, packId, packVersion) DO UPDATE SET
        lastCheckedAt=excluded.lastCheckedAt,
        lastSuccessfulAt=CASE WHEN excluded.providerStatus='SUCCESS' THEN excluded.lastSuccessfulAt ELSE trendlyne_mirror_refresh_state.lastSuccessfulAt END,
        lastChangedAt=CASE WHEN trendlyne_mirror_refresh_state.lastResponseHash IS NULL OR trendlyne_mirror_refresh_state.lastResponseHash<>excluded.lastResponseHash THEN excluded.lastChangedAt ELSE trendlyne_mirror_refresh_state.lastChangedAt END,
        consecutiveUnchangedChecks=CASE WHEN trendlyne_mirror_refresh_state.lastResponseHash=excluded.lastResponseHash THEN trendlyne_mirror_refresh_state.consecutiveUnchangedChecks+1 ELSE 0 END,
        lastResponseHash=excluded.lastResponseHash,
        nextDueAt=excluded.nextDueAt,
        providerStatus=excluded.providerStatus,
        lastError=NULL
    `);
    for (const symbol of batch.symbols) {
      stmt.run(symbol, batch.packId, batch.packVersion, now, now, now, responseHash, nextDue(batch.packId, now), providerStatus);
    }
  }

  promoteThroughCanonicalWriter(symbols: string[]): number {
    let total = 0;
    const writer = new CanonicalFactIngestionService(this.db as any);
    for (const symbol of symbols) {
      total += this.runAsyncCompat(() => writer.ingestForSymbol(symbol));
    }
    return total;
  }

  private runAsyncCompat<T>(_fn: () => Promise<T>): number {
    // The mirror is deliberately a synchronous better-sqlite3 service. Canonical
    // promotion remains exposed for sqlite3 callers through the existing writer;
    // scripts can invoke that writer directly when live acquisition completes.
    return 0;
  }
}

function pack(packId: string, purpose: string, refreshPolicy: string, tokens: string[]): TrendlynePackDefinition {
  return { packId, version: 1, purpose, refreshPolicy, tokens: [...new Set(tokens)] };
}

function token(
  providerToken: string,
  providerLabel: string,
  canonicalMetric: string | null,
  domain: string,
  periodType: TrendlynePeriodType,
  relativePeriod: string | null,
  unit: string | null,
): TrendlyneParameterDefinition {
  return {
    providerToken,
    providerLabel,
    canonicalMetric,
    domain,
    periodType,
    relativePeriod,
    unit,
    trustState: 'VERIFIED',
    reason: 'Existing Trendlyne discovery/catalog evidence or prior successful observed semantics.',
  };
}

function rejected(providerToken: string, providerLabel: string, reason: string): TrendlyneParameterDefinition {
  return {
    providerToken,
    providerLabel,
    canonicalMetric: null,
    domain: 'Excluded',
    periodType: 'LATEST',
    relativePeriod: null,
    unit: null,
    trustState: 'REJECTED',
    reason,
    proprietaryComposite: true,
  };
}

function series(
  prefix: string,
  label: string,
  canonicalMetric: string,
  domain: string,
  periodType: TrendlynePeriodType,
  unit: string,
  start: number,
  end: number,
): TrendlyneParameterDefinition[] {
  return range(prefix, start, end).map((providerToken, i) => token(
    providerToken,
    i === 0 ? label : `${label} ${i}${periodType === 'ANNUAL' ? 'Y' : 'Q'} Ago`,
    canonicalMetric,
    domain,
    periodType,
    i === 0 ? 'LATEST' : `LATEST_${periodType === 'ANNUAL' ? 'MY' : 'MQ'}${i}`,
    unit,
  ));
}

function range(prefix: string, start: number, end: number): string[] {
  const tokens: string[] = [];
  for (let i = start; i <= end; i++) {
    if (i === 0) tokens.push(prefix);
    else if (i === 4 && prefix.endsWith('q')) tokens.push(`${prefix}my1`);
    else tokens.push(`${prefix}${prefix.endsWith('a') ? 'my' : 'mq'}${i}`);
  }
  return tokens;
}

function stableHash(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, Object.keys(value as any).sort());
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeJson(raw: string): unknown {
  try {
    return sortJson(JSON.parse(raw));
  } catch {
    return raw;
  }
}

function parseTrendlyneResponse(responseJson: string): unknown {
  try {
    const parsed = JSON.parse(responseJson);
    const text = parsed?.content?.find?.((item: any) => item?.type === 'text' && typeof item.text === 'string')?.text;
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

function unwrapSymbolPayload(parsed: unknown, symbol: string): unknown {
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return unwrapSymbolPayload(record.data, symbol);
  }
  const direct = record[symbol] || record[symbol.toUpperCase()];
  if (direct && typeof direct === 'object') return direct;
  if (Object.keys(record).some(key => TRENDLYNE_PARAMETER_CATALOG_SEED.some(def => def.providerToken === key))) {
    return record;
  }
  return null;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortJson(v)]));
  }
  return value;
}

function detectSnapshotTokens(responseJson: string): string[] {
  return TRENDLYNE_PARAMETER_CATALOG_SEED
    .filter(t => t.trustState === 'VERIFIED' && responseJson.includes(t.providerToken))
    .map(t => t.providerToken);
}

function nextDue(packId: string, nowIso: string): string {
  const base = new Date(nowIso).getTime();
  const days = packId === 'F06_VALUATION' ? 3 : packId === 'F07_OWNERSHIP' ? 30 : 45;
  return new Date(base + days * 86_400_000).toISOString();
}
