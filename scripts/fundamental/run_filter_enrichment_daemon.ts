#!/usr/bin/env tsx
/**
 * Deterministic phase-1 fundamental filter daemon.
 *
 * This process deliberately reads only evidence already persisted in portfolio.db.
 * It does not call an LLM, infer unavailable values, or fetch non-filter enrichment.
 * It is resumable: progress and per-symbol results are written after every batch.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sqlite3 from 'sqlite3';
import { StrategyFundamentalFilterService, STRATEGY_FUNDAMENTAL_RULES, StrategyFundamentalEnrichment } from '../../src/server/services/StrategyFundamentalFilterService.js';

type DbRow = Record<string, any>;
type Progress = {
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED_WITH_GAPS' | 'FAILED';
  phase: 'MANDATORY_FILTERS';
  source: 'SQLITE_EXISTING_EVIDENCE';
  scanId: string | null;
  cohortSource: string;
  requested: number;
  completed: number;
  pending: number;
  failed: number;
  fullyCompliant: number;
  partial: number;
  unavailable: number;
  coverage: Record<string, number>;
  lastSymbol: string | null;
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
  heartbeatAt: string;
  nextPhase: 'NON_FILTER_ENRICHMENT' | 'MANDATORY_FILTERS';
};

const root = path.resolve(process.cwd());
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const progressPath = path.join(dataDir, 'filter_enrichment_progress.json');
const manifestPath = path.join(dataDir, 'filter_enrichment_manifest.jsonl');
const logPath = path.join(dataDir, 'filter_enrichment.log');
const lockPath = path.join(dataDir, 'filter_enrichment.lock');
const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (token.startsWith('--')) args.set(token.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : (process.argv[++i] || 'true'));
}
const once = args.get('once') === 'true' || args.get('daemon') !== 'true';
const refresh = args.get('refresh') === 'true';
const batchSize = Math.max(1, Number(args.get('batch-size') || 25));
const intervalMs = Math.max(1000, Number(args.get('interval-ms') || 30000));
const refreshDays = Math.max(1, Number(args.get('refresh-days') || 15));
const requestedScanId = args.get('scan-id');
const universeMode = args.get('universe') || 'scan';
const maxSymbols = Number(args.get('max-symbols') || 0);

function now(): string { return new Date().toISOString(); }
function ensureDir(): void { fs.mkdirSync(dataDir, { recursive: true }); }
function log(message: string): void { ensureDir(); const line = `[${now()}] ${message}\n`; fs.appendFileSync(logPath, line); console.log(line.trim()); }
function atomicWrite(file: string, value: unknown): void {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; }
}
function dbAll(db: sqlite3.Database, sql: string, params: any[] = []): Promise<DbRow[]> {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as DbRow[])));
}
function dbRun(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}
function openDb(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, err => err ? reject(err) : resolve(db));
  });
}
function closeDb(db: sqlite3.Database): Promise<void> { return new Promise(resolve => db.close(() => resolve())); }

async function getCohort(db: sqlite3.Database): Promise<{ scanId: string | null; source: string; symbols: string[] }> {
  if (universeMode === 'all') {
    const rows = await dbAll(db, "SELECT DISTINCT symbol FROM MasterTickers WHERE status = 'ACTIVE' AND segment = 'EQ' AND TRIM(symbol) <> '' ORDER BY symbol");
    const universe = rows.map(r => String(r.symbol).trim().toUpperCase()).filter(Boolean);
    const priority = readJson<{ ordered?: string[] }>(path.join(dataDir, 'priority_manifest.json'))?.ordered || [];
    const ordered = [...priority.filter(s => universe.includes(String(s).toUpperCase())).map(s => String(s).toUpperCase()), ...universe.filter(s => !priority.includes(s))];
    return { scanId: null, source: priority.length ? 'PRIORITY_MANIFEST_INVESTED_STRATEGY_NIFTY500_REMAINDER' : 'ALL_ACTIVE_MASTER_TICKERS', symbols: ordered };
  }
  let scan: DbRow | undefined;
  if (requestedScanId) {
    scan = (await dbAll(db, 'SELECT scan_id FROM strategy_scan_metadata WHERE scan_id = ? LIMIT 1', [requestedScanId]))[0];
  } else {
    scan = (await dbAll(db, "SELECT scan_id FROM strategy_scan_metadata WHERE status = 'COMPLETE' ORDER BY created_at DESC LIMIT 1"))[0];
  }
  if (scan?.scan_id) {
    const rows = await dbAll(db, 'SELECT DISTINCT symbol FROM strategy_scan_cache WHERE scan_id = ? AND qualified = 1 ORDER BY symbol', [scan.scan_id]);
    const symbols = rows.map(r => String(r.symbol || '').trim().toUpperCase()).filter(Boolean);
    if (symbols.length) return { scanId: String(scan.scan_id), source: 'LATEST_QUALIFIED_STRATEGY_SCAN', symbols };
  }
  const fallback = await dbAll(db, "SELECT DISTINCT symbol FROM Holdings WHERE symbol IS NOT NULL AND TRIM(symbol) <> '' ORDER BY symbol").catch(() => []);
  return { scanId: scan?.scan_id ? String(scan.scan_id) : null, source: 'HOLDINGS_FALLBACK_NO_COMPLETED_SCAN', symbols: fallback.map(r => String(r.symbol).trim().toUpperCase()) };
}

async function initResultsTable(db: sqlite3.Database): Promise<void> {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS strategy_fundamental_filter_results (
    run_key TEXT NOT NULL, symbol TEXT NOT NULL, scan_id TEXT, population TEXT NOT NULL,
    pass_count INTEGER NOT NULL, total_checks INTEGER NOT NULL, evidence_status TEXT NOT NULL,
    promoter_pct REAL, promoter_pass INTEGER, profitable_last_8_quarters INTEGER,
    profitable_quarter_count INTEGER, roce_pct REAL, roce_pass INTEGER, roe_pct REAL,
    roe_pass INTEGER, pledged_pct REAL, no_pledge_pass INTEGER, fii_pct REAL, dii_pct REAL,
    institutional_involvement_pass INTEGER, institutional_increasing INTEGER,
    latest_operating_profit_cr REAL, latest_cfo_cr REAL, cash_flow_to_operating_profit REAL,
    cash_flow_pass INTEGER, qglp_status TEXT, qglp_score REAL, sector_momentum_status TEXT,
    double_momentum_status TEXT, source TEXT NOT NULL, evidence_note TEXT NOT NULL,
    evaluated_at TEXT NOT NULL, PRIMARY KEY (run_key, symbol)
  )`);
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_fund_filter_symbol ON strategy_fundamental_filter_results(symbol)');
  const columns = await dbAll(db, 'PRAGMA table_info(strategy_fundamental_filter_results)');
  if (!columns.some(c => String(c.name) === 'qglp_score')) {
    await dbRun(db, 'ALTER TABLE strategy_fundamental_filter_results ADD COLUMN qglp_score REAL');
  }
}

function boolDb(v: boolean | null): number | null { return v == null ? null : v ? 1 : 0; }
async function persist(db: sqlite3.Database, runKey: string, scanId: string | null, e: StrategyFundamentalEnrichment): Promise<void> {
  await dbRun(db, `INSERT OR REPLACE INTO strategy_fundamental_filter_results
    (run_key,symbol,scan_id,population,pass_count,total_checks,evidence_status,promoter_pct,promoter_pass,
     profitable_last_8_quarters,profitable_quarter_count,roce_pct,roce_pass,roe_pct,roe_pass,pledged_pct,
     no_pledge_pass,fii_pct,dii_pct,institutional_involvement_pass,institutional_increasing,
     latest_operating_profit_cr,latest_cfo_cr,cash_flow_to_operating_profit,cash_flow_pass,qglp_status,qglp_score,
     sector_momentum_status,double_momentum_status,source,evidence_note,evaluated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    runKey, e.symbol, scanId, e.population, e.passCount, e.totalChecks, e.evidenceStatus,
    e.promoterPct, boolDb(e.promoterPass), boolDb(e.profitableLast8Quarters), e.profitableQuarterCount,
    e.rocePct, boolDb(e.rocePass), e.roePct, boolDb(e.roePass), e.pledgedPct, boolDb(e.noPledgePass),
    e.fiiPct, e.diiPct, boolDb(e.institutionalInvolvementPass), boolDb(e.institutionalIncreasing),
    e.latestOperatingProfitCr, e.latestCfoCr, e.cashFlowToOperatingProfit, boolDb(e.cashFlowPass),
    e.qglpStatus, e.qglpScore, e.sectorMomentumStatus, e.doubleMomentumStatus, 'SQLITE_EXISTING_EVIDENCE', e.evidenceNote, now()
  ]);
}

function baseProgress(cohort: { scanId: string | null; source: string; symbols: string[] }, forceReset = false): Progress {
  const previous = readJson<Progress>(progressPath);
  const sameCohort = previous && previous.scanId === cohort.scanId && previous.requested === cohort.symbols.length;
  return sameCohort && !forceReset ? { ...previous!, status: 'RUNNING', updatedAt: now(), heartbeatAt: now(), lastError: null } : {
    status: 'RUNNING', phase: 'MANDATORY_FILTERS', source: 'SQLITE_EXISTING_EVIDENCE', scanId: cohort.scanId,
    cohortSource: cohort.source, requested: cohort.symbols.length, completed: 0, pending: cohort.symbols.length,
    failed: 0, fullyCompliant: 0, partial: 0, unavailable: 0,
    coverage: { promoter: 0, profitable8q: 0, roce: 0, roe: 0, pledge: 0, institutional: 0, cashFlow: 0 },
    lastSymbol: null, lastError: null, startedAt: now(), updatedAt: now(), heartbeatAt: now(), nextPhase: 'MANDATORY_FILTERS'
  };
}

async function runOnce(): Promise<boolean> {
  ensureDir();
  if (fs.existsSync(lockPath)) {
    const lock = readJson<{ pid?: number }>(lockPath);
    try { if (lock?.pid && process.kill(lock.pid, 0)) { log(`another daemon is active (pid ${lock.pid}); exiting`); return false; } } catch { /* stale lock */ }
  }
  atomicWrite(lockPath, { pid: process.pid, startedAt: now() });
  const db = await openDb();
  try {
    await initResultsTable(db);
    const cohort = await getCohort(db);
    const runKey = `filters:${cohort.scanId || 'holdings'}:${cohort.symbols.length}`;
    const latest = (await dbAll(db, 'SELECT MAX(evaluated_at) AS evaluatedAt FROM strategy_fundamental_filter_results WHERE run_key = ?', [runKey]))[0]?.evaluatedAt;
    const stale = latest ? (Date.now() - Date.parse(String(latest))) >= refreshDays * 86400000 : true;
    const effectiveRefresh = refresh || (args.get('auto-refresh') !== 'false' && stale);
    const progress = baseProgress(cohort, effectiveRefresh);
    const doneRows = effectiveRefresh ? [] : await dbAll(db, 'SELECT symbol FROM strategy_fundamental_filter_results WHERE run_key = ?', [runKey]);
    const done = new Set(doneRows.map(r => String(r.symbol).toUpperCase()));
    const pending = cohort.symbols.filter(s => !done.has(s));
    progress.requested = cohort.symbols.length;
    progress.pending = pending.length;
    atomicWrite(progressPath, progress);
    if (!pending.length) {
      progress.status = 'COMPLETED_WITH_GAPS'; progress.nextPhase = 'NON_FILTER_ENRICHMENT'; progress.updatedAt = now(); progress.heartbeatAt = now();
      atomicWrite(progressPath, progress); log(`complete: ${progress.completed}/${progress.requested} filters already persisted; next phase queued`); return true;
    }
    const service = StrategyFundamentalFilterService.getInstance();
    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const batch = pending.slice(offset, offset + batchSize);
      try {
        const enriched = await service.enrichSymbols(db as any, batch);
        for (const symbol of batch) {
          const e = enriched.get(symbol);
          if (!e) { progress.failed += 1; continue; }
          await persist(db, runKey, cohort.scanId, e);
          progress.completed += 1; progress.pending = Math.max(0, cohort.symbols.length - progress.completed - progress.failed);
          progress.lastSymbol = symbol;
          if (e.population === 'FULLY_COMPLIANT') progress.fullyCompliant += 1;
          else if (e.population === 'PARTIAL') progress.partial += 1;
          else progress.unavailable += 1;
          if (e.promoterPct != null) progress.coverage.promoter += 1;
          if (e.profitableLast8Quarters != null) progress.coverage.profitable8q += 1;
          if (e.rocePct != null) progress.coverage.roce += 1;
          if (e.roePct != null) progress.coverage.roe += 1;
          if (e.pledgedPct != null) progress.coverage.pledge += 1;
          if (e.institutionalInvolvementPass != null) progress.coverage.institutional += 1;
          if (e.cashFlowToOperatingProfit != null) progress.coverage.cashFlow += 1;
          fs.appendFileSync(manifestPath, JSON.stringify({ runKey, scanId: cohort.scanId, symbol, population: e.population, passCount: e.passCount, evidenceStatus: e.evidenceStatus, evaluatedAt: now() }) + '\n');
        }
      } catch (err: any) { progress.failed += batch.length; progress.lastError = String(err?.message || err); log(`batch failed (${batch[0]}..${batch[batch.length - 1]}): ${progress.lastError}`); }
      progress.updatedAt = now(); progress.heartbeatAt = now(); progress.pending = Math.max(0, cohort.symbols.length - progress.completed - progress.failed); atomicWrite(progressPath, progress);
      log(`progress ${progress.completed}/${progress.requested} (${Math.round(progress.completed / Math.max(1, progress.requested) * 100)}%), pending=${progress.pending}, failed=${progress.failed}`);
      if (maxSymbols && progress.completed >= maxSymbols) break;
    }
    progress.status = progress.pending === 0 ? 'COMPLETED_WITH_GAPS' : 'PAUSED';
    progress.nextPhase = progress.pending === 0 ? 'NON_FILTER_ENRICHMENT' : 'MANDATORY_FILTERS';
    progress.updatedAt = now(); progress.heartbeatAt = now(); atomicWrite(progressPath, progress);
    log(`run ended: ${progress.status}; fully=${progress.fullyCompliant}, partial=${progress.partial}, unavailable=${progress.unavailable}`);
    return progress.pending === 0;
  } catch (err: any) {
    const failed = readJson<Progress>(progressPath);
    if (failed) { failed.status = 'FAILED'; failed.lastError = String(err?.message || err); failed.updatedAt = now(); failed.heartbeatAt = now(); atomicWrite(progressPath, failed); }
    log(`fatal: ${String(err?.stack || err)}`); return false;
  } finally { await closeDb(db); try { fs.unlinkSync(lockPath); } catch { /* already removed */ } }
}

async function main(): Promise<void> {
  ensureDir();
  let stop = false;
  const shutdown = () => { stop = true; };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  do { await runOnce(); if (!once && !stop) await new Promise(resolve => setTimeout(resolve, intervalMs)); } while (!once && !stop);
}
main().catch(err => { log(`uncaught: ${String(err?.stack || err)}`); process.exitCode = 1; });

export { STRATEGY_FUNDAMENTAL_RULES };
