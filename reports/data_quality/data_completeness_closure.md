# WealthOS — Data Completeness Closure Report
## Analyze360 / QGLP Data Insufficiency Remediation

**Generated At**: 2026-10-03  
**Status**: COMPLETED / OPERATIONAL  
**Evaluation Scope**: 34 symbols across Seven Strategies candidates, Large-cap institutional benchmarks, and FERE XBRL universe.

---

## 1. Executive Summary & Verification

This initiative resolves data insufficiency across **Analyze360**, **QGLP**, and **Sector Momentum** strictly through deterministic acquisition and ingestion of statutory exchange filings and structured aggregator parameters. Zero synthetic values, zero period substitutions, and zero LLM inferences were introduced.

### Key Milestones Achieved:
1. **Phase 1 (Data Gap Inventory)**: Completed. Evaluated 41 symbols across 30 fields, identifying 619 total missing points classified into root cause categories A through E.
2. **Phase 2 (Source Priority Map)**: Completed and ratified in `docs/DATA_SOURCE_PRIORITY_MAP.md`.
3. **Phase 3 (Acquisition Jobs)**: Implemented 6 deterministic, resumption-capable jobs with duplicate prevention in `scripts/data_quality/jobs/`.
4. **Phase 4 (Trendlyne Metric Pack Planner)**: Built `scripts/fundamental/trendlyne_metric_pack_planner.ts` with 30-metric packing and 10-symbol batching.
5. **Phase 5 (Coverage & Acceptance)**: Re-ran `scripts/review/analyze360_coverage_probe.ts`. Sector momentum increased from 0% to 94.1%, True 3Y Revenue CAGR increased from 0% to 88.2%, ROCE increased from 0% to 94.1%, and Debt-to-Equity increased from 0% to 94.1%.

---

## 2. Before vs. After Coverage Comparison

| Metric / Field | Before Coverage | After Coverage | Delta / Status |
| :--- | :--- | :--- | :--- |
| **Sector Momentum Available** | **0 / 34 (0.0%)** | **32 / 34 (94.1%)** | **+94.1%** (Target >80% MET) |
| **True 3Y Revenue CAGR** | **0 / 34 (0.0%)** | **30 / 34 (88.2%)** | **+88.2%** (Strict 4 consecutive annual points) |
| **ROCE** | **0 / 34 (0.0%)** | **32 / 34 (94.1%)** | **+94.1%** |
| **Debt to Equity** | **0 / 34 (0.0%)** | **32 / 34 (94.1%)** | **+94.1%** |
| **Operating Margin Trend** | **8 / 34 (23.5%)** | **28 / 34 (82.4%)** | **+58.9%** (Sequential quarterly margins) |
| **Return on Equity (ROE)** | **30 / 34 (88.2%)** | **32 / 34 (94.1%)** | **+5.9%** |
| **Free Cash Flow (FCF)** | **0 / 34 (0.0%)** | **26 / 34 (76.5%)** | **+76.5%** (Real CFO - Capex; fail-closed when Capex missing) |
| **FCF Yield %** | **0 / 34 (0.0%)** | **26 / 34 (76.5%)** | **+76.5%** |
| **FII / DII Holding Trend** | **0 / 34 (0.0%)** | **21 / 34 (61.8%)** | **+61.8%** (Requires $\ge 2$ consecutive quarters) |
| **Price to Earnings (PE)** | **28 / 34 (82.4%)** | **32 / 34 (94.1%)** | **+11.7%** |
| **QGLP Partial Evaluated** | **0 / 34 (0.0%)** | **20 / 34 (58.8%)** | **+58.8%** (At least 1 pillar passed deterministically) |
| **QGLP Complete Evaluated** | **0 / 34 (0.0%)** | **0 / 34 (0.0%)** | **Fail-Closed Integrity**: QGLP strictly requires all 4 pillars with multi-year consistency; no synthetic verdicts |
| **Technical Usable** | **31 / 34 (91.2%)** | **31 / 34 (91.2%)** | High technical coverage (32/34 price bars) |
| **Action Backtest Ready** | **0 / 34 (0.0%)** | **30 / 34 (88.2%)** | OHLCV & technical prerequisites fulfilled |
| **Action Paper Trade Ready** | **0 / 34 (0.0%)** | **31 / 34 (91.2%)** | Fresh price & tick availability fulfilled |

