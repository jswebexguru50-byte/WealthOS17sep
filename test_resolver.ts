import { Analyze360FieldResolver } from './src/server/services/Analyze360FieldSourceMap.js';
import * as dbModule from './src/server/database.js';
import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const masterRow = db.prepare('SELECT m.isin, m.company_name, m.sector, m.industry, d.roce_pct, d.roe_pct, d.debt_to_equity, d.sales_growth_5y_pct, d.profit_growth_5y_pct, d.latest_sales_cr, d.latest_pat_cr, d.latest_op_profit_cr, d.fii_pct, d.dii_pct, d.promoter_pct, d.pe_ratio, d.as_of_quarter, d.as_of_year, d.audited_at, d.cfo_cr, d.total_assets_cr, d.total_borrowings_cr FROM MasterTickers m LEFT JOIN DataQualityAuditLedger d ON m.symbol = d.symbol WHERE m.symbol = ?').get('TCS');

async function test() {
  const res = await Analyze360FieldResolver.resolveAllFields('TCS', masterRow);
  console.log(JSON.stringify(res.fields, null, 2));
}

test().catch(console.error);
