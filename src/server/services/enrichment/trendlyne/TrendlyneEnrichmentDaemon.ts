/**
 * TrendlyneEnrichmentDaemon.ts — Deterministic Background Data-Enrichment Daemon
 * WealthOS V2 Mandatory Amendment
 *
 * Implements:
 * - Resumable, crash-safe, singleton lease.
 * - Self-starting when TRENDLYNE_ENRICHMENT_ENABLED=true.
 * - Recovers abandoned RUNNING jobs to RETRYABLE on startup.
 * - Respects quota reserve (sleeps if background quota exhausted, never blocks interactive UI).
 * - Executes optimal 500-cell batches via TrendlyneBatchPlanner.
 * - Checkpoints progress and maintains restart idempotency.
 */

import { TrendlyneNotConfiguredError } from './TrendlyneMcpClient.js';
import { TrendlyneEnrichmentQueue } from './TrendlyneEnrichmentQueue.js';
import { TrendlyneBatchPlanner, QueuedWorkItem } from './TrendlyneBatchPlanner.js';
import { TrendlyneStructuredDataAdapter } from './TrendlyneStructuredDataAdapter.js';
import { TrendlyneQuotaManager } from './TrendlyneQuotaManager.js';
import { TrendlyneCoverageStore } from './TrendlyneCoverageStore.js';
import { TrendlyneUniverseScheduler } from './TrendlyneUniverseScheduler.js';

export class TrendlyneEnrichmentDaemon {
  private static instance: TrendlyneEnrichmentDaemon;

  private isRunning = false;
  private isLeaseHeld = false;
  private readonly queue: TrendlyneEnrichmentQueue;
  private readonly planner: TrendlyneBatchPlanner;
  private readonly structuredAdapter: TrendlyneStructuredDataAdapter;
  private readonly quotaManager: TrendlyneQuotaManager;
  private readonly coverageStore: TrendlyneCoverageStore;
  private readonly universeScheduler: TrendlyneUniverseScheduler;

  private constructor(
    queue = TrendlyneEnrichmentQueue.getInstance(),
    planner = new TrendlyneBatchPlanner(),
    structuredAdapter = TrendlyneStructuredDataAdapter.getInstance(),
    quotaManager = TrendlyneQuotaManager.getInstance(),
    coverageStore = TrendlyneCoverageStore.getInstance(),
    universeScheduler = TrendlyneUniverseScheduler.getInstance()
  ) {
    this.queue = queue;
    this.planner = planner;
    this.structuredAdapter = structuredAdapter;
    this.quotaManager = quotaManager;
    this.coverageStore = coverageStore;
    this.universeScheduler = universeScheduler;
  }

  public static getInstance(): TrendlyneEnrichmentDaemon {
    if (!TrendlyneEnrichmentDaemon.instance) {
      TrendlyneEnrichmentDaemon.instance = new TrendlyneEnrichmentDaemon();
    }
    return TrendlyneEnrichmentDaemon.instance;
  }

  public isEnabled(): boolean {
    return process.env.TRENDLYNE_ENRICHMENT_ENABLED === 'true';
  }

  public getStatus(): { isRunning: boolean; isLeaseHeld: boolean; quotaState: any } {
    return {
      isRunning: this.isRunning,
      isLeaseHeld: this.isLeaseHeld,
      quotaState: this.quotaManager.getQuotaState(),
    };
  }

