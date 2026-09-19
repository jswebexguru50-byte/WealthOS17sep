# WealthOS v6.6 - Repository & Data Dependency Forensics

**Generated At**: 2026-09-18T05:30:32.231Z  
**Governance Assertion**: `productionPromotionAuthorized = false`  
**Scope**: 134 Services + Live `portfolio.db` Schema & Population

---

## 1. Executive Summary
- **Audited Service Files**: 134
- **Audited Database Tables**: 165
- **Populated Tables**: 119
- **Empty / Zero-Row Tables**: 46
- **Services with Clock Usage (`new Date()`)**: 86 (Requires substitution with `ResearchClock` for replay integrity)
- **Services with Direct Engine Coupling**: 0 (Requires migration to `EvidenceBus` in Agent E/F)

---

## 2. Populated Tables & Row Counts (Live DB)

| Table Name | Row Count | Columns |
|---|---|---|
| `MasterTickers` | 3,654 | id, isin, symbol, exchange, segment... |
| `Transactions` | 15,211 | id, date, portfolio, type, isin... |
| `CorporateActions` | 7,757 | id, ex_date, record_date, isin, symbol... |
| `TaxSummary` | 82 | id, financial_year, portfolio, stcg_gains, stcg_tax... |
| `AppConfig` | 1,656 | key, value |
| `UserMappings` | 646 | id, raw_name, resolved_symbol, created_at, updated_at |
| `ActionHistory` | 112 | id, timestamp, action_type, description, batch_id... |
| `ZerodhaHoldings` | 31 | id, portfolio, isin, symbol, name... |
| `CorporateActionAudit` | 2,580 | id, portfolio, date, isin, symbol... |
| `DataChangeLog` | 362 | id, table_name, action, row_id, changed_at... |
| `PortfolioHistory` | 1,277 | date, portfolio, created_at, updated_at, cumulative_invested... |
| `RealizedGains` | 7,081 | id, match_id, created_at, updated_at, portfolio... |
| `CamsConfigurations` | 3 | pan, email, password, portfolio_name, status... |
| `CamsSummaryHoldings` | 13 | portfolio, isin, folio, symbol, quantity... |
| `Portfolios` | 16 | id, name, type, status, created_at... |
| `Holdings` | 115 | portfolio, isin, folio, symbol, quantity... |
| `BankAccountsAndFDs` | 16 | id, portfolio, name, country, account_type... |
| `CurrencyRates` | 5 | currency, rate_to_inr, source, updated_at |
| `HistoricalPrices` | 1,342,753 | symbol, date, close_price, data_source, created_at... |
| `BenchmarkCashFlowCache` | 4,927 | portfolio, benchmark_symbol, date, invested, market_value... |
| `AppChangeLogs` | 1 | id, timestamp, version_tag, summary, file_count... |
| `DashboardDiskCache` | 18 | cache_key, payload_json, updated_at |
| `FamilyGroups` | 2 | id, name, description, benchmark_symbol, created_at... |
| `AssetScripMappings` | 2 | id, source_broker, raw_scrip_name, raw_symbol, isin... |
| `PmsFeeConfigurations` | 2 | portfolio, annual_fee_rate, gst_rate, billing_frequency, calculation_basis... |
| `TargetAllocations` | 5 | id, model_name, asset_class, target_pct, rebalance_tolerance_pct... |
| `PredictionAuditLedger` | 100 | id, symbol, company_name, recommendation_date, recommended_action... |
| `ModelGenerations` | 108 | id, version_tag, created_at, trigger_reason, accuracy_before... |
| `ModelPostMortems` | 52 | id, symbol, recommendation_date, entry_price, target_price... |
| `MarketSnapshots` | 32,984 | id, symbol, snapshot_date, open, high... |
| `FnoDataCache` | 600 | id, symbol, data_date, is_fno_eligible, pcr... |
| `MacroRegimeLog` | 22 | id, regime_date, regime, confidence, nifty_5d_return... |
| `ModelRunLedger` | 127 | id, run_at, regime, stocks_scanned, high_conviction_alerts... |
| `PmsReconciliationBaseline` | 1 | portfolio, baseline_date, last_reconciled_txn_id, cash_in_hand, initial_cash_deposits... |
| `PmsReconciliationBaselineHoldings` | 48 | portfolio, symbol, isin, name, quantity... |
| `PmsBenchmarkMonthly` | 35 | portfolio, period_start, period_end, period_ror_pct, bm_period_ror_pct... |
| `ActiveOpportunitySignals` | 183 | id, symbol, universe, portfolio_name, first_detected_date... |
| `BrokerResearchReports` | 11 | id, symbol, company_name, broker_name, report_title... |
| `PmsSummaryHoldings` | 48 | portfolio, isin, symbol, name, quantity... |
| `ReconciliationAuditSnapshots` | 6 | id, created_at, statement_date, portfolio, statement_filename... |
| `ValuationSnapshots` | 21,660 | id, timestamp, portfolio, total_value_inr, equity_value... |
| `FamilyMembers` | 5 | id, uuid, name, email, role... |
| `MemberPortfolioPermissions` | 16 | id, member_id, portfolio_name, access_level, created_at |
| `DailyPortfolioSnapshot` | 168 | id, date, portfolio, market_value, total_cost... |
| `CarriedForwardLosses` | 32 | id, portfolio, financial_year, stcl_amount, ltcl_amount... |
| `ZerodhaSyncCheckpoints` | 3 | portfolio, client_id, last_synced_trade_date, last_synced_trade_id, last_sync_timestamp... |
| `SecurityKnowledgeBaseLedger` | 8 | id, symbol, as_of_date, verdict, calibrated_prob... |
| `AutoCalibrationProposals` | 1 | id, created_at, trigger_reason, attribution_summary, old_weights_json... |
| `AlertHistoryLedger` | 6 | id, timestamp, symbol, company_name, severity... |
| `SecurityDossierSnapshots` | 3,554 | symbol, company_name, sector, industry, cmp... |
| `trading_calendar` | 42 | date, market, is_trading_day, session_type, holiday_name... |
| `data_feed_status` | 1 | feed_id, source, last_heartbeat_utc, last_successful_fetch_utc, current_state... |
| `audit_ledger` | 7 | id, timestamp_utc, event_type, entity_type, entity_id... |
| `data_sources` | 8 | source_id, display_name, category, access_method, tos_status... |
| `source_adapter_runs` | 1 | run_id, source_id, started_at_utc, completed_at_utc, records_ingested... |
| `unified_conviction_scores` | 4 | symbol, as_of_date, conviction_score, is_recommendation, components_breakdown... |
| `harvest_tracking` | 1 | harvest_id, pan, portfolio, symbol, isin... |
| `position_size_recommendations` | 7 | id, symbol, portfolio_id, raw_probability, calibrated_probability... |
| `stop_loss_alerts` | 17 | id, holding_id, symbol, portfolio, stop_loss_price... |
| `portfolio_risk_snapshots` | 7 | id, portfolio_id, as_of_date, current_drawdown_pct, trailing_30d_volatility... |
| `model_generations` | 1 | id, weights_json, status, train_window, test_window... |
| `leading_indicator_series` | 5 | id, indicator_name, entity_key, as_of_date, value... |
| `indicator_validation_results` | 5 | id, indicator_name, category, best_lag_days, correlation_at_lag... |
| `fundamental_metric_conflicts` | 1 | id, symbol, metric, source_a, value_a... |
| `news_events` | 1 | event_id, published_at, source_id, headline, entity_keys... |
| `social_sentiment_daily` | 1 | symbol, date, mention_count, positive_pct, negative_pct... |
| `derived_options_metrics` | 1 | symbol, as_of_date, pcr_oi, pcr_volume, max_pain_strike... |
| `broker_research_reports` | 1 | id, symbol, broker_name, report_date, rating... |
| `AutonomousRecommendationsLedger` | 159 | id, symbol, company_name, sector, action... |
| `AutonomousPostMortems` | 35 | id, recommendation_id, symbol, company_name, timeframe... |
| `AutonomousSelfLearningRules` | 5 | id, rule_name, rule_category, baseline_threshold, current_threshold... |
| `SelfLearningMutationLog` | 8 | id, rule_id, rule_name, previous_value, new_value... |
| `PaperTradingPots` | 3 | id, pot_name, strategy_type, initial_capital, cash_balance... |
| `PaperTradingPositions` | 22 | id, pot_id, recommendation_id, symbol, company_name... |
| `PaperTradingNAVHistory` | 13,608 | id, pot_id, nav, cash, invested... |
| `Prices` | 1 | id, symbol, date, open, high... |
| `MomentumVpaOrders` | 125 | id, symbol, portfolio, status, totalCapital... |
| `OpportunityEngineReports` | 1 | id, generated_at, report_json, universe_count, opportunities_count... |
| `OpportunityScripEvaluations` | 702 | symbol, company_name, sector, market_cap_category, convergence_score... |
| `tier_calibration_ledger` | 9 | id, tier_or_preset_id, weight_blend, backtest_window_start, backtest_window_end... |
| `tier_membership_history` | 10,295 | id, tier, symbol, event_type, score... |
| `SmartMoneySectorCache` | 48 | sector, timeframe, net_flow_cr, average_smas, smas_delta... |
| `DataProvenanceLog` | 168 | metric_id, symbol, source_name, source_type, fetched_at... |
| `ScoringModelVersion` | 1 | version_id, weights_json, backtest_period_start, backtest_period_end, out_of_sample_hit_rate_pct... |
| `NseBhavcopy` | 18,523 | symbol, series, trade_date, prev_close, open... |
| `InstitutionalDeals` | 1,354 | id, deal_date, symbol, security_name, client_name... |
| `MfNavHistory` | 49,636 | scheme_code, isin, scheme_name, nav, nav_date... |
| `ForexRates` | 4 | currency_pair, rate, updated_at |
| `industrial_group_registry` | 14 | group_id, group_name, founding_year, vintage_years, promoter_family_origin... |
| `pli_sector_registry` | 11 | scheme_id, scheme_name, vertical_code, nodal_ministry, notified_outlay_cr... |
| `sunrise_industrial_universe` | 15 | symbol, company_name, isin, vertical_code, vertical_name... |
| `FundamentalSnapshots` | 268 | symbol, fetched_at, source, company_name, sector... |
| `BacktestResultsCache` | 382 | symbol, strategy_name, cached_at, total_trades, win_rate_pct... |
| `SignalBrierScoreLog` | 68 | id, signal_name, signal_fired, signal_value, outcome... |
| `yt_knowledge_sessions` | 19 | id, topic, category, matched_node_id, target_video_count... |
| `yt_knowledge_videos` | 60 | id, session_id, video_id, title, channel... |
| `regime_backtest_summaries` | 92 | regime, strategy_id, strategy_name, period_start, period_end... |
| `regime_backtest_trades` | 6,113 | id, symbol, company_name, tier, is_fno... |
| `DailyOHLCV` | 4,130,313 | symbol, trade_date, open, high, low... |
| `CustomStrategies` | 10 | id, name, base_template_id, description, parameters_json... |
| `db_migrations` | 11 | version, name, applied_at |
| `PipelineRunLog` | 1 | id, run_date, started_at, completed_at, status... |
| `strategy_scan_metadata` | 20 | id, scan_id, strategy_ids_json, universe_count, stocks_qualified_total... |
| `backtest_regime_ledger` | 2,968 | symbol, company_name, tier, regime_id, regime_type... |
| `IntradayOHLCV` | 10,138 | symbol, timeframe, timestamp, open, high... |
| `AlertLog` | 98 | id, alert_code, category, priority, symbol... |
| `DataQualityAuditLedger` | 3,659 | id, symbol, company_name, sector, industry... |
| `DataSyncDriftLedger` | 15,264 | id, symbol, as_of_period, statement_type, metric_name... |
| `HistoricalFinancialStatements` | 2,295 | id, symbol, statement_type, period_label, period_date... |
| `HistoricalShareholdingPattern` | 1,124 | id, symbol, quarter_label, as_of_date, promoter_pct... |
| `FullUniverseComprehensiveOpportunityScan` | 331 | id, scan_id, symbol, company_name, cmp... |
| `ForensicExtractionCache` | 1 | cache_key, symbol, period, source_url, data_json... |
| `StatutoryEvents` | 602 | id, scripCode, eventDate, eventType, payloadJson... |
| `SnapshotProvenance` | 625 | id, scripCode, fieldName, sourceTierUsed, confidenceScore... |
| `QuarantinedRecords` | 22 | id, scripCode, listingPlatform, fieldName, extractedValue... |
| `EvidenceInventory` | 15 | scripId, sourceType, result, checkedAt, documentId... |
| `ForensicAssertions` | 3 | assertionId, scripId, field, value, unit... |
| `FEREEnrichedLedger` | 3,559 | symbol, company_name, category, market_cap_cr, cmp... |
| `strategy_scan_cache` | 4,104 | id, scan_id, strategy_id, symbol, qualified... |

