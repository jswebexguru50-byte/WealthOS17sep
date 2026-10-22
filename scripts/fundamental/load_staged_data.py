#!/usr/bin/env python3
"""Load validated staged data into a portfolio DB.  Stdlib only.  DRY-RUN by default; idempotent; re-runnable.

Only rows that pass scripts/qa/validate_staged.py (the hard gate) are considered.  Nothing is invented:
 * a non-null stored value is NEVER overwritten by null, and never by a *different* non-null value
   (conflicts are counted and listed for human review, not auto-resolved);
 * NOT NULL columns of the legacy tables are never filled with zeros - a row that cannot be built from real
   values is skipped and counted.

Targets
  shareholding -> HistoricalShareholdingPattern (symbol + as_of_date; pledge_pct; label 'Mon YYYY') and
                  ShareholdingOfficial (full provenance: source_url, filing_date, fetched_at, share counts)
  sast         -> SastInsiderEvents / SastInsiderWindows (runtime-created, provenance columns)
  docs         -> ExchangeDocuments (runtime-created, provenance columns)
  tv           -> canonical_fact_store (source 'tradingview', per-field TTL, confidence from source_waterfall) +
                  TradingViewFactProvenance (period_end, tv_column, exchange, as_of)
  financials   -> HistoricalFinancialStatements, INR crore only (stage unit must be INR_crore)

  python scripts/fundamental/load_staged_data.py --db scripts/qa/out/portfolio_copy.db [--apply-v16] [--apply]
Refuses the live portfolio.db unless --allow-live.  Writes <stage-dir>/load_report.json.
"""
import argparse
import importlib.util
import json
import os
import re
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
QA = os.path.join(ROOT, "scripts", "qa")
OUT = os.path.join(QA, "out")
LIVE_DB = os.path.join(ROOT, "portfolio.db")


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


validator = _load("validate_staged", os.path.join(QA, "validate_staged.py"))
sys.path.insert(0, HERE)
import canonical_fact_store as cfs  # noqa: E402
import source_waterfall as swf  # noqa: E402

SAST_EV_DDL = """CREATE TABLE IF NOT EXISTS SastInsiderEvents (
  symbol TEXT NOT NULL, kind TEXT NOT NULL, event_id TEXT NOT NULL,
  person_name TEXT, person_category TEXT, txn_type TEXT, security_type TEXT, mode TEXT,
  shares_qty REAL, value_inr REAL, before_shares REAL, before_pct REAL, after_shares REAL, after_pct REAL,
  event_from TEXT, event_to TEXT, intimation_date TEXT, filing_date TEXT, xbrl_url TEXT, extra_json TEXT,
  source TEXT NOT NULL, source_url TEXT NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, kind, event_id))"""
SAST_WIN_DDL = """CREATE TABLE IF NOT EXISTS SastInsiderWindows (
  symbol TEXT NOT NULL, kind TEXT NOT NULL, window_from TEXT NOT NULL, window_to TEXT NOT NULL,
  n_events INTEGER NOT NULL, n_returned INTEGER, state TEXT NOT NULL,
  source TEXT NOT NULL, source_url TEXT NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, kind, window_to))"""
DOC_DDL = ("CREATE TABLE IF NOT EXISTS ExchangeDocuments (symbol TEXT NOT NULL, doc_type TEXT NOT NULL, "
           "title TEXT, published_at TEXT, source TEXT, url TEXT NOT NULL, content_sha256 TEXT, "
           "local_path TEXT, fetched_at TEXT, PRIMARY KEY (symbol, doc_type, url))")
SHP_OFF_DDL = """CREATE TABLE IF NOT EXISTS ShareholdingOfficial (
  symbol TEXT NOT NULL, quarter_end TEXT NOT NULL,
  promoter_pct REAL, fii_pct REAL, dii_pct REAL, mf_pct REAL, public_pct REAL,
  pledge_pct REAL, pledged_shares REAL, promoter_shares REAL, total_shares REAL,
  pledge_status TEXT, pledge_basis TEXT, flags TEXT,
  source TEXT NOT NULL, source_url TEXT NOT NULL, filing_date TEXT, fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, quarter_end))"""

