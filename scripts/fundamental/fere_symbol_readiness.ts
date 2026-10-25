#!/usr/bin/env tsx
/** Read-only 360° readiness audit for one symbol. Never downloads or mutates data. */
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

export type Readiness = { symbol: string; exchange: 'BSE'|'NSE'|'UNKNOWN'; status: 'READY'|'PARTIAL'|'MISSING'; companyFacts: { available:boolean; count:number; providers:string[]; metrics:string[] }; artifacts: Record<string,{available:boolean;files:string[]}>; requirements: Record<string,{ready:boolean;missing:string[]}> };
const root = process.cwd();
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const fereDbPath = path.join(root, 'data', 'fere', 'verified_filings', 'fere_evidence.db');
const requirements = { F1:['revenue','pat'], F2:['operating_profit','roe_pct'], F3:['borrowings'], F4:['cfo'], F5:['roce_reported'], F6:['revenue','pat'], F7:['borrowings','cfo'], ITAS:['revenue','pat','operating_profit'], '29Q':['revenue','pat','cfo','borrowings'], technical:['OHLCV'] };
function filesFor(dir:string,symbol:string){ return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f=>f.toUpperCase().includes(symbol)) : []; }
function artifact(dir:string,symbol:string){ const files=filesFor(dir,symbol); return {available:files.length>0,files}; }
export function buildReadiness(input:string): Readiness {
  const symbol=input.trim().toUpperCase(); if(!symbol) throw new Error('SYMBOL_REQUIRED');
  const exchange=/^\d+$/.test(symbol)?'BSE':/^[A-Z][A-Z0-9&.-]*$/.test(symbol)?'NSE':'UNKNOWN';
  let db: BetterSqlite3.Database|null=null; let companyFacts={available:false,count:0,providers:[] as string[],metrics:[] as string[]};
  try { db=new BetterSqlite3(dbPath,{readonly:true}); const has=(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_facts'").get() as any); if(has){ const rows=db.prepare('SELECT metric,provider FROM company_facts WHERE UPPER(symbol)=? AND value IS NOT NULL').all(symbol) as any[]; const aliases: Record<string,string> = { roe: 'roe_pct' }; const validProvider = (value: unknown) => { const p=String(value||'UNKNOWN'); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p) ? 'UNKNOWN' : p; }; companyFacts={available:rows.length>0,count:rows.length,providers:[...new Set(rows.map(r=>validProvider(r.provider)))].sort(),metrics:[...new Set(rows.map(r=>aliases[String(r.metric)] || String(r.metric)))].sort()}; } } catch {} finally { db?.close(); }
  const artifacts={institutional29:artifact(path.join(root,'outputs','institutional29'),symbol),xbrl:artifact(path.join(root,'data','fere','verified_filings'),symbol),mca:artifact(path.join(root,'data','mca'),symbol),technical:artifact(path.join(root,'data','market_data'),symbol),fereDatabase:{available:fs.existsSync(fereDbPath),files:fs.existsSync(fereDbPath)?[fereDbPath]:[]}};
  const result:Readiness['requirements']={}; for(const [name,metrics] of Object.entries(requirements)){const missing=metrics.filter(m=>m==='OHLCV'?!artifacts.technical.available:!companyFacts.metrics.includes(m));result[name]={ready:missing.length===0,missing};}
  const checks=Object.values(result); const status=checks.every(x=>x.ready)?'READY':checks.some(x=>x.ready||companyFacts.available)?'PARTIAL':'MISSING'; return {symbol,exchange,status,companyFacts,artifacts,requirements:result};
}
if(import.meta.url===`file://${process.argv[1]}`){const i=process.argv.indexOf('--symbol');const symbol=i>=0?process.argv[i+1]:process.argv[2];if(!symbol)throw new Error('Usage: tsx scripts/fundamental/fere_symbol_readiness.ts --symbol INFY');console.log(JSON.stringify(buildReadiness(symbol),null,2));}
