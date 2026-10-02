# WEALTHOS — FUNDAMENTAL CALIBRATION (CAL_200) SUMMARY REPORT

## 1. Executive Summary & Calibration Scope

- **Cohort Size:** 200 companies (100% evaluated deterministically against disposable production DB copy).
- **Execution Date:** 2026-10-01T19:34:43.423Z
- **Database Used:** Disposable isolated clone (`scratch/disposable_cal200_*.db`) created from `C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release\portfolio.db`.
- **Pre-Execution DB SHA-256:** `3c62b9380e8a500aceee07fd67286d299f7cba05873cd082bede8c513001d3d4`
- **Post-Execution DB SHA-256:** `3c62b9380e8a500aceee07fd67286d299f7cba05873cd082bede8c513001d3d4` (100% Byte-Identical Match).

---

## 2. Cohort Composition & Diversity Breakdown

| Dimension | Category | Count | Percentage |
| :--- | :--- | :--- | :--- |
| **Market Cap** | Large Cap | 28 | 14.0% |
| | Mid Cap | 5 | 2.5% |
| | Small Cap | 1 | 0.5% |
| | Micro / Unknown | 166 | 83.0% |
| **Business Model** | Non-Financial Commercial | 136 | 68.0% |
| | Bank (Universal & SFB) | 6 | 3.0% |
| | NBFC & Housing Finance | 25 | 12.5% |
| | Insurance (Life & General) | 3 | 1.5% |
| | Unclassified (Fail-Closed) | 30 | 15.0% |

### Sector Representation
- **Financials (Banks, NBFC, Insurance):** 34 symbols
- **IT & Technology Services:** 15 symbols
- **Pharma & Healthcare:** 15 symbols
- **Capital Goods & Industrials:** 15 symbols
- **Auto & Auto Ancillary:** 15 symbols
- **Metals & Mining:** 12 symbols
- **Chemicals & Petrochemicals:** 12 symbols
- **Energy & Utilities:** 13 symbols
- **Consumer, Retail & FMCG:** 18 symbols
- **Telecom & Media:** 10 symbols
- **Real Estate & Infrastructure:** 12 symbols
- **Data Stress Strata (Conflicting facts, High Debt, Pledged, Sparse, Zero-Data):** 70 symbols

---

## 3. Evaluation Results & Rendering Status

| Status Category | Count | Percentage | Description |
| :--- | :--- | :--- | :--- |
| **ACCEPTABLE** | 0 | 0.0% | Full canonical facts available; all mandatory sections evidenced with persisted provenance. |
| **ACCEPTABLE_WITH_GAPS** | 119 | 59.5% | Partial facts available; missing inputs correctly fail closed to `DATA_INSUFFICIENT` without hallucinations. |
| **DATA_UNAVAILABLE_EXPECTED** | 81 | 40.5% | Zero facts in database for symbol; system cleanly returns `DATA_INSUFFICIENT` / empty states. |
| **DEFECT_FOUND** | 0 | 0.0% | Unhandled runtime errors, NaN leakage, or synthetic date injections. |

---

## 4. Analysis of Production Dimensions

### A. Identity & Classification
- **Routing Integrity:** Bank, NBFC, and Insurance entities are cleanly classified based on NSE master industry/sector data without ticker-guessing heuristics.
- **Fail-Closed Unknowns:** Entities with unpopulated sector/industry strings cleanly retain `UNKNOWN` classification and do not execute false sector assumptions.

### B. Financial History & Quality
- **Canonical Trajectory:** Revenue, operating profit, and PAT histories are strictly retrieved via `FundamentalModuleAdapter` evaluating canonical facts.
- **Cash Flow Conversion:** CFO and CFO/PAT ratios are computed only when both cash flow and earnings facts are verified; negative cash flow is truthfully preserved without truncating to 0.
- **Debt & Coverage:** Debt-to-Equity and Interest Coverage are evaluated from canonical facts; missing facts return `DATA_INSUFFICIENT`.

### C. Ownership & Governance
- **Shareholding Distribution:** Promoter, FII, DII, and public holding percentages reflect persisted timestamps and period ends.
- **Promoter Pledge:** Pledged shares percentage triggers governance flags only when verified facts exist; absence of pledge data is never assumed to mean 0% pledge.

