import { getDB, dbRun, dbAll, dbGet } from '../database.js';
import { NseBhavcopyService } from './NseBhavcopyService.js';
import { UniverseManagerService } from './UniverseManagerService.js';

export interface PipelineRunResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  steps: PipelineStepResult[];
  qualityReport: QualityReport;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
}

interface PipelineStepResult {
  step: string;
  status: 'OK' | 'WARN' | 'FAIL';
  detail: string;
  durationMs: number;
}

export interface QualityReport {
  totalSymbolsInUniverse: number;
  symbolsWithDataToday: number;
  coveragePct: number;
  gapSymbols: string[];
  anomalies: DataAnomaly[];
  staleDays: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

interface DataAnomaly {
  symbol: string;
  type: 'PRICE_SPIKE' | 'ZERO_VOLUME' | 'MISSING_OHLC' | 'CLOSE_OUTSIDE_HL' | 'STALE_DATA';
  detail: string;
}

export interface PipelineStatus {
  lastRunAt: string | null;
  lastRunStatus: string | null;
  isRunning: boolean;
  nextScheduledRun: string | null;
  recentRuns: Array<{ runId: string; status: string; completedAt: string; coveragePct: number }>;
}

export class DailyPipelineService {
  private static instance: DailyPipelineService;
  private isRunning = false;
  private scheduledTimer: ReturnType<typeof setTimeout> | null = null;

  public static getInstance(): DailyPipelineService {
    if (!DailyPipelineService.instance) {
      DailyPipelineService.instance = new DailyPipelineService();
    }
    return DailyPipelineService.instance;
  }

  public async getStatus(): Promise<PipelineStatus> {
    const db = getDB();
    let lastRunAt: string | null = null;
    let lastRunStatus: string | null = null;
    const recentRuns: PipelineStatus['recentRuns'] = [];

    try {
      const rows = await dbAll(db, `
        SELECT key, value FROM AppConfig
        WHERE key IN ('pipeline_last_run_at', 'pipeline_last_run_status')
      `) as any[];
      for (const r of rows) {
        if (r.key === 'pipeline_last_run_at') lastRunAt = r.value;
        if (r.key === 'pipeline_last_run_status') lastRunStatus = r.value;
      }

      const histRows = await dbAll(db, `
        SELECT key, value FROM AppConfig WHERE key LIKE 'pipeline_run_%' ORDER BY key DESC LIMIT 10
      `) as any[];
      for (const r of histRows) {
        try {
          const parsed = JSON.parse(r.value);
          recentRuns.push(parsed);
        } catch {}
      }
    } catch {}

    return {
      lastRunAt,
      lastRunStatus,
      isRunning: this.isRunning,
      nextScheduledRun: null,
      recentRuns
    };
  }

