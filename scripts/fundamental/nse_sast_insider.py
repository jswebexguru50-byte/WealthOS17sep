#!/usr/bin/env python3
"""Official NSE SAST (Reg 29) and insider-trading (SEBI PIT, Reg 7) disclosures, last 12 months.

ZERO FABRICATION: rows are the disclosures NSE publishes, field-for-field; '-'/blank -> null.
"No filings in the window" is recorded as an explicit WINDOW row with n_events=0 and the query window
(registry state none_disclosed), never as a null and never as an assumed value.

Endpoints (public, cookie warm-up only):
  SAST : https://www.nseindia.com/api/corporate-sast-reg29?index=equities&symbol=SYM&from_date=DD-MM-YYYY&to_date=DD-MM-YYYY
  PIT  : https://www.nseindia.com/api/corporates-pit?index=equities&symbol=SYM&from_date=...&to_date=...
BSE-only numeric scrip codes are skipped (no NSE series; BSE API returns 403 to non-browser clients).

--stage-only (default) writes JSONL (scripts/qa/out/sast_insider_stage.jsonl); never writes portfolio.db.
--apply --apply-db X [--yes] loads the stage file into SastInsiderEvents / SastInsiderWindows
(CREATE TABLE IF NOT EXISTS, provenance columns); dry-run unless --yes.
"""
import argparse
import importlib.util
import json
import os
import sqlite3
import sys
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("nse_bse_shareholding", os.path.join(HERE, "nse_bse_shareholding.py"))
shp = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("nse_bse_shareholding", shp)
_spec.loader.exec_module(shp)

SAST_URL = "https://www.nseindia.com/api/corporate-sast-reg29?index=equities&symbol={sym}&from_date={f}&to_date={t}"
PIT_URL = "https://www.nseindia.com/api/corporates-pit?index=equities&symbol={sym}&from_date={f}&to_date={t}"
DEFAULT_STAGE = os.path.join(shp.OUT_DIR, "sast_insider_stage.jsonl")


def _s(v):
    if v is None:
        return None
    v = str(v).strip()
    return None if v in ("", "-", "--", "NA", "N/A", "null") else v


def _n(v):
    v = _s(v)
    if v is None:
        return None
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None


def _d(v):
    """Any NSE date/datetime string -> ISO date (None if unparseable)."""
    v = _s(v)
    if v is None:
        return None
    head = v.split(" to ")[0].split(",")[0].strip()
    for cand in (head, head[:11], head[:10]):
        d = shp.normalize_date(cand)
        if d:
            return d
    return None


def _range(v):
    v = _s(v)
    if v is None:
        return None, None
    if " to " in v:
        a, b = v.split(" to ", 1)
        return _d(a), _d(b)
    d = _d(v)
    return d, d


def parse_pit(text):
    """corporates-pit JSON -> list of event dicts (no provenance yet)."""
    j = json.loads(text)
    out = []
    for r in j.get("data", []) if isinstance(j, dict) else []:
        out.append({
            "kind": "PIT_REG7", "event_id": _s(r.get("did")) or _s(r.get("pid")),
            "person_name": _s(r.get("acqName")), "person_category": _s(r.get("personCategory")),
            "txn_type": _s(r.get("tdpTransactionType")), "security_type": _s(r.get("secType")),
            "mode": _s(r.get("acqMode")),
            "shares_qty": _n(r.get("secAcq")), "value_inr": _n(r.get("secVal")),
            "before_shares": _n(r.get("befAcqSharesNo")), "before_pct": _n(r.get("befAcqSharesPer")),
            "after_shares": _n(r.get("afterAcqSharesNo")), "after_pct": _n(r.get("afterAcqSharesPer")),
            "event_from": _d(r.get("acqfromDt")), "event_to": _d(r.get("acqtoDt")),
            "intimation_date": _d(r.get("intimDt")), "filing_date": _d(r.get("date")),
            "xbrl_url": _s(r.get("xbrl")),
            "extra": {k: _s(r.get(k)) for k in ("anex", "exchange", "derivativeType", "buyValue", "buyQuantity",
                                                "sellValue", "sellquantity", "tdpDerivativeContractType",
                                                "securitiesTypePost", "remarks")},
        })
    return out


