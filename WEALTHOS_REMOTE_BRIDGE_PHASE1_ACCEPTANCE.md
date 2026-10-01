# WEALTHOS_REMOTE_BRIDGE_PHASE1_ACCEPTANCE

## 1. AUTHENTICATION
**Status**: PASS
- Enforced `WEALTHOS_REMOTE_KEY` exclusively for all authenticated routes.
- Removed fallback to `WEALTHOS_PRODUCT_KEY`.
- Verified key logging is non-existent.
- Verified missing key, wrong key, missing Authorization header, and correct key workflows.

## 2. REMOVE SQL-KEYWORD SECURITY DEPENDENCY
**Status**: PASS
- The `sqlInjectionGuard` relying on keyword scans (e.g. "SELECT") was completely removed from the router.
- Security relies on validated routes, types, bounds, and parameterized inputs via existing application services.

## 3. HEALTH ENDPOINT
**Status**: PASS
- Refactored `GET /api/remote/health` to expose only `{ "status": "ok" }`.
- Validated that internal topology, db state, and configurations are no longer leaked here.

## 4. REQUEST BOUNDARIES
**Status**: PASS
- Limits strictly checked: max OHLCV bars (500 limit enforced), JSON body boundaries up to 64KB, symbol validations regex.

## 5. READ-ONLY PROOF
**Status**: PASS
- Reran tests asserting the exact SQLite `portfolio.db` change counter, size, dataVersion, and header SHA-256 remains completely identical before and after executing all reads and analysis via remote endpoints.
- Uses existing `persist: false` paths.

## 6. REAL TCS TRACE
**Status**: PASS
```
HTTP Request: GET /api/remote/company/TCS/intelligence
Authentication: Bearer <WEALTHOS_REMOTE_KEY>
HTTP Status: 200
Response Byte Size: 6100 bytes
Execution Time: ~14000.00 ms

Major Module Statuses:
  - fundamental: CANONICAL_MAPPED
  - valuation: CANONICAL_MAPPED
  - qglp: PARTIAL
  - fere: VERIFIED
  - management: VERIFIED
  - marketContext: VERIFIED
```

## 7. NEGATIVE SECURITY TESTS
**Status**: PASS
- Tested unknown route
- Invalid symbol (e.g. NONEXISTENT999 -> 404)
- Excessive requested limit (400 limit exceeded)
- Missing key (401)
- Wrong key (403)
- Badly formatted auth header (401)

## 8. REGRESSION RESULTS
**Status**: PASS / FAIL SEPARATED

1. `npx tsc --noEmit` -> FAIL (Exit code 1).
   - *These are pre-existing compiler errors in `src/mcp/adapters/wealthosAdapter.ts`, `src/mcp/fundamentalCalibration/fundamentalReviewEngine.ts`, and `src/mcp/registry/toolRegistry.ts` (e.g. `Property 'candles' does not exist on type 'BridgeInvokeResult'`). These issues are unrelated to the remote bridge hardening.*
2. Remote Bridge Tests: `npx vitest run tests/unit/remote_bridge_router.test.ts` -> PASS (Exit Code 0).
3. `scripts/verify_remote_bridge_local.ts` -> PASS (Exit code 0).
4. `npx vitest run tests/unit/company_intelligence_functional.test.ts` -> FAIL (Exit code 1).
   - *These three failures in `company_intelligence_functional.test.ts` are pre-existing application baseline failures (e.g., Banks classified as UNKNOWN instead of BANK).* 

## 9. DB IMMUTABILITY
**Status**: PASS
- Verified `portfolio.db` header exactly matching before and after the full test suite run and local standalone verification runs.

## 10. EXACT REMAINING RISKS
- Potential denial-of-service via computationally expensive routes since rate limiting allows 120req/min which may still load CPU given modules take ~14s to return.
- Pre-existing functional baseline regressions currently failing in `company_intelligence_functional.test.ts` (e.g., `BusinessModelClassifier` behavior).
- Endpoints remain HTTP in local dev, relying on the TLS termination at the Cloudflare tunnel in Phase 2.
