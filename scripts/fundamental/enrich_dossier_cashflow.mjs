#!/usr/bin/env node
/** Direct Trendlyne annual snapshots; no canonical database promotion. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parseParameterResponse } from './institutional29/trendlyne_response_parser.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const definitions=[{parameter:'opa',helping_text:'Operating Profit Ann.'},{parameter:'cfoa',helping_text:'Cash from Operating Act. Ann.'}];
export function parse(result,symbols){
 if(result.isError)throw new Error('PROVIDER_ERROR');
 const parsed=parseParameterResponse(result,symbols,definitions);
 const rows={};
 for(const symbol of symbols){
  const cells=parsed.bySymbol[symbol]||{};
  const cfo=cells.cfoa?.value,op=cells.opa?.value;
  if(Number.isFinite(cfo)&&Number.isFinite(op)&&op>0&&Number.isFinite(cfo/op))
   rows[symbol]={cfoCr:cfo,operatingEbitdaCr:op,ratio:cfo/op,identity:parsed.identities.find(i=>i.symbol===symbol)};
 }
 return rows;
}
function save(file,data){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file);}
async function main(){
 if(process.argv.includes('--self-test')){
  const result={content:[{type:'text',text:JSON.stringify({status:'success',data:'1|Test|TEST|1|2026-10-23\\n\\nOperating Profit Ann.\\nTEST:100\\n\\n---\\n\\nCash from Operating Act. Ann.\\nTEST:80\\n\\n---'})}]};
  assert.equal(parse(result,['TEST']).TEST.ratio,.8);
  assert.deepEqual(parse(result,['OTHER']),{});
  result.content[0].text=result.content[0].text.replace('TEST:100','TEST:0');assert.deepEqual(parse(result,['TEST']),{});
  console.log('Trendlyne parsing checks passed: reordered labels, identity checks, zero denominator.');return;
 }
 const scanPath=process.argv[2];if(!scanPath)throw new Error('Usage: enrich_dossier_cashflow.mjs scan.json');
 for(const file of ['.env','WealthOS04Oct/.env'])if(fs.existsSync(path.join(root,file)))dotenv.config({path:path.join(root,file),quiet:true});
 let url=process.env.TRENDLYNE_MCP_URL;
 if(!url)try{const cfg=JSON.parse(fs.readFileSync(path.join(root,'.agents/mcp_config.json'),'utf8'));url=cfg.mcpServers?.trendlyne?.url||cfg.mcpServers?.trendlyne?.serverUrl;}catch{}
 if(!url)throw new Error('Trendlyne connection not configured');
 const scan=JSON.parse(fs.readFileSync(scanPath,'utf8'));
 const auditPath=scanPath+'.trendlyne-cashflow.json';
 const audit={fetchedAt:new Date().toISOString(),parameters:['cfoa','opa'],batches:[]};
 const client=new Client({name:'wealthos-dossier-cashflow',version:'1.0.0'});
 let rows={}, names={};
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(url)),{timeout:20000});
  for(let i=0;i<scan.stocks.length;i+=10){
   const symbols=scan.stocks.slice(i,i+10).map(s=>s.symbol);
   let entry={symbols,fetchedAt:new Date().toISOString()};
   for(let attempt=0;attempt<2;attempt++){
    try{
     const response=await client.callTool({name:'get_stock_parameter_values',arguments:{stock_codes:symbols,parameters:['cfoa','opa']}},undefined,{timeout:30000});
     entry.response=response;entry.sha256=crypto.createHash('sha256').update(JSON.stringify(response)).digest('hex');
     Object.assign(rows,parse(response,symbols));
     for(const identity of parseParameterResponse(response,symbols,definitions).identities) names[identity.symbol]=identity.companyName;
     delete entry.errorType;break;
    }catch(e){entry.errorType=e.name;}
   }
   audit.batches.push(entry);save(auditPath,audit);
   console.log(`Trendlyne: ${Math.min(i+10,scan.stocks.length)}/${scan.stocks.length}; usable ratios ${Object.keys(rows).length}`);
  }
 }finally{await client.close().catch(()=>{});}
 if(!Object.keys(rows).length)throw new Error('No usable Trendlyne ratios; original scan preserved');
 for(const stock of scan.stocks){
  if(names[stock.symbol]) stock.companyName=names[stock.symbol];
  // Never retain a TradingView EBIT ratio under the new EBITDA definition.
  stock.cfRatio=null;stock.cashFlowEvidence=null;
  stock.filters ||= {};stock.filters.F5_cashflow=null;
  const row=rows[stock.symbol];
  if(row){
   const entry=audit.batches.find(b=>b.symbols.includes(stock.symbol));
   stock.cfRatio=row.ratio;
   stock.cashFlowEvidence={source:'Trendlyne',cfoINR:row.cfoCr*1e7,operatingIncomeINR:row.operatingEbitdaCr*1e7,
    denominator:'Annual operating EBITDA before exceptional items',period:'Latest annual snapshot; fiscal year not verified',periodType:'ANNUAL',
    scope:'Provider default; statement scope not verified per stock',fetchedAt:entry.fetchedAt,responseSha256:entry.sha256,
    sourceUrl:'https://trendlyne.com/',periodVerified:false,observationDate:row.identity.observationDate};
   // Annual tokens have no fiscal end date. A ratio is displayed as provisional,
   // but cannot earn a confirmed filter point until its fiscal anchor is verified.
  }
  stock.passCount=Object.values(stock.filters).filter(v=>v===true).length;
 }
 scan.cashFlowEnrichment={fetchedAt:audit.fetchedAt,covered:Object.keys(rows).length,total:scan.stocks.length,trendlyneStatus:'available',
  auditPath,basis:'Annual CFO / operating EBITDA before exceptional items',periodStatus:'UNVERIFIED_ANNUAL_SNAPSHOT',confirmedPasses:0};
 save(scanPath,scan);
 console.log(`Saved ${Object.keys(rows).length}/${scan.stocks.length} annual ratios; fiscal-year verification pending.`);
}
main().catch(e=>{console.error('Cash-flow enrichment failed:',e.name);process.exitCode=1;});
