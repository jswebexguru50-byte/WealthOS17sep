#!/usr/bin/env tsx
/** Deterministic, read-only coverage audit of persisted Trendlyne evidence. */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

type Row = Record<string, unknown>;
const root = process.cwd();
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'excel_strategy_manifest.json'), 'utf8'));
const outputJson = path.join(dataDir, 'trendlyne_coverage_audit.json');
const outputCsv = path.join(dataDir, 'trendlyne_coverage_audit.csv');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

const all = (sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
);
const close = () => new Promise<void>(resolve => db.close(() => resolve()));

const parameterFields: Array<[string, string[]]> = [
  ['Current Price', ['LTP', 'Current Price']], ['Market Cap', ['Market Cap']], ['PE TTM', ['PE TTM']],
  ['Book Value', ['BVSH Latest', 'Book Value Per Share']], ['Debt/Equity', ['Total Debt to Total Equity', 'LT Debt To Equity']],
  ['ROE', ['ROE Ann']], ['ROCE', ['ROCE Ann']], ['ROIC', ['ROIC Ann']], ['ROA', ['RoA Ann']],
  ['Operating Margin', ['OPM Ann.', 'Operting Profit Margin', 'Operating Profit Margin']], ['Operating Profit', ['Operating Profit Ann.', 'Operating Profit Annual']],
  ['Quarterly Operating Profit', ['Operating Profit Qtr']], ['Quarterly PAT', ['Reported PAT Qtr']],
  ['Quarterly Net Profit', ['Net Profit Qtr']], ['Quarterly Revenue', ['Total Rev. Qtr', 'Total Revenue Qtr']],
  ['CFO', ['Cash from Operating Act. Ann.', 'Cash from Operating Activity Annual']], ['CFO Growth', ['Operating Cash Flow YoY Growth']],
  ['Net Cash Flow', ['Net Cash Flow Ann.', 'Net Cash Flow Annual']], ['Cash EPS', ['Cash EPS Ann.', 'Cash EPS Annual']],
  ['Promoter Holding', ['Promoter holding latest']], ['Promoter Holding QoQ Change', ['Promoter holding change QoQ']],
  ['Promoter Pledge', ['Promoter holding pledge percentage']], ['FII Holding', ['FII holding current']],
  ['FII QoQ Change', ['FII holding change QoQ']], ['Institutional Holding', ['Institutional holding current']],
  ['Institutional QoQ Change', ['Institutional holding change QoQ']], ['MF Holding', ['MF holding current']],
  ['MF QoQ Change', ['MF holding change QoQ']], ['Dividend Payout', ['Dividend payout ratio TTM']],
];
const endpointFields = ['overview', 'corporate_events', 'shareholding', 'documents'];

