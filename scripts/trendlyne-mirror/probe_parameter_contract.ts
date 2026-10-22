import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const root = process.cwd();
const cfg = JSON.parse(fs.readFileSync(path.join(root,'.agents','mcp_config.json'),'utf8'));
const url = cfg?.mcpServers?.trendlyne?.serverUrl || cfg?.mcpServers?.trendlyne?.url;
const c = new Client({name:'wealthos-contract-probe',version:'1.0.0'});
await c.connect(new StreamableHTTPClientTransport(new URL(url)));
const probes = [
  {stock_codes:['VMART','RADICO','KRYSTAL','PROTEAN','JUSTDIAL','DBOL','LUMAXTECH','SONACOMS','TARSONS'],parameters:['sra','npa','opa','roea','rocea','cfoa','debtcea','pettm','mcapq','currentprice']},
  {stock_codes:['VMART'],parameters:['sra']},
  {stock_codes:['VMART'],parameters:['sra','npa']},
  {stock_codes:['VMART'],parameters:['currentprice']},
  {stock_codes:['VMART'],parameters:['roea','rocea','cfoa']},
];
for (const args of probes) {
  const response = await c.callTool({name:'get_stock_parameter_values',arguments:args});
  console.log(JSON.stringify({args,response},null,2));
}
