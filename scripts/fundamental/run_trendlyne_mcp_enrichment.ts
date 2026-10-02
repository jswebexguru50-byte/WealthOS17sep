#!/usr/bin/env tsx
/**
 * Deterministic Trendlyne MCP acquisition.
 * Captures raw provider evidence only: no LLM, score, or inferred value.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sqlite3 from 'sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type Row = Record<string, unknown>;
type SnapshotStatus = 'SUCCESS' | 'SOURCE_UNAVAILABLE' | 'DATA_INSUFFICIENT';
type TrendlyneFieldMapping = {
  token: string;
  providerLabel: string;
  canonicalMetric: string;
  periodType: 'QUARTERLY' | 'ANNUAL' | 'LATEST';
  relativeOffset: number | null;
  unit: 'INR_CR' | 'PERCENTAGE' | 'RATIO' | 'PRICE' | 'COUNT';
  promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' | 'ANNUAL_FY_ANCHOR_REQUIRED' | 'CURRENT_SNAPSHOT_ONLY';
  notes?: string;
};
const root = path.resolve(process.cwd());
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const manifestArgumentIndex = process.argv.indexOf('--manifest');
const manifestPath = manifestArgumentIndex >= 0
  ? path.resolve(root, process.argv[manifestArgumentIndex + 1])
  : path.join(dataDir, 'excel_strategy_manifest.json');
const progressArgumentIndex = process.argv.indexOf('--progress-path');
const progressPath = progressArgumentIndex >= 0
  ? path.resolve(root, process.argv[progressArgumentIndex + 1])
  : path.join(dataDir, process.argv.includes('--quarterly-profit-history')
  ? 'trendlyne_quarterly_history_progress.json'
  : process.argv.includes('--statement-history-pack')
  ? 'trendlyne_statement_history_progress.json'
  : 'trendlyne_mcp_progress.json');
const toolSchemaPath = path.join(dataDir, 'trendlyne_mcp_tool_schema.json');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const force = process.argv.includes('--force');
const discoverOnly = process.argv.includes('--discover-tools');
const discoverParameters = process.argv.includes('--discover-parameters');
const quarterlyHistoryOnly = process.argv.includes('--quarterly-profit-history');
const statementHistoryPack = process.argv.includes('--statement-history-pack');
const parametersOnly = process.argv.includes('--parameters-only');
// A parameter request consumes a provider call even when its final batch has
// only a few symbols.  Normal scheduled runs therefore retain a tail until it
// can be compacted with later due symbols.  An operator may opt in for an
// explicit one-off completion request.
const allowPartialBatch = process.argv.includes('--allow-partial-batch');
const parameterQueryIndexes = process.argv.reduce<number[]>((indexes, argument, index) => argument === '--parameter-query' ? [...indexes, index] : indexes, []);
const customParameterQueries = parameterQueryIndexes.map(index => process.argv[index + 1]).filter((value): value is string => Boolean(value));
const maxSymbolsIndex = process.argv.indexOf('--max-symbols');
const maxSymbols = maxSymbolsIndex >= 0 ? Math.max(0, Number(process.argv[maxSymbolsIndex + 1])) : 0;
const delayIndex = process.argv.indexOf('--delay-ms');
const delayMs = delayIndex >= 0 ? Math.max(500, Number(process.argv[delayIndex + 1])) : 1000;
const parameterCatalogPath = path.join(dataDir, 'trendlyne_parameter_catalog.json');
const acquisitionContractPath = path.join(dataDir, 'trendlyne_statement_history_acquisition_contract.json');

// Exact tokens verified against the live provider. Add tokens only after a
// successful search_financial_parameters lookup; never guess provider keys.
const verifiedParameterCodes = [
  // Valuation, size and capital structure
  'currentprice', 'mcapq', 'pettm', 'bvshq', 'debtcea', 'ltdea', 'netdebta',
  // Returns and profitability
  'roea', 'rocea', 'roica', 'roaa', 'opma', 'opa', 'opq', 'reportedpatq', 'npq', 'totalsrq',
  // Cash generation
  'cfoa', 'cfoagrowth', 'ncfa', 'cepsa',
  // Ownership. Institutional aggregate and mutual funds are retained as the
  // provider labels them; they are not relabelled as DII.
  'prompct', 'prompct1q', 'prompledge', 'prompledge1q',
  'fiihold', 'fiipct1q', 'instihold', 'instipct1q', 'mfhold', 'mfpct1q',
  // Provider-catalogue verified longer-horizon ownership context. These fill
  // the remaining slots in the provider's 50-parameter request limit.
  'prompct4q', 'fiipct4q', 'pubpct',
  // Distributions
  'dividendpayout', 'dividendpayoutnpa', 'dividendpersharea',
  // Expert additions: Forensic & Valuation adjustments
  'contingentliabilitiesa', 'currentdebtcapleaseobligationa', 'inventoriesq', 
  'finishedgoodsq', 'tradereceivablesa', 'sra', 
  'insidersellmonthplustoday', 'delivery6mavg', 'capitalexpenditurea', 
  'extraordinaryitemqmq6', 'pitroskif', 'ebita', 'wcq'
];
const quarterlyProfitHistoryCodes = ['npq', 'npqmq1', 'npqmq2', 'npqmq3', 'npqmy1', 'npqmq5', 'npqmq6', 'npqmq7'];
// Full 50-token deterministic statement/quality pack for high-completeness
// fundamental analysis. This is the source of truth for both fetch and parse.
// Relative quarter/year labels must be anchored before being promoted as dated
// facts. Do not add/rename tokens without a successful provider discovery.
const statementHistoryFieldMappings: TrendlyneFieldMapping[] = [
  { token: 'srq', providerLabel: 'Operating Rev. Qtr', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'srqmq1', providerLabel: 'Operating Rev.1Q Ago', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'srqmq2', providerLabel: 'Operating Rev. 2Q ago', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 2, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'srqmq3', providerLabel: 'Operating Rev. 3Q ago', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 3, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'srqmy1', providerLabel: 'Operating Rev. 4Q ago', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 4, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'srqmq5', providerLabel: 'Operating Rev. 5Q ago', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 5, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'srqmq6', providerLabel: 'Operating Rev. 6Q ago', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 6, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'srqmq7', providerLabel: 'Operating Rev. 7Q ago', canonicalMetric: 'revenue', periodType: 'QUARTERLY', relativeOffset: 7, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },

  { token: 'opq', providerLabel: 'Operating Profit Qtr', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'opqmq1', providerLabel: 'Operating Profit 1Q Ago', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'opqmq2', providerLabel: 'Operating Profit 2Q Ago', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 2, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'opqmq3', providerLabel: 'Operating Profit 3Q Ago', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 3, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'opqmy1', providerLabel: 'Operating Profit 4Q Ago', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 4, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'opqmq5', providerLabel: 'Operating Profit 5Qtr Ago', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 5, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'opqmq6', providerLabel: 'Operating Profit 6Qtr Ago', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 6, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'opqmq7', providerLabel: 'Operating Profit 7Qtr Ago', canonicalMetric: 'operating_profit', periodType: 'QUARTERLY', relativeOffset: 7, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },

  { token: 'npq', providerLabel: 'Net Profit Qtr', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'npqmq1', providerLabel: 'Net Profit 1Q Ago', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'npqmq2', providerLabel: 'Net Profit 2Q Ago', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 2, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'npqmq3', providerLabel: 'Net Profit 3Q Ago', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 3, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'npqmy1', providerLabel: 'Net Profit 4Q Ago', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 4, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'npqmq5', providerLabel: 'Net Profit 5Q Ago', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 5, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'npqmq6', providerLabel: 'Net Profit 6Q Ago', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 6, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'npqmq7', providerLabel: 'Net Profit 7Q Ago', canonicalMetric: 'pat', periodType: 'QUARTERLY', relativeOffset: 7, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },

  { token: 'sra', providerLabel: 'Total Rev. Ann.', canonicalMetric: 'revenue', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'sramy1', providerLabel: 'Total Rev. Ann. 1Y Ago', canonicalMetric: 'revenue', periodType: 'ANNUAL', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'sramy2', providerLabel: 'Rev. Ann. 2Y ago', canonicalMetric: 'revenue', periodType: 'ANNUAL', relativeOffset: 2, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'sramy3', providerLabel: 'Rev. Ann. 3Y ago', canonicalMetric: 'revenue', periodType: 'ANNUAL', relativeOffset: 3, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'opa', providerLabel: 'Operating Profit Ann.', canonicalMetric: 'operating_profit', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'opamy1', providerLabel: 'Operating Profit Ann. 1Y Ago', canonicalMetric: 'operating_profit', periodType: 'ANNUAL', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'opamy2', providerLabel: 'Operating Profit Ann. 2Y ago', canonicalMetric: 'operating_profit', periodType: 'ANNUAL', relativeOffset: 2, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'npamy1', providerLabel: 'Net Profit Ann. 1Y Ago', canonicalMetric: 'pat', periodType: 'ANNUAL', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'npamy2', providerLabel: 'Net Profit Ann. 2Y ago', canonicalMetric: 'pat', periodType: 'ANNUAL', relativeOffset: 2, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'cfoa', providerLabel: 'Cash from Operating Act. Ann.', canonicalMetric: 'cfo', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'cfoamy1', providerLabel: 'Cash from Operating Act. Ann. 1Y Ago', canonicalMetric: 'cfo', periodType: 'ANNUAL', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'cfoamy2', providerLabel: 'Cash from Operating Act. Ann. 2Y Ago', canonicalMetric: 'cfo', periodType: 'ANNUAL', relativeOffset: 2, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'cfia', providerLabel: 'Cash from Investing Act. Ann.', canonicalMetric: 'cash_from_investing', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'cfiamy1', providerLabel: 'Cash from Investing Act. Ann. 1Y Ago', canonicalMetric: 'cash_from_investing', periodType: 'ANNUAL', relativeOffset: 1, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'capitalexpenditurea', providerLabel: 'Capex Ann.', canonicalMetric: 'capex_cash_outflow', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'capitalexpenditureq', providerLabel: 'Capex Qtr', canonicalMetric: 'capex_cash_outflow', periodType: 'QUARTERLY', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'EXPLICIT_QUARTER_ANCHOR_REQUIRED' },
  { token: 'capitalworkinprogressa', providerLabel: 'Capital Work In Progress Ann.', canonicalMetric: 'capital_work_in_progress', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'borrowingsa', providerLabel: 'Borrowings Ann.', canonicalMetric: 'borrowings', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'inta', providerLabel: 'Interest Ann.', canonicalMetric: 'interest_expense', periodType: 'ANNUAL', relativeOffset: 0, unit: 'INR_CR', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },

  { token: 'mcapq', providerLabel: 'Market Cap', canonicalMetric: 'market_cap', periodType: 'LATEST', relativeOffset: null, unit: 'INR_CR', promotionPolicy: 'CURRENT_SNAPSHOT_ONLY' },
  { token: 'pettm', providerLabel: 'PE TTM', canonicalMetric: 'pe_ratio', periodType: 'LATEST', relativeOffset: null, unit: 'RATIO', promotionPolicy: 'CURRENT_SNAPSHOT_ONLY' },
  { token: 'bvshq', providerLabel: 'BVSH Latest', canonicalMetric: 'book_value', periodType: 'LATEST', relativeOffset: null, unit: 'PRICE', promotionPolicy: 'CURRENT_SNAPSHOT_ONLY' },
  { token: 'debtcea', providerLabel: 'Total Debt to Total Equity Ann.', canonicalMetric: 'debt_to_equity_reported', periodType: 'ANNUAL', relativeOffset: 0, unit: 'RATIO', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'roea', providerLabel: 'ROE Ann. %', canonicalMetric: 'roe', periodType: 'ANNUAL', relativeOffset: 0, unit: 'PERCENTAGE', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'rocea', providerLabel: 'ROCE Ann. %', canonicalMetric: 'roce_reported', periodType: 'ANNUAL', relativeOffset: 0, unit: 'PERCENTAGE', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
  { token: 'roica', providerLabel: 'ROIC Ann. %', canonicalMetric: 'roic', periodType: 'ANNUAL', relativeOffset: 0, unit: 'PERCENTAGE', promotionPolicy: 'ANNUAL_FY_ANCHOR_REQUIRED' },
];
const statementHistoryParameterCodes = statementHistoryFieldMappings.map(field => field.token);
const parameterDiscoveryQueries = [
  'promoter holding percentage', 'promoter pledged shares percentage',
  'FII holding percentage', 'DII holding percentage', 'FII holding quarterly change', 'DII holding quarterly change',
  'cash from operating activities annual', 'net cash flow annual', 'operating profit annual',
  'profit after tax quarterly', 'sales quarterly', 'debt to equity annual',
  'return on equity annual', 'return on capital employed annual', 'market capitalization',
  'free cash flow annual', 'book value per share', 'dividend payout ratio',
];
const profiles = [
  { endpoint: 'parameters', tool: 'get_stock_parameter_values', ttlDays: 15 },
  { endpoint: 'overview', tool: 'get_overview_news_corp_events', ttlDays: 15, type: 'overview' },
  { endpoint: 'corporate_events', tool: 'get_overview_news_corp_events', ttlDays: 15, type: 'events' },
  { endpoint: 'shareholding', tool: 'get_ownership_deals_insider_sast', ttlDays: 15, type: 'shareholding' },
  { endpoint: 'documents', tool: 'get_document_search_results', ttlDays: 30 },
] as const;

function endpointUrl(): string | undefined {
  const env = process.env.TRENDLYNE_MCP_URL?.trim();
  if (env && !env.includes('\x16')) return env;
  for (const configPath of [path.join(root, '.agents', 'mcp_config.json'), path.join(process.env.USERPROFILE || '', '.gemini', 'config', 'mcp_config.json')]) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const url = config.mcpServers?.trendlyne?.url || config.mcpServers?.trendlyne?.serverUrl;
      if (typeof url === 'string' && url.trim() && !url.includes('\x16')) return url.trim();
    } catch { /* local config absent or malformed */ }
  }
  return undefined;
}
const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve((rows || []) as Row[])));
const run = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Multiple deterministic jobs may update separate stages in the same
  // workspace. A PID-specific temporary path prevents one job from moving
  // another job's progress file on Windows/OneDrive.
  const temporary = `${file}.${process.pid}.tmp`;
  const payload = JSON.stringify(value, null, 2);
  fs.writeFileSync(temporary, payload);
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    // OneDrive/Windows can transiently lock JSON progress files.  Progress
    // files are observability artifacts, so fall back to a direct overwrite
    // instead of aborting the provider batch after evidence has been saved.
    fs.writeFileSync(file, payload);
    try { fs.unlinkSync(temporary); } catch { /* best-effort cleanup */ }
  }
}
function writeProgress(value: unknown) { writeJson(progressPath, value); }