function parameterText(responseJson: unknown): string {
  if (typeof responseJson !== 'string') return '';
  try {
    const outer = JSON.parse(responseJson);
    const text = outer?.content?.find((item: any) => item?.type === 'text')?.text;
    const inner = typeof text === 'string' ? JSON.parse(text) : null;
    return typeof inner?.data === 'string' ? inner.data : '';
  } catch { return ''; }
}
function contentText(responseJson: unknown): string {
  if (typeof responseJson !== 'string') return '';
  try {
    const outer = JSON.parse(responseJson);
    return (outer?.content || []).filter((item: any) => item?.type === 'text').map((item: any) => String(item.text || '')).join('\n');
  } catch { return ''; }
}
function hasVerifiedValue(text: string, symbol: string, labels: string[]) {
  return labels.some(label => {
    const start = text.toLowerCase().indexOf(label.toLowerCase());
    if (start < 0) return false;
    const end = text.indexOf('\n---', start);
    const section = text.slice(start, end < 0 ? undefined : end);
    const match = new RegExp(`^${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([^\\r\\n]+)$`, 'im').exec(section);
    if (!match) return false;
    const value = match[1].trim();
    return value !== '' && !/^(none|null|n\/?a|na|-)$/i.test(value);
  });
}
function numericValue(text: string, symbol: string, label: string): number | null {
  const start = text.toLowerCase().indexOf(label.toLowerCase());
  if (start < 0) return null;
  const end = text.indexOf('\n---', start);
  const section = text.slice(start, end < 0 ? undefined : end);
  const match = new RegExp(`^${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([^\\r\\n]+)$`, 'im').exec(section);
  if (!match) return null;
  const value = Number(match[1].trim());
  return Number.isFinite(value) ? value : null;
}
function csv(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const symbols = [...new Set((manifest.symbols || []).map((value: unknown) => String(value).trim().toUpperCase()))];
  const rows = await all(`SELECT symbol,endpoint,status,error,response_json,fetched_at
    FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP'`);
  const bySymbol = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    const symbol = String(row.symbol).toUpperCase();
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, new Map());
    bySymbol.get(symbol)!.set(String(row.endpoint), row);
  }
  const records = symbols.map(symbol => {
    const endpoints = bySymbol.get(symbol) || new Map<string, Row>();
    const parameter = endpoints.get('parameters');
    const rawParameterText = parameterText(parameter?.response_json);
    const shareholding = endpoints.get('shareholding');
    const quarterlyHistory = endpoints.get('quarterly_profit_history');
    const quarterlyText = parameterText(quarterlyHistory?.response_json);
    const fieldStatus: Record<string, string> = {};
    for (const [field, labels] of parameterFields) {
      fieldStatus[field] = parameter?.status === 'SUCCESS' && hasVerifiedValue(rawParameterText, symbol, labels)
        ? 'VERIFIED' : parameter?.status === 'SUCCESS' ? 'DATA_INSUFFICIENT' : String(parameter?.status || 'SOURCE_UNAVAILABLE');
    }
    const profitLabels = ['Net Profit Qtr', 'Net Profit 1Q Ago', 'Net Profit 2Q Ago', 'Net Profit 3Q Ago', 'Net Profit 4Q Ago', 'Net Profit 5Q Ago', 'Net Profit 6Q Ago', 'Net Profit 7Q Ago'];
    const eightQuarterProfits = profitLabels.map(label => numericValue(quarterlyText, symbol, label));
    const profitability8Q = eightQuarterProfits.every(value => value !== null)
      ? { coverageStatus: 'VERIFIED', result: eightQuarterProfits.every(value => Number(value) > 0) ? 'PASS' : 'FAIL', values: eightQuarterProfits }
      : { coverageStatus: quarterlyHistory?.status === 'SUCCESS' ? 'DATA_INSUFFICIENT' : String(quarterlyHistory?.status || 'SOURCE_UNAVAILABLE'), result: 'NOT_EVALUABLE', values: eightQuarterProfits };
    fieldStatus['Profitable Last 8Q'] = profitability8Q.coverageStatus;
    fieldStatus['Standalone DII Holding'] = shareholding?.status === 'SUCCESS' && /\bDII:\s*\n/i.test(contentText(shareholding.response_json))
      ? 'VERIFIED' : shareholding?.status === 'SUCCESS' ? 'DATA_INSUFFICIENT' : String(shareholding?.status || 'SOURCE_UNAVAILABLE');
    const endpointStatus = Object.fromEntries(['parameters', ...endpointFields].map(endpoint => [endpoint, endpoints.get(endpoint)?.status || 'SOURCE_UNAVAILABLE']));
    return { symbol, endpointStatus, fieldStatus, profitability8Q, fetchedAt: parameter?.fetched_at || null };
  });
  const fields = [...parameterFields.map(([field]) => field), 'Profitable Last 8Q', 'Standalone DII Holding'];
  const summary = Object.fromEntries(fields.map(field => [field, {
    VERIFIED: records.filter(record => record.fieldStatus[field] === 'VERIFIED').length,
    DATA_INSUFFICIENT: records.filter(record => record.fieldStatus[field] === 'DATA_INSUFFICIENT').length,
    SOURCE_UNAVAILABLE: records.filter(record => record.fieldStatus[field] === 'SOURCE_UNAVAILABLE').length,
  }]));
  const payload = { generatedAt: new Date().toISOString(), provider: 'TRENDLYNE_MCP', requested: symbols.length, records, fieldSummary: summary, note: 'Audit is read-only. DATA_INSUFFICIENT means no verified field value was found in the persisted raw provider response; it is never replaced with a default.' };
  fs.writeFileSync(outputJson, JSON.stringify(payload, null, 2));
  const headers = ['Symbol', 'Fetched At', ...endpointFields.map(endpoint => `Endpoint: ${endpoint}`), ...fields, '8Q Profitability Result'];
  const csvRows = [headers.join(',')];
  for (const record of records) csvRows.push(headers.map(header => {
    if (header === 'Symbol') return csv(record.symbol);
    if (header === 'Fetched At') return csv(record.fetchedAt);
    if (header.startsWith('Endpoint: ')) return csv(record.endpointStatus[header.slice(10)]);
    if (header === '8Q Profitability Result') return csv(record.profitability8Q.result);
    return csv(record.fieldStatus[header]);
  }).join(','));
  fs.writeFileSync(outputCsv, csvRows.join('\n'));
  console.log(JSON.stringify({ requested: symbols.length, outputJson, outputCsv, summary }, null, 2));
}
main().finally(close).catch(error => { console.error(error); process.exitCode = 1; });
