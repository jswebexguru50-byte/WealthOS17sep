# Route Collision Resolution Report

**Timestamp:** 2026-10-07T11:29:13.529Z  
**Total Historical Collisions:** 66  
**Unresolved Collisions:** **0**  
**Audit Status:** `AWAITING_INDEPENDENT_REVIEW`  

## Summary
- **Removed Shadowed Duplicates:** 62
- **Merged / Consolidated Routes:** 4
- **Active Collision Checker Count:** **0**

## Detailed Classification Matrix

| # | Method | Path | Action | Resolution |
|---|--------|------|--------|------------|
| 1 | `GET` | `/api` | `REMOVED` | Eliminated bare /api mount collision by creating dedicated /api/bank-fds and /api/transactions sub-routers. |
| 2 | `POST` | `/api` | `REMOVED` | Eliminated bare /api mount collision by creating dedicated /api/bank-fds and /api/transactions sub-routers. |
| 3 | `DELETE` | `/api/:id` | `REMOVED` | Eliminated bare /api mount collision by creating dedicated /api/bank-fds and /api/transactions sub-routers. |
| 4 | `GET` | `/api/currency-rates` | `REMOVED` | Created modular src/server/routes/currencyRates.ts mounted at /api/currency-rates. |
| 5 | `POST` | `/api/currency-rates/sync` | `REMOVED` | Created modular src/server/routes/currencyRates.ts mounted at /api/currency-rates. |
| 6 | `GET` | `/api/master-tickers` | `REMOVED` | Created modular src/server/routes/masterTickers.ts mounted at /api/master-tickers. |
| 7 | `PUT` | `/api/master-tickers/:id` | `REMOVED` | Created modular src/server/routes/masterTickers.ts mounted at /api/master-tickers. |
| 8 | `PUT` | `/api/master-tickers/upsert-by-isin` | `REMOVED` | Created modular src/server/routes/masterTickers.ts mounted at /api/master-tickers. |
| 9 | `GET` | `*` | `MERGED` | Unified dev and production SPA catch-all handlers in server.ts into a single handler. |
| 10 | `GET` | `/api/consensus/executive` | `MERGED` | Consolidated duplicate executive consensus handlers in infra.ts into getExecutiveConsensusHandler. |
| 11 | `GET` | `/api/consensus/scrip/:symbol` | `MERGED` | Consolidated duplicate scrip consensus handlers in infra.ts into getScripConsensusDetailHandler. |
| 12 | `GET` | `/api/technical-strategies/universe-count` | `REMOVED` | Removed duplicate from infra.ts; canonical owner is src/server/routes/strategies.ts. |
| 13 | `POST` | `/api/technical-strategies/scan-multi` | `REMOVED` | Removed duplicate from infra.ts; canonical owner is src/server/routes/strategies.ts. |
| 14 | `POST` | `/api/data-pipeline/run-daily` | `REMOVED` | Removed earlier duplicate from infra.ts; canonical owner is DailyPipelineService at line 2876. |
| 15 | `GET` | `/api/healthcheck` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in system.ts. |
| 16 | `GET` | `/api/opportunities/scanner` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in infra.ts. |
| 17 | `GET` | `/api/opportunities/custom-scan` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in infra.ts. |
| 18 | `GET` | `/api/opportunities/redeploy-matrix` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in infra.ts. |
| 19 | `GET` | `/api/v2/company-intelligence/:symbol` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in infra.ts. |
| 20 | `POST` | `/api/v2/company-intelligence/:symbol/refresh` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in infra.ts. |
| 21 | `GET` | `/api/company-intelligence/:symbol` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in infra.ts. |
| 22 | `POST` | `/api/company-intelligence/:symbol/refresh` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in infra.ts. |
| 23 | `GET` | `/api/server-info` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in system.ts. |
| 24 | `GET` | `/api/bank-fds` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in bankFds.ts. |
| 25 | `POST` | `/api/apps/generate-ai` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in system.ts. |
| 26 | `POST` | `/api/bank-fds` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in bankFds.ts. |
| 27 | `DELETE` | `/api/bank-fds/:id` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in bankFds.ts. |
| 28 | `GET` | `/api/currency-rates` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in currencyRates.ts. |
| 29 | `POST` | `/api/currency-rates/sync` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in currencyRates.ts. |
| 30 | `POST` | `/api/reports/generate` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in reports.ts. |
| 31 | `GET` | `/api/family-hierarchy` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 32 | `POST` | `/api/family-hierarchy` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 33 | `DELETE` | `/api/family-hierarchy/:id` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 34 | `POST` | `/api/family-hierarchy/assign` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 35 | `GET` | `/api/scrip-mappings` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 36 | `POST` | `/api/scrip-mappings` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 37 | `DELETE` | `/api/scrip-mappings/:id` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 38 | `GET` | `/api/scrip-mappings/unmapped` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 39 | `POST` | `/api/scrip-mappings/auto-resolve` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 40 | `POST` | `/api/recon/multi-broker` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in imports.ts. |
| 41 | `GET` | `/api/templates/download/:templateId` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in imports.ts. |
| 42 | `POST` | `/api/pms/iifl/parse` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in imports.ts. |
| 43 | `POST` | `/api/pms/complete-circle/parse` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in imports.ts. |
| 44 | `POST` | `/api/transactions/deduplicate-check` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in imports.ts. |
| 45 | `POST` | `/api/transactions/deduplicate-commit` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in imports.ts. |
| 46 | `POST` | `/api/backup` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in system.ts. |
| 47 | `POST` | `/api/tickers/sync` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 48 | `GET` | `/api/portfolios` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in portfolios.ts. |
| 49 | `POST` | `/api/portfolios` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in portfolios.ts. |
| 50 | `PUT` | `/api/portfolios/:name/type` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in portfolios.ts. |
| 51 | `PUT` | `/api/portfolios/:name/currency` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in portfolios.ts. |
| 52 | `PUT` | `/api/portfolios/rename` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in portfolios.ts. |
| 53 | `GET` | `/api/tickers` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 54 | `POST` | `/api/tickers/sync-sectors` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 55 | `POST` | `/api/tickers/merge` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 56 | `POST` | `/api/tickers` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 57 | `PUT` | `/api/tickers/:id` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 58 | `DELETE` | `/api/tickers/:id` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in settings.ts. |
| 59 | `GET` | `/api/transactions` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in transactions.ts. |
| 60 | `POST` | `/api/transactions` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in transactions.ts. |
| 61 | `PUT` | `/api/transactions/:id` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in transactions.ts. |
| 62 | `DELETE` | `/api/transactions/:id` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in transactions.ts. |
| 63 | `POST` | `/api/transactions/bulk` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in transactions.ts. |
| 64 | `GET` | `/api/transactions/export` | `REMOVED` | Removed shadowed inline handler from server.ts; canonical in transactions.ts. |
| 65 | `POST` | `/api/corporate-actions/apply` | `MERGED` | Unified single-action verification and batch apply under canonical infra.ts handler with /corporate-actions/apply-verified alias. |
| 66 | `GET` | `/api/metrics` | `MERGED` | Prometheus metrics mounted at /telemetry/metrics and /prometheus/metrics; canonical dashboard payload preserved at /api/metrics. |

## Verification Evidence
- `npx tsx scripts/maintenance/check_route_collisions.ts` passed with exit code 0.
- Total Registered Routes: 663
- Unique Canonical Endpoints: 663
- Detected Collision Points: 0
- Vitest suite `tests/unit/route_collision_checker.test.ts` passed 5/5 tests.
