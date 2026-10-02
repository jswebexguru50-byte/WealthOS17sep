# WealthOS Fundamental Interpretation Calibration Loop — Baseline Report

**Run ID:** `PILOT_RUN_001`  
**Phase:** `PILOT`  
**Date:** 2026-09-30T18:57:12.776Z  
**Status:** **FROZEN (BASELINE FROZEN — NO CODE EDITS IN BASELINE)**  

## 1. Executive Summary

| Metric | Count | Percentage |
|---|---|---|
| **Total Companies Reviewed** | **20** | 100% |
| **Total Claims Reviewed** | **100** | 100% |
| **SUPPORTED** | **74** | 74.0% |
| **REASONABLE** | **22** | 22.0% |
| **QUESTIONABLE** | **3** | 3.0% |
| **UNSUPPORTED** | **0** | 0.0% |
| **INSUFFICIENT_EVIDENCE** | **1** | 1.0% |

## 2. Module Breakdown

| Module | Supported / Reasonable | Questioned / Unsupported | Missing / Insufficient |
|---|---|---|---|
| **FUNDAMENTAL** | 76 | 3 | 1 |
| **VALUATION** | 20 | 0 | 0 |

## 3. Failure Taxonomy Distribution

| Issue Category | Occurrences | Nature |
|---|---|---|
| `INTERPRETATION_RULE_ERROR` | **1** | Interpretation Logic |
| `SECTOR_CONTEXT_MISSING` | **3** | Sector Nuance |
| `INSUFFICIENT_EVIDENCE` | **1** | Context |

## 4. Systemic Defect Clusters (Section 12 & 13)

### Financial / Banking Sector Rule Incompatibility (`CLUSTER_SECTOR_CONTEXT_01`)
- **Category:** `SECTOR_CONTEXT`
- **Affected Symbols (1):** HDFCBANK
- **Root Cause:** Generic non-financial balance sheet or margin rules applied to banks/NBFCs without adapting for NIM or loan book leverage.
- **Suggested Generalized Remediation:** Ensure BusinessModelClassifier routes banks and NBFCs to dedicated banking ratio evaluation (NIM, Cost-to-Income, Gross NPA) instead of EBITDA margin.
- **Anti-Overfitting Constraint:** Do NOT write `if (symbol === "HDFCBANK")`; Use businessModel === "BANK" or "NBFC"

### Margin Delta Threshold & Scale Sensitivity (`CLUSTER_MARGIN_INTERPRETATION_02`)
- **Category:** `MARGIN_INTERPRETATION`
- **Affected Symbols (1):** HDFCBANK
- **Root Cause:** Fixed 50 bps threshold treats tiny delta in high-margin businesses the same as razor-thin margin businesses.
- **Suggested Generalized Remediation:** Adopt proportional margin delta (e.g. delta relative to baseline margin) alongside absolute bps threshold.
- **Anti-Overfitting Constraint:** Do NOT write symbol-specific margin thresholds

### Capital Efficiency Metric Selection & Thresholds (`CLUSTER_ROCE_ROE_03`)
- **Category:** `ROCE_ROE_INTERPRETATION`
- **Affected Symbols (1):** HDFCBANK
- **Root Cause:** Static 18% ROCE threshold labels capital-intensive utilities or regulated infrastructure as low return without considering cost of capital or regulatory ROE.
- **Suggested Generalized Remediation:** Introduce sector-specific return benchmarks (e.g. 12-14% for regulated utilities/infra, 15%+ for banks, 18%+ for asset-light FMCG/IT).
- **Anti-Overfitting Constraint:** Do NOT hardcode utility company names

## 5. Reviewed Cohort Details (20 Equities)

| Symbol | Company Name | Sector | Cap Category | Claims Reviewed | Questioned |
|---|---|---|---|---|---|
| **TCS** | Tata Consultancy Services Limited | Technology | Large Cap | 5 | 0 |
| **INFY** | Infosys Limited | Technology | Large Cap | 5 | 0 |
| **BAJFINANCE** | Bajaj Finance Limited | Financial Services | Large Cap | 5 | 0 |
| **HDFCBANK** | HDFC Bank Limited | Financial Services | Large Cap | 5 | **3** |
| **RELIANCE** | Reliance Industries Limited | Energy | Large Cap | 5 | 0 |
| **TATAMOTORS** | Tata Motors Limited | Consumer Cyclical | Large Cap | 5 | 0 |
| **TATASTEEL** | Tata Steel Limited | Basic Materials | Large Cap | 5 | 0 |
| **SUNPHARMA** | Sun Pharmaceutical Industries Limited | Healthcare | Large Cap | 5 | 0 |
| **TITAN** | Titan Company Limited | Consumer Cyclical | Large Cap | 5 | 0 |
| **LTIM** | LTIMindtree Limited | Technology | Large Cap | 5 | 0 |
| **LT** | Larsen & Toubro Limited | Industrials | Large Cap | 5 | 0 |
| **ASTRAL** | Astral Limited | Industrials | Mid Cap | 5 | 0 |
| **POLYCAB** | Polycab India Limited | Industrials | Large/Mid Cap | 5 | 0 |
| **DEEPAKNTR** | Deepak Nitrite Limited | Basic Materials | Mid Cap | 5 | 0 |
| **PIDILITIND** | Pidilite Industries Limited | Basic Materials | Large Cap | 5 | 0 |
| **AAVAS** | Aavas Financiers Limited | Financial Services | Mid/Small Cap | 5 | 0 |
| **CLEAN** | Clean Science and Technology Limited | Basic Materials | Mid/Small Cap | 5 | 0 |
| **RAMCOIND** | Ramco Industries Limited | Industrials | Small Cap | 5 | 0 |
| **DYCL** | Dynamic Cables Limited | Industrials | Small Cap | 5 | 0 |
| **STYL** | Seshaasai Technologies Limited | Technology | Small Cap | 5 | 0 |
