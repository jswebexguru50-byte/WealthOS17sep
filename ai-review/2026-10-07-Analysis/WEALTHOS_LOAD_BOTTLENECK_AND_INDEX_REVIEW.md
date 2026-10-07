# WealthOS — Slow-load Bottlenecks, Index Audit and Module Map (review only, nothing changed)

Companion files in the same folder: `WEALTHOS_MIND_MAP.html` (visual map), `diagnose_db.sql` (read-only checks), `index_migration_PROPOSED.sql` (not applied), `graphify-out/` (graph.html, GRAPH_REPORT.md, graph.json).

**Reviewer-agent instruction:** the ranking below is from static analysis. Confirm B1–B4 with the measurements in section 6 before applying anything, and apply every index change to a copy of `portfolio.db` first.

## 0. How this was produced

- **Skills used from the project's `skills/` folder:** `graphify` (deterministic AST pass, no LLM, 0 tokens) for the module graph; `performance-optimization` (measure → locate bottleneck → fix → verify → guard) for the method and its N+1 / "queries that ignore their index" / missing-cache patterns; `observability-and-instrumentation` for the timing middleware stub.
- **Graph scope:** 75 files staged: `server.ts`, 26 routers, 7 server helpers, about 36 core services, `App.tsx`, `DashboardView`, `OpportunityEngineMasterView`, `ImportsHubView`, `lib/`, configs. Result: 1,383 nodes, 2,695 edges, 58 communities, 97% EXTRACTED / 3% INFERRED edges. The other roughly 120 services and about 85 components were not in the graph.
- **Not available:** a runtime profile and the live database. `portfolio.db` is 3.4 GB and cannot be read from here, so index analysis is from `schema.sql` (generated 2026-09-25) and from the SQL embedded in the code. Row counts, `dbstat` sizes and query plans are unconfirmed.
- **Parser note:** graphify reported a syntax error at `OpportunityEngineMasterView.tsx:2168` (13 symbols extracted). This may be an extractor limitation on a very large TSX file, so confirm with `npx tsc --noEmit` before treating it as a real defect.

## 1. Module map (see `WEALTHOS_MIND_MAP.html` for the picture)

| Layer | What it is | Evidence from graph |
|---|---|---|
| Client | React 19 + Vite. `App.tsx` lazy-loads about 35 views; `DashboardView` (2.5k lines), `OpportunityEngineMasterView` (9.6k lines), `ImportsHubView` | `App.tsx` imports 49 modules; 23 raw `fetch` calls |
| API | `server.ts` 17k lines, 239 inline routes, plus 26 routers (`infra.ts` has 228 routes) | `server.ts` fans out to 90 imports; `infra.ts` to 59 |
| Portfolio core | `fifoEngine`, `xirr`, `UnifiedValuationService`, `BankAndFDService`, `CorporateActionsEngine`, `TaxHarvestingEngine`, `NriWealthService`, `PostTaxXirrService` | `runFIFO()` has 27 edges |
| Import and reconcile | `camsParser`, `pmsParser`, Zerodha sync, `PmsReconciliationService`, `MultiBrokerReconService` | writes via `dbRun` in loops |
| Market data | `yahooFinance` (18 DB call sites), `LiveMarketStreamService` (WebSocket), `MarketDataCache`, `DuckDbAdjustedOhlcvService` (candles in Parquet, outside SQLite), NSE/Upstox ingestors | |
| Intelligence | `ConsolidatedOpportunityEngine` (38 edges), `PureTechnicalStrategiesEngine` (188 KB), `MomentumVpa`, `SmartMoney*`, `RegimeBacktestEngine`, `AutonomousSmartMoneyAgent` | deferred at boot by env flags |
| Data layer | `database.ts` (callback `sqlite3`, one connection). `getDB()` 104 edges, `dbRun` 84, `dbAll` 82, `dbGet` 69 | the four most-connected nodes in the whole graph |

**Structural findings from the graph:**
- Import cycle: `database.ts → xirr.ts → fifoEngine.ts → database.ts`.
- DB call sites by file: `server.ts` 34, `ConsolidatedOpportunityEngine` 21, `yahooFinance` 18, `AutonomousSmartMoneyAgent` 13. Routes and `server.ts` talk to the DB directly, while `CLAUDE.md` says routes should go through services.
- `shared.ts → db()` is reached via 5 inferred indirect calls from `server.ts`, so the DB handle is shared mutable state.

