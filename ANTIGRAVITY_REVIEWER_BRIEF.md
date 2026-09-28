# WealthOS Review Correction Brief — Phase 1B / Phase 2

## Scope

Apply only the corrections below. Do not start Phase 3, strategy scans, valuation expansion, migrations outside the canonical-fact work, or broad refactors. Preserve raw provider snapshots. Do not create fallback values, proxies, or synthetic facts.

## Current status

Phase 1 and Phase 2 are **not accepted** yet. The current reports show `AVAILABLE Facts: 0` and all 243 canonical records as unavailable. This is a mapping/ingestion failure, not a completed pilot.

## Required corrections

### 1. Make schema and service compatible

Files:

- `scripts/fundamental/setup_canonical_schema.ts`
- `src/server/services/FinancialHistoryService.ts`

The service reads and writes `scope` and `availabilityStatus`, but the schema installer shown in the repository does not define those columns. Make the canonical schema setup path define every field consumed by the service. Preserve existing databases; use the project's approved migration mechanism if schema evolution is required. Do not rely on manual one-off changes.

Required canonical fields include:

`factId, companyId, symbol, isin, metric, value, unit, currency, periodType, periodStart, periodEnd, asOfDate, reportedAt, factType, sourceType, scope, provider, sourceDocumentId, sourceUrl, evidenceText, evidencePage, verificationStatus, availabilityStatus, parentFactIds, calculationMethod, fetchedAt, freshnessTtlDays`.

### 2. Implement or locate the canonical ingestion module

The claimed `scripts/fundamental/canonical_fact_ingestion.ts` is not present at that path. Create or identify the real canonical ingestion module and ensure it deterministically transforms preserved Trendlyne raw snapshots into canonical records.

Rules:

- only `VERIFIED` token mappings can create reported canonical facts;
- preserve raw snapshot linkage and source URL;
- retain period, unit, scope and provider semantics;
- never overwrite a contradictory source fact;
- create explicit missing records only when a field was actually requested and absent;
- distinguish `NOT_YET_REQUESTED`, `REQUESTED_NOT_RETURNED`, `UNAVAILABLE_FROM_PROVIDER`, `NOT_APPLICABLE`, `STALE`, and `CONFLICTING`.

### 3. Fix derived-fact idempotency

File: `src/server/services/FinancialHistoryService.ts`

Do not generate a new UUID and `INSERT OR REPLACE` on every derived calculation. That creates new rows rather than replacing a prior derived fact.

Use a deterministic uniqueness/upsert key:

`companyId + metric + periodType + periodEnd + scope + factType + calculationMethod`.

Run the same ingestion and derivation twice from unchanged raw snapshots. Verify no new facts, no changed values, and no changed lineage.

### 4. Correct formula semantics

File: `src/server/services/FinancialMetricRegistry.ts`

Do not use `Math.abs(capex)` without a documented canonical sign convention. Normalize ingestion to `CAPEX_CASH_OUTFLOW` (negative cash-flow value) or store a documented positive expenditure metric, then use one consistent FCF formula. Preserve original source value/unit in provenance.

Do not calculate TTM unless a verified TTM fact exists or an explicit deterministic aggregation uses compatible quarterly canonical facts. Do not mix annual, quarterly, TTM, consolidated and standalone facts.

### 5. Correct reporting and acceptance status

Files:

- `PHASE_1_CANONICAL_DATA_REPORT.md`
- `PHASE_2_FINANCIAL_HISTORY_REPORT.md`

Do not state `ACCEPTED` while available canonical facts are zero or primary reconciliation is absent. Change state to `BLOCKED_MAPPING_OR_INGESTION` until the acceptance tests pass.

Split counts into:

- `REPORTED_AVAILABLE`
- `REPORTED_MISSING`
- `DERIVED_AVAILABLE`
- `DERIVED_MISSING`
- `DERIVED_NOT_MEANINGFUL`
- `CONFLICTING`

The Phase 1 report must include actual primary-source comparison rows for at least three pilot companies and the eight agreed facts: Revenue, PAT, EPS, CFO, Total Debt, Net Worth, Promoter Holding, Promoter Pledge. Empty headings do not constitute reconciliation.

## Required tests

1. Schema compatibility test on a disposable copy of `portfolio.db`.
2. Ingestion test using a preserved raw Trendlyne fixture.
3. Same fixture run twice: zero duplicates and stable fact identifiers/lineage.
4. Unit test: absent provider field produces the correct availability state, not zero.
5. Unit test: missing parent facts produce `MISSING`; invalid denominators produce `NOT_MEANINGFUL`.
6. Formula test for capex sign normalization and FCF.
7. Ten-stock coverage report showing real available/missing counts by domain.

## Explicit exclusions

- No Phase 3 discovery classifications.
- No valuation target, score, recommendation, or provider-score conversion.
- No automated assumption or imputation.
- No change to strategy logic, candidate persistence, FERE collection, or production data unrelated to canonical fact ingestion.

## Review response required

Return: files changed, exact database migration/schema mechanism used, token mappings verified, pilot available coverage, reconciliation table, test output, remaining gaps, and whether Phase 1B/2 can be accepted. Do not claim acceptance without the evidence above.
