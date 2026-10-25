/**
 * DataRefreshScheduler
 *
 * Metric-specific, automated background refresh for data that goes stale
 * without market-hours awareness (fundamentals, corporate actions,
 * shareholding, announcements).
 *
 * Design rules:
 *   - Each job class has its own interval aligned to the DataProviderRegistry TTL.
 *   - Jobs are idempotent: running twice produces the same result as running once.
 *   - No job calls a provider directly — it delegates to the correct service.
 *   - Market-price refresh is NOT here; the existing server.ts interval owns that.
 *   - Each job respects the provider circuit breaker; a tripped breaker skips
 *     the run and retries on the next cycle.
 *
 * Activation:
 *   DataRefreshScheduler.getInstance().start();  // call once at server boot
 *   DataRefreshScheduler.getInstance().stop();   // for graceful shutdown
 *
 * Manual trigger (from a route or CLI):
 *   await DataRefreshScheduler.getInstance().runNow('fundamentals');
 */

import { obs } from './ObservabilityHub.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { PROVIDER, DATA_CLASS, providerMeta } from './DataProviderRegistry.js';
import { FactsRepository } from './FactsRepository.js';
import { BatchFundamentalProvider } from './BatchFundamentalProvider.js';

// ─── Job definitions ──────────────────────────────────────────────────────────

type JobName = 'fundamentals' | 'corporate-actions' | 'universe-cache-warm';

interface JobDef {
  name: JobName;
  intervalMs: number;       // how often to run
  description: string;
  run: () => Promise<void>;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export class DataRefreshScheduler {
  private static instance: DataRefreshScheduler;
  private handles = new Map<JobName, ReturnType<typeof setInterval>>();
  private running = new Set<JobName>();
  private repo = FactsRepository.getInstance();
  private fundamentalProvider = BatchFundamentalProvider.getInstance();

  static getInstance(): DataRefreshScheduler {
    if (!DataRefreshScheduler.instance) DataRefreshScheduler.instance = new DataRefreshScheduler();
    return DataRefreshScheduler.instance;
  }

  private jobs(): JobDef[] {
    return [
      {
        name: 'universe-cache-warm',
        intervalMs: 2 * 60_000,                     // every 2 min — keeps FactsRepository universe cache hot
        description: 'Warm NSE equity universe in FactsRepository cache',
        run: async () => {
          this.repo.invalidateTicker(undefined as any);   // clear stale entries
          await this.repo.getNseEquityUniverse();
        },
      },
      {
        name: 'fundamentals',
        intervalMs: providerMeta[PROVIDER.SCREENER].ttlMs, // 48 h
        description: 'Refresh stale fundamentals for active holdings via BatchFundamentalProvider',
        run: async () => {
          const cb = CircuitBreaker.for(PROVIDER.SCREENER);
          if (!cb.isAvailable()) {
            obs.warn('DataRefreshScheduler', 'fundamentals_skipped_cb_open', {});
            return;
          }
          // Only refresh symbols held across active portfolios — not the full 750
          const holdings = await this.repo.getHoldings();
          const symbols = [...new Set(holdings.map(h => h.symbol))];
          obs.info('DataRefreshScheduler', 'fundamentals_refresh_start', { count: symbols.length });
          await this.fundamentalProvider.prefetch(symbols, 1500);
          obs.info('DataRefreshScheduler', 'fundamentals_refresh_done', { count: symbols.length });
        },
      },
      {
        name: 'corporate-actions',
        intervalMs: 60 * 60_000,                     // every 1 h (exchange announcements can come intraday)
        description: 'Invalidate FactsRepository cache so next read picks up new corporate actions',
        run: async () => {
          // Corporate actions are written by existing CorporateActionsEngine;
          // scheduler only needs to ensure repo cache is fresh so routes pick them up.
          this.repo.invalidatePortfolios();
          obs.info('DataRefreshScheduler', 'corporate_actions_cache_cleared', {});
        },
      },
    ];
  }

  /** Start all background jobs. Call once at server boot. */
  start(): void {
    if (this.handles.size > 0) return; // already started
    for (const job of this.jobs()) {
      // Run immediately on first tick (after short delay to let DB initialise)
      setTimeout(() => this.execute(job), 10_000);
      // Then on interval
      const h = setInterval(() => this.execute(job), job.intervalMs);
      if ((h as any).unref) (h as any).unref(); // don't block process exit
      this.handles.set(job.name, h);
      obs.info('DataRefreshScheduler', 'job_registered', { name: job.name, intervalMs: job.intervalMs });
    }
  }

  /** Stop all background jobs (graceful shutdown). */
  stop(): void {
    for (const h of this.handles.values()) clearInterval(h);
    this.handles.clear();
    obs.info('DataRefreshScheduler', 'scheduler_stopped', {});
  }

  /** Manually trigger a named job (from a route or CLI). Returns after completion. */
  async runNow(name: JobName): Promise<{ ok: boolean; durationMs: number; error?: string }> {
    const job = this.jobs().find(j => j.name === name);
    if (!job) return { ok: false, durationMs: 0, error: `Unknown job: ${name}` };
    const t0 = Date.now();
    try {
      await this.execute(job);
      return { ok: true, durationMs: Date.now() - t0 };
    } catch (err: any) {
      return { ok: false, durationMs: Date.now() - t0, error: err?.message };
    }
  }

  /** Status of all registered jobs. */
  status(): { name: JobName; scheduled: boolean; running: boolean }[] {
    return this.jobs().map(j => ({
      name: j.name,
      scheduled: this.handles.has(j.name),
      running: this.running.has(j.name),
    }));
  }

  private async execute(job: JobDef): Promise<void> {
    if (this.running.has(job.name)) {
      obs.warn('DataRefreshScheduler', 'job_skipped_already_running', { name: job.name });
      return;
    }
    this.running.add(job.name);
    const t0 = Date.now();
    try {
      await job.run();
      obs.increment('scheduler.job_ok', { name: job.name });
      obs.timing('scheduler.job_ms', Date.now() - t0, { name: job.name });
    } catch (err: any) {
      obs.error('DataRefreshScheduler', 'job_failed', { name: job.name, err: err?.message });
      obs.increment('scheduler.job_err', { name: job.name });
    } finally {
      this.running.delete(job.name);
    }
  }
}