function writeStatementHistoryAcquisitionContract() {
  writeJson(acquisitionContractPath, {
    provider: 'TRENDLYNE_MCP',
    endpoint: 'statement_history_parameters',
    generatedAt: now(),
    maxSymbolsPerCall: 10,
    maxMetricsPerCall: 50,
    requestedMetricCount: statementHistoryParameterCodes.length,
    parameterCodes: statementHistoryParameterCodes,
    fieldMappings: statementHistoryFieldMappings,
    promotionRules: {
      EXPLICIT_QUARTER_ANCHOR_REQUIRED: [
        'Provider relative quarter labels such as 1Q Ago / 2Q Ago are not promoted as dated company_facts unless the same symbol has explicit Trendlyne quarter-end labels from a verified shareholding/period anchor.',
        'Values remain raw provider snapshots when no explicit anchor exists.',
      ],
      ANNUAL_FY_ANCHOR_REQUIRED: [
        'Provider relative annual labels are anchored only from a same-symbol explicit latest quarter-end label.',
        'Derived annual period ends use Indian March fiscal year-end and remain VERIFIED_PARTIAL until official filing evidence independently confirms the exact period.',
      ],
      CURRENT_SNAPSHOT_ONLY: [
        'Latest point-in-time provider values are retained as current snapshots and are not treated as historical dated facts.',
      ],
    },
    nonSyntheticPolicy: 'No missing value is defaulted or inferred. Unavailable provider values remain unavailable.',
  });
}

