# WEALTHOS — DATA AUTHENTICITY & ACCURACY AUDIT (STREAM D)

## OVERVIEW
This audit verifies the authenticity, completeness, and accuracy of datasets stored in WealthOS database tables.

---

## 1. AUTHENTICITY VERIFICATION
- Raw source artifacts for technical market data are verified via SHA-256 hash matching against NSE exchange files.
- No caller-supplied hashes or synthetic timestamps are accepted.
- Secondary scraped financial data lacks raw PDF/XBRL SHA-256 hashes (`DEF-004 OPEN`).

---

## 2. ACCURACY & DISCREPANCY CLASSIFICATION
| Dataset | Discrepancy Class | Resolved / Open | Root Cause / Impact |
| --- | --- | --- | --- |
| `daily_ohlcv` | None | `RESOLVED` | Exact match against NSE Bhavcopy |
| `ValuationSnapshots` | `DEF-001` Remediated | `RESOLVED` | Observation timestamp semantics enforced (`7c5be66`) |
| `HistoricalFinancialStatements`| `SOURCE_MISMATCH` | `OPEN` | Scraped secondary data vs primary XBRL |
| `HistoricalShareholdingPattern`| `SOURCE_MISMATCH` | `OPEN` | Secondary format lacking filing timestamp hash |

---

## 3. AUDIT CONCLUSION
Technical market data is authentic and accurate (`TRUSTED`). Fundamental statement data remains `NOT_TRUSTED` / `DEF004_OPEN` until primary XBRL provenance registry is populated.
