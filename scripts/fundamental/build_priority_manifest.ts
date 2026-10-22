#!/usr/bin/env tsx
/** Build a deterministic enrichment order: invested -> latest strategy matches -> Nifty 500 -> remainder. */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const root = path.resolve(process.cwd());
const outDir = path.join(root, 'data', 'fundamental_enrichment');
const outPath = path.join(outDir, 'priority_manifest.json');
const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');
const pit = path.join(root, 'data', 'v6.4', 'sources', 'ind_nifty500list_20200101.csv');
const all = (db: sqlite3.Database, sql: string, p: any[] = []) => new Promise<any[]>((resolve, reject) => db.all(sql, p, (e, r) => e ? reject(e) : resolve(r || [])));
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));
function parseNifty500(): Set<string> {
  if (!fs.existsSync(pit)) return new Set();
  const set = new Set<string>();
  for (const line of fs.readFileSync(pit, 'utf8').split(/\r?\n/).slice(1)) {
    const fields = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const symbol = (fields[2] || fields[0] || '').toUpperCase();
    if (/^[A-Z0-9&.-]+$/.test(symbol)) set.add(symbol);
  }
  return set;
}

async function main(): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  try {
    const masters = await all(db, "SELECT DISTINCT symbol FROM MasterTickers WHERE status='ACTIVE' AND segment='EQ' AND TRIM(symbol)<>'' ORDER BY symbol");
    const universe = masters.map(r => String(r.symbol).trim().toUpperCase()).filter(Boolean);
    const investedRows = await all(db, "SELECT DISTINCT symbol FROM Holdings WHERE TRIM(symbol)<>''");
    const invested = new Set(investedRows.map(r => String(r.symbol).trim().toUpperCase()));
    // Prefer the newest completed scan that actually produced qualified rows.
    // A newer zero-result/failed-data scan must not erase a valid candidate cohort.
    const latest = (await all(db, "SELECT scan_id FROM strategy_scan_metadata WHERE status='COMPLETE' AND COALESCE(stocks_qualified_total, 0) > 0 ORDER BY created_at DESC LIMIT 1"))[0]?.scan_id || null;
    const strategyRows = latest ? await all(db, 'SELECT DISTINCT symbol FROM strategy_scan_cache WHERE scan_id=? AND qualified=1', [latest]) : [];
    const strategy = new Set(strategyRows.map(r => String(r.symbol).trim().toUpperCase()));
    const nifty = parseNifty500();
    const seen = new Set<string>();
    const groups = { invested: [] as string[], strategyMatches: [] as string[], nifty500: [] as string[], remainder: [] as string[] };
    const add = (group: keyof typeof groups, s: string) => { if (universe.includes(s) && !seen.has(s)) { seen.add(s); groups[group].push(s); } };
    for (const s of universe) if (invested.has(s)) add('invested', s);
    for (const s of universe) if (strategy.has(s)) add('strategyMatches', s);
    for (const s of universe) if (nifty.has(s)) add('nifty500', s);
    for (const s of universe) add('remainder', s);
    const ordered = [...groups.invested, ...groups.strategyMatches, ...groups.nifty500, ...groups.remainder];
    const result = { generatedAt: new Date().toISOString(), source: 'PORTFOLIO_DB_PLUS_LOCAL_NIFTY500_PIT', scanId: latest, limitations: ['Strategy scan had no qualified rows in the latest run.', 'Nifty 500 membership uses the locally persisted 2020-01-01 PIT file; it is not a current official snapshot.'], counts: { universe: universe.length, invested: groups.invested.length, strategyMatches: groups.strategyMatches.length, nifty500: groups.nifty500.length, remainder: groups.remainder.length }, groups, ordered };
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.counts));
  } finally { await close(db); }
}
main().catch(e => { console.error(e); process.exit(1); });
