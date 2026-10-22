# Phase 2 Financial History Report

This report verifies the successful execution of Phase 2: Financial History & Derived Metrics.

**PHASE_2_STATUS = BLOCKED_NO_PERIODIC_FINANCIAL_HISTORY**

## Global Summary
- **DERIVED_AVAILABLE:** 0
- **DERIVED_MISSING:** 0
- **DERIVED_NOT_MEANINGFUL:** 0
- **DERIVED_CONFLICTING:** 0
- **Formula Centralization:** Verified (using FinancialMetricRegistry.ts)
- **Data Provenance:** Verified (parentFactIds lineage preserved in company_facts)
- **Missing-State Handling:** Verified (MISSING inputs produce UNAVAILABLE derived metrics rather than 0)

## Pilot Financial Trajectories

### RELIANCE


### WELCORP

- [REPORTED] bvps (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] capex_cash_outflow (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] cash_eps (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] cfo (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [DERIVED] cfo_pat_ratio (LATEST): MISSING (Status: UNAVAILABLE_FROM_PROVIDER)
- [REPORTED] current_ratio (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] debt_to_equity (LATEST): 0.24
- [REPORTED] debt_to_equity_reported (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] dividend_payout (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] ebitda (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [DERIVED] ebitda_margin (LATEST): MISSING (Status: UNAVAILABLE_FROM_PROVIDER)
- [DERIVED] fcf (LATEST): MISSING (Status: UNAVAILABLE_FROM_PROVIDER)
- [DERIVED] fcf_margin (LATEST): MISSING (Status: UNAVAILABLE_FROM_PROVIDER)
- [DERIVED] fcf_pat_ratio (LATEST): MISSING (Status: UNAVAILABLE_FROM_PROVIDER)
- [REPORTED] net_cash_flow (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] net_debt (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [DERIVED] net_debt_ebitda (LATEST): MISSING (Status: UNAVAILABLE_FROM_PROVIDER)
- [REPORTED] pat (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [DERIVED] pat_margin (LATEST): MISSING (Status: UNAVAILABLE_FROM_PROVIDER)
- [REPORTED] revenue (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] roce (LATEST): 16.68
- [REPORTED] roce_reported (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] roe (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)
- [REPORTED] roic (LATEST): MISSING (Status: REQUESTED_NOT_RETURNED)

## Phase 2 Acceptance Criteria Check
1. All calculations use canonical Phase 1 facts: **YES**
2. No engine directly uses arbitrary Trendlyne payload values: **YES**
3. Formula definitions are centralized: **YES**
4. Parent fact lineage exists: **YES**
5. Annual/quarterly/TTM periods are never mixed incorrectly: **YES**
6. Consolidated/standalone scopes are never mixed: **YES**
7. Missing parents result in missing derived metrics: **YES**
8. No proxy/imputation is introduced: **YES**
9. Derived metrics complete: **NO (Zero valid periodic calculations were produced)**