---

## 3. Empty Tables (Potential Data Gaps)

| Table Name | Status | Impacted Domain |
|---|---|---|
| `SystemLogs` | **0 rows** | Data Acquisition Required (Agent C) |
| `PriceHistoryCache` | **0 rows** | Data Acquisition Required (Agent C) |
| `BackupManualTransactions` | **0 rows** | Data Acquisition Required (Agent C) |
| `AccountProfiles` | **0 rows** | Data Acquisition Required (Agent C) |
| `NriTdsTransactions` | **0 rows** | Data Acquisition Required (Agent C) |
| `FemaRepatriationLedger` | **0 rows** | Data Acquisition Required (Agent C) |
| `ReconciledHoldings` | **0 rows** | Data Acquisition Required (Agent C) |
| `SoldStockRegistry` | **0 rows** | Data Acquisition Required (Agent C) |
| `FifoRunLog` | **0 rows** | Data Acquisition Required (Agent C) |
| `ReconciliationExceptions` | **0 rows** | Data Acquisition Required (Agent C) |
| `InvestmentThesisLedger` | **0 rows** | Data Acquisition Required (Agent C) |
| `QuarterlyEarningsIntelligence` | **0 rows** | Data Acquisition Required (Agent C) |
| `SecuritySignalDriftLedger` | **0 rows** | Data Acquisition Required (Agent C) |
| `mutation_dedup_keys` | **0 rows** | Data Acquisition Required (Agent C) |
| `signal_outcomes` | **0 rows** | Data Acquisition Required (Agent C) |
| `calibration_stats` | **0 rows** | Data Acquisition Required (Agent C) |
| `rights_subscriptions` | **0 rows** | Data Acquisition Required (Agent C) |
| `feature_audit_log` | **0 rows** | Data Acquisition Required (Agent C) |
| `options_chain_snapshot` | **0 rows** | Data Acquisition Required (Agent C) |
| `PaperTradingPotConfig` | **0 rows** | Data Acquisition Required (Agent C) |
| `MomentumVpaAlerts` | **0 rows** | Data Acquisition Required (Agent C) |
| `FundamentalsSnapshot` | **0 rows** | Data Acquisition Required (Agent C) |
| `EventIntelligenceLog` | **0 rows** | Data Acquisition Required (Agent C) |
| `TopNCurationLog` | **0 rows** | Data Acquisition Required (Agent C) |
| `fill_registry` | **0 rows** | Data Acquisition Required (Agent C) |
| `StrippingDisallowances` | **0 rows** | Data Acquisition Required (Agent C) |
| `yt_knowledge_segments` | **0 rows** | Data Acquisition Required (Agent C) |
| `yt_knowledge_claims` | **0 rows** | Data Acquisition Required (Agent C) |
| `yt_knowledge_debates` | **0 rows** | Data Acquisition Required (Agent C) |
| `yt_knowledge_feature_proposals` | **0 rows** | Data Acquisition Required (Agent C) |
| `IndexOHLCV` | **0 rows** | Data Acquisition Required (Agent C) |
| `IndexConstituents` | **0 rows** | Data Acquisition Required (Agent C) |
| `FundamentalData` | **0 rows** | Data Acquisition Required (Agent C) |
| `IntradayCandles` | **0 rows** | Data Acquisition Required (Agent C) |
| `CustomStrategyBacktests` | **0 rows** | Data Acquisition Required (Agent C) |
| `StrategyComparisonSets` | **0 rows** | Data Acquisition Required (Agent C) |
| `DataQualityIssues` | **0 rows** | Data Acquisition Required (Agent C) |
| `strategy_run_results` | **0 rows** | Data Acquisition Required (Agent C) |
| `strategy_comparison_sessions` | **0 rows** | Data Acquisition Required (Agent C) |
| `paper_trades` | **0 rows** | Data Acquisition Required (Agent C) |
| `funnel_presets` | **0 rows** | Data Acquisition Required (Agent C) |
| `ScripSchedule` | **0 rows** | Data Acquisition Required (Agent C) |
| `ManagementClaims` | **0 rows** | Data Acquisition Required (Agent C) |
| `IntelligenceEvents` | **0 rows** | Data Acquisition Required (Agent C) |
| `Contradictions` | **0 rows** | Data Acquisition Required (Agent C) |
| `CompanyTheses` | **0 rows** | Data Acquisition Required (Agent C) |

---

## 4. Services Requiring Composable Engine Isolation

Services that currently import other engines directly or use non-PIT clock references:


---

*End of Agent A Forensics Report*
