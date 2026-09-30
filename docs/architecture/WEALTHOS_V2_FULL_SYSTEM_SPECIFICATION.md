# WealthOS V2 — Full System Architecture, Functional Specification & Reviewer Handover

**Document Version:** 2.0.0  
**Effective Date:** 2026-09-30  
**Repository:** `https://github.com/jswebexguru50-byte/WealthOS17sep`  
**Authoritative Branch:** `ai-review`  
**Current Remote HEAD:** `c1ce46de11ea68c7668f07a50052fbda8e8292af`  
**Audience:** Independent Reviewers, Engineers, Quantitative Researchers, System Auditors  

---

## Table of Contents

1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [Constitutional Integrity Invariants & Safeguards](#2-constitutional-integrity-invariants--safeguards)
3. [System Architecture & Data Organization](#3-system-architecture--data-organization)
4. [What WealthOS Can Do (Functional Capabilities)](#4-what-wealthos-can-do-functional-capabilities)
5. [End-to-End Service Map (Which Code Does What)](#5-end-to-end-service-map-which-code-does-what)
6. [API Surface & Route Specification](#6-api-surface--route-specification)
7. [Deterministic Background Services & Daemons](#7-deterministic-background-services--daemons)
8. [Acceptance Verification & Reviewer Reproduction Guide](#8-acceptance-verification--reviewer-reproduction-guide)

---

## 1. Executive Summary & Core Philosophy

WealthOS V2 is an institutional-grade investment intelligence, portfolio risk accounting, and quantitative market analysis platform tailored specifically for the Indian equity markets (NSE/BSE).

Traditional retail and commercial financial platforms suffer from four systemic vulnerabilities:
1. **Black-box Fabrication:** Producing arbitrary composite scores (e.g., "Quality Score 82/100") or automated "BUY / SELL / STRONG HOLD" recommendations with no verifiable causal basis.
2. **Lookahead Bias (Data Leakage):** Using restated earnings, delayed disclosures, or future splits/dividends retroactively, corrupting backtests and historical decision models.
3. **Synthetic Fallback Guessing:** Fabricating synthetic dates, ticker-specific hardcoded hacks, or fallbacks when real market or disclosure data is missing.
4. **Unregulated Transaction Risks:** Unsanitized automated order routing that risks capital depletion without strict human gatekeeping.

WealthOS solves these challenges through **Constitutional Financial Software Engineering**:
- **Evidence-First Truth:** Every number, ratio, and narrative fact displayed in WealthOS is traceable to an immutable provider response, statutory exchange filing, or raw OHLCV exchange trade.
- **Honest Degradation:** If data does not exist for a company, time period, or metric, WealthOS marks it explicitly as `UNAVAILABLE` or `PIT_UNKNOWN`. It never guesses or fabricates.
- **Analytical Cockpit over Black-Box Advice:** WealthOS provides comprehensive, multi-dimensional decision evidence across 8 dedicated panels—enabling the investor to make informed decisions without algorithmic paternalism.
- **Separation of Read Authority and Analytical Snapshotting:** Read operations (`GET`) are strictly non-mutating, while analytical snapshotting is explicitly triggered and idempotent.

---

## 2. Constitutional Integrity Invariants & Safeguards

WealthOS enforces programmatic, non-negotiable safeguards across the entire codebase. These invariants are continuously validated by dedicated automated gates:

### Invariant 1: No Synthetic Composite Scores or Ratings
- **Rule:** WealthOS will never output a single aggregated "magic score" (e.g. 78/100) or algorithmic "BUY / SELL" recommendation.
- **Enforcement:** Verified in `tests/unit/integrity_final.test.ts`. Cockpit orchestrator outputs structured module evidence (`overview`, `fundamental`, `valuation`, `management`, `technical`, `evidence`, `changes`), leaving synthesis to the human investor.

### Invariant 2: Zero-Write GET Authority
- **Rule:** Calling `GET /api/v2/company-intelligence/:symbol` must perform zero writes to the database. Repeated reads with identical or differing inputs cannot create database side-effects.
- **Enforcement:** Verified in `tests/integration/gate4_operational_invariants.test.ts` and in `reports/readiness/V2_BROWSER_ACCEPTANCE.json` by asserting `factsCountBefore === factsCountAfter`.

### Invariant 3: Idempotent Analytical Snapshotting
- **Rule:** Explicit refreshes via `POST /api/v2/company-intelligence/:symbol/refresh` evaluate new data idempotently. Repeated execution on unchanged provider data produces zero duplicate records.
- **Enforcement:** Verified by `RefreshCoordinator` and integration test suites.

### Invariant 4: Symbol-Free Archetype & Model Resolution
- **Rule:** Business models, valuation archetypes, and sector classifiers must NEVER contain hardcoded ticker symbols, regex branches on stock tickers, or company-specific special cases.
- **Enforcement:** `SectorArchetypeRegistry` and `BusinessModelClassifier` classify companies solely using standardized exchange sector and industry strings. A company with no sector/industry data resolves deterministically to `UNKNOWN`.

### Invariant 5: Deterministic Thesis Identity
- **Rule:** Analytical thesis IDs must be cryptographically deterministic hashes based on `security_id` and domain parameters. Generating random UUIDs (`randomUUID()`) for stateful theses is forbidden.
- **Enforcement:** `ThesisEngine.generateThesisId(securityId)` produces identical keys across restarts.

### Invariant 6: Provider Quota Reservation & Standby
- **Rule:** Autonomous enrichment daemons must strictly respect provider quota limits. An operational reserve (e.g., 100 calls on Trendlyne MCP) must remain untouched at all times to service interactive user requests.
- **Enforcement:** `TrendlyneQuotaManager` enforces `dailyUsed <= dailyLimit - dailyReserve` (900 <= 1000 - 100). When 900 calls are reached, the daemon enters safe standby until midnight quota reset.

### Invariant 7: Zero Live Broker Orders
- **Rule:** WealthOS is a read, research, and accounting engine. It holds no execution credentials, places no automated orders on Kite/Zerodha, and never mutates cash or demat balances autonomously.

---

## 3. System Architecture & Data Organization

WealthOS employs a hybrid, multi-tier data architecture optimized for high-throughput time-series analytics and relational point-in-time facts:

```
+-----------------------------------------------------------------------------------+
|                                 WEALTHOS FRONTEND                                 |
|               (React / TypeScript / Tailwind / Vite / Lucide Icons)               |
|  +-----------------------------------------------------------------------------+  |
|  |     Investor Cockpit: 8 Evidence Panels (Overview, Business, Financials,     |  |
|  |     Management Walk-the-Talk, Valuation, Technicals, Changes, Evidence)     |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------+-----------------------------------------+
                                          | JSON over HTTP / WebSocket
                                          v
+-----------------------------------------------------------------------------------+
|                              WEALTHOS BACKEND ENGINE                              |
|                          (Node.js / Express / TypeScript)                         |
|  +-----------------------------------------------------------------------------+  |
|  | CompanyIntelligenceOrchestrator  | IntelligenceInboxService                |  |
|  | TrendlyneEnrichmentDaemon        | TrendlyneBatchPlanner (500-cell envelope) |
|  | ManagementCommitmentService      | FreshnessEngine (PIT)                   |  |
|  | SectorArchetypeRegistry          | MasterTickerService                     |  |
|  +-----------------------------------------------------------------------------+  |
+--------------------+------------------------------------+-------------------------+
                     |                                    |
                     v                                    v
+------------------------------------+   +------------------------------------------+
|       SQLITE RELATIONAL STORE      |   |       DUCKDB / PARQUET STORAGE ENGINE    |
|           (portfolio.db)           |   |            (data/market/adjusted/)       |
|  - WAL Mode, ACID Transactions     |   |  - 5,239,769 Adjusted Daily OHLCV Bars   |
|  - company_facts (PIT facts)       |   |  - 4,423 Total Symbols                   |
|  - trendlyne_raw_response          |   |    * 2,927 Active Stock Catalog          |
|  - trendlyne_enrichment_jobs       |   |    * Historical & Fallback Partitions    |
|  - trendlyne_quota_ledger          |   |  - 206 Benchmark & Sector Indices        |
|  - management_commitments          |   |  - Spans 2016-09-21 to 2026-09-30        |
|  - broker_trades, audit_logs       |   |  - Sub-millisecond vector scans          |
+------------------------------------+   +------------------------------------------+
                     |                                    |
                     v                                    v
+------------------------------------+   +------------------------------------------+
|       TRENDLYNE MCP PROVIDER       |   |          KITE CONNECT MARKET DATA        |
|  - 10 scrips x 50 metrics = 500    |   |  - Live quotes & depth                   |
|  - Multi-stock parameter queries   |   |  - Historical daily OHLCV sync           |
|  - Raw JSON archiving              |   |  - Token auth: Vijaya Sharma (PSI722)    |
+------------------------------------+   +------------------------------------------+
```

### 3.1. DuckDB / Parquet Adjusted OHLCV Estate
- **Storage Format:** Segmented Parquet files queried via DuckDB in-process vector engine.
- **Coverage:** 5,239,769 daily bars spanning 10 complete calendar years (`2016-09-21` to `2026-09-30`).
- **Symbol Taxonomy:**
  * **2,927 Validated Active Stock Catalog:** Active NSE equities with validated Kite historical instruments.
  * **4,423 Total OHLCV Estate Symbols:** Total primary and fallback partitions (including historical, merged, or delisted tickers to prevent survivorship bias).
  * **206 Benchmark Indices:** Nifty 50, Nifty Next 50, Nifty Midcap 150, sectoral indices, and thematic benchmarks.
  * **Today's Trades (2026-09-30):** 2,766 stocks tracked, with 2,360 actively traded during the session.

### 3.2. SQLite Relational Store (`portfolio.db`)
- **Mode:** Write-Ahead Logging (`WAL`) with explicit mutex locking (`runInDbLock`) for transactional atomicity.
- **Core Tables:**
  * `company_facts`: Canonical quantitative repository. Stores point-in-time metric key-value pairs (`symbol`, `metric_key`, `fact_value`, `source_type`, `period_type`, `period_end_date`, `publication_date`, `created_at`).
  * `trendlyne_raw_response`: Immutable raw JSON response cache keyed by SHA-256 hash. Enables audit replays without incurring provider calls.
  * `trendlyne_enrichment_jobs`: Durable job queue partitioned into priority tiers (`P0_PORTFOLIO`, `P1_WATCHLIST`, `P2_BENCHMARK`, `P4_UNIVERSE`).
  * `trendlyne_enrichment_batches`: 500-cell batch execution envelopes.
  * `trendlyne_quota_ledger`: Tracks daily provider call consumption, limits, and reserve bounds.
  * `management_commitments`: Forward-looking statements, speaker, disclosure source, target metric, later evidence, and fulfillment status (`MET`, `PARTIALLY_MET`, `MISSED`, `PENDING`, `NOT_MEASURABLE`).
  * `audit_log`: System-wide chronological event audit trail.

---

## 4. What WealthOS Can Do (Functional Capabilities)

WealthOS delivers an end-to-end investment intelligence workflow:

### 1. Investor Cockpit (8 Modular Panels)
When viewing any company (e.g. `DYCL`, `TCS`, `HDFCBANK`, `RELIANCE`, `WELINV`):
- **Overview Panel:** Market capitalisation, enterprise value, sector, industry, shares outstanding, and current price relative to 52-week high/low.
- **Business Model Panel:** Deterministic sector classification (`IT_SERVICES`, `BANK`, `INDUSTRIAL`, `PHARMA`, etc.), operating model description, and structural revenue drivers.
- **Financial Evidence Panel:** Audited balance sheet, income statement, and cash flow metrics across 3–5 years (Revenue, EBITDA, PAT, Free Cash Flow, Debt/Equity, ROCE, ROE, Working Capital Days).
- **Valuation Analysis Panel:** Multi-method valuation analysis (Historical EV/EBITDA, P/E percentile bands, P/B vs ROE regressors, Discounted Cash Flow assumptions).
- **Management Walk-the-Talk Panel:** Forward-looking management guidance statements extracted from annual reports and concalls, audited against subsequent statutory filings.
- **Technical Market Structure Panel:** 10-year adjusted price chart, regime indicators, Volume Price Alignment (VPA) 3-leg swings, and Fair Value Gaps (FVG) / Consequent Encroachment zones.
- **Changes / Freshness Panel:** Delta since last investor review, highlighting new filings, quarterly result releases, or material shareholding pattern shifts.
- **Evidence Provenance Panel:** Transparent listing of all underlying data sources, timestamps, provider IDs, and confidence levels.

### 2. Autonomous Background Data Enrichment
- Continuously runs in the background to enqueue, plan, and ingest financial facts across all 4,223 Indian listed equities.
- Dynamically packs requests into 500-cell batches (10 scrips × 50 metrics), reducing provider overhead by ~90% compared to ad-hoc querying.
- Maintains a 100-call interactive reserve for real-time user lookups.

### 3. Quantitative Strategy Research & Scanning
- **S1A (VPA 3-Leg Swing):** Institutional Volume Price Alignment setup tracking accumulation, contraction, and expansion swings.
- **S1B (VPA Trough Reversal):** Exhaustion volume at support levels with confirmation candles.
- **S2A (Institutional FVG / Consequent Encroachment):** Fair Value Gap mitigation with 50% consequent encroachment re-tests.
- Zero lookahead bias: Strategy evaluation strictly matches historical bar timestamps.

### 4. Intelligence Inbox & Monitoring
- Aggregates high-conviction events across user watchlists:
  * Earnings surprise deltas (> 15% vs consensus).
  * Major management commitment fulfillments or misses.
  * Promoter holding changes / insider buying.
  * High-volume technical structure shifts.

---

## 5. End-to-End Service Map (Which Code Does What)

Below is the definitive directory and service mapping across the application:

```
src/
├── client/                                    # Frontend React Application
│   ├── components/
│   │   ├── intelligence/                      # Cockpit UI components
│   │   │   ├── CompanyIntelligenceCockpit.tsx # Main 8-panel cockpit layout
│   │   │   ├── FinancialsPanel.tsx            # Audited financial tables & trends
│   │   │   ├── ValuationPanel.tsx             # Valuation multiples & DCF evidence
│   │   │   ├── ManagementPanel.tsx            # Walk-the-talk commitments audit
│   │   │   ├── TechnicalPanel.tsx             # Price charts & volume alignment
│   │   │   └── EvidenceProvenancePanel.tsx    # Source fact inspector
│   │   ├── inbox/                             # Intelligence Inbox views
│   │   └── navigation/                        # App header, search & routing
│   ├── services/
│   │   └── api.ts                             # Client HTTP API bridge
│   └── index.css                              # Tailwind & core typography tokens
│
├── server/                                    # Backend Services & Engines
│   ├── database.ts                            # SQLite connection, WAL mode, migrations, runInDbLock
│   ├── duckdb_client.ts                       # DuckDB interface for fast Parquet queries
│   ├── duckdb_ohlcv_service.ts                # OHLCV retrieval and technical indicator pipelines
│   ├── routes/
│   │   └── infra.ts                           # V2 API endpoints (/api/v2/company-intelligence, /refresh, etc.)
│   │
│   └── services/
│       ├── enrichment/trendlyne/
│       │   ├── TrendlyneEnrichmentDaemon.ts   # Background priority enrichment runner
│       │   ├── TrendlyneBatchPlanner.ts       # 500-cell 2D bin-packing capacity planner
│       │   ├── TrendlyneMcpClient.ts          # Direct MCP provider protocol client
│       │   ├── TrendlyneQuotaManager.ts       # Daily quota tracking & 100-call reserve guard
│       │   ├── TrendlyneCoverageService.ts    # Metric coverage & missing-data reporting
│       │   └── TrendlyneHealthService.ts      # Telemetry, queue stats, and readiness health
│       │
│       ├── intelligence/
│       │   ├── CompanyIntelligenceOrchestrator.ts # Master cockpit data assembler
│       │   ├── RefreshCoordinator.ts          # Idempotent refresh snapshot controller
│       │   ├── domain/
│       │   │   ├── SectorArchetypeRegistry.ts # Symbol-free sector/industry archetype classifier
│       │   │   └── ThesisEngine.ts            # Deterministic investment thesis identity
│       │   ├── inbox/
│       │   │   └── IntelligenceInboxService.ts# Material alert & inbox feed generator
│       │   ├── management/
│       │   │   └── ManagementCommitmentService.ts # Guidance extraction & audit against financials
│       │   └── freshness/
│       │       └── FreshnessEngine.ts         # Point-in-time validation & honest degradation
│       │
│       ├── strategies/                        # Quantitative Strategy Implementations
│       │   ├── S1A_VPAThreeLegEngine.ts       # VPA 3-Leg swing strategy
│       │   ├── S1B_VPATroughReversalEngine.ts # VPA trough reversal strategy
│       │   └── S2A_FVGConsequentEncroach.ts   # Institutional Fair Value Gap engine
│       │
│       └── MasterTickerService.ts             # Ticker resolution, ISIN mapping & catalog service
│
scripts/
├── readiness/
│   ├── generate_v2_final_acceptance.ts        # Machine-verifiable acceptance generator
│   ├── run_v2_browser_acceptance.ts           # Playwright end-to-end browser journey runner
│   └── run_walk_the_talk_validation.ts        # Representative 21-company walk-the-talk evaluator
│
├── fundamental/
│   └── run_v2_trendlyne_daemon.ts             # Standalone enrichment daemon runner
│
└── update_ohlcv_duckdb_today.py               # Kite Connect daily candle synchronizer
```

---

## 6. API Surface & Route Specification

All endpoints are hosted on `http://localhost:3000` (or configured port) under `/api/v2/`:

### 1. `GET /api/v2/company-intelligence/:symbol`
- **Method:** `GET`
- **Mutability:** Strictly **READ-ONLY** (0 writes).
- **Parameters:** `symbol` (e.g. `DYCL`, `TCS`, `HDFCBANK`). Query param: `asOfDate` (optional, defaults to current date).
- **Response Format:**
```json
{
  "symbol": "DYCL",
  "asOfDate": "2026-09-30",
  "overview": { ... },
  "modules": {
    "fundamental": { ... },
    "valuation": { ... },
    "management": { ... },
    "technical": { ... }
  },
  "sinceLastReview": { ... },
  "security": { ... },
  "recommendation": null
}
```
*Note: `recommendation` is intentionally `null` to comply with Constitutional Invariant 1.*

### 2. `POST /api/v2/company-intelligence/:symbol/refresh`
- **Method:** `POST`
- **Mutability:** Idempotent analytical snapshot update.
- **Parameters:** `symbol` in URL, optional JSON body `{ "asOfDate": "2026-09-30" }`.
- **Response Format:**
```json
{
  "success": true,
  "refreshedAt": "2026-09-30T04:41:22.959Z",
  "result": { ... }
}
```

### 3. `GET /api/v2/intelligence-inbox`
- **Method:** `GET`
- **Description:** Returns categorized inbox items for portfolio and watchlist tickers (e.g., Guidance Updates, Valuation Extremes, Volume Surges).

### 4. `GET /api/v2/data-coverage/:symbol`
- **Method:** `GET`
- **Description:** Returns detailed metric coverage statistics for a specific symbol across the 3 core parameter sets: Core Financials, Growth & Quality, and Valuation.

### 5. `GET /api/v2/enrichment/status`
- **Method:** `GET`
- **Description:** Real-time background enrichment status: total universe stocks, queue size, jobs completed, facts ingested, and daily quota consumed.

---

## 7. Deterministic Background Services & Daemons

### 7.1. Trendlyne MCP Max Daemon (`TrendlyneEnrichmentDaemon`)
- **Unit of Work:** The **500-cell capacity envelope** (`10 scrips × 50 distinct metrics = 500 cells`).
- **Priority Queue Policy:**
  1. `P0_PORTFOLIO`: User-held portfolio stocks (highest priority).
  2. `P1_WATCHLIST`: User watchlist tickers.
  3. `P2_BENCHMARK`: 11 Acceptance Benchmark stocks.
  4. `P4_UNIVERSE`: Broader Indian market universe (4,212 stocks).
- **Restart & Crash Safety:**
  * Uses SQLite transactions (`BEGIN IMMEDIATE`).
  * In-flight jobs are tracked in `trendlyne_enrichment_jobs`. Completed jobs (`state = 'COMPLETE'`) are **never** re-enqueued or overwritten.
  * If interrupted, the daemon resumes from the exact next `PENDING` batch.
- **Quota Safeguard:**
  * Checks `TrendlyneQuotaManager` before every provider call.
  * When `dailyUsed >= (1000 - 100) = 900`, enters automated sleep/standby mode until daily quota rollover.

### 7.2. Daily OHLCV Synchronizer (`update_ohlcv_duckdb_today.py`)
- Authenticates with Kite Connect using active session tokens.
- Retrieves missing historical candles up to the current session close (`2026-09-30`).
- Writes validated Parquet records to DuckDB partitions.
- Maintains catalog synchronization with zero data loss or timestamp overlap.

---

## 8. Acceptance Verification & Reviewer Reproduction Guide

Any new reviewer can independently verify the entire WealthOS platform from scratch on a clean clone:

### Step 1: Verify TypeScript Compilation
```bash
npx tsc --noEmit
```
*Expected Result:* 0 errors. Clean exit with code 0.

### Step 2: Execute Closure Acceptance Test Suites
```bash
npx vitest run tests/integration/closure_manifest_gate.test.ts tests/integration/gate4_operational_invariants.test.ts tests/integration/gate5_reality_oracle.test.ts tests/integration/trendlyne_mcp_enrichment.test.ts tests/unit/integrity_final.test.ts tests/unit/trendlyne_batch_capacity.test.ts
```
*Expected Result:* **6/6 test files passed, 35/35 tests passed (100%)**.

### Step 3: Run Reality Oracle Matrix
```bash
npx tsx tests/integration/gate5_reality_oracle.test.ts
```
*Expected Result:* Outputs `reports/intelligence/REALITY_CHECK_MATRIX.json` with **110/110 verified observations** and 0 unexplained mismatches across 11 benchmark companies.

### Step 4: Run Representative Walk-the-Talk Validation
```bash
npx tsx scripts/readiness/run_walk_the_talk_validation.ts
```
*Expected Result:* Evaluates 30 management guidance commitments across 21 companies (benchmark 11 + 10 mid/small-caps). Generates `reports/readiness/WALK_THE_TALK_VALIDATION.json`.

### Step 5: Run Playwright Browser Acceptance
```bash
npx tsx scripts/readiness/run_v2_browser_acceptance.ts
```
*Expected Result:* Launches browser, executes end-to-end journeys across `DYCL`, `TCS`, `HDFCBANK`, `RELIANCE`, and `WELINV`, verifying zero-write GET, refresh, and honest UI rendering. Generates `reports/readiness/V2_BROWSER_ACCEPTANCE.json` (Overall: **PASS**).

### Step 6: Generate Master Acceptance Report
```bash
npx tsx scripts/readiness/generate_v2_final_acceptance.ts
```
*Expected Result:* Programmatically compiles and validates all layers, writing `reports/readiness/V2_FINAL_ACCEPTANCE.json`.

---

*This specification represents the authoritative baseline for WealthOS V2. All mechanisms described herein are active, verifiable, and committed to GitHub on branch `ai-review`.*
