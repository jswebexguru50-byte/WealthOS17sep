# DEF-001 Valuation Snapshot Timestamp Provenance Map

## 1. Overview & Semantic Principle

Valuation snapshots must represent Point-in-Time (PIT) financial state corresponding to verified exchange market observation timestamps. Server clock execution times (`Date.now()`, `new Date()`, `datetime('now')`, `CURRENT_TIMESTAMP`) and database record sync timestamps (`Holdings.last_update`, `updated_at`) represent persistence or retrieval time, NOT market observation time.

---

## 2. Producer / Consumer Chain Classification

| Field / Function | Source System | Semantic Classification | Timezone | Acceptable as Observation Timestamp? | Fail-Closed Policy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sourceObservationTimestamp` | Market Quote Payload / Exchange Feed | `OBSERVATION_TIME` | UTC / IST (explicit offset) | **YES** (Only if originating from source payload with proven exchange trading semantics) | Persisted explicitly |
| `Holdings.last_update` | SQLite DB Sync | `PERSISTENCE_TIME` | UTC / Local | **NO** (Strictly Forbidden) | `OBSERVATION_TIME_UNVERIFIABLE` |
| `Holdings.updated_at` | SQLite Trigger / Default | `PERSISTENCE_TIME` | UTC | **NO** (Strictly Forbidden) | `OBSERVATION_TIME_UNVERIFIABLE` |
| `CURRENT_TIMESTAMP` | SQLite Engine Default | `DATABASE_CLOCK` | UTC | **NO** (Removed DEFAULT from schema) | `OBSERVATION_TIME_UNVERIFIABLE` |
| `new Date()` / `Date.now()` | Node.js Runtime | `APPLICATION_CLOCK` | Local / UTC | **NO** (Strictly Forbidden) | `OBSERVATION_TIME_UNVERIFIABLE` |

---

## 3. Downstream Consumers

1. **ValuationSnapshots Table**: Consumes explicit validated observation timestamps.
2. **Drift Detection Overlay**: Compares valuation snapshot across session boundaries.
3. **Portfolio History Reporting**: Uses session-matched verified valuation observation dates.

---

## 4. Enforcement Rule

If `sourceObservationTimestamp` is missing or unverified, `autoFetchMarketData` and `syncMarketPrices` emit:
`[Valuation Snapshot] OBSERVATION_TIME_UNVERIFIABLE: Missing explicit source observation timestamp. Skipping snapshot persistence.`
and fail closed without manufacturing synthetic timestamps.
