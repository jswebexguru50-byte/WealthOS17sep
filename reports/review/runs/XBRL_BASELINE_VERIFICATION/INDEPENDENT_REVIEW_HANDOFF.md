# WealthOS XBRL Baseline Remediation & Deterministic Verification
## Independent Review Handoff Dossier

- **Program Name**: `XBRL_CANONICAL_BASELINE_VERIFICATION`
- **Baseline Git Commit**: `51bdc013fb554859ee1e56e91d3a684cceafbf87`
- **Target Branch**: `ai-review`
- **Implementer / Deterministic Verifier**: Antigravity
- **Authorized Independent Semantic Reviewer**: Codex (Temporarily unavailable due to usage limits)
- **Program Final Status**: **`AWAITING_INDEPENDENT_REVIEW`**

---

## 1. Constitutional Governance & Separation of Concerns

Under WealthOS Constitutional Precedence (enforced in `AGENTS.md`):
1. **Codex Authority**: Codex is the sole authorized independent semantic reviewer for WealthOS. Antigravity does NOT self-certify semantic reviews, pass CAL calibrations, tune narrative thresholds, or replace Codex.
2. **Review State**: Because Codex is temporarily unavailable due to external usage limits, this program CANNOT be marked `PASS`. It is strictly marked **`AWAITING_INDEPENDENT_REVIEW`**.
3. **No Unwarranted Action**: No developer-authored subjective grading has been run as a substitute. CAL_020 semantic calibration has NOT been started. Historical Codex review findings remain intact.

---

## 2. Structured Verification Breakdown

### A. PROVEN_DETERMINISTICALLY

1. **Exact Mathematical Reconciliation**:
   - Every single source fact in `verified_xbrl_fact` ties mathematically to `company_facts`.
   - `SOURCE_FACTS`: 3,354,422
   - `MAPPED_SOURCE_FACTS`: 1,165,211
   - `UNMAPPED_SOURCE_FACTS`: 2,189,211 (3,354,422 - 1,165,211)
   - `ELIGIBLE_SOURCE_FACTS`: 1,165,211 (100% pass date, value, ticker, and scope gates)
   - `DEDUPLICATED_GROUPS` / `PROMOTION_ATTEMPTS`: 779,298
   - `COLLAPSED_DUPLICATES`: 385,913 (1,165,211 - 779,298)
   - `INSERTED_NEW`: 529,760 net new rows in `company_facts`
   - `LEGACY_FERE_UPDATED_SUPERSEDED`: 249,538 rows
   - `TOTAL_FERE_FACTS`: 1,028,470 (498,710 + 529,760)
   - `TOTAL_COMPANY_FACTS`: 1,152,797 (623,037 + 529,760)
   - `NON_FERE_FACTS`: 124,327 (100% preserved and untouched)

2. **24 New Canonical Metric Mappings**:
   - Audited against raw XBRL taxonomy tokens, labels, accounting statements, period types, sign conventions, and scales.
   - All 24 mappings deterministically verified in `XBRL_24_METRIC_MAPPING_AUDIT.json` and `.md`.

3. **Unit Typing and Scaling**:
   - Per-share metrics (`eps_basic`, `eps_diluted`, `face_value`) are typed `INR_PER_SHARE` and preserved as unscaled values (NOT divided by $10^7$).
   - Ratio metrics (`debt_to_equity`, `dscr`, `roa`) are typed `RATIO` and are dimensionless.
   - `roa` is proven to be a **decimal fraction** (e.g., 0.0082 = 0.82%), NOT a percentage.
   - `debt_to_equity` and `dscr` are proven to be **dimensionless multiples** (e.g., 1.47x, 4.9x).
   - Monetary aggregates (`other_income`, `total_income`, `employee_expenses`, etc.) are scaled by $10^7$ (`INR_CR`).

4. **Period Semantics**:
   - `QUARTERLY` facts have duration 80–100 days.
   - `HALF_YEARLY` (170–200 days), `NINE_MONTHS` (250–290 days), and `ANNUAL` (330–380 days) are segregated in `periodType`.
   - Zero silent relabeling of YTD filings as discrete quarters.

5. **Scope Separation**:
   - `CONSOLIDATED` and `STANDALONE` facts have distinct primary keys (`factId`) incorporating the scope tag.
   - They co-exist in `company_facts` without collision or mutual overwriting.

6. **Point-in-Time (PIT) Integrity**:
   - Sample of 100,000 promoted facts verified:
     - 100% have valid filing lags (`availableAt > periodEnd`). Mean lag: 45.6 days; median lag: 43.0 days.
     - 0 future leakage (`availableAt < periodEnd`).
     - 0 periodEnd substitutions (`availableAt == periodEnd`).

7. **Deterministic Test Suite**:
   - 13/13 automated vitest unit tests passing in `tests/unit/xbrl_baseline_verification.test.ts`.

---

### B. CORRECTED

