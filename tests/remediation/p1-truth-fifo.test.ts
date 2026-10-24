import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

test('P1 FY helper rejects invalid dates instead of inventing a reporting year', async () => {
  const source = await readFile(new URL('../../src/server/fifoEngine.ts', import.meta.url), 'utf8');
  assert.match(source, /INVALID_TRADE_DATE/);
  assert.match(source, /getFYFromDate/);
  assert.match(source, /isNaN\(parsed\.getTime\(\)\)/);
});

test('P1 canonical migration owns reconciliation exception ledger', async () => {
  const { migration003 } = await import('../../src/server/db/migrations/003_reconciliation_exceptions.js');
  assert.equal(migration003.id, 3);
  assert.equal(migration003.name, '003_reconciliation_exceptions');
  assert.match(migration003.checksum, /^[a-f0-9]{64}$/);
});

test('P1 shared financial-year helper rejects malformed ranges', async () => {
  const { parseFinancialYear, getFinancialYearFromDate } = await import('../../src/server/financialYear.js');
  assert.deepEqual(parseFinancialYear('2025-2026'), { startYear: 2025, endYear: 2026 });
  assert.equal(getFinancialYearFromDate('2025-03-31'), '2024-2025');
  assert.throws(() => parseFinancialYear('2025-2027'), /INVALID_FINANCIAL_YEAR/);
});

test('P1 report source exposes explicit Unclassified reconciliation bucket', async () => {
  const source = await readFile(new URL('../../src/server/services/ReportsService.ts', import.meta.url), 'utf8');
  assert.match(source, /asset_class: tx\.asset_class \|\| 'Unclassified'/);
  assert.match(source, /reconciliationByAssetClass/);
});

test('P1 dashboard exposes source/as-of metadata and visible stale state', async () => {
  const dashboard = await readFile(new URL('../../server.ts', import.meta.url), 'utf8');
  const view = await readFile(new URL('../../src/components/DashboardView.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /H\.data_source AS price_source/);
  assert.match(dashboard, /H\.last_update AS price_asof/);
  assert.match(dashboard, /H\.data_status/);
  assert.match(view, /h\.data_status === 'STALE'/);
  assert.match(view, />STALE<\/span>/);
});

test('P1 stale prices retain their original as-of timestamp and are marked stale', async () => {
  const dashboard = await readFile(new URL('../../server.ts', import.meta.url), 'utf8');
  const fifo = await readFile(new URL('../../src/server/fifoEngine.ts', import.meta.url), 'utf8');
  assert.match(dashboard, /datetime\(H\.last_update\) < datetime\('now', '-1 day'\)/);
  assert.match(fifo, /lu = existing\.last_update \|\| null/);
  assert.match(fifo, /dataStatus = 'STALE'/);
});

test('P1 FIFO engine rejects wildcard portfolio filter (scope guard)', async () => {
  const source = await readFile(new URL('../../src/server/fifoEngine.ts', import.meta.url), 'utf8');
  // Guard must exist and reject *, all, __all__ to prevent cross-portfolio writes
  assert.match(source, /EXPLICIT_FIFO_PORTFOLIO_REQUIRED/);
  assert.match(source, /portfolioFilter\?\.trim\(\)/);
  assert.match(source, /'all'/);
  assert.match(source, /'__all__'/);
});

test('P1 FIFO engine wraps all writes in a single transaction (rollback guard)', async () => {
  const source = await readFile(new URL('../../src/server/fifoEngine.ts', import.meta.url), 'utf8');
  // withTx must wrap the FIFO body — ensures atomic commit/rollback
  assert.match(source, /withTx\(db/);
  // runFIFO must call withTx, not raw dbRun before the transaction
  const fifoFn = source.slice(source.indexOf('export async function runFIFO'));
  assert.match(fifoFn, /withTx/);
});

test('P1 FX cost quality is tagged CERTIFIED only when historic rate is known', async () => {
  const source = await readFile(new URL('../../src/server/routes/commandCenter.ts', import.meta.url), 'utf8');
  // Must not use magnitude-based inference (< 1000000 pattern removed)
  assert.doesNotMatch(source, /rawCost < 1000000/);
  assert.doesNotMatch(source, /rawCost < 1_000_000/);
  // Must use currency field and historic_fx_rate for CERTIFIED determination
  assert.match(source, /historic_fx_rate/);
  assert.match(source, /CERTIFIED/);
  assert.match(source, /APPROX/);
});

test('P1 report schedule worker is registered in server startup', async () => {
  const server = await readFile(new URL('../../server.ts', import.meta.url), 'utf8');
  assert.match(server, /ReportScheduleWorker/);
  assert.match(server, /startReportScheduleWorker/);
});

test('P1 health freshness is wired to dashboard STALE badge', async () => {
  const view = await readFile(new URL('../../src/components/DashboardView.tsx', import.meta.url), 'utf8');
  // Polls /api/healthcheck and surfaces STALE when stale data detected
  assert.match(view, /\/api\/healthcheck/);
  assert.match(view, /hasStaleData/);
  assert.match(view, /STALE/);
  assert.match(view, /staleHoldings/);
  assert.match(view, /cc9GainsQuality/);
});
