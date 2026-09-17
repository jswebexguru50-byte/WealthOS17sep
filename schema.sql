-- ================================================================
-- WEALTHOS / ITAS v6.3 - PRODUCTION EMPTY DATABASE SCHEMA
-- Generated: 2026-09-17T11:47:17.271Z
-- Source: portfolio.db (DDL Only - 0 Data Rows)
-- Total Schema Objects: 324
-- ================================================================

-- [TABLE] AccountProfiles
CREATE TABLE AccountProfiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_name TEXT NOT NULL UNIQUE,
            account_type TEXT CHECK(account_type IN ('NRE', 'NRO', 'RESIDENT', 'FOREIGN_US', 'FOREIGN_UAE')) DEFAULT 'NRE',
            demat_scheme TEXT CHECK(demat_scheme IN ('PIS', 'NON_PIS', 'DIRECT_MUTUAL_FUND', 'OFFSHORE_BROKER')) DEFAULT 'NON_PIS',
            designated_bank TEXT,
            bank_account_number TEXT,
            pis_permission_ref TEXT,
            resident_country TEXT DEFAULT 'UAE',
            tax_residency_status TEXT DEFAULT 'NRI',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] ActionHistory
CREATE TABLE ActionHistory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action_type TEXT NOT NULL,
        description TEXT NOT NULL,
        batch_id TEXT UNIQUE NOT NULL
    , created_at TEXT, updated_at TEXT);

-- [TABLE] ActiveOpportunitySignals
CREATE TABLE ActiveOpportunitySignals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        universe TEXT NOT NULL,
        portfolio_name TEXT,
        first_detected_date TEXT NOT NULL,
        last_scanned_date TEXT NOT NULL,
        entry_price REAL NOT NULL,
        target_price REAL NOT NULL,
        stop_loss_price REAL NOT NULL,
        strategy_category TEXT NOT NULL,
        action_directive TEXT NOT NULL,
        bullish_probability_pct REAL NOT NULL,
        confidence_level TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        peak_price REAL NOT NULL,
        trough_price REAL NOT NULL,
        days_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, universe) ON CONFLICT REPLACE
      );

-- [TABLE] AlertHistoryLedger
CREATE TABLE AlertHistoryLedger (
          id TEXT PRIMARY KEY,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          symbol TEXT NOT NULL,
          company_name TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          catalyst_source TEXT NOT NULL,
          price_at_alert REAL NOT NULL,
          target_price REAL,
          stop_loss REAL,
          calibrated_prob REAL,
          dismissed INTEGER DEFAULT 0
        , category TEXT DEFAULT 'BREAKOUT', action_required INTEGER DEFAULT 0);

-- [TABLE] AlertLog
CREATE TABLE AlertLog (
          id TEXT PRIMARY KEY,
          alert_code TEXT NOT NULL,
          category TEXT NOT NULL,
          priority TEXT NOT NULL,
          symbol TEXT,
          portfolio TEXT,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          payload_json TEXT,
          state TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          cooldown_until TEXT,
          acknowledged INTEGER DEFAULT 0,
          recommendation TEXT
        );

-- [TABLE] AppChangeLogs
CREATE TABLE AppChangeLogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            version_tag TEXT DEFAULT 'v1.0.0',
            summary TEXT NOT NULL,
            file_count INTEGER DEFAULT 0,
            applied_files TEXT,
            source TEXT DEFAULT 'SYSTEM'
          );

-- [TABLE] AppConfig
CREATE TABLE AppConfig (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- [TABLE] AssetScripMappings
CREATE TABLE AssetScripMappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_broker TEXT NOT NULL,
          raw_scrip_name TEXT NOT NULL,
          raw_symbol TEXT,
          isin TEXT,
          symbol TEXT,
          asset_class TEXT DEFAULT 'Equity',
          sector TEXT,
          market_cap_tier TEXT,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_broker, raw_scrip_name)
        );

-- [TABLE] AutoCalibrationProposals
CREATE TABLE AutoCalibrationProposals (
          id TEXT PRIMARY KEY,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          trigger_reason TEXT NOT NULL,
          attribution_summary TEXT NOT NULL,
          old_weights_json TEXT NOT NULL,
          proposed_weights_json TEXT NOT NULL,
          simulated_winrate_delta_pct REAL NOT NULL,
          brier_score_improvement REAL NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          approved_at TEXT
        );

-- [TABLE] AutonomousPostMortems
CREATE TABLE AutonomousPostMortems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recommendation_id INTEGER,
            symbol TEXT NOT NULL,
            company_name TEXT,
            timeframe TEXT,
            entry_price REAL NOT NULL,
            exit_price REAL NOT NULL,
            target_price REAL NOT NULL,
            stop_loss_price REAL NOT NULL,
            pnl_pct REAL NOT NULL,
            failure_category TEXT NOT NULL,
            primary_failure_category TEXT,
            compound_causes_json TEXT,
            causal_confidence_pct REAL DEFAULT 85.0,
            temporal_context_json TEXT,
            counterfactual_action TEXT,
            root_cause_analysis TEXT NOT NULL,
            corrective_action TEXT NOT NULL,
            applied_parameter_mutation TEXT,
            learned_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] AutonomousRecommendationsLedger
CREATE TABLE AutonomousRecommendationsLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        company_name TEXT,
        sector TEXT,
        action TEXT NOT NULL,
        entry_price REAL NOT NULL,
        current_price REAL NOT NULL,
        stop_loss REAL NOT NULL,
        target_1 REAL NOT NULL,
        target_2 REAL NOT NULL,
        risk_reward_ratio REAL NOT NULL,
        timeframe TEXT NOT NULL,
        probability_pct REAL NOT NULL,
        confidence_score REAL NOT NULL,
        promoter_pct REAL,
        fii_pct REAL,
        dii_pct REAL,
        retail_float_pct REAL,
        float_squeeze_ratio REAL,
        float_regime TEXT,
        fno_buildup TEXT,
        put_call_ratio REAL,
        rsi_value REAL,
        bollinger_status TEXT,
        volume_surge_ratio REAL,
        reasoning_summary TEXT,
        reasoning_trace_json TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      , catalyst TEXT, smc_structure TEXT, smc_liquidity_sweep TEXT, smc_order_block TEXT, smc_fvg_present INTEGER DEFAULT 0, smc_premium_discount TEXT, smc_checklist_score INTEGER DEFAULT 0, smc_trade_setup_json TEXT);

-- [TABLE] AutonomousSelfLearningRules
CREATE TABLE AutonomousSelfLearningRules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT UNIQUE NOT NULL,
            rule_category TEXT NOT NULL,
            baseline_threshold REAL NOT NULL DEFAULT 1.0,
            current_threshold REAL NOT NULL DEFAULT 1.0,
            condition_expression TEXT NOT NULL,
            action_penalty REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            canary_signals_evaluated INTEGER DEFAULT 0,
            canary_win_rate_pct REAL DEFAULT 0.0,
            is_active INTEGER DEFAULT 1,
            evolution_generation INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] BacktestResultsCache
CREATE TABLE BacktestResultsCache (
            symbol TEXT NOT NULL,
            strategy_name TEXT NOT NULL,
            cached_at TEXT NOT NULL,
            total_trades INTEGER,
            win_rate_pct REAL,
            profit_factor REAL,
            total_return_pct REAL,
            buy_and_hold_return_pct REAL,
            alpha_pct REAL,
            max_drawdown_pct REAL,
            sharpe_ratio REAL,
            avg_win_pct REAL,
            avg_loss_pct REAL,
            trades_json TEXT,
            PRIMARY KEY (symbol, strategy_name)
          );

-- [TABLE] BackupManualTransactions
CREATE TABLE BackupManualTransactions (
          id INTEGER PRIMARY KEY,
          original_id INTEGER,
          date TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          type TEXT NOT NULL,
          isin TEXT,
          symbol TEXT,
          quantity REAL,
          price REAL,
          gross_amount REAL,
          brokerage REAL,
          net_amount REAL,
          source TEXT,
          notes TEXT,
          backed_up_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] BankAccountsAndFDs
CREATE TABLE BankAccountsAndFDs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio TEXT NOT NULL,
          name TEXT NOT NULL,
          country TEXT DEFAULT 'INDIA',
          account_type TEXT DEFAULT 'SAVINGS',
          currency TEXT DEFAULT 'INR',
          balance_amount REAL DEFAULT 0,
          interest_rate_pct REAL DEFAULT 0,
          maturity_date TEXT,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        , bank_name TEXT, account_number TEXT, ifsc_swift TEXT, folio TEXT, start_date TEXT, principal_amount REAL DEFAULT 0, member_id INTEGER);

-- [TABLE] BenchmarkCashFlowCache
CREATE TABLE BenchmarkCashFlowCache (
          portfolio TEXT NOT NULL,
          benchmark_symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          invested REAL NOT NULL,
          market_value REAL NOT NULL,
          benchmark_value REAL NOT NULL,
          portfolio_return REAL NOT NULL,
          benchmark_return REAL NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (portfolio, benchmark_symbol, date)
        );

-- [TABLE] BrokerResearchReports
CREATE TABLE BrokerResearchReports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        company_name TEXT,
        broker_name TEXT NOT NULL,
        report_title TEXT NOT NULL,
        report_date TEXT NOT NULL,
        recommendation_type TEXT NOT NULL,
        entry_price REAL NOT NULL,
        target_price REAL NOT NULL,
        stop_loss_price REAL,
        upside_pct REAL NOT NULL,
        horizon TEXT,
        report_url TEXT,
        thesis_summary TEXT,
        key_catalysts_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, broker_name, report_date) ON CONFLICT REPLACE
      );

-- [TABLE] CamsConfigurations
CREATE TABLE CamsConfigurations (
          pan TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          password TEXT,
          portfolio_name TEXT NOT NULL,
          status TEXT DEFAULT 'ACTIVE',
          last_sync TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] CamsSummaryHoldings
CREATE TABLE CamsSummaryHoldings (
          portfolio TEXT NOT NULL,
          isin TEXT NOT NULL,
          folio TEXT DEFAULT 'NA',
          symbol TEXT NOT NULL,
          quantity REAL NOT NULL,
          nav REAL NOT NULL,
          value REAL NOT NULL,
          cost REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP, member_id INTEGER,
          PRIMARY KEY (portfolio, isin, folio)
        );

-- [TABLE] CarriedForwardLosses
CREATE TABLE CarriedForwardLosses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            financial_year TEXT NOT NULL DEFAULT '2024-25',
            stcl_amount REAL DEFAULT 0,
            ltcl_amount REAL DEFAULT 0,
            assessment_year TEXT DEFAULT 'AY 2025-26',
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP, pan TEXT,
            UNIQUE(portfolio, financial_year)
          );

-- [TABLE] CompanyTheses
CREATE TABLE CompanyTheses (
      thesis_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      thesis_statement TEXT NOT NULL,
      core_pillars_json TEXT NOT NULL,
      thesis_breakers_json TEXT NOT NULL,
      active_status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

-- [TABLE] Contradictions
CREATE TABLE Contradictions (
      contradiction_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      issuer_bse_code TEXT,
      severity TEXT NOT NULL,
      contradiction_type TEXT NOT NULL,
      claim_id TEXT,
      event_id TEXT,
      description TEXT NOT NULL,
      divergence_json TEXT,
      supporting_evidence_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      materiality TEXT NOT NULL DEFAULT 'THESIS_RELEVANT',
      resolved_at TEXT,
      resolution_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    , left_evidence_id TEXT, right_evidence_id TEXT, detected_at TEXT);

-- [TABLE] CorporateActionAudit
CREATE TABLE CorporateActionAudit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio TEXT NOT NULL,
    date TEXT NOT NULL,
    isin TEXT NOT NULL,
    symbol TEXT NOT NULL,
    action_type TEXT NOT NULL,
    original_qty REAL,
    new_qty REAL,
    original_cost REAL,
    new_cost REAL,
    message TEXT
, created_at TEXT, updated_at TEXT);

-- [TABLE] CorporateActions
CREATE TABLE CorporateActions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ex_date TEXT,
    record_date TEXT NOT NULL,
    isin TEXT NOT NULL,
    symbol TEXT,
    action_type TEXT NOT NULL,
    details TEXT,
    numerator REAL DEFAULT 0,
    denominator REAL DEFAULT 0,
    dividend_per_share REAL DEFAULT 0,
    old_face_value REAL,
    new_face_value REAL,
    source TEXT,
    applied BOOLEAN DEFAULT 0,
    applied_date TEXT,
    notes TEXT, created_at TEXT, batch_id TEXT, applied_batch_id TEXT, updated_at TEXT, conflict_flag INTEGER DEFAULT 0, conflicting_sources TEXT, rights_ratio REAL, rights_price REAL, subscription_deadline TEXT,
    FOREIGN KEY(isin) REFERENCES MasterTickers(isin)
);

-- [TABLE] CurrencyRates
CREATE TABLE CurrencyRates (
          currency TEXT PRIMARY KEY,
          rate_to_inr REAL NOT NULL,
          source TEXT DEFAULT 'XE.com Live Spot Rate',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] CustomStrategies
CREATE TABLE CustomStrategies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        base_template_id TEXT NOT NULL,
        description TEXT,
        parameters_json TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_backtest_at DATETIME,
        backtest_win_rate REAL,
        backtest_sharpe REAL,
        backtest_total_signals INTEGER
      , is_preset INTEGER DEFAULT 0, preset_order INTEGER, category TEXT, short_name TEXT, color_accent TEXT);