TV_PROV_DDL = ("CREATE TABLE IF NOT EXISTS TradingViewFactProvenance (symbol TEXT NOT NULL, field TEXT NOT NULL, period_end TEXT, "
               "tv_column TEXT NOT NULL, exchange TEXT NOT NULL, as_of TEXT NOT NULL, PRIMARY KEY (symbol, field))")
SAST_EV_COLS = ("person_name", "person_category", "txn_type", "security_type", "mode", "shares_qty", "value_inr",
                "before_shares", "before_pct", "after_shares", "after_pct", "event_from", "event_to",
                "intimation_date", "filing_date", "xbrl_url", "extra_json", "source", "source_url", "fetched_at")
SAST_WIN_COLS = ("window_from", "n_events", "n_returned", "state", "source", "source_url", "fetched_at")
DOC_COLS = ("title", "published_at", "source", "content_sha256", "local_path", "fetched_at")
SHP_OFF_COLS = ("promoter_pct", "fii_pct", "dii_pct", "mf_pct", "public_pct", "pledge_pct", "pledged_shares",
                "promoter_shares", "total_shares", "pledge_status", "pledge_basis", "flags", "source", "source_url",
                "filing_date", "fetched_at")
PROVENANCE_COLS = {"source", "source_url", "fetched_at", "filing_date", "title", "published_at", "local_path",
                   "xbrl_url", "extra_json", "flags", "n_returned", "state", "window_from"}

FIN_COLS = {"sales": "sales_cr", "total_expenses": "expenses_cr", "operating_profit": "operating_profit_cr",
            "other_income": "other_income_cr", "interest": "interest_cr", "depreciation": "depreciation_cr",
            "pbt": "pbt_cr", "pat": "net_profit_pat_cr", "equity_capital": "equity_capital_cr"}
FIN_PRIMARY_SOURCE = "NSE_XBRL_FILING"

# Per-field TTL (seconds).  Quote-like data goes stale in minutes; fundamentals follow the filing cadence.
TTL_LIVE, TTL_SESSION, TTL_FUND, TTL_STATIC = 300, 6 * 3600, 30 * 86400, 90 * 86400
TV_TTL = {f: TTL_LIVE for f in ("ltp", "volume_day", "value_traded_day", "rel_volume")}
TV_TTL.update({f: TTL_SESSION for f in (
    "market_cap_cr", "pe_ttm", "pb", "pb_fy", "dividend_yield", "rsi", "recommend_all", "perf_1w", "perf_1m", "perf_3m",
    "high_52w", "low_52w", "avg_volume", "avg_volume_30d", "sma20", "sma50", "sma200", "ema20", "ema50", "ema200",
    "beta_1y", "float_shares")})
TV_TTL.update({f: TTL_STATIC for f in ("sector", "industry")})
FUND_HINTS = ("_fy", "_ttm", "quarterly", "roe", "roa", "roce", "opm", "margin", "eps", "debt", "total_assets",
              "borrowings", "piotroski", "altman", "sales_growth", "net_income", "ebitda", "cfo")


def tv_ttl(field):
    if field in TV_TTL:
        return TV_TTL[field]
    if any(h in field for h in FUND_HINTS):
        return TTL_FUND
    return swf.DEFAULT_TTL


# ---------------------------------------------------------------------------- DB helpers
def connect(db, write):
    path = os.path.abspath(db).replace("\\", "/")
    if write:
        c = sqlite3.connect(path, timeout=60)
        c.execute("PRAGMA busy_timeout=60000")
        return c
    return sqlite3.connect("file:%s?mode=ro" % path, uri=True)


def has_table(con, name):
    return con.execute("SELECT 1 FROM sqlite_master WHERE name=?", (name,)).fetchone() is not None


def has_col(con, table, col):
    return any(r[1] == col for r in con.execute("PRAGMA table_info(%s)" % table))


def extract_v16_sqls(ts_path=None):
    """MIGRATION_V16_SQLS() lives in database.ts (template literals with ${...}); evaluate it with node."""
    ts_path = ts_path or os.path.join(ROOT, "src", "server", "database.ts")
    with open(ts_path, encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r"export function MIGRATION_V16_SQLS\(\)[^{]*\{", src)
    if not m:
        raise RuntimeError("MIGRATION_V16_SQLS not found in %s" % ts_path)
    i, depth = m.end(), 1
    while depth and i < len(src):  # brace matching ignoring ${...}-free braces in strings is fine: body has balanced braces
        depth += {"{": 1, "}": -1}.get(src[i], 0)
        i += 1
    body = src[m.end():i - 1]
    body = body.replace("(c: string)", "(c)")
    js = "const f=()=>{%s};process.stdout.write(JSON.stringify(f()))" % body
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=60)
    if out.returncode:
        raise RuntimeError("node failed: " + out.stderr[:500])
    return json.loads(out.stdout)