def parse_sast(text):
    """corporate-sast-reg29 JSON -> list of event dicts."""
    j = json.loads(text)
    out = []
    for r in j.get("data", []) if isinstance(j, dict) else []:
        a, b = _range(r.get("acquirerDate"))
        acq, sale = _n(r.get("noOfShareAcq")), _n(r.get("noOfShareSale"))
        sale_type = _s(r.get("acqSaleType"))
        out.append({
            "kind": "SAST_REG29", "event_id": _s(r.get("application_no")),
            "person_name": _s(r.get("acquirerName")),
            "person_category": {"Y": "Promoter", "N": "Non-promoter"}.get(_s(r.get("promoterType")) or "", None),
            "txn_type": sale_type, "security_type": _s(r.get("acqType")), "mode": _s(r.get("acquisitionMode")),
            "shares_qty": sale if (sale_type or "").lower() == "sale" else acq, "value_inr": None,
            "before_shares": None, "before_pct": None,
            "after_shares": _n(r.get("noOfShareAft")) if _n(r.get("noOfShareAft")) is not None else _n(r.get("totAftShare")),
            "after_pct": None,
            "event_from": a, "event_to": b, "intimation_date": None, "filing_date": _d(r.get("timestamp") or r.get("sysTime")),
            "xbrl_url": _s(r.get("attachement")),
            "extra": {"reg_type": _s(r.get("regType")), "total_acq_share": _n(r.get("totAcqShare")),
                      "total_after_share": _n(r.get("totAftShare")), "total_after_diluted": _s(r.get("totAftDiluted")),
                      "total_sale_share": _n(r.get("totSaleShare")), "remarks": _s(r.get("remarks"))},
        })
    return out


def in_window(ev, frm, to):
    d = ev.get("filing_date") or ev.get("event_to")
    return d is not None and frm <= d <= to


def stage_symbol(sym, fetcher, frm, to, now=None):
    """Return (rows, window_rows, errors). Window rows are written even when n_events == 0."""
    now = now or shp.now_iso()
    rows, wins, errs = [], [], []
    for kind, tpl, parser, tag in (("SAST_REG29", SAST_URL, parse_sast, "sast"), ("PIT_REG7", PIT_URL, parse_pit, "pit")):
        fd, td = frm.strftime("%d-%m-%Y"), to.strftime("%d-%m-%Y")
        url = tpl.format(sym=sym, f=fd, t=td)
        raw = fetcher.get(url)
        if raw is None:
            errs.append((sym, kind, "fetch_failed"))
            continue
        try:
            evs = parser(raw.decode("utf-8", "replace"))
        except Exception as e:
            errs.append((sym, kind, f"parse_failed:{e}"))
            continue
        kept = [e for e in evs if in_window(e, frm.isoformat(), to.isoformat())]
        for e in kept:
            e.update({"symbol": sym, "source": "NSE_" + kind, "source_url": url, "fetched_at": now})
            rows.append(e)
        wins.append({"symbol": sym, "kind": kind, "window_from": frm.isoformat(), "window_to": to.isoformat(),
                     "n_events": len(kept), "n_returned": len(evs), "state": "events" if kept else "none_disclosed",
                     "source": "NSE_" + kind, "source_url": url, "fetched_at": now})
    return rows, wins, errs


def run_stage(symbols, fetcher, stage_path, asof, days=365, log=print):
    frm, to = asof - timedelta(days=days), asof
    done = set()
    if os.path.exists(stage_path):
        for line in open(stage_path, encoding="utf-8"):
            try:
                r = json.loads(line)
                if r.get("row_type") == "window":
                    done.add((r["symbol"], r["kind"], r["window_to"]))
            except Exception:
                pass
    out = open(stage_path, "a", encoding="utf-8")
    stats = {"symbols": 0, "events": 0, "bse_only_skipped": [], "errors": []}
    try:
        for s in symbols:
            if s.isdigit():
                stats["bse_only_skipped"].append(s)
                continue
            if all((s, k, to.isoformat()) in done for k in ("SAST_REG29", "PIT_REG7")):
                continue
            rows, wins, errs = stage_symbol(s, fetcher, frm, to)
            for r in rows:
                r["row_type"] = "event"
                out.write(json.dumps(r) + "\n")
            for w in wins:
                w["row_type"] = "window"
                out.write(json.dumps(w) + "\n")
            out.flush()
            stats["symbols"] += 1
            stats["events"] += len(rows)
            stats["errors"] += errs
            if stats["symbols"] % 100 == 0:
                log(f"  {stats['symbols']} symbols, {stats['events']} events, net={fetcher.net_calls}")
    finally:
        out.close()
    stats["net_calls"], stats["cache_hits"] = fetcher.net_calls, fetcher.cache_hits
    return stats