-- [TABLE] CustomStrategyBacktests
CREATE TABLE CustomStrategyBacktests (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        total_signals INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        avg_risk_reward REAL,
        sharpe_ratio REAL,
        max_drawdown_pct REAL,
        profit_factor REAL,
        avg_holding_days REAL,
        results_json TEXT,
        FOREIGN KEY (strategy_id) REFERENCES CustomStrategies(id)
      );

-- [TABLE] DailyOHLCV
CREATE TABLE DailyOHLCV (
            symbol TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume INTEGER,
            turnover REAL,
            delivery_qty INTEGER,
            delivery_pct REAL,
            no_of_trades INTEGER,
            prev_close REAL,
            data_source TEXT DEFAULT 'NSE_BHAVCOPY',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, trade_date)
          );

-- [TABLE] DailyPortfolioSnapshot
CREATE TABLE DailyPortfolioSnapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            portfolio TEXT NOT NULL,
            market_value REAL NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0,
            unrealized_pnl REAL NOT NULL DEFAULT 0,
            equity_value REAL DEFAULT 0,
            cash_value REAL DEFAULT 0,
            mf_value REAL DEFAULT 0,
            aif_value REAL DEFAULT 0,
            unlisted_value REAL DEFAULT 0,
            fx_rate_usd REAL DEFAULT 0,
            source TEXT DEFAULT 'EOD_CLOSE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(date, portfolio)
          );

-- [TABLE] DashboardDiskCache
CREATE TABLE DashboardDiskCache (
      cache_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

-- [TABLE] DataChangeLog
CREATE TABLE DataChangeLog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL,
    row_id INTEGER,
    changed_at TEXT NOT NULL,
    details TEXT
);

-- [TABLE] DataProvenanceLog
CREATE TABLE DataProvenanceLog (
            metric_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            source_name TEXT NOT NULL,
            source_type TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            confidence_pct REAL NOT NULL,
            reconciled_against TEXT,
            discrepancy_pct REAL DEFAULT 0,
            PRIMARY KEY (metric_id, symbol, as_of_date)
          );

-- [TABLE] DataQualityAuditLedger
CREATE TABLE DataQualityAuditLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        company_name TEXT,
        sector TEXT,
        industry TEXT,
        as_of_quarter TEXT,
        as_of_year TEXT,
        promoter_pct REAL,
        fii_pct REAL,
        dii_pct REAL,
        govt_pct REAL,
        others_pct REAL,
        public_pct REAL,
        sum_total_pct REAL,
        free_float_pct REAL,
        no_of_shareholders TEXT,
        market_cap_cr REAL,
        current_price REAL,
        pe_ratio REAL,
        book_value REAL,
        dividend_yield_pct REAL,
        roce_pct REAL,
        roe_pct REAL,
        debt_to_equity REAL,
        latest_sales_cr REAL,
        latest_expenses_cr REAL,
        latest_op_profit_cr REAL,
        latest_opm_pct REAL,
        latest_pbt_cr REAL,
        latest_tax_pct REAL,
        latest_pat_cr REAL,
        latest_eps REAL,
        sales_yoy_growth_pct REAL,
        pat_yoy_growth_pct REAL,
        sales_qoq_growth_pct REAL,
        pat_qoq_growth_pct REAL,
        sales_growth_5y_pct REAL,
        profit_growth_5y_pct REAL,
        cfo_cr REAL,
        cfi_cr REAL,
        cff_cr REAL,
        net_cash_flow_cr REAL,
        total_assets_cr REAL,
        total_borrowings_cr REAL,
        integrity_status TEXT NOT NULL,
        violation_reasons TEXT,
        field_accuracy_score REAL,
        audited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol)
      );

-- [TABLE] DataQualityIssues
CREATE TABLE DataQualityIssues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        detail TEXT,
        detected_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved INTEGER DEFAULT 0
      );

-- [TABLE] DataSyncDriftLedger
CREATE TABLE DataSyncDriftLedger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          as_of_period TEXT,
          statement_type TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          primary_source TEXT NOT NULL,
          primary_value REAL,
          secondary_source TEXT NOT NULL,
          secondary_value REAL,
          delta_absolute REAL,
          delta_percentage REAL,
          sync_status TEXT NOT NULL,
          resolution_note TEXT,
          reconciled_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] EventIntelligenceLog
CREATE TABLE EventIntelligenceLog (
            event_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            event_type TEXT NOT NULL,
            headline TEXT NOT NULL,
            sentiment_score REAL NOT NULL,
            materiality_score REAL NOT NULL,
            is_adverse INTEGER DEFAULT 0,
            source_url TEXT,
            published_at TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          , source_id TEXT, dedup_cluster_id TEXT, data_source TEXT DEFAULT 'RSS');

-- [TABLE] EvidenceInventory
CREATE TABLE EvidenceInventory (
      scripId TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      result TEXT NOT NULL,
      checkedAt TEXT,
      documentId TEXT,
      discoveryMethod TEXT NOT NULL,
      details TEXT, evidence_id TEXT, issuer_nse_symbol TEXT, issuer_bse_code TEXT, document_hash TEXT, document_type TEXT, page_physical INTEGER, page_printed INTEGER, quoted_text TEXT, verification_status TEXT, discovered_at DATETIME,
      PRIMARY KEY (scripId, sourceType)
    );

-- [TABLE] FEREEnrichedLedger
CREATE TABLE FEREEnrichedLedger (
          symbol TEXT PRIMARY KEY,
          company_name TEXT,
          category TEXT,
          market_cap_cr REAL,
          cmp REAL,
          pe_ratio REAL,
          roce_pct REAL,
          debt_to_equity REAL,
          promoter_pledge_pct REAL,
          beneish_m_score REAL,
          beneish_flag TEXT,
          altman_z_score REAL,
          altman_zone TEXT,
          piotroski_f_score INTEGER,
          sloan_accrual_ratio REAL,
          cash_conversion_cycle INTEGER,
          dso INTEGER,
          dio INTEGER,
          dpo INTEGER,
          cfo_to_ebitda_pct REAL,
          composite_health_score REAL,
          fere_verdict TEXT,
          enriched_tier TEXT,
          batch_number INTEGER,
          enriched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] FamilyGroups
CREATE TABLE FamilyGroups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          benchmark_symbol TEXT DEFAULT '^NSEI',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] FamilyMembers
CREATE TABLE FamilyMembers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      pan_number TEXT,
      tax_residency TEXT DEFAULT 'RESIDENT',
      avatar_color TEXT DEFAULT '#06b6d4',
      is_active INTEGER DEFAULT 1,
      pin_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    , is_senior_citizen INTEGER DEFAULT 0);

-- [TABLE] FemaRepatriationLedger
CREATE TABLE FemaRepatriationLedger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          financial_year TEXT NOT NULL,
          remittance_date TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          source_account_nro TEXT NOT NULL,
          destination_country TEXT NOT NULL,
          remitted_amount_inr REAL NOT NULL,
          fx_rate_usd_inr REAL NOT NULL,
          remitted_amount_usd REAL NOT NULL,
          form_15ca_ack_no TEXT,
          form_15cb_cert_no TEXT,
          ca_membership_no TEXT,
          purpose_code TEXT DEFAULT 'S1301',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        , member_id INTEGER);

-- [TABLE] FifoRunLog
CREATE TABLE FifoRunLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            triggered_by TEXT NOT NULL,
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            holdings_rebuilt INTEGER DEFAULT 0,
            notes TEXT
          );

-- [TABLE] FnoDataCache
CREATE TABLE FnoDataCache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        data_date TEXT NOT NULL,
        is_fno_eligible INTEGER DEFAULT 0,
        pcr REAL,
        pcr_by_volume REAL,
        max_pain REAL,
        atm_iv REAL,
        iv_percentile REAL,
        iv_rank_score REAL,
        oi_buildup TEXT,
        call_oi_total INTEGER,
        put_oi_total INTEGER,
        highest_call_oi_strike REAL,
        highest_put_oi_strike REAL,
        rollover_pct REAL,
        delivery_pct REAL,
        layman_meaning TEXT,
        portfolio_verdict TEXT,
        market_regime_signal TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, data_date)
      );

-- [TABLE] ForensicAssertions
CREATE TABLE ForensicAssertions (
          assertionId TEXT PRIMARY KEY,
          scripId TEXT NOT NULL,
          field TEXT NOT NULL,
          value TEXT,
          unit TEXT,
          period TEXT,
          status TEXT NOT NULL,
          evidenceIds TEXT NOT NULL,
          confidence REAL,
          sourceCount INTEGER DEFAULT 1,
          extractionMethod TEXT NOT NULL,
          methodologyVersion TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );

-- [TABLE] ForensicExtractionCache
CREATE TABLE ForensicExtractionCache (
        cache_key   TEXT PRIMARY KEY,
        symbol      TEXT NOT NULL,
        period      TEXT NOT NULL,
        source_url  TEXT NOT NULL,
        data_json   TEXT NOT NULL,
        created_at  TEXT DEFAULT CURRENT_TIMESTAMP
      );

-- [TABLE] ForexRates
CREATE TABLE ForexRates (
      currency_pair TEXT PRIMARY KEY,
      rate REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

-- [TABLE] FullUniverseComprehensiveOpportunityScan
CREATE TABLE FullUniverseComprehensiveOpportunityScan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT,
      cmp REAL,
      market_cap_cr REAL,
      sector TEXT,
      matched_strategies TEXT,
      technical_convergence_count INTEGER,
      bullish_probability_pct REAL,
      confidence_score REAL,
      risk_reward_ratio REAL,
      entry_price REAL,
      stop_loss_price REAL,
      target_price_1 REAL,
      target_price_2 REAL,
      upside_potential_pct REAL,
      downside_risk_pct REAL,
      is_multibagger_qualified INTEGER,
      multibagger_score REAL,
      multibagger_tier TEXT,
      sales_cagr_3yr_pct REAL,
      pat_cagr_3yr_pct REAL,
      roce_pct REAL,
      roe_pct REAL,
      debt_to_equity REAL,
      cfo_to_pat_ratio REAL,
      promoter_holding_pct REAL,
      is_sunrise_industrial INTEGER,
      sunrise_vertical TEXT,
      industrial_group TEXT,
      qglp_score REAL,
      quant_ai_score REAL,
      recommendation_category TEXT,
      key_catalysts TEXT,
      scanned_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

-- [TABLE] FundamentalData
CREATE TABLE FundamentalData (
            symbol TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            promoter_holding_pct REAL,
            public_holding_pct REAL,
            fii_holding_pct REAL,
            dii_holding_pct REAL,
            free_float_shares INTEGER,
            total_shares INTEGER,
            free_float_pct REAL,
            market_cap_cr REAL,
            face_value REAL,
            circuit_limit_pct REAL,
            data_source TEXT DEFAULT 'NSE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, as_of_date)
          );

-- [TABLE] FundamentalSnapshots
CREATE TABLE FundamentalSnapshots (
        symbol                TEXT NOT NULL,
        fetched_at            TEXT NOT NULL,
        source                TEXT NOT NULL DEFAULT 'SCREENER_IN',
        company_name          TEXT,
        sector                TEXT,
        industry              TEXT,
        pe_ratio              REAL,
        book_value            REAL,
        dividend_yield_pct    REAL,
        roce_pct              REAL,
        roe_pct               REAL,
        operating_margin_pct  REAL,
        debt_to_equity        REAL,
        interest_coverage     REAL,
        sales_growth_5y_pct   REAL,
        pat_growth_5y_pct     REAL,
        roe_3y_pct            REAL,
        promoter_holding_pct  REAL,
        fii_holding_pct       REAL,
        dii_holding_pct       REAL,
        pledged_pct           REAL,
        PRIMARY KEY (symbol, fetched_at)
      );

-- [TABLE] FundamentalsSnapshot
CREATE TABLE FundamentalsSnapshot (
            symbol TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            sector_class TEXT NOT NULL,
            roce REAL,
            sales_cagr_3y REAL,
            debt_equity REAL,
            ocf_ebitda REAL,
            pe_ratio REAL,
            promoter_pledge_pct REAL NOT NULL,
            nim_pct REAL,
            gnpa_pct REAL,
            nnpa_pct REAL,
            car_pct REAL,
            roa_pct REAL,
            source_filing_ref TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, as_of_date)
          );

-- [TABLE] HistoricalFinancialStatements
CREATE TABLE HistoricalFinancialStatements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        statement_type TEXT NOT NULL,
        period_label TEXT NOT NULL,
        period_date TEXT,
        sales_cr REAL,
        expenses_cr REAL,
        operating_profit_cr REAL,
        opm_pct REAL,
        other_income_cr REAL,
        interest_cr REAL,
        depreciation_cr REAL,
        pbt_cr REAL,
        tax_pct REAL,
        net_profit_pat_cr REAL,
        eps REAL,
        equity_capital_cr REAL,
        reserves_cr REAL,
        borrowings_cr REAL,
        other_liabilities_cr REAL,
        total_liabilities_cr REAL,
        fixed_assets_cr REAL,
        cwip_cr REAL,
        investments_cr REAL,
        other_assets_cr REAL,
        total_assets_cr REAL,
        cfo_cr REAL,
        cfi_cr REAL,
        cff_cr REAL,
        net_cash_flow_cr REAL,
        primary_source TEXT NOT NULL,
        secondary_source TEXT,
        is_reconciled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, statement_type, period_label)
      );

-- [TABLE] HistoricalPrices
CREATE TABLE HistoricalPrices (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      close_price REAL NOT NULL,
      data_source TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (symbol, date)
    );

