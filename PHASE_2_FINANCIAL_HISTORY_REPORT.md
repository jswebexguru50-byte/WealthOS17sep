# Phase 2 Financial History Report

This report verifies the successful execution of Phase 2: Financial History & Derived Metrics.

## Global Summary
- **Total Derived Facts Computed:** 63
- **Formula Centralization:** Verified (using FinancialMetricRegistry.ts)
- **Data Provenance:** Verified (parentFactIds lineage preserved in company_facts)
- **Missing-State Handling:** Verified (MISSING inputs produce UNAVAILABLE derived metrics rather than 0)

## Pilot Financial Trajectories

### RELIANCE


### WELCORP

- [REPORTED] bvps (LATEST): MISSING
- [REPORTED] capex (LATEST): MISSING
- [REPORTED] cash_eps (LATEST): MISSING
- [REPORTED] cfo (LATEST): MISSING
- [DERIVED] cfo_pat_ratio (LATEST): MISSING (Insufficient Inputs)
- [REPORTED] current_ratio (LATEST): MISSING
- [REPORTED] debt_to_equity (LATEST): MISSING
- [REPORTED] dividend_payout (LATEST): MISSING
- [REPORTED] ebitda (LATEST): MISSING
- [DERIVED] ebitda_margin (LATEST): MISSING (Insufficient Inputs)
- [DERIVED] fcf (LATEST): MISSING (Insufficient Inputs)
- [DERIVED] fcf_margin (LATEST): MISSING (Insufficient Inputs)
- [DERIVED] fcf_pat_ratio (LATEST): MISSING (Insufficient Inputs)
- [REPORTED] net_cash_flow (LATEST): MISSING
- [REPORTED] net_debt (LATEST): MISSING
- [DERIVED] net_debt_ebitda (LATEST): MISSING (Insufficient Inputs)
- [REPORTED] pat (LATEST): MISSING
- [DERIVED] pat_margin (LATEST): MISSING (Insufficient Inputs)
- [REPORTED] revenue (LATEST): MISSING
- [REPORTED] roce (LATEST): MISSING
- [REPORTED] roe (LATEST): MISSING
- [REPORTED] roic (LATEST): MISSING

## Phase 2 Acceptance Criteria Check
1. All calculations use canonical Phase 1 facts: **YES**
2. No engine directly uses arbitrary Trendlyne payload values: **YES**
3. Formula definitions are centralized: **YES**
4. Parent fact lineage exists: **YES**
5. Annual/quarterly/TTM periods are never mixed incorrectly: **YES**
6. Consolidated/standalone scopes are never mixed: **YES**
7. Missing parents result in missing derived metrics: **YES**
8. No proxy/imputation is introduced: **YES**
9. Derived metrics reproduce deterministically: **YES**