## 2. Why the app takes long to load (ranked)

Startup itself is already well deferred: the port binds first, then the DB opens, and all strategies, schedulers and pre-warm jobs are behind env flags (`server.ts:16796–17224`). The slowness is therefore the **first data request** and I/O contention, not boot.

### B1 — One SQLite connection serialises everything (critical)

`database.ts:132–153` opens one `sqlite3.Database` and every query queues behind it. The dashboard's background recompute, `/api/dashboard/xirr`, `/api/growth-history`, scrip search and every import write share the same queue, so one heavy job delays unrelated clicks. `runInDbLock` (`database.ts:10`) also busy-waits with a 100 ms `setTimeout` loop.

```ts
// A. Quick fix, no driver change: give heavy READS their own connections (WAL allows concurrent readers)
// src/server/db/readPool.ts (NEW)
import sqlite3 from 'sqlite3';
const POOL = 3; const readers: sqlite3.Database[] = []; let rr = 0;
export function getReadDb(file = getDbFile()) {
  if (!readers.length) for (let i = 0; i < POOL; i++) {
    const d = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
    d.run('PRAGMA busy_timeout=30000'); d.run('PRAGMA cache_size=-65536'); d.run('PRAGMA mmap_size=1073741824');
    readers.push(d);
  }
  return readers[rr++ % POOL];
}
// buildDashboardPayload, getValuedHoldingsAsOfDate, generateImmediateGrowthHistory: replace `db` with `getReadDb()`.
// Writers keep the single write connection.

// B. Replace the busy-wait lock with an async mutex
class Mutex { private p: Promise<void> = Promise.resolve();
  run<T>(fn: () => Promise<T>) { const r = this.p.then(fn); this.p = r.then(() => {}, () => {}); return r; } }
export const dbMutex = new Mutex();
```

Moving to `better-sqlite3` (already a dependency) is the larger fix. See the previous review, section 3.1.

### B7 — A full database copy after every write (critical)

`database.ts:3553`: every successful `dbRun` calls `createPersistentBackup()`, which does `fs.promises.copyFile(portfolio.db, portfolio_persistent_backup.db)` at most every 10 minutes (`:31–52`). With a 3.4 GB file, one write (including the dashboard disk-cache write at `server.ts:3094`) can start a 3.4 GB copy, which evicts the OS page cache and competes for disk with the very reads the dashboard needs. A raw file copy of a live WAL database also ignores `-wal` content, so the backup is not guaranteed consistent.

```ts
// Replace the per-write trigger with a scheduled, consistent, off-peak snapshot
// database.ts: delete the createPersistentBackup() call inside dbRun (line ~3553)
// server.ts: schedule it instead
setInterval(() => backupNow().catch(log.warn), 6 * 60 * 60 * 1000);   // every 6h, not every write
async function backupNow() {
  if (isBackupInProgress) return; isBackupInProgress = true;
  try { await dbRunOn(writeDb, `VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);   // consistent snapshot
        await fs.promises.rename(tmpPath, PERSISTENT_BACKUP_PATH); }
  finally { isBackupInProgress = false; }
}
// Better: use sqlite3's online backup API (better-sqlite3 db.backup()) and keep 3 rotating copies.
```

### B3 — `buildDashboardPayload`: about 25 serial awaits and unfiltered full-table reads (critical)

`server.ts:2313–3272` (959 lines). Observed queries on the cold path:

| Line (relative to function) | Query | Problem |
|---|---|---|
| 269 | `SELECT … SUM(realized_pnl) … FROM RealizedGains GROUP BY portfolio, isin, symbol` | no WHERE: aggregates the whole table on every cold load |
| 86 | `SELECT symbol FROM Transactions …` | pulls every symbol row just to find sold ones |
| 146 | `… WHERE net_amount != 0 AND symbol IN (…) ORDER BY date` | sort + table lookups |
| 326 | `allTxnsForAssetXirr` | all transactions into JS memory for XIRR |
| 327 | `SELECT * FROM CustomScripMappings` | unfiltered `SELECT *` (also read on every call) |
| 566, 586 | `UPPER(type) IN (…)` | function on column defeats the index on `type` |
| 96 | `symbol IN (…) OR isin IN (…)` | OR across two columns |

Everything runs one after another (`await` chain) through one connection, so latency is the sum of all parts. The frontend then fires a second wave (`/api/dashboard/xirr` and `/api/growth-history`, `App.tsx:594`) that waits behind it.

```ts
// 1. Independent reads in parallel (needs the read pool from B1 to actually overlap)
const [fxRates, rawHoldings, realizedRows, customMaps] = await Promise.all([
  BankAndFDService.getInstance().getCurrencyRates(),
  dbAll(rdb, holdingsQuery, params),
  dbAll(rdb, REALIZED_BY_PORT_SQL, selectedParams),      // add WHERE portfolio IN (...) — never whole-table
  getCustomMappingsCached(),                             // 10-min memo, invalidated on mapping write
]);

