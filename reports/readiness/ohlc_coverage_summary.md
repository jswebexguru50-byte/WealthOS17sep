# WEALTHOS — FULL OHLC COVERAGE AUDIT SUMMARY

**Generated:** 2026-09-21T16:23:35.573Z  
**Target Database:** `portfolio.db` (READ-ONLY AUDIT)  
**Audit Scope:** Complete MasterTickers universe (3,654 instruments) vs DailyOHLCV (4,153,849 rows)  

---

## EXECUTIVE CONCLUSION: 2018 COVERAGE COMPLETENESS

> ### **ANSWER: NO — We DO NOT have complete OHLC history for all 3,654 MasterTickers from 2018.**
> 
> **Key Evidence:**
> 1. Across all 4,153,849 DailyOHLCV records, **only 6 symbols** have any historical data in 2018 (`HDFCBANK`, `ICICIBANK`, `INFY`, `RELIANCE`, `SBIN`, `TCS`).
> 2. The remaining **3,648 MasterTickers (99.84%) have ZERO OHLC observations in 2018**.
> 3. DailyOHLCV contains only **1,476 total rows for all of 2018** (an average of only 6 quotes per trading session).
> 4. The primary market-wide historical dataset begins on **2019-01-01** (which has 391,643 rows across 1,593 symbols).
> 5. Therefore, relying on the total row count of 4.15 million rows as proof of 2018 completeness was a false assumption.

---

## 1. GLOBAL DATABASE & CALENDAR METRICS

| Metric | Value | Details |
|---|---|---|
| **MasterTickers Count** | **3,654** | Total catalog instruments |
| **DailyOHLCV Total Rows** | **4,153,849** | Core historical price observations |
| **DailyOHLCV Global MIN(trade_date)** | **2018-01-01** | Earliest market date in DB |
| **DailyOHLCV Global MAX(trade_date)** | **2026-09-15** | Latest market date in DB |
| **Market Trading Sessions (Calendar)** | **2,160 days** | Distinct trading days represented in DailyOHLCV |
| **Distinct DailyOHLCV Symbols** | **3,761** | Unique symbols present in price table |
| **MasterTickers with >= 1 OHLC row** | **3,189** | 87.27% of catalog |
| **MasterTickers with NO OHLC rows** | **465** | 12.73% of catalog |

---

## 2. COVERAGE CLASSIFICATION BREAKDOWN

Every MasterTicker is classified into exactly one mutually exclusive category:

| Classification | Count | Percentage | Description |
|---|---|---|---|
| **`COMPLETE`** | **6** | **0.16%** | History present continuously from 2018 through latest market date (`HDFCBANK`, `ICICIBANK`, `INFY`, `RELIANCE`, `SBIN`, `TCS`). |
| **`NO_2018_HISTORY`** | **1336** | **36.56%** | Active pre-existing instruments trading continuously from 2019-01-01 to 2026-09-15, but missing 2018 data. |
| **`RECENT_LISTING`** | **801** | **21.92%** | Instruments that legitimately listed/began trading after 2019-01-01 (IPOs / migrations) and trade through to current date. |
| **`PARTIAL`** | **1046** | **28.63%** | Instruments with history present but incomplete: ceased trading before latest market date or have prolonged internal gaps. |
| **`NO_OHLC`** | **37** | **1.01%** | Standard NSE equities with 0 historical observations (e.g. delisted/merged like HDFC, TATAMTRDVR, or pending feeds). |
| **`IDENTITY_MISMATCH`** | **428** | **11.71%** | Instruments whose key cannot map to NSE Bhavcopy (BSE numeric scrips, Mutual Funds, US/Foreign equities, unlisted AIFs). |
| **TOTAL** | **3654** | **100.00%** | |

### Secondary Independent Audit Fields

| Independent Field | YES | NO | NOT_APPLICABLE | Total |
|---|---|---|---|---|
| **HISTORY_FROM_2018** | **6** (0.16%) | **3220** (88.12%) | **428** (11.71%) | **3654** |
| **CURRENT_HISTORY** (Reaches 2026-09-15) | **2162** (59.17%) | **1492** (40.83%) | — | **3654** |

---

## 3. HISTORICAL DATA ROWS & CALENDAR BY YEAR

| Year | Trading Sessions | Active Symbols | Total OHLC Rows | Average Rows / Day | Notes |
|---|---|---|---|---|---|
| **2018** | 246 | 6 | 1,476 | 6.0 | CRITICAL GAP: Only 6 pilot symbols included |
| **2019** | 242 | 1657 | 391,643 | 1618.4 | Standard full-market coverage |
| **2020** | 250 | 1713 | 419,633 | 1678.5 | Standard full-market coverage |
| **2021** | 248 | 1861 | 439,482 | 1772.1 | Standard full-market coverage |
| **2022** | 248 | 2023 | 479,358 | 1932.9 | Standard full-market coverage |
| **2023** | 245 | 2280 | 519,872 | 2121.9 | Standard full-market coverage |
| **2024** | 246 | 2878 | 622,167 | 2529.1 | Standard full-market coverage |
| **2025** | 252 | 3107 | 706,309 | 2802.8 | Standard full-market coverage |
| **2026** | 183 | 3502 | 573,909 | 3136.1 | Year-to-date (through September 15, 2026) |

---

## 4. MASTER-TICKER CATALOG BREAKDOWN

### By Exchange & Segment

