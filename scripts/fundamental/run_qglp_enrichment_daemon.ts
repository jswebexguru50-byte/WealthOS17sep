#!/usr/bin/env tsx
/**
 * Deterministic QGLP backfill from persisted evidence only.
 *
 * This process does not call an LLM and does not invent missing metrics. It
 * writes a derived qglp_results table; raw filing tables are never changed.
 */
import sqlite3 from 'sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { calculateQglp } from '../../src/server/services/QglpScoringService.js';

type Row = Record<string, any>;
const root = path.resolve(process.cwd());
const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const t = process.argv[i];
  if (t?.startsWith('--')) args.set(t.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : (process.argv[++i] || 'true'));
}
const universe = args.get('universe') || 'candidates';
const runKey = args.get('run-key');

const all = (db: sqlite3.Database, sql: string, p: any[] = []) => new Promise<Row[]>((resolve, reject) => db.all(sql, p, (e, rows) => e ? reject(e) : resolve(rows as Row[])));
const run = (db: sqlite3.Database, sql: string, p: any[] = []) => new Promise<void>((resolve, reject) => db.run(sql, p, e => e ? reject(e) : resolve()));

async function main(): Promise<void> {
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const handle = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, e => e ? reject(e) : resolve(handle));
  });
  try {
    await run(db, `CREATE TABLE IF NOT EXISTS qglp_results (
      symbol TEXT NOT NULL, as_of_date TEXT NOT NULL, methodology_version TEXT NOT NULL,
      status TEXT NOT NULL, total_score REAL, quality_score REAL, growth_score REAL,
      longevity_score REAL, price_score REAL, evidence_completeness_pct REAL NOT NULL,
      missing_fields_json TEXT NOT NULL, evidence_ids_json TEXT NOT NULL, reason TEXT NOT NULL,
      calculated_at TEXT NOT NULL, PRIMARY KEY(symbol, as_of_date, methodology_version)
    )`);
    const symbols = universe === 'all'
      ? (await all(db, "SELECT DISTINCT symbol FROM MasterTickers WHERE status='ACTIVE' AND TRIM(symbol)<>'' ORDER BY symbol")).map(r => String(r.symbol).trim().toUpperCase())
      : universe === 'dossier'
        ? (fs.existsSync(path.join(root, 'data', 'fundamental_enrichment', 'excel_strategy_manifest.json'))
          ? (JSON.parse(fs.readFileSync(path.join(root, 'data', 'fundamental_enrichment', 'excel_strategy_manifest.json'), 'utf8')).symbols || []).map((s: string) => String(s).trim().toUpperCase())
          : [])
      : (await all(db, runKey
        ? 'SELECT DISTINCT symbol FROM strategy_fundamental_filter_results WHERE run_key=? ORDER BY symbol'
        : 'SELECT DISTINCT symbol FROM strategy_fundamental_filter_results ORDER BY symbol', runKey ? [runKey] : [])).map(r => String(r.symbol).trim().toUpperCase());
    const statements = await all(db, 'SELECT * FROM HistoricalFinancialStatements ORDER BY symbol, period_date DESC');
    const snapshots = await all(db, 'SELECT * FROM FundamentalSnapshots ORDER BY fetched_at DESC');
    const ledger = await all(db, 'SELECT * FROM DataQualityAuditLedger ORDER BY audited_at DESC');
    const upstoxRows = await all(db, "SELECT symbol,endpoint,response_json,status FROM fundamental_endpoint_snapshots WHERE provider='UPSTOX_FUNDAMENTALS'");
    const by = (rows: Row[]) => { const m = new Map<string, Row[]>(); for (const r of rows) { const s = String(r.symbol || '').trim().toUpperCase(); if (!m.has(s)) m.set(s, []); m.get(s)!.push(r); } return m; };
    const statementBy = by(statements), snapshotBy = by(snapshots), ledgerBy = by(ledger);
    const upstoxBy = new Map<string, any>();
    for (const row of upstoxRows) {
      if (row.status !== 'SUCCESS' || !row.response_json) continue;
      try { upstoxBy.set(`${String(row.symbol).toUpperCase()}|${row.endpoint}`, JSON.parse(String(row.response_json))); } catch { /* malformed source remains unavailable */ }
    }
    const ratio = (payload: any, name: string): number | null => {
      const row = Array.isArray(payload?.data) ? payload.data.find((x: any) => String(x.name).toUpperCase() === name) : null;
      const n = Number(String(row?.company_value ?? '').replace('%', ''));
      return Number.isFinite(n) ? n : null;
    };
    const history = (payload: any, category: string): any[] => {
      const row = Array.isArray(payload?.data?.income_statement) ? payload.data.income_statement.find((x: any) => x.category === category) : null;
      return Array.isArray(row?.history) ? row.history : [];
    };
    const cashHistory = (payload: any): any[] => {
      const row = Array.isArray(payload?.data?.cash_flow) ? payload.data.cash_flow.find((x: any) => x.category === 'operating') : null;
      return Array.isArray(row?.history) ? row.history : [];
    };
    const today = new Date().toISOString().slice(0, 10);
    let completed = 0;
    for (const symbol of symbols) {
      const rows = statementBy.get(symbol) || [];
      const quarterly = rows.filter(r => String(r.statement_type).toUpperCase() === 'QUARTERLY_PL').slice(0, 8);
      const annual = rows.filter(r => String(r.statement_type).toUpperCase() === 'ANNUAL_PL').sort((a, b) => String(a.period_date).localeCompare(String(b.period_date)));
      const cashAnnual = rows.filter(r => String(r.statement_type).toUpperCase() === 'CASH_FLOW').sort((a, b) => String(a.period_date).localeCompare(String(b.period_date)));
      const latestSnapshot = snapshotBy.get(symbol)?.[0] || {};
      const latestLedger = ledgerBy.get(symbol)?.[0] || {};
      const upRatios = upstoxBy.get(`${symbol}|key-ratios`);
      const upIncome = upstoxBy.get(`${symbol}|income-statement`);
      const upCash = upstoxBy.get(`${symbol}|cash-flow`);
      const upRevenue = history(upIncome, 'revenue');
      const upProfit = history(upIncome, 'net_profit');
      const upOpProfit = history(upIncome, 'operating_profit');
      const upCfo = cashHistory(upCash);
      const latestUpRevenue = upRevenue[0], oldestUpRevenue = upRevenue.at(-1);
      const latestUpProfit = upProfit[0], oldestUpProfit = upProfit.at(-1);
      const latestUpOp = upOpProfit[0], latestUpCfo = upCfo[0];
      const salesStart = Number(annual[0]?.sales_cr), salesEnd = Number(annual.at(-1)?.sales_cr);
      const profitStart = Number(annual[0]?.net_profit_pat_cr), profitEnd = Number(annual.at(-1)?.net_profit_pat_cr);
      const cagr = (start: number, end: number, years: number) => Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0 ? (Math.pow(end / start, 1 / years) - 1) * 100 : null;
      const latestAnnual = annual.at(-1), latestCash = cashAnnual.at(-1);
      const qglp = calculateQglp({
        roePct: latestLedger.roe_pct ?? ratio(upRatios, 'ROE'),
        rocePct: latestSnapshot.roce_pct ?? latestLedger.roce_pct ?? ratio(upRatios, 'ROCE'),
        cfoToPatPct: latestCash?.cfo_cr != null && latestAnnual?.net_profit_pat_cr > 0
          ? Number(latestCash.cfo_cr) / Number(latestAnnual.net_profit_pat_cr) * 100
          : latestUpCfo?.value != null && latestUpProfit?.value > 0 ? Number(latestUpCfo.value) / Number(latestUpProfit.value) * 100 : null,
        cfoToOperatingProfitPct: latestCash?.cfo_cr != null && latestAnnual?.operating_profit_cr > 0
          ? Number(latestCash.cfo_cr) / Number(latestAnnual.operating_profit_cr) * 100
          : latestUpCfo?.value != null && latestUpOp?.value > 0 ? Number(latestUpCfo.value) / Number(latestUpOp.value) * 100 : null,
        debtToEquity: latestSnapshot.debt_to_equity ?? null,
        promoterPledgePct: latestLedger.pledged_pct ?? null,
        profitableQuarterCount: quarterly.length >= 8 ? quarterly.filter(r => Number(r.net_profit_pat_cr) > 0).length : null,
        salesCagr3yPct: annual.length >= 4 ? cagr(salesStart, salesEnd, 3) : upRevenue.length >= 4 ? cagr(Number(oldestUpRevenue?.value), Number(latestUpRevenue?.value), 3) : null,
        profitCagr3yPct: annual.length >= 4 ? cagr(profitStart, profitEnd, 3) : upProfit.length >= 4 ? cagr(Number(oldestUpProfit?.value), Number(latestUpProfit?.value), 3) : null,
        profitableYears: annual.length ? annual.filter(r => Number(r.net_profit_pat_cr) > 0).length : upProfit.length ? upProfit.filter(r => Number(r.value) > 0).length : null,
        positiveCfoYears: cashAnnual.length ? cashAnnual.filter(r => Number(r.cfo_cr) > 0).length : upCfo.length ? upCfo.filter(r => Number(r.value) > 0).length : null,
        roceConsistencyPct: null, marginStabilityPct: null, peVsHistoryPct: null, peVsSectorPct: null, peg: null, fcfYieldPct: null,
        evidenceIds: [...quarterly, ...annual, ...cashAnnual].map(r => `HFS:${symbol}:${r.statement_type}:${r.period_label}`),
      });
      const missing = [...qglp.quality.missingFields, ...qglp.growth.missingFields, ...qglp.longevity.missingFields, ...qglp.price.missingFields];
      await run(db, `INSERT OR REPLACE INTO qglp_results
        (symbol,as_of_date,methodology_version,status,total_score,quality_score,growth_score,longevity_score,price_score,evidence_completeness_pct,missing_fields_json,evidence_ids_json,reason,calculated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [symbol, today, 'QGLP-1.0', qglp.status, qglp.score, qglp.quality.score, qglp.growth.score, qglp.longevity.score, qglp.price.score, qglp.evidenceCompletenessPct, JSON.stringify([...new Set(missing)]), JSON.stringify(qglp.quality.evidenceIds), qglp.reason, new Date().toISOString()]);
      completed += 1;
    }
    console.log(JSON.stringify({ status: 'COMPLETED_WITH_GAPS', requested: symbols.length, completed, scored: 'see qglp_results', universe, database: dbPath }));
  } finally { await new Promise<void>(resolve => db.close(() => resolve())); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