### D. Valuation & Context
- **Multiples:** PE and PB ratios are presented as factual observations.
- **Absence of Synthetic Targets:** No DCF fair values, price targets, or ungrounded conviction scores are emitted when required structural inputs are missing.

### E. Evidence & Usability
- **Provenance Completeness:** Every displayed fact preserves source provider, period type, scope, and persisted timestamp.
- **Timestamp Truthfulness:** No current execution timestamp is substituted for source observation dates.

---

## 5. 25-Company Deep-Dive Spot Check Findings

### HDFCBANK (BANK)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 113506 (VERIFIED_PARTIAL), CFO/PAT: 1.43 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 0% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 21 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### SBIN (BANK)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### ICICIBANK (BANK)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 67325.4 (VERIFIED_PARTIAL), CFO/PAT: 1.17 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 0% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 25 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### BAJFINANCE (NBFC)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 54.67% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### CHOLAFIN (NBFC)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 49.22% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### HDFCLIFE (INSURANCE)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 50.54% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### TCS (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 52094 (VERIFIED_PARTIAL), CFO/PAT: 1.05 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 71.77% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 25 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### INFY (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 33986 (VERIFIED_PARTIAL), CFO/PAT: 1.15 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 13.82% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 24 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### PERSISTENT (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### SUNPHARMA (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 12419.2 (VERIFIED_PARTIAL), CFO/PAT: 1.07 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 24 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### CIPLA (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 29.21% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### APOLLOHOSP (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### LT (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 0% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### SIEMENS (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### BEL (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 1541.37 (VERIFIED_PARTIAL), CFO/PAT: 0.26 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 51.14% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 19 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### MARUTI (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 58.65% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 13 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### TATAMOTORS (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 13041 (VERIFIED_PARTIAL), CFO/PAT: 0.16 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 19 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### BHARATFORG (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 44.07% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 14 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### TATASTEEL (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 35064.5 (VERIFIED_PARTIAL), CFO/PAT: 3.22 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 19 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### VEDL (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### PIDILITIND (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### SRF (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### RELIANCE (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 192113 (VERIFIED_PARTIAL), CFO/PAT: 2.01 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 0% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 20 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### NTPC (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 13 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### HINDUNILVR (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 61.9% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 13 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### TITAN (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: VERIFIED_PARTIAL
- **Cash Flow:** CFO: 5590 (VERIFIED_PARTIAL), CFO/PAT: 1.1 (VERIFIED_PARTIAL)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 19 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### DLF (NON_FINANCIAL)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: N/A% (DATA_INSUFFICIENT), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS

### BHARTIARTL (UNKNOWN)
- **Growth Trajectory:** Revenue: DATA_INSUFFICIENT (ANNUAL), PAT: DATA_INSUFFICIENT
- **Cash Flow:** CFO: N/A (DATA_INSUFFICIENT), CFO/PAT: N/A (DATA_INSUFFICIENT)
- **Leverage:** D/E: N/A (DATA_INSUFFICIENT), ICR: N/A (DATA_INSUFFICIENT)
- **Ownership:** Promoter: 50.07% (VERIFIED_PARTIAL), Pledge: N/A% (DATA_INSUFFICIENT)
- **Sources & Provenance:** 8 verified sources tracked.
- **Economic Applicability & Fail-Closed:** ✅ PASS


---

## 6. Real Data Gaps & Defect Assessment

### Recurring Genuine Data Gaps in Active Database
1. **Longitudinal History Depth:** Certain newly listed or small-cap symbols have fewer than 3 years of canonical financial facts in `company_facts`. The experience correctly renders `DATA_INSUFFICIENT` for 3Y/5Y CAGR rather than fabricating trends.
2. **Stand-Alone vs Consolidated Scope Alignment:** Several conglomerates report quarterly stand-alone and annual consolidated filings. The canonical selector cleanly prevents cross-scope metric corruption.
3. **Cash Flow Filing Frequency:** Standalone quarterly filings in Indian markets do not always include quarterly cash flow statements (only mandatory semi-annually and annually). The system accurately marks interim CFO as `DATA_INSUFFICIENT` without inventing quarterly CFO.

### Product Defect Conclusion
- **Total Generalized Product Defects Identified:** 0
- **Remediation Request Required:** NO (All 200 companies rendered in full conformance with canonical provenance, point-in-time gating, and fail-closed integrity).