async function requireEvidenceTables(db: sqlite3.Database) {
  const rows = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('fundamental_endpoint_snapshots','fundamental_source_snapshots')");
  const names = new Set(rows.map(row => String(row.name)));
  const missing = ['fundamental_endpoint_snapshots', 'fundamental_source_snapshots'].filter(name => !names.has(name));
  if (missing.length) throw new Error(`Required evidence table(s) missing: ${missing.join(', ')}. No schema change was made.`);
}
async function isFresh(db: sqlite3.Database, symbol: string, endpoint: string, ttlDays: number) {
  if (force) return false;
  const rows = await all(db, "SELECT fetched_at,status FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND symbol=? AND endpoint=? LIMIT 1", [symbol, endpoint]);
  const row = rows[0];
  const timestamp = typeof row?.fetched_at === 'string' ? Date.parse(row.fetched_at) : NaN;
  return row?.status === 'SUCCESS' && Number.isFinite(timestamp) && Date.now() - timestamp < ttlDays * 86_400_000;
}
async function save(db: sqlite3.Database, symbol: string, endpoint: string, status: SnapshotStatus, response: unknown, error: string | null) {
  const fetchedAt = now();
  const raw = response === undefined ? null : JSON.stringify(response);
  await run(db, `INSERT OR REPLACE INTO fundamental_endpoint_snapshots
    (symbol,isin,provider,endpoint,authority,source_url,fetched_at,status,http_status,error,response_json)
    VALUES (?,NULL,'TRENDLYNE_MCP',?,'LICENSED_PROVIDER',?,?,?,NULL,?,?)`, [symbol, endpoint, `mcp://trendlyne/${endpoint}`, fetchedAt, status, error, raw]);
  // Historical raw evidence is retained independently of the current endpoint cache.
  await run(db, `INSERT INTO fundamental_source_snapshots
    (symbol,isin,provider,authority,source_url,fetched_at,status,error,response_json)
    VALUES (?,NULL,'TRENDLYNE_MCP','LICENSED_PROVIDER',?,?,?,?,?)`, [symbol, `mcp://trendlyne/${endpoint}`, fetchedAt, status, error, raw]);
}
function props(tool: any): Record<string, unknown> { return tool?.inputSchema?.properties || tool?.input_schema?.properties || {}; }
function identifierArgs(tool: any, symbol: string, type?: string): Record<string, unknown> | null {
  const schema = props(tool);
  if ('stock_codes' in schema) return { stock_codes: [symbol], ...(type ? { type } : {}) };
  const key = ['stock_code', 'symbol', 'ticker', 'security_id'].find(name => name in schema);
  return key ? { [key]: symbol, ...(type ? { type } : {}) } : null;
}
function parameterArgs(tool: any, symbols: string[], codes: string[]): Record<string, unknown> | null {
  const schema = props(tool);
  if ('stock_codes' in schema) return { stock_codes: symbols, parameters: codes };
  if (symbols.length === 1) {
    const identity = identifierArgs(tool, symbols[0]);
    return identity ? { ...identity, parameters: codes } : null;
  }
  return null;
}
function documentArgs(tool: any, symbol: string): Record<string, unknown> | null {
  return 'query' in props(tool) ? { query: `${symbol} annual report financial statements management commentary` } : null;
}
function decode(result: any) { return { isError: Boolean(result?.isError), content: result?.content ?? [], structuredContent: result?.structuredContent ?? null }; }
function providerPayload(payload: any): any | null {
  const text = payload?.content?.find?.((item: any) => item?.type === 'text' && typeof item.text === 'string')?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
function providerErrorMessage(payload: any): string | null {
  if (payload?.isError) return 'MCP_TOOL_RETURNED_ERROR';
  const parsed = providerPayload(payload);
  if (parsed?.status === 'error') return typeof parsed.message === 'string' ? parsed.message : 'PROVIDER_STATUS_ERROR';
  return null;
}
function chunks<T>(items: T[], size: number): T[][] { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)); }

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run fundamental:trendlyne -- [--manifest path] [--progress-path path] [--discover-tools] [--discover-parameters] [--quarterly-profit-history] [--statement-history-pack] [--parameters-only] [--allow-partial-batch] [--max-symbols N] [--delay-ms N] [--force]');
    return;
  }
  if (statementHistoryPack && maxSymbolsIndex >= 0 && maxSymbols === 0) {
    if (statementHistoryParameterCodes.length !== 50) {
      throw new Error(`PACK_CONFIGURATION_ERROR: expected exactly 50 Trendlyne parameter tokens, received ${statementHistoryParameterCodes.length}.`);
    }
    if (new Set(statementHistoryParameterCodes).size !== statementHistoryParameterCodes.length) {
      throw new Error('PACK_CONFIGURATION_ERROR: Trendlyne statement-history pack contains duplicate tokens.');
    }
    writeStatementHistoryAcquisitionContract();
    writeProgress({
      status: 'CONTRACT_WRITTEN',
      provider: 'TRENDLYNE_MCP',
      endpoint: 'statement_history_parameters',
      requestedParameterCodes: statementHistoryParameterCodes,
      acquisitionContractPath: path.relative(root, acquisitionContractPath),
      llmCalls: 0,
      updatedAt: now(),
    });
    console.log(`Wrote Trendlyne statement-history acquisition contract: ${acquisitionContractPath}`);
    return;
  }
  const url = endpointUrl();
  if (!url) {
    writeProgress({ status: 'BLOCKED_AUTH', message: 'Trendlyne MCP configuration absent or invalid; no request made.', updatedAt: now(), llmCalls: 0 });
    process.exitCode = 2;
    return;
  }
  const client = new Client({ name: 'wealthos-trendlyne-enrichment', version: '2.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const listed = await client.listTools();
    const tools = new Map((listed.tools || []).map((tool: any) => [tool.name, tool]));
    if (discoverOnly) {
      writeJson(toolSchemaPath, { provider: 'TRENDLYNE_MCP', generatedAt: now(), tools: (listed.tools || []).map((tool: any) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema || tool.input_schema || null })) });
      console.log(`Wrote redacted tool schema manifest: ${toolSchemaPath}`);
      return;
    }
    if (discoverParameters) {
      const parameterTool = tools.get('search_financial_parameters');
      if (!parameterTool || !('query' in props(parameterTool))) throw new Error('Trendlyne MCP does not expose search_financial_parameters(query).');
      const existing = fs.existsSync(parameterCatalogPath) ? JSON.parse(fs.readFileSync(parameterCatalogPath, 'utf8')) : {};
      const results: Record<string, unknown> = { ...(existing.results || {}) };
      const queries = customParameterQueries.length ? customParameterQueries : parameterDiscoveryQueries;
      for (const query of queries) {
        try { results[query] = decode(await client.callTool({ name: parameterTool.name, arguments: { query } })); }
        catch (error) { results[query] = { error: error instanceof Error ? error.message : String(error) }; }
        await sleep(delayMs);
      }
      writeJson(parameterCatalogPath, { provider: 'TRENDLYNE_MCP', generatedAt: now(), queries: [...new Set([...(existing.queries || []), ...queries])], results });
      console.log(`Wrote raw parameter discovery catalog: ${parameterCatalogPath}`);
      return;
    }
    if (!fs.existsSync(manifestPath)) throw new Error(`Priority manifest not found: ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let symbols = [...new Set((manifest.symbols || []).map((item: unknown) => String(item).trim().toUpperCase()))].filter((symbol: string) => /^[A-Z0-9&.-]+$/.test(symbol));
    if (maxSymbols > 0) symbols = symbols.slice(0, maxSymbols);
    const db = new sqlite3.Database(dbPath);
    const parameterEndpoint = quarterlyHistoryOnly
      ? 'quarterly_profit_history'
      : statementHistoryPack
      ? 'statement_history_parameters'
      : 'parameters';
    const requestedParameterCodes = quarterlyHistoryOnly
      ? quarterlyProfitHistoryCodes
      : statementHistoryPack
      ? statementHistoryParameterCodes
      : verifiedParameterCodes;
    if (!quarterlyHistoryOnly && requestedParameterCodes.length !== 50) {
      throw new Error(`PACK_CONFIGURATION_ERROR: expected exactly 50 Trendlyne parameter tokens, received ${requestedParameterCodes.length}.`);
    }
    if (new Set(requestedParameterCodes).size !== requestedParameterCodes.length) {
      throw new Error('PACK_CONFIGURATION_ERROR: Trendlyne parameter pack contains duplicate tokens.');
    }
    if (statementHistoryPack) {
      writeStatementHistoryAcquisitionContract();
    }
    const progress: Record<string, unknown> = { status: 'RUNNING', provider: 'TRENDLYNE_MCP', universe: path.basename(manifestPath), manifest: path.relative(root, manifestPath), requested: symbols.length, completed: 0, skippedFresh: 0, deferredParameterTail: 0, failed: 0, pending: symbols.length, phase: quarterlyHistoryOnly ? 'QUARTERLY_PROFIT_HISTORY' : statementHistoryPack ? 'STATEMENT_HISTORY_PARAMETERS' : parametersOnly ? 'RAW_PROVIDER_PARAMETERS_ONLY' : 'RAW_PROVIDER_PROFILES', profileRefreshDays: Object.fromEntries(profiles.map(p => [p.endpoint, p.ttlDays])), requestedParameterCodes, allowPartialBatch, llmCalls: 0, updatedAt: now() };
    try {
      progress.stage = 'VALIDATING_DB_TABLES';
      writeProgress(progress);
      await requireEvidenceTables(db);
      const singleTool = tools.get('get_stock_parameter_values');
      const parameterTool = singleTool;
      // The provider's exact-parameter tool permits at most ten stock codes.
      // Its semantic multi-stock tool is deliberately not used for factual extraction.
      // Find due symbols before batching rather than removing fresh symbols
      // inside arbitrary ten-symbol blocks.  This permits full batches across
      // the entire priority order and avoids wasting capacity on 1-9 symbols.
      progress.stage = 'SELECTING_DUE_SYMBOLS';
      writeProgress(progress);
      const dueSymbols = force ? symbols : (await Promise.all(symbols.map(symbol => isFresh(db, symbol, parameterEndpoint, 15))))
        .flatMap((fresh, index) => fresh ? [] : [symbols[index]]);
      const deferredTail = !allowPartialBatch && !quarterlyHistoryOnly
        ? dueSymbols.splice(Math.floor(dueSymbols.length / 10) * 10)
        : [];
      progress.deferredParameterTail = deferredTail.length;
      progress.dueSymbols = dueSymbols.length;
      progress.totalBatches = Math.ceil(dueSymbols.length / 10);
      progress.stage = 'FETCHING_PROVIDER_BATCHES';
      writeProgress(progress);
      const batches = chunks(dueSymbols, 10);
      for (const batch of batches) {
        const args = parameterTool ? parameterArgs(parameterTool, batch, requestedParameterCodes) : null;
        if (!parameterTool || !args) {
          for (const symbol of batch) await save(db, symbol, parameterEndpoint, 'DATA_INSUFFICIENT', null, 'TOOL_ARGUMENT_SCHEMA_UNMAPPED');
          progress.failed = Number(progress.failed) + batch.length;
        } else {
          try {
            const payload = decode(await client.callTool({ name: parameterTool.name, arguments: args }));
            const providerError = providerErrorMessage(payload);
            for (const symbol of batch) await save(db, symbol, parameterEndpoint, providerError ? 'SOURCE_UNAVAILABLE' : 'SUCCESS', payload, providerError);
            if (providerError) progress.failed = Number(progress.failed) + batch.length;
          } catch (error) {
            for (const symbol of batch) await save(db, symbol, parameterEndpoint, 'SOURCE_UNAVAILABLE', null, error instanceof Error ? error.message : String(error));
            progress.failed = Number(progress.failed) + batch.length;
          }
          await sleep(delayMs);
        }
      }
      if (quarterlyHistoryOnly) {
        progress.completed = 0; progress.failed = 0; progress.skippedFresh = 0;
        for (const symbol of symbols) {
          const rows = await all(db, "SELECT status FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND symbol=? AND endpoint=?", [symbol, parameterEndpoint]);
          if (rows[0]?.status === 'SUCCESS') progress.completed = Number(progress.completed) + 1;
          else progress.failed = Number(progress.failed) + 1;
          progress.pending = symbols.length - Number(progress.completed) - Number(progress.failed);
          progress.lastSymbol = symbol; progress.updatedAt = now(); writeProgress(progress);
        }
        progress.status = Number(progress.failed) ? 'COMPLETED_WITH_GAPS' : 'COMPLETED';
        return;
      }
      for (const symbol of symbols) {
        let failed = false;
        let madeCall = false;
        for (const profile of (parametersOnly ? [] : profiles.slice(1))) {
          if (await isFresh(db, symbol, profile.endpoint, profile.ttlDays)) continue;
          const tool = tools.get(profile.tool);
          const args = tool ? (profile.endpoint === 'documents' ? documentArgs(tool, symbol) : identifierArgs(tool, symbol, 'type' in profile ? profile.type : undefined)) : null;
          if (!tool || !args) {
            await save(db, symbol, profile.endpoint, 'DATA_INSUFFICIENT', null, !tool ? 'TOOL_NOT_EXPOSED_BY_PROVIDER' : 'TOOL_ARGUMENT_SCHEMA_UNMAPPED');
            continue;
          }
          madeCall = true;
          try {
            const payload = decode(await client.callTool({ name: tool.name, arguments: args }));
            const providerError = providerErrorMessage(payload);
            if (providerError) failed = true;
            await save(db, symbol, profile.endpoint, providerError ? 'SOURCE_UNAVAILABLE' : 'SUCCESS', payload, providerError);
          } catch (error) {
            failed = true;
            await save(db, symbol, profile.endpoint, 'SOURCE_UNAVAILABLE', null, error instanceof Error ? error.message : String(error));
          }
          await sleep(delayMs);
        }
        if (failed) progress.failed = Number(progress.failed) + 1;
        else if (madeCall || await isFresh(db, symbol, 'parameters', 15)) progress.completed = Number(progress.completed) + 1;
        else progress.skippedFresh = Number(progress.skippedFresh) + 1;
        progress.pending = symbols.length - Number(progress.completed) - Number(progress.failed) - Number(progress.skippedFresh);
        progress.lastSymbol = symbol;
        progress.updatedAt = now();
        writeProgress(progress);
      }
      progress.status = Number(progress.failed) ? 'COMPLETED_WITH_GAPS' : 'COMPLETED';
    } finally {
      progress.updatedAt = now();
      writeProgress(progress);
      await close(db);
    }
  } finally { await client.close().catch(() => undefined); }
}
main().catch(error => { writeProgress({ status: 'FAILED', message: error instanceof Error ? error.message : String(error), updatedAt: now(), llmCalls: 0 }); console.error(error); process.exitCode = 1; });
