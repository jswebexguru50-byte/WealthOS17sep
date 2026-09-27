#!/usr/bin/env tsx
/** Deterministic, resumable Upstox fundamentals collector. No LLM or inferred values. */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const root = path.resolve(process.cwd());
const dir = path.join(root, 'data', 'fundamental_enrichment');
const progressPath = path.join(dir, 'upstox_fundamentals_progress.json');
const priorityPath = path.join(dir, 'priority_manifest.json');
const excelManifestPath = path.join(dir, 'excel_strategy_manifest.json');
const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');
const valueAfter = (flag: string, fallback: string) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : fallback;
const batchSize = Math.max(1, Number(valueAfter('--batch-size', '1')));
const maxSymbols = Number(valueAfter('--max-symbols', '0'));
const groupArg = valueAfter('--group', 'excelStrategyMatches');
const forceRefresh = process.argv.includes('--force');
const endpointDelayMs = Math.max(350, Number(valueAfter('--endpoint-delay-ms', '750')));
const symbolDelayMs = Math.max(500, Number(valueAfter('--symbol-delay-ms', '1500')));
const endpoints = ['profile', 'balance-sheet', 'cash-flow', 'income-statement', 'share-holdings', 'key-ratios', 'corporate-actions', 'competitors'] as const;
type Endpoint = typeof endpoints[number];
type DbRow = Record<string, any>;
class FetchError extends Error {
  constructor(public kind: 'AUTH' | 'HTTP' | 'NETWORK', message: string, public httpStatus?: number) { super(message); }
}

const all = (db: sqlite3.Database, sql: string, p: any[] = []) => new Promise<DbRow[]>((resolve, reject) => db.all(sql, p, (e, r) => e ? reject(e) : resolve((r || []) as DbRow[])));
const run = (db: sqlite3.Database, sql: string, p: any[] = []) => new Promise<void>((resolve, reject) => db.run(sql, p, e => e ? reject(e) : resolve()));
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const write = (value: unknown) => { const tmp = `${progressPath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, progressPath); };

async function fetchWithBackoff(url: string, token: string, maxRetries = 4): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
      if (response.status === 401 || response.status === 403) throw new FetchError('AUTH', `HTTP_${response.status}`, response.status);
      if (response.status === 404) throw new FetchError('HTTP', 'HTTP_404_NOT_AVAILABLE', 404);
      if (response.status === 429) { if (attempt === maxRetries) throw new FetchError('HTTP', 'HTTP_429_MAX_RETRIES', 429); await sleep(30000 * attempt); continue; }
      if (!response.ok) { if (attempt === maxRetries || response.status < 500) throw new FetchError('HTTP', `HTTP_${response.status}`, response.status); await sleep(5000 * attempt); continue; }
      return await response.json();
    } catch (error: any) {
      if (error instanceof FetchError) throw error;
      if (attempt === maxRetries) throw new FetchError('NETWORK', String(error?.message || error));
      await sleep(5000 * attempt);
    }
  }
  throw new FetchError('NETWORK', 'MAX_RETRIES_EXCEEDED');
}

async function init(db: sqlite3.Database): Promise<void> {
  await run(db, `CREATE TABLE IF NOT EXISTS fundamental_source_snapshots (symbol TEXT NOT NULL, isin TEXT, provider TEXT NOT NULL, authority TEXT NOT NULL, source_url TEXT, fetched_at TEXT NOT NULL, status TEXT NOT NULL, error TEXT, response_json TEXT, PRIMARY KEY(symbol,provider,fetched_at))`);
  await run(db, `CREATE TABLE IF NOT EXISTS fundamental_endpoint_snapshots (symbol TEXT NOT NULL, isin TEXT, provider TEXT NOT NULL, endpoint TEXT NOT NULL, authority TEXT NOT NULL, source_url TEXT NOT NULL, fetched_at TEXT NOT NULL, status TEXT NOT NULL, http_status INTEGER, error TEXT, response_json TEXT, PRIMARY KEY(symbol,provider,endpoint))`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_fund_endpoint_status ON fundamental_endpoint_snapshots(provider,status,endpoint)');
}

async function migrateLegacySuccesses(db: sqlite3.Database): Promise<void> {
  const rows = await all(db, `SELECT symbol,isin,fetched_at,response_json FROM fundamental_source_snapshots WHERE provider='UPSTOX_FUNDAMENTALS' AND status='SUCCESS' ORDER BY fetched_at ASC`);
  for (const row of rows) try {
    const payload = JSON.parse(String(row.response_json || '{}'));
    for (const endpoint of endpoints) if (payload[endpoint] != null) await run(db, `INSERT OR IGNORE INTO fundamental_endpoint_snapshots (symbol,isin,provider,endpoint,authority,source_url,fetched_at,status,http_status,error,response_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [row.symbol,row.isin,'UPSTOX_FUNDAMENTALS',endpoint,'BROKER_AGGREGATED',`https://api.upstox.com/v2/fundamentals/${encodeURIComponent(row.isin)}/${endpoint}`,row.fetched_at,'SUCCESS',200,null,JSON.stringify(payload[endpoint])]);
  } catch { /* malformed legacy payload remains excluded */ }
}

