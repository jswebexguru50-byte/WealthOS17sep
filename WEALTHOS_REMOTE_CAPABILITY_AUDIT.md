# WealthOS Remote Capability Audit - Phase 2B

## 1. Inventory & Local App Mapping
WealthOS is currently accessible via the local frontend UI and local backend Express APIs (`server.ts` and `src/server/routes/`). 
The local application capabilities are distributed across:
- **Search & Discovery**: `/api/master-tickers/search`, `/api/scrip-dossier/universe`, `/api/opportunities/scanner`, and Technical Scanners (`/api/strategies/scan-multi`).
- **Company Intelligence**: Powered by `CompanyIntelligenceOrchestrator`, surfacing QGLP, Fundamentals, FERE, and Valuation via `/api/scrip-dossier/:symbol`.
- **Technical Analysis**: Driven by `DuckDbAdjustedOhlcvService` yielding long-horizon OHLCV bars via `/api/market-data/adjusted-ohlcv/:symbol`.
- **Portfolio Management**: Local services expose Holdings, Monitoring (Alerts), and manual Thesis tracking/revisions.
- **System Functions**: System-wide `SyncService` for refreshing external integrations.

Currently, the authenticated Remote API bridge (`/api/remote/*`) successfully exposes subsets of Company Intelligence (Fundamentals/QGLP/Valuation) and a bounded 500-row history of Technical OHLCV. 

*(Refer to `WEALTHOS_REMOTE_CAPABILITY_MATRIX.json` for detailed local-to-remote routing metadata).*

## 2. Trace of the Three Entry Routes

**A. Manual Search**
- *Flow*: Search Query $\rightarrow$ `api/remote/discover` $\rightarrow$ Canonical `WealthOSProductionAdapter` Identity $\rightarrow$ `api/remote/company/:symbol/intelligence` $\rightarrow$ Unified Data Payload.
- *Status*: Operational. Remote search successfully funnels into the identical canonical intelligence module.

**B. Fundamental Discovery**
- *Flow*: Remote Candidate Screen $\rightarrow$ [No Dedicated API]
- *Status*: **MISSING**. The current remote implementation requires the user/agent to query companies individually. There is no remote mapping for the local `FundamentalScannerService`. Downstream company analysis shares the canonical route, but the initial entry point requires a new API contract (`POST /api/remote/scanner/fundamental`).

**C. Technical Strategy Discovery**
- *Flow*: ITAS Signals Scan $\rightarrow$ [No Dedicated API]
- *Status*: **MISSING**. Similar to Fundamental Discovery, strategy scanning (e.g., S1A, S2A) over DuckDB is strictly local right now (`/api/strategies/scan-multi`). 

**Duplicated/Shadow Analysis Paths:**
No parallel logic pipelines were found. The existing `remoteBridgeRouter.ts` correctly utilizes `CompanyIntelligenceOrchestrator` and `DuckDbAdjustedOhlcvService`.

## 3. Large-Data Contracts & Truncation

Current limitations in the Remote API are hard-coded boundaries, acting as defensive crutches against massive data payloads (e.g. LLM context sizes):
- `OHLCV`: Truncated explicitly at `500` rows.
- `Portfolio`: Truncated explicitly at `500` holdings.
- `Discovery`: Truncated explicitly at `50` candidates.

**Audit Finding:** Hard truncation destroys the retrieval integrity required by an analytical agent. Conceptually, if 1000 records exist, the API must inform the consumer and provide a mechanism to fetch them all.

**Recommended Contract Update (Pagination):**
- Discovery/Portfolios: Implement `cursor` token and `limit` boundary in the query parameters.
- OHLCV/Technicals: Implement `cursor`, `limit`, `from` (YYYY-MM-DD), and `to` (YYYY-MM-DD) ranges to bound each payload while preserving holistic data retrieval.

## 4. Write Operations

Business-level state mutation inside WealthOS must be meticulously classified for the Remote API. AI Studio must *never* arbitrarily execute writes from generic read-focused workflows. 

Classification of operations:
- **Refresh / External Sync:** `ADMIN_ONLY` (Can cause API quota consumption or race conditions).
- **Portfolio Changes:** `INTERNAL_ONLY` / `ADMIN_ONLY`.
- **Thesis Updates / Monitoring Changes:** `EXPLICIT_WRITE`. 
- **Company Intelligence:** `SAFE_READ` (ensure `persist: false` continues to be respected, which it currently is).

*Future AI Studio must not turn a GET/read action into persistence. All mutations must require explicit POST/PUT signatures with elevated scopes.*

## 5. AI Studio Contract

To ensure a secure foundation for the forthcoming Google AI Studio POC, the API contract must adhere to the following business-level guidelines:
1. **No Raw Data Plane Access:** Block any paths granting raw SQLite, DuckDB, or filesystem access (e.g., direct Parquet parsing). All evidence must be served via structured JSON.
2. **Abstract Business Services:** The API should expose verbs matching business operations (`/api/remote/scanner/technical`, `/api/remote/company/:symbol/intelligence`). 
3. **Pagination-First:** As outlined above, all list-based queries must adopt the continuation-token/cursor standard.

## 6. Deliverable Summary

- **TOTAL_LOCAL_CAPABILITIES** = 12
- **REMOTE_COMPLETE** = 3 (Overview, Intelligence, Fundamentals)
- **REMOTE_PARTIAL** = 3 (Manual Search, OHLCV, Portfolio Holdings)
- **REMOTE_MISSING** = 6 (Fundamental Scanner, Technical Scanner, Alerts, Evidence, Refresh, Thesis Writes)

**BLOCKERS_FOR_AI_STUDIO_POC:**
- Lack of Discovery routes (Fundamental/Technical) restricts the AI from autonomously building candidate funnels.

**BLOCKERS_FOR_FULL_AI_STUDIO_PARITY:**
- Hard truncation on large datasets (OHLCV) prevents rigorous quantitative validation over time-series data. 
- Inability to write thesis/monitoring limits agent persistence capabilities.

**DATA_CONTRACTS_REQUIRING_PAGINATION:**
- `GET /api/remote/company/:symbol/technical`
- `GET /api/remote/portfolio/:id/holdings`
- `POST /api/remote/discover`

**WRITE_OPERATIONS_REQUIRING_SPECIAL_AUTH:**
- `POST /api/remote/system/refresh`
- `POST /api/remote/company/:symbol/thesis`
