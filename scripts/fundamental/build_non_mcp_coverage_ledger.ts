#!/usr/bin/env tsx
/** Build a read-only field-level coverage ledger before any MCP work. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Analyze360FieldResolver, FIELD_SOURCE_DEFINITIONS } from '../../src/server/services/Analyze360FieldSourceMap.js';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const root = process.cwd();
const manifestPath = arg('--manifest');
const outPath = arg('--out') || path.join(root, 'reports', 'non_mcp', 'coverage_ledger.json');
const fullCatalog = !process.argv.includes('--core-only');
// Historical snapshots are useful for a forensic audit, but must not make a
// non-MCP acceptance run appear to have attempted MCP. Opt in explicitly when
// inspecting that historical provider history.
const includeMcpHistory = process.argv.includes('--include-mcp-history');
if (!manifestPath) throw new Error('--manifest is required');
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const entries = Array.isArray(manifest) ? manifest : (manifest.entries || manifest.symbols || []);
const symbols = [...new Set(entries.map((e: any) => typeof e === 'string' ? e : e.symbol || e.ticker || e.listings?.[0]?.symbol).filter(Boolean).map((s: string) => s.toUpperCase()))];
if (!symbols.length) throw new Error('Manifest contains no symbols');
const db = new Database(path.join(root, 'portfolio.db'), { readonly: true });
const fields: Record<string, { period: string; sources: string[] }> = {
  revenue: { period: 'ANNUAL/QUARTERLY', sources: ['NSE_BSE_XBRL', 'MCA', 'UPSTOX', 'TRENDLYNE_WEB', 'TRADINGVIEW_WEB', 'CACHE'] },
  pat: { period: 'ANNUAL/QUARTERLY', sources: ['NSE_BSE_XBRL', 'MCA', 'UPSTOX', 'TRENDLYNE_WEB', 'TRADINGVIEW_WEB', 'CACHE'] },
  operating_profit: { period: 'ANNUAL/QUARTERLY', sources: ['NSE_BSE_XBRL', 'MCA', 'TRENDLYNE_WEB', 'TRADINGVIEW_WEB', 'CACHE'] },
  cfo: { period: 'ANNUAL/QUARTERLY', sources: ['NSE_BSE_XBRL', 'MCA', 'TRENDLYNE_WEB', 'TRADINGVIEW_WEB', 'CACHE'] },
  borrowings: { period: 'ANNUAL/QUARTERLY', sources: ['NSE_BSE_XBRL', 'MCA', 'TRENDLYNE_WEB', 'TRADINGVIEW_WEB', 'CACHE'] },
  roe_pct: { period: 'LATEST/ANNUAL', sources: ['NSE_BSE_XBRL', 'TRENDLYNE_WEB', 'TRADINGVIEW_WEB', 'CACHE'] },
  roce_reported: { period: 'LATEST/ANNUAL', sources: ['NSE_BSE_XBRL', 'TRENDLYNE_WEB', 'TRADINGVIEW_WEB', 'CACHE'] },
  promoter_holding: { period: 'LATEST/QUARTERLY', sources: ['NSE_BSE', 'TRENDLYNE_WEB', 'CACHE'] },
  promoter_pledge: { period: 'LATEST/QUARTERLY', sources: ['NSE_BSE', 'TRENDLYNE_WEB', 'CACHE'] },
  OHLCV: { period: 'DAILY', sources: ['UPSTOX', 'KITE', 'CACHE'] },
};
const placeholders = symbols.map(() => '?').join(',');
const factRows = db.prepare(`SELECT UPPER(symbol) symbol, metric, provider, COUNT(*) count FROM company_facts WHERE UPPER(symbol) IN (${placeholders}) GROUP BY UPPER(symbol), metric, provider`).all(...symbols) as any[];
// Keep acquisition evidence separate from canonical coverage.  A provider may
// have been called successfully yet return no usable field (for example,
// Upstox balance-sheet exposes liabilities but not borrowings).  Recording
// that distinction makes retries deterministic and prevents an endless
// re-download loop while preserving the GAP until a safe mapping exists.
const snapshotRows = db.prepare(`
  SELECT UPPER(symbol) symbol, provider, endpoint, status, response_json
  FROM fundamental_endpoint_snapshots
  WHERE UPPER(symbol) IN (${placeholders})
`).all(...symbols) as any[];
const snapshotBySymbol = new Map<string, any[]>();
for (const row of snapshotRows) (snapshotBySymbol.get(row.symbol) || (snapshotBySymbol.set(row.symbol, []), snapshotBySymbol.get(row.symbol)!)).push(row);
const ohlcvTable = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('DailyOHLCV','daily_ohlcv')").all() as any[])[0]?.name as string | undefined;
const ohlcvCounts = new Map<string, { count: number; first: string | null; last: string | null }>();
if (ohlcvTable) {
  const rows = db.prepare(`SELECT UPPER(symbol) symbol, COUNT(*) count, MIN(trade_date) first, MAX(trade_date) last FROM "${ohlcvTable}" WHERE UPPER(symbol) IN (${placeholders}) GROUP BY UPPER(symbol)`).all(...symbols) as any[];
  for (const r of rows) ohlcvCounts.set(String(r.symbol), { count: Number(r.count), first: r.first ?? null, last: r.last ?? null });
}
// OpportunityDataResolverService has a documented SQLite historical-cache
// fallback. Count that same canonical cache here; otherwise the readiness
// ledger can report a false OHLCV gap even though the consumer can resolve a
// complete local series without another provider call.
const historicalCache = new Map<string, { count: number; first: string | null; last: string | null }>();
const historicalTable = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='HistoricalPrices'").all() as any[])[0]?.name as string | undefined;
if (historicalTable) {
  const rows = db.prepare(`SELECT UPPER(symbol) symbol, COUNT(*) count, MIN(date) first, MAX(date) last FROM HistoricalPrices WHERE UPPER(symbol) IN (${placeholders}) OR UPPER(symbol) IN (${symbols.map(() => '?').join(',')}) GROUP BY UPPER(symbol)`).all(...symbols, ...symbols.map(s => `${s}.NS`)) as any[];
  for (const r of rows) historicalCache.set(String(r.symbol), { count: Number(r.count), first: r.first ?? null, last: r.last ?? null });
}
const rows = symbols.map(symbol => ({ symbol, fields: Object.fromEntries(Object.entries(fields).map(([metric, spec]) => {
  // XBRL/FERE's verified taxonomy maps `Borrowings` to `total_debt`; both
  // names are semantically the same canonical balance-sheet fact. Keep the
  // alias here so the readiness ledger does not re-acquire a fact that is
  // already promoted under the verified XBRL name.
  const matches = factRows.filter(r => r.symbol === symbol && (
    r.metric === metric
    || (metric === 'roe_pct' && r.metric === 'roe')
    || (metric === 'borrowings' && r.metric === 'total_debt')
  ));
  const providers = [...new Set(matches.map(r => r.provider || 'UNKNOWN'))];
  const attempts = snapshotBySymbol.get(symbol) || [];
  const policyAttempts = includeMcpHistory
    ? attempts
    : attempts.filter(r => !String(r.provider || '').toUpperCase().includes('MCP'));
  const attemptedProviders = [...new Set(policyAttempts.map(r => String(r.provider || 'UNKNOWN')))].sort();
  const successfulEndpoints = policyAttempts.filter(r => String(r.status).toUpperCase() === 'SUCCESS').map(r => `${r.provider}:${r.endpoint}`);
  const primaryOhlcv = ohlcvCounts.get(symbol);
  const cachedOhlcv = historicalCache.get(symbol) || historicalCache.get(`${symbol}.NS`);
  const ohlcv = primaryOhlcv?.count ? primaryOhlcv : cachedOhlcv;
  const available = metric === 'OHLCV' ? Boolean(ohlcv && ohlcv.count > 0) : matches.length > 0;
  const selectedProvider = providers[0] || (primaryOhlcv?.count ? 'LOCAL_OHLCV' : cachedOhlcv?.count ? 'SQLITE_HISTORICAL_CACHE' : null);
  return [metric, { requiredPeriod: spec.period, available, rows: metric === 'OHLCV' ? (ohlcv?.count || 0) : undefined, firstDate: metric === 'OHLCV' ? ohlcv?.first : undefined, lastDate: metric === 'OHLCV' ? ohlcv?.last : undefined, providers, attemptedProviders, successfulEndpoints, selectedProvider, fallbackOrder: spec.sources, quality: available ? (providers.length > 1 ? 'CROSS_SOURCE_AVAILABLE' : 'AVAILABLE') : (successfulEndpoints.length ? 'PROVIDER_RETURNED_NO_MAPPED_FIELD' : 'NOT_ATTEMPTED'), status: available ? 'COVERED' : 'GAP' }];
})) }));
db.close();
const analysis360 = fullCatalog ? Object.fromEntries(await Promise.all(symbols.map(async symbol => {
  const resolved = await Analyze360FieldResolver.resolveAllFields(symbol);
  const fields = Object.fromEntries(Object.entries(resolved.fields).map(([key, value]: [string, any]) => {
    const def = FIELD_SOURCE_DEFINITIONS[key];
    return [key, { status: value.status, available: value.status === 'AVAILABLE', provider: value.provider, sourceTable: value.sourceTable, periodType: value.periodType, periodEnd: value.periodEnd, missingReason: value.missingReason, preferredSource: def?.preferredSource || null, fallbackSource: def?.fallbackSource || null }];
  }));
  return [symbol, fields];
}))) : undefined;
const summary = { generatedAt: new Date().toISOString(), mcpUsed: false, symbolCount: symbols.length, fieldCount: Object.keys(fields).length, covered: rows.reduce((n, r) => n + Object.values(r.fields).filter((f: any) => f.available).length, 0), gaps: rows.reduce((n, r) => n + Object.values(r.fields).filter((f: any) => !f.available).length, 0), rows, analysis360, analysis360FieldCount: fullCatalog ? Object.keys(FIELD_SOURCE_DEFINITIONS).length : 0, analysis360Covered: analysis360 ? Object.values(analysis360).reduce((n: number, s: any) => n + Object.values(s).filter((f: any) => f.available).length, 0) : 0, analysis360Gaps: analysis360 ? Object.values(analysis360).reduce((n: number, s: any) => n + Object.values(s).filter((f: any) => !f.available).length, 0) : 0 };
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ outPath, symbols: symbols.length, fields: Object.keys(fields).length, covered: summary.covered, gaps: summary.gaps, analysis360Fields: summary.analysis360FieldCount, analysis360Covered: summary.analysis360Covered, analysis360Gaps: summary.analysis360Gaps, mcpUsed: false }, null, 2));
