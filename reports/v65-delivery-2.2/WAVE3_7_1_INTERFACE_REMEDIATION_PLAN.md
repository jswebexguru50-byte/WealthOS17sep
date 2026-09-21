# WEALTHOS Wave 3.7.1 Interface Remediation Plan

Source commit: `8b74d8b4977e4ccccc040f7ac7e19f39986a6b1c`

This plan is evidence-derived from the actual TypeScript compiler output and repository symbol graph.

## Important

- Missing methods are not fabricated.
- Interfaces are not weakened to satisfy callers.
- `any`, `@ts-ignore`, `@ts-expect-error`, and tsconfig exclusions are prohibited.
- Frozen controls remain immutable.

| File | Line | Code | Scope | Classification | Remediation | Confidence |
|---|---:|---|---|---|---|---|
| server.ts | 510 | TS2554 | OTHER | ARGUMENT_COUNT_MISMATCH | SIGNATURE_DRIFT | REVIEW_REQUIRED |
| server.ts | 530 | TS2554 | OTHER | ARGUMENT_COUNT_MISMATCH | SIGNATURE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 200 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 201 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 202 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 203 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 220 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 234 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 246 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 253 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/forensic/ForensicIntelligenceMasterView.tsx | 260 | TS2353 | OTHER | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/components/OpportunityEngineMasterView.tsx | 1154 | TS2339 | OTHER | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/scripts/run_swarm.ts | 109 | TS18004 | OTHER | MISSING_VARIABLE | MISSING_RUNTIME_VALUE | REVIEW_REQUIRED |
| src/scripts/swarm/SwarmControlTower.ts | 23 | TS2367 | OTHER | STALE_UNION_OR_IMPOSSIBLE_COMPARISON | UNION_OR_STATE_MACHINE_DRIFT | REVIEW_REQUIRED |
| src/server/__tests__/unit/ForensicPhase1.test.ts | 18 | TS2561 | TEST | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/intelligence/engines/DecisionReplayEngine.ts | 414 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/intelligence/engines/FactValidationGate.ts | 123 | TS2367 | PRODUCTION_PATH | STALE_UNION_OR_IMPOSSIBLE_COMPARISON | UNION_OR_STATE_MACHINE_DRIFT | REVIEW_REQUIRED |
| src/server/intelligence/services/ItasIiceReconciliationService.ts | 511 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/intelligence/services/ThesisBreakerEngine.ts | 32 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/intelligence/services/ThesisBreakerEngine.ts | 85 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/adapters/FEREEngineAdapter.ts | 22 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/adapters/FEREEngineAdapter.ts | 22 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/adapters/TechnicalEngineAdapter.ts | 26 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/adapters/TechnicalEngineAdapter.ts | 26 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/audit/AccountingBugImpactAuditor.ts | 165 | TS2551 | PRODUCTION_PATH | RENAMED_PROPERTY_CANDIDATE | RENAME_CANDIDATE | REVIEW_REQUIRED |
| src/server/services/audit/AccountingBugImpactAuditor.ts | 166 | TS2339 | PRODUCTION_PATH | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/server/services/audit/AccountingBugImpactAuditor.ts | 172 | TS2551 | PRODUCTION_PATH | RENAMED_PROPERTY_CANDIDATE | RENAME_CANDIDATE | REVIEW_REQUIRED |
| src/server/services/audit/AccountingBugImpactAuditor.ts | 209 | TS2339 | PRODUCTION_PATH | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/server/services/audit/AccountingBugImpactAuditor.ts | 213 | TS2551 | PRODUCTION_PATH | RENAMED_PROPERTY_CANDIDATE | RENAME_CANDIDATE | REVIEW_REQUIRED |
| src/server/services/audit/AccountingBugImpactAuditor.ts | 273 | TS2339 | PRODUCTION_PATH | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/server/services/audit/PITDecisionEvidenceValidator.ts | 62 | TS2554 | PRODUCTION_PATH | ARGUMENT_COUNT_MISMATCH | SIGNATURE_DRIFT | REVIEW_REQUIRED |
| src/server/services/audit/PITDecisionEvidenceValidator.ts | 92 | TS2554 | PRODUCTION_PATH | ARGUMENT_COUNT_MISMATCH | SIGNATURE_DRIFT | REVIEW_REQUIRED |
| src/server/services/composable/DecisionGraph.ts | 152 | TS2339 | PRODUCTION_PATH | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/server/services/composable/DecisionGraph.ts | 154 | TS2339 | PRODUCTION_PATH | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/server/services/composable/EngineRunner.ts | 14 | TS2305 | PRODUCTION_PATH | MISSING_EXPORT | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/composable/TelemetryCollector.ts | 10 | TS2305 | PRODUCTION_PATH | MISSING_EXPORT | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 127 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 155 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 183 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 212 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 244 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 261 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 290 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 304 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConcallFailsafeHarvester.ts | 316 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/ConsolidatedOpportunityEngine.ts | 3544 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/ConsolidatedOpportunityEngine.ts | 3545 | TS2322 | PRODUCTION_PATH | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/dataenrichment/verifiers/IndependentVerifier.ts | 135 | TS2345 | PRODUCTION_PATH | ARGUMENT_TYPE_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/phase2fasttrack/StrategyReplayAdapter.ts | 32 | TS2339 | RESEARCH_OR_EXPERIMENTAL | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/server/services/phase2forensics/DownstreamWaterfallEnricher.ts | 116 | TS2367 | RESEARCH_OR_EXPERIMENTAL | STALE_UNION_OR_IMPOSSIBLE_COMPARISON | UNION_OR_STATE_MACHINE_DRIFT | REVIEW_REQUIRED |
| src/server/services/phase2forensics/Phase2MasterOrchestrator.ts | 272 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/r421/R421AdversarialSuite.ts | 52 | TS2367 | PRODUCTION_PATH | STALE_UNION_OR_IMPOSSIBLE_COMPARISON | UNION_OR_STATE_MACHINE_DRIFT | REVIEW_REQUIRED |
| src/server/services/research/BenjaminiHochbergValidator.ts | 82 | TS2345 | RESEARCH_OR_EXPERIMENTAL | ARGUMENT_TYPE_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/FrozenSignalAdapter.ts | 14 | TS2305 | RESEARCH_OR_EXPERIMENTAL | MISSING_EXPORT | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/FrozenSignalAdapter.ts | 14 | TS2305 | RESEARCH_OR_EXPERIMENTAL | MISSING_EXPORT | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/FrozenSignalAdapter.ts | 329 | TS2353 | RESEARCH_OR_EXPERIMENTAL | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 33 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 63 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 93 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 123 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 154 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 184 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 214 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 244 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 275 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r3/PredeclaredCandidateDefinitions.ts | 305 | TS2322 | RESEARCH_OR_EXPERIMENTAL | TYPE_ASSIGNABILITY_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/research/r4/R4CandidateEngine.ts | 57 | TS2367 | RESEARCH_OR_EXPERIMENTAL | STALE_UNION_OR_IMPOSSIBLE_COMPARISON | UNION_OR_STATE_MACHINE_DRIFT | REVIEW_REQUIRED |
| src/server/services/research/r4/R4CandidateEngine.ts | 58 | TS2339 | RESEARCH_OR_EXPERIMENTAL | MISSING_PROPERTY_OR_METHOD | MISSING_API_CONTRACT | REVIEW_REQUIRED |
| src/server/services/research/r4/R4CandidateEngine.ts | 215 | TS2345 | RESEARCH_OR_EXPERIMENTAL | ARGUMENT_TYPE_MISMATCH | MANUAL_SOURCE_REVIEW | REVIEW_REQUIRED |
| src/server/services/s110/S110DependencyAuditEngine.ts | 181 | TS2353 | PRODUCTION_PATH | OBJECT_LITERAL_INTERFACE_MISMATCH | INTERFACE_DRIFT | REVIEW_REQUIRED |
