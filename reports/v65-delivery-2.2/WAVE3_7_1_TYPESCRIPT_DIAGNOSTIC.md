# WEALTHOS Wave 3.7.1 TypeScript Diagnostic

- Commit: `8b74d8b4977e4ccccc040f7ac7e19f39986a6b1c`
- Evaluated: 2026-09-20T12:07:44.410Z
- TypeScript exit code: undefined
- Diagnostics: 70
- Safe fixes applied: 0

## Error Classification

- ARGUMENT_COUNT_MISMATCH / OTHER: 2
- OBJECT_LITERAL_INTERFACE_MISMATCH / OTHER: 9
- MISSING_PROPERTY_OR_METHOD / OTHER: 1
- MISSING_VARIABLE / OTHER: 1
- STALE_UNION_OR_IMPOSSIBLE_COMPARISON / OTHER: 1
- OBJECT_LITERAL_INTERFACE_MISMATCH / TEST: 1
- OBJECT_LITERAL_INTERFACE_MISMATCH / PRODUCTION_PATH: 12
- STALE_UNION_OR_IMPOSSIBLE_COMPARISON / PRODUCTION_PATH: 2
- TYPE_ASSIGNABILITY_MISMATCH / PRODUCTION_PATH: 8
- RENAMED_PROPERTY_CANDIDATE / PRODUCTION_PATH: 3
- MISSING_PROPERTY_OR_METHOD / PRODUCTION_PATH: 5
- ARGUMENT_COUNT_MISMATCH / PRODUCTION_PATH: 2
- MISSING_EXPORT / PRODUCTION_PATH: 2
- ARGUMENT_TYPE_MISMATCH / PRODUCTION_PATH: 1
- MISSING_PROPERTY_OR_METHOD / RESEARCH_OR_EXPERIMENTAL: 2
- STALE_UNION_OR_IMPOSSIBLE_COMPARISON / RESEARCH_OR_EXPERIMENTAL: 2
- TYPE_ASSIGNABILITY_MISMATCH / RESEARCH_OR_EXPERIMENTAL: 11
- ARGUMENT_TYPE_MISMATCH / RESEARCH_OR_EXPERIMENTAL: 2
- MISSING_EXPORT / RESEARCH_OR_EXPERIMENTAL: 2
- OBJECT_LITERAL_INTERFACE_MISMATCH / RESEARCH_OR_EXPERIMENTAL: 1

## Remediation Summary

- SIGNATURE_DRIFT: 4
- INTERFACE_DRIFT: 23
- MISSING_API_CONTRACT: 8
- MISSING_RUNTIME_VALUE: 1
- UNION_OR_STATE_MACHINE_DRIFT: 5
- MANUAL_SOURCE_REVIEW: 26
- RENAME_CANDIDATE: 3

## Diagnostics

### TS2554 — server.ts:510:95

**Scope:** OTHER
**Classification:** ARGUMENT_COUNT_MISMATCH
**Production impact:** INDIRECT
**Remediation:** SIGNATURE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Expected 0 arguments, but got 1.


**Required action:** COMPARE_ALL_CALLERS_WITH_CANONICAL_SIGNATURE

### TS2554 — server.ts:530:101

**Scope:** OTHER
**Classification:** ARGUMENT_COUNT_MISMATCH
**Production impact:** INDIRECT
**Remediation:** SIGNATURE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Expected 0 arguments, but got 1.


**Required action:** COMPARE_ALL_CALLERS_WITH_CANONICAL_SIGNATURE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:200:74

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'isDivergent' does not exist in type 'CfoPatDivergencePoint'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:201:74

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'isDivergent' does not exist in type 'CfoPatDivergencePoint'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:202:75

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'isDivergent' does not exist in type 'CfoPatDivergencePoint'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:203:75

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'isDivergent' does not exist in type 'CfoPatDivergencePoint'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:220:17

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'compositeHealthScore' does not exist in type 'BusinessHealthBreakdown'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:234:17

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'primaryReason' does not exist in type 'TradeViabilityBasis'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:246:17

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'targetPrice' does not exist in type 'ScenarioResult'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:253:17

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'targetPrice' does not exist in type 'ScenarioResult'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/components/forensic/ForensicIntelligenceMasterView.tsx:260:17

**Scope:** OTHER
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** INDIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'targetPrice' does not exist in type 'ScenarioResult'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2339 — src/components/OpportunityEngineMasterView.tsx:1154:27

**Scope:** OTHER
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** INDIRECT
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'strategies' does not exist on type 'ConsolidatedOpportunity'.

Identifier: `strategies`

