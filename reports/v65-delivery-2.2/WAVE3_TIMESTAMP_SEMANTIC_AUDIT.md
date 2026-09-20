# P5-C Timestamp Independence Forensic Audit

## Objective
Verify that retrieval timestamp, source observation timestamp, DB persistence timestamp, and decision timestamp remain semantically distinct, and specifically prove that `fifoEngine.ts` cannot silently convert retrieval time into observation time.

## Finding
1. **Transaction Observation Timestamps (`fifoEngine.ts`)**:
   - During the P4 remediation, the fallback `new Date()` generation was removed from the transaction ingestion path.
   - Currently, `parseDate(r.date)` in `fifoEngine.ts` explicitly returns `null` if the source observation timestamp cannot be parsed or is missing.
   - Any transaction with a `null` date is immediately dropped via `if (!parsedDate) return null;` and `.filter(Boolean)`. 
   - **Conclusion**: `fifoEngine.ts` is strictly deterministic. It cannot silently inject the retrieval time as an observation time. A missing source timestamp correctly results in the rejection of the transaction.

2. **Semantic Distinction Across the Pipeline**:
   - **Source Observation Timestamp**: Defined strictly by the `date` field in `Transactions`.
   - **Retrieval Timestamp**: Defined by `actual_start`/`actual_end` in the acquisition manifest.
   - **DB Persistence Timestamp**: Defined by `persisted_at` in `DatasetPromotionManifests` and `updated_at` (using `CURRENT_TIMESTAMP`) in historical records.
   - **Decision Timestamp**: Defined by the `authorizeVerifiedDataset()` boundary request time (independent of the payload).

## Material Defect Discovered
While `fifoEngine.ts` is clean, an audit of `src/server/database.ts` reveals that `recordValuationSnapshot` still contains:
`const dStr = dateStr || new Date().toISOString().split('T')[0];`

This means that if a valuation snapshot is recorded without an explicit observation date, the system will silently inject the system's execution date, violating the semantic separation of observation vs. execution time.

## Next Required Action
As per P5 rules, no production code is remediated in this step.
The `recordValuationSnapshot` defect is logged and evidence preserved. It must be explicitly remediated in a subsequent authorized step to remove the `new Date()` fallback.