  public async runDailyPipeline(): Promise<PipelineRunResult> {
    if (this.isRunning) {
      throw new Error('Pipeline is already running');
    }

    this.isRunning = true;
    const runId = `run_${Date.now()}`;
    const startedAt = new Date().toISOString();
    const steps: PipelineStepResult[] = [];

    try {
      // Step 1: Refresh universe (if stale > 7 days)
      const universeStep = await this.timedStep('refresh_universe', async () => {
        const mgr = UniverseManagerService.getInstance();
        const stats = await mgr.getStats();
        const daysSinceRefresh = stats.lastRefreshedAt
          ? (Date.now() - new Date(stats.lastRefreshedAt).getTime()) / 86400000
          : Infinity;

        if (daysSinceRefresh > 7 || stats.total < 100) {
          const result = await mgr.refreshFullUniverse();
          await mgr.tierUniverse();
          return { status: 'OK' as const, detail: `Universe refreshed: ${result.total} stocks (${result.inserted} new)` };
        }
        return { status: 'OK' as const, detail: `Universe fresh (${stats.total} stocks, refreshed ${Math.round(daysSinceRefresh)}d ago)` };
      });
      steps.push(universeStep);

      // Step 2: Ingest today's Bhavcopy → DailyOHLCV
      const bhavcopyStep = await this.timedStep('ingest_bhavcopy', async () => {
        const svc = NseBhavcopyService.getInstance();
        const result = await svc.syncLatestBhavcopy();
        if (result.success && result.recordsIngested > 0) {
          await this.crossWriteBhavcopyToDailyOHLCV(result.date!);
          return { status: 'OK' as const, detail: `Bhavcopy ${result.date}: ${result.recordsIngested} records → DailyOHLCV` };
        }
        return { status: 'WARN' as const, detail: result.error || 'No bhavcopy available for recent dates' };
      });
      steps.push(bhavcopyStep);

      // Step 3: Sync institutional deals
      const dealsStep = await this.timedStep('sync_deals', async () => {
        const svc = NseBhavcopyService.getInstance();
        const result = await svc.syncInstitutionalDeals();
        return { status: 'OK' as const, detail: `Bulk: ${result.bulkIngested}, Block: ${result.blockIngested}` };
      });
      steps.push(dealsStep);

      // Step 4: Backfill Upstox for symbols missing from Bhavcopy (optional)
      const upstoxStep = await this.timedStep('upstox_gap_fill', async () => {
        try {
          const gapSymbols = await this.findGapSymbols();
          if (gapSymbols.length === 0) {
            return { status: 'OK' as const, detail: 'No gaps to fill' };
          }
          if (gapSymbols.length > 50) {
            return { status: 'WARN' as const, detail: `${gapSymbols.length} symbols missing data — too many for Upstox gap fill, run backfill instead` };
          }
          const { MarketDataIngestorService } = await import('./MarketDataIngestorService.js');
          await MarketDataIngestorService.getInstance().backfillFromUpstox(gapSymbols.slice(0, 50), 5);
          return { status: 'OK' as const, detail: `Gap-filled ${Math.min(gapSymbols.length, 50)} symbols via Upstox` };
        } catch (err: any) {
          return { status: 'WARN' as const, detail: `Upstox gap fill skipped: ${err.message}` };
        }
      });
      steps.push(upstoxStep);

      // Step 5: Quality checks
      const qualityReport = await this.runQualityChecks();
      const qualityStep: PipelineStepResult = {
        step: 'quality_checks',
        status: qualityReport.overallGrade <= 'B' ? 'OK' : qualityReport.overallGrade === 'C' ? 'WARN' : 'FAIL',
        detail: `Grade: ${qualityReport.overallGrade} — Coverage: ${qualityReport.coveragePct.toFixed(1)}%, ${qualityReport.anomalies.length} anomalies, ${qualityReport.gapSymbols.length} gaps`,
        durationMs: 0
      };
      steps.push(qualityStep);

      // Step 6: Sync forex rates
      const forexStep = await this.timedStep('sync_forex', async () => {
        const svc = NseBhavcopyService.getInstance();
        const rates = await svc.syncForexRates();
        const count = Object.keys(rates).length;
        return { status: count >= 3 ? 'OK' as const : 'WARN' as const, detail: `Updated ${count} forex pairs` };
      });
      steps.push(forexStep);

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      const hasFailures = steps.some(s => s.status === 'FAIL');
      const hasWarnings = steps.some(s => s.status === 'WARN');

      const result: PipelineRunResult = {
        runId,
        startedAt,
        completedAt,
        durationMs,
        steps,
        qualityReport,
        status: hasFailures ? 'FAILED' : hasWarnings ? 'PARTIAL' : 'SUCCESS'
      };

      await this.persistRunResult(result);
      return result;

    } finally {
      this.isRunning = false;
    }
  }

  private async timedStep(
    name: string,
    fn: () => Promise<{ status: 'OK' | 'WARN' | 'FAIL'; detail: string }>
  ): Promise<PipelineStepResult> {
    const t0 = Date.now();
    try {
      const { status, detail } = await fn();
      return { step: name, status, detail, durationMs: Date.now() - t0 };
    } catch (err: any) {
      return { step: name, status: 'FAIL', detail: err.message, durationMs: Date.now() - t0 };
    }
  }

