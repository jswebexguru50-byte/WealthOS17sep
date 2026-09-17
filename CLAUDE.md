# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**NRI WealthOS** is a sophisticated portfolio tracking and trading intelligence platform designed for NRI (Non-Resident Indian) family offices. It combines institutional-grade portfolio reconciliation, technical analysis, backtesting, autonomous trading signals, and tax optimization into a single offline-capable desktop/web application.

**Key characteristics:**
- Full-stack monolith (Express backend + React frontend, TypeScript throughout)
- SQLite3 with WAL mode for persistence; database ~1.3 GB with 100+ tables
- Real-time WebSocket streaming for market data
- Complex financial domain logic (FIFO matching, tax calculations, regime-based backtesting)
- Multiple broker integrations (Zerodha, PMS systems, CAMS mutual funds)
- Autonomous agent system for trading signal generation and self-learning

---

## Quick Start Commands

### Development

```bash
# Install dependencies (one time)
npm install

# Run in dev mode (hot reload, http://localhost:5173)
npm run dev

# Type check (no emit; catch errors fast)
npm run lint

# Build frontend + backend to dist/
npm run build

# Run production server
npm start
```

### Testing

```bash
# Run all test suites (unit + integration + negative + performance + e2e)
npm run test:full

# Unit tests only (fast; ~5-10s)
npm run test:unit

# Integration tests only (~20-30s)
npm run test:integration

# Negative/fault injection tests
npm run test:negative

# Performance stress tests
npm run test:performance

# E2E autonomous system test
npm run test:e2e

# Fast path: unit + integration (skip slow tests)
wealthos:test:fast
```

### Database

- **Location:** `portfolio.db` (SQLite3 in WAL mode)
- **Backups:** `portfolio_persistent_backup.db` (created every 10 min), point-in-time snapshots in root
- **Schema migrations:** Run automatically on startup; tracked in `db_migrations` table
- **Inspect DB:** Use any SQLite3 client pointing to `portfolio.db`; 100+ tables, largest are:
  - `Transactions` (~500K rows)
  - `HistoricalPrices` (~5M rows; trimmed to 5 years per migration v6)
  - `Holdings`, `PortfolioHistory`, `RealizedGains`

### Standalone Scripts

One-off analysis scripts live in root as `.cjs` files (executed with `node script.cjs`):
- `audit_cc9.cjs` — Reconciliation audit for cc9 portfolio
- `apply_*.cjs` — Data cleaning/import scripts
- `aggregate_reconciliation.cjs` — Portfolio-wide reconciliation summary

---

## Architecture at a Glance

### Backend (Express + TypeScript)

**Entry point:** `server.ts` (17,095 lines; compiled to `dist/server.cjs`)