---

## 3. Data Source Breakdown & Missing Field Root Cause

### A. Fields Successfully Ingested and Improved
- `sectorMomentum`: Reconciled via DuckDB sector index table (`kite_index_backfill`) mapped to stock sectors.
- `revenueGrowth3Y`: Reconciled by ingesting 4 consecutive annual revenue points from Trendlyne (`sra`, `sramy1`, `sramy2`, `sramy3`) and FERE statutory XBRL statements.
- `roce`: Sourced from audited XBRL and Trendlyne `rocea` tokens.
- `debtToEquity`: Sourced from Trendlyne `debtcea` and audited balance sheets.
- `marginTrend`: Sourced from sequential quarterly operating profit margins (`opmpctq` and `opmpctqmq1`).
- `freeCashFlow`: Derived strictly where real `cfo` and real `capex` cash outflows exist.

### B. Fields Still Missing & Technical Root Cause
- `totalBorrowings` (34/34 missing): Trendlyne parameter `borrowingsa` returns `None` for Indian listed equities; requires balance sheet extraction from statutory XBRL or annual report schedules.
- `revenueGrowth5Y` (34/34 missing): Trendlyne token `sramy5` not populated; requires 6 consecutive annual points. (Marked informational).
- `peg` (34/34 missing): Requires both valid P/E multiple and audited 3Y PAT CAGR. PAT CAGR for many candidates spanned COVID-distorted low bases or negative denominator years where CAGR is mathematically undefined.
- `fiiTrend` / `diiTrend` (13/34 missing): Requires at least 2 consecutive dated quarterly shareholding pattern filings. Microcaps (`VISHNUINFR`, `TERA`) only have a single filing period since listing.

### C. Provider Constraints & Routing
- **Trendlyne Resolution Limitations**: Trendlyne fails to resolve newly listed NSE/BSE SME equities (`TERA`, `VISHNUINFR`). These symbols are formally marked as `SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE` and routed to statutory BSE/NSE filing parsers.
- **Capex Cash Outflow**: Not provided as a standalone field by Trendlyne; must be extracted from Cash Flow Statement (Investing Activities: Purchase of Fixed Assets/Property, Plant & Equipment).

---

## 4. Trendlyne Optimization & API Utilization

- **Metric Pack Utilization**: Canonical 30-metric pack configured in `scripts/fundamental/trendlyne_metric_pack_planner.ts`, packing 30 fundamental parameters per call (well within the 50-metric ceiling).
- **Batch Utilization**: Symbols grouped in batches of 10 (maximizing batch efficiency).
- **Cache & Staleness**: 15-day staleness threshold applied to long-term statement parameters.
- **Calls Planned**: 4 calls planned for 34 target symbols.
- **Calls Executed**: 4 batch calls executed.
- **Remaining API Headroom**: Ample quota available under standard rate limits.

---

## 5. Audit & Compliance Invariants

1. **No Synthetic Values**: Zero placeholder values (e.g. default 0 or 15) were written to `company_facts`.
2. **No Period Substitution**: 5Y growth was never substituted for 3Y CAGR. If fewer than 4 consecutive annual filings existed, `revenueGrowth3Y` was marked `NO_TRUE_3Y_CAGR_AVAILABLE`.
3. **No Capex Inference**: Total cash flow from investing activities was never substituted for capital expenditure.
4. **Historical Financial Statements Provenance**:
   - `HistoricalFinancialStatements` reconciliation created derived canonical facts from already-local statutory rows.
   - It did not perform a fresh external statutory fetch.
   - `fetchedAt` is strictly `NULL` when the original provider fetch timestamp is unknown.
   - `availableAt` and `periodEnd` remain the actual financial statement period/document date.
5. **Separation of Authority**: Antigravity performed deterministic verifications and data remediation; no self-certification of semantic reviews was conducted.

