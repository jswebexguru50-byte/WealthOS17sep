#!/usr/bin/env node
// Run from a checkout where @modelcontextprotocol/sdk is installed.
// Reads the subscription URL from TRENDLYNE_MCP_URL; never logs the URL.
// Outputs a private local JSON file, not the repository or scanner database.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function chunks(list, size) { const out=[]; for(let i=0;i<list.length;i+=size) out.push(list.slice(i,i+size)); return out; }
const [inputPath,outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Usage: node trendlyne_fetch.mjs request.json output.json');
if (!process.env.TRENDLYNE_MCP_URL) throw new Error('TRENDLYNE_MCP_URL is not set');
const endpoint = new URL(process.env.TRENDLYNE_MCP_URL);
if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'mcp.trendlyne.com') throw new Error('Expected official Trendlyne HTTPS endpoint');
const req=JSON.parse(await readFile(resolve(inputPath),'utf8'));
const stocks=[...new Set(req.stock_codes ?? [])], tokens=[...new Set(req.parameters ?? [])];
if (!stocks.length || !tokens.length || stocks.some(s=>typeof s!=='string'||!s.trim()) || tokens.some(s=>typeof s!=='string'||!s.trim())) throw new Error('Provide nonempty stock_codes and verified parameter tokens');
const batches=chunks(stocks,10).flatMap(s=>chunks(tokens,50).map(p=>({stock_codes:s,parameters:p})));
const maxCalls=req.max_calls;
if (!Number.isInteger(maxCalls) || maxCalls<1 || batches.length>maxCalls) throw new Error('Explicit max_calls required; batch count exceeds budget');
const client=new Client({name:'wealthos-parallel-scan',version:'0.1.0'}); const responses=[];
try {
  try { await client.connect(new StreamableHTTPClientTransport(endpoint)); }
  catch { throw new Error('Trendlyne MCP connection failed; check credentials and network'); }
  for(const args of batches) {
    try {
      const response=await client.callTool({name:'get_stock_parameter_values',arguments:args});
      responses.push({request:args,received_at:new Date().toISOString(),state:response.isError?'provider_error':'received_unvalidated',response});
      if(response.isError) break;
    } catch { responses.push({request:args,received_at:new Date().toISOString(),state:'request_failed'}); break; }
  }
} finally { await client.close().catch(()=>{}); }
await writeFile(resolve(outputPath),JSON.stringify({source:'Trendlyne MCP',note:'Raw responses require identity, units, basis and period verification before use.',responses},null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
console.log(JSON.stringify({requested_batches:batches.length,completed_batches:responses.length,states:responses.map(r=>r.state)}));
if(responses.length!==batches.length || responses.some(r=>r.state!=='received_unvalidated')) process.exitCode=1;