```
server.ts (main)
  ├── src/server/database.ts
  │   ├── SQLite3 connection pooling (singleton pattern via dbInstance)
  │   ├── Schema migration system (versioned)
  │   ├── Helper functions: dbRun, dbAll, dbGet (async wrappers)
  │   └── Auto-recovery on corruption
  │
  ├── src/server/routes/ (16 files, 16 Express routers mounted)
  │   ├── portfolios.ts — Portfolio CRUD, rename, archiving
  │   ├── transactions.ts — Transaction import, edit, delete
  │   ├── reports.ts — Tax reports, Schedule 112A, dossier generation
  │   ├── regimeBacktest.ts — Multi-strategy backtesting engine
  │   ├── zerodha.ts — Live holdings sync, tradebook download
  │   ├── nri.ts — NRI tax deduction, FEMA reporting
  │   ├── settings.ts — App settings, portfolio mappings, tier definitions
  │   ├── system.ts — Health checks, data export, cleanup tasks
  │   ├── shared.ts — Shared helpers (PARAM_METADATA, strategy catalog)
  │   ├── commandCenter.ts — Autonomous agent control, strategy calibration
  │   ├── infra.ts — Infrastructure & market data endpoints
  │   ├── imports.ts — File upload, CSV parsing, batch import
  │   ├── bankFds.ts — Bank accounts & fixed deposits CRUD
  │   ├── reconciliationAudit.ts — Multi-broker holdings reconciliation
  │   ├── knowledgeIntelligence.ts — News, fundamentals, scrip dossiers
  │   └── bedrock.ts — AWS Bedrock LLM integration
  │
  ├── src/server/services/ (87 files, ~40K lines)
  │   ├── Core Portfolio Engines
  │   │   ├── FIFOEngine (fifoEngine.ts in root) — FIFO lot matching, cost tracking
  │   │   ├── UnifiedValuationService — Holdings aggregation & valuation
  │   │   ├── NriWealthService — NRI-specific tax calculations
  │   │   ├── RebalancingEngine — Portfolio rebalancing optimizer
  │   │   └── TaxHarvestingEngine — Tax-loss harvesting suggestions
  │   │
  │   ├── Market Data & Technical Analysis
  │   │   ├── LiveMarketStreamService — WebSocket stream of OHLC/indices
  │   │   ├── TechnicalAnalysisEngine — Core technical indicators (RSI, EMA, etc.)
  │   │   ├── TechnicalMomentumEngine — Momentum-based strategies
  │   │   ├── MomentumVpaEngine — Volume Price Action signals
  │   │   ├── SmartMoneyConceptsEngine — Institutional footprint analysis
  │   │   ├── SupportResistanceEngine — S/R level calculation
  │   │   └── RegimeBacktestEngine — Multi-regime strategy backtesting (750 stocks × 3 regimes)
  │   │
  │   ├── Opportunity & Intelligence Engines
  │   │   ├── OpportunityEnginePhase4to6 — Multibagger discovery (Phase 4, 5, 6 pillars)
  │   │   ├── ConsolidatedOpportunityEngine — Master convergence score
  │   │   ├── InstitutionalDossierReportGenerator — Tier-based intelligence reports
  │   │   ├── ScripIntelligenceDossierService — Per-stock comprehensive dossier
  │   │   ├── SmartMoneyFlowEngine — FII/DII/promoter flow analysis
  │   │   ├── InstitutionalBuyersService — Institutional accumulation patterns
  │   │   ├── MultibaggerDiscoveryEngine — High-conviction opportunity radar
  │   │   └── IpoAnalysisEngine — IPO pipeline & performance
  │   │
  │   ├── Autonomous Agents & Learning
  │   │   ├── AutonomousSmartMoneyAgent — Background daemon for signal generation
  │   │   ├── AutonomousSelfLearningService — Self-mutating strategy parameters
  │   │   ├── SignalEngine — Signal orchestration & execution
  │   │   ├── RecommendationOutcomeAuditor — Backtest vs. live comparison
  │   │   ├── CausalPostMortemService — Root cause analysis on failed trades
  │   │   └── PaperTradingPotService — Sandbox trading for validation
  │   │
  │   ├── Reconciliation & Audit
  │   │   ├── MultiBrokerReconService — Multi-source holdings matching
  │   │   ├── PmsReconciliationService — PMS statement parsing & reconciliation
  │   │   ├── ZerodhaConsoleDownloader — Zerodha holding export downloader
  │   │   ├── ZerodhaHoldingsSync — Auto-sync from Zerodha API
  │   │   ├── TransactionDeduplicationService — Duplicate detection & merging
  │   │   └── CorporateActionsEngine — Splits, mergers, bonus adjustments
  │   │
  │   ├── Data & Parsing
  │   │   ├── MasterTickerService — Symbol resolution & metadata
  │   │   ├── AssetScripMappingService — Broker symbol → canonical symbol
  │   │   ├── ImportParserService — Generic CSV/Excel parser
  │   │   └── FundamentalDataService — Earnings, balance sheet, ratios
  │   │
  │   └── Support Services
  │       ├── MarketDataCache — OHLC caching & updates
  │       ├── FamilyBenchmarkService — Multi-portfolio benchmarking
  │       ├── RealTimeEventStreamService — Real-time notifications
  │       ├── ReportsService — PDF generation, Excel exports
  │       ├── CommercialExcelReportService — Institutional-grade reports
  │       └── LiveMarketStreamService (repeated; core to all real-time)
  │
  ├── src/server/fifoEngine.ts
  │   └── FIFO lot matching, cost basis calculation, grandfathered cost (31-Jan-2018)
  │
  ├── src/server/xirr.ts
  │   └── XIRR calculation (returns.js-based), used in PortfolioHistory
  │
  ├── src/server/pmsParser.ts
  │   └── PMS statement CSV parsers (CC Bank, IIFL Trade Register, etc.)
  │
  └── src/server/{camsParser,tenantScoper,refreshState,webPriceMatcher}.ts
      └── Specialized parsers and helpers
```