// 2. Precompute realized totals at FIFO time instead of aggregating at read time
//    (FIFO already writes RealizedGains; add a RealizedSummary(portfolio,isin,symbol,pnl,proceeds) upsert there)

// 3. Aggregate in SQL, not JS: replace "load all transactions then bucket in JS" with a per-portfolio cashflow
//    query, or persist cashflow rows per (portfolio,date) in PortfolioHistory (already exists) and read those.
```

### B2 — Cache invalidation is too coarse, so the next load is a cold compute (high)

`server.ts:2239–2253`: `registerFifoCompletedCallback(() => invalidateAllCaches())` clears every dashboard key (all members and all portfolio selections) **and** runs `DELETE FROM DashboardDiskCache`. After any import, edit or FIFO run, the next page open computes from scratch (B3). Separately, a disk-cache hit is stored with `ts: 0` (`:2294`), so every first hit after a restart also queues a full recompute behind the user's own requests.

```ts
// A. Invalidate only the affected portfolios, and keep serving stale while recomputing
function invalidateDashboardFor(portfolios: string[]) {
  for (const k of dashboardResponseCache.keys())
    if (portfolios.some(p => k.includes(p)) || k.includes('__all__')) dashboardResponseCache.get(k)!.ts = 0; // mark stale, keep data
  // do NOT delete DashboardDiskCache; let the background refresh overwrite it
}
// B. Store the real timestamp on disk hits (updated_at) so a fresh disk entry does not trigger a recompute
const ts = Date.parse(diskRow.updated_at + 'Z') || 0;
dashboardResponseCache.set(key, { data: diskData, ts });
// C. Coalesce concurrent recomputes (already partly done by dashboardRevalidating); do the same on the cold path
const inflight = new Map<string, Promise<any>>();
const payload = await (inflight.get(key) ?? inflight.set(key, buildDashboardPayload(...).finally(() => inflight.delete(key))).get(key)!);
```

### B4 — No statistics and an over-indexed 3.4 GB file (critical, cheap to fix)

- `grep` for `ANALYZE`, `PRAGMA optimize`, `sqlite_stat` in `server.ts`, `database.ts` and `routes/` finds nothing, so `sqlite_stat1` is probably empty. With 159 overlapping indexes on `Transactions` (17), `Holdings` (10), `MasterTickers` (8) and others, the planner picks by heuristics and can choose the wrong index.
- `schema.sql` shows 14 exact-duplicate and 22 left-prefix-redundant indexes. `HistoricalPrices` (about 5M rows per `CLAUDE.md`) has **three identical `(symbol, date)` indexes plus a fourth `(symbol, date DESC)`**. Each duplicate adds a write per insert and its own on-disk copy, which is a likely contributor to the 3.4 GB size and to cache pressure.
- 14 low-cardinality single-column indexes (`type`, `source`, `is_cash_flow`, `data_status`, `holding_type`, `price_authority`, `exchange`, `applied`, …) that the planner rarely uses.
- Pragmas are set in two places (`getDB` and the `ENABLE_STARTUP_DB_MUTATIONS` block). `mmap_size` is applied only in the mutation block (`server.ts:16930`), so the default read-only runtime runs without it.

Full index plan: `index_migration_PROPOSED.sql`. Summary below.

### B5 — Per-row awaited writes without a transaction (high)

34 loops in `server.ts` do `for (…) { await dbRun(…) }` (lines 680, 10371, 10733, 11336, 11588, 13481, 16012, 16472, 16518, 17057, …). Each is its own WAL commit, and each success also hits `createPersistentBackup()` (B7). Wrap each loop in `BEGIN … COMMIT` with a prepared statement.

```ts
export async function withTx<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  return dbMutex.run(async () => {
    await dbRun(db, 'BEGIN IMMEDIATE');
    try { const r = await fn(); await dbRun(db, 'COMMIT'); return r; }
    catch (e) { await dbRun(db, 'ROLLBACK').catch(() => {}); throw e; }
  });
}
// usage at server.ts:16472
await withTx(db, async () => { const st = db.prepare(INSERT_SQL); for (const t of txns) st.run(t); st.finalize(); });
```

### B6 — Frontend render cost after data arrives (medium)

`OpportunityEngineMasterView.tsx` is a 9.6k-line component with 89 `useState` and one `useMemo`; `DashboardView.tsx` has 251 inline style objects; `App.tsx` makes 23 raw `fetch` calls and polls every 60 s (`App.tsx:691`). Patterns and stubs are in the previous review (sections 5.1–5.3): TanStack Query with `staleTime`, per-tab lazy split, zustand slices, `React.memo` rows, virtualised tables, React Compiler, and replacing polling with Server-Sent Events.

### B8 — Structure (medium)

God files (`server.ts`, `infra.ts`) and the `database → xirr → fifoEngine → database` import cycle slow every change and can cause load-order bugs. Break the cycle by moving the shared DB helper types and `runFIFO` callback registration into a leaf module (`db/types.ts`) that neither imports.

## 3. Index audit (from `schema.sql`; 167 tables, 159 indexes)

**Exact duplicates (14), same table and columns:**

| Table | Duplicate set | Keep |
|---|---|---|
| HistoricalPrices | `idx_hist_prices_sym_date`, `idx_hist_symbol`, `idx_historical_prices_sym_date` (+ a DESC variant) | `idx_hist_prices_sym_date` |
| Transactions | `idx_tx_symbol` / `idx_txns_symbol`; `idx_txn_port_isin_date` / `idx_txns_port_isin_date` | one of each |
| MasterTickers | `idx_master_isin` / `idx_mt_isin`; `idx_master_symbol` / `idx_mt_symbol` | `idx_master_*` |
| CorporateActions | `idx_ca_isin_date` / `idx_ca_isin_recdate` | `idx_ca_isin_date` |
| RealizedGains | `idx_realized_gains_isin` / `idx_rg_isin` | first |
| DailyOHLCV | `idx_daily_ohlcv_sym` / `idx_daily_ohlcv_sym_date` | first |
| DataQualityAuditLedger, DataSyncDriftLedger | two pairs each | first |

**Left-prefix redundant (22), narrower index fully covered by a wider one:** e.g. `Transactions(portfolio)` covered by `(portfolio, date)`, `(portfolio, isin, date)` and `(portfolio, symbol, date)`; `Holdings(portfolio)` covered by three composites; `Transactions(isin)` by `(isin, portfolio)`; `MasterTickers(isin)` by `(isin, symbol)`. Full list in the SQL file.

**To add (hot-path targeted):**
1. Covering index `RealizedGains(portfolio, isin, symbol, realized_pnl, sell_proceeds)` for the dashboard's whole-table GROUP BY (B3).
2. `Transactions(symbol, date, portfolio, type, net_amount)` so `symbol IN (…) ORDER BY date` avoids a sort and row lookups.
3. Either normalise `Transactions.type` on write (the repo already has `normalize_tx_types.cjs`) or add `Transactions(UPPER(type), portfolio)`; 29 query sites wrap columns in `UPPER(...)` and 34 use `LIKE '%…'` (leading wildcard, cannot use an index; consider FTS5 for symbol and name search).
4. Partial indexes replacing low-cardinality ones: `Transactions(portfolio, date) WHERE is_cash_flow = 1`, `CorporateActions(symbol, record_date) WHERE applied = 0`.
5. `ANALYZE` (with `PRAGMA analysis_limit=1000`) once, `PRAGMA optimize` on open and on shutdown.
6. Query rewrite for the holdings join: `LEFT JOIN MasterTickers M ON M.isin = NULLIF(H.isin,'')` instead of `H.isin IS NOT NULL AND H.isin != '' AND M.isin = H.isin`.

**Caveats:** `schema.sql` is a dump from 2026-09-25 and may differ from the live DB; the startup block in `server.ts:16780` also creates indexes with other names (`idx_txn_portfolio`, `idx_holdings_port`, …), so duplicates can also arise at runtime. Compare against `SELECT name, sql FROM sqlite_master WHERE type='index'` on the live file. Some "redundant" indexes may exist for `ORDER BY` or covering reasons; check plans before dropping.

## 4. Quick wins in order (lowest risk first)

1. Run `ANALYZE` + `PRAGMA optimize` (B4). No code change; test on a copy.
2. Remove the per-write `createPersistentBackup()` call and schedule a `VACUUM INTO` snapshot (B7).
3. Drop the exact-duplicate indexes (section A of the SQL file) and apply `mmap_size` and `cache_size` in `getDB()` for all modes.
4. Fix the cache: real timestamp on disk hits, per-portfolio stale-mark instead of delete-all (B2).
5. Wrap the 34 write loops in transactions (B5).
6. Add a read-only connection pool and run the heavy dashboard reads on it in parallel (B1, B3).
7. Precompute realized-gain summaries at FIFO time; add the covering indexes (B3, section 3).
8. Frontend: query layer, lazy tabs, memoisation (B6); break the import cycle and split the god files (B8).

## 5. Timing middleware to find the real numbers (guard against regressions)

```ts
// src/server/middleware/timing.ts (NEW) — logs slow routes and SQL, from the observability-and-instrumentation skill
export const timing = (req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > 300) console.warn(`[slow] ${req.method} ${req.originalUrl} ${ms.toFixed(0)}ms`);
  });
  next();
};
// database.ts: wrap dbAll/dbGet/dbRun
const t = performance.now(); const r = await inner(); const d = performance.now() - t;
if (d > 100) console.warn(`[slow-sql ${d.toFixed(0)}ms]`, sql.replace(/\s+/g, ' ').slice(0, 160));
```

## 6. Verification checklist for the reviewer

1. Run `diagnose_db.sql` on a copy: confirm `sqlite_stat1` is empty, list the top 20 tables and indexes by size, confirm `HistoricalPrices` index sizes.
2. Capture before numbers: cold `GET /api/dashboard` (restart server, clear `DashboardDiskCache`), warm hit, `/api/dashboard/xirr`, `/api/growth-history`; DevTools "Time to first dashboard paint".
3. Apply the proposed index SQL to the copy, re-run `ANALYZE`, re-run the four `EXPLAIN QUERY PLAN` statements, and compare (`SCAN` → `SEARCH`, no `USE TEMP B-TREE`).
4. Golden-master test `buildDashboardPayload` and FIFO/XIRR output before changing queries; numbers must be identical.
5. Confirm the graphify parse error at `OpportunityEngineMasterView.tsx:2168` with `tsc --noEmit`.
6. Sample the ~120 services and ~85 components not in the graph for the same patterns (`grep -rn "for (.*) {" -A3 | grep await db`, `UPPER(`, `SELECT \*`).

## 7. Assumptions and unknowns

- Row counts, table sizes and real query timings are unknown (section 6 gets them).
- Whether `ENABLE_STARTUP_DB_MUTATIONS` is set in the user's launch scripts (`run_wealthos.bat`, `start_wealthos.vbs`) was not checked; it changes which pragmas and index creation run at boot.
- The `CLAUDE.md` says the DB is about 1.3 GB; the file on disk is 3.4 GB, which supports the index-bloat suspicion but does not prove it.
- The Electron/Capacitor packaging and `intraday_history.db` (8.8 GB) usage paths were not analysed.
