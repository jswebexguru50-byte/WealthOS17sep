#!/usr/bin/env node
/** Read-only FERE verified_metric audit. Never writes the supplied database. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { promoteVerifiedMetrics, type VerifiedMetricRow } from '../../src/server/research_v2/ingest/ferePromotion.js';

export const APPROVED = ['YUKEN','BECTORFOOD','VMART','TATATECH','OPTIEMUS','ARROWGREEN'] as const;
export type DryRunReport = { mode:'dry-run'; database:string; generatedAt:string; symbols: unknown[]; totals:{rows:number; promoted:number; rejected:number} };

function readRows(dbPath: string): VerifiedMetricRow[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const universe = db.prepare('SELECT isin, symbol FROM universe WHERE UPPER(symbol) IN (' + APPROVED.map(() => '?').join(',') + ')').all(...APPROVED) as Array<{isin:string;symbol:string}>;
    const byIsin = new Map(universe.map(r => [r.isin, r.symbol]));
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='verified_metric'").get()) return [];
    const raw = db.prepare('SELECT isin, period_end, metric, value, input_fact_ids, filing_hashes, available_at, status FROM verified_metric WHERE isin IN (' + [...byIsin.keys()].map(() => '?').join(',') + ')').all(...byIsin.keys()) as Array<Record<string,unknown>>;
    return raw.map(r => ({
      isin: String(r.isin), symbol: byIsin.get(String(r.isin)) ?? '', metric: String(r.metric), value: Number(r.value),
      periodEnd: String(r.period_end), periodStart: null, scope: null, availableAt: r.available_at ? String(r.available_at) : null,
      inputFactIds: parseList(r.input_fact_ids), filingHashes: parseList(r.filing_hashes),
    }));
  } finally { db.close(); }
}
function parseList(value: unknown): string[] { if (Array.isArray(value)) return value.map(String); if (typeof value !== 'string' || !value.trim()) return []; try { const x=JSON.parse(value); return Array.isArray(x) ? x.map(String) : [value]; } catch { return [value]; } }
export function auditRows(rows: VerifiedMetricRow[], database = 'fixture'): DryRunReport {
  const grouped = new Map<string, VerifiedMetricRow[]>();
  for (const row of rows) { const key=(row.symbol || '').toUpperCase(); if (!grouped.has(key)) grouped.set(key,[]); grouped.get(key)!.push(row); }
  const symbols = APPROVED.map(symbol => { const input=grouped.get(symbol) ?? []; const result=promoteVerifiedMetrics(input); return { symbol, inputRows:input.length, promoted:result.facts.length, rejected:result.rejected.length, rejectionReasons:[...new Set(result.rejected.map(r=>r.reason))] }; });
  return { mode:'dry-run', database, generatedAt:new Date().toISOString(), symbols, totals:{rows:rows.length, promoted:symbols.reduce((n,s)=>n+s.promoted,0), rejected:symbols.reduce((n,s)=>n+s.rejected,0)} };
}
export function main(argv=process.argv.slice(2)): number {
  const dbArg=argv[argv.indexOf('--db')+1] || process.env.FERE_DB; const outArg=argv[argv.indexOf('--out')+1];
  if (!dbArg) { console.error('Usage: tsx scripts/research_v2/fere_promotion_dry_run.ts --db <fere_evidence.db> [--out report.json]'); return 2; }
  try { const report=auditRows(readRows(path.resolve(dbArg)),path.resolve(dbArg)); const text=JSON.stringify(report,null,2)+'\n'; if(outArg) { const out=path.resolve(outArg); fs.mkdirSync(path.dirname(out),{recursive:true}); const tmp=out+'.tmp'; fs.writeFileSync(tmp,text); fs.renameSync(tmp,out); } process.stdout.write(text); return 0; } catch(e) { process.stderr.write(`FERE promotion dry-run failed: ${e instanceof Error?e.message:String(e)}\n`); return 1; }
}
// tsx may expose a file URL with a query string, so use the invoked filename.
if (process.argv[1]?.replaceAll('\\','/').endsWith('/fere_promotion_dry_run.ts') || process.argv[1]?.replaceAll('\\','/').endsWith('/fere_promotion_dry_run.js')) process.exitCode=main();
