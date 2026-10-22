import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { TRENDLYNE_PACKS_V1 } from '../../src/server/services/trendlyne-mirror/TrendlyneMirrorService.js';

const root = process.cwd();
const symbols = ['VMART','RADICO','KRYSTAL','PROTEAN','JUSTDIAL','DBOL','LUMAXTECH','SONACOMS','TARSONS'];
const db = new Database(path.join(root, 'portfolio.db'));
const config = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'mcp_config.json'), 'utf8'));
const url = config?.mcpServers?.trendlyne?.serverUrl || config?.mcpServers?.trendlyne?.url;
if (!url) throw new Error('Trendlyne MCP URL is not configured.');
const now = new Date().toISOString();
const chunks = <T>(a: T[], n: number) => Array.from({length: Math.ceil(a.length / n)}, (_, i) => a.slice(i*n, i*n+n));
const hash = (v: unknown) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function save(symbol: string, packId: string, chunkIndex: number, tokens: string[], payload: unknown, status: string, error: string | null) {
  const fetchedAt = new Date().toISOString();
  const raw = JSON.stringify(payload);
  const endpoint = `pack:${packId}:chunk${chunkIndex}`;
  db.prepare(`INSERT OR REPLACE INTO fundamental_endpoint_snapshots
    (symbol,isin,provider,endpoint,authority,source_url,fetched_at,status,http_status,error,response_json)
    VALUES (?,NULL,'TRENDLYNE_MCP',?,'LICENSED_PROVIDER',?,?,?,200,?,?)`)
    .run(symbol, endpoint, 'mcp://trendlyne/get_stock_parameter_values', fetchedAt, status, error, raw);
  db.prepare(`INSERT INTO fundamental_source_snapshots
    (symbol,isin,provider,authority,source_url,fetched_at,status,error,response_json)
    VALUES (?,NULL,'TRENDLYNE_MCP','LICENSED_PROVIDER',?,?,?,?,?)`)
    .run(symbol, 'mcp://trendlyne/get_stock_parameter_values', fetchedAt, status, error, raw);
  return {symbol, packId, tokenCount: tokens.length, status, responseHash: hash(payload), error};
}
const client = new Client({name:'wealthos-eight-pack-fetcher', version:'1.0.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
const results: any[] = [];
for (const pack of TRENDLYNE_PACKS_V1) {
  // Provider contract: up to 10 symbols and 10 parameters per call.
  // Trendlyne currently rejects cffa; retain the other verified F04 tokens.
  const packTokens = pack.packId === 'F04_CASH_CAPITAL' ? pack.tokens.filter(t => t !== 'cffa') : pack.tokens;
  let chunkIndex = 0;
  for (const tokenChunk of chunks(packTokens, 10)) {
    chunkIndex++;
    for (const symbolChunk of chunks(symbols, 10)) {
      try {
        const response = await client.callTool({name:'get_stock_parameter_values', arguments:{stock_codes:symbolChunk, parameters:tokenChunk}});
        const text = (response as any)?.content?.[0]?.text || '';
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch {}
        const dataText = String((parsed as any)?.data || '');
        const hasMetricRows = /\n\n[^\n]+\n[A-Z0-9&.-]+:/i.test(dataText);
        const status = (response as any)?.isError || (parsed as any)?.status === 'error' || !hasMetricRows ? 'SOURCE_UNAVAILABLE' : 'SUCCESS';
        const error = status === 'SUCCESS' ? null : String((parsed as any)?.message || (!hasMetricRows ? 'IDENTIFIER_ONLY_RESPONSE' : 'provider error'));
        for (const symbol of symbolChunk) results.push(save(symbol, pack.packId, chunkIndex, tokenChunk, parsed, status, error));
      } catch (e) {
        for (const symbol of symbolChunk) results.push(save(symbol, pack.packId, chunkIndex, tokenChunk, null, 'SOURCE_UNAVAILABLE', String(e)));
      }
    }
  }
}
// Eighth dossier pack: provider overview/context for each symbol.
const overviewTool = 'get_overview_news_corp_events';
for (const symbol of symbols) {
  try {
    const response = await client.callTool({name: overviewTool, arguments:{stock_code:symbol, type:'overview'}});
    const text = (response as any)?.content?.[0]?.text || '';
    let parsed: unknown = text; try { parsed = JSON.parse(text); } catch {}
    const status = (response as any)?.isError || (parsed as any)?.status === 'error' ? 'SOURCE_UNAVAILABLE' : 'SUCCESS';
    results.push(save(symbol, 'F08_OVERVIEW', 1, ['overview'], parsed, status, status === 'SUCCESS' ? null : String((parsed as any)?.message || 'provider error')));
  } catch (e) {
    results.push(save(symbol, 'F08_OVERVIEW', 1, ['overview'], null, 'SOURCE_UNAVAILABLE', String(e)));
  }
}
fs.mkdirSync(path.join(root,'reports','trendlyne_mirror'), {recursive:true});
fs.writeFileSync(path.join(root,'reports','trendlyne_mirror','EIGHT_PACK_FETCH_SUMMARY.json'), JSON.stringify({generatedAt:now, symbols, packCount:TRENDLYNE_PACKS_V1.length + 1, providerSymbolLimit:10, providerParameterLimit:10, results}, null, 2));
db.close();
console.log(JSON.stringify({symbols:symbols.length, packs:TRENDLYNE_PACKS_V1.length + 1, calls:results.length, success:results.filter(r=>r.status==='SUCCESS').length, unavailable:results.filter(r=>r.status!=='SUCCESS').length}, null, 2));
