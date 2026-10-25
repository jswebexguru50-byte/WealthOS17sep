"""
apply_v15_v16.py — apply WealthOS DB migrations v15 and v16 to portfolio.db.
Run from the project root:  python apply_v15_v16.py
"""
import sqlite3, json, sys, textwrap
from pathlib import Path

ROOT = Path(__file__).parent
DB   = ROOT / "portfolio.db"

if not DB.exists():
    sys.exit(f"ERROR: {DB} not found")

db = sqlite3.connect(str(DB))
db.execute("PRAGMA journal_mode=WAL")
db.execute("PRAGMA busy_timeout=30000")

# ── current version ────────────────────────────────────────────────────────────
cur = db.execute("SELECT COALESCE(MAX(version),0) FROM db_migrations").fetchone()[0]
print(f"Current DB version: v{cur}")
if cur >= 16:
    print("✓ Already at v16 — nothing to do.")
    db.close(); sys.exit(0)

# ── period-label sort key (mirrors qk() in database.ts) ───────────────────────
def qk(c):
    return (f"(CASE WHEN {c} GLOB '[A-Z][a-z][a-z] [0-9][0-9][0-9][0-9]' "
            f"THEN CAST(substr({c},5,4) AS INTEGER)*100 + "
            f"(instr('JanFebMarAprMayJunJulAugSepOctNovDec', substr({c},1,3))+2)/3 END)")