**Key patterns:**
- **Database layer (database.ts):** Singleton `dbInstance`, all DB calls go through `dbAll(db, sql, params)` / `dbRun()` / `dbGet()` for consistent error handling and promise wrapping
- **Routes:** Each route file is an Express Router, mounted in server.ts; routes call services, not DB directly (except rare cases where performance matters)
- **Services:** Stateless business logic; instantiate via `getInstance()` singleton pattern or direct `new Service(db)`; most take `db` as first param
- **Error handling:** Try-catch in routes with 500 responses; services throw descriptive errors that routes catch and return to client
- **Concurrency:** `runInDbLock()` utility prevents concurrent transaction state; most operations are asynchronous

### Frontend (React + TypeScript + Tailwind)

**Entry point:** `src/main.tsx` → `src/App.tsx` (not present in preview; likely a barrel export)

```
src/
  ├── components/ (72 files; ~40K lines total)
  │   ├── Core Views (master dashboard / hubs)
  │   │   ├── DashboardView.tsx — Main portfolio overview
  │   │   ├── OpportunityEngineMasterView.tsx — 750+ stock opportunity radar
  │   │   ├── FamilyOfficeCommandCenter.tsx — Multi-user orchestration
  │   │   ├── PortfolioHubView.tsx — Portfolio drill-down
  │   │   └── LedgerHubView.tsx — Detailed ledger browser
  │   │
  │   ├── Analysis & Strategy Views
  │   │   ├── IndependentTechnicalStrategiesView.tsx — 10-strategy comparison (S1–S10)
  │   │   ├── RegimeBacktestComparisonView.tsx — Multi-regime backtest results (750 stocks × 3)
  │   │   ├── StrategyParameterEditorView.tsx — Custom strategy builder UI
  │   │   ├── SmartMoneyMomentumVpaView.tsx — VPA/momentum signals
  │   │   ├── SupportResistanceEngine.tsx — S/R visualization
  │   │   ├── MultibaggerScreenerView.tsx — High-conviction screener
  │   │   ├── ScripIntelligencePortal.tsx — Per-stock deep dossier
  │   │   └── ExecutiveConsensusView.tsx — Multi-pillar convergence
  │   │
  │   ├── Portfolio Management
  │   │   ├── PortfolioManagerView.tsx — Add/edit/delete portfolios
  │   │   ├── TransactionsView.tsx — Transaction CRUD, bulk import
  │   │   ├── HoldingsView.tsx (implicit) — Holdings display
  │   │   ├── ReconciliationView.tsx — Holdings vs. statement matching
  │   │   ├── CorporateActionsView.tsx — Stock splits, dividends
  │   │   └── TaxView.tsx — Tax reporting & harvesting
  │   │
  │   ├── Integrations & Imports
  │   │   ├── ImportsHubView.tsx — CSV/Excel upload orchestration
  │   │   ├── BulkImportView.tsx — Batch transaction import
  │   │   ├── PMSImportView.tsx — PMS statement import
  │   │   ├── CamsMutualFundsView.tsx — CAMS holdings import
  │   │   ├── ZerodhaImportView.tsx (implicit) — Zerodha tradebook
  │   │   └── MFCasAutoSyncModal.tsx — CAMS auto-sync
  │   │
  │   ├── Autonomous Agent UIs
  │   │   ├── AutonomousSmartMoneySentinelView.tsx — Agent control panel
  │   │   ├── PaperTradingView.tsx (implicit) — Paper trading pot dashboard
  │   │   └── CommandCenterRightDrawer.tsx — Real-time signal feed
  │   │
  │   ├── NRI & Tax
  │   │   ├── NriTaxRepatriationHub.tsx — FEMA tracking, Schedule 112A
  │   │   ├── Schedule112AReportModal.tsx — Tax form generation
  │   │   └── TaxHarvestingEngine (implied) — Tax-loss suggestions
  │   │
  │   ├── Reporting & Export
  │   │   ├── ReportStudioView.tsx — Custom report builder
  │   │   ├── ReportsEngineModal.tsx — Pre-built report picker
  │   │   └── CommercialExcelReportService → ReportGeneratorUI
  │   │
  │   ├── Lower-level Components
  │   │   ├── ResizableDataTable.tsx — Reusable table with sorting/filtering
  │   │   ├── MultiPortfolioSelect.tsx — Portfolio multi-select
  │   │   ├── PortfolioSelector.tsx — Single portfolio dropdown
  │   │   ├── FamilyMemberSwitcher.tsx — User context switch
  │   │   ├── StockDrilldown.tsx — Modal stock detail view
  │   │   ├── MiniChartThumbnail.tsx — Small OHLC sparkline
  │   │   ├── TradingViewChartWidget.tsx — Chart embedding
  │   │   └── ErrorBoundary.tsx — React error boundary
  │   │
  │   └── Modals & Settings
  │       ├── PreferencesModal.tsx — User settings
  │       ├── ThemeSelectorModal.tsx — Dark/light theme picker
  │       ├── ConfirmationModal.tsx — Generic confirm dialog
  │       ├── GoogleAuthModal.tsx — OAuth flow
  │       ├── RiskAnalyticsModal.tsx — Risk dashboard popup
  │       ├── SmartAlertsModal.tsx — Alert configuration
  │       └── PerformanceSnapshotModal.tsx — Performance snapshot
  │
  ├── lib/ (9 utility files)
  │   ├── api.ts — Fetch wrapper + endpoints catalog
  │   ├── convictionEngine.ts — Multi-pillar convergence scoring (frontend)
  │   ├── csvExport.ts — Download CSV helper
  │   ├── formatters.ts — Currency, date, number formatting
  │   ├── decimalUtils.ts — Big-decimal arithmetic (Decimal.js)
  │   ├── preferences.ts — localStorage for client settings
  │   ├── tradingCalendar.ts — Holiday/market-closed detection
  │   ├── infraServices.ts — Infrastructure health checks
  │   └── driveExport.ts — Google Drive export
  │
  ├── types/ (3 files)
  │   ├── scripMapping.ts — ScripMapping interface
  │   ├── familyBenchmarks.ts — Benchmark types
  │   └── brokerTemplates.ts — Broker-specific field mapping
  │
  ├── types.ts — Global types (Portfolio, Holding, Transaction, etc.)
  ├── theme.ts — Tailwind theme config
  ├── index.css — Global styles + Tailwind
  └── main.tsx — React root
```

