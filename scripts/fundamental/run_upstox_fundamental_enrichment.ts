#!/usr/bin/env tsx
/**
 * Deterministic Upstox Company Fundamentals collector.
 * Raw responses are retained with provenance and rate-limit backoff.
 */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const root = path.resolve(process.cwd());
const dir = path.join(root, 'data', 'fundamental_enrichment');
const progressPath = path.join(dir, 'upstox_fundamentals_progress.json');
const priorityPath = path.join(dir, 'priority_manifest.json');
const excelManifestPath = path.join(dir, 'excel_strategy_manifest.json');
const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');
const tokenEnv = process.env.UPSTOX_ACCESS_TOKEN;
const batchSize = Math.max(1, Number(process.argv.includes('--batch-size') ? process.argv[process.argv.indexOf('--batch-size') + 1] : 5));
const maxSymbols = Number(process.argv.includes('--max-symbols') ? process.argv[process.argv.indexOf('--max-symbols') + 1] : 0);
const groupArg = process.argv.includes('--group') ? process.argv[process.argv.indexOf('--group') + 1] : 'excelStrategyMatches';
const forceRefresh = process.argv.includes('--force');

const all = (db: sqlite3.Database, sql: string, p: any[] = []) => new Promise<any[]>((resolve, reject) => db.all(sql, p, (e, r) => e ? reject(e) : resolve(r || [])));
const run = (db: sqlite3.Database, sql: string, p: any[] = []) => new Promise<void>((resolve, reject) => db.run(sql, p, e => e ? reject(e) : resolve()));
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));
const now = () => new Date().toISOString();
const write = (v: unknown) => { const tmp = `${progressPath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(v, null, 2)); fs.renameSync(tmp, progressPath); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithBackoff(url: string, token: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000)
      });
      if (res.status === 429) {
        console.warn(`[Upstox 429 Throttled] Backing off 25s (Attempt ${attempt}/${maxRetries})...`);
        await sleep(25000 * attempt);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP_${res.status}`);
      }
      return await res.json();
    } catch (e: any) {
      if (attempt === maxRetries) throw e;
      await sleep(2000 * attempt);
    }
  }
  throw new Error('MAX_RETRIES_EXCEEDED');
}

async function main(): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const db = new sqlite3.Database(dbPath);
  try {
    await run(db, `CREATE TABLE IF NOT EXISTS fundamental_source_snapshots (
      symbol TEXT NOT NULL, isin TEXT, provider TEXT NOT NULL, authority TEXT NOT NULL,
      source_url TEXT, fetched_at TEXT NOT NULL, status TEXT NOT NULL, error TEXT,
      response_json TEXT, PRIMARY KEY(symbol, provider, fetched_at)
    )`);
    const tokenRow = tokenEnv || (await all(db, "SELECT value FROM AppConfig WHERE key='Access_Token'"))[0]?.value;
    if (!tokenRow) {
      write({ status: 'BLOCKED_AUTH', provider: 'UPSTOX_FUNDAMENTALS', message: 'Access_Token missing; no requests made', updatedAt: now() });
      console.log('BLOCKED_AUTH');
      return;
    }

    let symbols: string[] = [];
    if (groupArg === 'excelStrategyMatches' && fs.existsSync(excelManifestPath)) {
      const em = JSON.parse(fs.readFileSync(excelManifestPath, 'utf8'));
      symbols = em.symbols || [];
    } else {
      const manifest = JSON.parse(fs.readFileSync(priorityPath, 'utf8')) as { ordered: string[]; groups?: Record<string, string[]>; counts: Record<string, number> };
      const sourceSymbols = groupArg && manifest.groups?.[groupArg] ? manifest.groups[groupArg] : manifest.ordered;
      symbols = sourceSymbols.filter(s => /^[A-Z0-9&.-]+$/.test(s));
    }

    if (maxSymbols > 0) symbols = symbols.slice(0, maxSymbols);

    const done = new Set((await all(db, "SELECT DISTINCT symbol FROM fundamental_source_snapshots WHERE provider='UPSTOX_FUNDAMENTALS' AND status='SUCCESS'")).map(r => String(r.symbol)));
    const pending = forceRefresh ? symbols : symbols.filter(s => !done.has(s));

    const progress: any = {
      status: 'RUNNING',
      phase: 'UPSTOX_ALL_FUNDAMENTALS',
      provider: 'UPSTOX_FUNDAMENTALS',
      group: groupArg || 'ordered',
      forceRefresh,
      requested: symbols.length,
      completed: symbols.length - pending.length,
      pending: pending.length,
      failed: 0,
      updatedAt: now(),
      nextFallback: 'OFFICIAL_NSE_BSE_THEN_SCREENER_STOCKSCAN'
    };
    write(progress);

    const endpoints = ['profile', 'balance-sheet', 'cash-flow', 'income-statement', 'share-holdings', 'key-ratios', 'corporate-actions'];

    console.log(`[Upstox Fundamentals] Starting prioritized run for group '${groupArg}'. Total: ${symbols.length}, Pending: ${pending.length}, Already Done: ${done.size}, Force: ${forceRefresh}`);

    for (let i = 0; i < pending.length; i += batchSize) {
      for (const symbol of pending.slice(i, i + batchSize)) {
        const row = (await all(db, 'SELECT isin FROM MasterTickers WHERE symbol=? LIMIT 1', [symbol]))[0];
        const isin = row?.isin || null;
        if (!isin) {
          progress.failed++;
          progress.pending--;
          write(progress);
          continue;
        }

        const responses: Record<string, unknown> = {};
        const errors: Record<string, string> = {};

        // Sequential polite queries per endpoint with 350ms delay
        for (const endpoint of endpoints) {
          const url = `https://api.upstox.com/v2/fundamentals/${encodeURIComponent(isin)}/${endpoint}`;
          try {
            responses[endpoint] = await fetchWithBackoff(url, tokenRow);
          } catch (e: any) {
            errors[endpoint] = String(e?.message || e);
          }
          await sleep(350);
        }

        const status = Object.keys(responses).length > 0 ? 'SUCCESS' : 'FAILED';
        await run(db, `INSERT INTO fundamental_source_snapshots(symbol,isin,provider,authority,source_url,fetched_at,status,error,response_json) VALUES(?,?,?,?,?,?,?,?,?)`,
          [symbol, isin, 'UPSTOX_FUNDAMENTALS', 'BROKER_AGGREGATED', `https://api.upstox.com/v2/fundamentals/${isin}/`, now(), status, Object.keys(errors).length ? JSON.stringify(errors) : null, JSON.stringify(responses)]);

        if (status === 'SUCCESS') progress.completed++;
        else progress.failed++;

        progress.pending = symbols.length - progress.completed - progress.failed;
        progress.updatedAt = now();
        write(progress);

        console.log(`[Upstox Fundamentals] (${progress.completed}/${symbols.length}) ${symbol} -> ${status} [Endpoints: ${Object.keys(responses).length}/${endpoints.length}]`);
        await sleep(500);
      }
    }

    progress.status = progress.pending === 0 ? 'COMPLETED' : 'COMPLETED_WITH_GAPS';
    progress.updatedAt = now();
    write(progress);
    console.log(`[Upstox Fundamentals] Run finished. Completed: ${progress.completed}, Failed: ${progress.failed}`);
  } finally {
    await close(db);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