# ── migration definitions ─────────────────────────────────────────────────────
MIGRATIONS = [
  {
    "version": 15,
    "name": "create_trendlyne_universe_schedule",
    "sqls": [
      """CREATE TABLE IF NOT EXISTS trendlyne_universe_schedule (
        symbol TEXT PRIMARY KEY, security_id TEXT NOT NULL,
        universe_tier INTEGER NOT NULL DEFAULT 3,
        last_fetched_at INTEGER, next_due_at INTEGER,
        fetch_count INTEGER NOT NULL DEFAULT 0,
        priority_override INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )""",
      "CREATE INDEX IF NOT EXISTS idx_tus_due ON trendlyne_universe_schedule (next_due_at, universe_tier, priority_override)",
      "CREATE INDEX IF NOT EXISTS idx_tus_tier ON trendlyne_universe_schedule (universe_tier, last_fetched_at)",
    ],
  },
  {
    "version": 16,
    "name": "perf_indexes_views_pledge_fact_store",
    "sqls": [
      """CREATE TABLE IF NOT EXISTS DailyOHLCV (
        symbol TEXT NOT NULL, trade_date TEXT NOT NULL,
        open REAL, high REAL, low REAL, close REAL NOT NULL,
        volume INTEGER, turnover REAL, delivery_qty INTEGER, delivery_pct REAL,
        no_of_trades INTEGER, prev_close REAL,
        data_source TEXT DEFAULT 'NSE_BHAVCOPY',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (symbol, trade_date)
      )""",
      """CREATE TABLE IF NOT EXISTS MasterTickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, isin TEXT UNIQUE NOT NULL,
        symbol TEXT, name TEXT, exchange TEXT DEFAULT 'NSE', segment TEXT DEFAULT 'EQ',
        sector TEXT, upstox_key_nse TEXT, upstox_key_bse TEXT,
        manual_ltp REAL, manual_ltp_date TEXT, last_price REAL, previous_close REAL,
        last_updated TEXT, fmv_31_jan_2018 REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )""",
      """CREATE TABLE IF NOT EXISTS strategy_fundamental_filter_results (
        run_key TEXT NOT NULL, symbol TEXT NOT NULL, scan_id TEXT,
        population TEXT NOT NULL, pass_count INTEGER NOT NULL,
        total_checks INTEGER NOT NULL, evidence_status TEXT NOT NULL,
        promoter_pct REAL, promoter_pass INTEGER, profitable_last_8_quarters INTEGER,
        profitable_quarter_count INTEGER, roce_pct REAL, roce_pass INTEGER,
        roe_pct REAL, roe_pass INTEGER, pledged_pct REAL, no_pledge_pass INTEGER,
        fii_pct REAL, dii_pct REAL, institutional_involvement_pass INTEGER,
        institutional_increasing INTEGER, latest_operating_profit_cr REAL,
        latest_cfo_cr REAL, cash_flow_to_operating_profit REAL,
        cash_flow_pass INTEGER, qglp_status TEXT, qglp_score REAL,
        sector_momentum_status TEXT, double_momentum_status TEXT,
        source TEXT NOT NULL, evidence_note TEXT NOT NULL,
        evaluated_at TEXT NOT NULL, PRIMARY KEY (run_key, symbol)
      )""",
      "CREATE INDEX IF NOT EXISTS idx_dailyohlcv_sym_date_desc ON DailyOHLCV(symbol, trade_date DESC)",
      "CREATE INDEX IF NOT EXISTS idx_dailyohlcv_date_sym_close_vol ON DailyOHLCV(trade_date, symbol, close, volume)",
      "CREATE INDEX IF NOT EXISTS idx_hist_shp_sym_asof_desc ON HistoricalShareholdingPattern(symbol, as_of_date DESC)",
      "CREATE INDEX IF NOT EXISTS idx_hist_fin_sym_type_period_desc ON HistoricalFinancialStatements(symbol, statement_type, period_label DESC)",
      "CREATE INDEX IF NOT EXISTS idx_master_tickers_sym_isin_sector_name ON MasterTickers(symbol, isin, sector, name)",
      "CREATE INDEX IF NOT EXISTS idx_sffr_symbol_evaluated_desc ON strategy_fundamental_filter_results(symbol, evaluated_at DESC)",
      "ALTER TABLE HistoricalShareholdingPattern ADD COLUMN pledge_pct REAL DEFAULT NULL",
      """CREATE TABLE IF NOT EXISTS canonical_fact_store (
        symbol TEXT NOT NULL, field TEXT NOT NULL, value TEXT,
        source TEXT, confidence REAL, fetched_at TEXT, ttl_seconds INTEGER,
        PRIMARY KEY (symbol, field)
      )""",
      f"""CREATE VIEW IF NOT EXISTS v_latest_shareholding AS
        SELECT symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct,
               public_pct, free_float_pct, pledge_pct, prev_inst_pct
        FROM (SELECT s.*,
                     LEAD(s.fii_pct + s.dii_pct) OVER w AS prev_inst_pct,
                     ROW_NUMBER() OVER w AS rn
              FROM HistoricalShareholdingPattern s
              WINDOW w AS (PARTITION BY symbol
                ORDER BY ({qk('quarter_label')} IS NULL),
                          {qk('quarter_label')} DESC, as_of_date DESC, id DESC))
        WHERE rn = 1""",
      f"""CREATE VIEW IF NOT EXISTS v_latest_quarterly_fin AS
        WITH q AS (
          SELECT symbol, period_label, operating_profit_cr, pbt_cr, interest_cr,
                 net_profit_pat_cr, sales_cr,
                 ROW_NUMBER() OVER (PARTITION BY symbol
                   ORDER BY {qk('period_label')} DESC, id DESC) AS rn
          FROM HistoricalFinancialStatements
          WHERE statement_type LIKE 'QUARTERLY%'
            AND {qk('period_label')} IS NOT NULL AND net_profit_pat_cr IS NOT NULL
        ), a AS (
          SELECT symbol,
                 CASE WHEN pbt_cr IS NOT NULL AND interest_cr IS NOT NULL
                      THEN pbt_cr + interest_cr END AS ebit_annual,
                 net_profit_pat_cr AS pat_annual,
                 ROW_NUMBER() OVER (PARTITION BY symbol
                   ORDER BY {qk('period_label')} DESC, id DESC) AS rn
          FROM HistoricalFinancialStatements
          WHERE statement_type = 'ANNUAL_PL' AND {qk('period_label')} IS NOT NULL
            AND (net_profit_pat_cr IS NOT NULL
                 OR (pbt_cr IS NOT NULL AND interest_cr IS NOT NULL))
        ), b0 AS (
          SELECT symbol, period_label AS bs_period, equity_capital_cr, reserves_cr,
                 borrowings_cr,
                 CASE WHEN reserves_cr IS NOT NULL AND equity_capital_cr IS NOT NULL
                           AND equity_capital_cr + reserves_cr > 0
                               THEN equity_capital_cr + reserves_cr
                      WHEN total_assets_cr IS NOT NULL AND total_liabilities_cr IS NOT NULL
                           AND total_assets_cr - total_liabilities_cr > 0
                               THEN total_assets_cr - total_liabilities_cr
                      WHEN equity_capital_cr > 0 THEN equity_capital_cr END AS equity_cr,
                 ROW_NUMBER() OVER (PARTITION BY symbol
                   ORDER BY {qk('period_label')} DESC, id DESC) AS rn
          FROM HistoricalFinancialStatements
          WHERE statement_type = 'BALANCE_SHEET' AND {qk('period_label')} IS NOT NULL
            AND (equity_capital_cr IS NOT NULL OR total_assets_cr IS NOT NULL)
        ), b AS (SELECT * FROM b0 WHERE rn = 1),
        syms AS (
          SELECT symbol FROM q WHERE rn = 1
          UNION SELECT symbol FROM a WHERE rn = 1
          UNION SELECT symbol FROM b
        )
        SELECT syms.symbol, q.period_label AS quarter_label,
               q.sales_cr, q.operating_profit_cr, q.pbt_cr, q.interest_cr,
               q.net_profit_pat_cr,
               b.bs_period, b.equity_capital_cr, b.reserves_cr, b.borrowings_cr,
               b.equity_cr,
               CASE WHEN b.equity_cr IS NOT NULL
                    THEN b.equity_cr + COALESCE(b.borrowings_cr, 0) END AS capital_employed_cr,
               CASE WHEN b.equity_cr IS NULL THEN NULL
                    WHEN q.pbt_cr IS NOT NULL AND q.interest_cr IS NOT NULL
                         THEN (q.pbt_cr + q.interest_cr) * 4.0
                              / (b.equity_cr + COALESCE(b.borrowings_cr, 0)) * 100
                    WHEN a.ebit_annual IS NOT NULL
                         THEN a.ebit_annual / (b.equity_cr + COALESCE(b.borrowings_cr, 0)) * 100
                    END AS roce_pct_annualised,
               CASE WHEN b.equity_cr IS NULL THEN NULL
                    WHEN q.pbt_cr IS NOT NULL AND q.interest_cr IS NOT NULL THEN 'Q_ANNUALISED'
                    WHEN a.ebit_annual IS NOT NULL THEN 'ANNUAL' END AS roce_basis,
               CASE WHEN b.equity_cr IS NULL THEN NULL
                    WHEN q.net_profit_pat_cr IS NOT NULL
                         THEN q.net_profit_pat_cr * 4.0 / b.equity_cr * 100
                    WHEN a.pat_annual IS NOT NULL
                         THEN a.pat_annual / b.equity_cr * 100 END AS roe_pct_annualised,
               CASE WHEN b.equity_cr IS NULL THEN NULL
                    WHEN q.net_profit_pat_cr IS NOT NULL THEN 'Q_ANNUALISED'
                    WHEN a.pat_annual IS NOT NULL THEN 'ANNUAL' END AS roe_basis
        FROM syms
        LEFT JOIN q ON q.symbol = syms.symbol AND q.rn = 1
        LEFT JOIN b ON b.symbol = syms.symbol
        LEFT JOIN a ON a.symbol = syms.symbol AND a.rn = 1""",
      f"""CREATE VIEW IF NOT EXISTS v_8q_pat_check AS
        WITH q AS (
          SELECT symbol, net_profit_pat_cr,
                 ROW_NUMBER() OVER (PARTITION BY symbol
                   ORDER BY {qk('period_label')} DESC, id DESC) AS rn
          FROM HistoricalFinancialStatements
          WHERE statement_type LIKE 'QUARTERLY%' AND {qk('period_label')} IS NOT NULL
        ), agg AS (
          SELECT symbol,
                 COUNT(*) AS quarters_considered,
                 SUM(CASE WHEN net_profit_pat_cr > 0  THEN 1 ELSE 0 END) AS pat_positive_count,
                 SUM(CASE WHEN net_profit_pat_cr <= 0 THEN 1 ELSE 0 END) AS pat_nonpositive_count,
                 SUM(CASE WHEN net_profit_pat_cr IS NULL THEN 1 ELSE 0 END) AS pat_unknown_count
          FROM q WHERE rn <= 8 GROUP BY symbol
        ), cf AS (
          SELECT symbol, period_label AS cfo_period, cfo_cr,
                 ROW_NUMBER() OVER (PARTITION BY symbol
                   ORDER BY {qk('period_label')} DESC, id DESC) AS rn
          FROM HistoricalFinancialStatements
          WHERE statement_type = 'CASH_FLOW' AND {qk('period_label')} IS NOT NULL
            AND cfo_cr IS NOT NULL
        ), ap AS (
          SELECT symbol, period_label AS ebitda_period, operating_profit_cr AS ebitda_cr,
                 ROW_NUMBER() OVER (PARTITION BY symbol
                   ORDER BY {qk('period_label')} DESC, id DESC) AS rn
          FROM HistoricalFinancialStatements
          WHERE statement_type = 'ANNUAL_PL' AND {qk('period_label')} IS NOT NULL
            AND operating_profit_cr IS NOT NULL
        )
        SELECT agg.symbol, agg.quarters_considered,
               agg.pat_positive_count, agg.pat_nonpositive_count, agg.pat_unknown_count,
               CASE WHEN agg.quarters_considered = 8 AND agg.pat_positive_count = 8
                    THEN 1 ELSE 0 END AS has_8q,
               cf.cfo_period, cf.cfo_cr, ap.ebitda_period, ap.ebitda_cr,
               CASE WHEN ap.ebitda_cr > 0 THEN cf.cfo_cr / ap.ebitda_cr END AS cfo_to_ebitda
        FROM agg
        LEFT JOIN cf ON cf.symbol = agg.symbol AND cf.rn = 1
        LEFT JOIN ap ON ap.symbol = agg.symbol AND ap.rn = 1""",
      f"""CREATE VIEW IF NOT EXISTS v_f_filter_inputs AS
        SELECT m.symbol, m.isin, m.name, m.sector,
               s.quarter_label AS shp_quarter,
               s.promoter_pct, s.fii_pct, s.dii_pct, s.pledge_pct, s.prev_inst_pct,
               f.quarter_label AS fin_quarter,
               f.roce_pct_annualised, f.roe_pct_annualised, f.roce_basis, f.roe_basis,
               f.net_profit_pat_cr,
               p.quarters_considered, p.pat_positive_count, p.pat_nonpositive_count,
               p.pat_unknown_count, p.has_8q, p.cfo_cr, p.ebitda_cr, p.cfo_to_ebitda
        FROM (SELECT symbol, isin, name, sector,
                     ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY id) AS rn
              FROM MasterTickers WHERE symbol IS NOT NULL) m
        LEFT JOIN v_latest_shareholding   s ON s.symbol = m.symbol
        LEFT JOIN v_latest_quarterly_fin  f ON f.symbol = m.symbol
        LEFT JOIN v_8q_pat_check          p ON p.symbol = m.symbol
        WHERE m.rn = 1""",
      """CREATE VIEW IF NOT EXISTS v_scan_universe_latest AS
        SELECT o.symbol, o.trade_date, o.close, o.volume
        FROM (SELECT DISTINCT symbol FROM DailyOHLCV) s
        JOIN DailyOHLCV o ON o.symbol = s.symbol
          AND o.trade_date = (SELECT MAX(trade_date) FROM DailyOHLCV WHERE symbol = s.symbol)""",
      f"""CREATE VIEW IF NOT EXISTS v_stock_full_profile AS
        WITH x AS (
          SELECT i.symbol, i.isin, i.name, i.sector,
                 u.trade_date AS last_trade_date, u.close AS last_close, u.volume AS last_volume,
                 i.shp_quarter, i.promoter_pct, i.fii_pct, i.dii_pct, i.pledge_pct,
                 i.fin_quarter, i.net_profit_pat_cr,
                 i.roce_pct_annualised, i.roe_pct_annualised, i.roce_basis, i.roe_basis,
                 i.pat_positive_count, i.has_8q, i.cfo_to_ebitda,
                 i.fii_pct + i.dii_pct AS inst_pct,
                 i.fii_pct + i.dii_pct - i.prev_inst_pct AS inst_change_pp,
                 CASE WHEN i.promoter_pct IS NULL THEN NULL
                      WHEN i.promoter_pct >= 66.67 THEN 1 ELSE 0 END AS f1_promoter,
                 CASE WHEN i.quarters_considered IS NULL THEN NULL
                      WHEN i.pat_nonpositive_count > 0 THEN 0
                      WHEN i.quarters_considered < 8 THEN 0
                      WHEN i.pat_unknown_count > 0 THEN NULL ELSE 1 END AS f2_pat_8q,
                 CASE WHEN i.roce_pct_annualised IS NULL THEN NULL
                      WHEN i.roce_pct_annualised >= 35 THEN 1 ELSE 0 END AS f3_roce,
                 CASE WHEN i.roe_pct_annualised IS NULL THEN NULL
                      WHEN i.roe_pct_annualised >= 25 THEN 1 ELSE 0 END AS f4_roe,
                 CASE WHEN i.pledge_pct IS NULL THEN NULL
                      WHEN i.pledge_pct <= 0.01 THEN 1 ELSE 0 END AS f5_pledge,
                 CASE WHEN i.fii_pct IS NULL OR i.dii_pct IS NULL THEN NULL
                      WHEN i.fii_pct + i.dii_pct < 5 THEN 0
                      WHEN i.prev_inst_pct IS NULL THEN NULL
                      WHEN i.fii_pct + i.dii_pct - i.prev_inst_pct >= 0.10 - 1e-9
                           THEN 1 ELSE 0 END AS f6_institutional,
                 CASE WHEN i.cfo_cr IS NULL OR i.ebitda_cr IS NULL THEN NULL
                      WHEN i.ebitda_cr <= 0 THEN 0
                      WHEN i.cfo_cr / i.ebitda_cr >= 0.5 THEN 1 ELSE 0 END AS f7_cfo_ebitda
          FROM v_f_filter_inputs i
          LEFT JOIN v_scan_universe_latest u ON u.symbol = i.symbol
        )
        SELECT x.*,
               CASE WHEN f1_promoter=0 OR f2_pat_8q=0 OR f3_roce=0 OR f4_roe=0
                         OR f5_pledge=0 OR f6_institutional=0 OR f7_cfo_ebitda=0 THEN 0
                    WHEN f1_promoter IS NULL OR f2_pat_8q IS NULL OR f3_roce IS NULL
                         OR f4_roe IS NULL OR f5_pledge IS NULL
                         OR f6_institutional IS NULL OR f7_cfo_ebitda IS NULL THEN NULL
                    ELSE 1 END AS all_pass_sql
        FROM x""",
    ],
  },
]

