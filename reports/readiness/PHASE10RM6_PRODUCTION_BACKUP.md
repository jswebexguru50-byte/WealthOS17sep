# Phase 10R-M6 Production Backup

## Gate: ✅ PASS

| Field | Value |
|-------|-------|
| Source DB | `portfolio.db` |
| Source SHA-256 | `f8770cc3718c719bf6a6c458488c3bb6c215674ed48c17d8624f6bbd0fc0cd10` |
| Source size | 13,510,496,256 bytes |
| Source mtime | 2026-09-20T17:29:21.564Z |
| Source integrity | ok |
| Source DailyOHLCV rows | 4,135,605 |
| Backup path | `reports\readiness\runtime\m6\artifacts\portfolio_prepromotion_M6_1789969409800.db` |
| **Backup SHA-256** | `f8770cc3718c719bf6a6c458488c3bb6c215674ed48c17d8624f6bbd0fc0cd10` |
| Backup size | 13,510,496,256 bytes |
| Backup integrity | ok |
| Backup rows | 4,135,605 |
| SHA match | true |

## Steps

| Step | Result | Detail |
|------|--------|--------|
| source_db_exists | ✅ PASS | 12884.6 MB, mtime 2026-09-20T17:29:21.564Z |
| source_integrity | ✅ PASS | SQLite integrity: ok |
| source_row_count | ✅ PASS | DailyOHLCV rows: 4135605 (expected 4135605) |
| source_sha256 | ✅ PASS | f8770cc3718c719bf6a6c458488c3bb6c215674ed48c17d8624f6bbd0fc0cd10 |
| backup_created | ✅ PASS | Reusing existing backup: portfolio_prepromotion_M6_1789969409800.db (SHA verified = source SHA) |
| backup_sha256_matches_source | ✅ PASS | ✓ f8770cc3718c719bf6a6c458488c3bb6c215674ed48c17d8624f6bbd0fc0cd10 |
| backup_integrity | ✅ PASS | Backup integrity: ok |
| backup_row_count | ✅ PASS | Backup DailyOHLCV rows: 4135605 |

> ## ⚠ Human Authorization Required
> 
> Add the backup SHA to `reports/readiness/HUMAN_AUTHORIZATION.json`:
> ```json
> { "backup_sha256": "f8770cc3718c719bf6a6c458488c3bb6c215674ed48c17d8624f6bbd0fc0cd10" }
> ```
