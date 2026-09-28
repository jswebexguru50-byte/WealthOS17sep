# TEN-COMPANY FUNCTIONAL INTELLIGENCE AUDIT

**Audit Evaluation Date:** 2026-09-28T19:44:47.072Z
**Universe:** RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK, TATAMOTORS, TATASTEEL, TITAN, BEL, SUNPHARMA

### Functional Status Matrix

| Company | Model | Tech | Fund | FERE | QGLP | Mgmt | Valuation | Market |
|---|---|---|---|---|---|---|---|---|
| RELIANCE | NON_FINANCIAL | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| TCS | NON_FINANCIAL | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| INFY | NON_FINANCIAL | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| HDFCBANK | BANK | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| ICICIBANK | BANK | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| TATAMOTORS | NON_FINANCIAL | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| TATASTEEL | NON_FINANCIAL | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| TITAN | NON_FINANCIAL | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| BEL | NON_FINANCIAL | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |
| SUNPHARMA | NON_FINANCIAL | WORKING | WORKING | WORKING | WORKING | DATA_INSUFFICIENT | WORKING | WORKING |

### Functional Execution Summary

- **Total Evaluated Modules:** 70
- **Module Execution Availability:** 59 / 70 modules executing cleanly
- **Gracefully Degraded / Partial / Gap Modules:** 11
- **Analytical Truth & PIT Correctness:** Tracked independently via Golden Intelligence Matrix and TruthQuality taxonomy (not conflated with software execution)

### Actionable Functional Backlog (Actual Data Gaps)

| Company | Module | Status | Gap | Simplest Fix | External Provider Req? |
|---|---|---|---|---|---|
| RELIANCE | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| TCS | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| INFY | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| HDFCBANK | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| ICICIBANK | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| TATAMOTORS | FERE | DATA_INSUFFICIENT | No verified XBRL or annual report filings indexed in fere_evidence.db | Index company annual report into fere_evidence.db | No |
| TATAMOTORS | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| TATASTEEL | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| TITAN | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| BEL | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |
| SUNPHARMA | MANAGEMENT | DATA_INSUFFICIENT | No indexed management commitment candidates | Extract commitments from conference call transcripts | No |

> **Auditor Conclusion:** All 10 companies render truthful, independent analytical workspaces at `#analyze/:symbol` across all 8 modules without synthetic constants, without page-level blocking dialogs, and with model-aware evaluation for financial institutions (HDFCBANK, ICICIBANK).