# ── run migrations ─────────────────────────────────────────────────────────────
for m in MIGRATIONS:
    if m["version"] <= cur:
        print(f"  skip v{m['version']} (already applied)")
        continue
    print(f"\nApplying v{m['version']}: {m['name']} ({len(m['sqls'])} statements)")
    ok = skipped = 0
    with db:
        for i, sql in enumerate(m["sqls"]):
            label = sql.strip().split('\n')[0][:80]
            try:
                db.execute(sql)
                print(f"  OK [{i+1}] {label}")
                ok += 1
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e) or "already exists" in str(e):
                    print(f"  SK [{i+1}] skip ({e}) - {label}")
                    skipped += 1
                else:
                    print(f"  ✗ [{i+1}] FAILED: {e}")
                    raise
        db.execute("INSERT OR IGNORE INTO db_migrations (version, name) VALUES (?,?)",
                   (m["version"], m["name"]))
    print(f"  >> v{m['version']} done: {ok} applied, {skipped} skipped")

# ── validate ───────────────────────────────────────────────────────────────────
print("\nValidation:")
final_ver = db.execute("SELECT MAX(version) FROM db_migrations").fetchone()[0]
print(f"  DB version now : v{final_ver}")
cfs = db.execute("SELECT COUNT(*) FROM canonical_fact_store").fetchone()[0]
print(f"  canonical_fact_store rows : {cfs}")
col = db.execute("SELECT COUNT(*) FROM pragma_table_info('HistoricalShareholdingPattern') WHERE name='pledge_pct'").fetchone()[0]
print(f"  pledge_pct column present : {'YES' if col else 'NO'}")
views = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'v_%' ORDER BY name")]
print(f"  Views : {', '.join(views)}")

db.close()
print("\n✓ Done.")
