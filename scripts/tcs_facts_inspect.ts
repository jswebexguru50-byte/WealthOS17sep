import Database from 'better-sqlite3';
import path from 'node:path';

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const db = new Database(dbPath, { readonly: true });

console.log('=== DEEP DIVE: TCS ROWS IN company_facts ===');
const checkMetrics = ['revenue', 'pat', 'operating_profit', 'total_income', 'cfo', 'roe', 'roe_pct', 'roce_pct', 'roce_reported', 'debt_to_equity', 'pe_ratio', 'promoter_holding'];

for (const m of checkMetrics) {
  const rows = db.prepare(`
    SELECT factId, metric, periodType, periodEnd, asOfDate, scope, provider, value, unit, verificationStatus, availableAt
    FROM company_facts
    WHERE symbol = 'TCS' AND metric = ?
    ORDER BY periodEnd DESC, availableAt DESC
  `).all(m) as any[];

  console.log(`\n--- Metric: ${m} (${rows.length} rows) ---`);
  for (const r of rows.slice(0, 10)) {
    console.log(`  periodType: ${r.periodType}, periodEnd: ${r.periodEnd}, scope: ${r.scope}, val: ${r.value}, unit: ${r.unit}, prov: ${r.provider}, factId: ${r.factId}`);
  }
}

db.close();
