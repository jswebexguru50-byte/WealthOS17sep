import { describe, it, expect } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { MIGRATION_V16_SQLS } from '../../src/server/database';

function setup() {
  const db = new BetterSqlite3(':memory:');
  db.exec(`CREATE TABLE HistoricalFinancialStatements (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, statement_type TEXT, period_label TEXT, period_date TEXT, sales_cr REAL, operating_profit_cr REAL, pbt_cr REAL, interest_cr REAL, net_profit_pat_cr REAL, equity_capital_cr REAL, reserves_cr REAL, borrowings_cr REAL, total_assets_cr REAL, cfo_cr REAL);
  CREATE TABLE HistoricalShareholdingPattern (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, quarter_label TEXT, as_of_date TEXT, promoter_pct REAL, fii_pct REAL, dii_pct REAL, public_pct REAL, free_float_pct REAL);`);
  return db;
}
const apply = (db: BetterSqlite3.Database) => MIGRATION_V16_SQLS().forEach(s => {
  try { db.exec(s); } catch (e: any) { if (!/duplicate column|already exists/.test(e.message)) throw e; }
});

describe('migration v16', () => {
  it('is idempotent and views run', () => {
    const db = setup();
    apply(db); apply(db);
    const labels = ['Mar 2024','Jun 2024','Sep 2024','Dec 2024','Mar 2025','Jun 2025','Sep 2025','Dec 2025','Mar 2023'];
    labels.forEach(l => db.prepare(`INSERT INTO HistoricalFinancialStatements(symbol,statement_type,period_label,pbt_cr,interest_cr,net_profit_pat_cr) VALUES('X','QUARTERLY_PL',?,10,2,5)`).run(l));
    db.prepare(`INSERT INTO HistoricalFinancialStatements(symbol,statement_type,period_label,equity_capital_cr,reserves_cr,borrowings_cr) VALUES('X','BALANCE_SHEET','Mar 2025',10,90,100)`).run();
    db.prepare(`INSERT INTO HistoricalShareholdingPattern(symbol,quarter_label,promoter_pct) VALUES('X','Dec 2023',50),('X','Mar 2024',60)`).run();
    db.prepare(`INSERT INTO DailyOHLCV(symbol,trade_date,close,volume) VALUES('X','2025-01-01',1,1),('X','2025-01-02',2,3)`).run();
    expect((db.prepare('SELECT promoter_pct p FROM v_latest_shareholding').get() as any).p).toBe(60);
    const f = db.prepare('SELECT * FROM v_latest_quarterly_fin').get() as any;
    expect(f.quarter_label).toBe('Dec 2025');
    expect(f.roe_pct_annualised).toBeCloseTo(20);
    expect((db.prepare('SELECT has_8q h FROM v_8q_pat_check').get() as any).h).toBe(1);
    expect((db.prepare('SELECT close c FROM v_scan_universe_latest').get() as any).c).toBe(2);
    for (const v of ['v_f_filter_inputs', 'v_stock_full_profile']) db.prepare(`SELECT * FROM ${v} LIMIT 5`).all();
  });
});
