# WealthOS Delivery 2.x — P5 Master Coordination Plan

## Goal Description
Orchestrate the remaining P5 independent verification streams in parallel, consolidate the evidence, and explicitly authorize the two verified production defects (SQLite Migration and Timestamp Semantics) prior to independent re-verification.

## User Review Required
> [!IMPORTANT]
> **STRICT VERIFICATION-FIRST RULE**: No production code remediation has been executed yet. The defect test fixtures have been generated and the parallel forensic reports have been produced. User authorization is required to proceed with the remediation of the two production defects.

## Proposed Changes

### P5-D: Persistence / SQLite Migration Defect
The `valid_promoted_evidence` constraint is not retroactively applied to existing databases because `CREATE TABLE IF NOT EXISTS` ignores schema updates on existing tables.

#### [NEW] [DatasetPromotionMigration.test.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/fasttrack_d2/DatasetPromotionMigration.test.ts)
Test fixture created to prove that without migration, legacy databases silently bypass the constraint, and after migration, valid records survive while invalid ones are quarantined.

#### [MODIFY] [database.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/src/server/database.ts)
- Implement a 12-step SQLite migration script for `DatasetPromotionManifests`.
- Detect schema and conditionally migrate.
- Quarantine invalid legacy rows (missing raw/canonical hashes).
- Enforce `valid_promoted_evidence` constraint.

### P5-E: Timestamp / `recordValuationSnapshot` Defect
The `recordValuationSnapshot` function silently injects `new Date().toISOString()` when the source observation time is missing, causing PIT and staleness checks to be bypassed.

#### [NEW] [RecordValuationSnapshotTimestamp.test.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/fasttrack_d2/RecordValuationSnapshotTimestamp.test.ts)
Test fixture created to verify that explicit observation timestamps are persisted and missing observation timestamps are rejected instead of fabricated.

#### [MODIFY] [database.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/src/server/database.ts)
- Modify `recordValuationSnapshot` to require `dateStr`.
- Remove the `|| new Date().toISOString().split('T')[0]` fallback.
- Throw an error or reject the snapshot if the observation timestamp is missing.

## Verification Plan

### Automated Tests
- Run `npx vitest run tests/fasttrack_d2/DatasetPromotionMigration.test.ts`
- Run `npx vitest run tests/fasttrack_d2/RecordValuationSnapshotTimestamp.test.ts`
- Rerun the complete integration suite to ensure no unexpected regressions.

### Manual Verification
- Review the parallel read-only audit reports (Agents A, B, C, F, I, J) generated in `reports/v65-delivery-2.2/`.
- Review the updated `MASTER_GAP_MATRIX.json` and `DELIVERY_2_X_MASTER_REQUIREMENTS.json`.
