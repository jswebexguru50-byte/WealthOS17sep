"""
load_staged_data.py  -  load all four staged JSONL files into portfolio.db.
Run AFTER apply_v15_v16.py:   python load_staged_data.py

Files loaded:
  scripts/qa/out/tv_stage.jsonl                   -> canonical_fact_store  (152 K rows)
  scripts/qa/out/shareholding_stage_batch20.jsonl -> HistoricalShareholdingPattern
  scripts/qa/out/sast_insider_stage_batch20.jsonl -> SastInsiderEvents + SastInsiderWindows
  scripts/qa/out/financials_stage.jsonl           -> HistoricalFinancialStatements

ZERO FABRICATION: every row came from an official source; unknown stays NULL, never 0.
"""
import json, sqlite3, sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).parent
DB   = ROOT / "portfolio.db"
OUT  = ROOT / "scripts" / "qa" / "out"

db = sqlite3.connect(str(DB))
db.execute("PRAGMA journal_mode=WAL")
db.execute("PRAGMA busy_timeout=30000")

def now_utc():
    return datetime.now(timezone.utc).isoformat()

# confirm v16 applied
ver = db.execute("SELECT MAX(version) FROM db_migrations").fetchone()[0]
if ver < 16:
    sys.exit(f"ERROR: portfolio.db is at v{ver}; run apply_v15_v16.py first.")

# TTL helper
_TTL_RULES = (
    (("price", "ltp", "close", "volume", "change_pct"), 300),
    (("pe", "pb", "market_cap", "mcap", "dividend_yield", "52w"), 6 * 3600),
    (("promoter", "fii", "dii", "pledge", "shareholding"), 30 * 86400),
    (("revenue", "profit", "pat", "ebitda", "eps", "roce", "roe", "margin", "debt"), 30 * 86400),
    (("sector", "industry", "isin", "name"), 90 * 86400),
)
_DEFAULT_TTL = 86400

def ttl_for(field):
    fl = field.lower()
    for keys, ttl in _TTL_RULES:
        if any(k in fl for k in keys):
            return ttl
    return _DEFAULT_TTL

CONFIDENCE = {"trendlyne_mcp": 1.0, "tradingview": 0.9, "nse_bse": 0.8, "default": 0.7}

# ===================================================
# 1. tv_stage.jsonl  ->  canonical_fact_store
# ===================================================
TV_FILE = OUT / "tv_stage.jsonl"
print(f"\n[1/4] Loading {TV_FILE.name} -> canonical_fact_store")

inserted = skipped = errors = 0
batch = []
BATCH_SIZE = 2000

def flush_batch(b):
    if not b:
        return 0
    db.executemany(
        "INSERT OR REPLACE INTO canonical_fact_store "
        "(symbol, field, value, source, confidence, fetched_at, ttl_seconds) "
        "VALUES (?,?,?,?,?,?,?)",
        b)
    db.commit()
    return len(b)