-- [TABLE] HistoricalShareholdingPattern
CREATE TABLE HistoricalShareholdingPattern (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        quarter_label TEXT NOT NULL,
        as_of_date TEXT,
        promoter_pct REAL NOT NULL,
        fii_pct REAL NOT NULL,
        dii_pct REAL NOT NULL,
        govt_pct REAL DEFAULT 0,
        others_pct REAL DEFAULT 0,
        public_pct REAL NOT NULL,
        employee_trusts_pct REAL DEFAULT 0,
        sum_total_pct REAL NOT NULL,
        free_float_pct REAL NOT NULL,
        primary_source TEXT NOT NULL,
        secondary_source TEXT,
        is_reconciled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, quarter_label)
      );

-- [TABLE] Holdings
CREATE TABLE Holdings (
      portfolio TEXT NOT NULL,
      isin TEXT NOT NULL,
      folio TEXT DEFAULT 'NA',
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL,
      avg_buy_price REAL NOT NULL,
      total_cost REAL NOT NULL,
      ltp REAL DEFAULT 0,
      prev_close REAL DEFAULT 0,
      current_value REAL DEFAULT 0,
      unrealized_pnl REAL DEFAULT 0,
      unrealized_pct REAL DEFAULT 0,
      day_change REAL DEFAULT 0,
      day_change_pct REAL DEFAULT 0,
      data_source TEXT,
      last_update TEXT,
      data_status TEXT DEFAULT 'LIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP, currency TEXT DEFAULT 'INR', native_ltp REAL DEFAULT 0, native_current_value REAL DEFAULT 0, native_total_cost REAL DEFAULT 0, native_avg_buy_price REAL DEFAULT 0, native_unrealized_pnl REAL DEFAULT 0, native_prev_close REAL, tax_cost_basis REAL DEFAULT NULL, tax_avg_price REAL DEFAULT NULL, holding_type TEXT DEFAULT 'EQUITY', member_id INTEGER, price_authority TEXT, acquisition_fx_rate REAL DEFAULT 1.0,
      PRIMARY KEY (portfolio, isin, symbol, folio)
    );

-- [TABLE] IndexConstituents
CREATE TABLE IndexConstituents (
      index_symbol TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT,
      isin TEXT,
      weight REAL,
      sector TEXT,
      effective_from TEXT,
      effective_to TEXT,
      data_source TEXT DEFAULT 'NSE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (index_symbol, symbol)
    );

-- [TABLE] IndexOHLCV
CREATE TABLE IndexOHLCV (
            index_symbol TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume INTEGER,
            turnover REAL,
            data_source TEXT DEFAULT 'NSE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (index_symbol, trade_date)
          );

-- [TABLE] InstitutionalDeals
CREATE TABLE InstitutionalDeals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      security_name TEXT,
      client_name TEXT NOT NULL,
      deal_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      trade_price REAL NOT NULL,
      deal_category TEXT DEFAULT 'BULK_DEAL',
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(deal_date, symbol, client_name, deal_type, quantity, trade_price)
    );

-- [TABLE] IntelligenceEvents
CREATE TABLE IntelligenceEvents (
      event_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      issuer_bse_code TEXT,
      event_date TEXT NOT NULL,
      category TEXT NOT NULL,
      headline TEXT NOT NULL,
      description TEXT,
      source_type TEXT NOT NULL,
      evidence_id TEXT,
      materiality TEXT NOT NULL DEFAULT 'MATERIAL',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    , source_tier TEXT DEFAULT "TIER_2_PRIMARY_CORPORATE");

-- [TABLE] IntradayCandles
CREATE TABLE IntradayCandles (
            symbol TEXT NOT NULL,
            candle_time TEXT NOT NULL,
            interval TEXT NOT NULL DEFAULT '15m',
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume INTEGER,
            data_source TEXT DEFAULT 'UPSTOX',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, candle_time, interval)
          );

-- [TABLE] IntradayOHLCV
CREATE TABLE IntradayOHLCV (
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume INTEGER NOT NULL,
        open_interest INTEGER DEFAULT 0,
        PRIMARY KEY (symbol, timeframe, timestamp)
      );

-- [TABLE] InvestmentThesisLedger
CREATE TABLE InvestmentThesisLedger (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          entry_date TEXT NOT NULL,
          entry_price REAL NOT NULL,
          initial_verdict TEXT NOT NULL,
          initial_target REAL NOT NULL,
          initial_stop_loss REAL NOT NULL,
          core_thesis_pillars_json TEXT NOT NULL,
          invalidation_triggers_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          custom_notes TEXT,
          last_reviewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(symbol)
        );

-- [TABLE] MacroRegimeLog
CREATE TABLE MacroRegimeLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regime_date TEXT NOT NULL,
        regime TEXT NOT NULL,
        confidence REAL,
        nifty_5d_return REAL,
        nifty_20d_return REAL,
        realized_vol REAL,
        breadth_score REAL,
        vix_level REAL,
        conviction_multiplier REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(regime_date)
      );

-- [TABLE] ManagementClaims
CREATE TABLE ManagementClaims (
      claim_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      issuer_bse_code TEXT,
      period TEXT NOT NULL,
      category TEXT NOT NULL,
      statement TEXT NOT NULL,
      target_metric TEXT,
      baseline_value REAL,
      expected_value REAL,
      expected_outcome TEXT,
      expected_timeframe TEXT,
      evidence_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      actual_outcome_metric REAL,
      actual_outcome_description TEXT,
      resolution_evidence_id TEXT,
      resolved_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    , claim_date TEXT, expected_period_start TEXT, expected_period_end TEXT, evaluation_date TEXT, evaluation_basis TEXT, evaluation_evidence_id TEXT);

-- [TABLE] MarketSnapshots
CREATE TABLE MarketSnapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        snapshot_date TEXT NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume INTEGER,
        sma20 REAL,
        ema50 REAL,
        rsi14 REAL,
        macd_line REAL,
        macd_signal REAL,
        macd_histogram REAL,
        bb_upper REAL,
        bb_middle REAL,
        bb_lower REAL,
        bb_bandwidth REAL,
        bb_percent_b REAL,
        atr14 REAL,
        vwap REAL,
        volume_5d_avg REAL,
        relative_volume REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, open_interest REAL, data_source TEXT DEFAULT 'UPSTOX_API_V2',
        UNIQUE(symbol, snapshot_date)
      );

-- [TABLE] MasterTickers
CREATE TABLE MasterTickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isin TEXT UNIQUE NOT NULL,
    symbol TEXT NOT NULL,
    exchange TEXT DEFAULT 'NSE',
    segment TEXT DEFAULT 'EQ',
    series TEXT DEFAULT 'EQ',
    lot_size INTEGER DEFAULT 1,
    upstox_key_nse TEXT,
    upstox_key_bse TEXT,
    sector TEXT,
    listing_date TEXT,
    status TEXT DEFAULT 'ACTIVE'
, manual_ltp REAL, manual_ltp_date TEXT, name TEXT, created_at TEXT, updated_at TEXT, fmv_31_jan_2018 REAL, currency TEXT DEFAULT 'INR', last_price REAL, previous_close REAL, last_updated TEXT, company_name TEXT);

-- [TABLE] MemberPortfolioPermissions
CREATE TABLE MemberPortfolioPermissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES FamilyMembers(id) ON DELETE CASCADE,
      portfolio_name TEXT NOT NULL,
      access_level TEXT DEFAULT 'FULL',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_id, portfolio_name)
    );

-- [TABLE] MfNavHistory
CREATE TABLE MfNavHistory (
      scheme_code TEXT NOT NULL,
      isin TEXT,
      scheme_name TEXT NOT NULL,
      nav REAL NOT NULL,
      nav_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(scheme_code, nav_date)
    );

-- [TABLE] ModelGenerations
CREATE TABLE ModelGenerations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_tag TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        trigger_reason TEXT NOT NULL,
        accuracy_before REAL NOT NULL,
        accuracy_after REAL NOT NULL,
        weights_json TEXT NOT NULL,
        weight_shifts_json TEXT NOT NULL
      , walk_forward_json TEXT);

-- [TABLE] ModelPostMortems
CREATE TABLE ModelPostMortems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        recommendation_date TEXT NOT NULL,
        entry_price REAL NOT NULL,
        target_price REAL NOT NULL,
        stop_loss_price REAL NOT NULL,
        exit_price REAL NOT NULL,
        pnl_pct REAL NOT NULL,
        failure_category TEXT NOT NULL,
        root_cause TEXT NOT NULL,
        corrective_action TEXT NOT NULL,
        mutation_applied TEXT NOT NULL,
        learned_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

-- [TABLE] ModelRunLedger
CREATE TABLE ModelRunLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        regime TEXT,
        stocks_scanned INTEGER DEFAULT 0,
        high_conviction_alerts INTEGER DEFAULT 0,
        sl_hits_evaluated INTEGER DEFAULT 0,
        weight_mutations_applied INTEGER DEFAULT 0,
        accuracy_pct REAL DEFAULT 0,
        run_duration_ms INTEGER DEFAULT 0,
        trigger_reason TEXT
      );

-- [TABLE] MomentumVpaAlerts
CREATE TABLE MomentumVpaAlerts (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          symbol TEXT NOT NULL,
          alertType TEXT NOT NULL,
          severity TEXT NOT NULL,
          headline TEXT NOT NULL,
          message TEXT NOT NULL,
          price REAL NOT NULL,
          p0 REAL NOT NULL,
          blendedVwap REAL
        );

-- [TABLE] MomentumVpaOrders
CREATE TABLE MomentumVpaOrders (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          status TEXT NOT NULL,
          totalCapital REAL NOT NULL,
          totalQuantity INTEGER NOT NULL,
          p0 REAL NOT NULL,
          pPeak REAL NOT NULL,
          turnoverCr REAL NOT NULL,
          baseHigh REAL NOT NULL,
          baseLow REAL NOT NULL,
          baseDurationBars INTEGER NOT NULL,
          tranche1Qty INTEGER NOT NULL,
          tranche1Price REAL NOT NULL,
          tranche1Status TEXT NOT NULL,
          tranche2Qty INTEGER NOT NULL,
          tranche2Price REAL NOT NULL,
          tranche2Status TEXT NOT NULL,
          tranche3Qty INTEGER NOT NULL,
          tranche3Price REAL NOT NULL,
          tranche3Status TEXT NOT NULL,
          blendedVwap REAL NOT NULL,
          structuralRiskPct REAL NOT NULL,
          targetMinPrice REAL NOT NULL,
          targetMaxPrice REAL NOT NULL,
          emergencyStopPrice REAL,
          macroRegime TEXT NOT NULL,
          notes TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

-- [TABLE] NriTdsTransactions
CREATE TABLE NriTdsTransactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER,
          portfolio TEXT NOT NULL,
          date TEXT NOT NULL,
          isin TEXT NOT NULL,
          symbol TEXT NOT NULL,
          realized_gain_inr REAL NOT NULL,
          gain_type TEXT CHECK(gain_type IN ('STCG', 'LTCG')) NOT NULL,
          tds_rate_pct REAL NOT NULL,
          surcharge_pct REAL DEFAULT 0,
          cess_pct REAL DEFAULT 4.0,
          effective_tds_pct REAL NOT NULL,
          tds_amount_deducted REAL NOT NULL,
          challan_bsr_code TEXT,
          challan_number TEXT,
          challan_date TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        , member_id INTEGER);

-- [TABLE] NseBhavcopy
CREATE TABLE NseBhavcopy (
      symbol TEXT NOT NULL,
      series TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      prev_close REAL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      avg_price REAL,
      volume INTEGER,
      turnover_lacs REAL,
      no_of_trades INTEGER,
      deliv_qty INTEGER,
      deliv_per REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (symbol, trade_date)
    );

-- [TABLE] OpportunityEngineReports
CREATE TABLE OpportunityEngineReports (
            id TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            report_json TEXT NOT NULL,
            universe_count INTEGER DEFAULT 0,
            opportunities_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'READY',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] OpportunityScripEvaluations
CREATE TABLE OpportunityScripEvaluations (
            symbol TEXT PRIMARY KEY,
            company_name TEXT,
            sector TEXT,
            market_cap_category TEXT,
            convergence_score REAL,
            actionable_now INTEGER DEFAULT 0,
            multibagger_tier TEXT,
            evaluation_json TEXT NOT NULL,
            last_updated_at INTEGER NOT NULL
          , provenance_tag TEXT DEFAULT 'SOURCED: NSE_PRIMARY', confidence_interval_str TEXT DEFAULT '±2.5%');

-- [TABLE] PaperTradingNAVHistory
CREATE TABLE PaperTradingNAVHistory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pot_id TEXT NOT NULL,
            nav REAL NOT NULL,
            cash REAL NOT NULL,
            invested REAL NOT NULL,
            daily_pnl REAL NOT NULL DEFAULT 0.0,
            daily_return_pct REAL NOT NULL DEFAULT 0.0,
            benchmark_nifty_nav REAL NOT NULL,
            alpha_vs_benchmark_pct REAL NOT NULL DEFAULT 0.0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] PaperTradingPositions
CREATE TABLE PaperTradingPositions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pot_id TEXT DEFAULT 'pot_conservative',
            recommendation_id INTEGER,
            symbol TEXT NOT NULL,
            company_name TEXT,
            sector TEXT,
            action TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            initial_quantity INTEGER,
            entry_price REAL NOT NULL,
            invested_capital REAL NOT NULL,
            current_price REAL NOT NULL,
            stop_loss REAL NOT NULL,
            trailing_stop_loss REAL,
            target_1 REAL NOT NULL,
            target_2 REAL NOT NULL,
            partial_exit_done INTEGER DEFAULT 0,
            partial_exit_price REAL,
            partial_exit_pnl REAL DEFAULT 0.0,
            exit_confirmation_type TEXT DEFAULT 'CANDLE_CLOSE',
            friction_costs REAL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'OPEN',
            exit_price REAL,
            exit_reason TEXT,
            realized_pnl REAL DEFAULT 0,
            realized_pnl_pct REAL DEFAULT 0,
            entry_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            exit_date DATETIME
          );