**Existing declarations:**
- src/components/RegimeBacktestComparisonView.tsx:215 — const strategies = filtered.map((s: any) => ({
- src/components/RegimeBacktestComparisonView.tsx:298 — const strategies = new Map<string, StrategyInfo>();
- src/server/routes/infra.ts:3174 — const strategies = await dbAll(db, 'SELECT id, name, base_template_id, parameters_json FROM CustomStrategies WHERE is_active = 1');
- src/server/routes/strategies.ts:53 — const strategies = await dbAll<any>(
- src/server/services/phase2fasttrack/CanonicalLedgerDiscovery.ts:87 — const strategies: Record<string, number> = {};
- src/server/services/phase2forensics/Phase2ExcelReviewGenerator.ts:151 — const strategies = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];
- src/server/services/phase2forensics/S1ToS10ForensicReplayEngine.ts:225 — const strategies: Array<'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9' | 'S10'> = [
- src/server/services/PhaseEOptimization.ts:357 — const strategies = await dbAll<any>(
- src/server/services/r422/R422D9ImpactAudit.ts:20 — const strategies: D9StrategyImpact[] = [];
- src/server/services/RegimeBacktestEngine.ts:362 — const strategies = options?.strategyIds

**Candidate alternatives:**
- IndependentTechnicalStrategiesView — similarity 1.00
  - src/App.tsx:93
  - src/components/IndependentTechnicalStrategiesView.tsx:347
- qsStr — similarity 1.00
  - src/App.tsx:525
- g — similarity 1.00
  - src/App.tsx:577
  - src/components/ReportStudioView.tsx:613
  - src/components/ReportStudioView.tsx:634
  - src/components/ReportStudioView.tsx:731
  - src/server/fifoEngine.ts:1380
- aVal — similarity 1.00
  - src/components/AnalyticsView.tsx:172
  - src/components/CorporateActionsView.tsx:876
  - src/components/CorporateActionsView.tsx:1110
  - src/components/CorporateActionsView.tsx:1224
  - src/components/InstitutionalAnalyticsHub.tsx:2033
- s — similarity 1.00
  - src/components/AutonomousSmartMoneySentinelView.tsx:1055
  - src/components/CorporateActionsView.tsx:570
  - src/components/DashboardView.tsx:374
  - src/components/InstitutionalAnalyticsHub.tsx:233
  - src/components/KnowledgeLabView.tsx:432
- isoStr — similarity 1.00
  - src/components/DashboardView.tsx:59
- valA — similarity 1.00
  - src/components/DashboardView.tsx:288
  - src/components/DashboardView.tsx:385
  - src/components/FlexibleTelemetryPipelinePanel.tsx:177
  - src/components/FlexibleTelemetryPipelinePanel.tsx:477
  - src/components/IndependentTechnicalStrategiesView.tsx:758
- dateStr — similarity 1.00
  - src/components/DatabaseSizeInspector.tsx:100
  - src/components/OpportunityEngineMasterView.tsx:1510
  - src/components/OpportunityEngineMasterView.tsx:1560
  - src/components/OpportunityEngineMasterView.tsx:1610
  - src/components/OpportunityEngineMasterView.tsx:1658
- a — similarity 1.00
  - src/components/DatabaseSizeInspector.tsx:111
  - src/components/MultibaggerScreenerView.tsx:206
  - src/components/PMSManagerView.tsx:404
  - src/components/SettingsView.tsx:113
  - src/components/SettingsView.tsx:142
- resA — similarity 1.00
  - src/components/FlexibleTelemetryPipelinePanel.tsx:211
  - scripts/run_real_historical_v6.3_pipeline.ts:515

**References:**
- src/App.tsx:162 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:354 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:400 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:401 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:402 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:405 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:418 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:423 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:452 [OTHER]
- src/components/IndependentTechnicalStrategiesView.tsx:480 [OTHER]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS18004 — src/scripts/run_swarm.ts:109:13

**Scope:** OTHER
**Classification:** MISSING_VARIABLE
**Production impact:** INDIRECT
**Remediation:** MISSING_RUNTIME_VALUE
**Confidence:** REVIEW_REQUIRED

> No value exists in scope for the shorthand property 'manifest'. Either declare one or provide an initializer.


**Required action:** TRACE_DATA_FLOW_AND_RESTORE_REAL_VALUE

### TS2367 — src/scripts/swarm/SwarmControlTower.ts:23:9

**Scope:** OTHER
**Classification:** STALE_UNION_OR_IMPOSSIBLE_COMPARISON
**Production impact:** INDIRECT
**Remediation:** UNION_OR_STATE_MACHINE_DRIFT
**Confidence:** REVIEW_REQUIRED

> This comparison appears to be unintentional because the types 'AgentStatus' and '"PROMOTED"' have no overlap.


**Required action:** RECONCILE_DOMAIN_STATE_MODEL

### TS2561 — src/server/__tests__/unit/ForensicPhase1.test.ts:18:7

**Scope:** TEST
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** TEST_ONLY
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, but 'sales' does not exist in type 'RawFundamentalsInput'. Did you mean to write 'sales_t'?

Identifier: `sales_t`
Compiler suggestion: `sales_t`

**Candidate alternatives:**
- timeA — similarity 1.00
  - src/components/OpportunitiesRebalancingHub.tsx:505
- aCount — similarity 1.00
  - src/components/OpportunityEngineMasterView.tsx:4998
- aStr — similarity 1.00
  - src/server/camsParser.ts:253
- dateA — similarity 1.00
  - src/server/intelligence/engines/FactDerivationEngine.ts:52
- aLength — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:376
- attackA_DataSubstitution — similarity 1.00
  - src/server/services/audit/AdversarialAttackSuite.ts:56
- attackE_FrozenFileMutation — similarity 1.00
  - src/server/services/audit/AdversarialAttackSuite.ts:184
- netRealizedPnL — similarity 1.00
  - src/server/services/CapitalProtectionEngine.ts:870
- salesGrowthYoY — similarity 1.00
  - src/server/services/ConsolidatedOpportunityEngine.ts:2526
- sItem — similarity 1.00
  - src/server/services/CorporateActionsEngine.ts:255

**References:**
- src/components/forensic/CustomAnalyzer.tsx:26 [OTHER]
- src/components/forensic/CustomAnalyzer.tsx:158 [OTHER]
- src/components/forensic/CustomAnalyzer.tsx:159 [OTHER]
- src/server/routes/forensicRoutes.ts:509 [PRODUCTION_PATH]
- src/server/routes/forensicRoutes.ts:520 [PRODUCTION_PATH]
- src/server/services/ForensicScoringService.ts:35 [PRODUCTION_PATH]
- src/server/services/ForensicScoringService.ts:115 [PRODUCTION_PATH]
- src/server/services/ForensicScoringService.ts:120 [PRODUCTION_PATH]
- src/server/services/ForensicScoringService.ts:129 [PRODUCTION_PATH]
- src/server/services/ForensicScoringService.ts:135 [PRODUCTION_PATH]

**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/intelligence/engines/DecisionReplayEngine.ts:414:9

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'achievedClaims' does not exist in type 'ManagementCredibilityScorecard'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2367 — src/server/intelligence/engines/FactValidationGate.ts:123:28

**Scope:** PRODUCTION_PATH
**Classification:** STALE_UNION_OR_IMPOSSIBLE_COMPARISON
**Production impact:** DIRECT
**Remediation:** UNION_OR_STATE_MACHINE_DRIFT
**Confidence:** REVIEW_REQUIRED

> This comparison appears to be unintentional because the types 'MeasurementType' and '"GROWTH"' have no overlap.


**Required action:** RECONCILE_DOMAIN_STATE_MODEL

### TS2353 — src/server/intelligence/services/ItasIiceReconciliationService.ts:511:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'evidenceQuality' does not exist in type 'InvestmentIntelligenceBrief'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2322 — src/server/intelligence/services/ThesisBreakerEngine.ts:32:9

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '"UNRESOLVED"' is not assignable to type 'BreakerStatus'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/intelligence/services/ThesisBreakerEngine.ts:85:5

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '"UNRESOLVED"' is not assignable to type 'BreakerStatus'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/adapters/FEREEngineAdapter.ts:22:38

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '"FILTER_PASS"' is not assignable to type 'EvidenceType'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/adapters/FEREEngineAdapter.ts:22:53

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '"FILTER_REJECT"' is not assignable to type 'EvidenceType'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/adapters/TechnicalEngineAdapter.ts:26:16

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '"FILTER_PASS"' is not assignable to type 'EvidenceType'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/adapters/TechnicalEngineAdapter.ts:26:31

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '"FILTER_REJECT"' is not assignable to type 'EvidenceType'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2551 — src/server/services/audit/AccountingBugImpactAuditor.ts:165:23

**Scope:** PRODUCTION_PATH
**Classification:** RENAMED_PROPERTY_CANDIDATE
**Production impact:** DIRECT
**Remediation:** RENAME_CANDIDATE
**Confidence:** REVIEW_REQUIRED

> Property 'actualExitPrice' does not exist on type 'V65TradeRecord'. Did you mean 'actualEntryPrice'?

Identifier: `actualExitPrice`

**Existing declarations:**
- src/server/services/research/r3/ResearchLeakageDetector.ts:67 — const actualExitPrice = 100;

**Candidate alternatives:**
- resC — similarity 0.67
  - src/components/FlexibleTelemetryPipelinePanel.tsx:225
  - scripts/run_real_historical_v6.3_pipeline.ts:517
- cMap — similarity 0.67
  - src/components/InstitutionalAnalyticsHub.tsx:519
- c — similarity 0.67
  - src/components/MasterQuantDossier11TabsView.tsx:896
  - src/components/OpportunityEngineMasterView.tsx:1272
  - src/components/ReportStudioView.tsx:691
  - src/server/camsParser.ts:246
  - src/server/camsParser.ts:792
- i — similarity 0.67
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- isC — similarity 0.67
  - src/components/OpportunityEngineMasterView.tsx:1064
- t — similarity 0.67
  - src/components/ResearchAgentDossierView.tsx:160
  - src/server/camsParser.ts:460
  - src/server/camsParser.ts:491
  - src/server/database.ts:198
  - src/server/database.ts:206
- tType — similarity 0.67
  - src/server/database.ts:3220
  - src/server/fifoEngine.ts:202
  - src/server/fifoEngine.ts:395
  - src/server/fifoEngine.ts:679
  - src/server/fifoEngine.ts:1671
- tTypeUpper — similarity 0.67
  - src/server/fifoEngine.ts:1768
- mC — similarity 0.67
  - src/server/quant/NEoWaveEngine.ts:327
- cLength — similarity 0.67
  - src/server/quant/NEoWaveEngine.ts:378

**References:**
- src/server/services/audit/AccountingBugImpactAuditor.ts:7 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:8 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:27 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:165 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:170 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:171 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:172 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:178 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:213 [PRODUCTION_PATH]
- src/server/services/r421/R421LedgerReconstructor.ts:67 [PRODUCTION_PATH]

**Required action:** VERIFY_SEMANTIC_RENAME_BEFORE_CHANGE

### TS2339 — src/server/services/audit/AccountingBugImpactAuditor.ts:166:46

**Scope:** PRODUCTION_PATH
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** DIRECT
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'signalPrice' does not exist on type 'V65TradeRecord'.

Identifier: `signalPrice`

**Candidate alternatives:**
- i — similarity 1.00
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- pG — similarity 1.00
  - src/components/ReportStudioView.tsx:531
- signPr — similarity 1.00
  - src/server/quant/AlphaArchitectQmomFilter.ts:58
  - src/server/quant/forensicCalculator.ts:406
  - src/server/services/ForensicScoringService.ts:706
- nPrice — similarity 1.00
  - src/server/xirr.ts:729
  - src/server/xirr.ts:734
- g — similarity 0.50
  - src/App.tsx:577
  - src/components/ReportStudioView.tsx:613
  - src/components/ReportStudioView.tsx:634
  - src/components/ReportStudioView.tsx:731
  - src/server/fifoEngine.ts:1380
- p — similarity 0.50
  - src/App.tsx:619
  - src/components/InstitutionalAnalyticsHub.tsx:634
  - src/components/OpportunitiesRebalancingHub.tsx:956
  - src/components/PortfolioHubView.tsx:62
  - src/components/PortfolioHubView.tsx:85
- pollPriceTimestamp — similarity 0.50
  - src/App.tsx:637
- handleSyncPrices — similarity 0.50
  - src/App.tsx:657
  - src/components/CamsMutualFundsView.tsx:335
- handleWebPriceMatch — similarity 0.50
  - src/App.tsx:692
- handleConfirmWebPriceMatch — similarity 0.50
  - src/App.tsx:719

**References:**
- src/server/services/audit/AccountingBugImpactAuditor.ts:166 [PRODUCTION_PATH]
- src/server/services/research/ExecutionSimulator.ts:342 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/ExecutionSimulator.ts:438 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/types.ts:121 [RESEARCH_OR_EXPERIMENTAL]
- scripts/build_v6.5_economic_validation.ts:315 [OTHER]
- scripts/build_v6.5_economic_validation.ts:566 [OTHER]
- scripts/build_v6.5_economic_validation.ts:758 [OTHER]
- scripts/test_replay_canonical.ts:24 [OTHER]
- scripts/v672/generate_v672_r1_artifacts.ts:146 [OTHER]
- scripts/v672/generate_v672_r1_artifacts.ts:219 [OTHER]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS2551 — src/server/services/audit/AccountingBugImpactAuditor.ts:172:32

**Scope:** PRODUCTION_PATH
**Classification:** RENAMED_PROPERTY_CANDIDATE
**Production impact:** DIRECT
**Remediation:** RENAME_CANDIDATE
**Confidence:** REVIEW_REQUIRED

> Property 'actualExitPrice' does not exist on type 'V65TradeRecord'. Did you mean 'actualEntryPrice'?

Identifier: `actualExitPrice`

**Existing declarations:**
- src/server/services/research/r3/ResearchLeakageDetector.ts:67 — const actualExitPrice = 100;

**Candidate alternatives:**
- resC — similarity 0.67
  - src/components/FlexibleTelemetryPipelinePanel.tsx:225
  - scripts/run_real_historical_v6.3_pipeline.ts:517
- cMap — similarity 0.67
  - src/components/InstitutionalAnalyticsHub.tsx:519
- c — similarity 0.67
  - src/components/MasterQuantDossier11TabsView.tsx:896
  - src/components/OpportunityEngineMasterView.tsx:1272
  - src/components/ReportStudioView.tsx:691
  - src/server/camsParser.ts:246
  - src/server/camsParser.ts:792
- i — similarity 0.67
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- isC — similarity 0.67
  - src/components/OpportunityEngineMasterView.tsx:1064
- t — similarity 0.67
  - src/components/ResearchAgentDossierView.tsx:160
  - src/server/camsParser.ts:460
  - src/server/camsParser.ts:491
  - src/server/database.ts:198
  - src/server/database.ts:206
- tType — similarity 0.67
  - src/server/database.ts:3220
  - src/server/fifoEngine.ts:202
  - src/server/fifoEngine.ts:395
  - src/server/fifoEngine.ts:679
  - src/server/fifoEngine.ts:1671
- tTypeUpper — similarity 0.67
  - src/server/fifoEngine.ts:1768
- mC — similarity 0.67
  - src/server/quant/NEoWaveEngine.ts:327
- cLength — similarity 0.67
  - src/server/quant/NEoWaveEngine.ts:378

**References:**
- src/server/services/audit/AccountingBugImpactAuditor.ts:7 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:8 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:27 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:165 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:170 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:171 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:172 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:178 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:213 [PRODUCTION_PATH]
- src/server/services/r421/R421LedgerReconstructor.ts:67 [PRODUCTION_PATH]

**Required action:** VERIFY_SEMANTIC_RENAME_BEFORE_CHANGE

### TS2339 — src/server/services/audit/AccountingBugImpactAuditor.ts:209:23

**Scope:** PRODUCTION_PATH
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** DIRECT
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'securityId' does not exist on type 'V65TradeRecord'.

Identifier: `securityId`

**Existing declarations:**
- src/server/services/research/r4/R4CandidateEngine.ts:51 — const securityId = t.securityId || t.symbol || 'SECURITY_' + (t.tradeId ? t.tradeId.substring(0, 4) : '001');

**Candidate alternatives:**
- sId — similarity 1.00
  - src/components/MasterQuantDossier11TabsView.tsx:261
  - src/server/services/data/DataRequirementRegistry.ts:75
  - src/server/services/PureTechnicalStrategiesEngine.ts:3460
  - src/server/services/PureTechnicalStrategiesEngine.ts:3480
- i — similarity 1.00
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- secId — similarity 1.00
  - src/server/services/composable/DecisionGraph.ts:142
  - src/server/services/composable/EngineRunner.ts:42
  - src/server/services/data/DataCoverageValidator.ts:115
  - src/server/services/data/DataGapDetector.ts:91
  - src/server/services/data/DataGapDetector.ts:125
- securityEvidence — similarity 1.00
  - src/server/services/composable/DecisionGraph.ts:143
- secEvidence — similarity 1.00
  - src/server/services/composable/EngineRunner.ts:43
- getEvidenceForSecurity — similarity 1.00
  - src/server/services/composable/EvidenceBus.ts:104
- SecurityIdentity — similarity 1.00
  - src/server/services/data/SecurityIdentityRegistry.ts:19
- SecurityIdentityRegistry — similarity 1.00
  - src/server/services/data/SecurityIdentityRegistry.ts:32
  - src/server/services/dataAcquisition/SecurityIdentityRegistry.ts:16
- resolveSecurityId — similarity 1.00
  - src/server/services/data/SecurityIdentityRegistry.ts:52
  - src/server/services/dataAcquisition/SecurityIdentityRegistry.ts:37
- SecurityIdentityRecord — similarity 1.00
  - src/server/services/dataAcquisition/SecurityIdentityRegistry.ts:3
  - src/server/services/dataAudit/SecurityIdentityAuditor.ts:4

**References:**
- src/server/services/adapters/DoubleMomentumAdapter.ts:43 [PRODUCTION_PATH]
- src/server/services/adapters/FEREEngineAdapter.ts:44 [PRODUCTION_PATH]
- src/server/services/adapters/FundamentalAlphaAdapter.ts:43 [PRODUCTION_PATH]
- src/server/services/adapters/QGLPEngineAdapter.ts:42 [PRODUCTION_PATH]
- src/server/services/adapters/SectorRotationAdapter.ts:43 [PRODUCTION_PATH]
- src/server/services/adapters/SmartMoneyAdapter.ts:43 [PRODUCTION_PATH]
- src/server/services/adapters/TechnicalEngineAdapter.ts:49 [PRODUCTION_PATH]
- src/server/services/adapters/ValuationEngineAdapter.ts:42 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:22 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:209 [PRODUCTION_PATH]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS2551 — src/server/services/audit/AccountingBugImpactAuditor.ts:213:28

**Scope:** PRODUCTION_PATH
**Classification:** RENAMED_PROPERTY_CANDIDATE
**Production impact:** DIRECT
**Remediation:** RENAME_CANDIDATE
**Confidence:** REVIEW_REQUIRED

> Property 'actualExitPrice' does not exist on type 'V65TradeRecord'. Did you mean 'actualEntryPrice'?

Identifier: `actualExitPrice`

**Existing declarations:**
- src/server/services/research/r3/ResearchLeakageDetector.ts:67 — const actualExitPrice = 100;

**Candidate alternatives:**
- resC — similarity 0.67
  - src/components/FlexibleTelemetryPipelinePanel.tsx:225
  - scripts/run_real_historical_v6.3_pipeline.ts:517
- cMap — similarity 0.67
  - src/components/InstitutionalAnalyticsHub.tsx:519
- c — similarity 0.67
  - src/components/MasterQuantDossier11TabsView.tsx:896
  - src/components/OpportunityEngineMasterView.tsx:1272
  - src/components/ReportStudioView.tsx:691
  - src/server/camsParser.ts:246
  - src/server/camsParser.ts:792
- i — similarity 0.67
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- isC — similarity 0.67
  - src/components/OpportunityEngineMasterView.tsx:1064
- t — similarity 0.67
  - src/components/ResearchAgentDossierView.tsx:160
  - src/server/camsParser.ts:460
  - src/server/camsParser.ts:491
  - src/server/database.ts:198
  - src/server/database.ts:206
- tType — similarity 0.67
  - src/server/database.ts:3220
  - src/server/fifoEngine.ts:202
  - src/server/fifoEngine.ts:395
  - src/server/fifoEngine.ts:679
  - src/server/fifoEngine.ts:1671
- tTypeUpper — similarity 0.67
  - src/server/fifoEngine.ts:1768
- mC — similarity 0.67
  - src/server/quant/NEoWaveEngine.ts:327
- cLength — similarity 0.67
  - src/server/quant/NEoWaveEngine.ts:378

**References:**
- src/server/services/audit/AccountingBugImpactAuditor.ts:7 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:8 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:27 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:165 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:170 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:171 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:172 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:178 [PRODUCTION_PATH]
- src/server/services/audit/AccountingBugImpactAuditor.ts:213 [PRODUCTION_PATH]
- src/server/services/r421/R421LedgerReconstructor.ts:67 [PRODUCTION_PATH]

**Required action:** VERIFY_SEMANTIC_RENAME_BEFORE_CHANGE

### TS2339 — src/server/services/audit/AccountingBugImpactAuditor.ts:273:27

**Scope:** PRODUCTION_PATH
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** DIRECT
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'direction' does not exist on type 'V65TradeRecord'.

Identifier: `direction`

**Existing declarations:**
- src/server/quant/NEoWaveEngine.ts:236 — const direction: 'UP' | 'DOWN' = p1.price > p0.price ? 'UP' : 'DOWN';
- src/server/services/audit/AccountingBugImpactAuditor.ts:273 — const direction = t.direction || 'LONG';
- src/server/services/RebalancingEngine.ts:239 — let direction: 'BUY' | 'SELL';
- scripts/build_v6.5_economic_validation.ts:703 — const direction = riskContract.direction;

**Candidate alternatives:**
- onLayoutChange — similarity 1.00
  - src/App.tsx:280
- d — similarity 1.00
  - src/App.tsx:536
  - src/components/AutonomousSmartMoneySentinelView.tsx:335
  - src/components/AutonomousSmartMoneySentinelView.tsx:339
  - src/components/AutonomousSmartMoneySentinelView.tsx:344
  - src/components/AutonomousSmartMoneySentinelView.tsx:362
- onAnalyze — similarity 1.00
  - src/App.tsx:2334
- setSortDirection — similarity 1.00
  - src/components/AnalyticsView.tsx:153
  - src/components/AnalyticsView.tsx:156
  - src/components/DashboardView.tsx:414
  - src/components/DashboardView.tsx:417
  - src/components/DashboardView.tsx:421
- recUrl — similarity 1.00
  - src/components/AutonomousSmartMoneySentinelView.tsx:298
- setSelectedChecklistRec — similarity 1.00
  - src/components/AutonomousSmartMoneySentinelView.tsx:836
  - src/components/AutonomousSmartMoneySentinelView.tsx:1896
  - src/components/AutonomousSmartMoneySentinelView.tsx:2020
- onConfirm — similarity 1.00
  - src/components/ConfirmationModal.tsx:118
- onCancel — similarity 1.00
  - src/components/ConfirmationModal.tsx:119
- setDir — similarity 1.00
  - src/components/CorporateActionsView.tsx:96
  - src/components/CorporateActionsView.tsx:99
  - src/components/InstitutionalAnalyticsHub.tsx:368
  - src/components/InstitutionalAnalyticsHub.tsx:371
  - src/components/OpportunityEngineMasterView.tsx:856
- onBenchmarkChange — similarity 1.00
  - src/components/DashboardView.tsx:250

**References:**
- src/components/AutonomousSmartMoneySentinelView.tsx:1959 [OTHER]
- src/components/FlexibleTelemetryPipelinePanel.tsx:344 [OTHER]
- src/components/FlexibleTelemetryPipelinePanel.tsx:345 [OTHER]
- src/components/MiniChartThumbnail.tsx:31 [OTHER]
- src/components/MomentumReasoningPanel.tsx:540 [OTHER]
- src/components/MomentumReasoningPanel.tsx:546 [OTHER]
- src/components/OpportunitiesRebalancingHub.tsx:477 [OTHER]
- src/components/OpportunitiesRebalancingHub.tsx:842 [OTHER]
- src/components/OpportunitiesRebalancingHub.tsx:843 [OTHER]
- src/components/OpportunitiesRebalancingHub.tsx:958 [OTHER]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS2554 — src/server/services/audit/PITDecisionEvidenceValidator.ts:62:63

**Scope:** PRODUCTION_PATH
**Classification:** ARGUMENT_COUNT_MISMATCH
**Production impact:** DIRECT
**Remediation:** SIGNATURE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Expected 1 arguments, but got 2.


**Required action:** COMPARE_ALL_CALLERS_WITH_CANONICAL_SIGNATURE

### TS2554 — src/server/services/audit/PITDecisionEvidenceValidator.ts:92:67

**Scope:** PRODUCTION_PATH
**Classification:** ARGUMENT_COUNT_MISMATCH
**Production impact:** DIRECT
**Remediation:** SIGNATURE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Expected 1 arguments, but got 2.


**Required action:** COMPARE_ALL_CALLERS_WITH_CANONICAL_SIGNATURE

### TS2339 — src/server/services/composable/DecisionGraph.ts:152:87

**Scope:** PRODUCTION_PATH
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** DIRECT
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'passed' does not exist on type 'unknown'.

Identifier: `passed`

**Existing declarations:**
- src/server/services/adapters/DoubleMomentumAdapter.ts:38 — const passed = absoluteMomentum12m > 0 && relativeMomentumRank >= 70;
- src/server/services/adapters/FEREEngineAdapter.ts:38 — const passed = sym !== 'ADANIENT'; // Deterministic test gate
- src/server/services/adapters/FundamentalAlphaAdapter.ts:38 — const passed = roe > 15 && debtToEquity < 1.0;
- src/server/services/adapters/QGLPEngineAdapter.ts:37 — const passed = qglpScore >= 60;
- src/server/services/adapters/SectorRotationAdapter.ts:38 — const passed = sectorRank <= 5;
- src/server/services/adapters/SmartMoneyAdapter.ts:38 — const passed = deliveryPct > 50 && institutionalInflowScore >= 60;
- src/server/services/adapters/ValuationEngineAdapter.ts:37 — const passed = marginOfSafetyPct > 0;
- src/server/services/ForensicTestSuiteRunner.ts:83 — const passed = results.filter((r) => r.status === 'PASSED').length;
- src/server/services/ForensicTestSuiteRunner.ts:196 — const passed = titanMatches && dhflMatches && adaniMatches;
- src/server/services/ForensicTestSuiteRunner.ts:406 — const passed =

**Candidate alternatives:**
- d — similarity 1.00
  - src/App.tsx:536
  - src/components/AutonomousSmartMoneySentinelView.tsx:335
  - src/components/AutonomousSmartMoneySentinelView.tsx:339
  - src/components/AutonomousSmartMoneySentinelView.tsx:344
  - src/components/AutonomousSmartMoneySentinelView.tsx:362
- p — similarity 1.00
  - src/App.tsx:619
  - src/components/InstitutionalAnalyticsHub.tsx:634
  - src/components/OpportunitiesRebalancingHub.tsx:956
  - src/components/PortfolioHubView.tsx:62
  - src/components/PortfolioHubView.tsx:85
- aVal — similarity 1.00
  - src/components/AnalyticsView.tsx:172
  - src/components/CorporateActionsView.tsx:876
  - src/components/CorporateActionsView.tsx:1110
  - src/components/CorporateActionsView.tsx:1224
  - src/components/InstitutionalAnalyticsHub.tsx:2033
- s — similarity 1.00
  - src/components/AutonomousSmartMoneySentinelView.tsx:1055
  - src/components/CorporateActionsView.tsx:570
  - src/components/DashboardView.tsx:374
  - src/components/InstitutionalAnalyticsHub.tsx:233
  - src/components/KnowledgeLabView.tsx:432
- pParam — similarity 1.00
  - src/components/BankAndFDsView.tsx:50
- pRes — similarity 1.00
  - src/components/CamsMutualFundsView.tsx:168
- pData — similarity 1.00
  - src/components/CamsMutualFundsView.tsx:169
  - src/components/IndependentTechnicalStrategiesView.tsx:454
  - src/components/IndependentTechnicalStrategiesView.tsx:494
- pName — similarity 1.00
  - src/components/CamsMutualFundsView.tsx:176
  - src/components/ReportStudioView.tsx:317
  - src/server/fifoEngine.ts:1262
  - src/server/routes/commandCenter.ts:71
  - src/server/routes/reconciliationAudit.ts:150
- setPassInput — similarity 1.00
  - src/components/CamsMutualFundsView.tsx:250
- valA — similarity 1.00
  - src/components/DashboardView.tsx:288
  - src/components/DashboardView.tsx:385
  - src/components/FlexibleTelemetryPipelinePanel.tsx:177
  - src/components/FlexibleTelemetryPipelinePanel.tsx:477
  - src/components/IndependentTechnicalStrategiesView.tsx:758

**References:**
- src/components/ExecutiveConsensusView.tsx:51 [OTHER]
- src/components/ExecutiveConsensusView.tsx:784 [OTHER]
- src/components/ExecutiveConsensusView.tsx:786 [OTHER]
- src/components/ExecutiveConsensusView.tsx:886 [OTHER]
- src/components/ExecutiveConsensusView.tsx:893 [OTHER]
- src/components/ExecutiveConsensusView.tsx:907 [OTHER]
- src/components/ExecutiveConsensusView.tsx:911 [OTHER]
- src/components/ExecutiveConsensusView.tsx:922 [OTHER]
- src/components/forensic/ForensicIntelligenceMasterView.tsx:109 [OTHER]
- src/components/forensic/ForensicIntelligenceMasterView.tsx:405 [OTHER]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS2339 — src/server/services/composable/DecisionGraph.ts:154:36

**Scope:** PRODUCTION_PATH
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** DIRECT
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'reason' does not exist on type 'unknown'.

Identifier: `reason`

**Existing declarations:**
- src/main.tsx:15 — const reason = event.reason;
- src/server/database.ts:563 — let reason = '';
- src/server/routes/infra.ts:1328 — const reason = req.body.reason || 'Manual user rollback via Institutional Hub';
- src/server/services/CapitalProtectionEngine.ts:719 — const reason = isLossStreak
- src/server/services/phase2fasttrack/FTEVRepositoryDiffClassifier.ts:93 — let reason = '';
- src/server/services/phase2forensics/Phase2ReportPackGenerator.ts:190 — let reason = '100% parameter logic match; signals on common 50-stock universe preserved across valid trading sessions.';
- src/server/services/research/r4/R4LifecycleEngine.ts:85 — let reason = undefined;

**Candidate alternatives:**
- onLayoutChange — similarity 1.00
  - src/App.tsx:280
- onAnalyze — similarity 1.00
  - src/App.tsx:2334
- aVal — similarity 1.00
  - src/components/AnalyticsView.tsx:172
  - src/components/CorporateActionsView.tsx:876
  - src/components/CorporateActionsView.tsx:1110
  - src/components/CorporateActionsView.tsx:1224
  - src/components/InstitutionalAnalyticsHub.tsx:2033
- s — similarity 1.00
  - src/components/AutonomousSmartMoneySentinelView.tsx:1055
  - src/components/CorporateActionsView.tsx:570
  - src/components/DashboardView.tsx:374
  - src/components/InstitutionalAnalyticsHub.tsx:233
  - src/components/KnowledgeLabView.tsx:432
- onConfirm — similarity 1.00
  - src/components/ConfirmationModal.tsx:118
- onCancel — similarity 1.00
  - src/components/ConfirmationModal.tsx:119
- onBenchmarkChange — similarity 1.00
  - src/components/DashboardView.tsx:250
- valA — similarity 1.00
  - src/components/DashboardView.tsx:288
  - src/components/DashboardView.tsx:385
  - src/components/FlexibleTelemetryPipelinePanel.tsx:177
  - src/components/FlexibleTelemetryPipelinePanel.tsx:477
  - src/components/IndependentTechnicalStrategiesView.tsx:758
- a — similarity 1.00
  - src/components/DatabaseSizeInspector.tsx:111
  - src/components/MultibaggerScreenerView.tsx:206
  - src/components/PMSManagerView.tsx:404
  - src/components/SettingsView.tsx:113
  - src/components/SettingsView.tsx:142
- onPortfolioChange — similarity 1.00
  - src/components/FamilyBenchmarkManagerView.tsx:317

**References:**
- src/components/AutonomousSmartMoneySentinelView.tsx:429 [OTHER]
- src/components/GreenfieldInvestmentPortal.tsx:332 [OTHER]
- src/components/OpportunitiesRebalancingHub.tsx:238 [OTHER]
- src/components/OpportunitiesRebalancingHub.tsx:282 [OTHER]
- src/components/QuantTechnicalStudioView.tsx:838 [OTHER]
- src/components/ReconciliationView.tsx:43 [OTHER]
- src/components/ReconciliationView.tsx:172 [OTHER]
- src/components/ReconciliationView.tsx:222 [OTHER]
- src/components/ReconciliationView.tsx:1074 [OTHER]
- src/components/ReconciliationView.tsx:1141 [OTHER]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS2305 — src/server/services/composable/EngineRunner.ts:14:10

**Scope:** PRODUCTION_PATH
**Classification:** MISSING_EXPORT
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Module '"./DecisionTrace.js"' has no exported member 'DecisionTraceRecorder'.

Identifier: `DecisionTraceRecorder`

**Candidate alternatives:**
- resC — similarity 1.00
  - src/components/FlexibleTelemetryPipelinePanel.tsx:225
  - scripts/run_real_historical_v6.3_pipeline.ts:517
- cMap — similarity 1.00
  - src/components/InstitutionalAnalyticsHub.tsx:519
- c — similarity 1.00
  - src/components/MasterQuantDossier11TabsView.tsx:896
  - src/components/OpportunityEngineMasterView.tsx:1272
  - src/components/ReportStudioView.tsx:691
  - src/server/camsParser.ts:246
  - src/server/camsParser.ts:792
- dA — similarity 1.00
  - src/components/OpportunitiesRebalancingHub.tsx:433
- isC — similarity 1.00
  - src/components/OpportunityEngineMasterView.tsx:1064
- mC — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:327
- cLength — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:378
- cToARatio — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:380
- legC — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:753
- legE — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:755

**References:**
- src/server/services/composable/EngineRunner.ts:14 [PRODUCTION_PATH]
- src/server/services/composable/EngineRunner.ts:26 [PRODUCTION_PATH]

**Required action:** MANUAL_SOURCE_REVIEW

### TS2305 — src/server/services/composable/TelemetryCollector.ts:10:10

**Scope:** PRODUCTION_PATH
**Classification:** MISSING_EXPORT
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Module '"./TelemetryContract.js"' has no exported member 'EngineExecutionTelemetry'.

Identifier: `EngineExecutionTelemetry`

**Candidate alternatives:**
- legE — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:755
- attackE_FrozenFileMutation — similarity 1.00
  - src/server/services/audit/AdversarialAttackSuite.ts:184
- e — similarity 1.00
  - src/server/services/data/DataGapAuditLedger.ts:107
  - src/server/services/research/PointInTimeDataEngine.ts:199
  - scripts/audit_legacy_contamination.ts:35
  - scripts/audit_v6.5_ledger_independently.ts:175
  - scripts/wealthos_ai_studio_api_bridge.ts:262
- kappa_e — similarity 1.00
  - src/server/services/OpportunityEnginePhase4to6.ts:344
  - src/server/services/OpportunityScannerEngine.ts:361
- baselineE — similarity 1.00
  - scripts/v67/run_incremental_attribution.ts:48
- i — similarity 0.67
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- t — similarity 0.67
  - src/components/ResearchAgentDossierView.tsx:160
  - src/server/camsParser.ts:460
  - src/server/camsParser.ts:491
  - src/server/database.ts:198
  - src/server/database.ts:206
- n — similarity 0.67
  - src/lib/infraServices.ts:335
  - src/server/quant/FundamentalMoatQualityScreener.ts:64
  - src/server/quant/NEoWaveEngine.ts:331
  - src/server/routes/infra.ts:114
  - src/server/routes/infra.ts:2089
- tType — similarity 0.67
  - src/server/database.ts:3220
  - src/server/fifoEngine.ts:202
  - src/server/fifoEngine.ts:395
  - src/server/fifoEngine.ts:679
  - src/server/fifoEngine.ts:1671
- tTypeUpper — similarity 0.67
  - src/server/fifoEngine.ts:1768

**References:**
- src/server/services/composable/TelemetryCollector.ts:10 [PRODUCTION_PATH]
- src/server/services/composable/TelemetryCollector.ts:15 [PRODUCTION_PATH]
- src/server/services/composable/TelemetryCollector.ts:32 [PRODUCTION_PATH]
- src/server/services/composable/TelemetryCollector.ts:37 [PRODUCTION_PATH]

**Required action:** MANUAL_SOURCE_REVIEW

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:127:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:155:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:183:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:212:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:244:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:261:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:290:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:304:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2353 — src/server/services/ConcallFailsafeHarvester.ts:316:46

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2322 — src/server/services/ConsolidatedOpportunityEngine.ts:3544:25

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '{ regime: MacroRegime; benchmarkSymbol: string; benchmarkClose: number; sma50: number; sma200: number; indiaVix: number; vixRegime: string; leadingSector: string; statusSummary: string; globalMacroPosture: { ...; }; }' is not assignable to type '{ regime: MacroRegime; benchmarkSymbol: string; benchmarkClose: number; sma50: number; sma200: number; indiaVix: number; vixRegime: string; leadingSector: string; statusSummary: string; globalMacroPosture?: { ...; }; }'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/ConsolidatedOpportunityEngine.ts:3545:5

**Scope:** PRODUCTION_PATH
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '{ regime: MacroRegime; benchmarkSymbol: string; benchmarkClose: number; sma50: number; sma200: number; indiaVix: number; vixRegime: string; leadingSector: string; statusSummary: string; globalMacroPosture: { ...; }; }' is not assignable to type '{ regime: MacroRegime; benchmarkSymbol: string; benchmarkClose: number; sma50: number; sma200: number; indiaVix: number; vixRegime: string; leadingSector: string; statusSummary: string; globalMacroPosture?: { ...; }; }'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2345 — src/server/services/dataenrichment/verifiers/IndependentVerifier.ts:135:52

**Scope:** PRODUCTION_PATH
**Classification:** ARGUMENT_TYPE_MISMATCH
**Production impact:** DIRECT
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Argument of type 'import("C:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/src/server/services/dataenrichment/DataStagingContract").CanonicalMarketObservation[]' is not assignable to parameter of type 'import("C:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/src/server/services/dataenrichment/CanonicalObservationSerializer").CanonicalMarketObservation[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2339 — src/server/services/phase2fasttrack/StrategyReplayAdapter.ts:32:14

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'intradayTimestamp' does not exist on type 'ImmutableSignal'.

Identifier: `intradayTimestamp`

**Candidate alternatives:**
- timeInMin — similarity 1.00
  - src/App.tsx:626
- aVal — similarity 1.00
  - src/components/AnalyticsView.tsx:172
  - src/components/CorporateActionsView.tsx:876
  - src/components/CorporateActionsView.tsx:1110
  - src/components/CorporateActionsView.tsx:1224
  - src/components/InstitutionalAnalyticsHub.tsx:2033
- valA — similarity 1.00
  - src/components/DashboardView.tsx:288
  - src/components/DashboardView.tsx:385
  - src/components/FlexibleTelemetryPipelinePanel.tsx:177
  - src/components/FlexibleTelemetryPipelinePanel.tsx:477
  - src/components/IndependentTechnicalStrategiesView.tsx:758
- a — similarity 1.00
  - src/components/DatabaseSizeInspector.tsx:111
  - src/components/MultibaggerScreenerView.tsx:206
  - src/components/PMSManagerView.tsx:404
  - src/components/SettingsView.tsx:113
  - src/components/SettingsView.tsx:142
- resA — similarity 1.00
  - src/components/FlexibleTelemetryPipelinePanel.tsx:211
  - scripts/run_real_historical_v6.3_pipeline.ts:515
- aMap — similarity 1.00
  - src/components/InstitutionalAnalyticsHub.tsx:565
- aColors — similarity 1.00
  - src/components/InstitutionalAnalyticsHub.tsx:590
- i — similarity 1.00
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- dA — similarity 1.00
  - src/components/OpportunitiesRebalancingHub.tsx:433
- rankA — similarity 1.00
  - src/components/OpportunitiesRebalancingHub.tsx:501

**References:**
- src/server/services/phase2fasttrack/FastTrackTypes.ts:86 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/phase2fasttrack/ForwardOutcomeCalculator.ts:130 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/phase2fasttrack/ForwardOutcomeCalculator.ts:134 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/phase2fasttrack/ForwardOutcomeCalculator.ts:150 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/phase2fasttrack/StrategyReplayAdapter.ts:32 [RESEARCH_OR_EXPERIMENTAL]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS2367 — src/server/services/phase2forensics/DownstreamWaterfallEnricher.ts:116:46

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** STALE_UNION_OR_IMPOSSIBLE_COMPARISON
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** UNION_OR_STATE_MACHINE_DRIFT
**Confidence:** REVIEW_REQUIRED

> This comparison appears to be unintentional because the types '"APPROVED" | "CAP_LIMITED"' and '"REJECTED"' have no overlap.


**Required action:** RECONCILE_DOMAIN_STATE_MODEL

### TS2322 — src/server/services/phase2forensics/Phase2MasterOrchestrator.ts:272:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type '{ calendarCorrect: boolean; calendarSourceVerified: boolean; tradingSessions: boolean; holidayEvaluationCount: boolean; expectedPITSecurityDays: boolean; actualEvaluatedSecurityDays: boolean; ... 16 more ...; allCriticalTestsPass: boolean; }' is not assignable to type 'Record<string, boolean>'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2367 — src/server/services/r421/R421AdversarialSuite.ts:52:9

**Scope:** PRODUCTION_PATH
**Classification:** STALE_UNION_OR_IMPOSSIBLE_COMPARISON
**Production impact:** DIRECT
**Remediation:** UNION_OR_STATE_MACHINE_DRIFT
**Confidence:** REVIEW_REQUIRED

> This comparison appears to be unintentional because the types '"hash_L2_HOLD5_params"' and '"hash_L2_HOLD6_params"' have no overlap.


**Required action:** RECONCILE_DOMAIN_STATE_MODEL

### TS2345 — src/server/services/research/BenjaminiHochbergValidator.ts:82:21

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** ARGUMENT_TYPE_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Argument of type '{ hypothesisFamilyId: string; hypothesisId: string; configurationId: string; testStatistic: number; rawPValue: number; rank: number; totalHypothesesM: number; alpha: number; criticalThreshold: number; adjustedQValue: number; significant: boolean; }' is not assignable to parameter of type 'AdjustedHypothesisResult'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2305 — src/server/services/research/FrozenSignalAdapter.ts:14:10

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** MISSING_EXPORT
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Module '"./PromotionGate.js"' has no exported member 'evaluateGate'.

Identifier: `evaluateGate`

**Existing declarations:**
- src/server/services/phase2fasttrack/B1SampleGate.ts:2 — public evaluateGate(sampleStats: any): "VERIFIED" | "VERIFIED_WITH_LIMITATIONS" | "BLOCKED" | "NOT_STARTED" {
- src/server/services/phase2fasttrack/TrackBGate.ts:49 — public evaluateGate(): 'CP2.1_VERIFIED_NON_AUTHORIZING' {
- src/server/services/r43/R43FinalGate.ts:15 — public static evaluateGate(): R43GateDecision {

**Candidate alternatives:**
- aVal — similarity 1.00
  - src/components/AnalyticsView.tsx:172
  - src/components/CorporateActionsView.tsx:876
  - src/components/CorporateActionsView.tsx:1110
  - src/components/CorporateActionsView.tsx:1224
  - src/components/InstitutionalAnalyticsHub.tsx:2033
- valA — similarity 1.00
  - src/components/DashboardView.tsx:288
  - src/components/DashboardView.tsx:385
  - src/components/FlexibleTelemetryPipelinePanel.tsx:177
  - src/components/FlexibleTelemetryPipelinePanel.tsx:477
  - src/components/IndependentTechnicalStrategiesView.tsx:758
- a — similarity 1.00
  - src/components/DatabaseSizeInspector.tsx:111
  - src/components/MultibaggerScreenerView.tsx:206
  - src/components/PMSManagerView.tsx:404
  - src/components/SettingsView.tsx:113
  - src/components/SettingsView.tsx:142
- resA — similarity 1.00
  - src/components/FlexibleTelemetryPipelinePanel.tsx:211
  - scripts/run_real_historical_v6.3_pipeline.ts:515
- aMap — similarity 1.00
  - src/components/InstitutionalAnalyticsHub.tsx:565
- aColors — similarity 1.00
  - src/components/InstitutionalAnalyticsHub.tsx:590
- dA — similarity 1.00
  - src/components/OpportunitiesRebalancingHub.tsx:433
- rankA — similarity 1.00
  - src/components/OpportunitiesRebalancingHub.tsx:501
- timeA — similarity 1.00
  - src/components/OpportunitiesRebalancingHub.tsx:505
- aCount — similarity 1.00
  - src/components/OpportunityEngineMasterView.tsx:4998

**References:**
- src/server/services/phase2fasttrack/B1SampleGate.ts:2 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/phase2fasttrack/TrackBGate.ts:49 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/r43/R43FinalGate.ts:15 [PRODUCTION_PATH]
- src/server/services/research/FrozenSignalAdapter.ts:14 [RESEARCH_OR_EXPERIMENTAL]
- scripts/run_real_historical_v6.3_pipeline.ts:40 [OTHER]
- scripts/v674/run_r43_robustness.ts:114 [OTHER]

**Required action:** MANUAL_SOURCE_REVIEW

### TS2305 — src/server/services/research/FrozenSignalAdapter.ts:14:24

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** MISSING_EXPORT
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Module '"./PromotionGate.js"' has no exported member 'GateResult'.

Identifier: `GateResult`

**Existing declarations:**
- src/server/services/research/V65BaselineReproducer.ts:57 — export interface GateResult {
- scripts/run_v67_master_validation.ts:39 — export interface GateResult {

**Candidate alternatives:**
- resA — similarity 1.00
  - src/components/FlexibleTelemetryPipelinePanel.tsx:211
  - scripts/run_real_historical_v6.3_pipeline.ts:515
- gateRes — similarity 1.00
  - src/components/forensic/ForensicIntelligenceMasterView.tsx:283
- sG — similarity 1.00
  - src/components/ReportStudioView.tsx:552
- t — similarity 1.00
  - src/components/ResearchAgentDossierView.tsx:160
  - src/server/camsParser.ts:460
  - src/server/camsParser.ts:491
  - src/server/database.ts:198
  - src/server/database.ts:206
- tType — similarity 1.00
  - src/server/database.ts:3220
  - src/server/fifoEngine.ts:202
  - src/server/fifoEngine.ts:395
  - src/server/fifoEngine.ts:679
  - src/server/fifoEngine.ts:1671
- tTypeUpper — similarity 1.00
  - src/server/fifoEngine.ts:1768
- GateBVerificationResult — similarity 1.00
  - src/server/intelligence/engines/IndependentEvidenceVerifier.ts:48
- GateValidationResult — similarity 1.00
  - src/server/intelligence/services/IntelligenceQualityGate.ts:16
- legE — similarity 1.00
  - src/server/quant/NEoWaveEngine.ts:755
- attackE_FrozenFileMutation — similarity 1.00
  - src/server/services/audit/AdversarialAttackSuite.ts:184

**References:**
- src/server/services/research/FrozenSignalAdapter.ts:14 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/FrozenSignalAdapter.ts:35 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/FrozenSignalAdapter.ts:36 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/FrozenSignalAdapter.ts:55 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/FrozenSignalAdapter.ts:56 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/V65BaselineReproducer.ts:57 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/V65BaselineReproducer.ts:64 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/V65BaselineReproducer.ts:65 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/V65BaselineReproducer.ts:66 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/V65BaselineReproducer.ts:67 [RESEARCH_OR_EXPERIMENTAL]

**Required action:** MANUAL_SOURCE_REVIEW

### TS2353 — src/server/services/research/FrozenSignalAdapter.ts:329:9

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'signal' does not exist in type 'HistoricalOverlayContext'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:33:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:63:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:93:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:123:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:154:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:184:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:214:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:244:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:275:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2322 — src/server/services/research/r3/PredeclaredCandidateDefinitions.ts:305:7

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** TYPE_ASSIGNABILITY_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Type 'string' is not assignable to type 'string[]'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2367 — src/server/services/research/r4/R4CandidateEngine.ts:57:48

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** STALE_UNION_OR_IMPOSSIBLE_COMPARISON
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** UNION_OR_STATE_MACHINE_DRIFT
**Confidence:** REVIEW_REQUIRED

> This comparison appears to be unintentional because the types '"MODE_A_FILTER" | "MODE_B_CONFIRMATION" | "MODE_C_SCORE"' and '"LIFECYCLE_RULE"' have no overlap.


**Required action:** RECONCILE_DOMAIN_STATE_MODEL

### TS2339 — src/server/services/research/r4/R4CandidateEngine.ts:58:28

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** MISSING_PROPERTY_OR_METHOD
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MISSING_API_CONTRACT
**Confidence:** REVIEW_REQUIRED

> Property 'lifecyclePolicy' does not exist on type 'R4Experiment'.

Identifier: `lifecyclePolicy`

**Candidate alternatives:**
- yMaxDomain — similarity 1.00
  - src/components/DashboardView.tsx:253
- resC — similarity 1.00
  - src/components/FlexibleTelemetryPipelinePanel.tsx:225
  - scripts/run_real_historical_v6.3_pipeline.ts:517
- cMap — similarity 1.00
  - src/components/InstitutionalAnalyticsHub.tsx:519
- c — similarity 1.00
  - src/components/MasterQuantDossier11TabsView.tsx:896
  - src/components/OpportunityEngineMasterView.tsx:1272
  - src/components/ReportStudioView.tsx:691
  - src/server/camsParser.ts:246
  - src/server/camsParser.ts:792
- i — similarity 1.00
  - src/components/MiniChartThumbnail.tsx:24
  - src/components/NriTaxRepatriationHub.tsx:43
  - src/components/SettingsView.tsx:204
  - src/components/TaxView.tsx:56
  - src/lib/driveExport.ts:204
- y — similarity 1.00
  - src/components/MiniChartThumbnail.tsx:40
  - src/components/NriTaxRepatriationHub.tsx:44
  - src/components/ReportsEngineModal.tsx:163
  - src/components/ResearchAgentDossierView.tsx:248
  - src/components/TaxView.tsx:57
- needleY — similarity 1.00
  - src/components/MomentumReasoningPanel.tsx:95
- isC — similarity 1.00
  - src/components/OpportunityEngineMasterView.tsx:1064
- padY — similarity 1.00
  - src/components/ResearchAgentDossierView.tsx:185
- scaleY — similarity 1.00
  - src/components/ResearchAgentDossierView.tsx:197

**References:**
- src/server/services/r421/R421PITDependencyAudit.ts:3 [PRODUCTION_PATH]
- src/server/services/r421/R421PITDependencyAudit.ts:36 [PRODUCTION_PATH]
- src/server/services/research/r4/R4CandidateEngine.ts:58 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/r4/R4LifecycleEngine.ts:39 [RESEARCH_OR_EXPERIMENTAL]
- src/server/services/research/r4/R4LifecycleEngine.ts:163 [RESEARCH_OR_EXPERIMENTAL]

**Required action:** TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD

### TS2345 — src/server/services/research/r4/R4CandidateEngine.ts:215:97

**Scope:** RESEARCH_OR_EXPERIMENTAL
**Classification:** ARGUMENT_TYPE_MISMATCH
**Production impact:** RESEARCH_OR_EXPERIMENTAL
**Remediation:** MANUAL_SOURCE_REVIEW
**Confidence:** REVIEW_REQUIRED

> Argument of type 'unknown' is not assignable to parameter of type 'number'.


**Required action:** MANUAL_SOURCE_REVIEW

### TS2353 — src/server/services/s110/S110DependencyAuditEngine.ts:181:7

**Scope:** PRODUCTION_PATH
**Classification:** OBJECT_LITERAL_INTERFACE_MISMATCH
**Production impact:** DIRECT
**Remediation:** INTERFACE_DRIFT
**Confidence:** REVIEW_REQUIRED

> Object literal may only specify known properties, and 'name' does not exist in type 'StrategyDependencyManifest'.


**Required action:** COMPARE_CALLER_WITH_CANONICAL_INTERFACE
