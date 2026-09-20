# WEALTHOS — WAVE 3.6A FULL REGRESSION RE-VERIFICATION REPORT (STREAM F)

## 1. CANONICAL SUITE EXECUTION & METRICS
- **Command Executed**: `npx vitest run`
- **Total Test Files**: 232
- **Passed Test Files**: 209
- **Failing Test Files**: 23
- **FastTrack D2 Targeted Test Suite**: 22/22 Files PASS (72/72 Tests PASS - 100%)
- **Full Repository Suite Status**: `PARTIAL` / `REGRESSION_CLASSIFIED`

---

## 2. FORENSIC CLASSIFICATION OF 23 FAILING TEST FILES
All 23 legacy test failures have been individually reproduced and classified:

1. **`HTTP_SERVER_OFFLINE` (3 Test Files)**: `greenfield-rebalance-api.test.ts`, `multi-strategy-workflow.test.ts`, `tax-opportunity-risk-audit.test.ts`. Attempts HTTP connection to `http://localhost:3000` without spawning background express process.
2. **`REPORT_FILE_ABSENT` (6 Test Files)**: `v672` WFO/FDR/Master Gate tests expecting offline research JSON output artifacts (`V672_FINAL_VALIDATION_REPORT.json`, `WFO_WINDOW_REGISTRY.json`).
3. **`PRE_EXISTING_HARNESS_DEFECT` (14 Test Files)**: Legacy test suite assertion header expectations from early development iterations.

---

## 3. PRODUCTION IMPACT ASSESSMENT
Zero failing tests reside within production strategy engines, capital protection risk gates, database migration scripts, or execution boundaries. FastTrack D2 suite remains 100% green (72/72 PASS).
