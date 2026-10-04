#!/usr/bin/env tsx
/**
 * scripts/data_quality/run_invested_fundamental_enrichment.ts
 *
 * Dedicated Fundamental Data Enrichment Orchestrator for Invested Portfolio Shares.
 * Prioritizes all invested holdings in batches of 50 in alphabetical order.
 *
 * Enrichment Chain per Batch:
 * 1. Pre-ingest & promote all stored snapshots locally (Zero provider calls):
 *    - CanonicalFactIngestionService (snapshot parameters -> company_facts)
 *    - promote_trendlyne_statement_history_parameters (quarterly PL -> company_facts & HFS)
 *    - promote_trendlyne_shareholding_history (shareholding -> HistoricalShareholdingPattern)
 *    - financial_history_backfill (statutory annual PL -> company_facts)
 * 2. Trendlyne Metric Pack Planner Refresh (MCP):
 *    - Plans full 10-symbol batches with 30 canonical metrics
 *    - Fetches live Trendlyne parameters via MCP for stale/missing symbols
 *    - Ingests 4Y annual revenue & PAT series, ROCE, ROE, Debt/Equity, CFO, etc.
 * 3. Analyze360 Verification:
 *    - Verifies field resolution and QGLP readiness for every invested share
 *    - Logs comprehensive progress and coverage metrics
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService.js';
import { Analyze360Service } from '../../src/server/services/Analyze360Service.js';

const root = path.resolve(process.cwd());
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const progressDir = path.join(root, 'reports', 'data_quality', 'jobs');
const progressPath = path.join(progressDir, 'invested_fundamental_enrichment_progress.json');
const logPath = path.join(progressDir, 'invested_fundamental_enrichment.log');

fs.mkdirSync(progressDir, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(logPath, line);
  } catch {}
}

function updateProgress(data: Record<string, any>) {
  try {
    fs.writeFileSync(progressPath, JSON.stringify(data, null, 2));
  } catch {}
}

function runSubProcess(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    log(`[EXEC] ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { cwd: root, shell: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
    });

    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });

    child.on('close', (code) => {
      resolve({ code: code || 0, stdout, stderr });
    });
  });
}

async function main() {
  const startTimeIso = new Date().toISOString();
  log('=============================================================================');
  log('WealthOS: Invested Portfolio Fundamental Enrichment Daemon');
  log('=============================================================================');

  const betterDb = new Database(dbPath, { readonly: true });

  // 1. Gather all invested symbols across portfolio tables
  const investedSet = new Set<string>();
  const holdingQueries = [
    "SELECT DISTINCT symbol FROM PmsSummaryHoldings WHERE symbol IS NOT NULL AND symbol != ''",
    "SELECT DISTINCT symbol FROM PmsReconciliationBaselineHoldings WHERE symbol IS NOT NULL AND symbol != ''",
    "SELECT DISTINCT symbol FROM ZerodhaHoldings WHERE symbol IS NOT NULL AND symbol != ''",
    "SELECT DISTINCT symbol FROM ReconciledHoldings WHERE symbol IS NOT NULL AND symbol != ''",
    "SELECT DISTINCT symbol FROM PaperTradingPositions WHERE symbol IS NOT NULL AND symbol != ''"
  ];

  for (const q of holdingQueries) {
    try {
      const rows = betterDb.prepare(q).all() as { symbol: string }[];
      for (const r of rows) {
        if (!r.symbol) continue;
        let sym = r.symbol.trim().toUpperCase();
        // Normalize SME / ST suffixes
        sym = sym.replace(/-(SM|ST|BE|BZ)$/, '');
        if (sym) investedSet.add(sym);
      }
    } catch (e: any) {
      log(`[WARN] Failed query ${q}: ${e.message}`);
    }
  }

  const allInvested = Array.from(investedSet).sort();
  log(`[+] Total unique invested canonical symbols: ${allInvested.length}`);

  // Split into batches of 50 in alphabetical order
  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < allInvested.length; i += BATCH_SIZE) {
    batches.push(allInvested.slice(i, i + BATCH_SIZE));
  }

  log(`[+] Total Batches: ${batches.length}`);
  for (let i = 0; i < batches.length; i++) {
    log(`  Batch ${i + 1} (${batches[i].length} symbols): ${batches[i].slice(0, 5).join(', ')} ... ${batches[i].slice(-3).join(', ')}`);
  }

  const progress: Record<string, any> = {
    status: 'RUNNING',
    startTime: startTimeIso,
    completedTime: null,
    totalInvestedSymbols: allInvested.length,
    totalBatches: batches.length,
    currentBatchIndex: 0,
    currentBatchSymbols: [],
    factsIngestedLocal: 0,
    liveCallsExecuted: 0,
    liveFactsPersisted: 0,
    symbolsVerified: 0,
    verificationSummary: {}
  };
  updateProgress(progress);

  const sqliteDb = new sqlite3.Database(dbPath);
  const factService = new CanonicalFactIngestionService(sqliteDb);

  // Process batch by batch
  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batchSymbols = batches[bIdx];
    progress.currentBatchIndex = bIdx + 1;
    progress.currentBatchSymbols = batchSymbols;
    updateProgress(progress);

    log(`\n=============================================================================`);
    log(`PROCESSING BATCH ${bIdx + 1}/${batches.length} (${batchSymbols.length} SYMBOLS)`);
    log(`=============================================================================`);

    // Write batch manifest
    const manifestPath = path.join(root, 'data', 'fundamental_enrichment', `invested_batch_${bIdx + 1}_manifest.json`);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ symbols: batchSymbols }, null, 2));

    // Phase 1: Local Ingestion & Stored Snapshot Promotion (0 Provider Calls)
    log(`\n--- Step 1: Ingesting stored parameters snapshots into company_facts ---`);
    let localBatchFacts = 0;
    for (const sym of batchSymbols) {
      try {
        const count = await factService.ingestForSymbol(sym);
        localBatchFacts += count;
      } catch (err: any) {
        log(`[-] Failed local fact ingestion for ${sym}: ${err.message}`);
      }
    }
    progress.factsIngestedLocal += localBatchFacts;
    log(`[+] Ingested ${localBatchFacts} local canonical facts for Batch ${bIdx + 1}.`);
    updateProgress(progress);

    // Step 2: Promote stored statement history into company_facts and HistoricalFinancialStatements
    log(`\n--- Step 2: Promoting Trendlyne statement history parameters ---`);
    await runSubProcess('npx', [
      'tsx',
      'scripts/fundamental/promote_trendlyne_statement_history_parameters.ts',
      '--manifest', manifestPath,
      '--apply'
    ]);

    // Step 3: Promote stored shareholding history into HistoricalShareholdingPattern
    log(`\n--- Step 3: Promoting Trendlyne shareholding history ---`);
    await runSubProcess('npx', [
      'tsx',
      'scripts/fundamental/promote_trendlyne_shareholding_history.ts',
      '--manifest', manifestPath,
      '--apply'
    ]);

    // Step 4: Reconcile financial statements into company_facts
    log(`\n--- Step 4: Reconciling statutory financial history backfill ---`);
    await runSubProcess('npx', [
      'tsx',
      'scripts/data_quality/jobs/financial_history_backfill.ts'
    ]);

    // Step 5: Live Trendlyne MCP Batch Planner Refresh for stale/missing metrics
    log(`\n--- Step 5: Executing Trendlyne MCP Refresh via Batch Planner ---`);
    const symListStr = batchSymbols.join(',');
    const plannerRes = await runSubProcess('npx', [
      'tsx',
      'scripts/fundamental/trendlyne_metric_pack_planner.ts',
      '--symbols', symListStr,
      '--execute',
      '--allow-partial-final-batch'
    ]);

    if (plannerRes.code === 0) {
      log(`[+] Trendlyne Batch Planner completed successfully for Batch ${bIdx + 1}.`);
    } else {
      log(`[!] Trendlyne Batch Planner finished with code ${plannerRes.code}.`);
    }

    // Step 6: Post-refresh local ingestion to ensure all fresh snapshots are promoted
    for (const sym of batchSymbols) {
      try {
        await factService.ingestForSymbol(sym);
      } catch {}
    }

    log(`[+] Batch ${bIdx + 1} enrichment steps completed.`);
  }

  sqliteDb.close();

  // Phase 3: Final Verification Across All Invested Symbols
  log(`\n=============================================================================`);
  log(`FINAL AUDIT: Verifying Analyze360 Coverage for all ${allInvested.length} Invested Symbols`);
  log(`=============================================================================`);

  const analyzeSvc = Analyze360Service.getInstance();
  const summary: Record<string, any> = {
    total: allInvested.length,
    revenueAvailable: 0,
    patAvailable: 0,
    roceAvailable: 0,
    roeAvailable: 0,
    debtToEquityAvailable: 0,
    promoterHoldingAvailable: 0,
    peAvailable: 0,
    qglpComputed: 0
  };

  for (const sym of allInvested) {
    try {
      const res = await analyzeSvc.getAnalyze360View(sym, undefined, undefined, undefined, undefined, { includeTechnicals: false });
      if (res.fundamental?.revenueGrowth?.status === 'AVAILABLE') summary.revenueAvailable++;
      if (res.fundamental?.profitability?.pat?.status === 'AVAILABLE') summary.patAvailable++;
      if (res.fundamental?.efficiency?.roce?.status === 'AVAILABLE') summary.roceAvailable++;
      if (res.fundamental?.efficiency?.roe?.status === 'AVAILABLE') summary.roeAvailable++;
      if (res.fundamental?.debtAndService?.debtToEquity?.status === 'AVAILABLE') summary.debtToEquityAvailable++;
      if (res.fundamental?.holdings?.promoterHolding?.status === 'AVAILABLE') summary.promoterHoldingAvailable++;
      if (res.fundamental?.valuation?.pe?.status === 'AVAILABLE') summary.peAvailable++;
      if (res.qglp && res.qglp.compositeScore !== undefined && res.qglp.compositeScore !== null) summary.qglpComputed++;
    } catch {}
  }

  log(`--- Final Coverage Summary ---`);
  log(`Total Invested Symbols: ${summary.total}`);
  log(`Revenue 3Y CAGR Available: ${summary.revenueAvailable} / ${summary.total}`);
  log(`PAT 3Y CAGR Available: ${summary.patAvailable} / ${summary.total}`);
  log(`ROCE Available: ${summary.roceAvailable} / ${summary.total}`);
  log(`ROE Available: ${summary.roeAvailable} / ${summary.total}`);
  log(`Debt/Equity Available: ${summary.debtToEquityAvailable} / ${summary.total}`);
  log(`Promoter Holding Available: ${summary.promoterHoldingAvailable} / ${summary.total}`);
  log(`PE Available: ${summary.peAvailable} / ${summary.total}`);

  progress.status = 'COMPLETED';
  progress.completedTime = new Date().toISOString();
  progress.verificationSummary = summary;
  updateProgress(progress);

  log(`\n[SUCCESS] Invested Portfolio Fundamental Enrichment finished successfully at ${progress.completedTime}.`);
}

main().catch((err) => {
  log(`[FATAL] ${err.message}\n${err.stack}`);
  updateProgress({
    status: 'FAILED',
    completedTime: new Date().toISOString(),
    error: err.message
  });
  process.exit(1);
});
