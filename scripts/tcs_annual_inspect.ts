import Database from 'better-sqlite3';
import path from 'node:path';
import { Analyze360FieldResolver } from '../src/server/services/Analyze360FieldSourceMap.js';

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const db = new Database(dbPath, { readonly: true });

console.log('--- REVENUE FACTS FOR TCS WITH periodType = ANNUAL ---');
const revFacts = db.prepare(`
  SELECT factId, metric, periodType, periodEnd, value, unit, provider, availableAt
  FROM company_facts
  WHERE symbol = 'TCS' AND metric = 'revenue' AND periodType = 'ANNUAL'
  ORDER BY periodEnd DESC
`).all() as any[];

console.log(`Found ${revFacts.length} annual revenue facts for TCS:`);
for (const r of revFacts) {
  const yr = Analyze360FieldResolver.parsePeriodYear(r.periodEnd);
  console.log(`  periodEnd: ${r.periodEnd}, parsedYear: ${yr}, val: ${r.value}, prov: ${r.provider}`);
}

console.log('\n--- PAT FACTS FOR TCS WITH periodType = ANNUAL ---');
const patFacts = db.prepare(`
  SELECT factId, metric, periodType, periodEnd, value, unit, provider, availableAt
  FROM company_facts
  WHERE symbol = 'TCS' AND metric = 'pat' AND periodType = 'ANNUAL'
  ORDER BY periodEnd DESC
`).all() as any[];

console.log(`Found ${patFacts.length} annual pat facts for TCS:`);
for (const r of patFacts) {
  const yr = Analyze360FieldResolver.parsePeriodYear(r.periodEnd);
  console.log(`  periodEnd: ${r.periodEnd}, parsedYear: ${yr}, val: ${r.value}, prov: ${r.provider}`);
}

console.log('\n--- MASTER ROW & DATA QUALITY AUDIT LEDGER FOR TCS ---');
const master = db.prepare(`
  SELECT m.isin, m.company_name, m.sector, m.industry,
         d.roce_pct, d.roe_pct, d.debt_to_equity,
         d.sales_growth_5y_pct, d.profit_growth_5y_pct,
         d.latest_sales_cr, d.latest_pat_cr, d.latest_op_profit_cr,
         d.fii_pct, d.dii_pct, d.promoter_pct, d.pe_ratio,
         d.as_of_quarter, d.as_of_year, d.audited_at,
         d.cfo_cr, d.total_assets_cr, d.total_borrowings_cr
  FROM MasterTickers m
  LEFT JOIN DataQualityAuditLedger d ON m.symbol = d.symbol
  WHERE m.symbol = 'TCS'
`).get() as any;
console.log('Master row:', JSON.stringify(master, null, 2));

console.log('\n--- HistoricalFinancialStatements FOR TCS ---');
const hfs = db.prepare("SELECT * FROM HistoricalFinancialStatements WHERE symbol = 'TCS'").all();
console.log(`HFS count: ${hfs.length}`);
console.log('HFS rows:', JSON.stringify(hfs, null, 2));

console.log('\n--- HistoricalShareholdingPattern FOR TCS ---');
const hsp = db.prepare("SELECT * FROM HistoricalShareholdingPattern WHERE symbol = 'TCS'").all();
console.log(`HSP count: ${hsp.length}`);
console.log('HSP rows:', JSON.stringify(hsp, null, 2));

db.close();
