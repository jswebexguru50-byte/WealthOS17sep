#!/usr/bin/env tsx
/** Build a read-only field-level coverage ledger before any MCP work. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const root = process.cwd();
const manifestPath = arg('--manifest');
const outPath = arg('--out') || path.join(root, 'reports', 'non_mcp', 'coverage_ledger.json');
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
const ohlcvTable = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('DailyOHLCV','daily_ohlcv')").all() as any[]).map(r => r.name));
const rows = symbols.map(symbol => ({ symbol, fields: Object.fromEntries(Object.entries(fields).map(([metric, spec]) => {
  const matches = factRows.filter(r => r.symbol === symbol && (r.metric === metric || (metric === 'roe_pct' && r.metric === 'roe')));
  const providers = [...new Set(matches.map(r => r.provider || 'UNKNOWN'))];
  const available = metric === 'OHLCV' ? ohlcvTable.size > 0 : matches.length > 0;
  return [metric, { requiredPeriod: spec.period, available, providers, fallbackOrder: spec.sources, status: available ? 'COVERED' : 'GAP' }];
})) }));
db.close();
const summary = { generatedAt: new Date().toISOString(), mcpUsed: false, symbolCount: symbols.length, fieldCount: Object.keys(fields).length, covered: rows.reduce((n, r) => n + Object.values(r.fields).filter((f: any) => f.available).length, 0), gaps: rows.reduce((n, r) => n + Object.values(r.fields).filter((f: any) => !f.available).length, 0), rows };
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ outPath, symbols: symbols.length, fields: Object.keys(fields).length, covered: summary.covered, gaps: summary.gaps, mcpUsed: false }, null, 2));
