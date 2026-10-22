export const CONTRACT_VERSION = 'WEALTHOS_INSTITUTIONAL_29_V1';

const q = (id, phase, topic, question, config = {}) => ({
  id,
  phase,
  topic,
  question,
  targetWords: { min: 150, max: 250 },
  metrics: config.metrics || [],
  trendlyneViews: config.trendlyneViews || [],
  documentQueries: config.documentQueries || [],
  localDomains: config.localDomains || [],
  calculations: config.calculations || [],
  primarySources: config.primarySources || [],
  evidenceRules: config.evidenceRules || [],
});

export const RESEARCH_QUESTIONS = [
  q(1, 'Phase 1: Immediate Market Catalyst & Sentiment', 'Short-Term Market Drivers', 'What factors are driving the short-term bullish price action?', {
    trendlyneViews: ['technical', 'news', 'events', 'sast', 'bulblockdeal'], localDomains: ['ADJUSTED_OHLCV', 'EVENTS', 'DEALS'],
    calculations: ['return_1d_5d_20d', 'relative_return_vs_sector_index', 'volume_and_delivery_abnormality'], primarySources: ['NSE/BSE announcements', 'DuckDB adjusted OHLCV'],
  }),
  q(2, 'Phase 2: Business Model, Product Mechanics & Customer Base', 'Core Product Utility', 'What core products/services drive the majority of the order book and what real-world problem do they solve?', {
    documentQueries: ['products services segment revenue use cases order book'], localDomains: ['DOCUMENTS'], primarySources: ['Annual report', 'Investor presentation'],
  }),
  q(3, 'Phase 2: Business Model, Product Mechanics & Customer Base', 'Core Strengths & Competitive Advantage', 'What are the company’s fundamental prospects, primary strengths and sustainable competitive advantages?', {
    metrics: [['opm_pct', 'operating_margin_annual_pct'], ['roce_reported', 'roce_pct'], ['roe', 'roe_pct']], documentQueries: ['competitive advantage moat certifications market share switching costs'], localDomains: ['DOCUMENTS', 'PEERS'], primarySources: ['Annual report', 'Investor presentation'],
  }),
  q(4, 'Phase 2: Business Model, Product Mechanics & Customer/Vendor Base', 'Customer Concentration Risk', 'Who are the major customers that account for 50% or more of the order book?', {
    documentQueries: ['major customers customer concentration top customers order book'], localDomains: ['DOCUMENTS'], primarySources: ['Annual report notes', 'Credit-rating report'],
    evidenceRules: ['Require an exact excerpt, document, page, period and denominator for every concentration percentage.', 'Label prospectus-period evidence as HISTORICAL_CONTEXT; do not present it as current concentration.', 'A customer logo or named relationship does not establish revenue or order-book concentration.'],
  }),
  q(5, 'Phase 2: Business Model, Product Mechanics & Customer/Vendor Base', 'Supplier & Vendor Concentration', 'How concentrated is the supplier base and can raw-material cost increases be passed through?', {
    metrics: [['materials_cost'], ['inventory', 'inventory_change']], documentQueries: ['suppliers vendor concentration raw material pass through pricing power'], localDomains: ['DOCUMENTS'], primarySources: ['Annual report risk section', 'Credit-rating report'],
    evidenceRules: ['Require a dated supplier table or exact filing excerpt before asserting supplier concentration.', 'Do not infer contractual pass-through from stable margins or management of commodity volatility.', 'When extraction is incomplete say not located in the current evidence bundle, not that the company did not disclose it.'],
  }),
  q(6, 'Phase 3: Market Size & Reinvestment Capacity', 'Total Addressable Market', 'Is future growth constrained by overall market size or an industry ceiling?', {
    documentQueries: ['industry size addressable market market share penetration outlook'], localDomains: ['DOCUMENTS', 'PEERS'], primarySources: ['Official industry report', 'Annual report', 'Investor presentation'],
  }),
  q(7, 'Phase 3: Market Size & Reinvestment Capacity', 'Reinvestment Runway', 'What is the scope for reinvesting surplus operating cash flow into the core business?', {
    metrics: [['cfo', 'cfo_cr'], ['capex_cash_outflow'], ['capital_work_in_progress']], documentQueries: ['capacity expansion capex plan utilisation reinvestment runway'], localDomains: ['FINANCIAL_HISTORY', 'DOCUMENTS'], calculations: ['fcf', 'reinvestment_rate'], primarySources: ['XBRL/FERE cash flow', 'Annual report'],
    evidenceRules: ['Order-book conversion must use contract-specific tenure or execution schedules when disclosed.', 'Never annualise the full order book by mechanically dividing it by a generic duration.', 'Separate operating reinvestment, qualification inventory, CWIP and surplus cash.'],
  }),
  q(8, 'Phase 3: Market Size & Reinvestment Capacity', 'Capital Allocation Efficiency', 'Can the company consistently deploy incremental capital at high returns?', {
    metrics: [['roic'], ['roce_reported', 'roce_pct'], ['roe', 'roe_pct']], localDomains: ['FINANCIAL_HISTORY'], calculations: ['incremental_roic', 'roic_vs_wacc'], primarySources: ['XBRL/FERE statements'],
    evidenceRules: ['Reconcile reported and adjusted returns using explicit invested-capital components.', 'Show operating assets, CWIP and surplus issue/QIP cash separately; do not remove them without a transparent bridge.'],
  }),
  q(9, 'Phase 4: Revenue Quality & Segment Dynamics', 'Overall Outlook & Catalysts', 'What is the business outlook, financial health, upcoming growth catalysts and competitive positioning?', {
    trendlyneViews: ['overview', 'news', 'events'], documentQueries: ['guidance order book catalysts outlook competitive positioning'], localDomains: ['DOCUMENTS', 'EVENTS', 'FINANCIAL_HISTORY'], primarySources: ['Exchange filings', 'Earnings call', 'Investor presentation'],
  }),
  q(10, 'Phase 4: Revenue Quality & Segment Dynamics', 'Revenue Growth Quality', 'Is revenue expansion real, consistent and broad-based?', {
    metrics: [['revenue', 'revenue_cr'], ['trade_receivables', 'trade_receivables_cr']], localDomains: ['FINANCIAL_HISTORY', 'DOCUMENTS'], calculations: ['revenue_cagr_3y_5y', 'quarterly_growth_and_acceleration', 'receivables_vs_revenue'], primarySources: ['XBRL/FERE results'],
  }),
  q(11, 'Phase 4: Revenue Quality & Segment Dynamics', 'Segment Revenue Drivers', 'Which products or segments are leading the top-line recovery?', {
    documentQueries: ['segment revenue growth product mix geography recovery'], localDomains: ['DOCUMENTS', 'SEGMENTS'], primarySources: ['Segment XBRL', 'Quarterly results', 'Investor presentation'],
  }),
  q(12, 'Phase 4: Revenue Quality & Segment Dynamics', 'Sequential Bottoming Trends', 'Do quarterly revenue trends indicate that an operational bottom has formed?', {
    metrics: [['revenue', 'revenue_cr'], ['operating_profit', 'ebitda_cr'], ['pat', 'pat_cr']], localDomains: ['FINANCIAL_HISTORY'], calculations: ['eight_quarter_sequential_and_yoy_inflection'], primarySources: ['XBRL/FERE quarterly results'],
  }),
  q(13, 'Phase 5: Earnings Quality, Margins & Cash Integrity', 'Margin Trajectory', 'Are gross and operating margins expanding or under pressure?', {
    metrics: [['opm_pct', 'operating_margin_annual_pct'], ['operating_profit', 'ebitda_cr'], ['revenue', 'revenue_cr'], ['materials_cost']], documentQueries: ['margin movement raw material product mix operating leverage'], localDomains: ['FINANCIAL_HISTORY', 'DOCUMENTS'], calculations: ['gross_and_operating_margin_history'], primarySources: ['XBRL/FERE statements'],
  }),
  q(14, 'Phase 5: Earnings Quality, Margins & Cash Integrity', 'Quality of Earnings (One-offs)', 'Are profits affected by exceptional gains or driven by core operations?', {
    metrics: [['exceptional_items', 'exceptional_items_pretax'], ['other_income'], ['pat', 'pat_cr']], localDomains: ['FINANCIAL_HISTORY'], calculations: ['reported_to_normalised_pat_bridge'], primarySources: ['XBRL statement notes'],
    evidenceRules: ['Separate annual and quarterly exceptional items by period and scope.', 'State whether each item increased or reduced PBT using the statement presentation or note, not sign alone.', 'Do not mix a later quarter with the preceding annual period.'],
  }),
  q(15, 'Phase 5: Earnings Quality, Margins & Cash Integrity', 'Cash Flow vs. Profitability Gap', 'Is the company generating real cash flow and is there a structural PAT–CFO gap?', {
    metrics: [['cfo', 'cfo_cr'], ['pat', 'pat_cr'], ['trade_receivables', 'trade_receivables_cr'], ['inventory']], localDomains: ['FINANCIAL_HISTORY'], calculations: ['cfo_pat_ratio', 'accrual_ratio', 'working_capital_drag'], primarySources: ['XBRL/FERE cash flow'],
  }),
  q(16, 'Phase 5: Earnings Quality, Margins & Cash Integrity', 'Capital Deployment & Utilization', 'Is ROCE attractive and how is spare operating cash deployed?', {
    metrics: [['roce_reported', 'roce_pct'], ['capex_cash_outflow'], ['debt_repaid'], ['dividends_paid'], ['net_cash_flow']], trendlyneViews: ['events'], localDomains: ['FINANCIAL_HISTORY', 'EVENTS'], calculations: ['uses_of_cash_bridge'], primarySources: ['XBRL/FERE', 'Corporate actions'],
  }),
  q(17, 'Phase 6: Valuation & Peer Benchmarking', 'Relative Valuation Multiples', 'How do valuation multiples compare with direct peers?', {
    metrics: [['pe_ratio', 'pe_ttm'], ['pb_ratio'], ['peg_ratio'], ['market_cap', 'market_cap_cr'], ['ebitda', 'ebitda_cr'], ['cfo', 'cfo_cr'], ['capex_cash_outflow']], trendlyneViews: ['overview'], localDomains: ['PEERS', 'ADJUSTED_OHLCV'], calculations: ['ev_ebitda', 'fcf_yield', 'historical_valuation_percentile', 'reverse_dcf'], primarySources: ['Canonical facts', 'MasterTickers peers'],
  }),
  q(18, 'Phase 7: Governance, Management & Ownership', 'Management & Legal Verification', 'What is the promoter/management track record and are there active legal disputes?', {
    trendlyneViews: ['news', 'events', 'sast'], documentQueries: ['promoter directors management background legal cases litigation regulatory action'], localDomains: ['DOCUMENTS', 'EVENTS'], primarySources: ['Annual report', 'NSE/BSE/SEBI filings'],
  }),
  q(19, 'Phase 7: Governance, Management & Ownership', 'Governance History', 'Have there been governance issues, accounting red flags or integrity concerns?', {
    metrics: [['promoter_pledge', 'promoter_pledge_pct']], trendlyneViews: ['news', 'events', 'sast'], documentQueries: ['audit qualification restatement governance accounting red flags'], localDomains: ['FERE', 'DOCUMENTS', 'EVENTS'], primarySources: ['Audit reports', 'Exchange filings'],
  }),
  q(20, 'Phase 7: Governance, Management & Ownership', 'Promoter Holding Trends', 'How has promoter holding evolved and have insiders been buying?', {
    metrics: [['promoter_holding', 'promoter_holding_pct'], ['fii_holding', 'fii_holding_pct'], ['dii_holding', 'dii_holding_pct'], ['promoter_pledge', 'promoter_pledge_pct']], trendlyneViews: ['shareholding', 'sast', 'bulblockdeal'], localDomains: ['SHAREHOLDING', 'DEALS'], calculations: ['holder_level_qoq_diff'], primarySources: ['NSE/BSE shareholding and SAST'],
  }),
  q(21, 'Phase 7: Governance, Management & Ownership', 'Audits, Quality & Board Independence', 'Who is the statutory auditor and is oversight provided by qualified independent directors?', {
    documentQueries: ['statutory auditor audit committee board independence remuneration qualifications'], localDomains: ['DOCUMENTS'], primarySources: ['Annual report governance section', 'Auditor report'],
  }),
  q(22, 'Phase 8: Comprehensive Risk & Sensitivity', 'Business Model Risks', 'What are the key structural business-model risks?', {
    trendlyneViews: ['news', 'events'], documentQueries: ['risk factors disruption regulation customer supplier currency execution'], localDomains: ['DOCUMENTS', 'EVENTS'], primarySources: ['Annual report risk section'],
  }),
  q(23, 'Phase 8: Comprehensive Risk & Sensitivity', 'Critical Risk Watchlist', 'Which variables belong on the critical monitoring watchlist?', {
    trendlyneViews: ['technical', 'news', 'events', 'sast', 'bulblockdeal'], localDomains: ['EVENTS', 'ADJUSTED_OHLCV', 'FINANCIAL_HISTORY'], calculations: ['deterministic_thresholds_from_verified_baseline'], primarySources: ['All verified domains'],
  }),
  q(24, 'Phase 8: Comprehensive Risk & Sensitivity', 'Interest Rate Sensitivity', 'What is the PAT impact of a 25-bps increase in interest rates?', {
    metrics: [['total_debt', 'borrowings'], ['finance_costs', 'interest_expense'], ['tax_expense', 'current_tax']], documentQueries: ['floating rate debt borrowing cost debt maturity interest sensitivity'], localDomains: ['FINANCIAL_HISTORY', 'DOCUMENTS'], calculations: ['floating_debt_x_25bps_after_tax'], primarySources: ['Annual report debt notes', 'XBRL/FERE'],
    evidenceRules: ['Use disclosed floating-rate debt or the annual-report sensitivity table; never apply the shock to total debt without a rate split.', 'Report the exact pretax effect first.', 'Report an after-tax effect only when the tax rate is evidenced or clearly labelled as an illustrative assumption.'],
  }),
  q(25, 'Phase 9: Balance Sheet Quality & Working Capital', 'Working Capital Cycle', 'What are CCC, inventory days and DSO, and is working capital stretching?', {
    metrics: [['trade_receivables', 'trade_receivables_cr'], ['inventory'], ['revenue', 'revenue_cr'], ['working_capital']], localDomains: ['FINANCIAL_HISTORY', 'FERE'], calculations: ['dso', 'dio', 'dpo', 'cash_conversion_cycle'], primarySources: ['XBRL/FERE balance sheet and P&L'],
  }),
  q(26, 'Phase 9: Balance Sheet Quality & Working Capital', 'Balance Sheet Leverage & Coverage', 'What are net debt/EBITDA and interest coverage?', {
    metrics: [['total_debt', 'borrowings'], ['net_debt'], ['ebitda', 'ebitda_cr'], ['interest_coverage'], ['finance_costs', 'interest_expense']], localDomains: ['FINANCIAL_HISTORY', 'FERE'], calculations: ['net_debt_to_ebitda', 'interest_coverage_history'], primarySources: ['XBRL/FERE', 'Debt notes'],
  }),
  q(27, 'Phase 9: Balance Sheet Quality & Working Capital', 'Related Party Transactions', 'Are there material transactions with promoter-linked or unlisted affiliates?', {
    documentQueries: ['related party transactions sales purchases loans guarantees promoter entities'], localDomains: ['DOCUMENTS', 'RPT'], calculations: ['rpt_materiality_vs_revenue_assets_networth'], primarySources: ['Annual report RPT note'],
  }),
  q(28, 'Phase 10: Suggested Institutional Additions', 'Institutional Liquidity & Trading Volume', 'What is ADTV and how many days are required to enter or exit a target position?', {
    metrics: [['public_holding'], ['market_cap', 'market_cap_cr']], trendlyneViews: ['technical'], localDomains: ['ADJUSTED_OHLCV'], calculations: ['adtv_20d_60d', 'exit_days_at_participation_rate'], primarySources: ['NSE/BSE bhavcopy', 'Kite/Upstox depth'],
  }),
  q(29, 'Phase 9: Technical & Entry Strategy', 'Technical Support Levels', 'Where are the structural support zones for establishing a long-term position?', {
    trendlyneViews: ['technical'], localDomains: ['ADJUSTED_OHLCV'], calculations: ['swing_pivots', 'volume_at_price', 'atr_bands', 'ema_sma_20_50_200', '52_week_levels'], primarySources: ['DuckDB adjusted OHLCV'],
    evidenceRules: ['Recompute indicators from sorted adjusted OHLCV and expose bar-integrity diagnostics.', 'Treat unusual moving-average ordering as a market state unless duplicate, invalid or inconsistent bars prove a data error.', 'State price date and adjustment basis.'],
  }),
];

export const TRENDLYNE_REQUIRED_VIEWS = ['overview', 'technical', 'news', 'events', 'shareholding', 'sast', 'bulblockdeal'];

export const FOCUSED_DOCUMENT_QUERIES = [...new Set(RESEARCH_QUESTIONS.flatMap(item => item.documentQueries))];

export function validateContract() {
  const ids = RESEARCH_QUESTIONS.map(item => item.id);
  if (RESEARCH_QUESTIONS.length !== 29) throw new Error(`Expected 29 questions, found ${RESEARCH_QUESTIONS.length}`);
  if (new Set(ids).size !== ids.length) throw new Error('Question IDs must be unique');
  if (ids.some((id, index) => id !== index + 1)) throw new Error('Question IDs must be sequential from 1 to 29');
  for (const item of RESEARCH_QUESTIONS) {
    if (!item.phase || !item.topic || !item.question) throw new Error(`Question ${item.id} is incomplete`);
    if (item.targetWords.min !== 150 || item.targetWords.max !== 250) throw new Error(`Question ${item.id} has an invalid word contract`);
  }
  return true;
}
