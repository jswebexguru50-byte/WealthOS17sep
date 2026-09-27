# WealthOS Product Rearchitecture — Implementation Plan

## Current State & Scope

The active phase is `WEALTHOS_PRODUCT_REARCHITECTURE`. 

Do not move to candidate persistence yet (Phase C is deferred). First make the existing Discover → Analyze → FERE → StockScans path truthful and stable.

### Phase A — data truth and working Discover → Analyze [ACTIVE]

Modify only the active approved files.

1. Remove automatic identity creation.
2. Make DuckDB candle quality explicit: row count, start/end date, missing-volume count, source and corporate-action status.
3. Enforce score gating: no composite score, probability, entry, stop, target, or verdict unless all mandatory inputs are evidenced.
4. Convert technical analysis to coverage-aware output.
5. Make Smart Money and FERE use explicit unavailable states.
6. Make `StockIntelligenceView` the sole canonical analysis UI. Keep `AnalyzeWorkspace` unused or remove it only after sign-off.
7. Protect every write route in read-only runtime.

Acceptance: a user can open a real strategy candidate, see its actual OHLCV/fundamental/FERE evidence, and clearly see what is unavailable—without invented numbers.

### Phase B — StockScans parity [AWAITING SIGN-OFF]

This needs explicit scope/sign-off first because its current files and persistence tables are outside the approved inventory.

Split the product into:
- `POST /scan`: calculate only; no database writes.
- `POST /saved-scans`: explicit user save.
- `POST /watchlists`: explicit user action.
- `POST /alerts`: explicit user action.
- `GET /evidence`: read-only, source-linked evidence.

Do not let an ordinary scan create `stockscans_scan_runs`, watchlists, alerts, or custom-index records implicitly.

### Phase C — candidate lifecycle and portfolio integration [AWAITING SIGN-OFF]

Only after Phase A/B pass, approve the `InvestmentCandidates` table and migration. Then preserve a single `candidateId` from discovery through research, portfolio, monitoring, attribution, tax, and postmortem.

## Phase: WEALTHOS_PRODUCT_REARCHITECTURE [ACTIVE]

### Description
End-to-end investment operating system redesign, transforming WealthOS from disconnected analytical modules into a single evidence-driven investment OS operating on canonical security and candidate identities.
The acceptance criteria demand zero synthetic production data, so the data-truth remediation must happen before the new synthesis/candidate workflow is allowed to consume those engines.

### Sign-off log
- S3A/S4A/S5A Strategy Integration: User Approved, 2026-09-25
- WEALTHOS_PRODUCT_REARCHITECTURE: User Approved, 2026-09-25
- KITE_MARKET_DATA_DAEMON (instrument reconciliation, 15-minute and daily OHLCV ingestion, Parquet/DuckDB catalog publication): User Approved, 2026-09-27
- FUNDAMENTAL_ENRICHMENT_RESUME_TASK (durable no-LLM execution of the existing resumable Upstox collector): User Approved, 2026-09-27

