/**
 * run_v2_trendlyne_daemon.ts — Standalone Background Runner for Trendlyne MCP Max Enrichment
 * WealthOS V2 Mandatory Amendment
 *
 * Runs continuously in background:
 * - Ensures acceptance universe & portfolio/watchlist jobs are enqueued
 * - Executes optimal 500-cell batches (10 scrips × 50 metrics)
 * - Observes quota limits and retains interactive reserve
 * - Recovers crashed/abandoned jobs idempotently
 */

import { getDB, dbAll } from '../../src/server/database.js';
import { TrendlyneEnrichmentDaemon } from '../../src/server/services/enrichment/trendlyne/TrendlyneEnrichmentDaemon.js';
import { TrendlyneEnrichmentQueue } from '../../src/server/services/enrichment/trendlyne/TrendlyneEnrichmentQueue.js';
import { TrendlyneQuotaManager } from '../../src/server/services/enrichment/trendlyne/TrendlyneQuotaManager.js';
import { TrendlyneCoverageService } from '../../src/server/services/enrichment/trendlyne/TrendlyneCoverageService.js';

process.env.TRENDLYNE_ENRICHMENT_ENABLED = 'true';

const ACCEPTANCE_UNIVERSE = [
  'DYCL', 'TCS', 'HDFCBANK', 'RELIANCE', 'TATAMOTORS',
  'TATASTEEL', 'INFY', 'ICICIBANK', 'SUNPHARMA', 'TITAN', 'BEL'
];

async function main() {
  console.log('[TrendlyneDaemonRunner] Starting Trendlyne MCP Background Data Enrichment Daemon...');

  // 1. Connect to SQLite Database
  const db = getDB();

  const queue = TrendlyneEnrichmentQueue.getInstance();
  const daemon = TrendlyneEnrichmentDaemon.getInstance();
  const quotaManager = TrendlyneQuotaManager.getInstance();
  const coverageService = TrendlyneCoverageService.getInstance();

  // 2. Discover portfolio and watchlist securities to prioritize
  let portfolioSymbols: string[] = [];
  let watchlistSymbols: string[] = [];
  try {
    const portRows = await dbAll<any>(db, `SELECT DISTINCT symbol FROM Portfolio WHERE symbol IS NOT NULL`);
    portfolioSymbols = portRows.map(r => r.symbol).filter(Boolean);
  } catch {
    // fallback if table empty or different schema
  }

  try {
    const watchRows = await dbAll<any>(db, `SELECT DISTINCT symbol FROM Watchlist WHERE symbol IS NOT NULL`);
    watchlistSymbols = watchRows.map(r => r.symbol).filter(Boolean);
  } catch {
    // fallback
  }

  console.log(`[TrendlyneDaemonRunner] Prioritized targets:`);
  console.log(` - Portfolio (P0): ${portfolioSymbols.length} symbols`);
  console.log(` - Watchlist (P1): ${watchlistSymbols.length} symbols`);
  console.log(` - Acceptance Benchmark (P2): ${ACCEPTANCE_UNIVERSE.length} symbols`);

  // 3. Enqueue Acceptance Universe (P2)
  for (const sym of ACCEPTANCE_UNIVERSE) {
    await queue.enqueueJob({
      securityId: sym,
      symbol: sym,
      jobType: 'STRUCTURED_FINANCIALS',
      packId: 'TL_DENSE_001',
      packVersion: 'v1.0.0',
      periodKey: 'TTM',
      priority: 3,
    });
  }

  // 4. Enqueue Portfolio (P0)
  for (const sym of portfolioSymbols) {
    await queue.enqueueJob({
      securityId: sym,
      symbol: sym,
      jobType: 'STRUCTURED_FINANCIALS',
      packId: 'TL_DENSE_001',
      packVersion: 'v1.0.0',
      periodKey: 'TTM',
      priority: 1,
    });
  }

  // 5. Enqueue Watchlist (P1)
  for (const sym of watchlistSymbols) {
    await queue.enqueueJob({
      securityId: sym,
      symbol: sym,
      jobType: 'STRUCTURED_FINANCIALS',
      packId: 'TL_DENSE_001',
      packVersion: 'v1.0.0',
      periodKey: 'TTM',
      priority: 2,
    });
  }

  // 6. Start Daemon
  await daemon.start();
  console.log('[TrendlyneDaemonRunner] Daemon started with singleton lease.');

  const quota = quotaManager.getQuotaState();
  console.log(`[TrendlyneDaemonRunner] Initial Quota: Daily ${quota.dailyUsed}/${quota.dailyLimit} (Reserve: ${quota.dailyReserve}), Monthly ${quota.monthlyUsed}/${quota.monthlyLimit}`);

  let isStopping = false;

  const handleShutdown = async (signal: string) => {
    if (isStopping) return;
    isStopping = true;
    console.log(`\n[TrendlyneDaemonRunner] Received ${signal}. Shutting down daemon gracefully...`);
    await daemon.stop();
    await coverageService.generateDataCoverageAudit();
    console.log('[TrendlyneDaemonRunner] Daemon shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // 7. Continuous processing loop
  const POLL_INTERVAL_MS = 5000;
  let iteration = 0;

  while (!isStopping) {
    iteration++;
    try {
      if (!quotaManager.hasAvailableBackgroundQuota(1)) {
        console.log(`[TrendlyneDaemonRunner] Daily background quota limit/reserve reached. Sleeping until quota reset...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        continue;
      }

      const pendingCount = await queue.getPendingJobCount();
      if (pendingCount === 0) {
        if (iteration % 12 === 1) {
          console.log(`[TrendlyneDaemonRunner] Queue idle (0 pending jobs). Standing by for new requests...`);
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      console.log(`[TrendlyneDaemonRunner] [Iteration ${iteration}] Processing batch (${pendingCount} pending jobs in queue)...`);
      const result = await daemon.processNextBatch();

      if (result.callsExecuted > 0) {
        const currentQuota = quotaManager.getQuotaState();
        console.log(`[TrendlyneDaemonRunner] Batch complete: ${result.callsExecuted} call(s), ${result.cellsRequested} cells requested. Quota used: ${currentQuota.dailyUsed}/${currentQuota.dailyLimit}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err: any) {
      console.error('[TrendlyneDaemonRunner] Error in daemon loop iteration:', err.message || err);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch(err => {
  console.error('[TrendlyneDaemonRunner] Fatal error starting daemon:', err);
  process.exit(1);
});
