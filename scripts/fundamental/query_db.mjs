import Database from 'better-sqlite3';
const db = new Database('portfolio.db');

console.log('--- Top metrics in company_facts ---');
const topMetrics = db.prepare('SELECT metric, COUNT(*) as c FROM company_facts GROUP BY metric ORDER BY c DESC LIMIT 20').all();
console.table(topMetrics);

console.log('\n--- Specific missing metrics ---');
const specific = db.prepare(`SELECT metric, periodType, COUNT(*) as c FROM company_facts WHERE metric IN ('revenue', 'ebitda', 'pat', 'cfo', 'debt', 'cash', 'pe_ratio', 'totalBorrowings') GROUP BY metric, periodType`).all();
console.table(specific);

console.log('\n--- Trendlyne mappings ---');
const mappings = db.prepare(`SELECT canonical_metric, provider_token, provider_label, mapping_status FROM field_mapping_catalog WHERE provider='TRENDLYNE_MCP' LIMIT 20`).all();
console.table(mappings);

const missingMap = db.prepare(`SELECT canonical_metric FROM field_mapping_catalog WHERE canonical_metric IN ('debtAndService.totalBorrowings', 'debt', 'revenue')`).all();
console.table(missingMap);