**Key patterns:**
- **State management:** React hooks (useState, useEffect, useCallback); no Redux/Zustand (kept simple)
- **Data fetching:** Custom `fetch()` wrapper in `lib/api.ts`; no automatic caching (services do it server-side)
- **Styling:** Tailwind CSS + motion for animations; theme system in localStorage
- **Complex UI:** ResizableDataTable (sorting, pagination), modals (controlled), tabs (simple state)
- **Performance:** Lazy load heavy components (charts, large lists); memoize expensive renders

### Database Schema (SQLite3)

**Key tables:**
- **Portfolios** — Portfolio metadata (name, benchmark_symbol, type, status)
- **Holdings** — Current positions (portfolio, symbol, isin, quantity, avg_buy_price, ltp, unrealized_pnl)
- **Transactions** — Historical transactions (date, type, symbol, qty, price, net_amount, source, batch_id)
- **HistoricalPrices** — OHLCV candles (symbol, date, close_price) – trimmed to 5 years
- **RealizedGains** — Closed positions with tax category (STCG/LTCG), holding_days, taxable_pnl
- **TaxSummary** — Annual tax breakdown (FY, portfolio, stcg_gains, ltcg_gains, ltcg_tax)
- **MasterTickers** — Symbol registry (isin, symbol, name, sector, exchange, fmv_31_jan_2018)
- **PortfolioHistory** — Daily portfolio snapshots (date, portfolio, cumulative_invested, market_value, xirr)
- **CorporateActions** — Stock splits, dividends (symbol, record_date, action_type, details)
- **CamsConfigurations** + **CamsSummaryHoldings** — CAMS mutual fund tracking
- **ZerodhaHoldings** — Latest synced holdings from Zerodha
- **Regime Backtest Tables**
  - `regime_backtest_trades` — Individual trade-level results (symbol, regime, strategy, entry_date, exit_date, return_pct, holding_days)
  - `regime_backtest_summaries` — Aggregated stats (regime, strategy, win_rate, profit_factor, sharpe_ratio)
  - `regime_backtest_full_matrix` — Full ledger (750 × 3 = 2250 rows, each stock × regime with S1–S4 columns)
