import Database from 'better-sqlite3';
const db = new Database('portfolio.db');

const rows = db.prepare(`SELECT metric, availabilityStatus, COUNT(*) as c FROM company_facts WHERE metric IN ('net_debt', 'debt_to_equity_reported', 'trade_receivables_cr', 'total_borrowings_cr', 'cfo', 'pat', 'revenue') GROUP BY metric, availabilityStatus`).all();
console.table(rows);

const mcpRows = db.prepare(`SELECT endpoint, COUNT(*) as c FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' GROUP BY endpoint`).all();
console.table(mcpRows);