def apply_v16(db, log=print):
    sqls = extract_v16_sqls()
    con = connect(db, True)
    ok = skipped = 0
    try:
        con.execute("CREATE TABLE IF NOT EXISTS db_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, "
                    "applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
        for s in sqls:
            try:
                con.execute(s)
                ok += 1
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e) or "already exists" in str(e):
                    skipped += 1
                else:
                    raise RuntimeError("v16 statement failed: %s :: %s" % (e, s[:80]))
        con.execute("INSERT OR IGNORE INTO db_migrations (version, name) VALUES (16, 'perf_indexes_views_pledge_fact_store')")
        con.commit()
    finally:
        con.close()
    log("v16 applied: %d statements ok, %d already-present" % (ok, skipped))
    return {"statements": len(sqls), "ok": ok, "already_present": skipped}


def stats():
    return {"insert": 0, "update": 0, "unchanged": 0, "skipped": {}, "conflicts_kept_existing": 0, "conflict_samples": []}


def skip(st, why, n=1):
    st["skipped"][why] = st["skipped"].get(why, 0) + n


def conflict(st, **kw):
    st["conflicts_kept_existing"] += 1
    if len(st["conflict_samples"]) < 20:
        st["conflict_samples"].append(kw)


def same(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-6 * max(1.0, abs(a), abs(b))
    return a == b


def merge_fill(existing, new, cols, tol=None):
    """Fill NULL columns from `new`; return (updates dict, conflicts list).  Never null-overwrites, never replaces non-null."""
    upd, conf = {}, []
    for c in cols:
        nv, ov = new.get(c), existing.get(c)
        if nv is None:
            continue
        if ov is None:
            upd[c] = nv
        elif not same(ov, nv):
            conf.append((c, ov, nv))
    return upd, conf


# ---------------------------------------------------------------------------- loaders
def quarter_label(qe):
    return validator.pdate(qe).strftime("%b %Y")


def legacy_label(qe):
    return validator.pdate(qe).strftime("%d-%b-%Y").upper()


def load_shareholding(con, rows, write):
    st = stats()
    st["official_provenance_rows"] = 0
    have_hist = has_table(con, "HistoricalShareholdingPattern")
    have_pledge = have_hist and has_col(con, "HistoricalShareholdingPattern", "pledge_pct")
    if write and not have_pledge:
        raise RuntimeError("HistoricalShareholdingPattern.pledge_pct missing - apply migration v16 first (--apply-v16)")
    if write:
        con.execute(SHP_OFF_DDL)
    have_off = has_table(con, "ShareholdingOfficial")
    for r in sorted(rows, key=lambda x: (x["symbol"], x["quarter_end"])):
        s, qe = r["symbol"], r["quarter_end"][:10]
        # --- full-provenance table
        rec = dict(r)
        rec["flags"] = json.dumps(r.get("flags", []))
        ex = con.execute("SELECT %s FROM ShareholdingOfficial WHERE symbol=? AND quarter_end=?" % ",".join(SHP_OFF_COLS),
                         (s, qe)).fetchone() if have_off else None
        if ex is None:
            st["official_provenance_rows"] += 1
            if write:
                cols = ("symbol", "quarter_end") + SHP_OFF_COLS
                con.execute("INSERT INTO ShareholdingOfficial (%s) VALUES (%s)" % (",".join(cols), ",".join("?" * len(cols))),
                            (s, qe) + tuple(rec.get(c) for c in SHP_OFF_COLS))
        else:
            old = dict(zip(SHP_OFF_COLS, ex))
            upd, conf = merge_fill(old, rec, [c for c in SHP_OFF_COLS if c not in PROVENANCE_COLS])
            for c, ov, nv in conf:
                conflict(st, table="ShareholdingOfficial", symbol=s, quarter_end=qe, column=c, existing=ov, staged=nv)
            if upd and write:
                con.execute("UPDATE ShareholdingOfficial SET %s WHERE symbol=? AND quarter_end=?" % ",".join(c + "=?" for c in upd),
                            tuple(upd.values()) + (s, qe))
        # --- legacy table consumed by filters
        if not have_hist:
            skip(st, "hist_table_missing")
            continue
        pcols = ["promoter_pct", "fii_pct", "dii_pct", "public_pct"] + (["pledge_pct"] if have_pledge else [])
        lbl = quarter_label(qe)
        sel = ("SELECT id, %s, primary_source FROM HistoricalShareholdingPattern WHERE symbol=? AND "
               "(as_of_date=? OR quarter_label IN (?,?))" % ",".join(pcols))
        ex = con.execute(sel, (s, qe, lbl, legacy_label(qe))).fetchone()
        if ex is not None:
            old = dict(zip(pcols, ex[1:-1]))
            upd, conf = merge_fill(old, r, pcols)
            for c, ov, nv in conf:
                conflict(st, table="HistoricalShareholdingPattern", symbol=s, quarter_end=qe, column=c, existing=ov, staged=nv)
            if upd:
                st["update"] += 1
                if write:
                    sets = ",".join(c + "=?" for c in upd) + ",as_of_date=COALESCE(as_of_date,?)"
                    con.execute("UPDATE HistoricalShareholdingPattern SET %s WHERE id=?" % sets, tuple(upd.values()) + (qe, ex[0]))
            else:
                st["unchanged"] += 1
            continue
        if any(r.get(k) is None for k in ("promoter_pct", "fii_pct", "dii_pct", "public_pct")):
            skip(st, "insert_skipped_NOT_NULL_columns_unknown(fii/dii/public)")
            continue
        st["insert"] += 1
        if write:
            # sum_total = promoter + public (fii/dii are subsets of public); free_float = public: both plain arithmetic on staged values
            cols = ["symbol", "quarter_label", "as_of_date", "promoter_pct", "fii_pct", "dii_pct", "public_pct", "sum_total_pct",
                    "free_float_pct", "primary_source", "secondary_source"] + (["pledge_pct"] if have_pledge else [])
            vals = [s, lbl, qe, r["promoter_pct"], r["fii_pct"], r["dii_pct"], r["public_pct"],
                    round(r["promoter_pct"] + r["public_pct"], 4), r["public_pct"], r["source"], r.get("source_url")]
            if have_pledge:
                vals.append(r.get("pledge_pct"))
            con.execute("INSERT INTO HistoricalShareholdingPattern (%s) VALUES (%s)" % (",".join(cols), ",".join("?" * len(cols))), vals)
    return st


def _upsert_keyed(con, table, keycols, datacols, recs, write, st):
    for r in recs:
        key = tuple(r[k] for k in keycols)
        ex = con.execute("SELECT %s FROM %s WHERE %s" % (",".join(datacols), table, " AND ".join(k + "=?" for k in keycols)),
                         key).fetchone() if con is not None and has_table(con, table) else None
        if ex is None:
            st["insert"] += 1
            if write:
                cols = list(keycols) + list(datacols)
                con.execute("INSERT INTO %s (%s) VALUES (%s)" % (table, ",".join(cols), ",".join("?" * len(cols))),
                            key + tuple(r.get(c) for c in datacols))
            continue
        old = dict(zip(datacols, ex))
        upd, conf = merge_fill(old, r, [c for c in datacols if c not in PROVENANCE_COLS])
        for c, ov, nv in conf:
            conflict(st, table=table, key=list(map(str, key)), column=c, existing=ov, staged=nv)
        # provenance of the stored row stays with the stored values; fill provenance only where NULL
        for c in datacols:
            if c in PROVENANCE_COLS and old.get(c) is None and r.get(c) is not None:
                upd[c] = r[c]
        if upd:
            st["update"] += 1
            if write:
                con.execute("UPDATE %s SET %s WHERE %s" % (table, ",".join(c + "=?" for c in upd), " AND ".join(k + "=?" for k in keycols)),
                            tuple(upd.values()) + key)
        else:
            st["unchanged"] += 1


def load_sast(con, rows, write):
    st = stats()
    if write:
        con.execute(SAST_EV_DDL)
        con.execute(SAST_WIN_DDL)
    evs = [dict(r, extra_json=json.dumps(r.get("extra", {}), sort_keys=True)) for r in rows if r.get("row_type") != "window"]
    wins = [r for r in rows if r.get("row_type") == "window"]
    _upsert_keyed(con, "SastInsiderEvents", ("symbol", "kind", "event_id"), list(SAST_EV_COLS), evs, write, st)
    _upsert_keyed(con, "SastInsiderWindows", ("symbol", "kind", "window_to"), list(SAST_WIN_COLS), wins, write, st)
    st["events"], st["windows"] = len(evs), len(wins)
    return st


def load_docs(con, rows, write):
    st = stats()
    if write:
        con.execute(DOC_DDL)
    _upsert_keyed(con, "ExchangeDocuments", ("symbol", "doc_type", "url"), list(DOC_COLS), rows, write, st)
    return st


def load_tv(con, rows, write):
    st = stats()
    have = has_table(con, "canonical_fact_store")
    if write and not have:
        raise RuntimeError("canonical_fact_store missing - apply migration v16 first (--apply-v16)")
    conf = swf.DEFAULT_CONFIDENCE["tradingview"]
    existing = {}
    if have:
        for sym, f, v, src, c, fa, ttl in con.execute("SELECT symbol, field, value, source, confidence, fetched_at, ttl_seconds FROM canonical_fact_store WHERE source='tradingview'"):
            existing[(sym, f)] = (v, fa)
    facts = []
    for r in rows:
        k = (r["symbol"], r["field"])
        ex = existing.get(k)
        if ex is not None and ex[0] == json.dumps(r["value"]):
            ts_old, ts_new = ex[1], cfs.iso(r["as_of"])
            if ts_old is not None and cfs.to_dt(ts_old) >= cfs.to_dt(ts_new):
                st["unchanged"] += 1
                continue
        if ex is not None and ex[1] and cfs.to_dt(ex[1]) > cfs.to_dt(r["as_of"]):
            skip(st, "older_than_stored")
            continue
        facts.append({"symbol": r["symbol"], "field": r["field"], "value": r["value"], "source": "tradingview",
                      "confidence": conf, "fetched_at": r["as_of"], "ttl_seconds": tv_ttl(r["field"])})
        st["update" if ex else "insert"] += 1
    if write and facts:
        # canonical_fact_store PK is (symbol, field): the fiscal period / TV column / exchange live in the provenance table
        con.execute(TV_PROV_DDL)
        by_k = {(r["symbol"], r["field"]): r for r in rows}
        con.executemany("INSERT OR REPLACE INTO TradingViewFactProvenance (symbol, field, period_end, tv_column, exchange, as_of) VALUES (?,?,?,?,?,?)",
                        [(f["symbol"], f["field"], by_k[(f["symbol"], f["field"])].get("period_end"), by_k[(f["symbol"], f["field"])].get("tv_column"),
                          by_k[(f["symbol"], f["field"])].get("exchange"), f["fetched_at"]) for f in facts])
        written = cfs.FactStore(con).put_many(facts)  # its own confidence rule may decline some rows
        st["written_by_fact_store"] = written
        if written < len(facts):
            skip(st, "declined_by_fact_store_confidence_rule", len(facts) - written)
    return st


def fin_prepare(rows):
    """Group accepted financial rows into HistoricalFinancialStatements rows; CONSOLIDATED wins over STANDALONE."""
    chosen = {}
    for r in rows:
        if r["metric"] not in FIN_COLS:
            continue
        stype = {"Q": "QUARTERLY_PL", "FY": "ANNUAL_PL"}.get(r["period_type"])
        if r["metric"] == "equity_capital":
            stype = "BALANCE_SHEET"
        if stype is None:
            continue
        key = (r["symbol"], stype, r["period_end"][:10])
        scope_rank = 0 if r["scope"] == "CONSOLIDATED" else 1
        cur = chosen.get(key)
        if cur is None or scope_rank < cur["rank"]:
            chosen[key] = {"rank": scope_rank, "scope": r["scope"], "cols": {}, "src": r["source_url"], "avail": r["available_at"]}
        if chosen[key]["rank"] == scope_rank:
            chosen[key]["cols"][FIN_COLS[r["metric"]]] = r["value"]
    return chosen


def load_fin(con, rows, write):
    st = stats()
    if not rows:
        st["note"] = "no financial rows staged"
        return st
    have = has_table(con, "HistoricalFinancialStatements")
    if not have:
        skip(st, "hist_fin_table_missing", len(rows))
        return st
    for (sym, stype, pend), g in sorted(fin_prepare(rows).items()):
        label = validator.pdate(pend).strftime("%b %Y")
        cols = list(g["cols"])
        ex = con.execute("SELECT %s FROM HistoricalFinancialStatements WHERE symbol=? AND statement_type=? AND period_label=?" % ",".join(cols),
                         (sym, stype, label)).fetchone()
        if ex is None:
            st["insert"] += 1
            if write:
                c2 = ["symbol", "statement_type", "period_label", "period_date", "primary_source", "secondary_source"] + cols
                v2 = [sym, stype, label, pend, "%s_%s" % (FIN_PRIMARY_SOURCE, g["scope"]), g["src"]] + [g["cols"][c] for c in cols]
                con.execute("INSERT INTO HistoricalFinancialStatements (%s) VALUES (%s)" % (",".join(c2), ",".join("?" * len(c2))), v2)
            continue
        upd, conf = merge_fill(dict(zip(cols, ex)), g["cols"], cols)
        for c, ov, nv in conf:
            conflict(st, table="HistoricalFinancialStatements", symbol=sym, statement_type=stype, period=label, column=c, existing=ov, staged=nv)
        if upd:
            st["update"] += 1
            if write:
                con.execute("UPDATE HistoricalFinancialStatements SET %s WHERE symbol=? AND statement_type=? AND period_label=?"
                            % ",".join(c + "=?" for c in upd), tuple(upd.values()) + (sym, stype, label))
        else:
            st["unchanged"] += 1
    return st


LOADERS = {"shareholding": load_shareholding, "sast": load_sast, "docs": load_docs, "tv": load_tv, "financials": load_fin}
ORDER = ("shareholding", "sast", "docs", "tv", "financials")


def run(db, stage_dir=OUT, kinds=ORDER, apply=False, do_v16=False, allow_live=False, log=print):
    if os.path.abspath(db) == os.path.abspath(LIVE_DB) and apply and not allow_live:
        raise SystemExit("refusing to write the live portfolio.db without --allow-live")
    if not os.path.isfile(db):
        raise SystemExit("db not found: %s" % db)
    report = {"db": db, "mode": "APPLY" if apply else "DRY-RUN", "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    if do_v16:
        if not apply:
            log("DRY-RUN: --apply-v16 ignored (would apply %d statements)" % len(extract_v16_sqls()))
        else:
            report["v16"] = apply_v16(db, log)
    accepted, vrep = validator.validate_stage(stage_dir)
    report["validation"] = {k: {x: v[x] for x in ("rows_read", "accepted", "rejected_total", "duplicates_identical_collapsed",
                                                   "duplicates_conflicting_rejected", "reject_reasons")} for k, v in vrep["kinds"].items()}
    con = connect(db, apply)
    report["loaded"] = {}
    try:
        for k in ORDER:
            if k not in kinds:
                continue
            if not accepted.get(k):
                report["loaded"][k] = {"note": "no accepted rows (stage file absent or empty)"}
                continue
            if apply:
                con.execute("BEGIN IMMEDIATE")
            try:
                report["loaded"][k] = LOADERS[k](con, accepted[k], apply)
                if apply:
                    con.commit()
            except Exception:
                if apply:
                    con.rollback()
                raise
            s = report["loaded"][k]
            log("%-12s insert=%d update=%d unchanged=%d conflicts_kept=%d skipped=%s" % (
                k, s["insert"], s["update"], s["unchanged"], s["conflicts_kept_existing"], s["skipped"]))
    finally:
        con.close()
    report["finished_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(os.path.join(stage_dir, "load_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, default=str)
    if not apply:
        log("DRY-RUN: no writes performed. Add --apply to write.")
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=os.path.join(OUT, "portfolio_copy.db"))
    ap.add_argument("--stage-dir", default=OUT)
    ap.add_argument("--kinds", default=",".join(ORDER))
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--apply-v16", action="store_true")
    ap.add_argument("--allow-live", action="store_true")
    a = ap.parse_args(argv)
    run(a.db, a.stage_dir, tuple(x for x in a.kinds.split(",") if x), a.apply, a.apply_v16, a.allow_live)
    return 0


if __name__ == "__main__":
    sys.exit(main())
