import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(process.cwd(), 'portfolio.db');

async function run(db: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}

const MAPPINGS = [
  // Income Statement
  { token: 'sra', label: 'Total Revenue Annual', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'totalsrq', label: 'Total Revenue Qtr', canonical: 'revenue', statement: 'INCOME', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'opa', label: 'Operating Profit Annual', canonical: 'ebitda', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'opq', label: 'Operating Profit Qtr', canonical: 'ebitda', statement: 'INCOME', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'pata', label: 'PAT Before ExtraOrdinary Items Annual', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npq', label: 'Net Profit Qtr', canonical: 'pat', statement: 'INCOME', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'epsttm', label: 'Basic EPS TTM', canonical: 'eps', statement: 'INCOME', period: 'TTM', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'cepsa', label: 'Cash EPS Annual', canonical: 'cash_eps', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'ABSOLUTE' },
  
  // Balance Sheet
  { token: 'debtcea', label: 'Total Debt to Total Equity Annual', canonical: 'debt_to_equity', statement: 'BALANCE', period: 'ANNUAL', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'netdebta', label: 'Net Debt Annual', canonical: 'net_debt', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'bvsha', label: 'Book Value Per Share Annual', canonical: 'bvps', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'cratioa', label: 'Current Ratio Annual', canonical: 'current_ratio', statement: 'BALANCE', period: 'ANNUAL', unit: 'RATIO', scale: 'ABSOLUTE' },
  
  // Cash Flow
  { token: 'cfoa', label: 'Cash from Operating Activity Annual', canonical: 'cfo', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'ncfa', label: 'Net Cash Flow Annual', canonical: 'net_cash_flow', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'capitalexpenditurea', label: 'Capital Expenditure Annual', canonical: 'capex', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'dividendpayoutnpa', label: 'Dividend Payout to NP Annual', canonical: 'dividend_payout', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  
  // Returns
  { token: 'rocea', label: 'ROCE Annual %', canonical: 'roce', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'roea', label: 'ROE Annual %', canonical: 'roe', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'roica', label: 'ROIC Annual %', canonical: 'roic', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  
  // Ownership
  { token: 'prompct', label: 'Promoter holding latest %', canonical: 'promoter_holding', statement: 'OWNERSHIP', period: 'INSTANT', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'prompledge', label: 'Promoter holding pledge percentage % Qtr', canonical: 'promoter_pledge', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'fiihold', label: 'FII holding current Qtr %', canonical: 'fii_holding', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'instihold', label: 'Institutional holding current Qtr %', canonical: 'inst_holding', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  
  // Valuation
  { token: 'mcapq', label: 'Market Capitalization', canonical: 'market_cap', statement: 'VALUATION', period: 'INSTANT', unit: 'INR', scale: 'CRORE' },
  { token: 'pettm', label: 'PE TTM Price to Earnings', canonical: 'pe_ratio', statement: 'VALUATION', period: 'TTM', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'pbva', label: 'Price to Book Value Adjusted', canonical: 'pb_ratio', statement: 'VALUATION', period: 'INSTANT', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'pegttm', label: 'PEG TTM PE to Growth', canonical: 'peg_ratio', statement: 'VALUATION', period: 'TTM', unit: 'RATIO', scale: 'ABSOLUTE' },
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
      m.period, m.unit, m.unit === 'INR' ? 'INR' : null, m.scale, 'CONSOLIDATED',
      'DAILY', 'VERIFIED', 'MANUAL_EXPERT_REVIEW', 'Pilot mapping'
    ]);
  }

  console.log("Inserted " + MAPPINGS.length + " verified mappings.");
  db.close();
}

main().catch(console.error);
