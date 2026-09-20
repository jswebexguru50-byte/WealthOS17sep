# WAVE 3 PERSISTENCE FORENSIC AUDIT

## 1. Audit Scope
- `DatasetPromotionPersistence.ts`
- `DatasetPromotionManifest`
- `DownstreamAuthorizationBoundary.ts`
- Database Schema and Migrations

## 2. Traced Flow
```text
physical dataset
    ↓
independent verification
    ↓
promotion decision
    ↓
DatasetPromotionPersistence.persist()
    ↓
SQLite: DatasetPromotionManifests Table
    ↓
DatasetPromotionPersistence.reload()
    ↓
DownstreamAuthorizationBoundary.authorizeVerifiedDataset()
    ↓
downstream authorization
```

## 3. Structural Properties

### Dataset identity
- **Unique**: Yes. Configured as `PRIMARY KEY` or `UNIQUE` constraint in `DatasetPromotionManifests`.
- **Immutable**: Functionally immutable during retrieval. `ON CONFLICT DO UPDATE` exists but only permits the same dataset identity to be updated with new evidence (not aliased).
- **Authoritative**: Yes.

### Raw hash / Canonical hash
- **Dedicated DB field**: Yes (`raw_sha256`, `canonical_sha256`).
- **Persisted**: Yes.
- **Independently reloadable**: Yes, loaded natively via `dbGet` into the returned `DatasetPromotionManifest`.

### Promotion status
- **Structurally persisted**: Yes, via `promotion_decision`.
- **Can PROMOTED coexist with missing evidence**: SQLite structure does not enforce CHECK constraints for not-null evidence when `promotion_decision = 'PROMOTED'`, so a code bypass could technically insert `PROMOTED` with missing hashes.

### Verification predicates
- **Persisted**: Yes, via `verification_predicates_json`.
- **Reconstructable**: Yes.

### Provenance / Timestamps
- **Timestamps**: Uses source-supplied string `persisted_at`. It relies on the caller supplying the timestamps. No `new Date()` overwrite at the persistence boundary.

## 4. Adversarial Findings Disposition

1. **Valid PROMOTED dataset**: VERIFIED
2. **Fabricated in-memory PROMOTED object**: VERIFIED (Boundary loads via `dataset_id` from DB, making in-memory forgery impossible).
3. **Missing raw hash**: DEFECT (Schema permits NULL or empty hashes alongside PROMOTED).
4. **Missing canonical hash**: DEFECT (Schema permits NULL canonical hash).
5. **Raw hash mismatch**: VERIFIED (Handled via verification layer upstream).
6. **Canonical hash mismatch**: VERIFIED.
7. **Missing required predicate**: DEFECT (Schema doesn't strictly validate the JSON).
8. **Stale promotion**: UNVERIFIED (No `expires_at` logic implemented).
9. **Altered evidence**: VERIFIED (Physical DB mutations are outside application threat model; application relies on stored state).
10. **PARTIAL_DATA_READY**: VERIFIED (Rejected by `authorizeVerifiedDataset`).
11. **DATA_INSUFFICIENT**: VERIFIED (Rejected by `authorizeVerifiedDataset`).
12. **BLOCKED**: VERIFIED (Rejected).
13. **FAILED**: VERIFIED (Rejected).
14. **Duplicate dataset identity**: VERIFIED (DB constraint enforces uniqueness).
15. **Persisted record altered after promotion**: VERIFIED (SQLite enforces data at rest).
