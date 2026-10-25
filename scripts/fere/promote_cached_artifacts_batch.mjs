#!/usr/bin/env node
/** Promote local cached artifacts only; no acquisition and no MCP. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService.ts';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i>=0&&process.argv[i+1]?process.argv[i+1]:d};
const root=process.cwd(), manifestPath=path.resolve(root,arg('--manifest','outputs/fere/combined_exchange_manifest.json'));
const dbPath=path.resolve(root,process.env.DATABASE_URL||'portfolio.db'), limit=Math.max(0,Number(arg('--limit','0'))||0), minFacts=Math.max(1,Number(arg('--min-facts','29'))||29), apply=process.argv.includes('--apply');
if(!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
if(!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const entries=(Array.isArray(manifest.entries)?manifest.entries:Array.isArray(manifest)?manifest:[]).flatMap(e=>Array.isArray(e?.listings)?e.listings.map(l=>({...e,...l})): [e]);
const db=new Database(dbPath); if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='company_facts'").get()) throw new Error('company_facts table is missing; refusing promotion');
const count=db.prepare('SELECT COUNT(*) n FROM company_facts WHERE UPPER(symbol)=UPPER(?)'), rootArtifacts=path.resolve(root,'outputs/institutional29');
const out={mode:apply?'apply':'dry_run',mcp:'disabled',total:0,outcomes:[]};
for(const e of entries.filter(x=>x?.symbol).slice(0,limit||entries.length)){
  const symbol=String(e.symbol).trim().toUpperCase(), existing=Number(count.get(symbol)?.n||0);
  if(existing>=minFacts){out.outcomes.push({symbol,status:'already_covered',facts:existing,minFacts});continue;}
  const artifactPath=path.join(rootArtifacts,symbol,'trendlyne_raw.json');
  if(!fs.existsSync(artifactPath)){out.outcomes.push({symbol,status:'no_cached_artifact',facts:0});continue;}
  let raw; try{raw=JSON.parse(fs.readFileSync(artifactPath,'utf8'));}catch(error){out.outcomes.push({symbol,status:'invalid_cached_artifact',error:String(error.message||error)});continue;}
  const text=JSON.stringify(raw).toLowerCase(), source=text.includes('xbrl')?'NSE_BSE_XBRL':text.includes('upstox')?'UPSTOX_CACHED':text.includes('mca')?'MCA_CACHED':'SCREENER_PUBLIC';
  const lineage={source,artifactPath,sourceDocumentId:`${source}:${symbol}:${fs.statSync(artifactPath).mtimeMs}`};
  if(!apply){out.outcomes.push({symbol,status:'would_promote',facts:0,lineage});continue;}
  try{const promoted=await new CanonicalFactIngestionService(db).ingestExchangeArtifactForSymbol(symbol,artifactPath), after=Number(count.get(symbol)?.n||0);out.outcomes.push({symbol,status:promoted.factsAvailable>0&&after>0?'promoted':'promotion_empty',facts:after,factsInserted:promoted.factsInserted,lineage:{...lineage,artifactHash:promoted.artifactHash}});}catch(error){out.outcomes.push({symbol,status:'promotion_error',error:String(error.message||error),lineage});}
}
out.total=out.outcomes.length;db.close();console.log(JSON.stringify(out,null,2));
