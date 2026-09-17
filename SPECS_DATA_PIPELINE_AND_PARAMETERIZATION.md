# NRI WealthOS — Data Pipeline, Universe Expansion & Strategy Parameterization Specification

**Version:** 1.0
**Date:** 2026-09-09
**Status:** DRAFT — Pending Review & Approval

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 1: Universe Expansion](#2-phase-1-universe-expansion)
3. [Phase 2: Historical Data Backfill (2021 → Present)](#3-phase-2-historical-data-backfill)
4. [Phase 3: Robust Daily Data Pipeline](#4-phase-3-robust-daily-data-pipeline)
5. [Phase 4: Strategy Parameterization Engine](#5-phase-4-strategy-parameterization-engine)
6. [Cost Analysis](#6-cost-analysis)
7. [Implementation Priority & Timeline](#7-implementation-priority--timeline)
8. [Risk Mitigation](#8-risk-mitigation)
9. [Appendix A: Current State Audit Summary](#9-appendix-a-current-state-audit-summary)
10. [Appendix B: Complete Strategy Parameter Catalogue](#10-appendix-b-complete-strategy-parameter-catalogue)

---

## 1. Executive Summary

### Problem Statement

The current NRI WealthOS technical strategy engine operates with significant infrastructure constraints:

| Constraint | Current State | Target State |
|---|---|---|
| **Universe coverage** | 120–150 stocks per scan (capped by `LIMIT 120` / `LIMIT 150` queries) | **All ~5,000+ NSE-listed equities** |
| **Historical data** | 200 days for 80 hardcoded symbols (MarketSnapshots); close-only for everything else | **Full OHLCV from Jan 2021 → present for all listed stocks** |
| **Data pipeline** | No scheduled ingestion; on-demand Yahoo Finance calls with no retry, no rate limiting, empty catch blocks | **Automated EOD pipeline with retry, quality checks, and deduplication** |
| **Strategy configuration** | ~65 numeric thresholds hardcoded as inline literals across 2,272 lines | **Fully parameterized strategies with save/load/clone/backtest** |

### Recommended Approach

1. **Three-tier data sourcing** with intelligent fallback:
   - **Primary: Upstox Historical Candle API v2** — official, well-documented, corporate-action-adjusted OHLCV, up to 2 years per call. Existing integration in `MarketDataIngestorService.ts` to be extended.
   - **Secondary: NSE Bhavcopy archives** — free, official, complete OHLCV + delivery data, archives going back to 2005. One CSV per trading day covers every listed stock. Required for data older than 2 years (2021–2024) and as validation/fallback.
   - **Last-resort fallback: Yahoo Finance** — free, no key, up to 5 years, used only when Upstox and NSE Bhavcopy both fail.
2. **Unified `DailyOHLCV` table** replacing the current three overlapping tables (`HistoricalPrices`, `MarketSnapshots`, `NseBhavcopy`).
3. **`StrategyParameterConfig` interface** extracting all ~65 hardcoded constants into a typed configuration object, enabling clone-and-customize workflows.
4. **Total infrastructure cost: $0** — all data sources are free, database is SQLite, compute is local.

---

## 2. Phase 1: Universe Expansion

### 2.1 Goal

Expand the strategy scan universe from the current effective maximum of 150 stocks to all ~5,000+ NSE-listed equities.

### 2.2 Current Universe Sources

| Source | Location | Count | Used For |
|---|---|---|---|
| `MasterTickerService.seedCatalog()` | `src/server/services/MasterTickerService.ts:22-71` | 42 hardcoded tickers | Seed catalog on first run |
| `OpportunityScripEvaluations` query | `src/server/services/PureTechnicalStrategiesEngine.ts:2076-2084` | `LIMIT 120` | Primary scan universe |
| `MasterTickers` fallback query | `src/server/services/PureTechnicalStrategiesEngine.ts:2090-2098` | `LIMIT 150`, `market_cap_cr >= 500` | Fallback scan universe |
| `QuantitativeBacktestScheduler.TRACKED_UNIVERSE` | `src/server/services/QuantitativeBacktestScheduler.ts:25` | 80 hardcoded symbols | Hourly ingest cycle |
| NSE `EQUITY_L.csv` | Downloaded by `src/server/camsParser.ts:349` | ~2,100+ EQ series | ISIN lookup only — **not used for universe population** |

### 2.3 Design: `UniverseManagerService`

Create a new service at `src/server/services/UniverseManagerService.ts`.

**Responsibilities:**
1. Download and parse NSE `EQUITY_L.csv` (full list of all NSE-listed equities with ISINs, series, and listing dates)
2. Populate `MasterTickers` table with all EQ-series stocks
3. Auto-refresh monthly (or on-demand)
4. Tier stocks by market capitalisation for prioritised scanning

**Universe Tiering:**

| Tier | Market Cap Range | Estimated Count | Scan Priority |
|---|---|---|---|
| **Tier 1: Large Cap** | > ₹20,000 Cr | ~200 | Highest — scan first |
| **Tier 2: Mid Cap** | ₹5,000 – ₹20,000 Cr | ~350 | High |
| **Tier 3: Small Cap** | ₹500 – ₹5,000 Cr | ~1,500 | Medium |
| **Tier 4: Micro Cap** | < ₹500 Cr | ~2,500+ | Low — scan last, optional |
| **Excluded** | Suspended / Illiquid / Zero volume 20 consecutive days | Variable | Excluded from scan |

**Key Implementation Details:**

```
UniverseManagerService
├── refreshFromNseEquityList()     // Download EQUITY_L.csv, upsert MasterTickers
├── updateMarketCapTiers()         // Query latest prices, classify tiers
├── getActiveScanUniverse(tier?)   // Return filtered list for strategy scan
├── getExcludedSymbols()           // Suspended, delisted, zero-volume
└── getUniverseStats()             // Count by tier, last refresh date
```

**Database Changes:**

Add columns to `MasterTickers`:

```sql
ALTER TABLE MasterTickers ADD COLUMN tier TEXT DEFAULT 'UNKNOWN';           -- LARGE/MID/SMALL/MICRO
ALTER TABLE MasterTickers ADD COLUMN listing_date TEXT;
ALTER TABLE MasterTickers ADD COLUMN series TEXT DEFAULT 'EQ';
ALTER TABLE MasterTickers ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE MasterTickers ADD COLUMN last_universe_refresh TEXT;
ALTER TABLE MasterTickers ADD COLUMN avg_daily_volume_20d REAL;
ALTER TABLE MasterTickers ADD COLUMN avg_daily_turnover_cr_20d REAL;
```

### 2.4 Files to Modify

| File | Change |
|---|---|
| `src/server/services/UniverseManagerService.ts` | **NEW** — Universe manager |
| `src/server/services/MasterTickerService.ts` | Remove hardcoded 42-ticker seed; delegate to UniverseManager |
| `src/server/database.ts` | Add tier/listing_date/series/is_active columns to MasterTickers |
| `src/server/services/PureTechnicalStrategiesEngine.ts:2062-2100` | Replace `LIMIT 120` / `LIMIT 150` queries with `UniverseManagerService.getActiveScanUniverse()` |
| `src/server/services/QuantitativeBacktestScheduler.ts:25` | Replace hardcoded `TRACKED_UNIVERSE` with dynamic universe query |
| `src/server/routes/infra.ts` | Add `/api/universe/refresh`, `/api/universe/stats` endpoints |

### 2.5 Scan Performance for 5,000+ Stocks

Current scan architecture: batches of 10, each symbol makes one Yahoo Finance HTTP call.

**With DailyOHLCV local data (Phase 2):**

| Metric | Current (150 stocks, Yahoo calls) | Target (5,000 stocks, local DB) |
|---|---|---|
| Data fetch | 150 × ~1s HTTP = ~2.5 min | 5,000 × ~5ms SQLite read = ~25s |
| Strategy evaluation | ~50ms per stock × 150 = ~7.5s | ~50ms per stock × 5,000 = ~250s (~4 min) |
| **Total scan time** | **~3–5 minutes** | **~5–6 minutes** |

The key insight: once data lives locally in `DailyOHLCV`, scanning 5,000 stocks is only marginally slower than scanning 150 over HTTP — the bottleneck shifts from I/O to compute.

---

## 3. Phase 2: Historical Data Backfill

### 3.1 Goal

Populate a unified `DailyOHLCV` table with full OHLCV data for all NSE-listed stocks from **January 2021 to present** (~1,000+ trading days).

### 3.2 Data Source Strategy: Upstox-First with NSE Bhavcopy for Deep History

The backfill uses a **split strategy** based on date range:

| Date Range | Primary Source | Rationale |
|---|---|---|
| **2024-09 → Present** (~2 years) | **Upstox Historical Candle API v2** | Official, adjusted data, within Upstox 2-year limit |
| **2021-01 → 2024-08** (~3.5 years) | **NSE Bhavcopy Archives** | Free, goes back to 2005, one CSV = all stocks |
| **Any gaps** | **Yahoo Finance** | Last-resort fallback for missing data |

**Data Source Comparison:**

| Criterion | Upstox API v2 | NSE Bhavcopy | Yahoo Finance |
|---|---|---|---|
| **Cost** | Free (with token) | Free | Free |
| **API Key** | OAuth2 daily refresh | None needed | None needed |
| **Historical depth** | Up to 2 years | Back to ~2005 | Up to 5 years |
| **Coverage per request** | One stock per request | **ALL listed stocks in one CSV** | One stock per request |
| **Data quality** | Official, corporate-action-adjusted | Official NSE source | Unofficial, occasional gaps |
| **Delivery data** | Some endpoints | Yes (delivery_qty, delivery_%) | No |
| **Trade count** | No | Yes (no_of_trades) | No |
| **Rate limits** | ~250 req/min (free tier) | Rate-limited (500ms recommended) | ~2,000 req/day (undocumented) |
| **Existing integration** | Yes (`MarketDataIngestorService.ts`) | Yes (`NseBhavcopyService.ts`) | Yes (`yahooFinance.ts`) |

**Backfill approach:**
- **Recent 2 years (Upstox):** Per-symbol fetch with 250ms throttle. ~5,000 stocks × 1 request each = ~5,000 requests. At 250ms throttle = ~21 minutes. Parallelise with 4 concurrent workers = ~5 minutes.
- **Older data (NSE Bhavcopy):** Per-date CSV download. ~880 trading days × 1 CSV = ~880 requests at 500ms = ~7 minutes. Each CSV covers ALL stocks.
- **Total estimated backfill time: ~12–15 minutes.**

### 3.3 Unified `DailyOHLCV` Table Schema

```sql
CREATE TABLE IF NOT EXISTS DailyOHLCV (
    symbol          TEXT    NOT NULL,
    trade_date      TEXT    NOT NULL,   -- YYYY-MM-DD
    series          TEXT    DEFAULT 'EQ',
    open            REAL    NOT NULL,
    high            REAL    NOT NULL,
    low             REAL    NOT NULL,
    close           REAL    NOT NULL,
    prev_close      REAL,
    volume          INTEGER NOT NULL,
    turnover_lacs   REAL,              -- Turnover in lakhs (from Bhavcopy)
    delivery_qty    INTEGER,
    delivery_pct    REAL,
    no_of_trades    INTEGER,
    data_source     TEXT    DEFAULT 'NSE_BHAVCOPY',  -- NSE_BHAVCOPY | YAHOO | UPSTOX
    created_at      TEXT    DEFAULT (datetime('now')),
    PRIMARY KEY (symbol, trade_date)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_dailyohlcv_date ON DailyOHLCV(trade_date);
CREATE INDEX IF NOT EXISTS idx_dailyohlcv_symbol_date ON DailyOHLCV(symbol, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_dailyohlcv_source ON DailyOHLCV(data_source);
```

**Storage Estimate:**

| Metric | Value |
|---|---|
| Stocks | ~5,000 |
| Trading days (Jan 2021 – Sep 2026) | ~1,350 |
| Total rows | ~6,750,000 |
| Avg row size | ~180 bytes |
| Raw data | ~1.2 GB |
| With indexes | ~1.8 GB |
| SQLite max capacity | ~140 TB |

### 3.4 Design: `HistoricalBackfillService`

Create at `src/server/services/HistoricalBackfillService.ts`.

```
HistoricalBackfillService
├── runFullBackfill()                          // Orchestrate both phases
│
├── Phase A: Upstox Recent Backfill (last 2 years)
│   ├── backfillFromUpstox(symbols[], startDate, endDate)
│   ├── fetchUpstoxCandles(symbol, from, to)   // Upstox v2 historical candle API
│   ├── resolveInstrumentKey(symbol)           // ISIN → Upstox instrument key
│   └── throttle: 250ms between requests, 4 concurrent workers
│
├── Phase B: NSE Bhavcopy Deep History (2021 → cutoff)
│   ├── backfillFromBhavcopy(startDate, endDate)
│   ├── downloadBhavcopyCSV(date)              // HTTP fetch with retry
│   ├── parseBhavcopyCSV(csvText)              // Parse sec_bhavdata_full CSV
│   └── throttle: 500ms between requests, sequential
│
├── Common
│   ├── upsertBatch(rows[])                    // Batch INSERT OR REPLACE
│   ├── getBackfillProgress()                  // { phase, completed, total, lastDate, status }
│   ├── detectGaps()                           // Find missing trading days
│   └── fillGapsFromYahoo(symbols[], dates[])  // Last-resort fallback
```

**Backfill Algorithm:**

```
1. Generate list of all Indian trading days from 2021-01-01 to today
   (exclude weekends + NSE holidays from known holiday calendar)

2. PHASE A — Upstox (recent ~2 years, per-symbol)
   a. Get active universe from MasterTickers
   b. For each symbol (4 concurrent workers, 250ms throttle):
      - Resolve ISIN → Upstox instrument key
      - GET /historical-candle/{instKey}/day/{to}/{from}
      - Parse OHLCV response
      - Batch INSERT OR REPLACE into DailyOHLCV (data_source = 'UPSTOX')
   c. On 429: exponential backoff (1s, 2s, 4s), max 3 retries
   d. On failure: queue symbol for NSE Bhavcopy fallback

3. PHASE B — NSE Bhavcopy (2021-01 → Upstox cutoff date)
   a. For each missing date (oldest first):
      - Download: GET https://archives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv
      - Parse CSV (skip header, filter series = 'EQ')
      - Batch INSERT OR REPLACE into DailyOHLCV (1000 rows per transaction)
      - Wait 500ms before next request
      - Update progress tracker
   b. Skip dates already fully populated from Upstox

4. GAP DETECTION
   - After both phases, run detectGaps()
   - For any remaining gaps, attempt Yahoo Finance fallback (per-symbol)

5. QUALITY AUDIT
   - Verify row counts per symbol meet expected trading days
   - Flag symbols with < 80% expected data coverage
```

**Upstox API Details:**

```
URL:     https://api.upstox.com/v2/historical-candle/{instrumentKey}/day/{toDate}/{fromDate}
Method:  GET
Headers: Authorization: Bearer {access_token}
         Accept: application/json
Timeout: 10 seconds
Rate:    ~250 req/min (free tier) → 250ms minimum between requests
Retry:   3 attempts, exponential backoff on 429/5xx
```

**Note:** The existing `MarketDataIngestorService.ts` (lines 243-301) already has Upstox historical candle fetching logic including instrument key resolution. This should be extracted and reused by the backfill service.

**NSE Bhavcopy CSV Format (`sec_bhavdata_full`):**

```
SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, CLOSE_PRICE,
LAST_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER
```

**HTTP Request Details:**

```
URL:     https://archives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv
Method:  GET
Headers: User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
         Accept: text/csv, application/csv, text/plain
         Referer: https://www.nseindia.com/
Timeout: 15 seconds
Retry:   3 attempts, exponential backoff (1s, 2s, 4s)
```

**Important:** NSE archives require a valid `Referer` header and a browser-like `User-Agent`. Without these, requests return 403.

### 3.5 Gap Detection & Cascading Fallback

After Upstox + Bhavcopy backfill, run gap detection:

```sql
-- Find dates that exist in Bhavcopy but have zero rows for a given symbol
SELECT DISTINCT d.trade_date
FROM (SELECT DISTINCT trade_date FROM DailyOHLCV) d
LEFT JOIN DailyOHLCV o ON o.trade_date = d.trade_date AND o.symbol = ?
WHERE o.symbol IS NULL
ORDER BY d.trade_date;
```

For detected gaps, use Yahoo Finance as fallback:
- Fetch the specific symbol's history for the gap period
- Insert with `data_source = 'YAHOO'`
- Yahoo does not provide delivery data — those columns will be NULL

### 3.6 Data Migration from Existing Tables

After `DailyOHLCV` is populated, migrate usable data from existing tables:

```sql
-- Migrate from NseBhavcopy (has full OHLCV + delivery data)
INSERT OR IGNORE INTO DailyOHLCV (symbol, trade_date, series, open, high, low, close, prev_close,
    volume, turnover_lacs, delivery_qty, delivery_pct, no_of_trades, data_source)
SELECT symbol, trade_date, series, open_price, high_price, low_price, close_price, prev_close,
    volume, turnover_lacs, deliv_qty, deliv_per, no_of_trades, 'NSE_BHAVCOPY'
FROM NseBhavcopy
WHERE series = 'EQ';

-- MarketSnapshots has full OHLCV (for the 80 tracked symbols)
INSERT OR IGNORE INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source)
SELECT symbol, snapshot_date, open, high, low, close, volume, 'MARKET_SNAPSHOT'
FROM MarketSnapshots
WHERE open IS NOT NULL AND high IS NOT NULL AND low IS NOT NULL;
```

### 3.7 Files to Create / Modify

| File | Change |
|---|---|
| `src/server/services/HistoricalBackfillService.ts` | **NEW** — Orchestrates Upstox (primary) + NSE Bhavcopy (deep history) + Yahoo (fallback) backfill |
| `src/server/services/IndianTradingCalendar.ts` | **NEW** — NSE holiday list + trading day generator (2021–2026) |
| `src/server/services/MarketDataIngestorService.ts` | Extract Upstox historical candle fetch logic into reusable utility for backfill service |
| `src/server/database.ts` | Add `DailyOHLCV` table creation + indexes |
| `src/server/routes/infra.ts` | Add `/api/data/backfill/start`, `/api/data/backfill/progress`, `/api/data/backfill/gaps` |
| `src/components/SettingsView.tsx` or new `DataManagementView.tsx` | UI for triggering backfill, viewing progress, checking gaps |

---

## 4. Phase 3: Robust Daily Data Pipeline

### 4.1 Goal

Automated, resilient, quality-checked daily data ingestion for all listed stocks, replacing the current fragile on-demand Yahoo Finance calls.

### 4.2 Current Pipeline Problems (Detailed)

| Problem | File | Line(s) | Impact |
|---|---|---|---|
| SSL verification globally disabled | `yahooFinance.ts` | 1 | Security vulnerability |
| Empty catch blocks swallow errors | `yahooFinance.ts` | 403, 450, 470 | Silent data loss |
| No retry on transient failures | `yahooFinance.ts` | 328-399 | Missing data on network hiccups |
| No rate limiting to Yahoo | `yahooFinance.ts` | All fetch paths | Potential IP ban |
| 8-second timeout too aggressive | `yahooFinance.ts` | 336 | Timeout on slow connections |
| `HistoricalPrices` stores close only | `yahooFinance.ts` | 256-279 | OHLCV unavailable from cache |
| `tickerDataCache` has no TTL/LRU | `yahooFinance.ts` | 242, 302-304 | Unbounded memory growth |
| Sector sync has 150ms sleep but price fetch has none | `yahooFinance.ts` | 1710 vs fetch paths | Inconsistent throttling |
| `failedYahooSymbols` Set permanently blocks retries | `yahooFinance.ts` | 245, 306-308 | Transient failures become permanent |
| Strategy engine always calls Yahoo, never reads local DB | `PureTechnicalStrategiesEngine.ts` | 2129 | Redundant HTTP calls |

### 4.3 Design: `EODDataPipelineService`

Create at `src/server/services/EODDataPipelineService.ts`.

```
EODDataPipelineService
├── scheduleEODIngestion()         // Register 16:00 IST daily job
├── runEODPipeline()               // Full pipeline: fetch → parse → validate → store → notify
├── fetchTodayBhavcopy()           // Download today's NSE Bhavcopy CSV
├── validateAndClean(rows[])       // Data quality checks
├── upsertToDailyOHLCV(rows[])    // Batch insert with deduplication
├── runQualityAudit()              // Post-insert quality checks
├── triggerStrategyRescan()        // Notify strategy engine of fresh data
├── getLastIngestionStatus()       // { lastDate, rowCount, quality, errors }
└── manualIngestDate(date)         // Re-ingest a specific date on demand
```

### 4.4 EOD Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY EOD PIPELINE (16:00 IST)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PRIMARY FETCH — UPSTOX                                      │
│     └─ For each symbol in universe (tiered, Tier 1 first):     │
│        └─ GET /historical-candle/{instKey}/day/{today}/{today}  │
│        └─ 250ms throttle, 4 concurrent workers                  │
│        └─ On 429: exponential backoff (1s, 2s, 4s)             │
│        └─ On token expiry: trigger OAuth refresh, retry         │
│     └─ Expected: ~5,000 requests at 250ms = ~21 min            │
│        (with 4 workers: ~5 min)                                 │
│                                                                 │
│  2. SECONDARY FETCH — NSE BHAVCOPY (validation + enrichment)   │
│     └─ Download today's sec_bhavdata_full from NSE archives     │
│     └─ Retry: 3 attempts, exponential backoff (1s, 2s, 4s)     │
│     └─ Fallback: retry at 16:30, 17:00 if NSE not yet posted   │
│     └─ Cross-validate Upstox data vs Bhavcopy OHLCV            │
│     └─ Enrich with delivery_qty, delivery_pct, no_of_trades    │
│        (Bhavcopy-only fields not available from Upstox)         │
│     └─ Fill any symbols missing from Upstox response            │
│                                                                 │
│  3. VALIDATE                                                    │
│     └─ Reject rows with zero/null close price                   │
│     └─ Flag price spikes > 20% vs prev_close (circuit breaker)  │
│     └─ Flag zero-volume rows (mark but store)                   │
│     └─ Cross-check: row count vs expected universe size          │
│     └─ Cross-validate Upstox vs Bhavcopy (flag discrepancies)  │
│                                                                 │
│  4. STORE                                                       │
│     └─ Batch INSERT OR REPLACE into DailyOHLCV                  │
│     └─ Transaction: 1,000 rows per commit                       │
│     └─ WAL mode for concurrent read safety                      │
│     └─ Prefer Upstox data (corp-action adjusted); enrich with  │
│        Bhavcopy delivery data                                   │
│                                                                 │
│  5. QUALITY AUDIT                                               │
│     └─ Verify: all Tier 1 stocks have today's data              │
│     └─ Detect: symbols in universe but missing from both feeds  │
│     └─ For missing Tier 1: attempt Yahoo Finance last-resort    │
│     └─ Log: { insertedCount, updatedCount, skippedCount,        │
│              flaggedCount, missingTier1, upstoxHits,            │
│              bhavcopyHits, yahooFallbackHits }                  │
│                                                                 │
│  6. NOTIFY                                                      │
│     └─ Trigger strategy engine re-scan (async)                  │
│     └─ Update ingestion status in metadata table                │
│     └─ Emit event for real-time dashboard                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Upstox Token Management:**

The Upstox OAuth2 access token expires every trading session. The pipeline must:
1. Check token validity before starting the EOD run
2. If expired, trigger the Upstox OAuth2 refresh flow (existing in `MarketDataIngestorService.ts`)
3. If token refresh fails, fall back entirely to NSE Bhavcopy for that day
4. Store token expiry timestamp to avoid unnecessary refresh attempts

### 4.5 Retry & Resilience Specification

```typescript
interface RetryConfig {
    maxAttempts: 3;
    baseDelayMs: 1000;
    maxDelayMs: 8000;
    backoffMultiplier: 2;       // Exponential: 1s, 2s, 4s
    timeoutMs: 15000;           // Per-request timeout
    retryableStatusCodes: [408, 429, 500, 502, 503, 504];
}

interface RateLimitConfig {
    minDelayBetweenRequestsMs: 500;   // For NSE archives
    maxConcurrentRequests: 1;          // Sequential for NSE
    dailyRequestCap: 2000;             // For Yahoo Finance fallback
}
```

### 4.6 Data Quality Checks

| Check | Condition | Action |
|---|---|---|
| **Null/zero close** | `close <= 0 OR close IS NULL` | Reject row, log warning |
| **Zero volume** | `volume = 0` | Store with `quality_flag = 'ZERO_VOLUME'` |
| **Price spike** | `ABS((close - prev_close) / prev_close) > 0.20` | Flag for review; do not reject (could be genuine — IPO, split, etc.) |
| **Stale data** | Same OHLCV as previous day | Flag as `quality_flag = 'POSSIBLE_STALE'` |
| **Missing Tier 1** | Tier 1 stock absent from today's Bhavcopy | Attempt Yahoo Finance fallback |
| **Universe mismatch** | Row count < 80% of expected universe | Log alert; do not mark as successful ingestion |
| **Duplicate dates** | Same (symbol, trade_date) already exists | `INSERT OR REPLACE` — newer data wins |

### 4.7 Unified Data Access Layer

Refactor the strategy engine to read from `DailyOHLCV` instead of calling Yahoo Finance:

**Current flow (slow, fragile):**
```
PureTechnicalStrategiesEngine.scanUniverse()
  → fetchTickerData(symbol, 600, false)     // HTTP to Yahoo Finance
    → yahoo.query1.finance.yahoo.com        // 1 HTTP call per symbol
    → 8s timeout, no retry, empty catch
```

**Target flow (fast, resilient):**
```
PureTechnicalStrategiesEngine.scanUniverse()
  → DailyOHLCVReader.getCandlesForSymbol(symbol, startDate, endDate)
    → SELECT * FROM DailyOHLCV WHERE symbol = ? AND trade_date >= ? ORDER BY trade_date
    → ~5ms per query from local SQLite
```

Create a `DailyOHLCVReader` utility at `src/server/services/DailyOHLCVReader.ts`:

```typescript
class DailyOHLCVReader {
    getCandlesForSymbol(symbol: string, daysBack?: number): Promise<Candle[]>;
    getCandlesForDateRange(symbol: string, startDate: string, endDate: string): Promise<Candle[]>;
    getLatestDate(): Promise<string>;
    getSymbolDateRange(symbol: string): Promise<{ first: string; last: string; count: number }>;
    bulkGetCandles(symbols: string[], daysBack: number): Promise<Map<string, Candle[]>>;
}
```

### 4.8 Deprecation Plan for Legacy Tables

| Table | Current Use | Deprecation |
|---|---|---|
| `HistoricalPrices` | Close-only cache from Yahoo | **Phase out** — DailyOHLCV has full OHLCV |
| `NseBhavcopy` | Recent bhavcopy storage | **Migrate data → DailyOHLCV**, then freeze (keep for delivery % queries if needed) |
| `MarketSnapshots` | 80-symbol OHLCV + indicators | **Keep for indicators** — compute indicators from DailyOHLCV, store in MarketSnapshots |

### 4.9 Files to Create / Modify

| File | Change |
|---|---|
| `src/server/services/EODDataPipelineService.ts` | **NEW** — Daily pipeline orchestrator |
| `src/server/services/DailyOHLCVReader.ts` | **NEW** — Unified data access layer |
| `src/server/services/PureTechnicalStrategiesEngine.ts` | Replace `fetchTickerData()` calls with `DailyOHLCVReader` |
| `src/server/services/RegimeBacktestEngine.ts` | Replace `getDailyCandlesForScrip()` to use DailyOHLCVReader |
| `src/server/services/QuantitativeBacktestScheduler.ts` | Replace `MarketDataIngestorService.batchIngest()` with EOD pipeline |
| `src/server/yahooFinance.ts` | Remove `NODE_TLS_REJECT_UNAUTHORIZED = '0'`; add retry/backoff; demote to fallback-only |
| `src/server/routes/infra.ts` | Add `/api/data/pipeline/status`, `/api/data/pipeline/run`, `/api/data/pipeline/audit` |
| `src/server/database.ts` | Enable WAL mode; add quality_flag column to DailyOHLCV |

---

## 5. Phase 4: Strategy Parameterization Engine

### 5.1 Goal

Extract all ~65 hardcoded numeric thresholds from the 4 strategies into a typed configuration system, enabling users to:
- View the exact parameters used by each built-in strategy
- Clone a strategy template and modify parameters
- Save custom parameter combinations as named strategies
- Backtest any strategy configuration against historical data
- Compare results across parameter variations

### 5.2 `StrategyParameterConfig` Interface

```typescript
interface StrategyParameterConfig {
    // ── Metadata ──
    id?: string;                      // UUID for custom strategies
    name: string;                     // "VPA Base Breakout v2" or user-defined
    baseTemplate: 'STRATEGY_1' | 'STRATEGY_2' | 'STRATEGY_3' | 'STRATEGY_4' | 'CUSTOM';
    description?: string;
    createdAt?: string;
    lastBacktestAt?: string;

    // ── Group 1: Impulse Qualification ──
    impulse: {
        minGainPct: number;           // S1: 15, S2/S3/S4: 20
        minDurationBars: number;      // S1: 4, S3/S4: 8
        maxDurationBars: number;      // S1: 25, S2: 15 (move window), S3/S4: 25
        altTurnoverThresholdCr: number | null;  // S2/S3/S4: 50, S1: null (not used)
        useAltTurnover: boolean;      // S1: false, S2/S3/S4: true (OR condition)
    };

    // ── Group 2: Base / Pullback Structure ──
    structure: {
        baseDurationMin: number;      // S1: 10
        baseDurationMax: number;      // S1: 30
        retracementFloorMultiplier: number;  // S1: 0.45 (holds upper 55%)
        pullbackMinDropPct: number;   // S2: 1.5
        swingGapMinBars: number;      // S3/S4: 2 (min bars between swing points)
        l2SearchWindowBars: number;   // S3/S4: 10 (last N bars for L2)
        p0MaxLookbackBars: number;    // S1: 20, S3/S4: 25
    };

    // ── Group 3: Volume / VPA Signatures ──
    volume: {
        baseDryingRatio: number;              // S1: 0.80, S2: 0.75, S3/S4: 0.90
        vpaAsymmetryRatio: number;            // S1: 1.15 (up-vol / down-vol)
        institutionalDayTurnoverCr: number;   // S2/S3/S4: 2.0
        smartMoneyVolumeRatio: number;        // S3/S4: 1.3
        adtMultiplierForInstitutional: number; // S3/S4: 2.5
        adtFloorCr: number;                   // S3/S4: 1.0
    };

    // ── Group 4: Volatility Compression ──
    volatility: {
        atrShortPeriod: number;       // S1: 5
        atrLongPeriod: number;        // S1: 14
        atrContractionRatio: number;  // S1: 0.85
        nrLookbackShort: number;      // S1: 3 (NR4)
        nrLookbackLong: number;       // S1: 6 (NR7)
        nrScanWindowBars: number;     // S1: 5
    };

    // ── Group 5: Trend Alignment ──
    trend: {
        emaShortPeriod: number;       // S1: 9
        emaLongPeriod: number;        // S1: 21
        emaProximityMultiplier: number; // S1: 0.985
        rsiPeriod: number;            // S1: 14
        rsiBullishThreshold: number;  // S1: 50
        sma200TolerancePct: number;   // S3/S4: 2.0
        useSma200Filter: boolean;     // S3/S4: true, S1/S2: false
    };

    // ── Group 6: Entry Zone ──
    entry: {
        rangeContractionRatio: number;        // S2/S4: 0.85
        rangeContractionAltPctOfCmp: number;  // S2: 3.5 (%)
        volumeDryingRatio: number;            // S2/S4: 0.85
        volumeImpulseRatio: number;           // S2/S4: 0.80
        entryZoneLowerBandMultiplier: number; // S3/S4: 0.985 (L2 * 0.985)
        entryZoneUpperBandMultiplier: number; // S3/S4: 1.045 (L2 * 1.045)
        requireBothVolAndRangeContraction: boolean; // S4: true, S2: false (OR)
    };

    // ── Group 7: Risk Management ──
    risk: {
        stopLossMethod: 'FIXED_PCT' | 'FVG_BASED' | 'SWING_BASED';
        stopLossPct: number;          // S1: 2% below P0, S3/S4: 2% below L2
        stopLossFvgBufferPct: number; // S2: 1.5% below FVG bottom
        stopLossFallbackPct: number;  // S2: 5% below CMP (no FVG)
        target1Method: 'RR_MULTIPLE' | 'PEAK_RETEST' | 'SWING_RETEST';
        target1RRMultiple: number;    // S1: 2.0
        target2RRMultiple: number;    // S1: 3.5
        target2PeakExtensionPct: number; // S2: 10% above peak
        target2FibExtension: number;  // S3/S4: 0.618
        passedOpportunityPct: number; // S1: 15% above peak
    };

    // ── Group 8: Smart Money Detection ──
    smartMoney: {
        absorptionClosePctThreshold: number;  // S3/S4: 0.60 (close in upper 40% of range)
        absorptionVolRatio: number;           // S3/S4: 1.3
        lastMoveLookbackBars: number;         // S3/S4: 2 (bars before L2)
    };

    // ── Group 9: Filter Options ──
    filters: {
        preceding52wLow: boolean;             // Optional filter
        preceding52wLookbackBars: number;     // 252
        preceding52wTolerancePct: number;     // 2.5
        preceding52wMinImpulsePct: number;    // 20
    };

    // ── Group 10: Qualification Logic ──
    qualification: {
        secondaryMinPassing: number;          // S1: 3 (of 5)
        secondaryChecks: string[];            // S1: ['ATR', 'VOL_DRYING', 'VPA', 'NR', 'RSI']
    };
}
```

### 5.3 Default Templates (Built-In Strategies)

Each of the 4 current strategies becomes a factory function:

```typescript
function getStrategy1Defaults(): StrategyParameterConfig { /* ... */ }
function getStrategy2Defaults(): StrategyParameterConfig { /* ... */ }
function getStrategy3Defaults(): StrategyParameterConfig { /* ... */ }
function getStrategy4Defaults(): StrategyParameterConfig { /* ... */ }
```

These return the exact current hardcoded values — the behaviour of built-in strategies does not change.

### 5.4 Custom Strategy Storage

```sql
CREATE TABLE IF NOT EXISTS CustomStrategies (
    id                  TEXT PRIMARY KEY,    -- UUID
    name                TEXT NOT NULL UNIQUE,
    base_template       TEXT NOT NULL,       -- STRATEGY_1 | STRATEGY_2 | STRATEGY_3 | STRATEGY_4 | CUSTOM
    description         TEXT,
    parameters_json     TEXT NOT NULL,       -- Full StrategyParameterConfig as JSON
    is_active           INTEGER DEFAULT 1,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    last_backtest_at    TEXT,
    last_backtest_result_json TEXT           -- Summary stats from last backtest run
);
```

### 5.5 Engine Refactoring

**Current signature (hardcoded):**
```typescript
evaluateStrategy1(candles: Candle[], symbolOrInfo, companyName, options?)
```

**Target signature (parameterized):**
```typescript
evaluateStrategy(candles: Candle[], config: StrategyParameterConfig, symbolOrInfo, companyName)
```

**Approach — non-breaking refactor:**

1. Create a new **generic** `evaluateWithConfig(candles, config, symbolOrInfo, companyName)` method that reads all thresholds from `config` instead of inline literals.
2. Keep existing `evaluateStrategy1/2/3/4` methods as thin wrappers:
   ```typescript
   evaluateStrategy1(candles, symbolOrInfo, companyName, options?) {
       const config = getStrategy1Defaults();
       if (options?.filterPreceding52wLow) config.filters.preceding52wLow = true;
       return this.evaluateWithConfig(candles, config, symbolOrInfo, companyName);
   }
   ```
3. This ensures zero breaking changes — existing callers work identically.
4. New code paths (custom strategies, backtest variations) call `evaluateWithConfig` directly.

### 5.6 UI Design: Strategy Parameter Editor

**Location:** New tab in `IndependentTechnicalStrategiesView.tsx` or a dedicated `StrategyBuilderView.tsx`.

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│  STRATEGY BUILDER                                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  [Template Selector]  Strategy 1 ▼   [Clone] [New]      │
│                                                          │
│  Strategy Name: [  My Custom VPA v2                   ]  │
│                                                          │
│  ┌─ Impulse Qualification ─────────────────────────────┐ │
│  │  Min Gain %      [====●=======] 15.0%               │ │
│  │  Min Duration    [==●=========]  4 bars             │ │
│  │  Max Duration    [========●===] 25 bars             │ │
│  │  Alt Turnover    [  ] Enable   ₹ [50] Cr           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Volume / VPA ──────────────────────────────────────┐ │
│  │  Drying Ratio    [======●=====] 0.80                │ │
│  │  VPA Asymmetry   [====●=======] 1.15                │ │
│  │  Institutional   [===●========] ₹2.0 Cr            │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ... (collapsible sections for each parameter group)     │
│                                                          │
│  [Save Strategy]  [Backtest]  [Compare with Default]    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Key UI Features:**
- Slider + numeric input for each parameter
- Collapsible parameter groups
- "Compare with Default" shows diff between custom and base template
- "Backtest" runs the custom config against DailyOHLCV history
- Saved strategies appear in a sidebar list for quick switching

### 5.7 Backtest Integration

Custom strategies integrate with the existing backtest infrastructure:

```typescript
async function backtestCustomStrategy(
    config: StrategyParameterConfig,
    universe: string[],               // Symbols to test
    dateRange: { start: string; end: string },
    walkForwardBars?: number          // Optional walk-forward window
): Promise<BacktestResult> {
    const reader = new DailyOHLCVReader();
    const results: SignalResult[] = [];

    for (const symbol of universe) {
        const candles = await reader.getCandlesForDateRange(symbol, dateRange.start, dateRange.end);
        // Walk forward bar-by-bar from bar 30 to end
        for (let i = 30; i < candles.length; i++) {
            const slice = candles.slice(0, i + 1);
            const signal = engine.evaluateWithConfig(slice, config, symbol, symbol);
            if (signal.qualified) {
                results.push({ symbol, date: candles[i].date, signal });
            }
        }
    }

    return computeBacktestMetrics(results);
}
```

### 5.8 Files to Create / Modify

| File | Change |
|---|---|
| `src/server/services/StrategyParameterConfig.ts` | **NEW** — Interface + 4 default factory functions |
| `src/server/services/CustomStrategyService.ts` | **NEW** — CRUD for custom strategies (SQLite) |
| `src/server/services/PureTechnicalStrategiesEngine.ts` | Add `evaluateWithConfig()` method; refactor S1-S4 as wrappers |
| `src/server/database.ts` | Add `CustomStrategies` table |
| `src/server/routes/infra.ts` | Add `/api/strategies/custom` CRUD + `/api/strategies/backtest` |
| `src/components/StrategyBuilderView.tsx` | **NEW** — Parameter editor UI |
| `src/components/IndependentTechnicalStrategiesView.tsx` | Add "Strategy Builder" tab |
| `src/App.tsx` | Route for StrategyBuilderView if separate page |

---

## 6. Cost Analysis

### 6.1 Data Source Costs

| Source | Role | Cost | Notes |
|---|---|---|---|
| **Upstox API v2** | **Primary** (daily EOD + recent 2-yr backfill) | **$0** | Free tier (~250 req/min), requires Upstox account + OAuth setup |
| **NSE Bhavcopy Archives** | **Secondary** (deep history + validation + delivery data) | **$0** | Free public data, no API key, no registration |
| **Yahoo Finance** | **Last-resort fallback** | **$0** | Free unofficial API, no key required |
| **NSE EQUITY_L.csv** | Universe catalog | **$0** | Free, public download |

### 6.2 Infrastructure Costs

| Component | Cost | Notes |
|---|---|---|
| Database (SQLite) | **$0** | Local file, no server needed |
| Storage (~2 GB) | **$0** | Negligible local disk usage |
| Compute | **$0** | Runs on user's local machine |
| Hosting | **$0** | Electron desktop app, no cloud required |

### 6.3 Total Estimated Cost

| Item | One-Time | Recurring |
|---|---|---|
| Historical backfill (2021–present) | $0 | — |
| Daily EOD pipeline | — | $0 / day |
| Universe refresh | — | $0 / month |
| Custom strategy storage | $0 | $0 |
| **TOTAL** | **$0** | **$0 / month** |

### 6.4 Cost Comparison: Alternative Approaches

| Approach | Estimated Cost | Why Not |
|---|---|---|
| NSE Bhavcopy (recommended) | $0 | **Best option** |
| Commercial data vendor (e.g., TrueData, GlobalDataFeed) | $50–200/month | Unnecessary — free sources sufficient |
| Paid Yahoo Finance API (RapidAPI) | $10–50/month | Unnecessary — free tier works for fallback |
| Cloud database (PostgreSQL on AWS/GCP) | $20–50/month | Unnecessary — SQLite handles the volume |
| Dedicated time-series DB (InfluxDB, TimescaleDB) | $50–200/month | Over-engineered for ~5M rows |

---

## 7. Implementation Priority & Timeline

### 7.1 Phase Sequencing

Phases must be implemented in order — each phase depends on the previous:

```
Phase 1 (Universe)  ──→  Phase 2 (Backfill)  ──→  Phase 3 (Pipeline)  ──→  Phase 4 (Params)
   1–2 days                  2–3 days                 2–3 days                3–5 days
```

**Total estimated implementation time: 8–13 development days.**

### 7.2 Detailed Task Breakdown

#### Phase 1: Universe Expansion (1–2 days)

| Task | Est. Hours | Priority |
|---|---|---|
| Create `UniverseManagerService` | 3h | P0 |
| Add tier columns to MasterTickers | 1h | P0 |
| Parse EQUITY_L.csv and populate universe | 2h | P0 |
| Update strategy scanner queries to use full universe | 1h | P0 |
| Add `/api/universe/*` routes | 1h | P1 |
| UI for universe stats/refresh | 2h | P1 |

#### Phase 2: Historical Data Backfill (2–3 days)

| Task | Est. Hours | Priority |
|---|---|---|
| Create `DailyOHLCV` table schema + indexes | 1h | P0 |
| Create `IndianTradingCalendar` (holiday list) | 2h | P0 |
| Build `HistoricalBackfillService` orchestrator | 2h | P0 |
| Upstox backfill: extract & reuse candle fetch from `MarketDataIngestorService` | 3h | P0 |
| Upstox backfill: instrument key resolution + caching | 1h | P0 |
| Upstox backfill: throttling (250ms) + 4 concurrent workers | 1h | P0 |
| NSE Bhavcopy backfill: HTTP fetcher with retry/headers | 2h | P0 |
| NSE Bhavcopy backfill: CSV parser for `sec_bhavdata_full` format | 2h | P0 |
| Batch upsert with transactions | 1h | P0 |
| Migrate data from existing tables | 1h | P1 |
| Gap detection and Yahoo fallback (last-resort) | 2h | P1 |
| Backfill progress UI | 2h | P1 |
| `/api/data/backfill/*` routes | 1h | P1 |

#### Phase 3: Robust Daily Pipeline (2–3 days)

| Task | Est. Hours | Priority |
|---|---|---|
| Create `EODDataPipelineService` | 3h | P0 |
| Create `DailyOHLCVReader` | 2h | P0 |
| Scheduled 16:00 IST job with retry | 2h | P0 |
| Data quality validation checks | 2h | P0 |
| Refactor strategy engine to use DailyOHLCVReader | 3h | P0 |
| Remove `NODE_TLS_REJECT_UNAUTHORIZED = '0'` from Yahoo module | 0.5h | P0 |
| Add retry/backoff to Yahoo Finance (for fallback use) | 2h | P1 |
| Pipeline status dashboard UI | 2h | P1 |
| `/api/data/pipeline/*` routes | 1h | P1 |

#### Phase 4: Strategy Parameterization (3–5 days)

| Task | Est. Hours | Priority |
|---|---|---|
| Define `StrategyParameterConfig` interface | 2h | P0 |
| Create 4 default template factory functions | 2h | P0 |
| Build `evaluateWithConfig()` generic method | 6h | P0 |
| Refactor S1–S4 as wrappers | 2h | P0 |
| Create `CustomStrategies` table | 1h | P0 |
| Build `CustomStrategyService` CRUD | 3h | P0 |
| `/api/strategies/custom` CRUD routes | 2h | P1 |
| Strategy Builder UI (parameter editor) | 6h | P1 |
| Backtest integration for custom strategies | 4h | P1 |
| Compare/diff custom vs default | 2h | P2 |

### 7.3 Milestone Checkpoints

| Milestone | Deliverable | Day |
|---|---|---|
| **M1** | Universe expanded to ~5K stocks, tiered | Day 2 |
| **M2** | DailyOHLCV table populated with 2021–present data | Day 5 |
| **M3** | Daily pipeline running, strategy engine reads local DB | Day 8 |
| **M4** | Custom strategies can be created, saved, and backtested | Day 13 |

---

## 8. Risk Mitigation

### 8.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Upstox token expiry during EOD pipeline** | High | Medium | Auto-detect 401; trigger OAuth refresh; fall back to NSE Bhavcopy if refresh fails |
| **Upstox rate limiting (429)** | Medium | Medium | 250ms throttle; exponential backoff on 429; max 4 concurrent workers |
| **Upstox API downtime / maintenance** | Low | Medium | Full NSE Bhavcopy fallback covers all stocks for that day |
| **Upstox ISIN → instrument key mapping failure** | Medium | Low | Cache resolved instrument keys; fallback to NSE Bhavcopy per-symbol |
| **NSE archive rate limiting / IP block** | Medium | High | 500ms delay between requests; rotate User-Agent; fallback to Yahoo |
| **NSE changes CSV format** | Low | Medium | Version-detect CSV headers; alert on parsing failure |
| **NSE archives down / unreachable** | Low | Medium | Queue failed dates for retry; fallback to Yahoo Finance |
| **Data gaps after all three sources** | Very Low | Low | Gap detector + manual review + Yahoo Finance last-resort fill |
| **Corporate actions (splits, bonuses) not adjusted** | Medium | Medium | Upstox provides adjusted data (primary advantage); cross-validate with prev_close discontinuity detection |
| **SQLite write contention during scan + ingest** | Low | Low | WAL mode; ingest outside market hours; reader uses `PRAGMA read_uncommitted = ON` |
| **Memory pressure scanning 5K stocks** | Low | Medium | Stream from DB (not bulk load); process in batches of 50 |
| **Strategy parameterization regression** | Medium | High | Keep S1–S4 as wrappers calling defaults; comprehensive test suite comparing before/after |

### 8.2 Data Quality Risks

| Risk | Detection | Remediation |
|---|---|---|
| Missing dates in historical data | `detectGaps()` function | Auto-fill from Yahoo Finance |
| Stale/duplicate data | Same OHLCV check vs previous day | Flag + manual review |
| Incorrect symbol mapping (NSE symbol changes) | Symbol in Bhavcopy not in MasterTickers | Log unmapped symbols; weekly reconciliation |
| Survivorship bias in backtest | Only active stocks in universe | Maintain delisted symbols with `is_active = 0`; include in backtest |

### 8.3 Performance Risks

| Risk | Mitigation |
|---|---|
| 5K-stock scan too slow | Pre-filter by tier; parallelize strategy evaluation with worker threads |
| Backfill takes too long | Each Bhavcopy CSV covers all stocks; 1,000 downloads at 500ms = 8.3 minutes |
| DailyOHLCV table grows too large | Partition by year if needed; SQLite handles 50M+ rows routinely |
| Complex parameter UI is sluggish | Debounce slider inputs; only re-evaluate on "Apply" button |

---

## 9. Appendix A: Current State Audit Summary

### A.1 Data Tables — Current vs Target

| Table | Current State | Target State |
|---|---|---|
| `HistoricalPrices` | Close-only, ~150 symbols, up to 5 years | **Deprecated** — replaced by DailyOHLCV |
| `MarketSnapshots` | Full OHLCV + 13 indicators, 80 symbols, 200 days | **Keep for indicators** — compute from DailyOHLCV |
| `NseBhavcopy` | Full OHLCV + delivery, ~5 recent days | **Migrate to DailyOHLCV**, then freeze |
| `DailyOHLCV` | Does not exist | **NEW** — Full OHLCV + delivery, ~5K symbols, 2021–present |

### A.2 Fetch Architecture — Current vs Target

| Aspect | Current | Target |
|---|---|---|
| Strategy engine data source | Yahoo Finance (per-symbol HTTP, on-demand) | **DailyOHLCV (local SQLite)** |
| Daily EOD primary | None (on-demand only) | **Upstox API v2** (per-symbol, 250ms throttle, 4 workers) |
| Daily EOD secondary | — | **NSE Bhavcopy** (validation + delivery data enrichment) |
| Daily EOD last-resort | — | **Yahoo Finance** (for missing Tier 1 only) |
| Backfill (recent 2 yrs) | None | **Upstox API v2** (per-symbol, ~5 min) |
| Backfill (2021–2024) | None | **NSE Bhavcopy archives** (per-date CSV, ~7 min) |
| Backfill gap fill | None | **Yahoo Finance** (per-symbol, last resort) |
| Rate limiting | None | 250ms Upstox; 500ms NSE; 2000/day Yahoo cap |
| Error handling | Empty catch blocks | Exponential backoff, 3 retries, quality checks |
| SSL | `NODE_TLS_REJECT_UNAUTHORIZED = '0'` | Proper certificate handling |

### A.3 Key Files Reference

| File | Role | Lines |
|---|---|---|
| `src/server/yahooFinance.ts` | Primary price fetcher (to be demoted to fallback) | ~1,800 |
| `src/server/services/MarketDataIngestorService.ts` | OHLCV + indicators ingestor for 80 symbols | ~500 |
| `src/server/services/NseBhavcopyService.ts` | Single-day NSE Bhavcopy downloader | ~400 |
| `src/server/services/PureTechnicalStrategiesEngine.ts` | 4-strategy engine (to be parameterized) | 2,272 |
| `src/server/services/MasterTickerService.ts` | Universe catalog (42 hardcoded tickers) | ~200 |
| `src/server/services/RegimeBacktestEngine.ts` | Regime-aware backtester (750 universe) | ~500 |
| `src/server/services/QuantitativeBacktestScheduler.ts` | Hourly backtest scheduler (80 hardcoded) | ~220 |
| `src/server/database.ts` | SQLite schema + helpers | ~800 |
| `src/server/routes/infra.ts` | API routes for technical strategies | ~2,370 |
| `src/components/IndependentTechnicalStrategiesView.tsx` | Strategy scan UI | ~2,000 |

---

## 10. Appendix B: Complete Strategy Parameter Catalogue

### B.1 Strategy 1: VPA Alignment & Base Compaction Breakout

| # | Parameter | Current Value | Line | Group |
|---|---|---|---|---|
| 1 | Min candle history | 35 bars | 327 | Data |
| 2 | Base duration min | 10 sessions | 349 | Structure |
| 3 | Base duration max | 30 sessions | 349 | Structure |
| 4 | Impulse P0 lookback max | 20 bars | 353 | Structure |
| 5 | Impulse min duration | 4 bars | 372, 406 | Impulse |
| 6 | Impulse max duration | 25 bars | 372, 406 | Impulse |
| 7 | **Impulse gain threshold** | **15.0%** | 372, 406 | Impulse |
| 8 | Retracement floor multiplier | 0.45 | 412 | Structure |
| 9 | ATR short period | 5 | 427 | Volatility |
| 10 | ATR long period | 14 | 428 | Volatility |
| 11 | **ATR contraction ratio** | **0.85** | 434 | Volatility |
| 12 | **Volume drying ratio** | **0.80** | 440 | Volume |
| 13 | **VPA asymmetry ratio** | **1.15** | 463 | Volume |
| 14 | NR4 lookback | 3 | 473 | Volatility |
| 15 | NR7 lookback | 6 | 474 | Volatility |
| 16 | NR scan window | 5 bars | 469 | Volatility |
| 17 | EMA short period | 9 | 482 | Trend |
| 18 | EMA long period | 21 | 483 | Trend |
| 19 | EMA proximity multiplier | 0.985 | 489 | Trend |
| 20 | RSI period | 14 | 493 | Trend |
| 21 | **RSI bullish threshold** | **50.0** | 495 | Trend |
| 22 | Secondary checks min passing | 3 of 5 | 503 | Qualification |
| 23 | 52w low impulse threshold | 20.0% | 499 | Filter |
| 24 | Stop loss multiplier | P0 * 0.98 | 507 | Risk |
| 25 | Target 1 R:R multiplier | 2.0x | 509 | Risk |
| 26 | Target 2 R:R multiplier | 3.5x | 510 | Risk |
| 27 | Passed opportunity threshold | peak * 1.15 | 601 | Risk |

### B.2 Strategy 2: Institutional Inflow + FVG & CE Pullback

| # | Parameter | Current Value | Line | Group |
|---|---|---|---|---|
| 1 | Min candle history | 20 bars | 690 | Data |
| 2 | FVG lookback window | 35 bars | 707 | Structure |
| 3 | CE level formula | (top + bottom) / 2 | 717 | Entry |
| 4 | Move window bars | 15 sessions | 754 | Impulse |
| 5 | **Impulse gain threshold** | **20.0%** | 775 | Impulse |
| 6 | **Cumulative turnover threshold** | **₹50.0 Cr** | 775 | Impulse |
| 7 | Avg 20-vol reference window | -25 to -5 | 781 | Volume |
| 8 | **Institutional day turnover** | **₹2.0 Cr** | 794 | Volume |
| 9 | Pullback volume drying ratio | 0.75 | 810 | Volume |
| 10 | **Pullback min drop** | **1.5%** | 815 | Structure |
| 11 | P0 search extension | 10 bars | 855 | Structure |
| 12 | Entry slice bars | 3 | 837 | Entry |
| 13 | Entry range reference | 20 bars | 839 | Entry |
| 14 | **Entry range contraction ratio** | **0.85** | 843 | Entry |
| 15 | Entry range alt threshold | CMP * 3.5% | 843 | Entry |
| 16 | **Entry volume drying ratio** | **0.85** | 849 | Entry |
| 17 | Entry VPA impulse vol ratio | 0.80 | 849 | Entry |
| 18 | Entry last-bar vol threshold | 0.85 | 849 | Entry |
| 19 | 52w low impulse threshold | 20.0% | 870 | Filter |
| 20 | Stop loss (FVG) | bottom * 0.985 | 875 | Risk |
| 21 | Stop loss (fallback) | CMP * 0.95 | 875 | Risk |
| 22 | Target 1 | peakPrice | 877 | Risk |
| 23 | Target 2 multiplier | peak * 1.10 | 878 | Risk |

### B.3 Strategy 3: HH/HL Sequential Compaction + Smart Money

| # | Parameter | Current Value | Line | Group |
|---|---|---|---|---|
| 1 | Min candle history | 35 bars | 1138 | Data |
| 2 | L2 search window | last 10 bars | 1158 | Structure |
| 3 | H2-L2 gap | min 2 bars | 1163 | Structure |
| 4 | H2 lookback from L2 | max 20 bars | 1162 | Structure |
| 5 | L1-H2 gap | min 2 bars | 1170 | Structure |
| 6 | L1 lookback from H2 | max 20 bars | 1169 | Structure |
| 7 | H1-L1 gap | min 2 bars | 1178 | Structure |
| 8 | H1 lookback from L1 | max 20 bars | 1177 | Structure |
| 9 | P0-H1 min duration | 8 bars | 1186 | Structure |
| 10 | P0 lookback from H1 | max 25 bars | 1185 | Structure |
| 11 | **Impulse gain threshold** | **20.0%** | 1216 | Impulse |
| 12 | **Cumulative turnover threshold** | **₹50.0 Cr** | 1216 | Impulse |
| 13 | **Smart money day turnover** | **₹2.0 Cr** | 1217 | Smart Money |
| 14 | **Smart money volume ratio** | **1.3x** | 1217 | Smart Money |
| 15 | **Min impulse duration** | **8 bars** | 1391 | Impulse |
| 16 | SMA 200 tolerance | ±2.0% | 1225-1226 | Trend |
| 17 | PB1 volume drying ratio | 0.90 | 1252 | Volume |
| 18 | PB1 range compaction ratio | 0.95 | 1256 | Volatility |
| 19 | PB1 range compaction alt | CMP * 4% | 1256 | Volatility |
| 20 | Compaction recent bars | 4 | 1260 | Volatility |
| 21 | Smart money absorption close % | 0.60 | 1289 | Smart Money |
| 22 | Smart money absorption vol ratio | 1.3x | 1289 | Smart Money |
| 23 | ADT multiplier for institutional | 2.5x | 1292 | Smart Money |
| 24 | ADT floor | ₹1.0 Cr | 1292 | Smart Money |
| 25 | Entry zone lower band | L2 * 0.985 | 1404 | Entry |
| 26 | Entry zone upper band | L2 * 1.045 | 1404 | Entry |
| 27 | 52w low impulse threshold | 20.0% | 1412 | Filter |
| 28 | Stop loss | L2 * 0.98 | 1419 | Risk |
| 29 | Target 1 | H2 | 1421 | Risk |
| 30 | Target 2 Fibonacci extension | 0.618 | 1422 | Risk |

### B.4 Strategy 4: HH/HL + SMA 200 ±2% + Entry VPA Contraction

Inherits all Strategy 3 parameters, plus these additional/modified:

| # | Parameter | Current Value | Line | Group |
|---|---|---|---|---|
| 1 | **Entry vol drying ratio** | **0.85** | 1747 | Entry |
| 2 | **Entry vol impulse ratio** | **0.80** | 1747 | Entry |
| 3 | **Entry last-bar vol threshold** | **0.85** | 1747 | Entry |
| 4 | **Entry range contraction ratio** | **0.85** | 1753 | Entry |
| 5 | Entry range compaction alt | h2Range * 0.95 / CMP * 4% | 1753 | Entry |
| 6 | **VPA contraction requires BOTH vol AND range** | true | 1755 | Entry |
| 7 | 52w low impulse threshold | 20.0% | 1898 | Filter |

### B.5 Cross-Strategy Shared Parameters

| Parameter | S1 | S2 | S3 | S4 |
|---|---|---|---|---|
| 52w lookback bars | 252 | 252 | 252 | 252 |
| 52w tolerance | 2.5% | 2.5% | 2.5% | 2.5% |
| 52w impulse threshold | 20% | 20% | 20% | 20% |
| Turnover divisor (INR → Cr) | 1e7 | 1e7 | 1e7 | 1e7 |
| Cache TTL | 15 min | 15 min | 15 min | 15 min |
| Scan chunk size | 10 | 10 | 10 | 10 |
| Fetch lookback bars | 600 | 600 | 600 | 600 |

---

*End of Specification Document*
