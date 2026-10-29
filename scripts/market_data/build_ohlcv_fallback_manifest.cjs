#!/usr/bin/env node
'use strict';
const fs=require('node:fs'); const path=require('node:path');
const input=process.argv[2] || 'reports/market-data/upstox-daily-20261029/failure_classification.json';
const out=process.argv[3] || 'reports/market-data/upstox-daily-20261029/fallback_manifest.json';
const x=JSON.parse(fs.readFileSync(input,'utf8'));
const eligible=(x.failures||[]).filter(f=>['BSE_UPSTOX_REJECTED','NSE_UPSTOX_REJECTED'].includes(f.classification));
const by=new Map(); for(const f of eligible){const k=`${f.symbol}|${f.isin||''}`; if(!by.has(k)) by.set(k,{symbol:f.symbol,isin:f.isin||null,exchange:f.exchange||null,series:f.series||'EQ',from:f.from,to:f.to,nextSource:f.nextSource||'KITE_OR_EXCHANGE_WEB'});}
fs.mkdirSync(path.dirname(out),{recursive:true}); const result={generatedAt:new Date().toISOString(),source:path.resolve(input),mcpUsed:false,entries:[...by.values()],counts:{eligible:by.size,excluded:(x.failures||[]).length-by.size}}; fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify({outPath:path.resolve(out),...result.counts,mcpUsed:false}));
