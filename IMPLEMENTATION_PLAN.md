# WealthOS Delivery 2.x — P5 Master Coordination Plan

## Goal Description
Orchestrate the remaining P5 independent verification streams in parallel, consolidate the evidence, and explicitly authorize the two verified production defects (SQLite Migration and Timestamp Semantics) prior to independent re-verification.

## User Review Required
> [!IMPORTANT]
> **STRICT VERIFICATION-FIRST RULE**: The forensic status of the two production defects is as follows:
> - **P5-D (SQLite Migration)**: Implementation: PRESENT, Tests: PRESENT, Independent verification: REQUIRED, Hardening: REQUIRED.
> - **P5-E (Timestamp Semantics)**: Claimed defect: NEEDS SOURCE-LEVEL RECONFIRMATION, Test fixture: PRESENT, Test-to-function alignment: FAILED / INCOMPLETE, Remediation: NOT PROVEN.

## Proposed Changes

### P5-D: Persistence / SQLite Migration Defect
The `valid_promoted_evidence` constraint is not retroactively applied to existing databases because `CREATE TABLE IF NOT EXISTS` ignores schema updates on existing tables.

#### [MODIFY] [DatasetPromotionMigration.test.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/fasttrack_d2/DatasetPromotionMigration.test.ts)
Update test fixture to assert quarantine correctness. Acceptance criteria:
- `invalid production row = absent AND quarantine row = present AND quarantine reason = correct AND original hashes/metadata preserved`
- **Idempotency Test**: Run migration twice. Expect same production rows, same quarantine rows, no duplicate quarantine, no corruption.
- **Transaction/Recovery Failure-Injection Test**: Inject failure before rename, after rename, during insert, and before commit. Expect original database remains recoverable.
- **Foreign-Key Verification**: Verify `PRAGMA foreign_keys` logic keeps foreign-key relationships intact (initially ON -> migration -> ON).

#### [MODIFY] [database.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/src/server/database.ts)
- Audit, harden and independently verify the existing `DatasetPromotionManifests` migration implementation.
- Contract invariant: Legacy valid PROMOTED survives, legacy invalid PROMOTED quarantined, new invalid PROMOTED rejected by DB, new valid PROMOTED persists, downstream authorization only valid persisted evidence.

### P5-E: Timestamp / `recordValuationSnapshot` Defect
The `recordValuationSnapshot` function silently injects a date string when the source observation time is missing, causing PIT and staleness checks to be bypassed.

#### [MODIFY] [RecordValuationSnapshotTimestamp.test.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/fasttrack_d2/RecordValuationSnapshotTimestamp.test.ts)
- Directly exercise `recordValuationSnapshot` (do not use `autoFetchMarketData` as a proxy).
- Require explicit rejection (e.g. `expect(call).rejects.toThrow(...)` or `status = REJECTED`, `reason = MISSING_OBSERVATION_TIMESTAMP` followed by no `ValuationSnapshots` row), not merely zero rows returned.

#### [MODIFY] [database.ts](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/src/server/database.ts)
- Modify `recordValuationSnapshot` to require an explicit timestamp.
- Explicitly separate `observationDate` vs `observationTimestamp`. Use `observedAt` with ISO-8601 timestamp where available. If only a trading date is supplied, explicitly store `observationDate = YYYY-MM-DD`, `observationTimestamp = null`, `timestampPrecision = DAY`. Never fabricate a time component.

## Verification Plan

### Automated Tests
- Run `npx vitest run tests/fasttrack_d2/DatasetPromotionMigration.test.ts`
- Run `npx vitest run tests/fasttrack_d2/RecordValuationSnapshotTimestamp.test.ts`
- Rerun the complete integration suite to ensure no unexpected regressions.

### Manual Verification
- Review the parallel read-only audit reports (Agents A, B, C, F, I, J) generated in `reports/v65-delivery-2.2/`.
- Review the updated `MASTER_GAP_MATRIX.json` and `DELIVERY_2_X_MASTER_REQUIREMENTS.json`.

---

## Phase: WEALTHOS_PRODUCT_REARCHITECTURE [ACTIVE]

### Description
End-to-end investment operating system redesign, transforming WealthOS from disconnected analytical modules into a single evidence-driven investment OS operating on canonical security and candidate identities.
The acceptance criteria demand zero synthetic production data, so the data-truth remediation must happen before the new synthesis/candidate workflow is allowed to consume those engines.

### Sign-off log
- S3A/S4A/S5A Strategy Integration: User Approved, 2026-09-25
- WEALTHOS_PRODUCT_REARCHITECTURE: User Approved, 2026-09-25

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