- **Custom Strategies** — User-defined strategy presets (name, parameters_json, is_active)
- **Strategy Logs & Audit** — Autonomous execution history, signal generation, outcomes

**Migrations:** Tracked in `db_migrations` table; new migrations added as versioned blocks in database.ts initialization

---

## Common Development Tasks

### Adding a New API Endpoint

1. **Create or extend a route file** in `src/server/routes/`:
   ```typescript
   router.post('/api/my-endpoint', async (req, res) => {
     try {
       const db = getDB();
       const { param1 } = req.body;
       const result = await myService.doSomething(db, param1);
       res.json({ success: true, data: result });
     } catch (err: any) {
       res.status(500).json({ success: false, message: err.message });
     }
   });
   ```

2. **Mount in server.ts** (search for `app.use('/api')`):
   ```typescript
   import { router as myRouter } from './src/server/routes/myRoute.js';
   app.use('/api', myRouter);
   ```

3. **Call from frontend** using `lib/api.ts`:
   ```typescript
   const response = await fetch('/api/my-endpoint', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ param1: 'value' })
   });
   ```

### Adding a Database Migration

1. In `src/server/database.ts`, extend `SCHEMA_MIGRATIONS` array:
   ```typescript
   {
     version: 9,
     name: 'add_new_column',
     sqls: ['ALTER TABLE MyTable ADD COLUMN newCol TEXT DEFAULT NULL']
   }
   ```

2. Restart server; migration runs once and is tracked in `db_migrations`.

3. For larger changes, create helper functions and call them from `runSchemaInitialization()`.

### Adding a New Service

1. **Create file** `src/server/services/MyService.ts`:
   ```typescript
   import { Database } from 'sqlite3';

   export class MyService {
     private static instance: MyService;

     static getInstance(): MyService {
       if (!MyService.instance) {
         MyService.instance = new MyService();
       }
       return MyService.instance;
     }

     async doSomething(db: Database, input: string): Promise<Result> {
       // business logic
     }
   }
   ```

2. **Use in routes**:
   ```typescript
   const result = await MyService.getInstance().doSomething(db, input);
   ```

### Adding a React Component

1. **Create file** `src/components/MyComponentView.tsx` (use `.tsx` extension):
   ```typescript
   import React, { useState, useEffect } from 'react';

   export function MyComponentView() {
     const [data, setData] = useState<any[]>([]);

     useEffect(() => {
       fetch('/api/my-endpoint').then(r => r.json()).then(j => setData(j.data));
     }, []);

     return <div>{/* render */}</div>;
   }

   export default MyComponentView;
   ```

2. **Add to App.tsx routing** (implicit or explicit router).

### Running Specific Tests

```bash
# Single test file (e.g., unit test)
npm run test:unit -- path/to/test.test.ts

# Watch mode for TDD
npm run test:unit -- --watch

# With coverage
npm run test:unit -- --coverage

# E2E specific scenario
npm run test:e2e -- --grep "scenario name"
```

### Performance Debugging