  private async crossWriteBhavcopyToDailyOHLCV(dateStr: string): Promise<number> {
    const db = getDB();
    const yyyy = dateStr.slice(4, 8);
    const mm = dateStr.slice(2, 4);
    const dd = dateStr.slice(0, 2);
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = MONTHS[parseInt(mm, 10) - 1] || 'Sep';
    const formattedBhavDate = `${dd}-${monthName}-${yyyy}`;

    const rows = await dbAll(db, `
      SELECT symbol, prev_close, open, high, low, close, volume, turnover_lacs, no_of_trades, deliv_qty, deliv_per
      FROM NseBhavcopy
      WHERE (trade_date = ? OR trade_date = ?) AND series = 'EQ'
    `, [dateStr, formattedBhavDate]) as any[];

    if (rows.length === 0) return 0;

    let count = 0;
    await dbRun(db, 'BEGIN TRANSACTION');
    try {
      for (const r of rows) {
        await dbRun(db, `
          INSERT OR REPLACE INTO DailyOHLCV (
            symbol, trade_date, open, high, low, close, volume,
            turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NSE_BHAVCOPY')
        `, [
          r.symbol, isoDate, r.open, r.high, r.low, r.close, r.volume,
          (r.turnover_lacs || 0) * 100000, r.deliv_qty || 0, r.deliv_per || 0,
          r.no_of_trades || 0, r.prev_close || 0
        ]);
        count++;
      }
      await dbRun(db, 'COMMIT');
    } catch (err) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      throw err;
    }
    return count;
  }

  private async findGapSymbols(): Promise<string[]> {
    const db = getDB();
    const latestDate = (await dbGet(db, `SELECT MAX(trade_date) as d FROM DailyOHLCV`)) as any;
    if (!latestDate?.d) return [];

    const allSymbols = await dbAll(db, `
      SELECT symbol FROM MasterTickers
      WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL AND symbol != ''
        AND (tier IN ('LARGE_CAP', 'MID_CAP') OR tier IS NULL)
    `) as any[];

    const coveredSymbols = new Set<string>();
    const covered = await dbAll(db, `SELECT DISTINCT symbol FROM DailyOHLCV WHERE trade_date = ?`, [latestDate.d]) as any[];
    for (const r of covered) coveredSymbols.add(r.symbol);

    return allSymbols
      .map((r: any) => r.symbol as string)
      .filter(s => !coveredSymbols.has(s));
  }