1. **Derived-Metric Semantics (`CFO + CFI`)**:
   - Previous claim that `CFO + CFI` represents conventional Free Cash Flow (`FCF`) has been corrected.
   - Added `operating_plus_investing_cash_flow_derived` to `FinancialMetricRegistry.ts` (DERIVED).
   - Conventional `fcf` is preserved as requiring explicit Capex (`CFO - Capex`), and is guarded against naive CFI substitution.
   - Updated reviewer walkthrough documentation accordingly.

2. **Derived-Metric Semantics (`Debt Raised - Debt Repaid`)**:
   - Previous claim that `debt_raised - debt_repaid` represents balance-sheet Net Debt Movement has been corrected.
   - Added `net_debt_financing_flow_derived` to `FinancialMetricRegistry.ts` (DERIVED).
   - True balance-sheet net debt change requires closing debt and cash balances.
   - Updated reviewer walkthrough documentation accordingly.

3. **Agent Instruction Precedence**:
   - Updated `AGENTS.md` to establish constitutional hierarchy: WealthOS Universal Review Protocol and Codex reviewer authority override any utility scripts in `vendor/agent-scripts/`.

4. **Deduplication vs Net Delta Distinction**:
   - Resolved the ambiguity between 779,298 promotion attempts and 529,760 net database rows.
   - 779,298 facts were promoted under the standardized `v2` factId scheme (`fere_xbrl_v2_...`).
   - 249,538 facts belonged to the 9 original metric families and superseded legacy records.
   - 529,760 was the exact net database row delta.

---

### C. QUESTIONABLE

1. **Exchange Filing Anomaly in Banking ROA Unit**:
   - In a small number of banking XBRL filings (e.g., AU Small Finance Bank), the company's filing software tagged the unit attribute as `INR` instead of `pure`, while reporting decimal fraction values (e.g., `0.0037`).
   - The normalizer and promotion pipeline correctly identified `ReturnOnAssets` and mapped the canonical unit to `RATIO`.
   - Downstream consumers should be aware that source XML unitRef may read `INR` despite the fact being a ratio.

2. **Negative Debt-to-Equity Multiples**:
   - In companies with eroded net worth (e.g., TTML), reported `debt_to_equity` is negative (e.g., -1.04).
   - This reflects negative shareholders' equity in the denominator. WealthOS models must handle negative D/E as high-risk/distress rather than negative debt.

---

### D. UNPROVEN

1. **Quarterly Standalone Balance Sheet Items**:
   - Full balance sheet line items (`total_assets`, `total_liabilities`, `trade_receivables`, `cash_and_cash_equivalents`) remain absent in quarterly filings because Indian MCA/SEBI Ind-AS quarterly taxonomy mandates only P&L and Cash Flow.
   - Annual balance sheet figures exist from secondary providers (`UPSTOX_XBRL`, `TRENDLYNE_MCP`).
   - Quarterly balance sheet reconstructions remain unproven without audited interim balance sheets.

---

### E. REQUIRES_CODEX_SEMANTIC_REVIEW

The following tasks are strictly reserved for Codex when usage limits reset:
1. **CAL_020 Fundamental Calibration**:
   - Independent semantic evaluation of the 20 test companies.
   - Grading interpretation narrative outputs (SUPPORTED / REASONABLE / QUESTIONABLE).
2. **Fundamental Narrative Thresholds**:
   - Evaluating whether `operating_plus_investing_cash_flow` should be surfaced in management commentary or kept internal.
   - Calibrating qualitative commentary on high D/E or negative D/E companies.
3. **Formal Semantic Certification**:
   - Issuing the final independent reviewer verdict on the Fundamental Calibration program.

---

## 3. Reviewer Reproduction & Inspection Artifacts

All verification artifacts are saved in `reports/review/runs/XBRL_BASELINE_VERIFICATION/`:
- `BASELINE_MANIFEST.json`: Frozen baseline commit and repository state.
- `XBRL_PROMOTION_RECONCILIATION.json`: Mathematical reconciliation data.
- `XBRL_PROMOTION_RECONCILIATION.md`: Human-readable reconciliation proof.
- `XBRL_24_METRIC_MAPPING_AUDIT.json`: Detailed 24-metric mapping audit.
- `XBRL_24_METRIC_MAPPING_AUDIT.md`: Field-by-field audit report.
- `XBRL_UNIT_SCALE_AUDIT.json`: Unit typing and dimensionless ratio audit.
- `BALANCE_SHEET_SOURCE_COVERAGE.json`: Global balance sheet coverage analysis.
- `XBRL_PIT_AUDIT.json`: 100,000-fact Point-in-Time audit.
- `XBRL_PRODUCTION_CONSUMPTION_TRACE.json`: Pipeline trace across 7 sectors.
- `TEST_RESULTS.json`: Vitest execution report (13/13 passed).
- `CHANGE_MANIFEST.json`: Classification of changed files.
- `INDEPENDENT_REVIEW_HANDOFF.md`: This handoff document.

---

## 4. Final Review Program State

```
FINAL_STATE = AWAITING_INDEPENDENT_REVIEW
```
*(No self-certification or premature PASS declaration has been issued)*