1. **Slow queries:** Check `PortfolioHistory` table size; if >1M rows, queries degrade. Consider archiving old dates.
2. **WAL checkpoint:** If `.db-wal` file grows >100 MB, database startup slows. Runs automatically every 30 min; can force with `PRAGMA wal_checkpoint(PASSIVE)`.
3. **UI lag:** Profile React renders in DevTools; ResizableDataTable can cause lag with >10K rows. Implement virtual scrolling if needed.
4. **WebSocket lag:** LiveMarketStreamService broadcasts to all connected clients; if >1K symbols, consider batching or sampling.

---

## Deployment & Running

### Local Development

```bash
npm run dev
# Starts Vite at http://localhost:5173 with hot reload
# Backend runs via tsx (TS transpilation)
# DB at portfolio.db
```

### Production Build & Run

```bash
npm run build
# Outputs:
#   dist/index.html (React SPA)
#   dist/server.cjs (bundled, 3 MB)
#   dist/** (static assets)

npm start
# Runs node dist/server.cjs
# Serves SPA + API at http://localhost:3000
# DB at portfolio.db
```

### Electron Desktop App (Windows)

```bash
npm run electron:build
# Builds .exe installer in dist_electron/
# Bundles server.cjs + SPA + Electron runtime
```

### Docker (if needed; Dockerfile not present but conceivable)

```bash
# Hypothetical; would need:
FROM node:20
COPY . /app
WORKDIR /app
RUN npm install && npm run build
CMD npm start
# Serves at :3000, mounts /app/portfolio.db as volume
```

---

## Key Gotchas & Constraints

### Database

1. **SQLite is single-writer:** All DB ops are async but serialized internally. Multiple `getDB()` calls return the same singleton. Use `runInDbLock()` for transaction state.
2. **WAL mode:** Enabled by default. Prevents `database is locked` errors. Three files: `portfolio.db`, `portfolio.db-wal`, `portfolio.db-shm`. Never delete WAL files without closing DB first.
3. **Large backups:** Every 10 minutes, the full 1.3 GB DB is copied to `portfolio_persistent_backup.db`. If this hangs, check disk space and I/O.
4. **Integrity check:** Disabled on startup (via `skipIntegrityCheck=true` in recent fix) to prevent 3+ minute hangs on cold start. Only runs if corruption is detected.

### Performance Critical Paths

1. **PortfolioHistory XIRR calculation:** Runs on every portfolio view. If >10K transactions, cache the result for 5–10 minutes.
2. **Opportunity engine convergence scoring:** Evaluates 750 stocks × 10 pillars every time OpportunityEngineMasterView loads. First run takes 10–15s; subsequent runs cached in DashboardDiskCache.
3. **RegimeBacktest:** Backtests 750 stocks × 3 regimes × 4 strategies = 9K scenarios. Takes 2–5 minutes; results cached in regime_backtest_full_matrix table.

### Frontend State

1. **No Redux:** Uses React hooks directly. If complex global state needed, consider adding Zustand or Context API.
2. **Theme persistence:** Stored in localStorage; applied before first render to prevent flash.
3. **Modals:** Controlled via state; only one modal active at a time (convention).

### TypeScript

1. **Module resolution:** Configured with `moduleResolution: "bundler"` in tsconfig.json. Allows `import { x } from './y.js'` (explicit .js extension required in ESM).
2. **Vite aliases:** `@/*` resolves to root; rarely used, prefer relative imports.
3. **Loose types:** Some files use `any` types; acceptable for rapid iteration but prefer `unknown` or specific types for new code.

### Compatibility

1. **Node version:** ^20 (required for native SQLite3 binding and top-level await).
2. **SQLite3 npm package version:** Pinned to 5.1.7; do not auto-upgrade without testing. Native bindings may break.
3. **React version:** ^19; uses new JSX transform (no `import React` needed).

---

## Code Style & Conventions

1. **Naming:**
   - Services: `PascalCase` + `Service` suffix (e.g., `TechnicalAnalysisService`)
   - Routes: lowercase with `Router` variable (e.g., `const router = Router()`)
   - Components: `PascalCase` + `View` suffix (e.g., `PortfolioHubView`)
   - Database helpers: camelCase (e.g., `dbAll`, `dbRun`)

