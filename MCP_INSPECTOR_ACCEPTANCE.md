# WealthOS Universal MCP — Inspector & Protocol Acceptance Report

**Evaluation Date:** 2026-10-01T03:30:34.642Z  
**Target Endpoint:** `http://127.0.0.1:8787`  
**MCP Protocol Spec:** 2024-11-05 (Streamable HTTP + SSE)  
**Overall Status:** **PASS** (33/33 checks passed)  

## 1. Protocol & Inspector Lifecycle Matrix (Section 5)

| Test ID | Description | Expected | Actual | Status |
|---|---|---|---|---|
| `T-PROT-01` | initialize lifecycle handshake | protocolVersion 2024-11-05 and Mcp-Session-Id | `status=200, version=2024-11-05, sessionHeader=true` | **PASS** |
| `T-PROT-02` | notifications/initialized lifecycle step | HTTP 202 Accepted | `status=202` | **PASS** |
| `T-PROT-03` | tools/list returns schemas and readOnly annotations | tools array with >= 40 tools | `toolsCount=40, firstToolSchema=true` | **PASS** |
| `T-PROT-04` | tools/call executes registered tool and returns content | valid response envelope | `status=200, contentFound=true` | **PASS** |
| `T-PROT-05` | resources/list returns advertised system resources | >= 2 resources with URI and mimeType | `resourceCount=2, hasRequirementsUri=true` | **PASS** |
| `T-PROT-06` | resources/read retrieves resource payload | contents array with JSON payload | `contentsReturned=true, hasReqData=true` | **PASS** |
| `T-PROT-07` | session handling preserves session header | HTTP 200 with matching session | `status=200` | **PASS** |
| `T-PROT-08` | invalid auth rejected with 401 | HTTP 401 or JSON-RPC -32001 | `status=401, error=INVALID_CREDENTIALS` | **PASS** |
| `T-PROT-09` | wrong plane credential rejected with 403 | HTTP 403 INSUFFICIENT_PRIVILEGES | `status=403, error=INSUFFICIENT_PRIVILEGES_FOR_DEV_PLANE: Review/Product credential cannot access Development plane` | **PASS** |
| `T-PROT-10` | malformed JSON rejected with -32700 Parse error | HTTP 400 and code -32700 | `status=400, code=-32700` | **PASS** |
| `T-PROT-11` | concurrent calls executed without deadlocks | 5 concurrent requests all return 200 | `allSuccessful=true, responseStatuses=200,200,200,200,200` | **PASS** |

## 2. Remote Security Adversarial Rejection Matrix (Section 8)

| Test ID | Vector | Expected | Actual | Status |
|---|---|---|---|---|
| `T-SEC-01` | Arbitrary shell execution attempt | REJECTED with -32601 or failure | `rejected=true, msg=Tool 'run_command' not found on plane 'DEVELOPMENT'.` | **PASS** |
| `T-SEC-02` | Arbitrary SQL execution attempt | REJECTED with -32601 | `rejected=true, msg=Tool 'execute_sql' not found on plane 'DEVELOPMENT'.` | **PASS** |
| `T-SEC-03` | Arbitrary filesystem traversal outside repo | REJECTED with SECURITY_VIOLATION | `traversalBlocked=true` | **PASS** |
| `T-SEC-04` | .env direct file access attempt | REJECTED with SECURITY_VIOLATION | `envAccessBlocked=true` | **PASS** |
| `T-SEC-05` | Credentials file access attempt | REJECTED with SECURITY_VIOLATION | `credentialBlocked=true` | **PASS** |
| `T-SEC-06` | Private key access attempt (.pem / .key) | REJECTED with SECURITY_VIOLATION | `keyBlocked=true` | **PASS** |
| `T-SEC-07` | Raw SQLite portfolio.db access attempt | REJECTED with SECURITY_VIOLATION | `dbDownloadBlocked=true` | **PASS** |
| `T-SEC-08` | Raw Parquet file access attempt | REJECTED with SECURITY_VIOLATION | `parquetBlocked=true` | **PASS** |
| `T-SEC-09` | Git force push attempt | REJECTED with -32601 Tool not found | `rejected=true` | **PASS** |
| `T-SEC-10` | Git history rewrite attempt | REJECTED with -32601 Tool not found | `rejected=true` | **PASS** |
| `T-SEC-11` | Arbitrary file deletion attempt | REJECTED with -32601 Tool not found | `rejected=true` | **PASS** |
| `T-SEC-12` | Evidence gate disabling attempt | REJECTED with -32601 Tool not found | `rejected=true` | **PASS** |
| `T-SEC-13` | Strategy configuration mutation attempt | REJECTED with -32601 Tool not found | `rejected=true` | **PASS** |
| `T-SEC-14` | Canonical facts direct mutation attempt | REJECTED with -32601 Tool not found | `rejected=true` | **PASS** |

## 3. Review Write Path & Immutability Matrix (Section 10)

| Test ID | Description | Expected | Actual | Status |
|---|---|---|---|---|
| `T-REV-01` | Reviewer creates dedicated test review run | run created in calibration storage | `runCreated=true` | **PASS** |
| `T-REV-02` | Reviewer writes structured review finding | finding recorded with all required fields | `recorded=true` | **PASS** |
| `T-REV-03` | Review write CANNOT modify company_facts or MasterTickers | exact count match before and after | `factsBefore=18007, factsAfter=18007, tickersBefore=3654, tickersAfter=3654` | **PASS** |

## 4. Developer Task Loop Matrix (Section 11)

| Test ID | Step | Expected | Actual | Status |
|---|---|---|---|---|
| `T-DEV-01` | Create dedicated test session | status BASELINED | `sessionId=DEV-20261001-013` | **PASS** |
| `T-DEV-02` | Reviewer creates remediation task -> QUEUED | task enqueued in status QUEUED | `taskId=TASK-DEV-20261001-013-001, text={"jsonrpc":"2.0","id":402,"result":{"content":[{"type":"text","text":"{\n  \"status\": \"OK\",\n  \"` | **PASS** |
| `T-DEV-03` | Developer consumer claims task -> CLAIMED | status CLAIMED | `taskStatus=CLAIMED, claimedBy=antigravity-dev-worker` | **PASS** |
| `T-DEV-04` | Developer produces result -> COMPLETE | status COMPLETE (NOT PASS) | `taskStatus=COMPLETE (Verified: Developer COMPLETE != PASS)` | **PASS** |
| `T-DEV-05` | Reviewer independently changes session to PASS | status PASS | `taskStatus=PASS, sessionStatus=PASS` | **PASS** |

## 5. Security & Boundary Guarantees Summary

- **Blind Review Inputs:** `get_fundamental_review_inputs` returns unpolluted canonical facts and verified arithmetic without semantic verdicts or defect clusters.
- **Storage Isolation:** Review findings write exclusively to `reports/fundamental-review/calibration_runs.json`. Direct writes to `company_facts`, `MasterTickers`, `DailyOHLCV`, and portfolio tables are completely forbidden.
- **Developer Non-Equivalence:** Developer marking a remediation task `COMPLETE` leaves it in `REVIEW_PENDING`. Only the independent reviewer can declare `PASS` or `REMEDIATION_REQUIRED`.