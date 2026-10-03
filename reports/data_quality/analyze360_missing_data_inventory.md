# WealthOS Analyze360 Missing Data Inventory

**Generated At**: 2026-10-03T14:38:11.784Z
**Total Symbols Checked**: 41

## 1. Classification of Missing Data

Every missing data instance across the 41 inspected stocks is strictly classified into 5 root causes:

| Classification Code | Description | Count | Action Required |
| :--- | :--- | :--- | :--- |
| **A** | Source data exists locally, but resolver mapping is missing / unmapped | **0** | Surgical resolver mapping updates |
| **B** | Source data not ingested | **156** | Routine scheduled provider acquisition (Trendlyne / Upstox / Kite) |
| **C** | Provider unlikely to have it (early microcap / unlisted / SME) | **0** | Fail-closed transparency; no action possible |
| **D** | Requires statutory exchange filing / XBRL extraction (FERE) | **257** | FERE XBRL parser / statutory statement backfill |
| **E** | Requires sector index OHLCV acquisition | **2** | Sector Index OHLCV ingestion & map |

## 2. Field Availability & Missingness Summary

| Field Name | Available | Missing | % Available | Top Reason Code |
| :--- | :--- | :--- | :--- | :--- |
| `technicalOhlcv` | 39 | 2 | 95.1% | NO_OHLCV |
| `sectorMomentum` | 39 | 2 | 95.1% | SECTOR_UNMAPPED |
| `revenueGrowth3Y` | 30 | 11 | 73.2% | NO_TRUE_3Y_CAGR_AVAILABLE |
| `revenueGrowth5Y` | 0 | 41 | 0% | NO_SALES_GROWTH_5Y |
| `operatingProfit` | 16 | 25 | 39% | NO_OP_PROFIT |
| `pat` | 18 | 23 | 43.9% | NO_PAT |
| `marginTrend` | 28 | 13 | 68.3% | NO_SEQUENTIAL_QUARTERLY_MARGINS |
| `debtToEquity` | 34 | 7 | 82.9% | NO_DEBT_RATIO |
| `totalBorrowings` | 0 | 41 | 0% | NO_BORROWINGS_DATA |
| `cfo` | 8 | 33 | 19.5% | NO_CFO_DATA |
| `cfoToPat` | 32 | 9 | 78% | NO_MATCHED_PERIOD_CFO_AND_PAT |
| `cfoToOperatingProfit` | 34 | 7 | 82.9% | NO_MATCHED_PERIOD_CFO_AND_OP_PROFIT |
| `freeCashFlow` | 31 | 10 | 75.6% | NO_MATCHED_CFO_AND_CAPEX |
| `fcfYield` | 31 | 10 | 75.6% | NO_MATCHED_CFO_AND_CAPEX |
| `workingCapital` | 39 | 2 | 95.1% | NO_WORKING_CAPITAL_DATA |
| `promoterHolding` | 39 | 2 | 95.1% | NO_PROMOTER_HOLDING |
| `promoterPledge` | 39 | 2 | 95.1% | NO_PROMOTER_PLEDGE_DATA |
| `fiiHolding` | 39 | 2 | 95.1% | NO_FII_DATA |
| `diiHolding` | 39 | 2 | 95.1% | NO_DII_DATA |
| `fiiTrend` | 22 | 19 | 53.7% | NO_FII_HOLDING_TREND |
| `diiTrend` | 22 | 19 | 53.7% | NO_DII_HOLDING_TREND |
| `roe` | 39 | 2 | 95.1% | NO_ROE |
| `roce` | 34 | 7 | 82.9% | NO_ROCE |
| `pe` | 39 | 2 | 95.1% | NO_PE |
| `peg` | 0 | 41 | 0% | NO_PEG_DATA |
| `demandOutlook` | 23 | 18 | 56.1% | NO_DEMAND_OUTLOOK_EVIDENCE |
| `peerContext` | 39 | 2 | 95.1% | NO_PEER_CONTEXT_EVIDENCE |
| `keyRisks` | 39 | 2 | 95.1% | NO_RISK_EVIDENCE |
| `whatToWatchNext` | 23 | 18 | 56.1% | NO_WATCH_EVIDENCE |
| `qglpVerdict` | 0 | 41 | 0% | QGLP_PILLARS_INCOMPLETE |

## 3. Top Missing Fields

| Rank | Field Name | Missing Symbols | % Missing | Root Classification |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `revenueGrowth5Y` | 41 / 41 | 100% | Category B |
| 2 | `totalBorrowings` | 41 / 41 | 100% | Category D |
| 3 | `peg` | 41 / 41 | 100% | Category B |
| 4 | `qglpVerdict` | 41 / 41 | 100% | Category D |
| 5 | `cfo` | 33 / 41 | 80.5% | Category D |
| 6 | `operatingProfit` | 25 / 41 | 61% | Category D |
| 7 | `pat` | 23 / 41 | 56.1% | Category D |
| 8 | `fiiTrend` | 19 / 41 | 46.3% | Category B |
| 9 | `diiTrend` | 19 / 41 | 46.3% | Category B |
| 10 | `demandOutlook` | 18 / 41 | 43.9% | Category D |
| 11 | `whatToWatchNext` | 18 / 41 | 43.9% | Category D |
| 12 | `marginTrend` | 13 / 41 | 31.7% | Category D |
| 13 | `revenueGrowth3Y` | 11 / 41 | 26.8% | Category D |
| 14 | `freeCashFlow` | 10 / 41 | 24.4% | Category D |
| 15 | `fcfYield` | 10 / 41 | 24.4% | Category B |

