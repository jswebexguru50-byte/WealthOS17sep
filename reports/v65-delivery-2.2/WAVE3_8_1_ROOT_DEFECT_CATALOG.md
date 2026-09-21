# WEALTHOS Wave 3.8.1 Root Defect Catalog Report

- **Evaluated At**: `2026-09-20T12:10:11.495Z`
- **Source Commit**: `8b74d8b4977e4ccccc040f7ac7e19f39986a6b1c`
- **Frozen Controls**: `7/7 MATCH`
- **Total Remaining Diagnostics Clustered**: 70 / 70
- **Total Root Defect Clusters**: 10
- **UNKNOWN Diagnostics**: 0 (100% Classified)

## Root Defect Clusters

### ROOT-001: Forensic UI Schema Drift (9 diagnostics)
- **Scope**: `UI_COMPONENT`
- **Root Defect Class**: `TYPE_CONTRACT_DRIFT`
- **Files**: `src/components/forensic/ForensicIntelligenceMasterView.tsx`
- **Recommended Remediation**: Align UI state objects to canonical src/types/forensic.ts interfaces.

### ROOT-002: Opportunity Engine Strategy & Macro Schema Drift (3 diagnostics)
- **Scope**: `PRODUCTION_PATH`
- **Root Defect Class**: `TYPE_CONTRACT_DRIFT`
- **Files**: `src/components/OpportunityEngineMasterView.tsx`, `src/server/services/ConsolidatedOpportunityEngine.ts`
- **Recommended Remediation**: Align US macro posture string literal union and opportunity strategy array property.

### ROOT-003: Server Express Route Handler Argument Mismatch (2 diagnostics)
- **Scope**: `PRODUCTION_PATH`
- **Root Defect Class**: `SIGNATURE_DRIFT`
- **Files**: `server.ts`
- **Recommended Remediation**: Pass single symbol string parameter into getReportsForSymbol route handler.

### ROOT-004: Native Fetch RequestInit Timeout Property (9 diagnostics)
- **Scope**: `PRODUCTION_PATH`
- **Root Defect Class**: `SIGNATURE_DRIFT`
- **Files**: `src/server/services/ConcallFailsafeHarvester.ts`
- **Recommended Remediation**: Use AbortSignal.timeout(ms) for Node.js native fetch instead of unsupported RequestInit.timeout property.

### ROOT-005: Swarm & Research Runner Scope Variables (3 diagnostics)
- **Scope**: `RESEARCH_OR_EXPERIMENTAL`
- **Root Defect Class**: `RESEARCH_ONLY_DEFECT`
- **Files**: `src/scripts/run_swarm.ts`, `src/scripts/swarm/SwarmControlTower.ts`, `src/server/services/research/ResearchRun.ts`
- **Recommended Remediation**: Fix scope variable binding and status enum comparison in research swarm runners.

### ROOT-006: Accounting Audit Trade Record Interface Drift (6 diagnostics)
- **Scope**: `PRODUCTION_PATH`
- **Root Defect Class**: `TYPE_CONTRACT_DRIFT`
- **Files**: `src/server/services/audit/AccountingBugImpactAuditor.ts`
- **Recommended Remediation**: Align V65TradeRecord interface fields (actualExitPrice, signalPrice, securityId, direction) with auditor expectations.

### ROOT-007: FERE Intelligence & Decision Engine Contracts (8 diagnostics)
- **Scope**: `PRODUCTION_PATH`
- **Root Defect Class**: `ENUM_UNION_DRIFT`
- **Files**: `src/server/intelligence/engines/DecisionReplayEngine.ts`, `src/server/intelligence/engines/FactValidationGate.ts`, `src/server/intelligence/services/ItasIiceReconciliationService.ts`, `src/server/intelligence/services/ThesisBreakerEngine.ts`, `src/server/services/adapters/FEREEngineAdapter.ts`, `src/server/services/adapters/TechnicalEngineAdapter.ts`
- **Recommended Remediation**: Reconcile FERE evidence types, breaker status enums, and score card field names.

### ROOT-008: Composable Pipeline & Telemetry Infrastructure (6 diagnostics)
- **Scope**: `PRODUCTION_PATH`
- **Root Defect Class**: `MISSING_EXPORT`
- **Files**: `src/server/services/composable/DecisionGraph.ts`, `src/server/services/composable/EngineRunner.ts`, `src/server/services/composable/TelemetryCollector.ts`, `src/server/services/audit/PITDecisionEvidenceValidator.ts`
- **Recommended Remediation**: Export DecisionTraceRecorder, EngineExecutionTelemetry, and fix argument count on validator assertions.

### ROOT-009: Phase 2 FastTrack & Forensics Orchestrator (4 diagnostics)
- **Scope**: `PRODUCTION_PATH`
- **Root Defect Class**: `SIGNATURE_DRIFT`
- **Files**: `src/server/services/phase2fasttrack/StrategyReplayAdapter.ts`, `src/server/services/phase2forensics/DownstreamWaterfallEnricher.ts`, `src/server/services/phase2forensics/Phase2MasterOrchestrator.ts`, `src/server/services/r421/R421AdversarialSuite.ts`
- **Recommended Remediation**: Align signal timestamp property, enum comparisons, and index signature types.

### ROOT-010: Research Candidate Generation R3/R4/FDR Modules (20 diagnostics)
- **Scope**: `RESEARCH_OR_EXPERIMENTAL`
- **Root Defect Class**: `RESEARCH_ONLY_DEFECT`
- **Files**: `src/server/services/research/BenjaminiHochbergValidator.ts`, `src/server/services/research/FrozenSignalAdapter.ts`, `src/server/services/research/r3/PredeclaredCandidateDefinitions.ts`, `src/server/services/research/r4/R4CandidateEngine.ts`, `src/server/services/s110/S110DependencyAuditEngine.ts`, `src/server/services/s1101r2/S1101R2MasterLedger.ts`
- **Recommended Remediation**: Fix string vs string[] type assignments, export missing PromotionGate methods, and reconcile candidate definitions.