EV_DDL = """CREATE TABLE IF NOT EXISTS SastInsiderEvents (
  symbol TEXT NOT NULL, kind TEXT NOT NULL, event_id TEXT NOT NULL,
  person_name TEXT, person_category TEXT, txn_type TEXT, security_type TEXT, mode TEXT,
  shares_qty REAL, value_inr REAL, before_shares REAL, before_pct REAL, after_shares REAL, after_pct REAL,
  event_from TEXT, event_to TEXT, intimation_date TEXT, filing_date TEXT, xbrl_url TEXT, extra_json TEXT,
  source TEXT NOT NULL, source_url TEXT NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, kind, event_id))"""
WIN_DDL = """CREATE TABLE IF NOT EXISTS SastInsiderWindows (
  symbol TEXT NOT NULL, kind TEXT NOT NULL, window_from TEXT NOT NULL, window_to TEXT NOT NULL,
  n_events INTEGER NOT NULL, n_returned INTEGER, state TEXT NOT NULL,
  source TEXT NOT NULL, source_url TEXT NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, kind, window_to))"""
EV_COLS = ("symbol", "kind", "event_id", "person_name", "person_category", "txn_type", "security_type", "mode",
           "shares_qty", "value_inr", "before_shares", "before_pct", "after_shares", "after_pct", "event_from",
           "event_to", "intimation_date", "filing_date", "xbrl_url", "extra_json", "source", "source_url", "fetched_at")
WIN_COLS = ("symbol", "kind", "window_from", "window_to", "n_events", "n_returned", "state", "source", "source_url",
            "fetched_at")


def apply_stage(db, stage_path, yes=False, log=print):
    evs, wins = {}, {}
    for line in open(stage_path, encoding="utf-8"):
        r = json.loads(line)
        if r.get("row_type") == "window":
            wins[(r["symbol"], r["kind"], r["window_to"])] = r
        else:
            r["extra_json"] = json.dumps(r.get("extra", {}))
            if r.get("event_id") is None:
                continue  # no stable key; not loaded (never invent an id)
            evs[(r["symbol"], r["kind"], r["event_id"])] = r
    log(f"events={len(evs)} windows={len(wins)} -> SastInsiderEvents/SastInsiderWindows in {db}")
    if not yes:
        log("DRY-RUN: no writes. Add --yes to write.")
        return 0
    conn = sqlite3.connect(db)
    try:
        with conn:
            conn.execute(EV_DDL)
            conn.execute(WIN_DDL)
            conn.executemany("INSERT OR REPLACE INTO SastInsiderEvents (%s) VALUES (%s)" % (",".join(EV_COLS), ",".join("?" * len(EV_COLS))),
                             [tuple(r.get(c) for c in EV_COLS) for r in evs.values()])
            conn.executemany("INSERT OR REPLACE INTO SastInsiderWindows (%s) VALUES (%s)" % (",".join(WIN_COLS), ",".join("?" * len(WIN_COLS))),
                             [tuple(r.get(c) for c in WIN_COLS) for r in wins.values()])
        log("APPLIED")
    finally:
        conn.close()
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=os.path.join(shp.ROOT, "portfolio.db"), help="read-only universe source")
    ap.add_argument("--cache-dir", default=shp.DEFAULT_CACHE)
    ap.add_argument("--stage-file", default=DEFAULT_STAGE)
    ap.add_argument("--stage-only", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--apply-db")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--symbols")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--stride", type=int, default=0)
    ap.add_argument("--asof", default=date.today().isoformat(), help="window end (fix it to reuse the cache)")
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--delay", type=float, default=1.0)
    a = ap.parse_args(argv)
    if a.apply:
        if not a.apply_db:
            print("ERROR: --apply requires --apply-db (portfolio.db is never defaulted)")
            return 2
        return apply_stage(a.apply_db, a.stage_file, yes=a.yes)
    syms = shp.load_universe(a.db, a.symbols, a.limit, a.offset, a.stride)
    f = shp.Fetcher(a.cache_dir, delay=a.delay)
    print(f"universe symbols={len(syms)} asof={a.asof} days={a.days}")
    print(json.dumps(run_stage(syms, f, a.stage_file, date.fromisoformat(a.asof), a.days)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