| Exchange | Segment | Total MT | With OHLC | Without OHLC | Match Rate | Primary Cause of Non-Match |
|---|---|---|---|---|---|---|
| **NSE** | EQ | 3018 | 2973 | 45 | 98.51% | Merged/delisted entities (e.g. HDFC, TATAMTRDVR) |
| **BSE** | EQ | 547 | 213 | 334 | 38.94% | BSE numeric scrip codes not in NSE Bhavcopy |
| **MUTUAL_FUND** | MF | 38 | 0 | 38 | 0.00% | Mutual fund NAVs stored separately / non-equity |
| **UNKNOWN** | EQ | 20 | 3 | 17 | 15.00% | Normal match |
| **MUTUAL_FUND** | EQ | 10 | 0 | 10 | 0.00% | Mutual fund NAVs stored separately / non-equity |
| **NASDAQ** | EQ | 6 | 0 | 6 | 0.00% | US foreign securities not in domestic NSE feed |
| **US** | ETF | 6 | 0 | 6 | 0.00% | US foreign securities not in domestic NSE feed |
| **NYSE** | ETF | 4 | 0 | 4 | 0.00% | US foreign securities not in domestic NSE feed |
| **NASDAQ** | ETF | 1 | 0 | 1 | 0.00% | US foreign securities not in domestic NSE feed |
| **NSE** | UNLISTED | 1 | 0 | 1 | 0.00% | Merged/delisted entities (e.g. HDFC, TATAMTRDVR) |
| **NYSE** | EQ | 1 | 0 | 1 | 0.00% | US foreign securities not in domestic NSE feed |
| **US** | CASH | 1 | 0 | 1 | 0.00% | US foreign securities not in domestic NSE feed |
| **US** | FEE | 1 | 0 | 1 | 0.00% | US foreign securities not in domestic NSE feed |

---

## 5. THE 6 PILOT SYMBOLS WITH 2018 DATA

These are the ONLY 6 instruments in the entire database with 2018 OHLC observations:

| Symbol | Company Name | Min Date | Max Date | 2018 Rows | Total Rows | Expected Days | Missing Sessions | Classification |
|---|---|---|---|---|---|---|---|---|
| **HDFCBANK** | HDFC Bank Limited | 2018-01-01 | 2026-09-15 | 246 | 2159 | 2160 | 1 (2025-02-01 Budget session) | `COMPLETE` |
| **ICICIBANK** | ICICI Bank Limited | 2018-01-01 | 2026-09-15 | 246 | 2159 | 2160 | 1 (2025-02-01 Budget session) | `COMPLETE` |
| **INFY** | Infosys Limited | 2018-01-01 | 2026-09-15 | 246 | 2159 | 2160 | 1 (2025-02-01 Budget session) | `COMPLETE` |
| **RELIANCE** | Reliance Industries Limited | 2018-01-01 | 2026-09-15 | 246 | 2159 | 2160 | 1 (2025-02-01 Budget session) | `COMPLETE` |
| **SBIN** | State Bank of India | 2018-01-01 | 2026-09-15 | 246 | 2159 | 2160 | 1 (2025-02-01 Budget session) | `COMPLETE` |
| **TCS** | Tata Consultancy Services Limited | 2018-01-01 | 2026-09-15 | 246 | 2159 | 2160 | 1 (2025-02-01 Budget session) | `COMPLETE` |

---

## 6. RECONCILIATION SUMMARY (POINTS A–K)

- **A. Total MasterTickers:** **3654**
- **B. Breakdown by Classification:**
  - `COMPLETE`: **6** (0.16%)
  - `NO_2018_HISTORY`: **1336** (36.56%)
  - `RECENT_LISTING`: **801** (21.92%)
  - `PARTIAL`: **1046** (28.63%)
  - `NO_OHLC`: **37** (1.01%)
  - `IDENTITY_MISMATCH`: **428** (11.71%)
- **C. Count with OHLC beginning in 2018:** **6** (0.16%)
- **D. Count with OHLC beginning after 2018:** **3183** (87.11%)
- **E. Count with no OHLC:** **465** (12.73%)
- **F. Count with internal missing periods:** **2806** (76.79%)
- **G. Count reaching latest available OHLC date (2026-09-15):** **2162** (59.17%)
- **H. Total OHLC rows by year:** See Section 3 table (Total = 4,153,849)
- **I. Total distinct OHLC symbols:** **3761**
- **J. MasterTickers with no matching OHLC:** **465** (428 IDENTITY_MISMATCH + 37 NO_OHLC)
- **K. OHLC symbols with no matching MasterTicker:** **604** (e.g. `5PAISA`, ETF series, indices, delisted NSE scrips)

---

## 7. STRATEGIC IMPLICATIONS FOR STRATEGY ENGINES

1. **Backtesting Window:** Any strategy or backtest requiring data from **2018** will only execute against 6 stocks. All multi-stock screener rules requiring 2018 history will fail on 99.8% of the universe.
2. **Effective Universe Window (2020–2024):** As observed in the codebase, the strategy engine successfully targets **2020–2024**, where **2,100+ stocks** have robust, continuous daily observations.
3. **New Listings Integrity:** The 810 `RECENT_LISTING` stocks must not be penalized for missing pre-listing data.
4. **Authoritative Artifact:** Complete ticker-by-ticker details are archived in [`reports/readiness/ohlc_coverage_audit.csv`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/reports/readiness/ohlc_coverage_audit.csv).