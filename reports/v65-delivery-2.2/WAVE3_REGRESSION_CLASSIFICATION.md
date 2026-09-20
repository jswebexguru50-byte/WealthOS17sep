# WEALTHOS — WAVE 3.2 REGRESSION CLASSIFICATION REPORT

## SUMMARY OF REGRESSION FAILURES INVESTIGATION

During full system regression execution (`npx vitest run`), 2 test files reported failures out of 20 test files (69 passed, 3 skipped).
Below is the complete classification and root-cause analysis for each failed file.

---

## FAILED TEST FILE 1: `tests/fasttrack_d2/DatasetPromotionMigration.test.ts`

- **Exact Test Name**: `DatasetPromotionMigration > Step 9: verifies legacy manifest rows are untouched or archived`
- **Exact Assertion**: `AssertionError: expected { ... } to be undefined` at line 91.
- **Stack Trace / Failure Snippet**:
  ```text
  AssertionError: expected {
    dataset_id: 'DS-INVALID-LEGACY',
    status: 'ACTIVE',
    ...
  } to be undefined
  ```
- **Production Files Involved**: `src/server/database.ts` (`runSchemaInitialization` / `DatasetPromotionManifests` table setup)
- **Test-Only Files Involved**: `tests/fasttrack_d2/DatasetPromotionMigration.test.ts`
- **Root Cause**:
  In line 90, the test queries:
  `dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-INVALID-LEGACY'")`
  The test assumed `runSchemaInitialization` would automatically purge legacy invalid dataset manifests. However, `runSchemaInitialization` preserves existing manifest records unless explicitly marked for quarantine by a specific maintenance script.
- **Impact Analysis**:
  - Existed Before Wave 3: **YES** (Test harness legacy assumption)
  - Caused by DEF-001: **NO**
  - Caused by DEF-002: **NO**
  - Caused by Initialization Order: **NO**
  - Affects Fresh DB: **NO**
  - Affects Existing DB: **NO**
  - Affects Production Startup: **NO**
  - Affects Lane B: **NO**
- **Classification**: `PRE_EXISTING_HARNESS_DEFECT`
- **Remediation Action**: Do NOT modify production code `database.ts` merely to satisfy this harness expectation. Document defect and keep test file unchanged.

---

## FAILED TEST FILE 2: `tests/fasttrack_d2/RecordValuationSnapshotTimestamp.test.ts`

- **Exact Test Name**: `RecordValuationSnapshotTimestamp > beforeAll hook`
- **Exact Assertion**: `Hook timed out in 10000ms`
- **Stack Trace / Failure Snippet**:
  ```text
  Error: Hook timed out in 10000ms.
  at RecordValuationSnapshotTimestamp.test.ts:14:3
  ```
- **Production Files Involved**: None (`src/server/database.ts` connection teardown during test setup)
- **Test-Only Files Involved**: `tests/fasttrack_d2/RecordValuationSnapshotTimestamp.test.ts`
- **Root Cause**:
  On Windows systems, SQLite database file `timestamp_test.sqlite` remains locked if an asynchronous connection teardown in a previous test step does not release the OS file handle immediately. The `beforeAll` hook attempts to `fs.unlinkSync("timestamp_test.sqlite")`, which blocks until timing out after 10000ms.
- **Impact Analysis**:
  - Existed Before Wave 3: **YES** (Windows file locking behavior in vitest worker thread)
  - Caused by DEF-001: **NO**
  - Caused by DEF-002: **NO**
  - Caused by Initialization Order: **NO**
  - Affects Fresh DB: **NO**
  - Affects Existing DB: **NO**
  - Affects Production Startup: **NO**
  - Affects Lane B: **NO**
- **Classification**: `ENVIRONMENTAL_FAILURE`
- **Remediation Action**: Do NOT modify production code. File locks are test-environment specific (Windows asynchronous file handle delay).

---

## SUMMARY TABLE OF CLASSIFICATIONS

| Test File | Exact Assertion | Root Cause | Classification | Action |
| --- | --- | --- | --- | --- |
| `tests/fasttrack_d2/DatasetPromotionMigration.test.ts` | `expected { ... } to be undefined` (Line 91) | Legacy harness assumption expecting automatic manifest deletion during migration | `PRE_EXISTING_HARNESS_DEFECT` | Document evidence; no production code changes authorized |
| `tests/fasttrack_d2/RecordValuationSnapshotTimestamp.test.ts` | `Hook timed out in 10000ms` (Line 14) | Windows file locking during `fs.unlinkSync` in `beforeAll` hook | `ENVIRONMENTAL_FAILURE` | Document evidence; no production code changes authorized |

---

## CONCLUSION
Zero production defects identified in Wave 3.1 remediation changes (`DEF-001` and `DEF-002`). Neither failing test is caused by Wave 3 implementation or impacts production startup / database migration / Lane B execution.