## 4. Top Missing Reasons

| Rank | Missing Reason Code | Occurrences | Primary Driver |
| :--- | :--- | :--- | :--- |
| 1 | `NO_SALES_GROWTH_5Y` | 41 | Strict deterministic validation without synthetic proxies |
| 2 | `NO_BORROWINGS_DATA` | 41 | Strict deterministic validation without synthetic proxies |
| 3 | `NO_PEG_DATA` | 41 | Strict deterministic validation without synthetic proxies |
| 4 | `QGLP_PILLARS_INCOMPLETE` | 41 | Strict deterministic validation without synthetic proxies |
| 5 | `NO_CFO_DATA` | 33 | Strict deterministic validation without synthetic proxies |
| 6 | `NO_OP_PROFIT` | 25 | Strict deterministic validation without synthetic proxies |
| 7 | `NO_PAT` | 23 | Strict deterministic validation without synthetic proxies |
| 8 | `NO_MATCHED_CFO_AND_CAPEX` | 20 | Strict deterministic validation without synthetic proxies |
| 9 | `NO_FII_HOLDING_TREND` | 19 | Strict deterministic validation without synthetic proxies |
| 10 | `NO_DII_HOLDING_TREND` | 19 | Strict deterministic validation without synthetic proxies |
| 11 | `NO_DEMAND_OUTLOOK_EVIDENCE` | 18 | Strict deterministic validation without synthetic proxies |
| 12 | `NO_WATCH_EVIDENCE` | 18 | Strict deterministic validation without synthetic proxies |

## 5. Symbol Level Sample Breakdown (Top Candidates)

| Symbol | Company Name | Sector | Market Cap (₹ Cr) | Missing Fields Count | Sample Missing Fields |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **EMAMIREAL** | Emami Realty Limited | Real Estate | N/A | 5 | `revenueGrowth5Y`, `totalBorrowings`, `cfo`... |
| **MOTISONS** | Motisons Jewellers Limited | Consumer Cyclical | N/A | 5 | `revenueGrowth5Y`, `totalBorrowings`, `cfo`... |
| **DIVYADHAN** | Divyadhan Recycling Industries Limited | Textiles Apparels & Accessories | N/A | 11 | `revenueGrowth5Y`, `operatingProfit`, `pat`... |
| **GUJRAFFIA** | Gujarat Raffia Industries Limited | Commercial Services & Supplies | N/A | 5 | `revenueGrowth5Y`, `totalBorrowings`, `cfo`... |
| **JITFINFRA** | JITF Infralogistics Limited | Industrials | N/A | 5 | `revenueGrowth5Y`, `totalBorrowings`, `cfo`... |
| **K2INFRA** | K2 Infragen Limited | Cement and Construction | N/A | 11 | `revenueGrowth5Y`, `operatingProfit`, `pat`... |
| **PRAJIND** | Praj Industries Limited | Industrials | N/A | 7 | `revenueGrowth5Y`, `totalBorrowings`, `cfo`... |
| **KONSTELEC** | Konstelec Engineers Limited | Cement and Construction | N/A | 11 | `revenueGrowth5Y`, `operatingProfit`, `pat`... |
| **VLINFRA** | V.L.Infraprojects Limited | Cement and Construction | N/A | 11 | `revenueGrowth5Y`, `operatingProfit`, `pat`... |
| **SUDARCOLOR** | Sudarshan Colorants India Limited | Basic Materials | N/A | 5 | `revenueGrowth5Y`, `totalBorrowings`, `cfo`... |
| **VISHNUINFR** | Vishnusurya Projects and Infra Limited | Industrial & Specialty Growth | N/A | 13 | `revenueGrowth3Y`, `revenueGrowth5Y`, `operatingProfit`... |
| **TERA** | N/A | N/A | N/A | 30 | `technicalOhlcv`, `sectorMomentum`, `revenueGrowth3Y`... |
| **USHAMART** | Usha Martin Limited | Basic Materials | N/A | 9 | `revenueGrowth5Y`, `operatingProfit`, `pat`... |
| **INFY** | Infosys Limited | Information Technology | N/A | 8 | `revenueGrowth5Y`, `operatingProfit`, `totalBorrowings`... |
| **TCS** | Tata Consultancy Services Limited | Information Technology | N/A | 10 | `revenueGrowth5Y`, `operatingProfit`, `totalBorrowings`... |