-- [TABLE] PaperTradingPotConfig
CREATE TABLE PaperTradingPotConfig (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pot_name TEXT NOT NULL DEFAULT 'Main Sentinel Paper Pot',
            initial_capital REAL NOT NULL DEFAULT 1000000,
            cash_balance REAL NOT NULL DEFAULT 1000000,
            current_portfolio_nav REAL NOT NULL DEFAULT 1000000,
            risk_per_trade_pct REAL NOT NULL DEFAULT 5.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] PaperTradingPots
CREATE TABLE PaperTradingPots (
            id TEXT PRIMARY KEY,
            pot_name TEXT NOT NULL,
            strategy_type TEXT NOT NULL DEFAULT 'CONSERVATIVE',
            initial_capital REAL NOT NULL DEFAULT 1000000.0,
            cash_balance REAL NOT NULL DEFAULT 1000000.0,
            current_portfolio_nav REAL NOT NULL DEFAULT 1000000.0,
            total_realized_pnl REAL NOT NULL DEFAULT 0.0,
            risk_per_trade_pct REAL NOT NULL DEFAULT 5.0,
            max_drawdown_pct REAL NOT NULL DEFAULT 0.0,
            peak_nav REAL NOT NULL DEFAULT 1000000.0,
            is_circuit_breaker_tripped INTEGER NOT NULL DEFAULT 0,
            circuit_breaker_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] PipelineRunLog
CREATE TABLE PipelineRunLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_date TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL DEFAULT 'RUNNING',
        bhavcopy_symbols INTEGER DEFAULT 0,
        upstox_filled INTEGER DEFAULT 0,
        yahoo_filled INTEGER DEFAULT 0,
        total_symbols INTEGER DEFAULT 0,
        quality_issues INTEGER DEFAULT 0,
        duration_ms INTEGER,
        error_message TEXT
      );

-- [TABLE] PmsBenchmarkMonthly
CREATE TABLE PmsBenchmarkMonthly (
      portfolio TEXT,
      period_start TEXT,
      period_end TEXT,
      period_ror_pct REAL,
      bm_period_ror_pct REAL,
      cum_ror_pct REAL,
      bm_cum_ror_pct REAL,
      benchmark_name TEXT,
      PRIMARY KEY(portfolio, period_end)
    );

-- [TABLE] PmsFeeConfigurations
CREATE TABLE PmsFeeConfigurations (
        portfolio TEXT PRIMARY KEY,
        annual_fee_rate REAL DEFAULT 1.0,
        gst_rate REAL DEFAULT 18.0,
        billing_frequency TEXT DEFAULT 'quarterly',
        calculation_basis TEXT DEFAULT 'daily_avg',
        include_expenses INTEGER DEFAULT 0,
        notes TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

-- [TABLE] PmsReconciliationBaseline
CREATE TABLE PmsReconciliationBaseline (
      portfolio TEXT PRIMARY KEY,
      baseline_date TEXT NOT NULL,
      last_reconciled_txn_id INTEGER NOT NULL,
      cash_in_hand REAL NOT NULL,
      initial_cash_deposits REAL NOT NULL,
      in_kind_market_val REAL NOT NULL,
      in_kind_cost_val REAL NOT NULL,
      total_withdrawals REAL DEFAULT 0,
      net_trading_cash REAL NOT NULL,
      gross_dividends REAL NOT NULL,
      tds_paid REAL NOT NULL,
      management_fees_paid REAL NOT NULL,
      operating_expenses REAL NOT NULL,
      reconciled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    );

-- [TABLE] PmsReconciliationBaselineHoldings
CREATE TABLE PmsReconciliationBaselineHoldings (
      portfolio TEXT NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT NOT NULL,
      name TEXT,
      quantity REAL NOT NULL,
      avg_buy_price REAL NOT NULL,
      total_cost REAL NOT NULL,
      tax_avg_price REAL,
      tax_cost_basis REAL,
      PRIMARY KEY (portfolio, symbol, isin)
    );

-- [TABLE] PmsSummaryHoldings
CREATE TABLE PmsSummaryHoldings (
      portfolio TEXT NOT NULL,
      isin TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT,
      quantity REAL NOT NULL,
      avg_price REAL NOT NULL,
      total_cost REAL NOT NULL,
      ltp REAL NOT NULL,
      current_value REAL NOT NULL,
      statement_date TEXT, member_id INTEGER,
      PRIMARY KEY (portfolio, isin)
    );

-- [TABLE] PortfolioHistory
CREATE TABLE PortfolioHistory (
    date TEXT,
    portfolio TEXT DEFAULT 'Default',
    created_at TEXT,
    updated_at TEXT,
    cumulative_invested REAL DEFAULT 0,
    market_value REAL DEFAULT 0, unrealized_pnl REAL DEFAULT 0, xirr REAL,
    PRIMARY KEY (date, portfolio)
);

-- [TABLE] Portfolios
CREATE TABLE Portfolios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          type TEXT DEFAULT 'EQUITY',
          status TEXT DEFAULT 'ACTIVE',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        , base_currency TEXT DEFAULT 'INR', family_group TEXT DEFAULT 'Primary Family Office', benchmark_symbol TEXT DEFAULT '^NSEI', member_id INTEGER, pan TEXT, owner_name TEXT);

-- [TABLE] PredictionAuditLedger
CREATE TABLE PredictionAuditLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        company_name TEXT,
        recommendation_date TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        entry_price REAL NOT NULL,
        target_price REAL NOT NULL,
        stop_loss_price REAL NOT NULL,
        current_price REAL NOT NULL,
        max_price_reached REAL NOT NULL,
        predicted_probability_pct REAL NOT NULL,
        confidence_level TEXT NOT NULL,
        status TEXT NOT NULL,
        pnl_pct REAL NOT NULL,
        horizon_days INTEGER NOT NULL,
        category TEXT NOT NULL,
        layman_thesis TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      , entry_rsi14 REAL, entry_bb_bandwidth REAL, entry_bb_percent_b REAL, entry_relative_volume REAL, entry_macd_histogram REAL, entry_atr14 REAL, entry_regime TEXT, entry_composite_score REAL, days_active INTEGER DEFAULT 0, peak_pnl_pct REAL DEFAULT 0, trough_pnl_pct REAL DEFAULT 0, resolved_at TEXT, entry_delivery_surge REAL, entry_sector_z_score REAL, entry_rs_nifty REAL, entry_kelly_fraction REAL, is_seed INTEGER DEFAULT 0);

-- [TABLE] PriceHistoryCache
CREATE TABLE PriceHistoryCache (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (symbol, date)
);

-- [TABLE] Prices
CREATE TABLE Prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(symbol, date)
          );

-- [TABLE] QuarantinedRecords
CREATE TABLE QuarantinedRecords (id INTEGER PRIMARY KEY AUTOINCREMENT, scripCode TEXT NOT NULL, listingPlatform TEXT DEFAULT 'NSE_MAIN', fieldName TEXT NOT NULL, extractedValue TEXT NOT NULL, failureReason TEXT NOT NULL, citationVeracityScore REAL, sourceDocument TEXT, quarantinedAt TEXT DEFAULT CURRENT_TIMESTAMP, reviewStatus TEXT DEFAULT 'PENDING', reviewedAt TEXT, reviewerNote TEXT);

-- [TABLE] QuarterlyEarningsIntelligence
CREATE TABLE QuarterlyEarningsIntelligence (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          quarter_label TEXT NOT NULL,
          filing_date TEXT NOT NULL,
          revenue_actual REAL,
          revenue_estimate REAL,
          revenue_beat_miss_pct REAL,
          ebitda_margin_actual REAL,
          pat_actual REAL,
          management_guidance_tone TEXT,
          concall_key_takeaways_json TEXT,
          thesis_impact TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] RealizedGains
CREATE TABLE RealizedGains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    portfolio TEXT NOT NULL,
    isin TEXT NOT NULL,
    symbol TEXT,
    buy_date TEXT,
    buy_price REAL,
    matched_qty REAL,
    sell_date TEXT,
    sell_price REAL,
    buy_cost REAL,
    sell_proceeds REAL,
    realized_pnl REAL,
    holding_days INTEGER,
    tax_category TEXT,
    fmv_31_jan_2018 REAL,
    grandfathered_cost REAL,
    taxable_pnl REAL
, member_id INTEGER);

-- [TABLE] ReconciledHoldings
CREATE TABLE ReconciledHoldings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            isin TEXT NOT NULL,
            symbol TEXT NOT NULL,
            quantity REAL NOT NULL,
            avg_buy_price REAL NOT NULL,
            total_cost REAL NOT NULL,
            reconciled_at TEXT NOT NULL,
            reconciled_by TEXT DEFAULT 'manual',
            is_locked INTEGER DEFAULT 1,
            notes TEXT, member_id INTEGER,
            UNIQUE(portfolio, isin)
          );

-- [TABLE] ReconciliationAuditSnapshots
CREATE TABLE ReconciliationAuditSnapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      statement_date TEXT,
      portfolio TEXT NOT NULL,
      statement_filename TEXT,
      baseline_holdings_count INTEGER,
      baseline_cost REAL,
      baseline_valuation REAL,
      baseline_cash REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      holdings_snapshot TEXT,
      notes TEXT
    );

-- [TABLE] ReconciliationExceptions
CREATE TABLE ReconciliationExceptions (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio TEXT NOT NULL, scrip_or_trade_id TEXT NOT NULL, exception_type TEXT NOT NULL, discrepancy_detail TEXT NOT NULL, reason_category TEXT NOT NULL, reason_notes TEXT, approved_by TEXT DEFAULT 'User', approved_at TEXT DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'APPROVED');

-- [TABLE] ScoringModelVersion
CREATE TABLE ScoringModelVersion (
            version_id TEXT PRIMARY KEY,
            weights_json TEXT NOT NULL,
            backtest_period_start TEXT NOT NULL,
            backtest_period_end TEXT NOT NULL,
            out_of_sample_hit_rate_pct REAL,
            avg_r_multiple REAL,
            max_drawdown_pct REAL,
            sharpe_ratio REAL,
            is_active INTEGER DEFAULT 0,
            calibrated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] ScripSchedule
CREATE TABLE ScripSchedule (
        scripCode TEXT PRIMARY KEY,
        priorityTier TEXT NOT NULL,
        lastStatutoryCheck TEXT,
        lastConcallProcessed TEXT,
        nextConcallExpected TEXT
      );

-- [TABLE] SecurityDossierSnapshots
CREATE TABLE SecurityDossierSnapshots (
          symbol TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          sector TEXT NOT NULL,
          industry TEXT,
          cmp REAL NOT NULL,
          day_change_pct REAL,
          market_cap_cr REAL,
          outlook_json TEXT NOT NULL,
          catalysts_json TEXT NOT NULL,
          sector_positioning_json TEXT NOT NULL,
          macro_mood_json TEXT NOT NULL,
          flows_json TEXT NOT NULL,
          fundamentals_json TEXT NOT NULL,
          technicals_json TEXT NOT NULL,
          derivatives_json TEXT NOT NULL,
          megatrend_json TEXT NOT NULL,
          concall_json TEXT,
          scores_json TEXT NOT NULL,
          portal_attribution_json TEXT NOT NULL,
          full_dossier_json TEXT NOT NULL,
          researched_at TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] SecurityKnowledgeBaseLedger
CREATE TABLE SecurityKnowledgeBaseLedger (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          as_of_date TEXT NOT NULL,
          verdict TEXT NOT NULL,
          calibrated_prob REAL NOT NULL,
          target_price REAL NOT NULL,
          stop_loss REAL NOT NULL,
          horizon_days INTEGER NOT NULL,
          fundamental_score REAL NOT NULL,
          technical_score REAL NOT NULL,
          flow_score REAL NOT NULL,
          news_score REAL NOT NULL,
          fno_score REAL,
          bull_catalysts_json TEXT NOT NULL,
          bear_risks_json TEXT NOT NULL,
          macro_micro_json TEXT NOT NULL,
          peer_benchmark_json TEXT NOT NULL,
          raw_metrics_snapshot_json TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(symbol, as_of_date)
        );

-- [TABLE] SecuritySignalDriftLedger
CREATE TABLE SecuritySignalDriftLedger (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          previous_value REAL,
          current_value REAL,
          drift_pct REAL,
          drift_direction TEXT,
          evaluated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

-- [TABLE] SelfLearningMutationLog
CREATE TABLE SelfLearningMutationLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id INTEGER,
            rule_name TEXT NOT NULL,
            previous_value REAL NOT NULL,
            new_value REAL NOT NULL,
            mutation_reason TEXT NOT NULL,
            sample_size INTEGER NOT NULL,
            decay_weight REAL NOT NULL,
            performance_delta REAL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] SignalBrierScoreLog
CREATE TABLE SignalBrierScoreLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_name TEXT NOT NULL,
            signal_fired INTEGER NOT NULL,
            signal_value REAL,
            outcome TEXT,
            recommendation_id TEXT,
            fired_at TEXT NOT NULL,
            resolved_at TEXT,
            brier_score REAL
          );