  /**
   * Starts daemon lifecycle.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isLeaseHeld = true;

    // 1. Initialize stores and quota
    await this.coverageStore.initialize();
    await this.quotaManager.initialize();

    // 2. Ensure universe schedule table exists, seed if empty
    await this.universeScheduler.ensureTable();
    const stats = await this.universeScheduler.getStats();
    if (stats.total === 0) {
      const seed = await this.universeScheduler.seedFromMasterTickers();
      console.log(`[TrendlyneDaemon] Universe seeded: ${seed.inserted} stocks (${seed.skipped} already present)`);
    }

    // 3. Recover abandoned jobs from previous crash/restart
    await this.queue.recoverAbandonedRunningJobs();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.isLeaseHeld = false;
  }

  /**
   * Processes the next optimal batch according to priority policy.
   */
  public async processNextBatch(options?: { force?: boolean }): Promise<{ callsExecuted: number; cellsRequested: number; sourceUnavailable?: boolean }> {
    if (!this.isRunning && !this.isLeaseHeld) {
      return { callsExecuted: 0, cellsRequested: 0 };
    }

    // Check quota
    if (!this.quotaManager.hasAvailableBackgroundQuota(1)) {
      return { callsExecuted: 0, cellsRequested: 0 };
    }

    const pendingJobs = await this.queue.getPendingJobs(50);

    // Coalesce explicit jobs into QueuedWorkItems
    const explicitItems: QueuedWorkItem[] = pendingJobs.map((j) => ({
      scrip: {
        securityId: j.securityId,
        symbol: j.symbol || j.securityId,
        priority: j.priority === 1 ? 'P0' : j.priority === 2 ? 'P1' : 'P2',
      },
    }));

    // ── Slot Filler: pad every batch to SCRIP_CAPACITY (10) ──────────
    // Deduplicate explicit symbols, then fill remaining slots with
    // universe stocks that are due for a refresh (TTL expired).
    const explicitSymbols = [...new Set(explicitItems.map((i) => i.scrip.symbol))];
    const scripCap = this.planner.scripCapacity;  // 10

    // We might have multiple batches; fill each to capacity.
    // Simple heuristic: request enough fillers for the first unfilled batch.
    const firstBatchFreeSlots = Math.max(0, scripCap - Math.min(explicitSymbols.length, scripCap));
    const fillerStocks = firstBatchFreeSlots > 0
      ? await this.universeScheduler.getFillerStocks(firstBatchFreeSlots, explicitSymbols)
      : [];

    const fillerItems: QueuedWorkItem[] = fillerStocks.map((s) => ({
      scrip: {
        securityId: s.securityId,
        symbol: s.symbol,
        priority: s.universeTier === 1 ? 'P1' : 'P2',
      },
    }));

    const queueItems = [...explicitItems, ...fillerItems];

    if (queueItems.length === 0) {
      return { callsExecuted: 0, cellsRequested: 0 };
    }

    if (fillerItems.length > 0) {
      console.log(`[TrendlyneDaemon] Slot filler added ${fillerItems.length} universe stocks `
        + `(${explicitItems.length} explicit + ${fillerItems.length} filler = ${queueItems.length} total)`);
    }

    // Plan batches using 2D bin packing (now with full 10-scrip batches)
    const plannedCalls = this.planner.planBatches(queueItems);
    let callsExecuted = 0;
    let cellsRequested = 0;
    let sourceUnavailable = false;

    for (const call of plannedCalls) {
      // Check if already completed (restart idempotency)
      if (call.isIdempotentSkip && !options?.force) {
        continue;
      }

      if (!this.quotaManager.hasAvailableBackgroundQuota(1)) {
        break;
      }

      // Mark jobs as RUNNING
      for (const scrip of call.scrips) {
        const job = pendingJobs.find((j) => j.securityId === scrip.securityId);
        if (job) await this.queue.updateJobState(job.jobId, 'RUNNING');
      }

      // Execute structured data call
      let execResult;
      try {
        execResult = await this.structuredAdapter.executeBatchCall(call);
      } catch (err: any) {
        if (err instanceof TrendlyneNotConfiguredError) {
          // Fail closed: persist nothing, do not consume quota, do not stamp TTL, record source_unavailable.
          console.warn(`[TrendlyneDaemon] source_unavailable: ${err.message}`);
          for (const scrip of call.scrips) {
            const job = pendingJobs.find((j) => j.securityId === scrip.securityId);
            if (job) await this.queue.updateJobState(job.jobId, 'SOURCE_UNAVAILABLE', { code: err.code, message: err.message });
          }
          sourceUnavailable = true;
          break;
        }
        throw err;
      }
      await this.quotaManager.consumeQuota(1);

      // Record call efficiency
      this.planner.recordCallExecution(
        call,
        execResult.mappingResult.factsCreated,
        0,
        0,
        0
      );

      // Mark jobs as COMPLETE
      for (const scrip of call.scrips) {
        const job = pendingJobs.find((j) => j.securityId === scrip.securityId);
        if (job) await this.queue.updateJobState(job.jobId, 'COMPLETE');
      }

      // Stamp 15-day TTL for all scrips in this call (explicit + filler)
      await this.universeScheduler.markFetched(call.scrips.map((s) => s.symbol));

      callsExecuted++;
      cellsRequested += call.requestedCells;
    }

    // Write call efficiency report
    this.planner.generateCallEfficiencyReport();

    return { callsExecuted, cellsRequested, ...(sourceUnavailable ? { sourceUnavailable: true } : {}) };
  }
}