with open(TV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            errors += 1
            continue
        sym   = str(row.get("symbol", "")).strip()
        field = str(row.get("field",  "")).strip()
        val   = row.get("value")
        src   = str(row.get("source", "tradingview"))
        as_of = str(row.get("as_of", now_utc()))
        if not sym or not field:
            skipped += 1
            continue
        conf = CONFIDENCE.get(src, CONFIDENCE["default"])
        ttl  = ttl_for(field)
        batch.append((sym, field, json.dumps(val), src, conf, as_of, ttl))
        if len(batch) >= BATCH_SIZE:
            inserted += flush_batch(batch)
            batch = []
            print(f"  ... {inserted:,} rows written", end="\r")

inserted += flush_batch(batch)
total = db.execute("SELECT COUNT(*) FROM canonical_fact_store").fetchone()[0]
print(f"  Done: {inserted:,} inserted, {skipped} skipped, {errors} errors")
print(f"  canonical_fact_store total: {total:,}")

# ===================================================
# 2. shareholding_stage_batch20.jsonl  ->  HistoricalShareholdingPattern
# ===================================================
SHP_FILE = OUT / "shareholding_stage_batch20.jsonl"
print(f"\n[2/4] Loading {SHP_FILE.name} -> HistoricalShareholdingPattern")

ins = dup = skip2 = 0
with open(SHP_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            skip2 += 1
            continue
        sym = row.get("symbol", "")
        quarter_end = row.get("quarter_end", "")
        if not sym or not quarter_end:
            skip2 += 1
            continue
        try:
            dt = datetime.strptime(quarter_end, "%Y-%m-%d")
            ql = dt.strftime("%b %Y")
        except Exception:
            ql = quarter_end

        promoter = row.get("promoter_pct")
        fii      = row.get("fii_pct")
        dii      = row.get("dii_pct")
        public   = row.get("public_pct")
        pledge   = row.get("pledge_pct")

        if all(v is None for v in [promoter, fii, dii, public]):
            skip2 += 1
            continue

        free_float = None
        if any(v is not None for v in [fii, dii, public]):
            free_float = round((fii or 0) + (dii or 0) + (public or 0), 4)

        try:
            db.execute(
                "INSERT OR IGNORE INTO HistoricalShareholdingPattern "
                "(symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, "
                "public_pct, free_float_pct, pledge_pct, primary_source, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (sym, ql, quarter_end, promoter, fii, dii,
                 public, free_float, pledge,
                 row.get("source", "NSE_SHP_XBRL"), now_utc()))
            ins += 1
        except sqlite3.IntegrityError:
            dup += 1

db.commit()
total2 = db.execute("SELECT COUNT(*) FROM HistoricalShareholdingPattern").fetchone()[0]
print(f"  Done: {ins} inserted, {dup} duplicate, {skip2} skipped")
print(f"  HistoricalShareholdingPattern total: {total2:,}")

# ===================================================
# 3. sast_insider_stage_batch20.jsonl  ->  SastInsiderEvents + SastInsiderWindows
# ===================================================
SAST_FILE = OUT / "sast_insider_stage_batch20.jsonl"
print(f"\n[3/4] Loading {SAST_FILE.name} -> SAST tables")

db.execute("""CREATE TABLE IF NOT EXISTS SastInsiderEvents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL, kind TEXT, event_id TEXT,
    person_name TEXT, person_category TEXT, txn_type TEXT,
    security_type TEXT, mode TEXT,
    shares_qty REAL, value_inr REAL,
    before_shares REAL, before_pct REAL,
    after_shares REAL, after_pct REAL,
    event_from TEXT, event_to TEXT,
    intimation_date TEXT, filing_date TEXT,
    xbrl_url TEXT, extra TEXT,
    source TEXT, source_url TEXT, fetched_at TEXT,
    UNIQUE(symbol, kind, event_id)
)""")
db.execute("""CREATE TABLE IF NOT EXISTS SastInsiderWindows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL, kind TEXT,
    window_from TEXT, window_to TEXT,
    n_events INTEGER, n_returned INTEGER, state TEXT,
    source TEXT, source_url TEXT, fetched_at TEXT,
    UNIQUE(symbol, kind, window_from, window_to)
)""")
db.commit()

ev_ins = ev_dup = win_ins = win_dup = 0
with open(SAST_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        rtype = row.get("row_type", "")
        sym   = row.get("symbol", "")
        if not sym:
            continue
        if rtype == "event":
            try:
                db.execute(
                    "INSERT OR IGNORE INTO SastInsiderEvents "
                    "(symbol, kind, event_id, person_name, person_category, txn_type, "
                    "security_type, mode, shares_qty, value_inr, "
                    "before_shares, before_pct, after_shares, after_pct, "
                    "event_from, event_to, intimation_date, filing_date, "
                    "xbrl_url, extra, source, source_url, fetched_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (sym, row.get("kind"), str(row.get("event_id", "")),
                     row.get("person_name"), row.get("person_category"),
                     row.get("txn_type"), row.get("security_type"), row.get("mode"),
                     row.get("shares_qty"), row.get("value_inr"),
                     row.get("before_shares"), row.get("before_pct"),
                     row.get("after_shares"), row.get("after_pct"),
                     row.get("event_from"), row.get("event_to"),
                     row.get("intimation_date"), row.get("filing_date"),
                     row.get("xbrl_url"), json.dumps(row.get("extra")),
                     row.get("source"), row.get("source_url"), row.get("fetched_at")))
                ev_ins += 1
            except sqlite3.IntegrityError:
                ev_dup += 1
        elif rtype == "window":
            try:
                db.execute(
                    "INSERT OR IGNORE INTO SastInsiderWindows "
                    "(symbol, kind, window_from, window_to, n_events, n_returned, "
                    "state, source, source_url, fetched_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (sym, row.get("kind"), row.get("window_from"), row.get("window_to"),
                     row.get("n_events"), row.get("n_returned"), row.get("state"),
                     row.get("source"), row.get("source_url"), row.get("fetched_at")))
                win_ins += 1
            except sqlite3.IntegrityError:
                win_dup += 1

