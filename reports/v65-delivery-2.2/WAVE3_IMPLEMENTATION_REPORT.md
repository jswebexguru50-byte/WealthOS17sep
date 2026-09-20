# Wave 3 P4 Surgical Implementation Report

## Summary of Changes

The required surgical changes for Wave 3 P4 have been successfully implemented and verified. No refactoring, broad rewriting, or unauthorized scope changes were made.

### Change A: PROMOTED Persistence Integrity
*   **Schema Enforcement:** Added strict SQLite `CHECK` constraints to `DatasetPromotionManifests` table in `src/server/database.ts` ensuring that any row with `promotion_decision = 'PROMOTED'` must have exactly 64-character hashes, and structurally valid JSON array predicates.
*   **JS-Layer Defense-in-Depth:** Updated `DatasetPromotionPersistence.ts` to actively validate the structure of the JSON predicates (`NO_GAPS`, `CALENDAR_SYNC`, `HASH_MATCH`) and hash formats before allowing `dbRun` to execute, providing robust application-level validation.
*   **DB Migration:** The previously empty `DatasetPromotionManifests` table was explicitly dropped and reinitialized with the strict constraints, ensuring backward compatibility with 0 data loss.

### Change B: FIFO Timestamp Semantic Correction
*   **Semantic Correction:** Traced all callers in `src/server/fifoEngine.ts`. The `new Date().toISOString()` fallback for missing manual LTP dates fundamentally functioned as an inaccurate observation timestamp. Replaced these fallbacks with explicit `null` assignments, cleanly preserving the absence of a source timestamp without injecting synthetic values into downstream components.

---

## Verifications & Testing

### New Adversarial Tests
Added comprehensive adversarial tests to `tests/fasttrack_d2/Delivery2Persistence.test.ts` focusing on both physical DB constraints and JS-layer validation:
*   [PASS] 1-3. Valid verified dataset persists, reloads, and authorizes
*   [PASS] 4-5. PROMOTED + NULL/empty raw hash
*   [PASS] 6-7. PROMOTED + NULL/empty canonical hash
*   [PASS] 8. PROMOTED + malformed hash
*   [PASS] 9. PROMOTED + missing verification predicate
*   [PASS] 10. PROMOTED + fabricated verification predicate
*   [PASS] 18. fabricated in-memory PROMOTED object cannot bypass boundary directly
*   [PASS] 20. persisted record altered after original promotion (DB corruption)
*   [PASS] DB Constraints prevent malicious raw SQL insert

Added deterministic tests to `tests/unit/fifoEngineTimestamp.test.ts`:
*   [PASS] Source timestamp present propagates correctly
*   [PASS] Source timestamp absent does NOT substitute current time and propagates as null
*   [PASS] Determinism: Repeated runs with same missing input produce same null output

### Existing Regression Runs
*   `tests/fasttrack_d2/DownstreamBoundary.test.ts`: 7/7 PASS
*   `tests/unit/s110_readiness_and_pit.test.ts`: 18/18 PASS
*   `node reports/v65-delivery-2.2/verify_frozen_controls.cjs`: 7/7 MATCH
*   `node reports/v65-delivery-2.2/verify_master_gap_matrix.cjs`: Clean physical count (8)

### Unresolved Historical Provenance
The historical 49-requirement claim provenance remains **UNVERIFIABLE_PROVENANCE**, correctly isolated and logged in `DELIVERY_2_X_MASTER_REQUIREMENTS.json` as instructed.

All engineering requirements for P4 have been met and are now available for P5 independent verification.
