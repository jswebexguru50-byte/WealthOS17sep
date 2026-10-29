#!/usr/bin/env tsx
/** Emit only symbols that failed canonical promotion verification. */
import fs from 'node:fs';
import path from 'node:path';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const input = arg('--verification');
if (!input) throw new Error('--verification is required');
const report = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
const sourcePath = arg('--source-manifest');
const source = sourcePath ? JSON.parse(fs.readFileSync(path.resolve(sourcePath), 'utf8')) : null;
const sourceEntries = Array.isArray(source) ? source : (source?.entries || source?.symbols || []);
const sourceBySymbol = new Map(sourceEntries.map((entry: any) => {
  const listing = entry?.listings?.[0];
  const symbol = String(entry?.symbol || listing?.symbol || entry).toUpperCase();
  return [symbol, entry];
}));
// Partial canonical coverage is already promoted; it belongs in the
// field-level coverage ledger rather than an acquisition retry loop.
const rows = (report.rows || []).filter((r: any) => r.status === 'NOT_PROMOTED');
const symbols = [...new Set(rows.map((r: any) => String(r.symbol).toUpperCase()))];
const entries = symbols.map(symbol => {
  const original: any = sourceBySymbol.get(symbol);
  const originalListing = original?.listings?.[0];
  const exchange = String(originalListing?.exchange || (/^\d+$/.test(symbol) ? 'BSE' : 'NSE')).toUpperCase();
  return {
    key: `${exchange}:${symbol}`,
    isin: original?.isin || null,
    listings: [{ symbol, exchange, route: exchange }],
    status: 'pending',
    attempts: 0,
    lastError: null,
  };
});
const out = arg('--out') || path.join(process.cwd(), 'reports', 'non_mcp', 'promotion_gap_manifest.json');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), source: 'promotion_verification', entries }, null, 2) + '\n');
console.log(JSON.stringify({ out, symbols: symbols.length }, null, 2));
