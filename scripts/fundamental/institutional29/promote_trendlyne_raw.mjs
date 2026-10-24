#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const symbol = args.find(arg => !arg.startsWith('--'))?.trim().toUpperCase();
if (!symbol) throw new Error('Usage: node promote_trendlyne_raw.mjs SYMBOL [--as-of YYYY-MM-DD]');
const root = process.cwd();
const rawPath = path.join(root, 'outputs', 'institutional29', symbol, 'trendlyne_raw.json');
if (!fs.existsSync(rawPath)) throw new Error(`Missing acquisition output: ${rawPath}`);
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const db = new Database(dbPath);
const now = new Date().toISOString();
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const id = (...parts) => hash(parts).slice(0, 32);

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
if (!tables.has('trendlyne_mirror_observations')) throw new Error('Trendlyne mirror migration is not installed');
const tokenMap = new Map([
  ['rocea', 'roce_pct'], ['roea', 'roe_pct'],
  ['prompct', 'promoter_holding_pct'], ['promoter_holding_pct', 'promoter_holding_pct'],
  ['prompledge', 'promoter_pledge_pct'], ['promoter_pledge_pct', 'promoter_pledge_pct'],
  ['fiihold', 'fii_holding_pct'], ['fii_holding_pct', 'fii_holding_pct'],
  ['dii_holding_pct', 'dii_holding_pct'], ['pitroskif', 'piotroski_f_score'],
]);
const rawValues = new Map();
const add = (token, value, periodType = 'POINT_IN_TIME', providerPeriod = null) => {
  const key = String(token || '').trim().toLowerCase();
  if (!tokenMap.has(key) || value === null || value === undefined || value === '') return;
  rawValues.set(key, { value, periodType, providerPeriod });
};
for (const [token, entry] of Object.entries(raw.metrics || {})) {
  const cell = Array.isArray(entry) ? entry[0] : entry;
  add(token, cell?.value ?? cell, cell?.period === 'TTM' ? 'TTM' : 'POINT_IN_TIME', cell?.period ?? null);
}
for (const [token, value] of Object.entries(raw.fundamentals || {})) add(token, value, 'POINT_IN_TIME');
for (const [token, value] of Object.entries(raw.parameters || {})) add(token, value?.value ?? value, value?.periodType || 'POINT_IN_TIME', value?.period || null);
const responseHash = hash(raw);
const snapshotId = `tlrs_${id(symbol, responseHash)}`;
// The observation table is linked to the original mirror snapshot schema;
// create that foreign-key parent before retaining the immutable raw copy.
if (tables.has('trendlyne_mirror_snapshots')) {
  db.prepare(`INSERT OR IGNORE INTO trendlyne_mirror_snapshots
    (snapshotId,provider,endpoint,packId,packVersion,symbolsJson,tokensJson,requestedCells,responseHash,responseJson,providerStatus,requestedAt,receivedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(snapshotId, 'TRENDLYNE_MCP', 'institutional29', 'institutional29', '1', JSON.stringify([symbol]), JSON.stringify([...rawValues.keys()]), rawValues.size, responseHash, JSON.stringify(raw), raw.acquisitionErrors?.length ? 'PARTIAL' : 'SUCCESS', raw.scrapedAt || now, now);
}
db.prepare(`INSERT OR IGNORE INTO trendlyne_mirror_raw_snapshots
  (snapshotId,provider,endpoint,packId,packVersion,symbolsJson,tokensJson,requestedCells,responseHash,responseJson,providerStatus,requestedAt,receivedAt)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(snapshotId, 'TRENDLYNE_MCP', 'institutional29', 'institutional29', 1, JSON.stringify([symbol]), JSON.stringify([...rawValues.keys()]), rawValues.size, responseHash, JSON.stringify(raw), raw.acquisitionErrors?.length ? 'PARTIAL' : 'SUCCESS', raw.scrapedAt || now, now);
const observation = db.prepare(`INSERT INTO trendlyne_mirror_observations
  (observationId,snapshotId,symbol,companyId,providerToken,providerLabel,rawValue,rawUnit,periodType,relativePeriod,providerPeriod,providerAsOf,scope,status,canonicalMetric,observationHash,firstSeenAt,lastSeenAt,responseHash)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(observationId) DO UPDATE SET
    snapshotId=excluded.snapshotId,
    rawValue=excluded.rawValue,
    providerAsOf=excluded.providerAsOf,
    lastSeenAt=excluded.lastSeenAt,
    responseHash=excluded.responseHash`);
let observations = 0;
for (const [token, cell] of rawValues) {
  const value = String(cell.value);
  const observationId = `tlo_${id(symbol, token, cell.periodType, cell.providerPeriod || '', value)}`;
  observations += observation.run(observationId, snapshotId, symbol, null, token, token, value, null, cell.periodType, null, cell.providerPeriod, raw.scrapedAt || now, 'CONSOLIDATED_OR_PROVIDER_DEFAULT', 'AVAILABLE', tokenMap.get(token), hash({ symbol, token, value, periodType: cell.periodType, providerPeriod: cell.providerPeriod }), now, now, responseHash).changes;
}
let canonicalFacts = 0;
if (tables.has('canonical_fact_store')) {
  const canonicalFieldMap = new Map([
    ['promoter_holding_pct', 'promoter_pct'], ['promoter_pledge_pct', 'pledge_pct'],
    ['fii_holding_pct', 'fii_pct'], ['dii_holding_pct', 'dii_pct'],
  ]);
  const put = db.prepare(`INSERT INTO canonical_fact_store (symbol,field,value,source,confidence,fetched_at,ttl_seconds)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(symbol,field) DO UPDATE SET value=excluded.value,source=excluded.source,confidence=excluded.confidence,fetched_at=excluded.fetched_at,ttl_seconds=excluded.ttl_seconds
    WHERE excluded.confidence > canonical_fact_store.confidence
       OR (excluded.confidence = canonical_fact_store.confidence AND excluded.fetched_at >= canonical_fact_store.fetched_at)`);
  for (const [token, cell] of rawValues) {
    const field = canonicalFieldMap.get(tokenMap.get(token));
    if (!field) continue;
    canonicalFacts += put.run(symbol, field, JSON.stringify(cell.value), 'trendlyne_mcp', 1.0, raw.scrapedAt || now, 30 * 86400).changes;
  }
}
let statements = 0;
if (tables.has('HistoricalFinancialStatements')) {
  const insert = db.prepare(`INSERT OR IGNORE INTO HistoricalFinancialStatements
    (symbol,statement_type,period_label,period_date,sales_cr,operating_profit_cr,opm_pct,net_profit_pat_cr,cfo_cr,primary_source,secondary_source,is_reconciled)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const quarterly = raw.raw?.exchange?.quarterlyPL || raw.exchange?.quarterlyPL || [];
  const exchangeSource = raw.raw?.exchange?.screenerSource || raw.exchange?.screenerSource ? 'SCREENER_IN' : 'BSE_API';
  for (const row of quarterly) {
    const label = String(row.period || row.PERIOD || '').trim();
    if (!label) continue;
    statements += insert.run(symbol, 'QUARTERLY_PL', label, null, number(row.revenue_cr ?? row.NET_SALES), null, number(row.opm_pct), number(row.pat_cr ?? row.NET_PROFIT), null, exchangeSource, 'EXCHANGE_RAW_PENDING_RECONCILIATION', 0).changes;
  }
}
db.close();
console.log(JSON.stringify({ symbol, snapshotId, observations, canonicalFacts, statements, status: 'PROMOTED' }));
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