### INSPECTION SCOPE (Read-Only Authority)
- src/server/services/risk/*
- src/server/services/portfolio/*
- src/server/services/research/*
- src/server/services/dataAcquisition/*

### MODIFICATION SCOPE (Approved File Inventory)

#### Frontend
- src/App.tsx
- src/components/DiscoverWorkspace.tsx
- src/components/ResearchWorkspace.tsx
- src/components/StockIntelligenceView.tsx
- src/components/StockDossierView.tsx
- src/components/ScripIntelligencePortal.tsx
- src/components/MasterQuantDossier11TabsView.tsx
- src/components/PortfolioHubView.tsx
- src/components/PortfolioIntelligenceWatchlist.tsx
- src/components/EvidenceSpineHeader.tsx
- src/components/UISystemPrimitives.tsx
- src/components/ResizableDataTable.tsx
- src/components/AuditWorkspace.tsx

#### Backend Services (P0 Synthetic Remediation explicitly required)
- src/server/services/OpportunityDataResolverService.ts (Remove fallback `volume ?? 50000`, etc.)
- src/server/services/OpportunityScannerEngine.ts (Missing factor → missing factor, not estimated/substituted. No hardcoded sector benchmarks.)
- src/server/services/MultibaggerDiscoveryEngine.ts (Unknown security → `DATA_INSUFFICIENT` / `NOT_FOUND`. No synthetic candidate objects.)
- src/server/services/InstitutionalFlowService.ts (Remove hardcoded fallback FII/DII values)
- src/server/services/TechnicalAnalysisEngine.ts (Outputs must be `MODEL SCENARIO`, never masquerade as consensus/forecast)

#### Backend Services (General Architecture)
- src/server/services/dataAcquisition/SecurityIdentityRegistry.ts
- src/server/services/FundamentalDataService.ts
- src/server/services/PureTechnicalStrategiesEngine.ts
- src/server/services/MomentumVpaEngine.ts
- src/server/services/FereEvidenceService.ts
- src/server/services/adapters/FEREEngineAdapter.ts
- src/server/services/ForensicValuationService.ts
- src/server/services/UnifiedValuationService.ts
- src/server/services/composable/EngineRegistry.ts
- src/server/services/composable/EvidenceBus.ts

#### Backend Routes & Infrastructure
- src/server/routes/strategies.ts
- src/server/routes/quantRoutes.ts
- src/server/routes/forensicRoutes.ts
- src/server/routes/portfolios.ts
- src/server/routes/transactions.ts
- src/server/routes/reports.ts
- src/server/routes/reconciliationAudit.ts
- src/server/routes/settings.ts
- server.ts
  - **Allowed**: Route registration, compatibility endpoints, middleware necessary for approved workflow.
  - **Not Allowed**: Unrelated server architecture rewrite, authentication rewrite, global middleware refactor (e.g. TLS, CORS should be a separate phase).

#### Deterministic Market-Data Operations (Approved 2026-09-27)
- scripts/market_data/kite_market_data_daemon.py
- scripts/market_data/install_kite_market_data_daemon.ps1
- scripts/market_data/update_ohlcv_duckdb_today.py
- data/market_data/tejhq_hf_10y/kite_instrument_master/*
- data/market_data/tejhq_hf_10y/kite_15m_backfill/*
- scripts/fundamental/install_upstox_fundamental_resume_task.ps1

#### Deterministic FERE Incremental Cadence (User approved 2026-09-27)
- scripts/fere/run_fere_cadence.py
- scripts/fere/install_fere_cadence_schedule.ps1
- scripts/fere/run_overnight_watchdog.py
- data/fere/verified_filings/fere_cadence_state.json
- data/fere/verified_filings/fere_cadence_progress.json
- data/fere/verified_filings/fere_cadence.log
- Uses existing FERE evidence tables and official-source collectors only; no new schema, LLM, inferred facts, or production portfolio writes.

### Phase 0 Governance Amendment: Persistence Layer (InvestmentCandidates)
Before modifying backend services for the `candidateId` lifecycle across the application, explicit sign-off on the schema and persistence strategy for `InvestmentCandidates` is required. The `InvestmentCandidate` is the fundamental anchor that bridges the gap between Discovery (Signal), Research (Dossier), and Execution (Portfolio).

**Proposed Schema (InvestmentCandidates Table):**
- `candidate_id` (TEXT PRIMARY KEY) - Generated via UUID or hash (e.g. `CAND_${sym}_${date}`)
- `security_id` (TEXT NOT NULL) - Canonical `SEC_${sym}_NSE`
- `discovery_source` (TEXT) - e.g., 'OPPORTUNITY_SCANNER', 'MULTIBAGGER_ENGINE', 'USER_SEARCH'
- `discovery_date` (DATETIME)
- `initial_rationale` (TEXT) - JSON or Text blob of why it was generated
- `status` (TEXT) - e.g., 'DISCOVERED', 'IN_RESEARCH', 'CONVICTION_BUILT', 'EXECUTED', 'DISCARDED'
- `metadata` (TEXT) - JSON blob storing origin signal specifics (probability, sector z-score, etc.)
- `updated_at` (DATETIME)

**Implementation Strategy:**
1. Create SQLite Migration for the new `InvestmentCandidates` table.
2. Ensure the `candidateId` is preserved in `StockInvestmentOpportunity` in `OpportunityScannerEngine` and persisted into this table.
3. Update `ResearchWorkspace` and `PortfolioHubView` to hydrate state using `candidateId` and load attached dossiers/thesis.

*(Awaiting User Sign-off to proceed with DB migration and persistence layer logic for InvestmentCandidates)*

### Acceptance Criteria
- **Product Architecture**: 6 primary workspaces exist (OVERVIEW, DISCOVER, ANALYZE, PORTFOLIO, RESEARCH, AUDIT); legacy routes resolve. `/analyze/:symbol` must be the canonical security route. Unified investment system architecture over disjoint screens.
- **Machine-Readable Data Integrity Gate**: `SYNTHETIC_PRODUCTION_DATA_GATE = PASS`. Static audit (`tests/static-analysis/hardcoded-audit.mjs`) scans for hardcoded prices, volumes, probabilities, targets, and fundamentals. Zero synthetic/fake data in production path. Explicit data statuses (`VERIFIED`, `PARTIAL`, `UNAVAILABLE`, etc.).
- **Missing Data Handling**:
  - Missing factor → missing factor. Not estimated.
  - FERE unavailable ≠ FERE score zero. FERE unavailable = `SOURCE_UNAVAILABLE` / `DATA_INSUFFICIENT`.
- **UX**: Modern progressive disclosure; sticky security headers; explicit FERE spine in all workspaces.
- **Workflow**: Discover -> Analyze -> Synthesis -> Research (Thesis) -> Position Plan -> Portfolio -> Risk/Performance/Tax -> Postmortem loop is fully navigable without re-entering symbols or dropping context.
- **E2E Continuity Invariant (Security & Candidate)**: 
  - For any security opened from any route: same `SecurityId`, same `ISIN`, same identity record, same provider mapping.
  - For `Discover → Candidate → Analyze → Research → Portfolio`: the same `candidateId` must survive the entire journey. This requires an E2E test.
