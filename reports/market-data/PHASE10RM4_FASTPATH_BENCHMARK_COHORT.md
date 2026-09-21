# Phase 10R-M.4 Fast-Path Benchmark Cohort

- **Queue SHA-256**: `2470c428538f41356ca1ad31bf3f42d896a6b24c59e5125590d8a1ed2055c080`
- **LIVE_BENCHMARK**: APPROVED
- **Cohort size**: 5 instruments
- **Excluded (safety checks failed)**: 40

## Offline Scheduler Comparison

| Metric | Scheduler A (M.4 Current) | Scheduler B (Optimized) |
|--------|--------------------------|-------------------------|
| Requests | 5 | 5 |
| Coverage Equivalence | ✅ PASS | ✅ PASS |

**Finding**: M.4 already uses the optimal range-per-instrument strategy. Scheduler A ≡ Scheduler B.

## Benchmark Cohort

| Instrument | Dates | Range |
|-----------|-------|-------|
| 544778 (BSE_EQ|INE0H3U01013) | 163 | 2024-01-01 → 2024-08-30 |
| 544687 (BSE_EQ|INE0JVH01012) | 163 | 2024-01-01 → 2024-08-30 |
| 544804 (BSE_EQ|INE0KYI01012) | 163 | 2024-01-01 → 2024-08-30 |
| 544738 (BSE_EQ|INE0R0M01014) | 163 | 2024-01-01 → 2024-08-30 |
| 544807 (BSE_EQ|INE0RBX01014) | 163 | 2024-01-01 → 2024-08-30 |
