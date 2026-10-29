#!/usr/bin/env tsx
/** Build the deterministic exchange/listing/readiness acceptance matrix. */
import fs from 'node:fs';
import path from 'node:path';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const manifestPath = arg('--manifest');
const ledgerPath = arg('--ledger');
if (!manifestPath || !ledgerPath) throw new Error('--manifest and --ledger are required');
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.resolve(ledgerPath), 'utf8'));
const entries = Array.isArray(manifest) ? manifest : (manifest.entries || manifest.symbols || []);
const readiness = new Map((ledger.rows || []).map((r: any) => [String(r.symbol).toUpperCase(), r]));
const rows = entries.map((entry: any) => {
  const listings = Array.isArray(entry?.listings) ? entry.listings : [{ exchange: entry?.exchange || 'UNKNOWN', symbol: entry?.symbol || entry }];
  const exchanges = [...new Set(listings.map((l: any) => String(l.exchange || '').toUpperCase()).filter(Boolean))];
  const cohort = exchanges.length > 1 ? 'DUAL_LISTED' : exchanges[0] === 'BSE' ? 'BSE_ONLY' : exchanges[0] === 'NSE' ? 'NSE_ONLY' : 'UNRESOLVED';
  const symbol = String(entry?.symbol || listings[0]?.symbol || entry).toUpperCase();
  const row: any = readiness.get(symbol);
  const fields = row?.fields || {};
  const missing = Object.entries(fields).filter(([, v]: any) => v.status === 'GAP').map(([field]) => field);
  return { symbol, isin: entry?.isin || null, exchanges, cohort, status: missing.length ? 'PARTIAL' : row ? 'READY' : 'MISSING', missing };
});
const counts = Object.fromEntries([...new Set(rows.map(r => r.cohort))].map(c => [c, { symbols: rows.filter(r => r.cohort === c).length, ready: rows.filter(r => r.cohort === c && r.status === 'READY').length, partial: rows.filter(r => r.cohort === c && r.status === 'PARTIAL').length, missing: rows.filter(r => r.cohort === c && r.status === 'MISSING').length }]));
const uniqueSymbols = new Set(rows.map(r => r.symbol)).size;
const result = {
  generatedAt: new Date().toISOString(),
  mcpUsed: false,
  // `symbols` is the number of manifest listing rows; duplicate symbols can
  // legitimately exist when an issuer has multiple exchange listings.
  symbols: rows.length,
  uniqueSymbols,
  duplicateRows: rows.length - uniqueSymbols,
  counts,
  rows,
};
const out = arg('--out') || path.join(process.cwd(), 'reports', 'non_mcp', 'readiness_acceptance_matrix.json');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out, symbols: rows.length, uniqueSymbols, duplicateRows: rows.length - uniqueSymbols, counts }, null, 2));