-- [TABLE] SmartMoneySectorCache
CREATE TABLE SmartMoneySectorCache (
          sector TEXT,
          timeframe TEXT,
          net_flow_cr REAL,
          average_smas REAL,
          smas_delta REAL,
          accumulation_breadth_pct REAL,
          distribution_breadth_pct REAL,
          total_stocks INTEGER,
          flow_direction TEXT,
          flow_momentum_zscore REAL,
          top_inflows_json TEXT,
          top_outflows_json TEXT,
          updated_at TEXT, provenance_json TEXT, confidence_interval_str TEXT,
          PRIMARY KEY (sector, timeframe)
        );

-- [TABLE] SnapshotProvenance
CREATE TABLE SnapshotProvenance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scripCode TEXT NOT NULL,
        fieldName TEXT NOT NULL,
        sourceTierUsed TEXT NOT NULL,
        confidenceScore REAL NOT NULL,
        citationVeracityScore REAL,
        extractedAt TEXT DEFAULT CURRENT_TIMESTAMP
      , listingPlatform TEXT DEFAULT 'NSE_MAIN');

-- [TABLE] SoldStockRegistry
CREATE TABLE SoldStockRegistry (
            portfolio TEXT NOT NULL,
            isin TEXT NOT NULL,
            symbol TEXT NOT NULL,
            sold_at TEXT,
            sealed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (portfolio, isin)
          );

-- [TABLE] StatutoryEvents
CREATE TABLE StatutoryEvents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scripCode TEXT NOT NULL,
      eventDate TEXT NOT NULL,
      eventType TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      sourceUrl TEXT,
      contentHash TEXT UNIQUE NOT NULL,
      ingestedAt TEXT DEFAULT CURRENT_TIMESTAMP
    , listingPlatform TEXT DEFAULT 'NSE_MAIN');

-- [TABLE] StrategyComparisonSets
CREATE TABLE StrategyComparisonSets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        strategy_ids_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

-- [TABLE] StrippingDisallowances
CREATE TABLE StrippingDisallowances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio TEXT NOT NULL,
      pan TEXT NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT NOT NULL,
      section TEXT NOT NULL,
      trigger_sell_date TEXT NOT NULL,
      record_date TEXT NOT NULL,
      gross_loss_claimed REAL NOT NULL,
      disallowed_loss REAL NOT NULL,
      reportable_loss REAL NOT NULL,
      transferred_to_lot_id INTEGER,
      adjusted_cost_of_bonus_lot REAL,
      audit_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

-- [TABLE] SystemLogs
CREATE TABLE SystemLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    level TEXT DEFAULT 'ERROR',
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    action_required TEXT,
    resolved INTEGER DEFAULT 0
);

-- [TABLE] TargetAllocations
CREATE TABLE TargetAllocations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_name TEXT NOT NULL,
          asset_class TEXT NOT NULL,
          target_pct REAL NOT NULL,
          rebalance_tolerance_pct REAL DEFAULT 5.0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(model_name, asset_class)
        );

-- [TABLE] TaxSummary
CREATE TABLE TaxSummary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    financial_year TEXT NOT NULL,
    portfolio TEXT NOT NULL,
    stcg_gains REAL DEFAULT 0,
    stcg_tax REAL DEFAULT 0,
    ltcg_gains REAL DEFAULT 0,
    ltcg_exemption REAL DEFAULT 125000,
    ltcg_taxable REAL DEFAULT 0,
    ltcg_tax REAL DEFAULT 0,
    total_tax REAL DEFAULT 0,
    dividends REAL DEFAULT 0,
    total_realized_pnl REAL DEFAULT 0, created_at TEXT, updated_at TEXT, intraday_gains REAL DEFAULT 0,
    UNIQUE(financial_year, portfolio)
);

-- [TABLE] TopNCurationLog
CREATE TABLE TopNCurationLog (
            run_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            rank INTEGER,
            included INTEGER NOT NULL,
            consensus_pillars_passed INTEGER,
            convergence_score REAL NOT NULL,
            confidence_band_low REAL NOT NULL,
            confidence_band_high REAL NOT NULL,
            excluded_reason TEXT,
            run_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, symbol)
          );

-- [TABLE] Transactions
CREATE TABLE Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    portfolio TEXT NOT NULL,
    type TEXT NOT NULL,
    isin TEXT NOT NULL,
    symbol TEXT,
    quantity REAL DEFAULT 0,
    price REAL DEFAULT 0,
    gross_amount REAL DEFAULT 0,
    brokerage REAL DEFAULT 0,
    stt REAL DEFAULT 0,
    stamp_duty REAL DEFAULT 0,
    gst REAL DEFAULT 0,
    exchange_charges REAL DEFAULT 0,
    sebi_charges REAL DEFAULT 0,
    total_taxes REAL DEFAULT 0,
    net_amount REAL DEFAULT 0,
    source TEXT,
    notes TEXT, batch_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT, is_cash_flow BOOLEAN DEFAULT 1, corporate_action_type TEXT, account_number TEXT, folio TEXT, broker_name TEXT, is_ca INTEGER DEFAULT 0, member_id INTEGER,
    FOREIGN KEY(isin) REFERENCES MasterTickers(isin)
);

-- [TABLE] UserMappings
CREATE TABLE UserMappings (id INTEGER PRIMARY KEY AUTOINCREMENT, raw_name TEXT UNIQUE NOT NULL, resolved_symbol TEXT NOT NULL, created_at TEXT, updated_at TEXT);

-- [TABLE] ValuationSnapshots
CREATE TABLE ValuationSnapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      portfolio TEXT NOT NULL,
      total_value_inr REAL NOT NULL DEFAULT 0,
      equity_value REAL NOT NULL DEFAULT 0,
      cash_value REAL NOT NULL DEFAULT 0,
      mf_value REAL NOT NULL DEFAULT 0,
      fx_rate_usd REAL DEFAULT 0,
      trigger_source TEXT NOT NULL,
      drift_pct REAL DEFAULT 0,
      drift_alert TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    , aif_value REAL NOT NULL DEFAULT 0, unlisted_value REAL NOT NULL DEFAULT 0);

-- [TABLE] ZerodhaHoldings
CREATE TABLE ZerodhaHoldings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio TEXT,
    isin TEXT,
    symbol TEXT,
    name TEXT,
    quantity REAL,
    avg_price REAL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
, member_id INTEGER, current_price REAL, current_value REAL, pnl REAL, updated_at TIMESTAMP);

-- [TABLE] ZerodhaSyncCheckpoints
CREATE TABLE ZerodhaSyncCheckpoints (portfolio TEXT PRIMARY KEY, client_id TEXT, last_synced_trade_date TEXT, last_synced_trade_id TEXT, last_sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP, sync_mode TEXT DEFAULT 'INCREMENTAL', total_trades_count INTEGER DEFAULT 0);

-- [TABLE] audit_ledger
CREATE TABLE audit_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_utc TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT NOT NULL,
      dedup_key TEXT,
      entry_hash TEXT NOT NULL
    );

-- [TABLE] backtest_regime_ledger
CREATE TABLE backtest_regime_ledger (
        symbol TEXT NOT NULL,
        company_name TEXT NOT NULL,
        tier TEXT NOT NULL,
        regime_id TEXT NOT NULL,
        regime_type TEXT NOT NULL,
        regime_start TEXT NOT NULL,
        regime_end TEXT NOT NULL,
        candle_count INTEGER NOT NULL DEFAULT 0,
        data_quality_score REAL NOT NULL DEFAULT 0.0,

        s1_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
        s1_signal_date TEXT,
        s1_entry_price REAL,
        s1_stop_loss REAL,
        s1_target_price REAL,
        s1_exit_price REAL,
        s1_exit_date TEXT,
        s1_trade_outcome TEXT DEFAULT 'N/A',
        s1_net_return_pct REAL NOT NULL DEFAULT 0.0,
        s1_reentries_count INTEGER NOT NULL DEFAULT 0,
        s1_holding_days INTEGER,

        s2_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
        s2_signal_date TEXT,
        s2_entry_price REAL,
        s2_stop_loss REAL,
        s2_target_price REAL,
        s2_exit_price REAL,
        s2_exit_date TEXT,
        s2_trade_outcome TEXT DEFAULT 'N/A',
        s2_net_return_pct REAL NOT NULL DEFAULT 0.0,
        s2_reentries_count INTEGER NOT NULL DEFAULT 0,
        s2_holding_days INTEGER,

        s3_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
        s3_signal_date TEXT,
        s3_entry_price REAL,
        s3_stop_loss REAL,
        s3_target_price REAL,
        s3_exit_price REAL,
        s3_exit_date TEXT,
        s3_trade_outcome TEXT DEFAULT 'N/A',
        s3_net_return_pct REAL NOT NULL DEFAULT 0.0,
        s3_reentries_count INTEGER NOT NULL DEFAULT 0,
        s3_holding_days INTEGER,

        s4_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
        s4_signal_date TEXT,
        s4_entry_price REAL,
        s4_stop_loss REAL,
        s4_target_price REAL,
        s4_exit_price REAL,
        s4_exit_date TEXT,
        s4_trade_outcome TEXT DEFAULT 'N/A',
        s4_net_return_pct REAL NOT NULL DEFAULT 0.0,
        s4_reentries_count INTEGER NOT NULL DEFAULT 0,
        s4_holding_days INTEGER,

        best_performing_strategy TEXT DEFAULT 'NONE',
        max_strategy_return_pct REAL NOT NULL DEFAULT 0.0,
        combined_signal_agreement TEXT NOT NULL DEFAULT '0/4',
        agreement_count INTEGER NOT NULL DEFAULT 0,
        computed_at TEXT DEFAULT (datetime('now')), s5_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA', s5_signal_date TEXT, s5_entry_price REAL, s5_stop_loss REAL, s5_target_price REAL, s5_exit_price REAL, s5_exit_date TEXT, s5_trade_outcome TEXT DEFAULT 'N/A', s5_net_return_pct REAL NOT NULL DEFAULT 0.0, s5_reentries_count INTEGER NOT NULL DEFAULT 0, s5_holding_days INTEGER, s6_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA', s6_signal_date TEXT, s6_entry_price REAL, s6_stop_loss REAL, s6_target_price REAL, s6_exit_price REAL, s6_exit_date TEXT, s6_trade_outcome TEXT DEFAULT 'N/A', s6_net_return_pct REAL NOT NULL DEFAULT 0.0, s6_reentries_count INTEGER NOT NULL DEFAULT 0, s6_holding_days INTEGER, s7_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA', s7_signal_date TEXT, s7_entry_price REAL, s7_stop_loss REAL, s7_target_price REAL, s7_exit_price REAL, s7_exit_date TEXT, s7_trade_outcome TEXT DEFAULT 'N/A', s7_net_return_pct REAL NOT NULL DEFAULT 0.0, s7_reentries_count INTEGER NOT NULL DEFAULT 0, s7_holding_days INTEGER, s8_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA', s8_signal_date TEXT, s8_entry_price REAL, s8_stop_loss REAL, s8_target_price REAL, s8_exit_price REAL, s8_exit_date TEXT, s8_trade_outcome TEXT DEFAULT 'N/A', s8_net_return_pct REAL NOT NULL DEFAULT 0.0, s8_reentries_count INTEGER NOT NULL DEFAULT 0, s8_holding_days INTEGER, s9_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA', s9_signal_date TEXT, s9_entry_price REAL, s9_stop_loss REAL, s9_target_price REAL, s9_exit_price REAL, s9_exit_date TEXT, s9_trade_outcome TEXT DEFAULT 'N/A', s9_net_return_pct REAL NOT NULL DEFAULT 0.0, s9_reentries_count INTEGER NOT NULL DEFAULT 0, s9_holding_days INTEGER, s10_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA', s10_signal_date TEXT, s10_entry_price REAL, s10_stop_loss REAL, s10_target_price REAL, s10_exit_price REAL, s10_exit_date TEXT, s10_trade_outcome TEXT DEFAULT 'N/A', s10_net_return_pct REAL NOT NULL DEFAULT 0.0, s10_reentries_count INTEGER NOT NULL DEFAULT 0, s10_holding_days INTEGER, s11_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA', s11_signal_date TEXT, s11_entry_price REAL, s11_stop_loss REAL, s11_target_price REAL, s11_exit_price REAL, s11_exit_date TEXT, s11_trade_outcome TEXT DEFAULT 'N/A', s11_net_return_pct REAL NOT NULL DEFAULT 0.0, s11_reentries_count INTEGER NOT NULL DEFAULT 0, s11_holding_days INTEGER,

        PRIMARY KEY(symbol, regime_id)
      );

-- [TABLE] broker_research_reports
CREATE TABLE broker_research_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      broker_name TEXT NOT NULL,
      report_date TEXT NOT NULL,
      rating TEXT NOT NULL, -- 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL'
      target_price REAL NOT NULL,
      target_horizon_months INTEGER DEFAULT 12,
      source_account TEXT
    );

-- [TABLE] calibration_stats
CREATE TABLE calibration_stats (
      category TEXT NOT NULL,
      confidence_tier TEXT NOT NULL,
      n INTEGER NOT NULL,
      hits INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      wilson_ci_low REAL NOT NULL,
      wilson_ci_high REAL NOT NULL,
      median_lead_time_days REAL,
      status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
      last_computed_at TEXT NOT NULL,
      PRIMARY KEY (category, confidence_tier)
    );

