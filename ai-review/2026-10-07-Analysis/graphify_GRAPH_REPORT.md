# Graph Report - wproj  (2026-10-07)

## Corpus Check
- 75 files · ~356,930 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: (none) 1)

## Summary
- 1383 nodes · 2695 edges · 58 communities (52 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- PureTechnicalStrategiesEngine.ts
- infra.ts
- server.ts
- getDB
- package.json
- App.tsx
- xirr.ts
- scripts
- dependencies
- MarketDataCache
- types.ts
- yahooFinance.ts
- dbAll
- SmartMoneyConceptsEngine.ts
- ConsolidatedOpportunityEngine.ts
- infraServices.ts
- App
- devDependencies
- camsParser.ts
- imports.ts
- ref_path
- DashboardView.tsx
- MomentumVpaEngine
- dbRun
- OpportunityScannerEngine.ts
- OpportunityEngineMasterView.tsx
- MomentumVpaEngine.ts
- CorporateActionsEngine.ts
- database.ts
- compilerOptions
- ZerodhaSyncService.ts
- remoteBridgeRouter.ts
- express
- TaxHarvestingEngine.ts
- forensicRoutes.ts
- DuckDbAdjustedOhlcvService.ts
- RegimeBacktestEngine.ts
- quantRoutes.ts
- settings.ts
- fifoEngine.ts
- strategies.ts
- MultiBrokerReconService.ts
- ImportsHubView.tsx
- ZerodhaSyncService
- stockscansRoutes.ts
- OpportunityScannerEngine
- QuantitativeBacktestScheduler
- AutonomousSmartMoneyAgent.ts
- SignalEngine.ts
- fetch
- .getInstance
- main.tsx
- .getInstance
- LiveMarketStreamService.ts
- apiClient.ts
- refreshState.ts
- .getInstance
- tenantScoper.ts

## God Nodes (most connected - your core abstractions)
1. `getDB()` - 104 edges
2. `dbRun()` - 84 edges
3. `dbAll()` - 82 edges
4. `dbGet()` - 69 edges
5. `scripts` - 52 edges
6. `ConsolidatedOpportunityEngine` - 38 edges
7. `startServer()` - 31 edges
8. `express` - 27 edges
9. `runFIFO()` - 27 edges
10. `MomentumVpaEngine` - 27 edges

## Surprising Connections (you probably didn't know these)
- `invalidateDashboardCache()` --indirect_call--> `db()`  [INFERRED]
  server.ts → src/server/routes/shared.ts
- `getBenchmarkIndexFast()` --indirect_call--> `db()`  [INFERRED]
  server.ts → src/server/routes/shared.ts
- `getValuedHoldingsAsOfDate()` --indirect_call--> `db()`  [INFERRED]
  server.ts → src/server/routes/shared.ts
- `restoreDatabaseFromBuffer()` --indirect_call--> `db()`  [INFERRED]
  server.ts → src/server/routes/shared.ts
- `startServer()` --indirect_call--> `db()`  [INFERRED]
  server.ts → src/server/routes/shared.ts

## Import Cycles
- 3-file cycle: `src/server/database.ts -> src/server/xirr.ts -> src/server/fifoEngine.ts -> src/server/database.ts`

## Communities (58 total, 6 thin omitted)

### Community 0 - "PureTechnicalStrategiesEngine.ts"
Cohesion: 0.05
Nodes (22): technicalindicators, DuckDbAdjustedOhlcvService, Candle, FairValueGapInfo, IndependentTechnicalScanReport, MultiConvergenceMatch, PureTechnicalStrategiesEngine, RuleCheck (+14 more)

### Community 1 - "infra.ts"
Cohesion: 0.03
Nodes (16): CUSTOM_STRATEGY_SYSTEM_COLUMNS, handleAnalyze360Get(), handleAnalyze360RefreshData(), handleCompanyIntelligenceGet(), handleCompanyIntelligenceRefresh(), handleDataCoverageGet(), handleEnrichmentStatusGet(), handleIntelligenceInbox() (+8 more)

### Community 2 - "server.ts"
Cohesion: 0.03
Nodes (23): apiAnalyticsCache, app, assetXirrCache, benchmarkCacheMap, computeAnnualFy(), dashboardResponseCache, dashboardRevalidating, dbRestoreUpload (+15 more)

### Community 3 - "getDB"
Cohesion: 0.07
Nodes (5): getDB(), handleScripsSearch(), AutonomousSmartMoneyAgent, ConsolidatedOpportunityEngine, NriWealthService

### Community 4 - "package.json"
Cohesion: 0.03
Nodes (57): main, name, private, type, version, adm-zip, archiver, autoprefixer (+49 more)

### Community 5 - "App.tsx"
Cohesion: 0.05
Nodes (23): AssetScripMappingView, AutonomousSmartMoneySentinelView, FamilyBenchmarkManagerView, ForensicIntelligenceMasterView, GreenfieldInvestmentPortal, IndependentTechnicalStrategiesView, InstitutionalAnalyticsHub, LedgerHubView (+15 more)

### Community 6 - "xirr.ts"
Cohesion: 0.05
Nodes (29): parseBankBookRecord(), parseExcelDate(), calculateTaxSummary(), getFYFromDate(), parseDate(), BankAndFDService, BankOrFD, CurrencyRate (+21 more)

### Community 7 - "scripts"
Cohesion: 0.04
Nodes (52): scripts, ai-review, ai-review:tunnel, build, chatgpt:export-schema, chatgpt-review, chatgpt-review:focused, clean (+44 more)

### Community 8 - "dependencies"
Cohesion: 0.04
Nodes (49): dependencies, adm-zip, archiver, @aws-sdk/client-bedrock-runtime, better-sqlite3, @capacitor/android, @capacitor/cli, @capacitor/core (+41 more)

### Community 9 - "MarketDataCache"
Cohesion: 0.07
Nodes (6): LiveMarketStreamService, CacheEntry, CacheMetrics, MarketDataCache, OpportunityEngineScheduler, isIndianMarketHours()

### Community 10 - "types.ts"
Cohesion: 0.09
Nodes (27): ActionHistoryLog, BacktestComparisonRow, CarriedForwardLossRecord, CorporateAction, DataQualityGateCheck, DisplacementQualityScore, EpisodicPivotInput, EpisodicPivotOutput (+19 more)

### Community 11 - "yahooFinance.ts"
Cohesion: 0.10
Nodes (26): getNiftyBenchmarkData(), recordValuationSnapshot(), autoFetchMarketData(), CombinedCorporateAction, failedUpstoxCandleSymbols, failedUpstoxCAs, failedYahooSymbols, fetchAlpacaTickerData() (+18 more)

### Community 12 - "dbAll"
Cohesion: 0.11
Nodes (20): buildDashboardPayload(), cleanupDuplicateTransactions(), formatIsoDate(), generateImmediateGrowthHistory(), getCashFlowLedger(), getHoldingQtyOnDate(), getSelectedPortfolios(), migratePortfolios() (+12 more)

### Community 13 - "SmartMoneyConceptsEngine.ts"
Cohesion: 0.09
Nodes (15): Candle, DisplacementResult, FairValueGap, FullSmcAnalysis, LiquidityPool, LiquiditySweep, OrderBlock, PremiumDiscountRange (+7 more)

### Community 14 - "ConsolidatedOpportunityEngine.ts"
Cohesion: 0.07
Nodes (21): CalibrationLedgerEntry, ConsolidatedOpportunity, DEFAULT_TIER_RANKING_WEIGHTS, EvidenceClassChecklist, FiiDiiFlowPulse, GateProof, GlobalMacroPulseReport, HoldingClassification (+13 more)

### Community 15 - "infraServices.ts"
Cohesion: 0.11
Nodes (25): startServer(), all(), AuditEntryInput, CalibrationStatsRecord, DedupRecord, FeedState, FeedStatusRecord, get() (+17 more)

### Community 16 - "App"
Cohesion: 0.08
Nodes (15): App(), AuditWorkspace, DiscoverWorkspace, FamilyOfficeCommandCenter, LazyFallback(), NotFoundRecoveryView, PerformanceSnapshotModal, PortfolioHubView (+7 more)

### Community 17 - "devDependencies"
Cohesion: 0.08
Nodes (25): devDependencies, autoprefixer, axios, concurrently, cross-env, electron, electron-builder, jest (+17 more)

### Community 18 - "camsParser.ts"
Cohesion: 0.12
Nodes (18): xlsx, amfiNameMap, CamsTransaction, cleanSchemeName(), execFileAsync, extractPanFromString(), extractSummaryFromPdfText(), fetchAMFIMapping() (+10 more)

### Community 19 - "imports.ts"
Cohesion: 0.11
Nodes (21): csv-parse, extractTextFromPdf(), fetchAMFINavs(), fetchAMFISchemeCodes(), fetchNAVFromMFapi(), CCBankBookColMap, CCBankBookRecord, DEFAULT_CC_BANK_COL_MAP (+13 more)

### Community 20 - "ref_path"
Cohesion: 0.09
Nodes (13): @tailwindcss/vite, vite, @vitejs/plugin-react, dossierRouter, compiler, engine, router, PmsCashReconResult (+5 more)

### Community 21 - "DashboardView.tsx"
Cohesion: 0.15
Nodes (17): motion, recharts, DashboardView(), DashboardViewProps, formatLastUpdate(), isAifHolding(), downloadXirrAuditExcel(), formatCrore2Dec() (+9 more)

### Community 23 - "dbRun"
Cohesion: 0.14
Nodes (14): purgePortfolioData(), reconcileCC9WithLatestStatement(), saveUserMappingsAndIsins(), seedDatabase(), createPersistentBackup(), dbGet(), dbRun(), isBusyError() (+6 more)

### Community 24 - "OpportunityScannerEngine.ts"
Cohesion: 0.12
Nodes (11): CapitalRedeploymentReport, CapitalRedeploymentSwitch, DeployedFundDiagnostic, ForensicShieldResult, MfInvestmentOpportunity, MultiPillarStockRationale, OpportunityScannerReport, StockInvestmentOpportunity (+3 more)

### Community 25 - "OpportunityEngineMasterView.tsx"
Cohesion: 0.11
Nodes (13): OpportunityEngineMasterView, CalibrationLedgerEntry, ConsolidatedOpportunity, DashboardReportData, EvidenceClassChecklist, FiiDiiFlowPulse, GlobalMacroPulseReport, IndexBreadthItem (+5 more)

### Community 26 - "MomentumVpaEngine.ts"
Cohesion: 0.11
Nodes (16): BaseCompactionResult, Candle, CompositeConviction, FundamentalQualityResult, ImpulseResult, MacroRegimeMode, MacroRegimeResult, MarketSentimentResult (+8 more)

### Community 27 - "CorporateActionsEngine.ts"
Cohesion: 0.18
Nodes (16): checkMutationDedup(), computeDedupKey(), recordMutationDedup(), writeAuditEntry(), all(), applyCorporateActionWithVerification(), CostBasisVerificationReport, DividendSummaryResult (+8 more)

### Community 28 - "database.ts"
Cohesion: 0.16
Nodes (15): restoreDatabaseFromBuffer(), auditDBChange(), closeDB(), getActiveDB(), getDatabaseTxCountSync(), initializeDatabase(), isTransactionActive, migrateDatasetPromotionManifests() (+7 more)

### Community 29 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 30 - "ZerodhaSyncService.ts"
Cohesion: 0.12
Nodes (7): multer, ws, router, router, upload, ZerodhaHoldingRaw, ZerodhaSyncResult

### Community 31 - "remoteBridgeRouter.ts"
Cohesion: 0.16
Nodes (7): router, getExpectedKeys(), ipRequestCounts, remoteBridgeRouter, requireRemoteAuth(), timingSafeTokenCompare(), verifyBearerToken()

### Community 32 - "express"
Cohesion: 0.13
Nodes (8): express, router, bedrock, router, router, nriService, router, router

### Community 33 - "TaxHarvestingEngine.ts"
Cohesion: 0.15
Nodes (13): AdvanceTaxInstallment, all(), CflWaterfallItem, computeAdvanceTaxSchedule(), get(), getCflWaterfall(), getRepurchaseFollowUpReminders(), getTaxHarvestingRecommendations() (+5 more)

### Community 35 - "DuckDbAdjustedOhlcvService.ts"
Cohesion: 0.14
Nodes (11): handleAnalyze360Alert(), handleAnalyze360Backtest(), handleAnalyze360PaperTrade(), AdjustedOhlcvBar, BridgeInvokeResult, DuckDbReadinessResult, OhlcvReadResult, OhlcvReadSource (+3 more)

### Community 36 - "RegimeBacktestEngine.ts"
Cohesion: 0.16
Nodes (9): evaluateS14_BearishHedge(), evaluateS15_CreditSpreads(), regimeBacktestRouter, ReEntryRecord, RegimeDefinition, REGIMES, RegimeSummaryRecord, RegimeTradeRecord (+1 more)

### Community 37 - "quantRoutes.ts"
Cohesion: 0.15
Nodes (9): calculateEPVValuationV5(), calculateLimitPullbackEntryV6(), calculatePositionSizeV5(), classifyMacroRegimeV5(), evaluateDisplacementQualityScoreV6(), evaluateEpisodicPivotS12(), evaluateOrderBookImbalanceV5(), evaluateS13EarningsAccelerationV6() (+1 more)

### Community 38 - "settings.ts"
Cohesion: 0.17
Nodes (4): sqlite3, router, MasterTickerService, TickerSeed

### Community 39 - "fifoEngine.ts"
Cohesion: 0.18
Nodes (9): getValuedHoldingsAsOfDate(), runInDbLock(), BuyLot, formatDate(), getFolioFromNotes(), getHoldingsAsOfDate(), registerFifoCompletedCallback(), syncDualCostBasis() (+1 more)

### Community 40 - "strategies.ts"
Cohesion: 0.17
Nodes (4): exceljs, router, strategiesRouter, ./src/server/services/StrategyPreCalculationService.js

### Community 41 - "MultiBrokerReconService.ts"
Cohesion: 0.20
Nodes (5): BrokerFormatId, BrokerTemplateInfo, MultiBrokerReconService, ReconHoldingItem, SUPPORTED_BROKER_TEMPLATES

### Community 42 - "ImportsHubView.tsx"
Cohesion: 0.20
Nodes (4): lucide-react, ImportsHubView, ImportsHubViewProps, Transaction

### Community 45 - "OpportunityScannerEngine"
Cohesion: 0.33
Nodes (5): computeCalibratedProbability(), computeKellyFraction(), computeSectorZScore(), evaluateForensicIntegrity(), OpportunityScannerEngine

### Community 47 - "AutonomousSmartMoneyAgent.ts"
Cohesion: 0.20
Nodes (3): AgentHealthMetrics, AutonomousAlert, AutonomousRecommendation

### Community 48 - "SignalEngine.ts"
Cohesion: 0.22
Nodes (3): SignalContext, SignalEngine, SignalResult

### Community 49 - "fetch"
Cohesion: 0.25
Nodes (7): node-fetch, fetchMicrocapBenchmarkFromMFapi(), fetchSmallcapBenchmarkFromMFapi(), getBenchmarkIndexFast(), getCachedBenchmarkData(), aiStudioProxyRouter, fetch()

### Community 50 - ".getInstance"
Cohesion: 0.22
Nodes (8): armStaggeredOrderHandler(), getGreenfieldRecommendationsHandler(), getMomentumVpaAlertsHandler(), getMomentumVpaAnalysisHandler(), getMomentumVpaOrdersHandler(), getMomentumVpaScannerHandler(), simulatePaperTradeHandler(), updateOrderPriceHandler()

### Community 51 - "main.tsx"
Cohesion: 0.29
Nodes (3): react, react-dom, @react-oauth/google

### Community 52 - ".getInstance"
Cohesion: 0.29
Nodes (6): dismissAlertHandler(), getAlertsHandler(), getHealthHandler(), getRecommendationsHandler(), getWeightingMatrixHandler(), scanNowHandler()

### Community 53 - "LiveMarketStreamService.ts"
Cohesion: 0.33
Nodes (4): ClientSubscription, LiveAlertBroadcastMessage, LiveRecommendationBroadcastMessage, LiveTickMessage

### Community 54 - "apiClient.ts"
Cohesion: 0.40
Nodes (3): RemoteResponse, RemoteStatus, WealthOSApiClient

### Community 55 - "refreshState.ts"
Cohesion: 0.47
Nodes (5): formatRefreshLabel(), getStoredRefreshStamp(), persistRefreshStamp(), RefreshMetadata, triggerBackgroundMarketDataSync()

### Community 56 - ".getInstance"
Cohesion: 0.50
Nodes (3): evaluateSmcCandlesHandler(), getSmcAnalysisHandler(), getSmcScannerHandler()

## Knowledge Gaps
- **405 isolated node(s):** `name`, `private`, `version`, `main`, `type` (+400 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 690 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `express` to `infra.ts`, `server.ts`, `forensicRoutes.ts`, `package.json`, `quantRoutes.ts`, `RegimeBacktestEngine.ts`, `settings.ts`, `strategies.ts`, `dbAll`, `stockscansRoutes.ts`, `fetch`, `camsParser.ts`, `imports.ts`, `ref_path`, `dbRun`, `ZerodhaSyncService.ts`, `remoteBridgeRouter.ts`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _405 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PureTechnicalStrategiesEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054385964912280704 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Should `infra.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.02918918918918919 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.031167690956979806 - nodes in this community are weakly interconnected._