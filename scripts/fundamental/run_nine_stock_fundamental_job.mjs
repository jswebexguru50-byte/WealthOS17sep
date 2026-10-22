import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const root=process.cwd(), db=new Database(path.join(root,'portfolio.db'));
const symbols=['VMART','RADICO','KRYSTAL','PROTEAN','JUSTDIAL','DBOL','LUMAXTECH','SONACOMS','TARSONS'];
const now=new Date().toISOString(), asOf=now.slice(0,10), runId=`DR-TRENDLYNE-${asOf.replaceAll('-','')}-${crypto.createHash('sha256').update(symbols.join('|')).digest('hex').slice(0,8)}`;
const types=['TECHNICAL','FUNDAMENTAL','QGLP','SECTOR','RISK','FUNDAMENTAL_EXECUTIVE_SUMMARY','ONE_PAGE_COMPANY_SUMMARY'];
const rows=db.prepare("select symbol,endpoint,response_json,fetched_at from fundamental_endpoint_snapshots where provider='TRENDLYNE_MCP'").all();
function unwrap(v){let x=v; for(let i=0;i<4&&typeof x==='string';i++){try{x=JSON.parse(x)}catch{break}} return x}
function textOf(v){const x=unwrap(v); if(typeof x==='string')return x; if(x?.structuredContent?.result)return textOf(x.structuredContent.result); if(x?.content?.[0]?.text)return textOf(x.content[0].text); if(x?.data)return typeof x.data==='string'?x.data:JSON.stringify(x.data); return ''}
function sections(raw){const out={}; const s=textOf(raw); for(const block of s.split(/\n\s*---\s*\n/)){const ls=block.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); if(!ls.length)continue; let label=null, vals={}; for(let i=0;i<ls.length;i++){const line=ls[i]; const m=line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/); if(m){vals[m[1]]=m[2].trim(); if(!label)label='metrics'} else if(!line.includes(':') && ls.slice(i+1).some(x=>new RegExp('^[A-Z][A-Z0-9_]*:').test(x))){label=line; vals={}; for(const q of ls.slice(i+1)){const z=q.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/); if(z)vals[z[1]]=z[2].trim()} break}} if(label&&Object.keys(vals).length)out[label]=vals} return out }
const metricMap=new Map();
for(const r of rows){const sec=sections(r.response_json); for(const [label,vals] of Object.entries(sec)) for(const [sym,val] of Object.entries(vals)) if(symbols.includes(sym)) metricMap.set(`${sym}|${label}`,val)}
function find(sym, patterns){for(const [k,v] of metricMap){if(!k.startsWith(sym+'|'))continue; const label=k.slice(sym.length+1); if(patterns.some(p=>p.test(label))) return {value:v,label}} return null}
function num(x){if(!x||/none|null|na|not available/i.test(x))return null; const n=Number(String(x).replace(/,/g,'')); return Number.isFinite(n)?n:null}
const defs=[['marketCap',/market cap/i],['ltp',/^LTP$/i],['pe',/P\/E|PE TTM|price earning/i],['revenueGrowth',/revenue.*growth|sales.*growth/i],['profitGrowth',/profit.*growth|PAT.*growth|net profit.*growth/i],['roe',/^ROE/i],['roce',/^ROCE/i],['debtEquity',/debt.*equity|D\/E/i],['cfoPat',/CFO.*PAT|cash flow.*profit/i],['promoterHolding',/promoter holding latest/i],['fiiHolding',/FII holding current/i]];
function facts(sym){const o={}; for(const [k,p] of defs){const f=find(sym,[p]); o[k]=f?{value:num(f.value)??f.value,providerLabel:f.label,source:'TRENDLYNE_MCP',asOf}:null} return o}
function sources(sym){return rows.filter(r=>r.symbol===sym&&r.endpoint.startsWith('pack:')).map(r=>({endpoint:r.endpoint,fetchedAt:r.fetched_at})).sort((a,b)=>a.endpoint.localeCompare(b.endpoint))}
db.exec('BEGIN');
try{
 db.prepare(`insert or ignore into dossier_runs(dossierRunId,requestMode,requestedTradingSessions,actualTradingDates,scanAsOf,strategiesConfig,status,createdAt,completedAt) values(?,?,?,?,?,?,?,?,?)`).run(runId,'FIXED_TRENDLYNE_JOB',null,JSON.stringify([asOf]),now,JSON.stringify({provider:'TRENDLYNE_MCP',symbols,reviewState:'AWAITING_INDEPENDENT_REVIEW'}),'COMPLETED',now,now);
 for(const sym of symbols){const candidateId=`CAND-${runId.slice(-8)}-${sym}`; db.prepare(`insert or replace into dossier_candidates(candidateId,dossierRunId,symbol,convergenceCount,status,lifecycleStatus,createdAt) values(?,?,?,?,?,?,?)`).run(candidateId,runId,sym,0,'ANALYZED','ANALYZED',now); const f=facts(sym); const available=Object.values(f).filter(Boolean).length; const evidence={provider:'TRENDLYNE_MCP',asOf,sourceEndpoints:sources(sym),metrics:f,coverage:{available,total:defs.length}};
  const qglp={quality:{roe:f.roe,roce:f.roce,debtEquity:f.debtEquity},growth:{revenueGrowth:f.revenueGrowth,profitGrowth:f.profitGrowth},longevity:{promoterHolding:f.promoterHolding},price:{pe:f.pe},status:'EVIDENCE_ONLY',score:null};
  const summary=`${sym} — evidence-bounded fundamental snapshot as of ${asOf}. Trendlyne MCP returned ${available} of ${defs.length} configured summary metrics. Current valuation/price fields are reported as provider values; profitability, growth, leverage, cash conversion and ownership fields are shown only where directly returned. No rating or price target is inferred. Review state: AWAITING_INDEPENDENT_REVIEW.`;
  const one={companyName:sym,summaryText:summary,asOf,source:'TRENDLYNE_MCP',reviewState:'AWAITING_INDEPENDENT_REVIEW',filters:{marketCap:f.marketCap,revenueGrowth:f.revenueGrowth,profitGrowth:f.profitGrowth,roe:f.roe,roce:f.roce,debtEquity:f.debtEquity,cfoPat:f.cfoPat,promoterHolding:f.promoterHolding,fiiHolding:f.fiiHolding,pe:f.pe},evidence,missingDataChecklist:defs.filter(([k])=>!f[k]).map(([k])=>k)};
  const payloads={TECHNICAL:{asOf,source:'TRENDLYNE_MCP',ltp:f.ltp},FUNDAMENTAL:evidence,QGLP:qglp,SECTOR:{asOf,source:'TRENDLYNE_MCP',status:'EVIDENCE_ONLY'},RISK:{asOf,missingDataChecklist:one.missingDataChecklist,reviewState:'AWAITING_INDEPENDENT_REVIEW'},FUNDAMENTAL_EXECUTIVE_SUMMARY:{summaryText:summary,asOf,source:'TRENDLYNE_MCP'},ONE_PAGE_COMPANY_SUMMARY:one};
  for(const type of types) db.prepare(`insert or replace into dossier_analysis_snapshots(analysisSnapshotId,dossierRunId,candidateId,symbol,analysisType,asOf,content,analysisVersion,generatedAt) values(?,?,?,?,?,?,?,?,?)`).run(`SNAP-${runId.slice(-8)}-${sym}-${type}`,runId,candidateId,sym,type,asOf,JSON.stringify(payloads[type]),'trendlyne-fixed-job-v1',now);
 }
 db.prepare(`update dossier_runs set status='COMPLETED',completedAt=? where dossierRunId=?`).run(now,runId); db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK'); throw e}
const reportDir=path.join(root,'reports','fundamental-review'); fs.mkdirSync(reportDir,{recursive:true}); const out=[];
for(const sym of symbols){const one=JSON.parse(db.prepare("select content from dossier_analysis_snapshots where dossierRunId=? and symbol=? and analysisType='ONE_PAGE_COMPANY_SUMMARY'").get(runId,sym).content); out.push({symbol:sym,...one})}
fs.writeFileSync(path.join(reportDir,`NINE_STOCK_ONE_PAGE_${asOf}.json`),JSON.stringify({runId,generatedAt:now,reviewState:'AWAITING_INDEPENDENT_REVIEW',rows:out},null,2));
fs.writeFileSync(path.join(reportDir,`NINE_STOCK_ONE_PAGE_${asOf}.md`),`# WealthOS — Nine-stock one-page fundamental summaries\n\nGenerated ${now}. Evidence source: Trendlyne MCP persisted snapshots. Review state: AWAITING_INDEPENDENT_REVIEW.\n\n`+out.map(x=>`## ${x.symbol}\n\n${x.summaryText}\n\nFilters: ${Object.entries(x.filters).map(([k,v])=>`${k}=${v?.value??'NOT_RETURNED'}`).join(' | ')}\n\n`).join('---\n\n'));
console.log(JSON.stringify({runId,symbols,analysisSnapshots:db.prepare('select count(*) n from dossier_analysis_snapshots where dossierRunId=?').get(runId).n,reportDir},null,2)); db.close();
