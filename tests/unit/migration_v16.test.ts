import { describe, it, expect } from 'vitest';

// Native bindings (better-sqlite3 for the test DB, sqlite3 pulled in by src/server/database.ts) may be missing
// or built for another Node ABI. Detect that up front and skip with a clear message instead of crashing the run.
let Db: any = null;
let MIGRATION_V16_SQLS: (() => string[]) | null = null;
let skipReason = '';
try {
  Db = (await import('better-sqlite3')).default;
  new Db(':memory:').close(); // forces the native binding to load
  MIGRATION_V16_SQLS = (await import('../../src/server/database')).MIGRATION_V16_SQLS;
} catch (e: any) {
  skipReason = String(e?.message ?? e).split('\n')[0];
  console.warn(`[migration_v16.test] SKIPPED: native sqlite binding unavailable (${skipReason}). Run npm rebuild better-sqlite3 sqlite3.`);
}

function setup() {
  const db = new Db(':memory:');
  db.exec(`CREATE TABLE HistoricalFinancialStatements (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, statement_type TEXT, period_label TEXT, period_date TEXT, sales_cr REAL, operating_profit_cr REAL, pbt_cr REAL, interest_cr REAL, net_profit_pat_cr REAL, equity_capital_cr REAL, reserves_cr REAL, borrowings_cr REAL, total_liabilities_cr REAL, total_assets_cr REAL, cfo_cr REAL);
  CREATE TABLE HistoricalShareholdingPattern (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, quarter_label TEXT, as_of_date TEXT, promoter_pct REAL, fii_pct REAL, dii_pct REAL, public_pct REAL, free_float_pct REAL);`);
  return db;
}
const apply = (db: any) => MIGRATION_V16_SQLS!().forEach(s => {
  try { db.exec(s); } catch (e: any) { if (!/duplicate column|already exists/.test(e.message)) throw e; }
});

describe.skipIf(!Db || !MIGRATION_V16_SQLS)('migration v16', () => {
  it('is idempotent and views run', () => {
    const db = setup();
    apply(db); apply(db);
    const labels = ['Mar 2024','Jun 2024','Sep 2024','Dec 2024','Mar 2025','Jun 2025','Sep 2025','Dec 2025','Mar 2023'];
    labels.forEach(l => db.prepare(`INSERT INTO HistoricalFinancialStatements(symbol,statement_type,period_label,pbt_cr,interest_cr,net_profit_pat_cr) VALUES('X','QUARTERLY_PL',?,10,2,5)`).run(l));
    db.prepare(`INSERT INTO HistoricalFinancialStatements(symbol,statement_type,period_label,equity_capital_cr,reserves_cr,borrowings_cr) VALUES('X','BALANCE_SHEET','Mar 2025',10,90,100)`).run();
    db.prepare(`INSERT INTO HistoricalShareholdingPattern(symbol,quarter_label,promoter_pct,fii_pct,dii_pct) VALUES('X','Dec 2023',50,1,1),('X','Mar 2024',60,3,3)`).run();
    db.prepare(`INSERT INTO DailyOHLCV(symbol,trade_date,close,volume) VALUES('X','2025-01-01',1,1),('X','2025-01-02',2,3)`).run();
    expect((db.prepare('SELECT promoter_pct p FROM v_latest_shareholding').get() as any).p).toBe(60);
    const f = db.prepare("SELECT * FROM v_latest_quarterly_fin WHERE symbol='X'").get() as any;
    expect(f.quarter_label).toBe('Dec 2025');
    expect(f.roe_pct_annualised).toBeCloseTo(20);
    expect(f.roce_pct_annualised).toBeCloseTo(48 / 200 * 100); // (10+2)*4 / (10+90+100)
    expect((db.prepare('SELECT has_8q h FROM v_8q_pat_check').get() as any).h).toBe(1);
    expect((db.prepare('SELECT close c FROM v_scan_universe_latest').get() as any).c).toBe(2);
    for (const v of ['v_f_filter_inputs', 'v_stock_full_profile']) db.prepare(`SELECT * FROM ${v} LIMIT 5`).all();
  });

  it('falls back to assets-liabilities equity when reserves are NULL and keeps unknowns NULL', () => {
    const db = setup();
    apply(db);
    db.prepare(`INSERT INTO HistoricalFinancialStatements(symbol,statement_type,period_label,pbt_cr,interest_cr,net_profit_pat_cr) VALUES('Y','QUARTERLY_PL','Mar 2025',20,0,15)`).run();
    db.prepare(`INSERT INTO HistoricalFinancialStatements(symbol,statement_type,period_label,equity_capital_cr,total_liabilities_cr,total_assets_cr,borrowings_cr) VALUES('Y','BALANCE_SHEET','Mar 2025',5,40,100,10)`).run();
    db.prepare(`INSERT INTO HistoricalFinancialStatements(symbol,statement_type,period_label,net_profit_pat_cr) VALUES('Z','QUARTERLY_PL','Mar 2025',1)`).run();
    const y = db.prepare("SELECT * FROM v_latest_quarterly_fin WHERE symbol='Y'").get() as any;
    expect(y.roe_pct_annualised).toBeCloseTo(15 * 4 / 60 * 100); // equity = 100-40
    expect(y.roce_pct_annualised).toBeCloseTo(20 * 4 / 70 * 100);
    const z = db.prepare("SELECT * FROM v_latest_quarterly_fin WHERE symbol='Z'").get() as any;
    expect(z.roe_pct_annualised).toBeNull();
    expect(z.roce_pct_annualised).toBeNull();
    db.prepare(`SELECT * FROM v_stock_full_profile LIMIT 5`).all();
  });
});
