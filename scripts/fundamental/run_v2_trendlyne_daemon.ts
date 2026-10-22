/**
 * run_v2_trendlyne_daemon.ts — Standalone Background Runner for Trendlyne MCP Max Enrichment
 * WealthOS V2 Mandatory Amendment
 *
 * Runs continuously in background:
 * - Automatically populates missing data for the entire investable universe (P0 -> P1 -> P2 -> P4)
 * - Executes optimal 500-cell batches (10 scrips × 50 metrics)
 * - Observes quota limits and retains interactive reserve
 * - Can be stopped and resumed on its own with 100% restart idempotency (never repeats completed jobs)
 * - Emits a comprehensive progress report every 15 minutes
 * - Zero transactions generated (enrichment & intelligence only)
 */

import fs from 'fs';
import path from 'path';
import { getDB, dbAll, dbGet } from '../../src/server/database.js';
import { TrendlyneEnrichmentDaemon } from '../../src/server/services/enrichment/trendlyne/TrendlyneEnrichmentDaemon.js';
import { TrendlyneEnrichmentQueue } from '../../src/server/services/enrichment/trendlyne/TrendlyneEnrichmentQueue.js';
import { TrendlyneQuotaManager } from '../../src/server/services/enrichment/trendlyne/TrendlyneQuotaManager.js';
import { TrendlyneCoverageService } from '../../src/server/services/enrichment/trendlyne/TrendlyneCoverageService.js';

process.env.TRENDLYNE_ENRICHMENT_ENABLED = 'true';

const ACCEPTANCE_UNIVERSE = [
  'DYCL', 'TCS', 'HDFCBANK', 'RELIANCE', 'TATAMOTORS',
  'TATASTEEL', 'INFY', 'ICICIBANK', 'SUNPHARMA', 'TITAN', 'BEL'
];

const PACKS = ['TL_DENSE_001', 'TL_DENSE_002', 'TL_DENSE_003'];

