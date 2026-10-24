/**
 * Report schedule consumer.
 *
 * Picks up QUEUED rows in report_schedules, runs the appropriate ReportsService
 * method, stores a summary, and advances next_run_at. External delivery remains
 * disabled; DOWNLOAD_ONLY mode generates a local artifact row in report_runs.
 */
import { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';
import { ReportsService } from './ReportsService.js';

type ReportRow = {
  id: number;
  report_type: string;
  portfolio: string | null;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  next_run_at: string;
  delivery_mode: string;
};

function advanceNextRunAt(current: string, frequency: string): string {
  const d = new Date(current);
  switch (frequency.toUpperCase()) {
    case 'WEEKLY':  d.setUTCDate(d.getUTCDate() + 7); break;
    case 'MONTHLY': d.setUTCMonth(d.getUTCMonth() + 1); break;
    default:        d.setUTCDate(d.getUTCDate() + 1);   // DAILY
  }
  return d.toISOString();
}

async function runOneSchedule(db: Database, row: ReportRow): Promise<void> {
  const svc = ReportsService.getInstance();
  let data: unknown;
  const portfolio = row.portfolio ?? undefined;

  switch (row.report_type) {
    case 'CAPITAL_GAINS':
      data = await svc.generateCapitalGainsReport({ reportType: 'CAPITAL_GAINS', portfolio });
      break;
    case 'TRADE_BOOK':
      data = await svc.generateTradeBook({ reportType: 'TRADE_BOOK', portfolio });
      break;
    case 'DIVIDEND_INCOME':
    case 'DIVIDEND_STATEMENT':
      data = await svc.generateDividendReport({ reportType: 'DIVIDEND_STATEMENT', portfolio });
      break;
    case 'ASSET_XIRR':
      data = await svc.generateAssetWiseXirrReport({ reportType: 'ASSET_XIRR', portfolio });
      break;
    case 'ASSET_ALLOCATION':
    case 'PERFORMANCE_SUMMARY':
      data = await svc.generateAssetAllocationReport({ reportType: 'PERFORMANCE_SUMMARY', portfolio });
      break;
    default:
      data = await svc.generateHoldingsStatement({ reportType: 'HOLDING_STATEMENT', portfolio });
  }

  // Persist a report_runs artifact so the UI can list it
  await dbRun(db,
    'INSERT INTO report_runs (report_type,portfolio,request_json,created_by) VALUES (?,?,?,?)',
    [row.report_type, row.portfolio ?? null, JSON.stringify({ scheduledRunId: row.id, deliveryMode: row.delivery_mode }), 'schedule_worker']
  );

  const nextRunAt = advanceNextRunAt(row.next_run_at, row.frequency);
  await dbRun(db,
    `UPDATE report_schedules
     SET last_run_at=CURRENT_TIMESTAMP, last_status='COMPLETED', next_run_at=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [nextRunAt, row.id]
  );
  console.log(`[ReportScheduleWorker] Schedule ${row.id} (${row.report_type}) completed. Next run: ${nextRunAt}`);
}

async function processDueSchedules(db: Database): Promise<void> {
  const queued: ReportRow[] = await dbAll(
    db,
    `SELECT id, report_type, portfolio, frequency, next_run_at, delivery_mode
     FROM report_schedules
     WHERE status = 'ACTIVE' AND last_status = 'QUEUED'
     ORDER BY last_run_at ASC LIMIT 5`,
    []
  );

  for (const row of queued) {
    try {
      await runOneSchedule(db, row);
    } catch (err: any) {
      const brief = String(err?.message || err).slice(0, 200);
      await dbRun(db,
        `UPDATE report_schedules
         SET last_status='FAILED', updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [row.id]
      ).catch(() => {});
      console.error(`[ReportScheduleWorker] Schedule ${row.id} failed: ${brief}`);
    }
  }
}

let workerTimer: ReturnType<typeof setInterval> | null = null;

/** Start the in-process schedule worker. Safe to call multiple times; only one timer runs. */
export function startReportScheduleWorker(db: Database, intervalMs = 60_000): void {
  if (workerTimer) return;
  console.log('[ReportScheduleWorker] Starting — polling every', intervalMs / 1000, 's');
  workerTimer = setInterval(() => {
    processDueSchedules(db).catch(err =>
      console.error('[ReportScheduleWorker] Poll error:', err)
    );
  }, intervalMs);
  // Fire immediately on startup to drain any queued runs
  processDueSchedules(db).catch(console.error);
}

export function stopReportScheduleWorker(): void {
  if (workerTimer) { clearInterval(workerTimer); workerTimer = null; }
}