-- [TABLE] data_feed_status
CREATE TABLE data_feed_status (
      feed_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      last_heartbeat_utc TEXT NOT NULL,
      last_successful_fetch_utc TEXT,
      current_state TEXT NOT NULL DEFAULT 'UNAVAILABLE',
      failure_count INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

-- [TABLE] data_sources
CREATE TABLE data_sources (
      source_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      category TEXT NOT NULL,
      access_method TEXT NOT NULL,
      tos_status TEXT NOT NULL,
      reliability_tier INTEGER NOT NULL,
      refresh_cadence TEXT NOT NULL,
      notes TEXT
    );

-- [TABLE] db_migrations
CREATE TABLE db_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

-- [TABLE] derived_options_metrics
CREATE TABLE derived_options_metrics (
      symbol TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      pcr_oi REAL NOT NULL,
      pcr_volume REAL NOT NULL,
      max_pain_strike REAL NOT NULL,
      iv_skew_25delta REAL,
      unusual_oi_buildup_strikes TEXT,
      PRIMARY KEY(symbol, as_of_date)
    );

-- [TABLE] feature_audit_log
CREATE TABLE feature_audit_log (
      id TEXT PRIMARY KEY,
      signal_id TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      value_used_at_generation REAL,
      value_recomputed_strict_asof REAL,
      discrepancy_flag INTEGER NOT NULL DEFAULT 0,
      audited_at TEXT NOT NULL
    );

-- [TABLE] fill_registry
CREATE TABLE fill_registry (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id            TEXT,
      trade_id            TEXT NOT NULL,
      isin                TEXT NOT NULL,
      trade_date          TEXT NOT NULL,
      trade_time          TEXT,
      trade_type          TEXT NOT NULL,
      quantity            REAL NOT NULL,
      price               REAL NOT NULL,
      broker_code         TEXT NOT NULL,
      settlement_type     TEXT NOT NULL,
      fill_hash           TEXT NOT NULL UNIQUE,
      order_hash          TEXT,
      batch_id            TEXT NOT NULL,
      ingestion_ts        TEXT NOT NULL DEFAULT (datetime('now','utc'))
    );

-- [TABLE] fundamental_metric_conflicts
CREATE TABLE fundamental_metric_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      metric TEXT NOT NULL,
      source_a TEXT NOT NULL,
      value_a REAL NOT NULL,
      source_b TEXT NOT NULL,
      value_b REAL NOT NULL,
      max_deviation_pct REAL NOT NULL,
      as_of TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT 0,
      resolution_note TEXT
    );

-- [TABLE] funnel_presets
CREATE TABLE funnel_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            strategy_ids_json TEXT NOT NULL,
            gate_config_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] harvest_tracking
CREATE TABLE harvest_tracking (
      harvest_id INTEGER PRIMARY KEY AUTOINCREMENT,
      pan TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT NOT NULL,
      quantity REAL NOT NULL,
      sold_date TEXT NOT NULL,
      loss_amount REAL NOT NULL,
      tax_saved REAL NOT NULL,
      repurchase_eligible_date TEXT NOT NULL,
      outcome_status TEXT NOT NULL DEFAULT 'PENDING',
      repurchase_actual_date TEXT,
      intervening_corporate_action INTEGER DEFAULT 0,
      intervening_ca_details TEXT,
      created_at TEXT NOT NULL
    );

-- [TABLE] indicator_validation_results
CREATE TABLE indicator_validation_results (
      id TEXT PRIMARY KEY,
      indicator_name TEXT NOT NULL,
      category TEXT NOT NULL,
      best_lag_days INTEGER NOT NULL,
      correlation_at_lag REAL NOT NULL,
      p_value REAL NOT NULL,
      validated_on_window TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
    );

-- [TABLE] industrial_group_registry
CREATE TABLE industrial_group_registry (
          group_id TEXT PRIMARY KEY,
          group_name TEXT NOT NULL UNIQUE,
          founding_year INTEGER NOT NULL,
          vintage_years INTEGER,
          promoter_family_origin TEXT,
          headquarters TEXT,
          governance_rating TEXT CHECK(governance_rating IN ('AAA_SOVEREIGN', 'AA_INSTITUTIONAL', 'A_SOUND', 'REJECTED')),
          notes TEXT
        );

-- [TABLE] leading_indicator_series
CREATE TABLE leading_indicator_series (
      id TEXT PRIMARY KEY,
      indicator_name TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      source TEXT NOT NULL,
      data_feed_status TEXT NOT NULL DEFAULT 'LIVE'
    );

-- [TABLE] model_generations
CREATE TABLE model_generations (
      id TEXT PRIMARY KEY,
      weights_json TEXT NOT NULL,
      status TEXT NOT NULL,
      train_window TEXT NOT NULL,
      test_window TEXT NOT NULL,
      out_of_sample_metrics TEXT NOT NULL,
      promoted_at TEXT,
      retired_at TEXT,
      retirement_reason TEXT
    );

-- [TABLE] mutation_dedup_keys
CREATE TABLE mutation_dedup_keys (
      dedup_key TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      result_hash TEXT NOT NULL,
      response_payload TEXT,
      superseded_by TEXT
    );

-- [TABLE] news_events
CREATE TABLE news_events (
      event_id TEXT PRIMARY KEY,
      published_at TEXT NOT NULL,
      source_id TEXT NOT NULL,
      headline TEXT NOT NULL,
      entity_keys TEXT NOT NULL, -- comma-separated symbols/ISINs
      event_type TEXT NOT NULL,  -- 'EARNINGS','M&A','REGULATORY','LITIGATION','MANAGEMENT_CHANGE','GUIDANCE','OTHER'
      dedup_cluster_id TEXT,
      sentiment_score REAL
    );

-- [TABLE] options_chain_snapshot
CREATE TABLE options_chain_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      expiry TEXT NOT NULL,
      strike REAL NOT NULL,
      option_type TEXT NOT NULL, -- 'CE' | 'PE'
      oi INTEGER NOT NULL,
      oi_change INTEGER NOT NULL,
      iv REAL,
      volume INTEGER NOT NULL,
      ltp REAL,
      as_of_timestamp TEXT NOT NULL
    , as_of_date TEXT);

-- [TABLE] paper_trades
CREATE TABLE paper_trades (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            company_name TEXT,
            strategy_ids TEXT,
            gate_snapshot TEXT,
            entry_date TEXT,
            entry_price REAL,
            stop_loss REAL,
            target_1 REAL,
            target_2 REAL,
            position_size INTEGER,
            position_inr REAL,
            status TEXT DEFAULT 'OPEN',
            exit_date TEXT,
            exit_price REAL,
            pnl_pct REAL,
            pnl_inr REAL,
            holding_days INTEGER,
            max_gain_pct REAL,
            max_loss_pct REAL,
            verdict TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] pli_sector_registry
CREATE TABLE pli_sector_registry (
          scheme_id TEXT PRIMARY KEY,
          scheme_name TEXT NOT NULL,
          vertical_code TEXT NOT NULL,
          nodal_ministry TEXT NOT NULL,
          notified_outlay_cr REAL NOT NULL,
          target_year INTEGER NOT NULL,
          status TEXT CHECK(status IN ('ACTIVE', 'EXPANDING', 'COMPLETED'))
        );

-- [TABLE] portfolio_risk_snapshots
CREATE TABLE portfolio_risk_snapshots (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      current_drawdown_pct REAL NOT NULL,
      trailing_30d_volatility REAL NOT NULL,
      var_95_1day REAL NOT NULL,
      breaker_status TEXT NOT NULL DEFAULT 'NORMAL'
    );

-- [TABLE] position_size_recommendations
CREATE TABLE position_size_recommendations (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      portfolio_id TEXT NOT NULL,
      raw_probability REAL,
      calibrated_probability REAL,
      kelly_fraction REAL,
      half_kelly_fraction REAL,
      correlation_haircut REAL,
      liquidity_cap_amount REAL,
      single_stock_cap_pct REAL,
      final_recommended_amount REAL,
      final_recommended_pct REAL,
      generated_at TEXT NOT NULL,
      inputs_snapshot TEXT NOT NULL
    );

-- [TABLE] regime_backtest_summaries
CREATE TABLE regime_backtest_summaries (
        regime TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        strategy_name TEXT NOT NULL,
        period_start TEXT,
        period_end TEXT,
        scrip_count INTEGER,
        total_signals INTEGER,
        win_rate_pct REAL,
        profit_factor REAL,
        avg_gain_pct REAL,
        avg_loss_pct REAL,
        total_return_pct REAL,
        period_cagr_pct REAL,
        max_drawdown_pct REAL,
        sharpe_ratio REAL,
        brier_score REAL,
        avg_holding_days REAL,
        best_scrip TEXT,
        best_scrip_return_pct REAL,
        worst_scrip TEXT,
        worst_scrip_return_pct REAL,
        re_entries_total INTEGER,
        PRIMARY KEY (regime, strategy_id)
      );

-- [TABLE] regime_backtest_trades
CREATE TABLE regime_backtest_trades (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        company_name TEXT,
        tier TEXT,
        is_fno INTEGER,
        regime TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        strategy_name TEXT,
        signal_date TEXT,
        initial_entry_date TEXT,
        initial_entry_price REAL,
        stop_loss REAL,
        target_price REAL,
        re_entries_count INTEGER,
        re_entries_log_json TEXT,
        period_close_date TEXT,
        period_close_price REAL,
        final_exit_date TEXT,
        final_exit_price REAL,
        trade_status TEXT,
        gross_return_pct REAL,
        net_return_pct REAL,
        holding_days INTEGER,
        mfe_pct REAL,
        mae_pct REAL,
        rules_passed_summary TEXT
      );

-- [TABLE] rights_subscriptions
CREATE TABLE rights_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ca_id INTEGER NOT NULL,
      portfolio TEXT NOT NULL,
      subscribed_qty REAL NOT NULL,
      renounced INTEGER DEFAULT 0,
      rights_price REAL NOT NULL,
      total_paid REAL NOT NULL,
      decided_at TEXT NOT NULL,
      FOREIGN KEY(ca_id) REFERENCES CorporateActions(id)
    );

-- [TABLE] signal_outcomes
CREATE TABLE signal_outcomes (
      signal_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      category TEXT NOT NULL,
      stated_confidence TEXT NOT NULL,
      stated_probability REAL NOT NULL,
      recommendation_date TEXT NOT NULL,
      resolution_date TEXT,
      outcome TEXT NOT NULL DEFAULT 'PENDING',
      actual_return_pct REAL,
      created_at TEXT NOT NULL
    );

-- [TABLE] social_sentiment_daily
CREATE TABLE social_sentiment_daily (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      mention_count INTEGER NOT NULL DEFAULT 0,
      positive_pct REAL NOT NULL DEFAULT 0,
      negative_pct REAL NOT NULL DEFAULT 0,
      manipulation_risk TEXT NOT NULL, -- 'LOW' | 'MEDIUM' | 'HIGH'
      score_used_in_fusion BOOLEAN NOT NULL DEFAULT 1,
      PRIMARY KEY (symbol, date)
    );

-- [TABLE] source_adapter_runs
CREATE TABLE source_adapter_runs (
      run_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      started_at_utc TEXT NOT NULL,
      completed_at_utc TEXT,
      records_ingested INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      error_detail TEXT,
      FOREIGN KEY(source_id) REFERENCES data_sources(source_id)
    );

-- [TABLE] stop_loss_alerts
CREATE TABLE stop_loss_alerts (
      id TEXT PRIMARY KEY,
      holding_id TEXT,
      symbol TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      stop_loss_price REAL NOT NULL,
      ltp_at_breach REAL NOT NULL,
      breached_at TEXT NOT NULL,
      acknowledged_at TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
    );

-- [TABLE] strategy_comparison_sessions
CREATE TABLE strategy_comparison_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            strategy_ids_json TEXT NOT NULL,
            universe_symbols_json TEXT,
            backtest_start_date TEXT,
            backtest_end_date TEXT,
            regime TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] strategy_run_results
CREATE TABLE strategy_run_results (
            id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            run_date TEXT NOT NULL,
            regime TEXT,
            entry_date TEXT,
            entry_price REAL,
            exit_date TEXT,
            exit_price REAL,
            status TEXT DEFAULT 'OPEN',
            return_pct REAL,
            holding_days INTEGER,
            mfe_pct REAL,
            mae_pct REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (strategy_id) REFERENCES CustomStrategies(id)
          );

-- [TABLE] strategy_scan_cache
CREATE TABLE "strategy_scan_cache"(
  id TEXT,
  scan_id TEXT,
  strategy_id TEXT,
  symbol TEXT,
  qualified NUM,
  entry_price REAL,
  target1 REAL,
  target2 REAL,
  stop_loss REAL,
  rr_ratio REAL,
  confidence_pct REAL,
  rule_checks_json TEXT,
  scan_date TEXT,
  created_at NUM
);