async function cachedEndpoints(db: sqlite3.Database, symbol: string): Promise<Map<string, DbRow>> {
  const rows = await all(db, `SELECT endpoint,status,response_json,error,http_status FROM fundamental_endpoint_snapshots WHERE provider='UPSTOX_FUNDAMENTALS' AND symbol=?`, [symbol]);
  return new Map(rows.filter(row => row.status === 'SUCCESS' || row.status === 'NOT_AVAILABLE').map(row => [String(row.endpoint), row]));
}

async function saveEndpoint(db: sqlite3.Database, symbol: string, isin: string, endpoint: Endpoint, status: 'SUCCESS'|'NOT_AVAILABLE', payload: unknown, error: string|null, httpStatus: number): Promise<void> {
  await run(db, `INSERT OR REPLACE INTO fundamental_endpoint_snapshots (symbol,isin,provider,endpoint,authority,source_url,fetched_at,status,http_status,error,response_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [symbol,isin,'UPSTOX_FUNDAMENTALS',endpoint,'BROKER_AGGREGATED',`https://api.upstox.com/v2/fundamentals/${encodeURIComponent(isin)}/${endpoint}`,now(),status,httpStatus,error,payload == null ? null : JSON.stringify(payload)]);
}

async function main(): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const db = new sqlite3.Database(dbPath);
  try {
    await init(db); await migrateLegacySuccesses(db);
    const token = process.env.UPSTOX_ACCESS_TOKEN || (await all(db, "SELECT value FROM AppConfig WHERE key='Access_Token'"))[0]?.value;
    if (!token) { write({status:'BLOCKED_AUTH',message:'Access_Token missing; no requests made',updatedAt:now()}); process.exitCode=2; return; }
    let symbols: string[];
    if (groupArg === 'excelStrategyMatches' && fs.existsSync(excelManifestPath)) symbols = JSON.parse(fs.readFileSync(excelManifestPath,'utf8')).symbols || [];
    else { const manifest=JSON.parse(fs.readFileSync(priorityPath,'utf8')); symbols=groupArg && manifest.groups?.[groupArg] ? manifest.groups[groupArg] : manifest.ordered; }
    symbols=[...new Set(symbols.map(s=>String(s).trim().toUpperCase()).filter(s=>/^[A-Z0-9&.-]+$/.test(s)))];
    if (maxSymbols>0) symbols=symbols.slice(0,maxSymbols);
    const terminalCounts=await all(db,`SELECT symbol,COUNT(DISTINCT endpoint) n FROM fundamental_endpoint_snapshots WHERE provider='UPSTOX_FUNDAMENTALS' AND status IN ('SUCCESS','NOT_AVAILABLE') GROUP BY symbol`);
    const done=new Set(forceRefresh?[]:terminalCounts.filter(r=>Number(r.n)===endpoints.length).map(r=>String(r.symbol)));
    const pending=symbols.filter(symbol=>!done.has(symbol));
    const progress:any={status:'RUNNING',phase:'UPSTOX_EIGHT_ENDPOINTS',provider:'UPSTOX_FUNDAMENTALS',group:groupArg,requested:symbols.length,completed:done.size,pending:pending.length,failed:0,endpointSuccesses:{},endpointUnavailable:{},updatedAt:now(),llmCalls:0};
    write(progress); console.log(`[Upstox Fundamentals] Total=${symbols.length} pending=${pending.length} cache-complete=${done.size}`);
    let consecutiveNetworkFailures=0;
    for(let offset=0;offset<pending.length;offset+=batchSize) for(const symbol of pending.slice(offset,offset+batchSize)) {
      const master=(await all(db,'SELECT isin FROM MasterTickers WHERE symbol=? LIMIT 1',[symbol]))[0]; const isin=String(master?.isin||'');
      if(!isin){progress.failed++;progress.pending--;progress.updatedAt=now();write(progress);continue;}
      const cached=forceRefresh?new Map<string,DbRow>():await cachedEndpoints(db,symbol); const responses:Record<string,unknown>={}; const errors:Record<string,string>={};
      for(const [endpoint,row] of cached){if(row.status==='SUCCESS')responses[endpoint]=JSON.parse(String(row.response_json));else errors[endpoint]=String(row.error||'NOT_AVAILABLE');}
      for(const endpoint of endpoints){
        if(cached.has(endpoint))continue;
        try{const payload=await fetchWithBackoff(`https://api.upstox.com/v2/fundamentals/${encodeURIComponent(isin)}/${endpoint}`,token);await saveEndpoint(db,symbol,isin,endpoint,'SUCCESS',payload,null,200);responses[endpoint]=payload;progress.endpointSuccesses[endpoint]=(progress.endpointSuccesses[endpoint]||0)+1;consecutiveNetworkFailures=0;}
        catch(error:any){const failure=error instanceof FetchError?error:new FetchError('NETWORK',String(error));if(failure.kind==='AUTH'){progress.status='BLOCKED_AUTH';progress.blockedAt={symbol,endpoint,error:failure.message};progress.updatedAt=now();write(progress);process.exitCode=2;return;}if(failure.httpStatus===404||(endpoint==='competitors'&&failure.httpStatus===400)){await saveEndpoint(db,symbol,isin,endpoint,'NOT_AVAILABLE',null,failure.message,failure.httpStatus||404);errors[endpoint]=failure.message;progress.endpointUnavailable[endpoint]=(progress.endpointUnavailable[endpoint]||0)+1;}else{errors[endpoint]=failure.message;if(failure.kind==='NETWORK')consecutiveNetworkFailures++;if(consecutiveNetworkFailures>=3){progress.status='BLOCKED_NETWORK';progress.blockedAt={symbol,endpoint,error:failure.message};progress.updatedAt=now();write(progress);process.exitCode=3;return;}}}
        await sleep(endpointDelayMs);
      }
      const terminal=await cachedEndpoints(db,symbol);const terminalComplete=terminal.size===endpoints.length;const successCount=[...terminal.values()].filter(row=>row.status==='SUCCESS').length;const status=terminalComplete&&successCount===endpoints.length?'SUCCESS':successCount>0?'PARTIAL':'FAILED';
      await run(db,`INSERT INTO fundamental_source_snapshots (symbol,isin,provider,authority,source_url,fetched_at,status,error,response_json) VALUES(?,?,?,?,?,?,?,?,?)`,[symbol,isin,'UPSTOX_FUNDAMENTALS','BROKER_AGGREGATED',`https://api.upstox.com/v2/fundamentals/${isin}/`,now(),status,Object.keys(errors).length?JSON.stringify(errors):null,JSON.stringify(responses)]);
      if(terminalComplete)progress.completed++;else progress.failed++;progress.pending=symbols.length-progress.completed-progress.failed;progress.lastSymbol=symbol;progress.updatedAt=now();write(progress);console.log(`[Upstox Fundamentals] ${progress.completed}/${symbols.length} ${symbol} ${successCount}/${endpoints.length} ${status}`);await sleep(symbolDelayMs);
    }
    progress.status=progress.failed?'COMPLETED_WITH_GAPS':'COMPLETED';progress.updatedAt=now();write(progress);
  } finally { await close(db); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
