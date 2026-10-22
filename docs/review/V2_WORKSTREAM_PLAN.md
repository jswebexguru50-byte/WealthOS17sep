# WealthOS V2 — Parallel Closure Workstreams

## Central Coordination Rules
- All DB schema changes → `scripts/migrations/` only; no runtime DDL
- All contracts → `contracts/` frozen after Wave A
- Merge order enforced: A → B → C+D → E → F

---

## Wave A — Truth Closure (P0, COMPLETED)

| # | Fix | File | Status |
|---|-----|------|--------|
| A1 | Remove runtime DDL from CompanySnapshotRepository → migrations/ | CompanySnapshotRepository.ts + migrations/ | ✅ COMPLETE |
| A2 | Fix delta bug: currentFacts = NEW not OLD | CompanyRefreshCoordinator.ts L165 | ✅ COMPLETE |
| A3 | Snapshot/Delta convergence: remove CompanySnapshotStore from Orchestrator | CompanyDeltaEngine.ts + CompanyIntelligenceOrchestrator.ts | ✅ COMPLETE |
| A4 | WatchRuleRepository: SQLite persistence (not process-memory Map) | NEW: WatchRuleRepository.ts | ✅ COMPLETE |
| A5 | Watch state persistence + restart safety | WatchRuleRepository.ts + Coordinator | ✅ COMPLETE |
| A6 | registerDrivers() regression test: production must not call it | tests/unit/wave_a_architecture_closure.test.ts | ✅ COMPLETE |
| A7 | run_architecture_tests: execute & capture test output | 35/35 passing tests in vitest | ✅ COMPLETE |
| A8 | DDL migration file for V2 snapshot columns | scripts/migrations/005_company_snapshot_v2.sql | ✅ COMPLETE |
| A9 | pitStatus semantic proof — backfilled availableAt = PIT_INFERRED | CanonicalFactRepository.ts | ✅ COMPLETE |
| A10 | Silent catches → ModuleExecutionResult degraded status | CompanyIntelligenceOrchestrator.ts | ✅ COMPLETE |
| A11 | Analytical engine repository boundary: ValuationEngine 0 raw SQL | ValuationIntelligenceEngine.ts | ✅ COMPLETE |
| A12 | Selective invalidation proof: PRICE_UPDATE selective refresh | CompanyRefreshCoordinator.ts | ✅ COMPLETE |

---

## Wave B — Live Data (P1, COMPLETED)

| # | Fix | File | Status |
|---|-----|------|--------|
| B1 | SourceDocument contract | contracts/SourceDocument.ts | ✅ COMPLETE |
| B2 | SourceDocumentRepository | core/SourceDocumentRepository.ts | ✅ COMPLETE |
| B3 | Generic corporate event classifier | acquisition/EventClassifier.ts | ✅ COMPLETE |
| B4 | Generic financial result normalizer | acquisition/FinancialResultNormalizer.ts | ✅ COMPLETE |
| B5 | Management commitment pipeline (generic, not DYCL) | acquisition/CommitmentExtractor.ts | ✅ COMPLETE |
| B6 | Master ingestion pipeline with content-hash idempotency | acquisition/SourceDocumentIngestionPipeline.ts | ✅ COMPLETE |
| B7 | Wave B integration test suite (12/12 passing) | tests/unit/wave_b_live_data_ingestion.test.ts | ✅ COMPLETE |

---

## Wave C — Intelligence (P1, parallel with D)

| # | Fix | Status |
|---|-----|--------|
| C1 | Business profile → sector-aware generic profiles | PENDING |
| C2 | ValuationEngine → CanonicalFactRepository (not direct SQL) | ✅ DONE in A11 |
| C3 | Dependency-selective refresh actually executes subsets | ✅ DONE in A12 |
| C4 | Persistent thesis with pillars + transitions | PENDING |

---

## Wave D — Monitoring (P1, parallel with C)

| # | Fix | Status |
|---|-----|--------|
| D1 | WatchRuleRepository SQLite persistence | ✅ DONE in A4 |
| D2 | "What Changed?" persistent delta feed | PENDING |
| D3 | Intelligence Inbox (per-company change summary) | PENDING |
| D4 | Freshness indicators per module | PENDING |

---

## Wave E — Product (P1, after C+D)

| # | Fix | Status |
|---|-----|--------|
| E1 | Single /api/v2 contract + remove legacy routes | PENDING |
| E2 | Coverage indicators (WORKING / PARTIAL / etc.) visible in UI | PENDING |
| E3 | Evidence drawer for all material assertions | PENDING |
| E4 | Timeline never falls back to Delta | PENDING |
| E5 | GET /company-intelligence is zero-write | PENDING |

---

## Wave F — Acceptance (last)

| # | Fix | Status |
|---|-----|--------|
| F1 | Run all 14 architecture tests + show output | ✅ 35/35 passing |
| F2 | Proof A: DYCL T0→T1 full disclosure flow | PENDING |
| F3 | Proof B: DYCL + TCS + HDFCBANK generic | PENDING |
| F4 | Proof C: 11-company oracle | PENDING |
| F5 | API E2E + Browser E2E + Failure E2E + Restart E2E | PENDING |
| F6 | CLOSURE_MANIFEST.json generated | PENDING |

---

## Release Criteria (frozen)
```
0 hardcoded acceptance-company intelligence
0 synthetic material evidence
0 unexplained PIT violations
0 raw-provider analytical-engine bypass
0 V2 legacy UI fallback
0 silent module failures
0 GET writes
0 runtime DDL
0 nondeterministic analytical identities
0 artificial historical snapshots
0 unexplained Reality Oracle mismatches
```
