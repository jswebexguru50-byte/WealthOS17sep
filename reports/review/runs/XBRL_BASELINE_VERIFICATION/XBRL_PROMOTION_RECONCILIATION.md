# Exact XBRL Quantitative Promotion Reconciliation

**Program**: `XBRL_CANONICAL_BASELINE_VERIFICATION`  
**Evaluation Date**: 2026-10-02  
**Source Database**: `data/fere/verified_filings/fere_evidence.db`  
**Target Database**: `portfolio.db::company_facts`  
**Status**: `VERIFIED_MATHEMATICAL_TIE`  

---

## 1. The Core Reconciliation Problem

The previous summary noted two figures that appeared disconnected without granular reconciliation:
- **779,298** rows processed/promoted by the pipeline.
- **529,760** net row increase in `portfolio.db::company_facts`.

This document establishes the exact mathematical proof demonstrating how these two figures reconcile with 100% precision.

---

## 2. Complete Mathematical Ledger

```
Total Source Facts in verified_xbrl_fact:           3,354,422
├── Mapped Canonical Taxonomy Facts (in FIELD_MAP): 1,165,211  (34.74%)
│   ├── Eligible Facts (all 7 required gates non-null): 1,165,211 (100.0%)
│   │   ├── Deduplicated Group Attempts (MAX(id) wins):   779,298 (66.88%)
│   │   │   ├── Inserted As New Metric Rows in DB:        529,760 (67.98% of attempts)
│   │   │   └── Updated/Replaced In-Place Existing Rows:  249,538 (32.02% of attempts)
│   │   └── Collapsed Duplicate Filings / Restatements:   385,913 (33.12% of eligible)
│   └── Ineligible Facts (null url/sha256/dates):               0
└── Unmapped Source Facts (evidence inventory):     2,189,211  (65.26%)
```

---

## 3. Mathematical Proof Ties

### Tier 1: Source Estate Decomposition
$$\text{SOURCE\_FACTS } (3,354,422) = \text{MAPPED\_FACTS } (1,165,211) + \text{UNMAPPED\_FACTS } (2,189,211)$$
- **MAPPED_FACTS**: Exact count of rows in `verified_xbrl_fact` matching the 33 active taxonomy keys in `FIELD_MAP`.
- **UNMAPPED_FACTS**: Exact count of rows stored as generic evidence inventory (`xbrl_*`).

### Tier 2: Deduplication Collapse
$$\text{MAPPED\_FACTS } (1,165,211) = \text{DEDUPLICATED\_ATTEMPTS } (779,298) + \text{COLLAPSED\_DUPLICATES } (385,913)$$
- To prevent filing duplication, the pipeline groups by `(isin, symbol, taxonomy_field, period_start, period_end, scope)` and selects `MAX(id)` (latest verified filing wins).
- Exactly 385,913 older filings/re-filings were collapsed, yielding 779,298 unique point-in-time tuples.

### Tier 3: Database Mutation Mechanics (Why 779,298 yielded 529,760 net new rows)
$$\text{DEDUPLICATED\_ATTEMPTS } (779,298) = \text{INSERTED\_NEW } (529,760) + \text{UPDATED\_EXISTING } (249,538)$$
- `company_facts` enforces:
  - `PRIMARY KEY (factId)`
  - `UNIQUE (companyId, metric, periodEnd, periodType, scope, factType, calculationMethod)`
- The pipeline executes `INSERT OR REPLACE INTO company_facts`.
- For the **24 new metrics**, no previous records existed in `company_facts`. All **529,760** rows were inserted as **brand-new rows**.
- For the **9 original metrics** (already promoted in earlier runs), records already existed. All **249,538** rows were **updated in place** with updated metadata, refreshed `availableAt`, and filing SHA256 hashes.

### Tier 4: Database Estate Delta
$$\text{CURRENT\_FERE\_FACTS } (1,028,470) = \text{PREVIOUS\_FERE\_FACTS } (498,710) + \text{NET\_DELTA } (529,760)$$
$$\text{CURRENT\_TOTAL\_FACTS } (1,152,797) = \text{PREVIOUS\_TOTAL\_FACTS } (623,037) + \text{NET\_DELTA } (529,760)$$
- Non-FERE facts in `company_facts` (`TRENDLYNE_MCP`, `BSE`, `NSE`, etc.) remained strictly untouched at exactly **124,327** rows before and after the run.

---

## 4. Reconciled Metrics Table

| Metric Category | Count | Status | Notes |
|---|---|---|---|
| `SOURCE_FACTS` | 3,354,422 | Exact | Total raw facts in `fere_evidence.db` |
| `MAPPED_SOURCE_FACTS` | 1,165,211 | Exact | Mapped to WealthOS `FIELD_MAP` |
| `UNMAPPED_SOURCE_FACTS` | 2,189,211 | Exact | Preserved in archive as generic evidence |
| `ELIGIBLE_SOURCE_FACTS` | 1,165,211 | Exact | 100% pass validity gates |
| `DEDUPLICATED_GROUPS` | 779,298 | Exact | Grouped by company/period/metric/scope |
| `COLLAPSED_DUPLICATES` | 385,913 | Exact | Older filings superseded by latest |
| `VALIDATION_SKIPS` | 0 | Exact | Zero invalid dates, scopes, tickers |
| `PROMOTION_ATTEMPTS` | 779,298 | Exact | Passed to database writer |
| `INSERTED_NEW` | 529,760 | Exact | Net new rows for 24 new metrics |
| `UPDATED_EXISTING` | 249,538 | Exact | In-place updates for 9 original metrics |
| `NET_DATABASE_DELTA` | 529,760 | Exact | Exact increase in `company_facts` |

Every single category mathematically ties to the exact row.
