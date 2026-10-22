import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const db = new Database(dbPath, { readonly: true });

console.log('=== STEP 2: INVENTORY STORED TCS DATA IN company_facts ===');

const totalCount = (db.prepare("SELECT count(*) as c FROM company_facts WHERE symbol = 'TCS'").get() as any).c;
console.log(`Total canonical facts for TCS: ${totalCount}`);

const metrics = db.prepare("SELECT DISTINCT metric FROM company_facts WHERE symbol = 'TCS' ORDER BY metric").all() as { metric: string }[];
console.log(`Distinct metrics count: ${metrics.length}`);
console.log(`Distinct metrics: ${metrics.map(m => m.metric).join(', ')}`);

const providers = db.prepare("SELECT DISTINCT provider, count(*) as c FROM company_facts WHERE symbol = 'TCS' GROUP BY provider").all();
console.log('Distinct providers:', JSON.stringify(providers));

const periodTypes = db.prepare("SELECT periodType, count(*) as c FROM company_facts WHERE symbol = 'TCS' GROUP BY periodType").all();
console.log('periodType distribution:', JSON.stringify(periodTypes));

const scopes = db.prepare("SELECT scope, count(*) as c FROM company_facts WHERE symbol = 'TCS' GROUP BY scope").all();
console.log('scope distribution:', JSON.stringify(scopes));

const dates = db.prepare("SELECT min(periodEnd) as minP, max(periodEnd) as maxP, max(availableAt) as maxA FROM company_facts WHERE symbol = 'TCS'").get() as any;
console.log(`Earliest periodEnd: ${dates.minP}, Latest periodEnd: ${dates.maxP}, Latest availableAt: ${dates.maxA}`);

// Inventory of key metrics
const targetMetrics = [
  // Income Statement
  'revenue', 'sales', 'total_income', 'operating_profit', 'ebitda', 'ebit', 'pat', 'net_profit', 'eps',
  // Balance Sheet
  'total_assets', 'total_liabilities', 'equity', 'net_worth', 'total_borrowings', 'borrowings', 'debt', 'cash', 'trade_receivables', 'inventories',
  // Cash Flow
  'cfo', 'cfi', 'cff', 'capex', 'capex_cash_outflow', 'dividends', 'debt_raised', 'debt_repaid',
  // Returns / Efficiency
  'roe', 'roe_pct', 'roce', 'roce_reported', 'roa',
  // Leverage
  'debt_to_equity', 'debt_to_equity_reported', 'dscr', 'interest_coverage',
  // Valuation
  'pe_ratio', 'market_cap', 'market_cap_cr', 'pb_ratio', 'book_value', 'peg_ratio',
  // Ownership
  'promoter_holding', 'promoter_pledge', 'fii_holding', 'dii_holding', 'mf_holding', 'public_holding'
];

console.log('\n--- TARGET METRICS INVENTORY IN company_facts ---');
const inventoryRows: any[] = [];
for (const tm of targetMetrics) {
  const rows = db.prepare(`
    SELECT metric, periodType, periodEnd, scope, provider, value, unit, availableAt
    FROM company_facts
    WHERE symbol = 'TCS' AND metric = ?
    ORDER BY periodEnd DESC, availableAt DESC
  `).all(tm) as any[];

  if (rows.length > 0) {
    const latest = rows[0];
    inventoryRows.push({
      metric: tm,
      rowCount: rows.length,
      latestPeriod: latest.periodEnd,
      periodType: latest.periodType,
      scope: latest.scope,
      provider: latest.provider,
      valuePresent: latest.value !== null && latest.value !== undefined && latest.value !== '',
      sampleValue: latest.value,
      unit: latest.unit,
      latestAvailableAt: latest.availableAt
    });
  } else {
    inventoryRows.push({
      metric: tm,
      rowCount: 0,
      latestPeriod: null,
      periodType: null,
      scope: null,
      provider: null,
      valuePresent: false,
      sampleValue: null,
      unit: null,
      latestAvailableAt: null
    });
  }
}
console.table(inventoryRows);

db.close();