2. **Error handling:**
   - Routes: return JSON with `{ success: boolean, message, data }` shape
   - Services: throw descriptive errors; include context (e.g., `throw new Error("Symbol INVALID not found in MasterTickers")`)
   - Frontend: show toast/modal with error.message

3. **Comments:**
   - Avoid obvious comments ("Get DB instance")
   - Explain *why*, not *what* (e.g., "PRAGMA quick_check instead of full integrity_check to avoid 3+ min startup hang")
   - Mark workarounds: `// TODO`, `// BUG:`, `// HACK:` with issue context

4. **Testing:**
   - Unit: isolated services with mocked DB
   - Integration: real DB, multiple services interacting
   - E2E: full app start-to-finish
   - Negative: fault injection (e.g., corrupt DB, missing files)

---

## Important Recent Fixes (Last Session)

### Database Startup Performance (Critical)

Three fixes applied to prevent 3+ minute HTTP hangs on cold start:

1. **Removed `db.serialize()` wrapper in `getDB()`** — SQLite driver already serializes ops on a single connection. Wrapper was redundant and added overhead.
   - File: `src/server/database.ts:138–148`

2. **Skip full `PRAGMA integrity_check` on startup** — Full integrity check reads every b-tree page of the 1.3 GB DB (3+ min). Now skips on normal startup; uses faster `PRAGMA quick_check` only if corruption suspected.
   - File: `src/server/database.ts:358–385`; call `initializeDatabase(db, true)` to skip
   - File: `server.ts:16851`

3. **WAL auto-checkpoint every 30 minutes** — Prevents WAL file from growing to 100+ MB, which adds minutes to startup WAL replay.
   - File: `server.ts:16894–16902` (already present)

**Result:** Server is ready for HTTP in <5 seconds (was 3–10 minutes).

### Multiple Issues Fixed

See "Issues Fixed" section above (database query optimization, session-level integrity checks, etc.).

---

## Roadmap & Active Work

### Current Initiative: Multi-Strategy Comparison & Backtesting Upgrade

**Phases:**
1. **Data Layer (Phase 1)** — Make `custom_strategies` the canonical store for all 10 built-in strategies + user-created variants
2. **Backend Engines (Phase 4)** — Extend RegimeBacktestEngine to run any set of strategies, remove hardcoded "750" references
3. **Frontend ITAS (Phase 2)** — Three-panel layout: strategy selector, parameter builder, results comparison
4. **Frontend Backtest (Phase 3)** — Multi-strategy selection, dynamic result columns, per-strategy downloads
5. **UI Cleanup (Phase 5)** — Replace all "750 stocks" text with dynamic universe count
6. **Polish (Phase 6)** — Progress bars, radar charts, strategy library enhancements

**See spec:** Full specification in `/docs/SPECS_UNIFIED_10_STRATEGY_PARAMETERIZATION.md` or latest spec passed to development team.

---

## When Debugging

1. **Check server logs first:** server.ts logs DB issues ([DB]), service warnings ([Service Name]), route errors with full stack
2. **Check browser DevTools:** Network tab shows API responses; Console shows client errors; Application tab shows localStorage
3. **Inspect database:** Use SQLite3 CLI or GUI tool; query tables directly to verify data state
4. **Disable HMR if UI flickers:** Set `DISABLE_HMR=true` in shell before `npm run dev`
5. **Force clean slate:** `rm dist portfolio.db* portfolio_persistent_backup.db; npm run build; npm start`

---

## Useful Resources

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Express.js Guide:** https://expressjs.com/
- **React Hooks Docs:** https://react.dev/reference/react/hooks
- **SQLite3 Official:** https://www.sqlite.org/
- **Tailwind CSS:** https://tailwindcss.com/
- **Vite Guide:** https://vitejs.dev/guide/

---

*Last updated: Sept 2026 | Maintained by Claude Code | For questions on execution, see troubleshooting in server logs*