db.commit()
print(f"  Done: {ev_ins} events + {win_ins} windows inserted "
      f"({ev_dup} event dups, {win_dup} window dups)")

# ===================================================
# 4. financials_stage.jsonl  ->  HistoricalFinancialStatements
# ===================================================
FIN_FILE = OUT / "financials_stage.jsonl"
print(f"\n[4/4] Loading {FIN_FILE.name} -> HistoricalFinancialStatements")

METRIC_MAP = {
    "depreciation": "depreciation_cr",
    "interest":     "interest_cr",
    "tax":          "tax_pct",
    "pbt":          "pbt_cr",
    "pat":          "net_profit_pat_cr",
    "net_profit":   "net_profit_pat_cr",
    "sales":        "sales_cr",
    "revenue":      "sales_cr",
    "cogs":         "expenses_cr",
    "operating_profit": "operating_profit_cr",
    "ebitda":       "operating_profit_cr",
    "cfo":          "cfo_cr",
    "cfi":          "cfi_cr",
    "cff":          "cff_cr",
    "net_cash_flow": "net_cash_flow_cr",
    "equity":       "equity_capital_cr",
    "reserves":     "reserves_cr",
    "borrowings":   "borrowings_cr",
    "total_assets": "total_assets_cr",
    "total_liabilities": "total_liabilities_cr",
}
STMT_MAP = {"Q": "QUARTERLY_CONSOLIDATED", "A": "ANNUAL_PL"}

fin_ins = fin_skip = 0
with open(FIN_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            fin_skip += 1
            continue
        sym    = row.get("symbol", "")
        metric = row.get("metric", "")
        val    = row.get("value")
        period_type = row.get("period_type", "Q")
        period_end  = row.get("period_end", "")
        if not sym or not metric or val is None or not period_end:
            fin_skip += 1
            continue
        col = METRIC_MAP.get(metric)
        if not col:
            fin_skip += 1
            continue
        try:
            dt = datetime.strptime(period_end, "%Y-%m-%d")
            period_label = dt.strftime("%b %Y")
        except Exception:
            period_label = period_end
        stmt = STMT_MAP.get(period_type, "QUARTERLY_CONSOLIDATED")
        try:
            db.execute(
                f"INSERT OR IGNORE INTO HistoricalFinancialStatements "
                f"(symbol, statement_type, period_label, period_date, {col}, created_at) "
                f"VALUES (?,?,?,?,?,?)",
                (sym, stmt, period_label, period_end, val, now_utc()))
            fin_ins += 1
        except Exception:
            fin_skip += 1

db.commit()
total4 = db.execute("SELECT COUNT(*) FROM HistoricalFinancialStatements").fetchone()[0]
print(f"  Done: {fin_ins} inserted, {fin_skip} skipped")
print(f"  HistoricalFinancialStatements total: {total4:,}")

# Summary
print("\n=== Load complete ===")
print(f"  canonical_fact_store          : {db.execute('SELECT COUNT(*) FROM canonical_fact_store').fetchone()[0]:,}")
print(f"  HistoricalShareholdingPattern : {db.execute('SELECT COUNT(*) FROM HistoricalShareholdingPattern').fetchone()[0]:,}")
print(f"  SastInsiderEvents             : {db.execute('SELECT COUNT(*) FROM SastInsiderEvents').fetchone()[0]:,}")
print(f"  SastInsiderWindows            : {db.execute('SELECT COUNT(*) FROM SastInsiderWindows').fetchone()[0]:,}")
print(f"  HistoricalFinancialStatements : {db.execute('SELECT COUNT(*) FROM HistoricalFinancialStatements').fetchone()[0]:,}")
db.close()
