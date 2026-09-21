# M.4 Unresolved Date Remediation — Forensic Analysis

**Population**: M4_UNRESOLVED_DATE_REMEDIATION
**Total**: 7009
**Accounted**: 7009 | **UNACCOUNTED**: 0
**Runtime state**: MANUAL_REVIEW | DATE_NOT_IN_PROVIDER_RESPONSE

> **Important**: Root causes below are forensic candidates only. No root cause is established fact.
> Absence from portfolio.db does NOT prove absence from provider.
> Weekend/holiday classification is a candidate only — independent calendar verification required.

## Root-Cause Summary

| Root Cause | Count | % |
|-----------|-------|---|
| NO_DATA_FOR_INSTRUMENT | 7009 | 100.0% |

## By Exchange

| Exchange | Count |
|---------|-------|
| BSE | 7009 |

## By Year

| Year | Count |
|------|-------|
| 2024 | 7009 |

## Top 20 Providers by Unresolved Count

| Provider Key | Unresolved Dates |
|-------------|-----------------|
| BSE_EQ|INE0H3U01013 | 163 |
| BSE_EQ|INE0KYI01012 | 163 |
| BSE_EQ|INE0R0M01014 | 163 |
| BSE_EQ|INE0RBX01014 | 163 |
| BSE_EQ|INE0TKX01011 | 163 |
| BSE_EQ|INE0UMH01018 | 163 |
| BSE_EQ|INE0V3T01017 | 163 |
| BSE_EQ|INE0X6O01027 | 163 |
| BSE_EQ|INE0YD301010 | 163 |
| BSE_EQ|INE0YZ901011 | 163 |
| BSE_EQ|INE11XK01017 | 163 |
| BSE_EQ|INE132201018 | 163 |
| BSE_EQ|INE147701010 | 163 |
| BSE_EQ|INE163401016 | 163 |
| BSE_EQ|INE18HI01019 | 163 |
| BSE_EQ|INE1C3F01018 | 163 |
| BSE_EQ|INE1CLW01015 | 163 |
| BSE_EQ|INE1EVO01017 | 163 |
| BSE_EQ|INE1FEW01013 | 163 |
| BSE_EQ|INE1GM501015 | 163 |

## Recommended Remediation by Root Cause

| Root Cause | Action |
|-----------|--------|
| WEEKEND_CANDIDATE | Cross-reference NSE/BSE holiday calendar. If confirmed non-trading day: RESOLVED_NON_TRADING. |
| PRE_LISTING_CANDIDATE | Verify instrument listing date from exchange records. If pre-listing confirmed: RESOLVED_PRE_LISTING. |
| GAP_IN_DATA | Investigate via alternate provider (Zerodha bhavcopy, NSE/BSE direct). Check for trading halt, suspension, circuit breaker. |
| NO_DATA_FOR_INSTRUMENT | Verify instrument status: delisted? wrong ISIN? Try alternate provider. |
| UNKNOWN | Manual forensic investigation required. |

---

*Production DB writes: 0. This population is isolated from the 18,244 promotion set.*