-- [TABLE] strategy_scan_metadata
CREATE TABLE strategy_scan_metadata (
            id TEXT PRIMARY KEY,
            scan_id TEXT UNIQUE NOT NULL,
            strategy_ids_json TEXT,
            universe_count INTEGER,
            stocks_qualified_total INTEGER,
            scan_started_at DATETIME,
            scan_completed_at DATETIME,
            duration_seconds INTEGER,
            status TEXT DEFAULT 'COMPLETE',
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

-- [TABLE] sunrise_industrial_universe
CREATE TABLE sunrise_industrial_universe (
          symbol TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          isin TEXT NOT NULL UNIQUE,
          vertical_code TEXT NOT NULL,
          vertical_name TEXT NOT NULL,
          pli_scheme_id TEXT,
          pli_tier INTEGER CHECK(pli_tier IN (1, 2, 3)),
          industrial_group_id TEXT,
          industrial_group_name TEXT NOT NULL,
          group_vintage_years INTEGER NOT NULL,
          backing_modality TEXT NOT NULL,
          market_cap_cr REAL NOT NULL,
          market_cap_tier TEXT NOT NULL,
          current_price REAL NOT NULL,
          turnover_cagr_3y_pct REAL NOT NULL,
          ebitda_cagr_3y_pct REAL NOT NULL,
          operating_leverage_ratio REAL NOT NULL,
          cfo_to_ebitda_ratio REAL NOT NULL,
          promoter_holding_pct REAL NOT NULL,
          fii_holding_pct REAL NOT NULL,
          dii_holding_pct REAL NOT NULL,
          free_retail_float_pct REAL NOT NULL,
          promoter_pledge_pct REAL NOT NULL DEFAULT 0.0,
          peg_ratio REAL NOT NULL,
          roce_pct REAL NOT NULL,
          order_book_cr REAL,
          order_book_multiple REAL,
          composite_shg_score REAL NOT NULL,
          conviction_tier TEXT NOT NULL,
          catalysts_summary TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_evaluated_at TEXT NOT NULL
        );

-- [TABLE] tier_calibration_ledger
CREATE TABLE tier_calibration_ledger (
            id TEXT PRIMARY KEY,
            tier_or_preset_id TEXT NOT NULL,
            weight_blend TEXT NOT NULL,
            backtest_window_start TEXT NOT NULL,
            backtest_window_end TEXT NOT NULL,
            n_signals INTEGER NOT NULL,
            hit_rate REAL NOT NULL,
            hit_rate_ci_low REAL NOT NULL,
            hit_rate_ci_high REAL NOT NULL,
            validated_out_of_sample INTEGER NOT NULL DEFAULT 0,
            last_recalibrated TEXT NOT NULL
          , regime TEXT DEFAULT 'ALL_REGIMES');

-- [TABLE] tier_membership_history
CREATE TABLE tier_membership_history (
            id TEXT PRIMARY KEY,
            tier TEXT NOT NULL,
            symbol TEXT NOT NULL,
            event_type TEXT NOT NULL,
            score REAL NOT NULL,
            consecutive_cycles INTEGER NOT NULL DEFAULT 1,
            recorded_at TEXT NOT NULL
          );

-- [TABLE] trading_calendar
CREATE TABLE trading_calendar (
      date           TEXT PRIMARY KEY,
      market         TEXT NOT NULL DEFAULT 'NSE',
      is_trading_day INTEGER NOT NULL,
      session_type   TEXT NOT NULL DEFAULT 'FULL',
      holiday_name   TEXT,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- [TABLE] unified_conviction_scores
CREATE TABLE unified_conviction_scores (
      symbol TEXT PRIMARY KEY,
      as_of_date TEXT NOT NULL,
      conviction_score REAL NOT NULL,
      is_recommendation BOOLEAN NOT NULL,
      components_breakdown TEXT NOT NULL,
      hard_circuit_breaker_active BOOLEAN NOT NULL DEFAULT 0,
      zero_size_reason TEXT,
      max_kelly_fraction REAL,
      created_at TEXT NOT NULL
    );

-- [TABLE] yt_knowledge_claims
CREATE TABLE yt_knowledge_claims (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            channel TEXT,
            claim_text TEXT NOT NULL,
            claim_type TEXT,
            is_consensus INTEGER DEFAULT 0,
            consensus_level TEXT,
            provenance_tag TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          );

-- [TABLE] yt_knowledge_debates
CREATE TABLE yt_knowledge_debates (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            topic_aspect TEXT NOT NULL,
            thesis_claim TEXT NOT NULL,
            thesis_channel TEXT,
            thesis_video_id TEXT,
            antithesis_claim TEXT NOT NULL,
            antithesis_channel TEXT,
            antithesis_video_id TEXT,
            neutrality_guidance TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          );

-- [TABLE] yt_knowledge_feature_proposals
CREATE TABLE yt_knowledge_feature_proposals (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            feature_name TEXT NOT NULL,
            category TEXT,
            derived_from TEXT,
            source_channel TEXT,
            source_video_id TEXT,
            implementation_blueprint TEXT,
            status TEXT DEFAULT 'PROPOSED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          );

-- [TABLE] yt_knowledge_segments
CREATE TABLE yt_knowledge_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            segment_text TEXT,
            translated_text TEXT,
            language TEXT,
            sha256 TEXT,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          );

-- [TABLE] yt_knowledge_sessions
CREATE TABLE yt_knowledge_sessions (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            category TEXT,
            matched_node_id TEXT,
            target_video_count INTEGER DEFAULT 25,
            synonyms_json TEXT,
            expanded_queries_json TEXT,
            status TEXT DEFAULT 'PENDING',
            progress_pct REAL DEFAULT 0.0,
            status_message TEXT,
            synthesis_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
          );

-- [TABLE] yt_knowledge_videos
CREATE TABLE yt_knowledge_videos (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT,
            channel TEXT,
            duration_s INTEGER,
            view_count INTEGER,
            upload_date TEXT,
            query_origin TEXT,
            source TEXT,
            transcript_sha256 TEXT,
            transcript_text TEXT,
            language TEXT DEFAULT 'en',
            bias_signals_json TEXT,
            bias_count INTEGER DEFAULT 0,
            audio_retained INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          );

-- [INDEX] idx_action_history_time
CREATE INDEX idx_action_history_time ON ActionHistory(timestamp);

-- [INDEX] idx_action_history_type
CREATE INDEX idx_action_history_type ON ActionHistory(action_type);

-- [INDEX] idx_app_changelog_time
CREATE INDEX idx_app_changelog_time ON AppChangeLogs(timestamp);

-- [INDEX] idx_assertions_scrip
CREATE INDEX idx_assertions_scrip ON ForensicAssertions(scripId, field);

-- [INDEX] idx_audit_status
CREATE INDEX idx_audit_status ON DataQualityAuditLedger(integrity_status);

-- [INDEX] idx_audit_symbol
CREATE INDEX idx_audit_symbol ON DataQualityAuditLedger(symbol);

-- [INDEX] idx_backtest_strategy
CREATE INDEX idx_backtest_strategy ON CustomStrategyBacktests(strategy_id);

-- [INDEX] idx_bank_currency
CREATE INDEX idx_bank_currency ON BankAccountsAndFDs(currency);

-- [INDEX] idx_bank_maturity
CREATE INDEX idx_bank_maturity ON BankAccountsAndFDs(maturity_date);

-- [INDEX] idx_bank_portfolio
CREATE INDEX idx_bank_portfolio ON BankAccountsAndFDs(portfolio);

-- [INDEX] idx_bench_cache
CREATE INDEX idx_bench_cache ON BenchmarkCashFlowCache(portfolio, benchmark_symbol, date);

-- [INDEX] idx_bench_cache_sym_date
CREATE INDEX idx_bench_cache_sym_date ON BenchmarkCashFlowCache(benchmark_symbol, date);

-- [INDEX] idx_bhavcopy_date
CREATE INDEX idx_bhavcopy_date ON NseBhavcopy(trade_date);

-- [INDEX] idx_bhavcopy_deliv
CREATE INDEX idx_bhavcopy_deliv ON NseBhavcopy(deliv_per);

-- [INDEX] idx_bhavcopy_sym_date
CREATE INDEX idx_bhavcopy_sym_date ON NseBhavcopy(symbol, trade_date);

-- [INDEX] idx_brier_signal_name
CREATE INDEX idx_brier_signal_name ON SignalBrierScoreLog(signal_name);

-- [INDEX] idx_ca_action_type
CREATE INDEX idx_ca_action_type ON CorporateActions(action_type);

-- [INDEX] idx_ca_applied
CREATE INDEX idx_ca_applied ON CorporateActions(applied);

-- [INDEX] idx_ca_audit_port_date
CREATE INDEX idx_ca_audit_port_date ON CorporateActionAudit(portfolio, date);

-- [INDEX] idx_ca_audit_sym
CREATE INDEX idx_ca_audit_sym ON CorporateActionAudit(symbol);

-- [INDEX] idx_ca_isin_date
CREATE INDEX idx_ca_isin_date ON CorporateActions(isin, record_date);

-- [INDEX] idx_ca_isin_recdate
CREATE INDEX idx_ca_isin_recdate ON CorporateActions(isin, record_date);

-- [INDEX] idx_ca_sym_date
CREATE INDEX idx_ca_sym_date ON CorporateActions(symbol, record_date);

-- [INDEX] idx_ca_symbol
CREATE INDEX idx_ca_symbol ON CorporateActions(symbol);

-- [INDEX] idx_cams_conf_port
CREATE INDEX idx_cams_conf_port ON CamsConfigurations(portfolio_name);

-- [INDEX] idx_cams_port_isin
CREATE INDEX idx_cams_port_isin ON CamsSummaryHoldings(portfolio, isin);

-- [INDEX] idx_cfl_pan_fy
CREATE INDEX idx_cfl_pan_fy ON CarriedForwardLosses(pan, financial_year);

-- [INDEX] idx_cfl_port_fy
CREATE INDEX idx_cfl_port_fy ON CarriedForwardLosses(portfolio, financial_year);

-- [INDEX] idx_claims_symbol
CREATE INDEX idx_claims_symbol ON ManagementClaims(symbol);

-- [INDEX] idx_contradictions_symbol
CREATE INDEX idx_contradictions_symbol ON Contradictions(symbol);

-- [INDEX] idx_corporate_actions_isin
CREATE INDEX idx_corporate_actions_isin ON CorporateActions(isin);

-- [INDEX] idx_currency_rates_curr
CREATE INDEX idx_currency_rates_curr ON CurrencyRates(currency);

-- [INDEX] idx_daily_ohlcv_date
CREATE INDEX idx_daily_ohlcv_date ON DailyOHLCV(trade_date);

-- [INDEX] idx_daily_ohlcv_source
CREATE INDEX idx_daily_ohlcv_source ON DailyOHLCV(data_source);

-- [INDEX] idx_daily_ohlcv_sym
CREATE INDEX idx_daily_ohlcv_sym ON DailyOHLCV(symbol, trade_date);

-- [INDEX] idx_daily_ohlcv_sym_date
CREATE INDEX idx_daily_ohlcv_sym_date ON DailyOHLCV(symbol, trade_date ASC);

-- [INDEX] idx_daily_ohlcv_symbol
CREATE INDEX idx_daily_ohlcv_symbol ON DailyOHLCV(symbol);

-- [INDEX] idx_dash_disk_cache_key
CREATE INDEX idx_dash_disk_cache_key ON DashboardDiskCache(cache_key);

-- [INDEX] idx_dps_date_port
CREATE INDEX idx_dps_date_port ON DailyPortfolioSnapshot(date, portfolio);

-- [INDEX] idx_dps_port
CREATE INDEX idx_dps_port ON DailyPortfolioSnapshot(portfolio);

-- [INDEX] idx_dq_audit_quarter
CREATE INDEX idx_dq_audit_quarter ON DataQualityAuditLedger(as_of_quarter);

-- [INDEX] idx_dq_audit_status
CREATE INDEX idx_dq_audit_status ON DataQualityAuditLedger(integrity_status);

-- [INDEX] idx_dq_audit_symbol
CREATE INDEX idx_dq_audit_symbol ON DataQualityAuditLedger(symbol);

-- [INDEX] idx_dqi_symbol
CREATE INDEX idx_dqi_symbol ON DataQualityIssues(symbol);

-- [INDEX] idx_dqi_type
CREATE INDEX idx_dqi_type ON DataQualityIssues(issue_type);

-- [INDEX] idx_ds_drift_metric
CREATE INDEX idx_ds_drift_metric ON DataSyncDriftLedger(metric_name);

-- [INDEX] idx_ds_drift_status
CREATE INDEX idx_ds_drift_status ON DataSyncDriftLedger(sync_status);

-- [INDEX] idx_ds_drift_symbol
CREATE INDEX idx_ds_drift_symbol ON DataSyncDriftLedger(symbol);

-- [INDEX] idx_events_symbol
CREATE INDEX idx_events_symbol ON IntelligenceEvents(symbol);

-- [INDEX] idx_family_members_active
CREATE INDEX idx_family_members_active ON FamilyMembers(is_active);

-- [INDEX] idx_family_members_role
CREATE INDEX idx_family_members_role ON FamilyMembers(role);

-- [INDEX] idx_fema_fy
CREATE INDEX idx_fema_fy ON FemaRepatriationLedger(financial_year);

-- [INDEX] idx_fere_tier
CREATE INDEX idx_fere_tier ON FEREEnrichedLedger(enriched_tier);

-- [INDEX] idx_fere_verdict
CREATE INDEX idx_fere_verdict ON FEREEnrichedLedger(fere_verdict);

-- [INDEX] idx_fill_reg_hash
CREATE INDEX idx_fill_reg_hash ON fill_registry(fill_hash);

-- [INDEX] idx_fill_reg_order
CREATE INDEX idx_fill_reg_order ON fill_registry(order_id, trade_date, isin);

-- [INDEX] idx_forensic_cache_sym_period
CREATE INDEX idx_forensic_cache_sym_period ON ForensicExtractionCache (symbol, period);

-- [INDEX] idx_fund_snap_sym
CREATE INDEX idx_fund_snap_sym ON FundamentalSnapshots(symbol, fetched_at DESC);

-- [INDEX] idx_fundamental_symbol
CREATE INDEX idx_fundamental_symbol ON FundamentalData(symbol);

-- [INDEX] idx_fundamentals_sym_date
CREATE INDEX idx_fundamentals_sym_date ON FundamentalsSnapshot(symbol, as_of_date DESC);

-- [INDEX] idx_hist_fin_stmt
CREATE INDEX idx_hist_fin_stmt ON HistoricalFinancialStatements(symbol, statement_type);

-- [INDEX] idx_hist_fin_sym
CREATE INDEX idx_hist_fin_sym ON HistoricalFinancialStatements(symbol);

-- [INDEX] idx_hist_prices_date
CREATE INDEX idx_hist_prices_date ON HistoricalPrices(date);

-- [INDEX] idx_hist_prices_sym_date
CREATE INDEX idx_hist_prices_sym_date ON HistoricalPrices(symbol, date);

-- [INDEX] idx_hist_shp_sym
CREATE INDEX idx_hist_shp_sym ON HistoricalShareholdingPattern(symbol);

-- [INDEX] idx_hist_symbol
CREATE INDEX idx_hist_symbol     ON HistoricalPrices(symbol, date);

-- [INDEX] idx_historical_prices_sym_date
CREATE INDEX idx_historical_prices_sym_date ON HistoricalPrices(symbol, date DESC);

-- [INDEX] idx_history_date_port
CREATE INDEX idx_history_date_port ON PortfolioHistory(date, portfolio);

-- [INDEX] idx_holdings_data_status
CREATE INDEX idx_holdings_data_status ON Holdings(data_status);

-- [INDEX] idx_holdings_folio
CREATE INDEX idx_holdings_folio ON Holdings(folio);

-- [INDEX] idx_holdings_holding_type
CREATE INDEX idx_holdings_holding_type ON Holdings(holding_type);

-- [INDEX] idx_holdings_isin
CREATE INDEX idx_holdings_isin   ON Holdings(isin);

-- [INDEX] idx_holdings_port
CREATE INDEX idx_holdings_port   ON Holdings(portfolio);

-- [INDEX] idx_holdings_port_isin
CREATE INDEX idx_holdings_port_isin ON Holdings(portfolio, isin);

-- [INDEX] idx_holdings_port_symbol
CREATE INDEX idx_holdings_port_symbol ON Holdings(portfolio, symbol);

-- [INDEX] idx_holdings_port_type
CREATE INDEX idx_holdings_port_type ON Holdings(portfolio, holding_type);

-- [INDEX] idx_holdings_price_authority
CREATE INDEX idx_holdings_price_authority ON Holdings(price_authority);

-- [INDEX] idx_holdings_symbol
CREATE INDEX idx_holdings_symbol ON Holdings(symbol);

-- [INDEX] idx_index_ohlcv_symbol
CREATE INDEX idx_index_ohlcv_symbol ON IndexOHLCV(index_symbol);

-- [INDEX] idx_inst_deals_client
CREATE INDEX idx_inst_deals_client ON InstitutionalDeals(client_name);

-- [INDEX] idx_inst_deals_date
CREATE INDEX idx_inst_deals_date ON InstitutionalDeals(deal_date);

-- [INDEX] idx_inst_deals_sym
CREATE INDEX idx_inst_deals_sym ON InstitutionalDeals(symbol);

-- [INDEX] idx_intraday_lookup
CREATE INDEX idx_intraday_lookup 
      ON IntradayOHLCV(symbol, timeframe, timestamp);

-- [INDEX] idx_intraday_symbol_date
CREATE INDEX idx_intraday_symbol_date ON IntradayCandles(symbol, candle_time);

-- [INDEX] idx_inventory_result
CREATE INDEX idx_inventory_result ON EvidenceInventory(result);

-- [INDEX] idx_master_exchange
CREATE INDEX idx_master_exchange ON MasterTickers(exchange);

-- [INDEX] idx_master_isin
CREATE INDEX idx_master_isin ON MasterTickers(isin);

-- [INDEX] idx_master_isin_symbol
CREATE INDEX idx_master_isin_symbol ON MasterTickers(isin, symbol);

-- [INDEX] idx_master_sector
CREATE INDEX idx_master_sector ON MasterTickers(sector);

-- [INDEX] idx_master_symbol
CREATE INDEX idx_master_symbol ON MasterTickers(symbol);

-- [INDEX] idx_mf_nav_code
CREATE INDEX idx_mf_nav_code ON MfNavHistory(scheme_code);

-- [INDEX] idx_mpp_member_port
CREATE INDEX idx_mpp_member_port ON MemberPortfolioPermissions(member_id, portfolio_name);

-- [INDEX] idx_mt_isin
CREATE INDEX idx_mt_isin         ON MasterTickers(isin);

-- [INDEX] idx_mt_symbol
CREATE INDEX idx_mt_symbol       ON MasterTickers(symbol);

-- [INDEX] idx_nri_account_port
CREATE INDEX idx_nri_account_port ON AccountProfiles(portfolio_name);

-- [INDEX] idx_nri_tds_port_date
CREATE INDEX idx_nri_tds_port_date ON NriTdsTransactions(portfolio, date);

-- [INDEX] idx_opp_eval_category
CREATE INDEX idx_opp_eval_category ON OpportunityScripEvaluations(market_cap_category);

-- [INDEX] idx_opp_eval_score
CREATE INDEX idx_opp_eval_score ON OpportunityScripEvaluations(convergence_score DESC);

-- [INDEX] idx_opp_eval_updated
CREATE INDEX idx_opp_eval_updated ON OpportunityScripEvaluations(last_updated_at DESC);

-- [INDEX] idx_options_symbol_date
CREATE INDEX idx_options_symbol_date ON options_chain_snapshot(symbol, as_of_date);

-- [INDEX] idx_ph_port_date
CREATE INDEX idx_ph_port_date ON PortfolioHistory(portfolio, date);

-- [INDEX] idx_pms_base_port
CREATE INDEX idx_pms_base_port ON PmsReconciliationBaseline(portfolio);

-- [INDEX] idx_pms_sum_port_isin
CREATE INDEX idx_pms_sum_port_isin ON PmsSummaryHoldings(portfolio, isin);

-- [INDEX] idx_portfolios_member
CREATE INDEX idx_portfolios_member ON Portfolios(member_id);

-- [INDEX] idx_portfolios_name
CREATE INDEX idx_portfolios_name ON Portfolios(name);

-- [INDEX] idx_portfolios_pan
CREATE INDEX idx_portfolios_pan ON Portfolios(pan);

-- [INDEX] idx_portfolios_status
CREATE INDEX idx_portfolios_status ON Portfolios(status);

-- [INDEX] idx_portfolios_type
CREATE INDEX idx_portfolios_type ON Portfolios(type);

-- [INDEX] idx_realized_gains_isin
CREATE INDEX idx_realized_gains_isin ON RealizedGains(isin);

-- [INDEX] idx_realized_gains_port
CREATE INDEX idx_realized_gains_port ON RealizedGains(portfolio);

-- [INDEX] idx_recon_holdings_port
CREATE INDEX idx_recon_holdings_port ON ReconciledHoldings(portfolio, isin);

-- [INDEX] idx_rg_isin
CREATE INDEX idx_rg_isin ON RealizedGains(isin);

-- [INDEX] idx_rg_port_isin
CREATE INDEX idx_rg_port_isin ON RealizedGains(portfolio, isin, symbol);

-- [INDEX] idx_rg_port_sell_date
CREATE INDEX idx_rg_port_sell_date ON RealizedGains(portfolio, sell_date);

-- [INDEX] idx_rg_sell_date
CREATE INDEX idx_rg_sell_date ON RealizedGains(sell_date);

-- [INDEX] idx_rg_symbol
CREATE INDEX idx_rg_symbol ON RealizedGains(symbol);

-- [INDEX] idx_scan_cache_scan_id
CREATE INDEX idx_scan_cache_scan_id ON strategy_scan_cache(scan_id);

-- [INDEX] idx_scan_cache_strategy_id
CREATE INDEX idx_scan_cache_strategy_id ON strategy_scan_cache(strategy_id);

-- [INDEX] idx_scan_cache_symbol
CREATE INDEX idx_scan_cache_symbol ON strategy_scan_cache(symbol);

-- [INDEX] idx_scan_metadata_created_at
CREATE INDEX idx_scan_metadata_created_at ON strategy_scan_metadata(created_at DESC);

-- [INDEX] idx_scan_metadata_scan_id
CREATE INDEX idx_scan_metadata_scan_id ON strategy_scan_metadata(scan_id);

-- [INDEX] idx_scan_metadata_status
CREATE INDEX idx_scan_metadata_status ON strategy_scan_metadata(status);

-- [INDEX] idx_scrip_isin
CREATE INDEX idx_scrip_isin ON AssetScripMappings(isin);

-- [INDEX] idx_scrip_raw
CREATE INDEX idx_scrip_raw ON AssetScripMappings(raw_symbol);

-- [INDEX] idx_sd_pan_fy
CREATE INDEX idx_sd_pan_fy ON StrippingDisallowances(pan, trigger_sell_date);

-- [INDEX] idx_shg_group
CREATE INDEX idx_shg_group ON sunrise_industrial_universe(industrial_group_id);

-- [INDEX] idx_shg_score
CREATE INDEX idx_shg_score ON sunrise_industrial_universe(composite_shg_score DESC);

-- [INDEX] idx_shg_vertical
CREATE INDEX idx_shg_vertical ON sunrise_industrial_universe(vertical_code);

-- [INDEX] idx_sold_reg_port
CREATE INDEX idx_sold_reg_port ON SoldStockRegistry(portfolio, isin);

-- [INDEX] idx_statutory_hash
CREATE INDEX idx_statutory_hash ON StatutoryEvents(contentHash);

-- [INDEX] idx_statutory_scrip
CREATE INDEX idx_statutory_scrip ON StatutoryEvents(scripCode);

-- [INDEX] idx_strat_cache_lookup
CREATE INDEX idx_strat_cache_lookup ON strategy_scan_cache(scan_id, strategy_id);

-- [INDEX] idx_strategy_run_strategy_id
CREATE INDEX idx_strategy_run_strategy_id ON strategy_run_results(strategy_id);

-- [INDEX] idx_strategy_run_symbol_date
CREATE INDEX idx_strategy_run_symbol_date ON strategy_run_results(symbol, run_date);

-- [INDEX] idx_sync_drift_status
CREATE INDEX idx_sync_drift_status ON DataSyncDriftLedger(sync_status);

-- [INDEX] idx_sync_drift_symbol
CREATE INDEX idx_sync_drift_symbol ON DataSyncDriftLedger(symbol);

-- [INDEX] idx_target_alloc_model
CREATE INDEX idx_target_alloc_model ON TargetAllocations(model_name);

-- [INDEX] idx_tax_summary_port_fy
CREATE INDEX idx_tax_summary_port_fy ON TaxSummary(portfolio, financial_year);

-- [INDEX] idx_theses_symbol
CREATE INDEX idx_theses_symbol ON CompanyTheses(symbol);

-- [INDEX] idx_tx_batch_id
CREATE INDEX idx_tx_batch_id ON Transactions(batch_id);

-- [INDEX] idx_tx_date
CREATE INDEX idx_tx_date ON Transactions(date);

-- [INDEX] idx_tx_folio
CREATE INDEX idx_tx_folio ON Transactions(folio);

-- [INDEX] idx_tx_is_cash_flow
CREATE INDEX idx_tx_is_cash_flow ON Transactions(is_cash_flow);

-- [INDEX] idx_tx_isin
CREATE INDEX idx_tx_isin ON Transactions(isin);

-- [INDEX] idx_tx_port_sym_date
CREATE INDEX idx_tx_port_sym_date ON Transactions(portfolio, symbol, date);

-- [INDEX] idx_tx_portfolio_date
CREATE INDEX idx_tx_portfolio_date ON Transactions(portfolio, date);

-- [INDEX] idx_tx_source
CREATE INDEX idx_tx_source ON Transactions(source);

-- [INDEX] idx_tx_symbol
CREATE INDEX idx_tx_symbol ON Transactions(symbol);

-- [INDEX] idx_tx_type
CREATE INDEX idx_tx_type ON Transactions(type);

-- [INDEX] idx_txn_isin
CREATE INDEX idx_txn_isin        ON Transactions(isin, portfolio);

-- [INDEX] idx_txn_port_isin_date
CREATE INDEX idx_txn_port_isin_date ON Transactions(portfolio, isin, date);

-- [INDEX] idx_txn_portfolio
CREATE INDEX idx_txn_portfolio   ON Transactions(portfolio);

-- [INDEX] idx_txn_symbol
CREATE INDEX idx_txn_symbol      ON Transactions(symbol, portfolio);

-- [INDEX] idx_txn_type_port
CREATE INDEX idx_txn_type_port ON Transactions(type, portfolio);

-- [INDEX] idx_txns_port_isin_date
CREATE INDEX idx_txns_port_isin_date ON Transactions(portfolio, isin, date);

-- [INDEX] idx_txns_symbol
CREATE INDEX idx_txns_symbol ON Transactions(symbol);

-- [INDEX] idx_val_snap_port_time
CREATE INDEX idx_val_snap_port_time ON ValuationSnapshots(portfolio, timestamp);

-- [TRIGGER] prevent_audit_ledger_delete
CREATE TRIGGER prevent_audit_ledger_delete
    BEFORE DELETE ON audit_ledger
    BEGIN
      SELECT RAISE(ABORT, 'audit_ledger is append-only: deletions are prohibited');
    END;

-- [TRIGGER] prevent_audit_ledger_update
CREATE TRIGGER prevent_audit_ledger_update
    BEFORE UPDATE ON audit_ledger
    BEGIN
      SELECT RAISE(ABORT, 'audit_ledger is append-only: updates are prohibited');
    END;

