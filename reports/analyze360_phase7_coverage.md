# WealthOS Analyze360 Phase 7 Coverage Report

**Date**: 2026-10-03T12:53:37.978Z
**Total Symbols Checked**: 34

## 1. Executive Usability Summary

| Category | Usable Count | Percentage |
| :--- | :--- | :--- |
| **Technical Usable (Valid Freshness & OHLCV)** | 31 / 34 | 91.2% |
| **Fundamental Usable (Key Financial Metrics Present)** | 18 / 34 | 52.9% |
| **Both Technical + Fundamental Usable** | 18 / 34 | 52.9% |
| **QGLP Complete (Score & Verdict Evaluated)** | 0 / 34 | 0.0% |
| **QGLP Partial (At Least 1 Pillar Evaluated)** | 20 / 34 | 58.8% |
| **QGLP Missing / Insufficient Data** | 14 / 34 | 41.2% |

## 2. Action Readiness Status

| Action Endpoint | Ready Count | Blocked Count | Readiness % |
| :--- | :--- | :--- | :--- |
| **Backtest Ready** | 30 | 4 | 88.2% |
| **Paper Trade Ready** | 31 | 3 | 91.2% |
| **Alert Create Ready** | 31 | 3 | 91.2% |

## 3. Field Coverage Matrix

| Field Name | Available | Missing | Coverage % | Top Missing Reason |
| :--- | :--- | :--- | :--- | :--- |
| `latestClose` | 32 | 2 | 94.1% | NO_OHLCV (2) |
| `latestOhlcvDate` | 32 | 2 | 94.1% | NO_OHLCV (2) |
| `ema20` | 32 | 2 | 94.1% | NO_EMA20 (2) |
| `sma20` | 32 | 2 | 94.1% | NO_SMA20 (2) |
| `sma50` | 32 | 2 | 94.1% | NO_SMA50 (2) |
| `sma200` | 31 | 3 | 91.2% | NO_SMA200 (3) |
| `rsi14` | 32 | 2 | 94.1% | NO_RSI (2) |
| `atrPct` | 32 | 2 | 94.1% | NO_ATR (2) |
| `sectorMomentum` | 32 | 2 | 94.1% | SECTOR_UNMAPPED (2) |
| `revenueGrowth3Y` | 30 | 4 | 88.2% | NO_TRUE_3Y_CAGR_AVAILABLE (4) |
| `revenueGrowth5Y` | 0 | 34 | 0.0% | NO_SALES_GROWTH_5Y (34) |
| `operatingProfit` | 16 | 18 | 47.1% | NO_OP_PROFIT (18) |
| `pat` | 18 | 16 | 52.9% | NO_PAT (16) |
| `marginTrend` | 28 | 6 | 82.4% | NO_SEQUENTIAL_QUARTERLY_MARGINS (6) |
| `debtToEquity` | 32 | 2 | 94.1% | NO_DEBT_RATIO (2) |
| `totalBorrowings` | 0 | 34 | 0.0% | NO_BORROWINGS_DATA (34) |
| `cfo` | 8 | 26 | 23.5% | NO_CFO_DATA (26) |
| `cfoToPat` | 27 | 7 | 79.4% | NO_MATCHED_PERIOD_CFO_AND_PAT (7) |
| `cfoToOperatingProfit` | 32 | 2 | 94.1% | NO_MATCHED_PERIOD_CFO_AND_OP_PROFIT (2) |
| `freeCashFlow` | 26 | 8 | 76.5% | NO_MATCHED_CFO_AND_CAPEX (8) |
| `fcfYield` | 26 | 8 | 76.5% | NO_MATCHED_CFO_AND_CAPEX (8) |
| `workingCapital` | 32 | 2 | 94.1% | NO_WORKING_CAPITAL_DATA (2) |
| `promoterHolding` | 32 | 2 | 94.1% | NO_PROMOTER_HOLDING (2) |
| `promoterPledge` | 32 | 2 | 94.1% | NO_PROMOTER_PLEDGE_DATA (2) |
| `fiiHolding` | 32 | 2 | 94.1% | NO_FII_DATA (2) |
| `diiHolding` | 32 | 2 | 94.1% | NO_DII_DATA (2) |
| `fiiTrend` | 21 | 13 | 61.8% | NO_FII_HOLDING_TREND (13) |
| `diiTrend` | 21 | 13 | 61.8% | NO_DII_HOLDING_TREND (13) |
| `roe` | 32 | 2 | 94.1% | NO_ROE (2) |
| `roce` | 32 | 2 | 94.1% | NO_ROCE (2) |
| `pe` | 32 | 2 | 94.1% | NO_PE (2) |
| `peg` | 0 | 34 | 0.0% | NO_PEG_DATA (34) |
| `demandOutlook` | 22 | 12 | 64.7% | NO_DEMAND_OUTLOOK_EVIDENCE (12) |
| `peerContext` | 32 | 2 | 94.1% | NO_PEER_CONTEXT_EVIDENCE (2) |
| `keyRisks` | 32 | 2 | 94.1% | NO_RISK_EVIDENCE (2) |
| `whatToWatchNext` | 22 | 12 | 64.7% | NO_WATCH_EVIDENCE (12) |

## 4. Top Missing Reasons (Across All Fields)

| Missing Reason Code | Occurrences |
| :--- | :--- |
| `NO_SALES_GROWTH_5Y` | 34 |
| `NO_BORROWINGS_DATA` | 34 |
| `NO_PEG_DATA` | 34 |
| `NO_CFO_DATA` | 26 |
| `NO_OP_PROFIT` | 18 |
| `NO_PAT` | 16 |
| `NO_MATCHED_CFO_AND_CAPEX` | 16 |
| `NO_FII_HOLDING_TREND` | 13 |
| `NO_DII_HOLDING_TREND` | 13 |
| `NO_DEMAND_OUTLOOK_EVIDENCE` | 12 |

## 5. Top Production Blockers

| Blocker Reason | Blocked Count |
| :--- | :--- |
| OHLCV data missing. | 9 |
| Requirements not met. | 1 |
