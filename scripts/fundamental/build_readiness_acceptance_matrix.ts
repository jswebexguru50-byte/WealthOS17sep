#!/usr/bin/env tsx
/** Build the deterministic exchange/listing/readiness acceptance matrix. */
import fs from 'node:fs';
import path from 'node:path';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const manifestPath = arg('--manifest');
const ledgerPath = arg('--ledger');
export function buildAcceptanceMatrix(manifest: any, ledger: any) {
const entries = Array.isArray(manifest) ? manifest : (manifest?.entries || manifest?.symbols || []);
if (!Array.isArray(entries)) throw new Error('MANIFEST_ENTRIES_REQUIRED');
const readiness = new Map((ledger?.rows || []).map((r: any) => [String(r.symbol).toUpperCase(), r]));
const rows = entries.map((entry: any) => {
  const rawSymbol = String(entry?.symbol || entry?.key || entry || '').split(':').pop() || '';
  const keyExchange = String(entry?.key || '').split(':')[0]?.toUpperCase();
  // Combined exchange manifests may carry only `key: NSE:SYMBOL` or a
  // numeric BSE scrip. Preserve explicit listings first, then apply the
  // canonical numeric/BSE routing rule used by acquisition.
  const inferredExchange = keyExchange === 'NSE' || keyExchange === 'BSE'
    ? keyExchange
    : /^\d+$/.test(rawSymbol) ? 'BSE' : rawSymbol ? 'NSE' : 'UNKNOWN';
  const listings = Array.isArray(entry?.listings) ? entry.listings : [{ exchange: entry?.exchange || inferredExchange, symbol: rawSymbol }];
  const exchanges = [...new Set(listings.map((l: any) => String(l.exchange || '').toUpperCase()).filter(Boolean))];
  const cohort = exchanges.length > 1 ? 'DUAL_LISTED' : exchanges[0] === 'BSE' ? 'BSE_ONLY' : exchanges[0] === 'NSE' ? 'NSE_ONLY' : 'UNRESOLVED';
  const symbol = String(entry?.symbol || listings[0]?.symbol || rawSymbol || entry).toUpperCase();
  const row: any = readiness.get(symbol);
  const fields = row?.fields && typeof row.fields === 'object' ? row.fields : null;
  // A row without a field map is not evidence of coverage. Treat it as
  // missing so malformed/partial ledgers cannot silently certify a symbol.
  if (!row || !fields) return { symbol, isin: entry?.isin || null, exchanges, cohort, status: 'MISSING', missing: ['FIELD_COVERAGE_LEDGER'] };
  const missing = Object.entries(fields).filter(([, v]: any) => v.status === 'GAP').map(([field]) => field);
  return { symbol, isin: entry?.isin || null, exchanges, cohort, status: missing.length ? 'PARTIAL' : row ? 'READY' : 'MISSING', missing };
});
const counts = Object.fromEntries([...new Set(rows.map(r => r.cohort))].map(c => [c, { symbols: rows.filter(r => r.cohort === c).length, ready: rows.filter(r => r.cohort === c && r.status === 'READY').length, partial: rows.filter(r => r.cohort === c && r.status === 'PARTIAL').length, missing: rows.filter(r => r.cohort === c && r.status === 'MISSING').length }]));
const uniqueSymbols = new Set(rows.map(r => r.symbol)).size;
return {
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
}
const invokedAsCli = Boolean(process.argv[1] && /build_readiness_acceptance_matrix(?:\.m?js|\.ts)?$/.test(process.argv[1]));
if (invokedAsCli && (!manifestPath || !ledgerPath)) throw new Error('--manifest and --ledger are required');
if (manifestPath && ledgerPath) {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(path.resolve(ledgerPath), 'utf8'));
  const result = buildAcceptanceMatrix(manifest, ledger);
  const out = arg('--out') || path.join(process.cwd(), 'reports', 'non_mcp', 'readiness_acceptance_matrix.json');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ out, symbols: result.symbols, uniqueSymbols: result.uniqueSymbols, duplicateRows: result.duplicateRows, counts: result.counts }, null, 2));
}
