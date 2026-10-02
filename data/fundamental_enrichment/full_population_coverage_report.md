# WealthOS Full Population Fundamental Coverage Audit Report

**Generated:** 2026-09-29T03:35:06.461087+00:00  
**Audited Universe:** 3564 symbols from `full_population_manifest.json`  
**Audit Mode:** Strict Read-Only (`mode=ro`) — Zero database mutation  

## 1. Executive Summary

| Metric | Available Symbols | Coverage % | Primary Source |
|---|---|---|---|
| Promoter Holding | 413 | 11.59% | Upstox Fundamentals |
| Promoter Pledge | 179 | 5.02% | Upstox Fundamentals |
| Public / Free Float (Reported) | 0 | 0.0% | Verified Filings / None |
| Institutional Involvement (FII/DII) | 413 | 11.59% | Upstox Fundamentals |
| ROCE | 398 | 11.17% | Upstox Fundamentals |
| ROE | 407 | 11.42% | Upstox Fundamentals |
| CFO / Operating Profit | 0 | 0.0% | Upstox Fundamentals |
| FERE Verified Evidence | 0 | 0.0% | FERE Evidence DB |
| Management Commitments | 12 | 0.34% | FERE Management Claims |

> [!IMPORTANT]
> **Synchronization ≠ Completeness:** While Upstox endpoints were queried across the 3,564 symbols, field availability varies strictly by disclosure and upstream completeness. Unavailable data remains explicitly unavailable.

## 2. Shareholding Rule Compliance
- **Constitution Rule:** Public / free-float holding is NEVER derived as `100 - promoter - fii - dii`.
- Double-counting of institutional shares within public float is prohibited.
- Currently 0 symbols have source-verified standalone public float disclosures; the remaining 3564 remain `SOURCE_UNAVAILABLE` rather than fabricated.

## 3. Comprehensive Field Coverage Matrix

| Field Name | Category | Available | Partial | Unavailable | Coverage % | Primary Source |
|---|---|---|---|---|---|---|
| `promoter_holding` | shareholding | 413 | 0 | 3151 | 11.59% | UPSTOX_FUNDAMENTALS |
| `promoter_pledge` | shareholding | 179 | 0 | 3385 | 5.02% | UPSTOX_FUNDAMENTALS |
| `public_free_float` | shareholding | 0 | 0 | 3564 | 0.0% | N/A |
| `fii_holding` | shareholding | 413 | 0 | 3151 | 11.59% | UPSTOX_FUNDAMENTALS |
| `dii_holding` | shareholding | 413 | 0 | 3151 | 11.59% | UPSTOX_FUNDAMENTALS |
| `institutional_involvement` | shareholding | 413 | 0 | 3151 | 11.59% | UPSTOX_FUNDAMENTALS |
| `institutional_ownership_change` | shareholding | 164 | 381 | 3019 | 4.6% | UPSTOX_HOLDING_DIFF |
| `revenue` | financials | 181 | 0 | 3383 | 5.08% | COMPANY_FACTS |
| `quarterly_revenue` | financials | 0 | 0 | 3564 | 0.0% | N/A |
| `operating_profit` | financials | 181 | 0 | 3383 | 5.08% | COMPANY_FACTS |
| `quarterly_operating_profit` | financials | 0 | 0 | 3564 | 0.0% | N/A |
| `pat` | financials | 181 | 868 | 2515 | 5.08% | UPSTOX_FUNDAMENTALS |
| `quarterly_pat` | financials | 0 | 930 | 2634 | 0.0% | UPSTOX_FUNDAMENTALS |
| `cfo` | financials | 258 | 0 | 3306 | 7.24% | COMPANY_FACTS |
| `cfo_to_operating_profit` | financials | 0 | 0 | 3564 | 0.0% | N/A |
| `roe` | valuation_quality | 407 | 0 | 3157 | 11.42% | UPSTOX_FUNDAMENTALS |
| `roce` | valuation_quality | 398 | 0 | 3166 | 11.17% | UPSTOX_FUNDAMENTALS |
| `debt_to_equity` | valuation_quality | 9 | 0 | 3555 | 0.25% | COMPANY_FACTS |
| `book_value` | valuation_quality | 0 | 0 | 3564 | 0.0% | N/A |
| `pe_ratio` | valuation_quality | 0 | 0 | 3564 | 0.0% | N/A |
| `market_cap` | valuation_quality | 0 | 0 | 3564 | 0.0% | N/A |
| `sector` | classification | 2311 | 0 | 1253 | 64.84% | MASTER_TICKERS |
| `industry` | classification | 0 | 0 | 3564 | 0.0% | N/A |
| `sector_index_mapping` | classification | 0 | 0 | 3564 | 0.0% | N/A |
| `corporate_actions_events` | engines | 3527 | 0 | 37 | 98.96% | UPSTOX_FUNDAMENTALS |
| `fere_evidence` | engines | 0 | 0 | 3564 | 0.0% | N/A |
| `qglp_eligibility` | engines | 0 | 405 | 3159 | 0.0% | PARTIAL_INPUTS |
| `management_evidence_eligibility` | engines | 12 | 0 | 3552 | 0.34% | FERE_MANAGEMENT_CLAIMS |
| `stock_momentum_eligibility` | engines | 0 | 0 | 3564 | 0.0% | N/A |
| `sector_momentum_eligibility` | engines | 0 | 0 | 3564 | 0.0% | N/A |

## 4. Priority Acquisition Backlog (Top Missing Fields)

The following fields represent the highest-priority acquisition gaps for future targeted enrichment waves:

1. **`public_free_float`** (shareholding): 3564 symbols missing (100.0%)
2. **`quarterly_revenue`** (financials): 3564 symbols missing (100.0%)
3. **`quarterly_operating_profit`** (financials): 3564 symbols missing (100.0%)
4. **`cfo_to_operating_profit`** (financials): 3564 symbols missing (100.0%)
5. **`book_value`** (valuation_quality): 3564 symbols missing (100.0%)
6. **`pe_ratio`** (valuation_quality): 3564 symbols missing (100.0%)
7. **`market_cap`** (valuation_quality): 3564 symbols missing (100.0%)
8. **`industry`** (classification): 3564 symbols missing (100.0%)
9. **`sector_index_mapping`** (classification): 3564 symbols missing (100.0%)
10. **`fere_evidence`** (engines): 3564 symbols missing (100.0%)

## 5. Audit Conclusion
- Production database hashes remain completely intact.
- No fabricated data was substituted for missing disclosures.
- Backlog clearly separates disclosure gaps from engine execution failures.