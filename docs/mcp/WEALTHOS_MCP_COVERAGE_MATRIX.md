# WEALTHOS UNIVERSAL MCP COVERAGE MATRIX
**Automatic Coverage Gate (Section C Compliance)**  
**Acceptance Requirement:** 100% of IMPLEMENTED user-facing WealthOS capabilities must have a disposition. Zero silent omissions.

---

## Coverage Summary
- Total Implemented Capabilities: **43**
- Direct MCP Tools: **41**
- Composite MCP Tools: **2**
- MCP Resources: **0**
- Not Exposed (with explicit reason): **0**
- **Coverage Disposition Rate: 100.0%**

---

## Detailed Mapping

| Capability ID | Domain | User-Facing Capability | Production Service & Method | MCP Disposition | MCP Tool / Resource Name |
|---|---|---|---|---|---|
| **CAP-SEC-001** | SECURITY_MASTER | Search and resolve securities by symbol, name, or ISIN | `MasterTickerService :: resolveTicker, searchTickers` | `DIRECT_MCP_TOOL` | `search_securities` |
| **CAP-SEC-002** | SECURITY_MASTER | Resolve exact canonical security identity and prevent ticker collisions (e.g. STYL vs STYLAMIND) | `MasterTickerService :: resolveCanonicalIdentity` | `DIRECT_MCP_TOOL` | `resolve_security` |
| **CAP-SEC-003** | SECURITY_MASTER | Get full security profile, listing platform, and asset type | `AssetScripMappingService, ListingPlatformClassifier :: getMappings, classifyPlatform` | `DIRECT_MCP_TOOL` | `get_security_profile` |
| **CAP-PORT-001** | PORTFOLIO_MANAGEMENT | List all managed family/investor portfolios | `database.ts :: dbAll("SELECT * FROM Portfolios")` | `DIRECT_MCP_TOOL` | `list_portfolios` |
| **CAP-PORT-002** | PORTFOLIO_MANAGEMENT | Get aggregated portfolio summary (AUM, current value, total cost, unrealized P&L) | `database.ts :: getPortfolioSummary` | `DIRECT_MCP_TOOL` | `get_portfolio_summary` |
| **CAP-PORT-003** | PORTFOLIO_MANAGEMENT | Get active portfolio holdings with quantities, average cost, LTP, current value, and unrealized gains | `fifoEngine.ts, database.ts :: calculateHoldingsWithFIFO, getHoldings` | `DIRECT_MCP_TOOL` | `get_portfolio_holdings` |
| **CAP-PORT-004** | PORTFOLIO_MANAGEMENT | Get portfolio asset and sector allocation breakdown | `LookthroughService, AllocationEngine :: computeEffectiveHoldings, getAllocation` | `DIRECT_MCP_TOOL` | `get_portfolio_allocation` |
| **CAP-PORT-005** | PORTFOLIO_MANAGEMENT | Get historical portfolio snapshot and value checkpoints | `database.ts :: getGrowthHistory` | `DIRECT_MCP_TOOL` | `get_portfolio_history` |
| **CAP-PORT-006** | PORTFOLIO_MANAGEMENT | Add a new investment transaction with validation and deduplication | `database.ts, TransactionDeduplicationService :: addTransactionWithDedup` | `DIRECT_MCP_TOOL` | `add_transaction` |
| **CAP-PORT-007** | PORTFOLIO_MANAGEMENT | List and filter raw portfolio transactions | `database.ts :: getTransactions` | `DIRECT_MCP_TOOL` | `get_portfolio_transactions` |
| **CAP-COPILOT-001** | PORTFOLIO_QUERY | Multi-attribute structured query of portfolio holdings, risks, fundamentals, and valuations | `PortfolioIntelligenceWatchlist, fifoEngine.ts :: queryHoldingsWithMetadata` | `DIRECT_MCP_TOOL` | `query_portfolio` |
| **CAP-XIRR-001** | XIRR_RETURNS | Calculate exact portfolio XIRR using true dated cashflows | `xirr.ts :: calculateXIRR` | `DIRECT_MCP_TOOL` | `get_portfolio_xirr` |
| **CAP-XIRR-002** | XIRR_RETURNS | Calculate per-security XIRR for a specific stock/scrip | `xirr.ts :: calculateSecurityXIRR` | `DIRECT_MCP_TOOL` | `get_security_xirr` |
| **CAP-XIRR-003** | XIRR_RETURNS | Calculate post-tax and dual-currency XIRR (INR and USD/AED/GBP) for NRI accounts | `PostTaxXirrService.ts, NriWealthService.ts :: computeDualCurrencyXirr` | `DIRECT_MCP_TOOL` | `get_dual_currency_xirr` |
| **CAP-TAX-001** | TAX_FIFO | Get capital gains tax summary (LTCG vs STCG, grandfathering under Section 112A) | `fifoEngine.ts :: calculateCapitalGainsTax` | `DIRECT_MCP_TOOL` | `get_tax_summary` |
| **CAP-TAX-002** | TAX_FIFO | Identify tax harvesting opportunities (offsetting realized short/long term gains with unrealized losses) | `TaxHarvestingEngine.ts :: evaluateHarvestingOpportunities` | `DIRECT_MCP_TOOL` | `get_tax_harvesting_opportunities` |
| **CAP-REP-001** | REPORTING | List all available commercial and analytical reports | `ReportsService.ts :: listAvailableReports` | `DIRECT_MCP_TOOL` | `list_reports` |
| **CAP-REP-002** | REPORTING | Generate comprehensive commercial Excel / PDF report for portfolio or institutional dossier | `CommercialExcelReportService.ts, InstitutionalDossierReportGenerator.ts :: generateCommercialReport, buildDossier` | `DIRECT_MCP_TOOL` | `generate_report` |
| **CAP-INTEL-001** | COMPANY_INTELLIGENCE | Get full multi-module company intelligence (business, fundamentals, management, valuation, catalysts, risks) | `ScripIntelligenceDossierService.ts, Orchestrator :: getCompanyIntelligence` | `DIRECT_MCP_TOOL` | `get_company_intelligence` |
| **CAP-INTEL-002** | COMPANY_INTELLIGENCE | Get canonical point-in-time financial statements and metric history | `FinancialHistoryService.ts, CanonicalFactIngestionService.ts :: getFinancialHistory` | `DIRECT_MCP_TOOL` | `get_financial_statements` |
| **CAP-INTEL-003** | COMPANY_INTELLIGENCE | Get management Walk-the-Talk analysis, commitments, track record and adverse evidence preservation | `ClaimLedgerService.ts, ScripKnowledgeBaseService.ts :: getCommitmentsAndClaims` | `DIRECT_MCP_TOOL` | `get_management_analysis` |
| **CAP-INTEL-004** | COMPANY_INTELLIGENCE | Get fact-based valuation analysis, reverse DCF, PE vs historical band, and fair value | `UnifiedValuationService.ts, NormalizedReverseDCFEngine.ts :: computeValuation` | `DIRECT_MCP_TOOL` | `get_valuation_analysis` |
| **CAP-QGLP-001** | QGLP | Calculate deterministic Motilal-Oswal style QGLP score (Quality, Growth, Longevity, Price) | `QglpScoringService.ts :: calculateQglp` | `DIRECT_MCP_TOOL` | `get_qglp_analysis` |
| **CAP-OPP-001** | OPPORTUNITY_ENGINE | Run consolidated multi-engine opportunity discovery (fundamental, technical, institutional flow) | `ConsolidatedOpportunityEngine.ts, OpportunityScannerEngine.ts :: runScan, getCandidates` | `DIRECT_MCP_TOOL` | `run_opportunity_discovery` |
| **CAP-OPP-002** | OPPORTUNITY_ENGINE | Get current high-conviction opportunity candidates with sleeve allocation | `SevenStrategiesCandidatesService.ts :: getCandidates` | `DIRECT_MCP_TOOL` | `get_opportunity_candidates` |
| **CAP-FND-001** | FUNDAMENTAL_DISCOVERY | Screen companies by fundamental moat, growth, leverage, and earnings quality | `StrategyFundamentalFilterService.ts, FundamentalMoatQualityScreener.ts :: evaluateUniverse, filterCandidates` | `DIRECT_MCP_TOOL` | `screen_fundamentals` |
| **CAP-TECH-001** | TECHNICAL_ANALYSIS | Get adjusted daily OHLCV candlestick bars from DuckDB Parquet store | `DuckDbAdjustedOhlcvService.ts :: invokeForSymbol` | `DIRECT_MCP_TOOL` | `get_adjusted_ohlcv` |
| **CAP-TECH-002** | TECHNICAL_ANALYSIS | Compute technical indicators (SMA, EMA, RSI, ATR, Support/Resistance, Trend regime) | `TechnicalAnalysisEngine.ts, SupportResistanceEngine.ts :: computeIndicators` | `DIRECT_MCP_TOOL` | `get_technical_indicators` |
| **CAP-STRAT-001** | TECHNICAL_STRATEGIES | Evaluate production technical strategies (S1A, S1B, S2A, S3A, S4B, S5A) for a symbol | `PureTechnicalStrategiesEngine.ts, S3aStrategy.ts, S4aGapRunningStrategy.ts, S5aMinerviniStrategy.ts :: evaluateSymbol, runEvaluation` | `DIRECT_MCP_TOOL` | `evaluate_strategies` |
| **CAP-STRAT-002** | TECHNICAL_STRATEGIES | Get latest pre-calculated strategy candidates across the full Indian equity universe | `SevenStrategiesCandidatesService.ts :: getStrategyScanCandidates` | `DIRECT_MCP_TOOL` | `get_strategy_scan_results` |
| **CAP-SEC-MOM-001** | SECTOR_MOMENTUM | Get sector momentum rankings, sector relative strength, and capital flow distribution | `SectorMomentumService.ts, SectorFlowService.ts, MacroRegimeClassifierService.ts :: getRankings, getSectorFlow` | `DIRECT_MCP_TOOL` | `get_sector_momentum` |
| **CAP-UNIV-001** | MARKET_UNIVERSE | Get Indian equity universe summary, active counts, and OHLCV coverage audit | `MasterIndianUniverseService.ts, UniverseDataAuditService.ts :: getUniverseStats` | `DIRECT_MCP_TOOL` | `get_universe_coverage` |
| **CAP-DATA-001** | DATA_INGESTION | Inspect data freshness, latest update timestamps, and missing data coverage | `UniversalDataIntegrityGate.ts, FlexibleTelemetryPipelineService.ts :: checkDataQuality` | `DIRECT_MCP_TOOL` | `get_data_freshness_summary` |
| **CAP-EV-001** | EVIDENCE_FERE | Trace exact provenance, source filing, citation, and verification status for any fact or claim | `FereEvidenceService.ts, IndependentEvidenceVerifier.ts :: getFactEvidence` | `DIRECT_MCP_TOOL` | `get_fact_provenance` |
| **CAP-COMP-001** | COMPOSITE_TOOLS | Orchestrate complete end-to-end investment research candidate dossier across all modules | `ScripIntelligenceDossierService.ts :: buildComprehensiveCandidateDossier` | `COMPOSITE_MCP_TOOL` | `analyze_investment_candidate` |
| **CAP-COMP-002** | COMPOSITE_TOOLS | Orchestrate portfolio-wide intelligence review across holdings (fundamentals, risks, valuations, strategy signals) | `fifoEngine.ts, ScripIntelligenceDossierService.ts :: buildPortfolioIntelligenceReview` | `COMPOSITE_MCP_TOOL` | `analyze_portfolio` |
| **CAP-REV-001** | REPOSITORY_REVIEW | Inspect repository git status, current branch, SHA, and diffs (read-only, secret-redacted) | `git CLI via safe adapter :: getRepoStatus, getDiff` | `DIRECT_MCP_TOOL` | `get_repository_status` |
| **CAP-REV-002** | REPOSITORY_REVIEW | Execute allowlisted test suites and report structured test outcomes | `Vitest / TestRunner :: runVitestSuite` | `DIRECT_MCP_TOOL` | `run_tests` |
| **CAP-VERIF-001** | INDEPENDENT_VERIFICATION | Independently recompute XIRR from raw cashflows using clean-room Newton-Raphson/Bisection oracle | `Independent XIRR Oracle (clean room) :: independentVerifyXirr` | `DIRECT_MCP_TOOL` | `verify_xirr` |
| **CAP-VERIF-002** | INDEPENDENT_VERIFICATION | Independently recompute financial ratios (Growth, CAGR, Margins, ROE, ROCE) from raw facts | `Independent Financial Oracle (clean room) :: independentVerifyMetric` | `DIRECT_MCP_TOOL` | `verify_financial_metric` |
| **CAP-VERIF-003** | INDEPENDENT_VERIFICATION | Independently recompute technical indicators (SMA, RSI, ATR) directly from raw OHLCV bars | `Independent Technical Oracle (clean room) :: independentVerifyIndicator` | `DIRECT_MCP_TOOL` | `verify_technical_indicator` |
| **CAP-DEV-001** | DEVELOPER_LOOP | Create and track developer sessions (DEV-*, before/during/after state, git commits, diffs) | `DevelopmentSessionService :: createSession, getSession, updateSession` | `DIRECT_MCP_TOOL` | `get_development_session` |
| **CAP-DEV-002** | DEVELOPER_LOOP | Issue targeted structured remediation request to developer bot (max 3 repair cycles) | `ReviewerRemediationOrchestrator :: dispatchRemediation` | `DIRECT_MCP_TOOL` | `submit_remediation_request` |

---

## Verification Sign-Off
- **Gate Condition:** Every capability marked IMPLEMENTED in `WEALTHOS_CAPABILITY_INVENTORY.md` has an explicit disposition in this matrix.
- **Sign-off:** PASSED — No unmapped capabilities.
