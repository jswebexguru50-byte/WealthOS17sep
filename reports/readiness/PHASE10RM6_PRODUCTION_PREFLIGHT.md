# Phase 10R-M6 Production Preflight

## Gate: ✅ PASS

**Checks**: 25/25 passed
**Production DB writes**: 0

## All Checks Passed

All preconditions satisfied. Authorization and backup required before promotion.

## Check Results

| Check | Pass | Detail |
|-------|------|--------|
| auth_pkg_exists | ✅ | Authorization package at reports\readiness\PHASE10RM6_PRODUCTION_PROMOTION_AUTHORIZATION.json |
| auth_pkg_sha256 | ✅ | Package SHA-256 |
| auth_authorization | ✅ | Authorization field: PENDING_HUMAN_APPROVAL |
| promo_file_exists | ✅ | reports\market-data\PHASE10RM5Y_PROMOTION_MANIFEST.jsonl |
| promo_sha256 | ✅ | Promotion file SHA |
| promo_count | ✅ | Record count: 18244 |
| m4_bundle_exists | ✅ | reports\market-data\M4_EVIDENCE_BUNDLE_MANIFEST.json |
| m4_bundle_sha256 | ✅ | M4 bundle compound SHA |
| m4_evidence_frozen | ✅ | M4_EVIDENCE_FROZEN |
| db_exists | ✅ | portfolio.db present |
| db_integrity | ✅ | SQLite integrity: ok |
| db_row_count | ✅ | DailyOHLCV rows: 4135605 |
| certification_false | ✅ | MARKET_DATA_CERTIFIED = NOT_SET |
| masterticker_count_sane | ✅ | MasterTickers rows: 3654 |
| diagnostic_pragmas | ✅ | page_size=4096, page_count=3298461, freelist_count=2914654, auto_vacuum=0 |
| no_competing_lock | ✅ | No lock file present |
| canonical_keys_unique | ✅ | Duplicate canonical keys: 0 |
| no_existing_conflicts | ✅ | Conflicting rows: 0 |
| all_new_missing | ✅ | New missing rows: 18244 |
| m5_gate_pass | ✅ | M5 revalidation gate: PASS |
| m5_anomaly_overlap | ✅ | Anomaly overlap = 0 |
| m5_identity_fail | ✅ | Identity fail = 0 |
| m5_ohlc_fail | ✅ | OHLC fail = 0 |
| m5_conflicting | ✅ | Conflicting rows = 0 |
| cross_gate_pass | ✅ | Cross-gate: PASS |