  public async runQualityChecks(): Promise<QualityReport> {
    const db = getDB();
    const anomalies: DataAnomaly[] = [];

    const universeCount = ((await dbGet(db, `
      SELECT COUNT(*) as c FROM MasterTickers WHERE exchange='NSE' AND segment='EQ' AND symbol IS NOT NULL AND symbol != ''
    `)) as any)?.c || 0;

    const latestDate = (await dbGet(db, `SELECT MAX(trade_date) as d FROM DailyOHLCV`)) as any;
    const latestTradingDate = latestDate?.d;

    if (!latestTradingDate) {
      return {
        totalSymbolsInUniverse: universeCount,
        symbolsWithDataToday: 0,
        coveragePct: 0,
        gapSymbols: [],
        anomalies: [{ symbol: '*', type: 'STALE_DATA', detail: 'No data in DailyOHLCV at all' }],
        staleDays: 999,
        overallGrade: 'F'
      };
    }

    const todayCount = ((await dbGet(db, `SELECT COUNT(DISTINCT symbol) as c FROM DailyOHLCV WHERE trade_date = ?`, [latestTradingDate])) as any)?.c || 0;
    const coveragePct = universeCount > 0 ? (todayCount / universeCount) * 100 : 0;

    const staleDays = Math.floor((Date.now() - new Date(latestTradingDate).getTime()) / 86400000);

    // Check 1: Close outside high-low range
    const badHL = await dbAll(db, `
      SELECT symbol, close, high, low FROM DailyOHLCV
      WHERE trade_date = ? AND (close > high * 1.001 OR close < low * 0.999)
      LIMIT 20
    `, [latestTradingDate]) as any[];
    for (const r of badHL) {
      anomalies.push({
        symbol: r.symbol,
        type: 'CLOSE_OUTSIDE_HL',
        detail: `Close ${r.close} outside H=${r.high} L=${r.low}`
      });
    }

    // Check 2: Zero volume for liquid stocks
    const zeroVol = await dbAll(db, `
      SELECT d.symbol FROM DailyOHLCV d
      JOIN MasterTickers m ON d.symbol = m.symbol
      WHERE d.trade_date = ? AND d.volume = 0 AND m.tier IN ('LARGE_CAP', 'MID_CAP')
      LIMIT 20
    `, [latestTradingDate]) as any[];
    for (const r of zeroVol) {
      anomalies.push({ symbol: r.symbol, type: 'ZERO_VOLUME', detail: 'Zero volume for large/mid cap stock' });
    }

    // Check 3: Price spikes > 30% day-over-day for large caps
    const spikes = await dbAll(db, `
      SELECT d.symbol, d.close, d.prev_close,
             ABS((d.close - d.prev_close) / NULLIF(d.prev_close, 0)) * 100 as changePct
      FROM DailyOHLCV d
      JOIN MasterTickers m ON d.symbol = m.symbol
      WHERE d.trade_date = ? AND d.prev_close > 0 AND m.tier = 'LARGE_CAP'
        AND ABS((d.close - d.prev_close) / d.prev_close) > 0.30
      LIMIT 10
    `, [latestTradingDate]) as any[];
    for (const r of spikes) {
      anomalies.push({
        symbol: r.symbol,
        type: 'PRICE_SPIKE',
        detail: `${r.changePct?.toFixed(1)}% change (${r.prev_close} → ${r.close})`
      });
    }

    // Check 4: Stale data
    if (staleDays > 3) {
      anomalies.push({ symbol: '*', type: 'STALE_DATA', detail: `Latest data is ${staleDays} days old (${latestTradingDate})` });
    }

    const gapSymbols = await this.findGapSymbols();

    let grade: QualityReport['overallGrade'];
    if (coveragePct >= 90 && anomalies.length <= 3 && staleDays <= 2) grade = 'A';
    else if (coveragePct >= 75 && anomalies.length <= 10 && staleDays <= 3) grade = 'B';
    else if (coveragePct >= 50 && staleDays <= 5) grade = 'C';
    else if (coveragePct >= 20) grade = 'D';
    else grade = 'F';

    return {
      totalSymbolsInUniverse: universeCount,
      symbolsWithDataToday: todayCount,
      coveragePct,
      gapSymbols: gapSymbols.slice(0, 50),
      anomalies,
      staleDays,
      overallGrade: grade
    };
  }

  public scheduleDaily(hourIST: number = 18, minuteIST: number = 30): void {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
    }

    const scheduleNext = () => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(now.getTime() + istOffset);
      const target = new Date(nowIST);
      target.setHours(hourIST, minuteIST, 0, 0);

      if (target.getTime() <= nowIST.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      // Skip weekends
      while (target.getDay() === 0 || target.getDay() === 6) {
        target.setDate(target.getDate() + 1);
      }

      const delayMs = target.getTime() - nowIST.getTime();
      console.log(`[DailyPipeline] Next run scheduled in ${Math.round(delayMs / 60000)} minutes (${target.toISOString()})`);

      this.scheduledTimer = setTimeout(async () => {
        try {
          console.log('[DailyPipeline] Scheduled daily run starting...');
          await this.runDailyPipeline();
        } catch (err: any) {
          console.error('[DailyPipeline] Scheduled run failed:', err.message);
        }
        scheduleNext();
      }, delayMs);
    };

    scheduleNext();
  }

  private async persistRunResult(result: PipelineRunResult): Promise<void> {
    const db = getDB();
    try {
      await dbRun(db,
        `INSERT INTO AppConfig (key, value) VALUES ('pipeline_last_run_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [result.completedAt]
      );
      await dbRun(db,
        `INSERT INTO AppConfig (key, value) VALUES ('pipeline_last_run_status', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [result.status]
      );
      const summaryKey = `pipeline_run_${result.runId}`;
      await dbRun(db,
        `INSERT INTO AppConfig (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [summaryKey, JSON.stringify({
          runId: result.runId,
          status: result.status,
          completedAt: result.completedAt,
          coveragePct: result.qualityReport.coveragePct,
          durationMs: result.durationMs
        })]
      );
    } catch {}
  }
}
