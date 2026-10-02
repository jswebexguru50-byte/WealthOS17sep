# WealthOS Fundamental Intelligence Calibration Pilot — 200-Company Cohort Selection Methodology

## 1. Overview & Objective
This document formalizes the reproducible, deterministic selection methodology for the **WealthOS 200-Company Fundamental Intelligence Calibration Pilot**. 
The objective of this pilot is product calibration and coverage validation across WealthOS's canonical fundamental analysis capability.

In accordance with the WealthOS core principle:
> **"No evidence = no conclusion."**
> Zero LLM-invented, inferred, scored, or defaulted financial facts. Missingness, period/scope, source, and freshness are strictly preserved.

## 2. Market-Cap Composition & Sizing Rules
The cohort strictly enforces a deterministic 3-tier market capitalization distribution:
- **50 Large Cap**: Market Capitalization > ₹20,000 Cr
- **75 Mid Cap**: Market Capitalization ₹5,000 Cr – ₹20,000 Cr
- **75 Small Cap**: Market Capitalization < ₹5,000 Cr
**Total**: **200 Companies**

Market capitalization figures are sourced directly from verified primary endpoint snapshots (`profile` and `FEREEnrichedLedger`), expressed in INR Crores.

## 3. Stratification Across 15 Canonical Sectors
Within each market-cap tier, companies are stratified across the 15 canonical sectors where locally available:
1. **IT / Services** (`IT_SERVICES`)
2. **Banks, NBFCs & Insurance** (`BANKS_NBFC_INSURANCE`)
3. **Pharma & Healthcare** (`PHARMA_HEALTHCARE`)
4. **Capital Goods & Industrials** (`CAPITAL_GOODS_INDUSTRIALS`)
5. **Auto & Auto Ancillary** (`AUTO_AUTO_ANCILLARY`)
6. **Energy & Utilities** (`ENERGY_UTILITIES`)
7. **Metals & Mining** (`METALS_MINING`)
8. **Chemicals** (`CHEMICALS`)
9. **Consumer & Retail** (`CONSUMER_RETAIL`)
10. **FMCG** (`FMCG`)
11. **Real Estate** (`REAL_ESTATE`)
12. **Telecom & Media** (`TELECOM_MEDIA`)
13. **Infrastructure & Logistics** (`INFRASTRUCTURE_LOGISTICS`)
14. **Textiles** (`TEXTILES`)
15. **Agriculture & Commodities** (`AGRICULTURE_COMMODITIES`)

### Sieve & Stratum Coverage Summary:
| Canonical Sector | Large Cap (>₹20k Cr) | Mid Cap (₹5k-₹20k Cr) | Small Cap (<₹5k Cr) | Total Sector Cohort |
| :--- | :---: | :---: | :---: | :---: |
| **IT / Services** | 5 | 11 | 10 | 26 |
| **Banks, NBFCs & Insurance** | 15 | 14 | 6 | 35 |
| **Pharma & Healthcare** | 4 | 4 | 7 | 15 |
| **Capital Goods & Industrials** | 6 | 22 | 14 | 42 |
| **Auto & Auto Ancillary** | 5 | 2 | 4 | 11 |
| **Energy & Utilities** | 2 | 1 | 1 | 4 |
| **Metals & Mining** | 1 | 2 | 2 | 5 |
| **Chemicals** | 3 | 4 | 5 | 12 |
| **Consumer & Retail** | 1 | 4 | 8 | 13 |
| **FMCG** | 3 | 1 | 4 | 8 |
| **Real Estate** | 1 | 4 | 1 | 6 |
| **Telecom & Media** | 1 | 1 | 2 | 4 |
| **Infrastructure & Logistics** | 1 | 2 | 6 | 9 |
| **Textiles** | 1 | 1 | 4 | 6 |
| **Agriculture & Commodities** | 1 | 2 | 1 | 4 |
| **Total** | **50** | **75** | **75** | **200** |

## 4. Mandatory Cohort Inclusions Checklist
| Requirement | Threshold Quota | Cohort Actual | Audit Verdict |
| :--- | :---: | :---: | :---: |
| Current / Recent 7-Strategy Candidates | $\ge 50$ | **77** | **PASS** |
| Invested / Held Companies (`Holdings`) | $\ge 25$ | **49** | **PASS** |
| Data-Challenged / Missing Financials | $\ge 25$ | **200** | **PASS** |
| Promoter-Pledged Companies | $\ge 1$ | **13** | **PASS** |
| Unpledged Promoter Companies | $\ge 1$ | **187** | **PASS** |
| High Institutional Ownership (>25%) | $\ge 1$ | **33** | **PASS** |
| Low Institutional Ownership (<5%) | $\ge 1$ | **80** | **PASS** |
| Positive CFO Companies | $\ge 1$ | **82** | **PASS** |
| Negative CFO Companies | $\ge 1$ | **90** | **PASS** |
| Recently Listed / Short-History (<3 years or $\le 2$ periods) | $\ge 10$ | **15** | **PASS** |
| Thinly Traded / Low Liquidity (<15,000 shares/day) | $\ge 10$ | **13** | **PASS** |
| Corporate Actions / Insider / SAST / Deals | $\ge 10$ | **65** | **PASS** |
| Trendlyne MCP Endpoint Coverage | Recorded | **85** | **RECORDED** |

## 5. Replacement & Exception Handling Protocol
In alignment with repository governance:
1. **No unverified promotion**: An unverified company is never forced into a sector or market-cap bucket.
2. **Deterministic stratum replacement**: If a company fails canonical identity or has missing core profile data, it is recorded as a coverage exception and deterministically replaced from the exact same intended sector × market-cap stratum.
3. **Traceability**: All 200 companies are resolved to canonical symbols, ISINs, and verified sources.
