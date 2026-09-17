-- ====================================================================
-- WEALTHOS / ITAS v6.3: DATABASE SCHEMA AND SAMPLE RECORDS EXPORT
-- Exported At: 2026-09-17T10:28:52.391Z
-- Database: portfolio_v6.3_research_subset.db
-- ====================================================================

-- Table: CorporateActions (Total Rows: 1035)
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
      notes TEXT,
      created_at TEXT,
      batch_id TEXT,
      applied_batch_id TEXT,
      updated_at TEXT,
      conflict_flag INTEGER DEFAULT 0,
      conflicting_sources TEXT,
      rights_ratio REAL,
      rights_price REAL,
      subscription_deadline TEXT
    );

-- Sample Records for CorporateActions (10 rows):
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (1, NULL, '2008-09-12', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.3', 0, 0, 0.3, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (2, NULL, '2009-02-18', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.4', 0, 0, 0.4, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (3, NULL, '2009-08-17', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.2', 0, 0, 0.2, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (4, NULL, '2010-02-03', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.5', 0, 0, 0.5, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (5, NULL, '2010-08-09', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.3', 0, 0, 0.3, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (6, NULL, '2011-02-14', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.5', 0, 0, 0.5, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (7, NULL, '2011-05-05', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.4', 0, 0, 0.4, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (8, NULL, '2012-02-13', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.3', 0, 0, 0.3, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (9, NULL, '2012-07-30', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹0.7', 0, 0, 0.7, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);
INSERT INTO CorporateActions (id, ex_date, record_date, isin, symbol, action_type, details, numerator, denominator, dividend_per_share, old_face_value, new_face_value, source, applied, applied_date, notes, created_at, batch_id, applied_batch_id, updated_at, conflict_flag, conflicting_sources, rights_ratio, rights_price, subscription_deadline) VALUES (10, NULL, '2013-07-30', 'INE742F01042', 'ADANIPORTS', 'DIVIDEND', 'Dividend ₹1', 0, 0, 1, NULL, NULL, 'Yahoo Finance', 1, '2026-07-21 17:10:29', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL);

-- Table: DailyOHLCV (Total Rows: 105243)
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

-- Sample Records for DailyOHLCV (10 rows):
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('3MINDIA', '2025-10-22', 29940, 29940, 29710, 29790, 453, 13504000, 335, 73.95, 232, 29675, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('3MINDIA', '2025-11-05', 33060, 36480, 32610, 35885, 222196, 7889520000, 49453, 22.26, 68293, 30700, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('3MINDIA', '2025-12-25', 35010, 35370, 34400, 34575, 1768, 61533000.00000001, 938, 53.05, 1150, 35010, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('ADANIENT', '2025-10-22', 2554.9, 2562, 2542.3, 2549.9, 101019, 257863000, 44048, 43.61, 5843, 2548.1, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('ADANIENT', '2025-11-05', 2479.8, 2488.9, 2390.6, 2419.8, 2072668, 5043563000, 424988, 20.5, 77117, 2467, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('ADANIENT', '2025-12-25', 2250, 2258.8, 2217.4, 2222.7, 825693, 1847903000, 394423, 47.77, 27346, 2248.8, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('ADANIPORTS', '2025-10-22', 1477, 1481.5, 1470, 1473.5, 394024, 581643000, 236777, 60.11, 14070, 1467, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('ADANIPORTS', '2025-11-05', 1449.6, 1466.3, 1432, 1444.4, 3554714, 5148322000, 1115999, 31.39, 107189, 1444.7, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('ADANIPORTS', '2025-12-25', 1503, 1507.2, 1492, 1494.3, 1318023, 1979270000, 637794, 48.39, 43520, 1493.6, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');
INSERT INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, no_of_trades, prev_close, data_source, created_at) VALUES ('ADANIPOWER', '2025-10-22', 171.5, 174.39, 168, 170.78, 26425161, 4547727000, 8243436, 31.2, 152776, 170.3, 'NSE_BHAVCOPY', '2026-09-17 06:18:29');

-- Table: FEREEnrichedLedger (Total Rows: 60)
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

-- Sample Records for FEREEnrichedLedger (10 rows):
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('3MINDIA', '3MINDIA Limited', 'TIER_6_MICRO_CAP_SME', 789750, 31590, 32, 21.5, 0.28, 0, -2.03, 'CLEAN_NON_MANIPULATOR', 7.19, 'SAFE', 9, -0.85, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_6_MICRO_CAP_SME', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('ADANIENT', 'ADANIENT Limited', 'TIER_1_MOST_TRADED', 73215, 2928.6, 32, 21.5, 0.28, 0, -2.03, 'CLEAN_NON_MANIPULATOR', 7.19, 'SAFE', 9, -0.85, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('ADANIPORTS', 'ADANIPORTS Limited', 'TIER_1_MOST_TRADED', 42845, 1713.8, 32, 21.5, 0.28, 0, -2.03, 'CLEAN_NON_MANIPULATOR', 7.19, 'SAFE', 9, -0.85, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('ADANIPOWER', 'ADANIPOWER Limited', 'TIER_1_MOST_TRADED', 5050, 202, 22.5, 21.5, 0.28, 0, -2.04, 'CLEAN_NON_MANIPULATOR', 7.29, 'SAFE', 9, -1.22, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('AXISBANK', 'AXISBANK Limited', 'TIER_1_MOST_TRADED', 30573, 1222.9, 32, 21.5, 0.28, 0, -2.03, 'CLEAN_NON_MANIPULATOR', 7.19, 'SAFE', 9, -0.85, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('BANCOINDIA', 'BANCOINDIA Limited', 'TIER_6_MICRO_CAP_SME', 14691, 587.65, 22.5, 21.5, 0.28, 0, -2.04, 'CLEAN_NON_MANIPULATOR', 7.3, 'SAFE', 9, -1.21, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_6_MICRO_CAP_SME', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('BANKBARODA', 'BANKBARODA Limited', 'TIER_1_MOST_TRADED', 5818, 232.7, 22.5, 21.5, 0.28, 0, -2.04, 'CLEAN_NON_MANIPULATOR', 7.3, 'SAFE', 9, -1.21, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('BEL', 'BEL Limited', 'TIER_1_MOST_TRADED', 9573, 382.9, 22.5, 21.5, 0.28, 0, -2.04, 'CLEAN_NON_MANIPULATOR', 7.3, 'SAFE', 9, -1.21, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('BHARTIARTL', 'BHARTIARTL Limited', 'TIER_1_MOST_TRADED', 45760, 1830.4, 32, 21.5, 0.28, 0, -2.03, 'CLEAN_NON_MANIPULATOR', 7.19, 'SAFE', 9, -0.85, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');
INSERT INTO FEREEnrichedLedger (symbol, company_name, category, market_cap_cr, cmp, pe_ratio, roce_pct, debt_to_equity, promoter_pledge_pct, beneish_m_score, beneish_flag, altman_z_score, altman_zone, piotroski_f_score, sloan_accrual_ratio, cash_conversion_cycle, dso, dio, dpo, cfo_to_ebitda_pct, composite_health_score, fere_verdict, enriched_tier, batch_number, enriched_at) VALUES ('BSE', 'BSE Limited', 'TIER_1_MOST_TRADED', 82750, 3310, 32, 21.5, 0.28, 0, -2.03, 'CLEAN_NON_MANIPULATOR', 7.19, 'SAFE', 9, -0.85, NULL, NULL, NULL, NULL, NULL, 87.3, 'STRONG_BUY', 'TIER_1_MOST_TRADED', NULL, '2026-09-17 06:18:30');

-- Table: HistoricalFinancialStatements (Total Rows: 213)
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

-- Sample Records for HistoricalFinancialStatements (10 rows):
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (1, '3MINDIA', 'QUARTERLY_PL', 'Jun 2021', NULL, NULL, NULL, 48, 6, NULL, NULL, NULL, NULL, NULL, 30, 26.72, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (2, '3MINDIA', 'QUARTERLY_PL', 'Sep 2021', NULL, NULL, NULL, 92, 11, NULL, NULL, NULL, NULL, NULL, 64, 57.01, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (3, '3MINDIA', 'QUARTERLY_PL', 'Dec 2021', NULL, NULL, NULL, 95, 12, NULL, NULL, NULL, NULL, NULL, 67, 59.24, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (4, '3MINDIA', 'QUARTERLY_PL', 'Mar 2022', NULL, NULL, NULL, 158, 17, NULL, NULL, NULL, NULL, NULL, 111, 98.46, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (5, '3MINDIA', 'QUARTERLY_PL', 'Jun 2022', NULL, NULL, NULL, 116, 12, NULL, NULL, NULL, NULL, NULL, 84, 74.8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (6, '3MINDIA', 'QUARTERLY_PL', 'Sep 2022', NULL, NULL, NULL, 123, 13, NULL, NULL, NULL, NULL, NULL, 106, 94.3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (7, '3MINDIA', 'QUARTERLY_PL', 'Dec 2022', NULL, NULL, NULL, 171, 17, NULL, NULL, NULL, NULL, NULL, 125, 110.79, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (8, '3MINDIA', 'QUARTERLY_PL', 'Mar 2023', NULL, NULL, NULL, 194, 19, NULL, NULL, NULL, NULL, NULL, 136, 120.48, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (9, '3MINDIA', 'QUARTERLY_PL', 'Jun 2023', NULL, NULL, NULL, 173, 16, NULL, NULL, NULL, NULL, NULL, 129, 114.7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalFinancialStatements (id, symbol, statement_type, period_label, period_date, sales_cr, expenses_cr, operating_profit_cr, opm_pct, other_income_cr, interest_cr, depreciation_cr, pbt_cr, tax_pct, net_profit_pat_cr, eps, equity_capital_cr, reserves_cr, borrowings_cr, other_liabilities_cr, total_liabilities_cr, fixed_assets_cr, cwip_cr, investments_cr, other_assets_cr, total_assets_cr, cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr, primary_source, secondary_source, is_reconciled, created_at) VALUES (10, '3MINDIA', 'QUARTERLY_PL', 'Sep 2023', NULL, NULL, NULL, 192, 18, NULL, NULL, NULL, NULL, NULL, 146, 129.7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'STATUTORY_EXCHANGE_RESULTS', NULL, 1, '2026-09-17 06:18:30');

-- Table: HistoricalShareholdingPattern (Total Rows: 56)
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

-- Sample Records for HistoricalShareholdingPattern (10 rows):
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (1, '3MINDIA', 'Sep 2023', NULL, 0, 0, 0, 0, 0, 0, 0, 0, 100, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (2, '3MINDIA', 'Dec 2023', NULL, 75, 3.56, 8.45, 0, 0, 12.98, 0, 99.99, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (3, '3MINDIA', 'Mar 2024', NULL, 75, 3.56, 8.52, 0, 0, 12.92, 0, 100, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (4, '3MINDIA', 'Jun 2024', NULL, 75, 3.64, 8.44, 0, 0, 12.92, 0, 100, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (5, '3MINDIA', 'Sep 2024', NULL, 75, 3.77, 8.27, 0, 0, 12.95, 0, 99.99, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (6, '3MINDIA', 'Dec 2024', NULL, 75, 4.07, 8.13, 0, 0, 12.8, 0, 100, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (7, '3MINDIA', 'Mar 2025', NULL, 75, 4.01, 8.16, 0, 0, 12.84, 0, 100.01, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (8, '3MINDIA', 'Jun 2025', NULL, 75, 3.78, 8.08, 0, 0, 13.13, 0, 99.99, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (9, '3MINDIA', 'Sep 2025', NULL, 75, 3.84, 8.1, 0, 0, 13.05, 0, 99.99, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');
INSERT INTO HistoricalShareholdingPattern (id, symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct, free_float_pct, primary_source, secondary_source, is_reconciled, created_at) VALUES (10, '3MINDIA', 'Dec 2025', NULL, 75, 3.43, 8.12, 0, 0, 13.44, 0, 99.99, 25, 'STATUTORY_XBRL_REG31', NULL, 1, '2026-09-17 06:18:30');

-- Table: IndexConstituents (Total Rows: 0)
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

-- Table: trading_calendar (Total Rows: 42)
CREATE TABLE trading_calendar (
      date TEXT PRIMARY KEY,
      market TEXT NOT NULL DEFAULT 'NSE',
      is_trading_day INTEGER NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'FULL',
      holiday_name TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- Sample Records for trading_calendar (10 rows):
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-04-14', 'NSE', 0, 'CLOSED', 'Dr. Ambedkar Jayanti', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-04-17', 'NSE', 0, 'CLOSED', 'Ram Navami', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-04-21', 'NSE', 0, 'CLOSED', 'Mahavir Jayanti', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-05-23', 'NSE', 0, 'CLOSED', 'Buddha Purnima', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-06-17', 'NSE', 0, 'CLOSED', 'Eid ul Adha', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-07-17', 'NSE', 0, 'CLOSED', 'Muharram', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-08-15', 'NSE', 0, 'CLOSED', 'Independence Day', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-10-02', 'NSE', 0, 'CLOSED', 'Mahatma Gandhi Jayanti', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-10-13', 'NSE', 0, 'CLOSED', 'Dussehra', '2026-09-17 06:18:30');
INSERT INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at) VALUES ('2024-11-01', 'NSE', 0, 'CLOSED', 'Diwali Laxmi Pujan', '2026-09-17 06:18:30');

