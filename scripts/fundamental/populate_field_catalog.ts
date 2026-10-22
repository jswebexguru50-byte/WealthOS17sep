import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(process.cwd(), 'portfolio.db');

async function run(db: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}

const MAPPINGS = [
  // Income Statement
  { token: 'sra', label: 'Total Rev. Ann.', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'totalsrq', label: 'Total Rev. Qtr', canonical: 'revenue', statement: 'INCOME', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'opa', label: 'Operating Profit Ann.', canonical: 'operating_profit', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'opq', label: 'Operating Profit Qtr', canonical: 'operating_profit', statement: 'INCOME', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'pata', label: 'PAT Before ExtraOrdinary Items Ann.', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npq', label: 'Net Profit Qtr', canonical: 'pat', statement: 'INCOME', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'epsttm', label: 'Basic EPS TTM', canonical: 'eps', statement: 'INCOME', period: 'TTM', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'cepsa', label: 'Cash EPS Ann.', canonical: 'cash_eps', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'ABSOLUTE' },
  
  // Balance Sheet
  { token: 'debtcea', label: 'Total Debt to Total Equity Ann.', canonical: 'debt_to_equity_reported', statement: 'BALANCE', period: 'ANNUAL', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'netdebta', label: 'Net Debt Ann.', canonical: 'net_debt', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'bvsha', label: 'BVSH Ann.', canonical: 'bvps', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'cratioa', label: 'Current Ratio Ann.', canonical: 'current_ratio', statement: 'BALANCE', period: 'ANNUAL', unit: 'RATIO', scale: 'ABSOLUTE' },
  
  // Cash Flow
  { token: 'cfoa', label: 'Cash from Operating Act. Ann.', canonical: 'cfo', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'ncfa', label: 'Net Cash Flow Ann.', canonical: 'net_cash_flow', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'capitalexpenditurea', label: 'Capex Ann.', canonical: 'capex_cash_outflow', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'dividendpayoutnpa', label: 'Dividend Payout to NP Ann.', canonical: 'dividend_payout', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  
  // Returns
  { token: 'rocea', label: 'ROCE Ann. %', canonical: 'roce_reported', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'roea', label: 'ROE Ann. %', canonical: 'roe', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'roica', label: 'ROIC Ann. %', canonical: 'roic', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  
  // Ownership
  { token: 'prompct', label: 'Promoter holding latest %', canonical: 'promoter_holding', statement: 'OWNERSHIP', period: 'INSTANT', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'prompledge', label: 'Promoter holding pledge percentage % Qtr', canonical: 'promoter_pledge', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'fiihold', label: 'FII holding current Qtr %', canonical: 'fii_holding', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'instihold', label: 'Institutional holding current Qtr %', canonical: 'inst_holding', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  
  // Valuation
  { token: 'mcapq', label: 'Market Cap', canonical: 'market_cap', statement: 'VALUATION', period: 'INSTANT', unit: 'INR', scale: 'CRORE' },
  { token: 'pettm', label: 'PE TTM', canonical: 'pe_ratio', statement: 'VALUATION', period: 'TTM', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'pbva', label: 'PBV Adjusted', canonical: 'pb_ratio', statement: 'VALUATION', period: 'INSTANT', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'pegttm', label: 'PEG TTM', canonical: 'peg_ratio', statement: 'VALUATION', period: 'TTM', unit: 'RATIO', scale: 'ABSOLUTE' },

  { token: 'sramy1', label: 'Rev. Ann. 1Y ago', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'sramy2', label: 'Rev. Ann. 2Y ago', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'sramy3', label: 'Rev. Ann. 3Y ago', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npamy1', label: 'Net Profit Ann. 1Y ago', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npamy2', label: 'Net Profit Ann. 2Y ago', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npamy3', label: 'Net Profit Ann. 3Y ago', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'opmpctq', label: 'OPM latest Qtr %', canonical: 'opm_pct', statement: 'INCOME', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'opmpctqmq1', label: 'OPM 1Q ago %', canonical: 'opm_pct', statement: 'INCOME', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'fiipct1q', label: 'FII holding change QoQ %', canonical: 'fii_change_qoq', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'mfpct1q', label: 'MF holding change QoQ %', canonical: 'mf_change_qoq', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'wcq', label: 'Working Capital Qtr', canonical: 'working_capital', statement: 'BALANCE', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'currentprice', label: 'Current Price', canonical: 'current_price', statement: 'VALUATION', period: 'INSTANT', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'opma', label: 'OPM Ann. %', canonical: 'operating_margin_annual_pct', statement: 'INCOME', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'roaa', label: 'ROA Ann. %', canonical: 'roa_pct', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'ebita', label: 'EBIT Ann.', canonical: 'ebit', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'ltdea', label: 'Long Term Debt to Equity Ann.', canonical: 'long_term_debt_to_equity', statement: 'BALANCE', period: 'ANNUAL', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'dividendpayout', label: 'Dividend Payout Ratio', canonical: 'dividend_payout_pct', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'dividendpersharea', label: 'Dividend Per Share Ann.', canonical: 'dividend_per_share', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'cfoagrowth', label: 'CFO Growth Ann. %', canonical: 'cfo_growth_pct', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'inventoriesq', label: 'Inventories Qtr', canonical: 'inventory', statement: 'BALANCE', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'tradereceivablesa', label: 'Trade Receivables Ann.', canonical: 'trade_receivables', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'contingentliabilitiesa', label: 'Contingent Liabilities Ann.', canonical: 'contingent_liabilities', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'prompct1q', label: 'Promoter holding change QoQ %', canonical: 'promoter_change_qoq_pct', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'prompledge1q', label: 'Promoter pledge change QoQ %', canonical: 'promoter_pledge_change_qoq_pct', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
];
async function main() {
  const db = new sqlite3.Database(dbPath);

  console.log("Populating field_mapping_catalog...");

  for (const m of MAPPINGS) {
    await run(db, `
      INSERT OR REPLACE INTO field_mapping_catalog (
        provider, provider_token, provider_label, canonical_metric, statement_type, 
        period_type, unit, currency, scale, consolidated_or_standalone, 
        source_frequency, mapping_status, verified_at, verification_method, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `, [
      'TRENDLYNE_MCP', m.token, m.label, m.canonical, m.statement,
      m.period, m.unit, m.unit === 'INR' ? 'INR' : null, m.scale, 'UNKNOWN',
      'DAILY', 'VERIFIED', 'MANUAL_EXPERT_REVIEW', 'Pilot mapping'
    ]);
  }

  console.log("Inserted " + MAPPINGS.length + " verified mappings.");
  db.close();
}

main().catch(console.error);
