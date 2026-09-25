# WealthOS Opportunity Engine: Baseline Report

This document establishes the pre-remediation baseline of the WealthOS Opportunity Engine. It details the existing architectural state machine, universe construction, DuckDB worker performance, HTTP orchestrations, and pipeline coverage metrics.

## 1. Engine State Machine & Call Graph

The `ConsolidatedOpportunityEngine` (COE) acts as the central orchestrator for the quantitative scan pipeline.

**Core State Machine Flow:**
1. **Trigger**: Initiated manually via `triggerBackgroundScan()` or lazily via `getDashboardReport()` if the SQLite cache is older than 30 minutes.
2. **Initialization**:
   - Fetches live user portfolio holdings.
   - Resolves the master universe via `MasterIndianUniverseService`.
3. **Data Plane (Execution Loop)**:
   - For each scrip in the universe, it fetches historical OHLCV data via `DuckDbAdjustedOhlcvService`.
   - The OHLCV service acts as a bridge to a persistent DuckDB Python worker (`query_adjusted_ohlcv_worker.py`).
4. **Strategy Evaluation**:
   - The historical bars are fed into `PureTechnicalStrategiesEngine`, which processes independent strategies (e.g., S1: VPA Alignment, S2: Institutional Inflow + FVG, etc.).
5. **Filtering & Ranking**:
   - Applies liquidity gates (OPP-1), fundamental filters, and sector concentration checks.
   - Computes tier ranking (Top 5, Top 10, Top 25) based on convergence scores.
6. **Persistence**:
   - Writes evaluations to `scrip_evaluations` SQLite table.
   - Records tier stability in `tier_membership_history`.
   - Caches the final `MasterOpportunityDashboardReport` for instant `<50ms` UI reads.

**Known State Machine Bug (Telemetry Semantics):**
`triggerBackgroundScan()` starts the pipeline via an asynchronous `setTimeout` (50ms delay) but never directly updates the `this.isScanning` flag to `true` prior to yielding the event loop. Consequently, a synchronous call to `getScanStatus()` immediately after the trigger will return `isScanning: false`, causing UI polling to prematurely terminate.

## 2. Universe Construction & Counts

The institutional discovery universe is managed by `MasterIndianUniverseService`.

**Composition (Curated Benchmark Cohorts):**
- **NIFTY LargeCap 100** (100 companies)
- **NIFTY MidCap 150** (150 companies)
- **NIFTY SmallCap 250** (250 companies)
- **NIFTY MicroCap 250 & SME** (250 companies)

**Dynamic Expansion:**
The service augments the curated 750 benchmark stocks by querying all `ACTIVE` equities from the `MasterTickers` table (filtering out predefined US/Foreign equities like `AAPL`, `VOO`). 

**Current Baseline Counts:**
- **Total Universe Candidates:** 3,554 scrips

## 3. DuckDB Python Worker Performance

The `DuckDbAdjustedOhlcvService` maintains a persistent Python worker (`query_adjusted_ohlcv_worker.py`) that communicates via JSON RPC over `stdin`/`stdout`.

**Baseline Timings (Local Windows Environment):**
- **Cold Start + First Read (e.g., RELIANCE):** ~2,987ms - 3,635ms
- **Warm Read (e.g., TCS):** ~61ms

*Analysis:* The 3+ second cold start is a significant bottleneck. When amortized over 3,554 queries at ~61ms each, a full scan requires approximately **3.6 minutes** just for data retrieval, explaining why it must run as a background daemon.

## 4. HTTP Request & Response Flows

**1. Async Scan Trigger**
- `POST /api/opportunity-engine/scan`
- **Behavior:** Non-blocking async trigger. 
- **Response:** `{ success: true, status: 'SCAN_STARTED', isScanning: true }`

**2. Polling Telemetry**
- `GET /api/opportunity-engine/scan-status`
- **Behavior:** Reads in-memory telemetry state.
- **Response:** `{ success: true, data: { isScanning: false, totalCandidates: 0, completedCount: 0, ... } }` *(Note: Bugged as described in section 1)*

**3. Dashboard Report**
- `GET /api/opportunity-engine/dashboard`
- **Behavior:** Returns the full consolidated report from in-memory cache or SQLite cache. Triggers background refresh if stale.

**4. Funnel Telemetry**
- `POST /api/opportunity-engine/pipeline-telemetry`
- **Behavior:** Passes the cached report through `FlexibleTelemetryPipelineService` to dynamically apply thresholds and filters.

## 5. Pipeline Coverage Metrics

Running a full direct scan (`executeFullScanPipeline()`) yields the following baseline metrics:

- **Total Universe:** 3,554
- **DuckDB Covered (Data available):** 2,927
- **Coverage Gaps (No data):** 601
- **Bridge Fails:** 0
- **Evaluated by Strategies:** 2,941
- **Qualified (Passed at least one baseline strategy filter):** 853

*Note: The discrepancy between Covered (2,927) and Evaluated (2,941) indicates that 14 scrips were evaluated via a legacy SQLite fallback or alternative data plane when DuckDB failed to return bars, although bridge failures strictly registered as 0.*