async function main() {
  console.log('[TrendlyneDaemonRunner] Initializing Universe-Wide Trendlyne MCP Enrichment Daemon...');

  const db = getDB();
  const queue = TrendlyneEnrichmentQueue.getInstance();
  const daemon = TrendlyneEnrichmentDaemon.getInstance();
  const quotaManager = TrendlyneQuotaManager.getInstance();
  const coverageService = TrendlyneCoverageService.getInstance();

  // 1. Discover Portfolio, Watchlist, and Full Universe Symbols
  let portfolioSymbols: string[] = [];
  let watchlistSymbols: string[] = [];
  let universeSymbols: string[] = [];

  try {
    const portRows = await dbAll<any>(db, `SELECT DISTINCT symbol FROM Portfolio WHERE symbol IS NOT NULL`);
    portfolioSymbols = portRows.map(r => r.symbol).filter(Boolean);
  } catch {}

  try {
    const watchRows = await dbAll<any>(db, `SELECT DISTINCT symbol FROM Watchlist WHERE symbol IS NOT NULL`);
    watchlistSymbols = watchRows.map(r => r.symbol).filter(Boolean);
  } catch {}

  const symSet = new Set<string>();

  try {
    const histRows = await dbAll<any>(db, `SELECT DISTINCT symbol FROM HistoricalPrices WHERE symbol IS NOT NULL`);
    for (const r of histRows) if (r.symbol) symSet.add(r.symbol.toUpperCase().trim());
  } catch {}

  const manifestFile = path.resolve('data', 'market_data', 'tejhq_hf_10y', 'kite_adjusted_backfill', 'manifest.json');
  if (fs.existsSync(manifestFile)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
      if (m.symbols) {
        for (const s of Object.keys(m.symbols)) symSet.add(s.toUpperCase().trim());
      }
    } catch {}
  }

  universeSymbols = Array.from(symSet);

  const prioritizedSet = new Set([...portfolioSymbols, ...watchlistSymbols, ...ACCEPTANCE_UNIVERSE]);
  const remainingUniverse = universeSymbols.filter(s => !prioritizedSet.has(s));

  console.log(`[TrendlyneDaemonRunner] Identified Target Universe:`);
  console.log(` - Priority 0 (Portfolio): ${portfolioSymbols.length} stocks`);
  console.log(` - Priority 1 (Watchlist): ${watchlistSymbols.length} stocks`);
  console.log(` - Priority 2 (Acceptance Benchmarks): ${ACCEPTANCE_UNIVERSE.length} stocks`);
  console.log(` - Priority 4 (Broader Universe): ${remainingUniverse.length} stocks`);
  console.log(` - Total Universe: ${prioritizedSet.size + remainingUniverse.length} stocks`);

  // Helper to enqueue packs for a symbol
  const enqueueForSymbol = async (sym: string, priority: number) => {
    for (const packId of PACKS) {
      await queue.enqueueJob({
        securityId: sym,
        symbol: sym,
        jobType: 'STRUCTURED_FINANCIALS',
        packId,
        packVersion: 'v1.0.0',
        periodKey: 'TTM',
        priority,
      });
    }
  };

  // 2. Enqueue Priority 0: Portfolio
  for (const sym of portfolioSymbols) {
    await enqueueForSymbol(sym, 1);
  }

  // 3. Enqueue Priority 1: Watchlist
  for (const sym of watchlistSymbols) {
    await enqueueForSymbol(sym, 2);
  }

  // 4. Enqueue Priority 2: Acceptance Benchmarks
  for (const sym of ACCEPTANCE_UNIVERSE) {
    await enqueueForSymbol(sym, 3);
  }

  // 5. Enqueue Priority 4: Full Remaining Universe
  console.log(`[TrendlyneDaemonRunner] Seeding persistent queue with remaining ${remainingUniverse.length} universe stocks...`);
  for (const sym of remainingUniverse) {
    await enqueueForSymbol(sym, 5);
  }

  // 6. Start Daemon with singleton lease & recovery
  await daemon.start();
  console.log('[TrendlyneDaemonRunner] Daemon started with singleton lease. Resumed from last checkpoint.');

  const quota = quotaManager.getQuotaState();
  console.log(`[TrendlyneDaemonRunner] Quota: Daily ${quota.dailyUsed}/${quota.dailyLimit} (Reserve: ${quota.dailyReserve}), Monthly ${quota.monthlyUsed}/${quota.monthlyLimit}`);

  let isStopping = false;

  const handleShutdown = async (signal: string) => {
    if (isStopping) return;
    isStopping = true;
    console.log(`\n[TrendlyneDaemonRunner] Received ${signal}. Stopping daemon and persisting checkpoint...`);
    await daemon.stop();
    await coverageService.generateDataCoverageAudit();
    console.log('[TrendlyneDaemonRunner] Daemon stopped safely. Can be resumed at any time.');
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // 7. Progress reporting function (Every 15 minutes)
  const PROGRESS_INTERVAL_MS = 15 * 60 * 1000; // 15 mins
  let lastProgressReportTime = Date.now();

  const emitProgressReport = async () => {
    try {
      const stateCounts = await dbAll<any>(
        db,
        `SELECT state, COUNT(*) as cnt FROM trendlyne_enrichment_jobs GROUP BY state`
      );
      const countsMap: Record<string, number> = {};
      for (const row of stateCounts) {
        countsMap[row.state] = row.cnt;
      }

      const totalJobs = Object.values(countsMap).reduce((a, b) => a + b, 0);
      const completedJobs = countsMap['COMPLETE'] || 0;
      const pendingJobs = countsMap['PENDING'] || 0;
      const runningJobs = countsMap['RUNNING'] || 0;
      const progressPct = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(2) : '0';

      const currentQuota = quotaManager.getQuotaState();

      const progressData = {
        timestamp: new Date().toISOString(),
        totalUniverseStocks: prioritizedSet.size + remainingUniverse.length,
        totalJobs,
        completedJobs,
        pendingJobs,
        runningJobs,
        progressPct: `${progressPct}%`,
        quota: {
          dailyUsed: currentQuota.dailyUsed,
          dailyLimit: currentQuota.dailyLimit,
          dailyReserve: currentQuota.dailyReserve,
          monthlyUsed: currentQuota.monthlyUsed,
          monthlyLimit: currentQuota.monthlyLimit,
        },
      };

      const outDir = path.resolve('reports', 'data', 'trendlyne');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'DAEMON_PROGRESS.json'),
        JSON.stringify(progressData, null, 2),
        'utf-8'
      );

      console.log(`\n[TrendlyneDaemonRunner] === 15-MINUTE PROGRESS UPDATE ===`);
      console.log(` Time: ${progressData.timestamp}`);
      console.log(` Universe: ${progressData.totalUniverseStocks} stocks | Total Jobs: ${totalJobs}`);
      console.log(` Progress: ${completedJobs} complete (${progressPct}%), ${pendingJobs} pending, ${runningJobs} running`);
      console.log(` Daily Quota: ${currentQuota.dailyUsed}/${currentQuota.dailyLimit} (Reserve: ${currentQuota.dailyReserve})`);
      console.log(` Progress saved to reports/data/trendlyne/DAEMON_PROGRESS.json\n`);
    } catch (err: any) {
      console.error('[TrendlyneDaemonRunner] Failed to emit progress report:', err.message);
    }
  };

  // Initial progress report
  await emitProgressReport();

  // 8. Continuous processing loop
  const POLL_INTERVAL_MS = 5000;
  let iteration = 0;

  while (!isStopping) {
    iteration++;
    try {
      // 15-Minute periodic progress check
      const now = Date.now();
      if (now - lastProgressReportTime >= PROGRESS_INTERVAL_MS) {
        lastProgressReportTime = now;
        await emitProgressReport();
      }

      // Check daily background quota reserve
      if (!quotaManager.hasAvailableBackgroundQuota(1)) {
        if (iteration % 60 === 1) {
          console.log(`[TrendlyneDaemonRunner] Background quota limit reached for today. Standing by for quota reset...`);
        }
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }

      const pendingCount = await queue.getPendingJobCount();
      if (pendingCount === 0) {
        if (iteration % 20 === 1) {
          console.log(`[TrendlyneDaemonRunner] Queue idle (0 pending jobs). Standing by for new requests...`);
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      // Process next batch (up to 500 cells per call)
      const result = await daemon.processNextBatch();

      if (result.callsExecuted > 0) {
        const currentQuota = quotaManager.getQuotaState();
        console.log(`[TrendlyneDaemonRunner] Batch complete: ${result.callsExecuted} call(s), ${result.cellsRequested} cells requested. Daily Quota: ${currentQuota.dailyUsed}/${currentQuota.dailyLimit}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err: any) {
      console.error('[TrendlyneDaemonRunner] Loop error:', err.message || err);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch(err => {
  console.error('[TrendlyneDaemonRunner] Fatal error in daemon runner:', err);
  process.exit(1);
});
