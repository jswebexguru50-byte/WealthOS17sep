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
const root = path.resolve(process.cwd());
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const manifestPath = path.join(dataDir, 'excel_strategy_manifest.json');
const progressPath = path.join(dataDir, process.argv.includes('--quarterly-profit-history')
  ? 'trendlyne_quarterly_history_progress.json'
  : 'trendlyne_mcp_progress.json');
const toolSchemaPath = path.join(dataDir, 'trendlyne_mcp_tool_schema.json');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const force = process.argv.includes('--force');
const discoverOnly = process.argv.includes('--discover-tools');
const discoverParameters = process.argv.includes('--discover-parameters');
const quarterlyHistoryOnly = process.argv.includes('--quarterly-profit-history');
const parameterQueryIndexes = process.argv.reduce<number[]>((indexes, argument, index) => argument === '--parameter-query' ? [...indexes, index] : indexes, []);
const customParameterQueries = parameterQueryIndexes.map(index => process.argv[index + 1]).filter((value): value is string => Boolean(value));
const maxSymbolsIndex = process.argv.indexOf('--max-symbols');
const maxSymbols = maxSymbolsIndex >= 0 ? Math.max(0, Number(process.argv[maxSymbolsIndex + 1])) : 0;
const delayIndex = process.argv.indexOf('--delay-ms');
const delayMs = delayIndex >= 0 ? Math.max(500, Number(process.argv[delayIndex + 1])) : 1000;
const parameterCatalogPath = path.join(dataDir, 'trendlyne_parameter_catalog.json');

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
  // Distributions
  'dividendpayout', 'dividendpayoutnpa', 'dividendpersharea',
  // Expert additions: Forensic & Valuation adjustments
  'contingentliabilitiesa', 'currentdebtcapleaseobligationa', 'inventoriesq', 
  'finishedgoodsq', 'tradereceivablesa', 'insiderpinvokedyesterday', 
  'insidersellmonthplustoday', 'delivery6mavg', 'capitalexpenditurea', 
  'extraordinaryitemqmq6', 'pitroskif', 'ebita', 'wcq'
];
const quarterlyProfitHistoryCodes = ['npq', 'npqmq1', 'npqmq2', 'npqmq3', 'npqmy1', 'npqmq5', 'npqmq6', 'npqmq7'];
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
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}
function writeProgress(value: unknown) { writeJson(progressPath, value); }

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
function chunks<T>(items: T[], size: number): T[][] { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)); }

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run fundamental:trendlyne -- [--discover-tools] [--discover-parameters] [--quarterly-profit-history] [--max-symbols N] [--delay-ms N] [--force]');
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
    const parameterEndpoint = quarterlyHistoryOnly ? 'quarterly_profit_history' : 'parameters';
    const requestedParameterCodes = quarterlyHistoryOnly ? quarterlyProfitHistoryCodes : verifiedParameterCodes;
    const progress: Record<string, unknown> = { status: 'RUNNING', provider: 'TRENDLYNE_MCP', universe: 'latest_30_day_strategy_manifest', requested: symbols.length, completed: 0, skippedFresh: 0, failed: 0, pending: symbols.length, phase: quarterlyHistoryOnly ? 'QUARTERLY_PROFIT_HISTORY' : 'RAW_PROVIDER_PROFILES', profileRefreshDays: Object.fromEntries(profiles.map(p => [p.endpoint, p.ttlDays])), requestedParameterCodes, llmCalls: 0, updatedAt: now() };
    try {
      await requireEvidenceTables(db);
      const singleTool = tools.get('get_stock_parameter_values');
      const parameterTool = singleTool;
      // The provider's exact-parameter tool permits at most ten stock codes.
      // Its semantic multi-stock tool is deliberately not used for factual extraction.
      const batches = chunks(symbols, 10);
      for (const batch of batches) {
        const required = force ? batch : (await Promise.all(batch.map(symbol => isFresh(db, symbol, parameterEndpoint, 15)))).flatMap((fresh, index) => fresh ? [] : [batch[index]]);
        if (!required.length) continue;
        const args = parameterTool ? parameterArgs(parameterTool, required, requestedParameterCodes) : null;
        if (!parameterTool || !args) {
          for (const symbol of required) await save(db, symbol, parameterEndpoint, 'DATA_INSUFFICIENT', null, 'TOOL_ARGUMENT_SCHEMA_UNMAPPED');
          progress.failed = Number(progress.failed) + required.length;
        } else {
          try {
            const payload = decode(await client.callTool({ name: parameterTool.name, arguments: args }));
            for (const symbol of required) await save(db, symbol, parameterEndpoint, payload.isError ? 'DATA_INSUFFICIENT' : 'SUCCESS', payload, payload.isError ? 'MCP_TOOL_RETURNED_ERROR' : null);
          } catch (error) {
            for (const symbol of required) await save(db, symbol, parameterEndpoint, 'SOURCE_UNAVAILABLE', null, error instanceof Error ? error.message : String(error));
            progress.failed = Number(progress.failed) + required.length;
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
        for (const profile of profiles.slice(1)) {
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
            if (payload.isError) failed = true;
            await save(db, symbol, profile.endpoint, payload.isError ? 'DATA_INSUFFICIENT' : 'SUCCESS', payload, payload.isError ? 'MCP_TOOL_RETURNED_ERROR' : null);
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
