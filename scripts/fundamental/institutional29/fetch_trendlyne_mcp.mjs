#!/usr/bin/env node
/**
 * fetch_trendlyne_mcp.mjs — Comprehensive Trendlyne MCP acquisition for any scrip
 *
 * Calls ALL available Trendlyne MCP tools in sequence and saves a unified
 * trendlyne_raw.json for downstream bundle building and narrative drafting.
 *
 * MCP tools used:
 *   1. get_stock_parameter_values     — structured financial metrics (batch 1 + batch 2)
 *   2. get_overview_news_corp_events  — overview, news, corporate events
 *   3. get_ownership_deals_insider_sast — shareholding, SAST, bulk/block deals
 *   4. get_document_search_results    — annual reports, concall transcripts, presentations, credit reports
 *
 * What MCP CANNOT provide (Chrome supplement needed):
 *   - Technical chart levels (SMA, RSI from live chart)
 *   - Peer comparison table (peer P/E, EV/EBITDA from Trendlyne peers page)
 *   - Full PDF text of documents (MCP returns metadata only)
 *
 * Usage:
 *   # Read MCP URL from config and export first:
 *   node -e "const c=JSON.parse(require('fs').readFileSync('.agents/mcp_config.json','utf8')); process.stdout.write(c.mcpServers.trendlyne.serverUrl)" > /tmp/url.txt
 *   $env:TRENDLYNE_MCP_URL = (Get-Content '.agents\mcp_config.json' | ConvertFrom-Json).mcpServers.trendlyne.serverUrl
 *   node fetch_trendlyne_mcp.mjs SYMBOL [--as-of YYYY-MM-DD]
 *
 * Output:
 *   outputs/institutional29/<SYMBOL>/trendlyne_raw.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parseParameterResponse, parseDocumentResponse } from './trendlyne_response_parser.mjs';

// ─── CLI ──────────────────────────────────────────────────────────────────────
const cliArgs = process.argv.slice(2);
const symbol = cliArgs.find(a => !a.startsWith('--'))?.toUpperCase();
if (!symbol) {
  console.error('Usage: node fetch_trendlyne_mcp.mjs SYMBOL [--as-of YYYY-MM-DD]');
  console.error('\nBefore running, set TRENDLYNE_MCP_URL:');
  console.error('  PowerShell: $env:TRENDLYNE_MCP_URL = (Get-Content \'.agents\\mcp_config.json\' | ConvertFrom-Json).mcpServers.trendlyne.serverUrl');
  process.exit(1);
}
const asOfIdx = cliArgs.indexOf('--as-of');
const asOf = asOfIdx >= 0 ? cliArgs[asOfIdx + 1] : new Date().toISOString().slice(0, 10);

const root = process.cwd();
const outDir  = path.resolve(root, 'outputs', 'institutional29', symbol);
const outPath = path.join(outDir, 'trendlyne_raw.json');

// ─── MCP connection ───────────────────────────────────────────────────────────
const mcpUrl = process.env.TRENDLYNE_MCP_URL?.trim();
if (!mcpUrl || mcpUrl.includes('<licensed-mcp-host>') || mcpUrl.includes('placeholder')) {
  console.error('ERROR: TRENDLYNE_MCP_URL not set or is a placeholder.');
  console.error('Set it first:');
  console.error('  PowerShell: $env:TRENDLYNE_MCP_URL = (Get-Content \'.agents\\mcp_config.json\' | ConvertFrom-Json).mcpServers.trendlyne.serverUrl');
  process.exit(1);
}

let client;
const acquisitionErrors = [];
async function initMcp() {
  client = new Client({ name: 'wealthos-fetch', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
  console.error(`[mcp] Connected to Trendlyne MCP`);
}

async function callTool(toolName, args) {
  console.error(`[mcp] ${toolName} ${JSON.stringify(args).slice(0, 80)}...`);
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    if (result?.isError) throw new Error(`TOOL_ERROR:${toolName}`);
    const text = result?.content?.find(c => c.type === 'text')?.text;
    let parsed = result?.structuredContent || result;
    if (text) { try { parsed = JSON.parse(text); } catch {} }
    if (parsed?.status === 'error') throw new Error(`PROVIDER_ERROR:${parsed.message || toolName}`);
    return parsed;
  } catch (err) {
    console.error(`[mcp] ERROR ${toolName}: ${err.message}`);
    acquisitionErrors.push({ tool: toolName, message: err.message });
    return null;
  }
}

// ─── Metric packs ─────────────────────────────────────────────────────────────
// Exact provider tokens from the verified enrichment catalog.  A single unknown
// token makes the provider reject the whole request, so this list must only be
// changed after a successful live parameter-discovery probe.
const METRICS_PACK1 = [
  'currentprice', 'mcapq', 'pettm', 'bvshq', 'debtcea', 'ltdea', 'netdebta',
  'roea', 'rocea', 'roica', 'roaa', 'opma', 'opa', 'opq', 'reportedpatq', 'npq', 'totalsrq',
  'cfoa', 'cfoagrowth', 'ncfa', 'cepsa',
  'prompct', 'prompct1q', 'prompledge', 'prompledge1q', 'fiihold', 'fiipct1q',
  'instihold', 'instipct1q', 'mfhold', 'mfpct1q', 'prompct4q', 'fiipct4q', 'pubpct',
  'dividendpayout', 'dividendpayoutnpa', 'dividendpersharea',
  'contingentliabilitiesa', 'currentdebtcapleaseobligationa', 'inventoriesq',
  'finishedgoodsq', 'tradereceivablesa', 'sra', 'insidersellmonthplustoday',
  'delivery6mavg', 'capitalexpenditurea', 'extraordinaryitemqmq6', 'pitroskif', 'ebita', 'wcq',
];

// The provider returns human-readable labels rather than parameter IDs.  Keep
// this explicit, reviewed label-to-token contract beside the request so a
// successful response is never silently discarded before canonical promotion.
const METRIC_DEFINITIONS = [
  ['currentprice', 'LTP'], ['mcapq', 'Market Cap'], ['pettm', 'PE TTM'], ['bvshq', 'BVSH Latest'], ['debtcea', 'Total Debt to Total Equity Ann.'], ['ltdea', 'LT Debt To Equity Ann.'], ['netdebta', 'Net Debt Ann.'],
  ['roea', 'ROE Ann. %'], ['rocea', 'ROCE Ann. %'], ['roica', 'ROIC Ann. %'], ['roaa', 'RoA Ann. %'], ['opma', 'OPM Ann. %'], ['opa', 'Operating Profit Ann.'], ['opq', 'Operating Profit Qtr'], ['reportedpatq', 'Reported PAT Qtr'], ['npq', 'Net Profit Qtr'], ['totalsrq', 'Total Rev. Qtr'],
  ['cfoa', 'Cash from Operating Act. Ann.'], ['cfoagrowth', 'Operating Cash Flow YoY Growth %'], ['ncfa', 'Net Cash Flow Ann.'], ['cepsa', 'Cash EPS Ann.'],
  ['prompct', 'Promoter holding latest %'], ['prompct1q', 'Promoter holding change QoQ %'], ['prompledge', 'Promoter holding pledge percentage % Qtr'], ['prompledge1q', 'Promoter pledge change QoQ %'], ['fiihold', 'FII holding current Qtr %'], ['fiipct1q', 'FII holding change QoQ %'], ['instihold', 'Institutional holding current Qtr %'], ['instipct1q', 'Institutional holding change QoQ %'], ['mfhold', 'MF holding current Qtr %'], ['mfpct1q', 'MF holding change QoQ %'], ['prompct4q', 'Promoter holding change 1Y %'], ['fiipct4q', 'FII holding change 1Y %'], ['pubpct', 'Public holding current Qtr %'],
  ['dividendpayout', 'Dividend payout ratio TTM %'], ['dividendpayoutnpa', 'Dividend Payout to NP Ann.'], ['dividendpersharea', 'Dividend Per Share Ann.'],
  ['contingentliabilitiesa', 'Contingent Liabilities plus Commitments Ann.'], ['currentdebtcapleaseobligationa', 'Current Debt Cap Lease Obligation Ann.'], ['inventoriesq', 'Inventories Qtr'], ['finishedgoodsq', 'Finished Goods Qtr'], ['tradereceivablesa', 'Trade Receivables Ann.'], ['sra', 'Total Rev. Ann.'], ['insidersellmonthplustoday', 'Insider & SAST Sells Last Month'], ['delivery6mavg', 'Delivery% Vol. Avg 6M'], ['capitalexpenditurea', 'Capex Ann.'], ['extraordinaryitemqmq6', 'ExtraOrdinary Items 6Q ago'], ['pitroskif', 'Piotroski Score'], ['ebita', 'EBIT Ann.'], ['wcq', 'Working Capital Qtr'],
].map(([parameter, label]) => ({ parameter, label }));

// Document search queries — query-only (no stock_code/document_type; include symbol in text)
// get_document_search_results ONLY accepts { query: string } — no other params
const DOCUMENT_TYPES = [
  { key: 'annual_report',         query: `${symbol} annual report FY2026 FY2025 auditor director` },
  { key: 'concall_transcript',    query: `${symbol} earnings call concall transcript quarterly results` },
  { key: 'investor_presentation', query: `${symbol} investor presentation analyst meet Q2 FY27` },
  { key: 'credit_rating',         query: `${symbol} credit rating CRISIL ICRA CARE rating report` },
  { key: 'statutory_auditor',     query: `${symbol} statutory auditor CIN corporate identity secretarial audit` },
  { key: 'exchange_filing',       query: `${symbol} board meeting results outcome financial results quarterly` },
];

// ─── Main acquisition ─────────────────────────────────────────────────────────
async function main() {
  await initMcp();

  // Load existing raw if any (for incremental update)
  let raw = { symbol, asOf, scrapedAt: null, pages: {}, metrics: {}, peers: [], news: [], events: [] };
  if (fs.existsSync(outPath)) {
    raw = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (raw.raw && typeof raw.raw === 'object') raw = raw.raw;
    raw.pages = raw.pages ?? {};
    raw.metrics = raw.metrics ?? {};
    raw.news = raw.news ?? [];
    raw.events = raw.events ?? [];
    raw.documents = raw.documents ?? [];
    console.error(`[mcp] Loaded existing raw with ${Object.keys(raw.pages).length} pages`);
  }

  const ts = new Date().toISOString();
  const verifiedPack = process.env.WEALTHOS_METRIC_PACK_FILE
    ? JSON.parse(fs.readFileSync(process.env.WEALTHOS_METRIC_PACK_FILE, 'utf8')) : null;
  if (verifiedPack && (verifiedPack.tokens?.length !== 50 || new Set(verifiedPack.tokens).size !== 50)) {
    throw Error('Verified metric pack must contain exactly 50 distinct discovered tokens');
  }
  delete raw.metrics.status;
  delete raw.metrics.message;

  // ── 1. Structured metrics ─────────────────────────────────────────────────
  console.error(`\n[mcp] === STRUCTURED METRICS (Pack 1) ===`);
  const resp1 = await callTool('get_stock_parameter_values', {
    stock_codes: [symbol],
    parameters: verifiedPack?.tokens || METRICS_PACK1.slice(0, 50),
  });
  if (resp1) {
    raw.pages.METRICS_PACK1 = { scrapedAt: ts, tool: 'get_stock_parameter_values', data: resp1 };
    mergeMetricsResponse(raw, resp1, symbol, 'PACK1');
    const parsed = parseParameterResponse(resp1, [symbol], verifiedPack?.definitions || METRIC_DEFINITIONS);
    raw.parameterObservations = parsed.observations;
    raw.parameterIdentity = parsed.identities.find(i => i.symbol === symbol) || null;
    raw.parameterParseAudit = { observations: parsed.observations.length, rejected: parsed.rejected };
    for (const [token, observation] of Object.entries(parsed.bySymbol[symbol] || {})) raw.metrics[token] = [{ ...observation, fetchedAt: ts, source: 'get_stock_parameter_values' }];
  }
  if (verifiedPack) delete raw.pages.METRICS_PACK2;

  delete raw.pages.METRICS_PACK2;

  // ── 2. Overview, news, events ─────────────────────────────────────────────
  for (const evtType of ['overview', 'news', 'events']) {
    console.error(`\n[mcp] === ${evtType.toUpperCase()} ===`);
    const resp = await callTool('get_overview_news_corp_events', { stock_code: symbol, type: evtType });
    if (resp) {
      raw.pages[`OVERVIEW_EVENTS_${evtType.toUpperCase()}`] = { scrapedAt: ts, tool: 'get_overview_news_corp_events', type: evtType, data: resp };
      if (evtType === 'overview') {
        mergeOverview(raw, resp);
      } else if (evtType === 'news') {
        const items = extractList(resp, ['news', 'items', 'results', 'data']);
        if (items) raw.news = [...(raw.news || []), ...items].slice(0, 50);
      } else if (evtType === 'events') {
        const items = extractList(resp, ['events', 'items', 'results', 'data']);
        if (items) raw.events = [...(raw.events || []), ...items].slice(0, 100);
      }
    }
  }

  // ── 3. Ownership / shareholding / SAST ───────────────────────────────────
  for (const ownerType of ['shareholding', 'insider_sast', 'bulk_block_deals']) {
    console.error(`\n[mcp] === ${ownerType.toUpperCase()} ===`);
    const resp = await callTool('get_ownership_deals_insider_sast', { stock_code: symbol, type: ownerType });
    if (resp) {
      raw.pages[`OWNERSHIP_${ownerType.toUpperCase()}`] = { scrapedAt: ts, tool: 'get_ownership_deals_insider_sast', type: ownerType, data: resp };
      if (ownerType === 'shareholding') mergeShareholding(raw, resp);
    }
  }

  // ── 4. Documents ─────────────────────────────────────────────────────────
  // get_document_search_results ONLY accepts { query: string } — adding stock_code
  // or document_type causes Pydantic "Unexpected keyword argument" (error 1012).
  // Symbol is embedded in each query string instead.
  raw.documents = (raw.documents || []).filter(d => d.url || d.localPath || (d.identityVerified && d.symbol === symbol));
  for (const docSpec of DOCUMENT_TYPES) {
    console.error(`\n[mcp] === DOCUMENTS: ${docSpec.key} ===`);
    const identityName = raw.parameterIdentity?.companyName || raw.stockSummary?.name;
    const query = identityName ? docSpec.query.replace(symbol, `${identityName} (${symbol})`) : docSpec.query;
    const resp = await callTool('get_document_search_results', { query });
    if (resp) {
      const parsed = parseDocumentResponse(resp, symbol, asOf, ts);
      const docs = parsed.documents;
      raw.documentSearchAudit = raw.documentSearchAudit || {};
      raw.documentSearchAudit[docSpec.key] = { status: parsed.status, matched: docs.length, rejected: parsed.rejected };
      raw.pages[`DOCUMENTS_${docSpec.key.toUpperCase()}`] = { scrapedAt: ts, tool: 'get_document_search_results', key: docSpec.key, query, data: resp };
      for (const doc of docs) {
        const dedupeKey = `${doc.title || doc.name || '?'}|${doc.date || doc.published_date || '?'}`;
        const existing = raw.documents.find(d => d.providerDocumentId === doc.providerDocumentId && d.contentSha256 === doc.contentSha256);
        if (!existing) raw.documents.push({ ...doc, docKey: docSpec.key, fetchedAt: ts,
          extractedSections: { providerExcerpt: doc.text || doc.content || '' } });
      }
    }
  }

  // ── 5. OHLC (monthly) for ADTV + price returns ───────────────────────────
  // period='monthly' returns daily candles for last ~30 trading days
  // Use to compute: ADTV (30d avg volume), 1m price return
  console.error(`\n[mcp] === OHLC (monthly) for ADTV ===`);
  const ohlcResp = await callTool('get_stock_eod_ohlc', { stock_code: symbol, period: 'monthly' });
  if (ohlcResp) {
    raw.pages.OHLC_MONTHLY = { scrapedAt: ts, tool: 'get_stock_eod_ohlc', period: 'monthly', data: ohlcResp };
    const bars = extractList(ohlcResp, ['candles', 'data', 'ohlc', 'result', 'bars']) || [];
    if (bars.length >= 2) {
      const volumes = bars.map(b => b.volume ?? b.v ?? 0).filter(v => v > 0);
      if (volumes.length) {
        const adtvShares = Math.round(volumes.reduce((s, v) => s + v, 0) / volumes.length);
        if (!raw.metrics.cvol30dayavg_ohlc) raw.metrics.cvol30dayavg_ohlc = [];
        raw.metrics.cvol30dayavg_ohlc.push({ value: adtvShares, source: 'ohlc_monthly', bars: volumes.length });
      }
      // 1m price return from last 2 closes
      const closes = bars.map(b => b.close ?? b.c ?? 0).filter(c => c > 0);
      if (closes.length >= 2) {
        const changeP1m = parseFloat(((closes[closes.length - 1] / closes[closes.length - 2] - 1) * 100).toFixed(2));
        if (!raw.metrics.changeP_1m) raw.metrics.changeP_1m = [];
        raw.metrics.changeP_1m.push({ value: changeP1m, source: 'ohlc_monthly' });
      }
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  raw.scrapedAt = ts;
  raw.acquisitionErrors = acquisitionErrors;
  raw.metricPackSource = process.env.WEALTHOS_METRIC_PACK_FILE || 'legacy_default_packs';
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(raw, null, 2), 'utf8');

  // Summary
  const metricCount = Object.keys(raw.metrics || {}).length;
  const docCount = (raw.documents || []).length;
  const newsCount = (raw.news || []).length;
  const eventCount = (raw.events || []).length;
  const pageCount = Object.keys(raw.pages || {}).length;

  console.log(JSON.stringify({
    symbol, asOf,
    output: outPath,
    pages: pageCount,
    metrics: metricCount,
    documents: docCount,
    news: newsCount,
    events: eventCount,
  }, null, 2));

  console.error(`\n[mcp] Done. Saved to ${outPath}`);
  await client?.close?.();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractList(resp, keys) {
  for (const k of keys) {
    if (Array.isArray(resp?.[k])) return resp[k];
    if (Array.isArray(resp?.result?.[k])) return resp.result[k];
    if (Array.isArray(resp?.data?.[k])) return resp.data[k];
  }
  if (Array.isArray(resp?.result)) return resp.result;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp)) return resp;
  return null;
}

function mergeMetricsResponse(raw, resp, sym, packId) {
  // resp may be { result: { SYMBOL: { metric: value } } } or various shapes
  const data = resp?.result?.[sym] || resp?.data?.[sym] || resp?.[sym] || resp?.result || resp?.data || resp;
  // Preserve rich-text responses in pages; status/message are not financial facts.
  if (typeof data === 'string' || resp?.status === 'error') return;
  if (!data || typeof data !== 'object') return;
  for (const [key, val] of Object.entries(data)) {
    if (['status', 'message'].includes(key)) continue;
    if (val === null || val === undefined) continue;
    // val may be scalar or {value, period, unit, ...}
    if (!raw.metrics[key]) raw.metrics[key] = [];
    if (typeof val === 'object' && !Array.isArray(val)) {
      raw.metrics[key].push({ ...val, pack: packId });
    } else if (Array.isArray(val)) {
      raw.metrics[key].push(...val.map(v => ({ ...v, pack: packId })));
    } else {
      raw.metrics[key].push({ value: val, pack: packId });
    }
  }
}

function mergeOverview(raw, resp) {
  const data = resp?.result || resp?.data || resp;
  if (!data || typeof data !== 'object') return;
  if (!raw.pages.OVERVIEW) raw.pages.OVERVIEW = {};
  raw.pages.OVERVIEW.overview = data;
  // Extract company-level fields into metrics
  const fields = ['company_name', 'sector', 'industry', 'market_cap', 'pe_ttm', 'pb_ratio',
    'book_value', 'face_value', 'dividend_yield', 'eps_ttm', 'market_cap_cr'];
  for (const f of fields) {
    if (data[f] != null) {
      if (!raw.metrics[f]) raw.metrics[f] = [];
      raw.metrics[f].push({ value: data[f], source: 'overview' });
    }
  }
}

function mergeShareholding(raw, resp) {
  const rows = extractList(resp, ['shareholding', 'history', 'quarters', 'data', 'results']);
  if (!rows) return;
  for (const row of rows) {
    for (const field of ['promoter_holding_pct', 'fii_holding_pct', 'dii_holding_pct', 'mf_holding_pct',
      'public_holding_pct', 'promoter_pledge_pct', 'period', 'quarter']) {
      if (row[field] != null) {
        const key = field === 'period' || field === 'quarter' ? null : field;
        if (!key) continue;
        if (!raw.metrics[key]) raw.metrics[key] = [];
        raw.metrics[key].push({ value: row[field], period: row.period || row.quarter, source: 'shareholding' });
      }
    }
  }
}

main().catch(err => { console.error('[mcp] FATAL:', err.message); process.exit(1); });
