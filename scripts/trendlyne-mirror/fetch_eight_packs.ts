import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import 'dotenv/config';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { TRENDLYNE_PACKS_V1 } from '../../src/server/services/trendlyne-mirror/TrendlyneMirrorService.js';

const root = process.cwd();
function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] || null : null;
}
const manifestPath = argValue('--manifest');
const includeOverview = process.argv.includes('--include-overview');
const pilotSymbols = ['VMART','RADICO','KRYSTAL','PROTEAN','JUSTDIAL','DBOL','LUMAXTECH','SONACOMS','TARSONS'];
let symbols = pilotSymbols;
if (manifestPath) {
  const resolved = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const entries = Array.isArray(manifest) ? manifest : (manifest.entries || manifest.symbols || []);
  symbols = entries.map((entry: any) => typeof entry === 'string' ? entry : entry.symbol || entry.ticker)
    .filter((symbol: unknown): symbol is string => typeof symbol === 'string' && symbol.trim().length > 0)
    .map(symbol => symbol.trim().toUpperCase());
  symbols = [...new Set(symbols)];
  if (!symbols.length) throw new Error(`Manifest contains no symbols: ${resolved}`);
}
const db = new Database(path.join(root, 'portfolio.db'));
let config: any = {};
const configPath = path.join(root, '.agents', 'mcp_config.json');
if (fs.existsSync(configPath)) {
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { config = {}; }
}
const url = process.env.TRENDLYNE_MCP_URL
  || process.env.TRENDLYNE_MCP_SERVER_URL
  || config?.mcpServers?.trendlyne?.serverUrl
  || config?.mcpServers?.trendlyne?.url;
if (!url) throw new Error('Trendlyne MCP URL is not configured.');
const now = new Date().toISOString();
const chunks = <T>(a: T[], n: number) => Array.from({length: Math.ceil(a.length / n)}, (_, i) => a.slice(i*n, i*n+n));
const providerSymbolLimit = 50;
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
const summaryPath = path.join(root, 'reports', 'trendlyne_mirror', 'EIGHT_PACK_FETCH_SUMMARY.json');
fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
const alreadySuccessful = db.prepare(`SELECT 1 FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND UPPER(symbol)=? AND endpoint=? AND status='SUCCESS' LIMIT 1`);
const writeInterimSummary = () => fs.writeFileSync(summaryPath, JSON.stringify({generatedAt:now, symbols, packCount:TRENDLYNE_PACKS_V1.length + (includeOverview ? 1 : 0), includeOverview, providerSymbolLimit, providerParameterLimit:10, completed:results.length, results}, null, 2));
for (const pack of TRENDLYNE_PACKS_V1) {
  // Provider contract: up to 10 symbols and 10 parameters per call.
  // Trendlyne currently rejects cffa; retain the other verified F04 tokens.
  const packTokens = pack.packId === 'F04_CASH_CAPITAL' ? pack.tokens.filter(t => t !== 'cffa') : pack.tokens;
  let chunkIndex = 0;
  for (const tokenChunk of chunks(packTokens, 10)) {
    chunkIndex++;
    for (const symbolChunk of chunks(symbols, providerSymbolLimit)) {
      const endpoint = `pack:${pack.packId}:chunk${chunkIndex}`;
      const pendingSymbols = symbolChunk.filter(symbol => !alreadySuccessful.get(symbol, endpoint));
      if (!pendingSymbols.length) continue;
      try {
        const response = await client.callTool({name:'get_stock_parameter_values', arguments:{stock_codes:pendingSymbols, parameters:tokenChunk}});
        const text = (response as any)?.content?.[0]?.text || '';
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch {}
        const dataText = String((parsed as any)?.data || '');
        const hasMetricRows = /\n\n[^\n]+\n[A-Z0-9&.-]+:/i.test(dataText);
        const status = (response as any)?.isError || (parsed as any)?.status === 'error' || !hasMetricRows ? 'SOURCE_UNAVAILABLE' : 'SUCCESS';
        const error = status === 'SUCCESS' ? null : String((parsed as any)?.message || (!hasMetricRows ? 'IDENTIFIER_ONLY_RESPONSE' : 'provider error'));
        for (const symbol of pendingSymbols) results.push(save(symbol, pack.packId, chunkIndex, tokenChunk, parsed, status, error));
      } catch (e) {
        for (const symbol of pendingSymbols) results.push(save(symbol, pack.packId, chunkIndex, tokenChunk, null, 'SOURCE_UNAVAILABLE', String(e)));
      }
      writeInterimSummary();
    }
  }
}
// Overview/context is one call per symbol, so it is opt-in after non-MCP
// sources have been exhausted.
const overviewTool = 'get_overview_news_corp_events';
if (includeOverview) for (const symbol of symbols) {
  try {
    const response = await client.callTool({name: overviewTool, arguments:{stock_code:symbol, type:'overview'}});
    const text = (response as any)?.content?.[0]?.text || '';
    let parsed: unknown = text; try { parsed = JSON.parse(text); } catch {}
    const status = (response as any)?.isError || (parsed as any)?.status === 'error' ? 'SOURCE_UNAVAILABLE' : 'SUCCESS';
    results.push(save(symbol, 'F08_OVERVIEW', 1, ['overview'], parsed, status, status === 'SUCCESS' ? null : String((parsed as any)?.message || 'provider error')));
    writeInterimSummary();
  } catch (e) {
    results.push(save(symbol, 'F08_OVERVIEW', 1, ['overview'], null, 'SOURCE_UNAVAILABLE', String(e)));
  }
}
writeInterimSummary();
db.close();
console.log(JSON.stringify({symbols:symbols.length, packs:TRENDLYNE_PACKS_V1.length + 1, calls:results.length, success:results.filter(r=>r.status==='SUCCESS').length, unavailable:results.filter(r=>r.status!=='SUCCESS').length}, null, 2));
