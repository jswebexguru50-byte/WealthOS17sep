#!/usr/bin/env python3
"""Hard gate for staged data (scripts/qa/out/*_stage*.jsonl). Stdlib only, deterministic (seeded).

Every row must carry provenance (source + source_url/filing id/url + fetched_at/as_of/available_at).
Rows are REJECTED (and counted by reason) for: missing provenance, out-of-range values (pct 0-100, negative
market cap, INR-vs-crore scale mismatch), duplicates with conflicting values, synthetic markers (rules shared
with no_synthetic_guard.py).  Identical duplicates are collapsed (counted, not rejected).

Cross-check: for N seeded-random symbols, staged values are compared with existing DB values (read-only);
disagreements beyond tolerance are REPORTED, never auto-resolved and never cause a reject.

  python scripts/qa/validate_staged.py [--stage-dir DIR] [--db portfolio_copy.db] [--seed 42] [--sample 25]
Outputs: <stage-dir>/validation_report.json and validation_report.md.  Exit 0 always unless --strict and rejects>0.
"""
import argparse
import glob
import importlib.util
import json
import math
import os
import random
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")

_spec = importlib.util.spec_from_file_location("no_synthetic_guard", os.path.join(HERE, "no_synthetic_guard.py"))
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)

KINDS = ("tv", "shareholding", "sast", "docs", "financials")
VOLATILE = {"fetched_at", "as_of", "available_at", "local_path"}  # differ between re-fetches of the same fact
UNIT_TOL = 1e-3  # relative tolerance for raw/1e7 == crore

# TV fields with hard ranges.  Anything not listed is only type/NaN checked.
TV_PCT_0_100 = {"dividend_yield"}
TV_NONNEG = {"market_cap_cr", "ltp", "high_52w", "low_52w", "sma20", "sma50", "sma200", "ema20", "ema50", "ema200",
             "avg_volume", "avg_volume_30d", "volume_day", "value_traded_day", "float_shares", "rel_volume",
             "total_assets", "total_assets_fy", "borrowings", "borrowings_fy", "debt_to_equity", "debt_to_equity_fy",
             "sales_fy"}
TV_POSITIVE = {"ltp", "high_52w", "low_52w", "sma20", "sma50", "sma200", "ema20", "ema50", "ema200"}
TV_BOUNDS = {"rsi": (0, 100), "recommend_all": (-1, 1), "piotroski_f_ttm": (0, 9), "piotroski_f_fy": (0, 9)}
TV_TEXT = {"sector", "industry"}
SAST_STATES = {"events", "none_disclosed"}
DOC_TYPES = {"exchange_announcement", "concall_intimation", "results_filing", "investor_presentation",
             "annual_report", "concall_audio_link", "concall_transcript", "concall_summary"}


# ------------------------------------------------------------------ helpers
def pdate(x):
    """Any ISO date/datetime string -> aware UTC datetime, else None."""
    if not isinstance(x, str) or not x.strip():
        return None
    s = x.strip()
    s = s[:-1] + "+00:00" if s.endswith("Z") else s
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        try:
            d = datetime.strptime(s[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


def num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def blank(x):
    return x is None or (isinstance(x, str) and not x.strip())


def synthetic_hits(*vals):
    out = []
    for v in vals:
        if isinstance(v, str):
            if any(b in v.lower() for b in guard.BAD_SOURCES) or guard.FLAGGED_VALUE_RE.search(v):
                out.append(v[:60])
    return out


def pct_ok(v, lo=0.0, hi=100.0):
    return v is None or (num(v) and lo <= v <= hi)


def sig(row, drop=VOLATILE):
    return json.dumps({k: v for k, v in row.items() if k not in drop}, sort_keys=True, default=str)


def latest(rows, fields=("fetched_at", "as_of", "available_at")):
    def k(r):
        for f in fields:
            if r.get(f):
                return str(r[f])
        return ""
    return max(rows, key=k)


# ------------------------------------------------------------------ per-kind row checks (return reason list)
def check_tv(r):
    why = []
    if blank(r.get("symbol")) or blank(r.get("field")):
        why.append("missing_key")
    if r.get("source") != "tradingview":
        why.append("provenance_source")
    if pdate(r.get("as_of")) is None:
        why.append("provenance_as_of")
    if blank(r.get("tv_column")) or blank(r.get("exchange")):
        why.append("provenance_tv_column_exchange")
    f, v = r.get("field"), r.get("value")
    if v is None:
        why.append("null_value")
    elif f in TV_TEXT:
        if not isinstance(v, str) or not v.strip():
            why.append("bad_text_value")
    elif not num(v):
        why.append("non_numeric_value")
    else:
        if f in TV_POSITIVE and v <= 0:
            why.append("range_nonpositive_price")
        elif f in TV_NONNEG and v < 0:
            why.append("range_negative_market_cap" if f == "market_cap_cr" else "range_negative")
        if f in TV_PCT_0_100 and not 0 <= v <= 100:
            why.append("range_pct")
        if f in TV_BOUNDS and not TV_BOUNDS[f][0] <= v <= TV_BOUNDS[f][1]:
            why.append("range_bounds")
    if synthetic_hits(r.get("source"), r.get("symbol"), v if f in TV_TEXT else None):
        why.append("synthetic_marker")
    return why


def tv_cross_field(by_sym):
    """Per-symbol relations across fields.  Returns {(symbol, field): reason}."""
    bad = {}
    for s, d in by_sym.items():
        hi, lo, ltp = d.get("high_52w"), d.get("low_52w"), d.get("ltp")
        if num(hi) and num(lo) and hi < lo:
            bad[(s, "high_52w")] = bad[(s, "low_52w")] = "range_52w_inverted"
        mc, fl = d.get("market_cap_cr"), d.get("float_shares")
        # float-adjusted cap can never exceed total cap; a big shortfall means rupee/crore (1e7) scale mismatch
        if num(mc) and num(fl) and num(ltp) and ltp > 0 and fl > 0:
            ratio = mc * 1e7 / (ltp * fl)
            if ratio < 0.2:
                bad[(s, "market_cap_cr")] = "scale_mismatch_market_cap"
    return bad


def check_shp(r):
    why = []
    if blank(r.get("symbol")):
        why.append("missing_key")
    if blank(r.get("source")):
        why.append("provenance_source")
    if blank(r.get("source_url")) and blank(r.get("record_id")):
        why.append("provenance_source_url")
    if pdate(r.get("fetched_at")) is None:
        why.append("provenance_fetched_at")
    q = pdate(r.get("quarter_end"))
    if q is None:
        why.append("bad_quarter_end")
    elif (q.month, q.day) not in ((3, 31), (6, 30), (9, 30), (12, 31)):
        why.append("quarter_end_not_quarter_end")
    for k in ("promoter_pct", "fii_pct", "dii_pct", "mf_pct", "public_pct", "pledge_pct"):
        if not pct_ok(r.get(k)):
            why.append("range_pct_" + k)
    if r.get("promoter_pct") is None or r.get("public_pct") is None:
        why.append("missing_promoter_or_public")
    elif num(r["promoter_pct"]) and num(r["public_pct"]) and abs(r["promoter_pct"] + r["public_pct"] - 100) > 1.0:
        why.append("promoter_plus_public_not_100")
    p, ps, ts = r.get("pledged_shares"), r.get("promoter_shares"), r.get("total_shares")
    for k, v in (("pledged_shares", p), ("promoter_shares", ps), ("total_shares", ts)):
        if v is not None and (not num(v) or v < 0):
            why.append("range_" + k)
    if num(p) and num(ps) and p > ps * 1.0001:
        why.append("pledged_gt_promoter_shares")
    if num(ps) and num(ts) and ps > ts * 1.0001:
        why.append("promoter_shares_gt_total")
    if num(r.get("mf_pct")) and num(r.get("dii_pct")) and r["mf_pct"] > r["dii_pct"] + 0.05:
        why.append("mf_gt_dii")
    fd, fa = pdate(r.get("filing_date")), pdate(r.get("fetched_at"))
    if q and fd and fd < q:
        why.append("filing_before_quarter_end")
    if fd and fa and fd > fa + timedelta(days=1):
        why.append("filing_after_fetch")
    if synthetic_hits(r.get("source"), r.get("source_url"), r.get("symbol")):
        why.append("synthetic_marker")
    return why


def check_sast(r):
    why = []
    if blank(r.get("symbol")) or blank(r.get("kind")):
        why.append("missing_key")
    if blank(r.get("source")):
        why.append("provenance_source")
    if blank(r.get("source_url")):
        why.append("provenance_source_url")
    if pdate(r.get("fetched_at")) is None:
        why.append("provenance_fetched_at")
    if r.get("row_type") == "window":
        if pdate(r.get("window_to")) is None or pdate(r.get("window_from")) is None:
            why.append("bad_window")
        n = r.get("n_events")
        if not (isinstance(n, int) and n >= 0):
            why.append("bad_n_events")
        if r.get("state") not in SAST_STATES:
            why.append("bad_state")
        elif isinstance(n, int) and ((n == 0) != (r["state"] == "none_disclosed")):
            why.append("state_count_mismatch")
    else:
        if blank(r.get("event_id")):
            why.append("provenance_event_id")
        for k in ("before_pct", "after_pct"):
            if not pct_ok(r.get(k)):
                why.append("range_pct_" + k)
        for k in ("shares_qty", "value_inr", "before_shares", "after_shares"):
            if r.get(k) is not None and (not num(r[k]) or r[k] < 0):
                why.append("range_" + k)
        a, b = pdate(r.get("event_from")), pdate(r.get("event_to"))
        if a and b and a > b:
            why.append("event_dates_inverted")
        fd, fa = pdate(r.get("filing_date")), pdate(r.get("fetched_at"))
        if fd and fa and (fd - fa).days > 1:
            why.append("filing_after_fetch")
    if synthetic_hits(r.get("source"), r.get("source_url"), r.get("symbol")):
        why.append("synthetic_marker")
    return why


def check_doc(r):
    why = []
    if blank(r.get("symbol")) or blank(r.get("doc_type")):
        why.append("missing_key")
    elif r["doc_type"] not in DOC_TYPES:
        why.append("unknown_doc_type")
    if blank(r.get("source")):
        why.append("provenance_source")
    u = r.get("url")
    if blank(u) or not re.match(r"^https?://", u):
        why.append("provenance_url")
    if pdate(r.get("fetched_at")) is None:
        why.append("provenance_fetched_at")
    sha = r.get("content_sha256")
    if sha is not None and not re.fullmatch(r"[0-9a-f]{64}", sha):
        why.append("bad_sha256")
    if not blank(r.get("local_path")) and sha is None:
        why.append("file_without_sha256")
    pa, fa = pdate(r.get("published_at")), pdate(r.get("fetched_at"))
    if r.get("published_at") and pa is None:
        why.append("bad_published_at")
    if pa and fa and (pa - fa).days > 1:
        why.append("published_after_fetch")
    if synthetic_hits(r.get("source"), r.get("url"), r.get("symbol")):
        why.append("synthetic_marker")
    return why


def check_fin(r):
    why = []
    if blank(r.get("symbol")) or blank(r.get("metric")):
        why.append("missing_key")
    if blank(r.get("source_url")):
        why.append("provenance_source_url")
    if r.get("filing_id") is None and blank(r.get("filing_sha256")):
        why.append("provenance_filing_id")
    if pdate(r.get("available_at")) is None:
        why.append("provenance_available_at")
    if r.get("unit_normalised_to") != "INR_crore":
        why.append("unit_not_inr_crore")
    if r.get("period_type") not in ("Q", "FY", "INSTANT") or pdate(r.get("period_end")) is None:
        why.append("bad_period")
    if r.get("scope") not in ("CONSOLIDATED", "STANDALONE"):
        why.append("bad_scope")
    v, raw = r.get("value"), r.get("raw_value")
    if not num(v):
        why.append("non_numeric_value")
    else:
        if r.get("raw_unit") == "INR" and num(raw):
            if abs(v - raw / 1e7) > UNIT_TOL * max(1.0, abs(v)):
                why.append("scale_mismatch_inr_vs_crore")
        elif r.get("raw_unit") not in ("INR", "derived"):
            why.append("unknown_raw_unit")
        if r.get("metric") in ("sales", "total_expenses", "equity_capital") and v < 0 and r["metric"] != "equity_capital":
            why.append("range_negative")
        if r.get("metric") == "equity_capital" and v <= 0:
            why.append("range_nonpositive_capital")
    if r.get("derived") and (blank(r.get("formula")) or not r.get("inputs")):
        why.append("derived_without_formula")
    if synthetic_hits(r.get("source_url"), r.get("symbol"), r.get("formula")):
        why.append("synthetic_marker")
    return why


CHECKS = {"tv": check_tv, "shareholding": check_shp, "sast": check_sast, "docs": check_doc, "financials": check_fin}
KEYS = {
    "tv": lambda r: (r.get("symbol"), r.get("field"), r.get("period_end")),
    "shareholding": lambda r: (r.get("symbol"), r.get("quarter_end")),
    "sast": lambda r: ((r.get("symbol"), r.get("kind"), "W", r.get("window_to")) if r.get("row_type") == "window"
                       else (r.get("symbol"), r.get("kind"), "E", r.get("event_id"))),
    "docs": lambda r: (r.get("symbol"), r.get("doc_type"), r.get("url")),
    "financials": lambda r: (r.get("symbol"), r.get("scope"), r.get("period_type"), r.get("period_end"), r.get("metric")),
}


def stage_files(stage_dir):
    pats = {"tv": ["tv_stage.jsonl"], "shareholding": ["shareholding_stage*.jsonl"],
            "sast": ["sast_insider_stage*.jsonl"], "docs": ["docs_stage*.jsonl", "docs_sample20.jsonl"],
            "financials": ["financials_stage.jsonl"]}
    out = {}
    for k, ps in pats.items():
        fs = set()
        for p in ps:
            fs.update(glob.glob(os.path.join(stage_dir, p)))
        out[k] = sorted(f for f in fs if ".skips" not in f and ".state" not in f)
    return out


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield n, json.loads(line)
            except ValueError:
                yield n, None


def validate_stage(stage_dir=OUT):
    """-> (accepted: {kind: [rows]}, report dict).  Pure function of the files (deterministic)."""
    files = stage_files(stage_dir)
    accepted, rep = {}, {"stage_dir": stage_dir, "kinds": {}}
    for kind in KINDS:
        reasons, samples = {}, {}
        total = 0
        groups = {}
        for fp in files[kind]:
            for n, r in read_jsonl(fp):
                total += 1
                why = ["unparseable_json"] if not isinstance(r, dict) else CHECKS[kind](r)
                if why:
                    for w in why:
                        reasons[w] = reasons.get(w, 0) + 1
                        samples.setdefault(w, []).append({"file": os.path.basename(fp), "line": n,
                                                          "key": list(map(str, KEYS[kind](r))) if isinstance(r, dict) else None})
                    continue
                groups.setdefault(KEYS[kind](r), []).append(r)
        rows, dup_ident, dup_conf, conflict_keys = [], 0, 0, []
        for k, rs in groups.items():
            if len({sig(x) for x in rs}) > 1:
                dup_conf += len(rs)
                conflict_keys.append(list(map(str, k)))
                continue
            dup_ident += len(rs) - 1
            rows.append(latest(rs))
        if kind == "tv":  # cross-field consistency per symbol
            by_sym = {}
            for r in rows:
                if r.get("period_end") is None:
                    by_sym.setdefault(r["symbol"], {})[r["field"]] = r["value"]
            bad = tv_cross_field(by_sym)
            kept = []
            for r in rows:
                w = bad.get((r["symbol"], r["field"])) if r.get("period_end") is None else None
                if w:
                    reasons[w] = reasons.get(w, 0) + 1
                    samples.setdefault(w, []).append({"key": [r["symbol"], r["field"]]})
                else:
                    kept.append(r)
            rows = kept
        if kind == "financials":  # CONSOLIDATED vs STANDALONE may coexist; the loader prefers consolidated
            pass
        accepted[kind] = rows
        rej = sum(reasons.values())
        rep["kinds"][kind] = {
            "files": [os.path.basename(f) for f in files[kind]], "rows_read": total,
            "accepted": len(rows), "rejected_rows_reason_hits": rej,
            "duplicates_identical_collapsed": dup_ident, "duplicates_conflicting_rejected": dup_conf,
            "conflicting_keys_sample": conflict_keys[:10],
            "reject_reasons": dict(sorted(reasons.items(), key=lambda kv: -kv[1])),
            "reject_samples": {w: s[:3] for w, s in samples.items()},
        }
        rep["kinds"][kind]["rejected_total"] = total - len(rows) - dup_ident
    return accepted, rep


# ------------------------------------------------------------------ cross-check against DB (read-only)
def _ro(db):
    return sqlite3.connect("file:%s?mode=ro" % os.path.abspath(db).replace("\\", "/"), uri=True)


def _tbl(con, name):
    return con.execute("SELECT 1 FROM sqlite_master WHERE name=?", (name,)).fetchone() is not None


def cross_check(accepted, db, seed=42, sample=25, tol_price=0.10, tol_pct=2.0, tol_fin=0.02):
    rep = {"db": db, "seed": seed, "sample_size": sample, "compared": 0, "disagreements": [], "notes": []}
    if not db or not os.path.isfile(db):
        rep["notes"].append("db not found; cross-check skipped")
        return rep
    rng = random.Random(seed)
    con = _ro(db)
    try:
        def pick(syms):
            syms = sorted(set(syms))
            return rng.sample(syms, min(sample, len(syms)))
        tv = {}
        for r in accepted.get("tv", []):
            if r.get("period_end") is None:
                tv.setdefault(r["symbol"], {})[r["field"]] = r["value"]
        # 1) TV last price vs DB daily close / master last price
        for s in pick(tv):
            ltp = tv[s].get("ltp")
            if not num(ltp):
                continue
            ref = None
            if _tbl(con, "DailyOHLCV"):
                row = con.execute("SELECT trade_date, close FROM DailyOHLCV WHERE symbol=? ORDER BY trade_date DESC LIMIT 1", (s,)).fetchone()
                if row:
                    ref = ("DailyOHLCV.close@" + row[0], row[1])
            if ref is None and _tbl(con, "MasterTickers"):
                row = con.execute("SELECT last_updated, last_price FROM MasterTickers WHERE symbol=? AND last_price IS NOT NULL LIMIT 1", (s,)).fetchone()
                if row:
                    ref = ("MasterTickers.last_price@" + str(row[0]), row[1])
            if ref is None or not num(ref[1]) or ref[1] <= 0:
                continue
            rep["compared"] += 1
            d = abs(ltp - ref[1]) / ref[1]
            if d > tol_price:
                rep["disagreements"].append({"kind": "tv", "symbol": s, "field": "ltp", "staged": ltp,
                                             "db_ref": ref[0], "db_value": ref[1], "rel_diff": round(d, 4), "tolerance": tol_price})
        # 2) shareholding vs existing HistoricalShareholdingPattern (same quarter by date)
        shp = accepted.get("shareholding", [])
        if shp and _tbl(con, "HistoricalShareholdingPattern"):
            for s in pick(r["symbol"] for r in shp):
                for r in [x for x in shp if x["symbol"] == s]:
                    row = con.execute("SELECT quarter_label, promoter_pct, fii_pct, dii_pct FROM HistoricalShareholdingPattern "
                                      "WHERE symbol=? AND as_of_date=?", (s, r["quarter_end"])).fetchone()
                    if not row:
                        continue
                    for k, v in zip(("promoter_pct", "fii_pct", "dii_pct"), row[1:]):
                        if num(r.get(k)) and num(v):
                            rep["compared"] += 1
                            if abs(r[k] - v) > tol_pct:
                                rep["disagreements"].append({"kind": "shareholding", "symbol": s, "field": k, "quarter": r["quarter_end"],
                                                             "staged": r[k], "db_value": v, "abs_diff": round(abs(r[k] - v), 3), "tolerance": tol_pct})
        # 3) financials vs HistoricalFinancialStatements same period
        fin = accepted.get("financials", [])
        colmap = {"sales": "sales_cr", "operating_profit": "operating_profit_cr", "pat": "net_profit_pat_cr", "pbt": "pbt_cr",
                  "interest": "interest_cr", "depreciation": "depreciation_cr", "other_income": "other_income_cr"}
        if fin and _tbl(con, "HistoricalFinancialStatements"):
            for s in pick(r["symbol"] for r in fin):
                for r in [x for x in fin if x["symbol"] == s and x["metric"] in colmap and x["scope"] == "CONSOLIDATED"]:
                    d = pdate(r["period_end"])
                    label = d.strftime("%b %Y")
                    st = "QUARTERLY_PL" if r["period_type"] == "Q" else "ANNUAL_PL"
                    row = con.execute("SELECT %s FROM HistoricalFinancialStatements WHERE symbol=? AND statement_type=? AND period_label=?"
                                      % colmap[r["metric"]], (s, st, label)).fetchone()
                    if row and num(row[0]):
                        rep["compared"] += 1
                        rd = abs(r["value"] - row[0]) / max(1.0, abs(row[0]))
                        if rd > tol_fin:
                            rep["disagreements"].append({"kind": "financials", "symbol": s, "field": r["metric"], "period": label,
                                                         "staged": r["value"], "db_value": row[0], "rel_diff": round(rd, 4), "tolerance": tol_fin})
    finally:
        con.close()
    rep["disagreement_count"] = len(rep["disagreements"])
    return rep


# ------------------------------------------------------------------ report
def markdown(rep):
    L = ["# Staged data validation report", "", "Generated %s, seed %s" % (rep["generated_at"], rep["cross_check"].get("seed")), "",
         "| kind | read | accepted | rejected | identical dups collapsed | conflicting dups rejected |", "|---|---|---|---|---|---|"]
    for k, v in rep["kinds"].items():
        L.append("| %s | %d | %d | %d | %d | %d |" % (k, v["rows_read"], v["accepted"], v["rejected_total"],
                                                      v["duplicates_identical_collapsed"], v["duplicates_conflicting_rejected"]))
    L += ["", "## Reject reasons (row-level hits)"]
    for k, v in rep["kinds"].items():
        if v["reject_reasons"]:
            L.append("- **%s**: %s" % (k, ", ".join("%s=%d" % kv for kv in v["reject_reasons"].items())))
    cc = rep["cross_check"]
    L += ["", "## Cross-check vs DB (%s)" % cc.get("db"), "compared=%d, disagreements=%d (reported only, not auto-resolved)"
          % (cc.get("compared", 0), cc.get("disagreement_count", 0))]
    for d in cc.get("disagreements", [])[:40]:
        L.append("- " + json.dumps(d, default=str))
    L += cc.get("notes", [])
    return "\n".join(L) + "\n"


def run(stage_dir=OUT, db=None, seed=42, sample=25, write=True):
    accepted, rep = validate_stage(stage_dir)
    rep["generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rep["cross_check"] = cross_check(accepted, db, seed, sample)
    if write:
        with open(os.path.join(stage_dir, "validation_report.json"), "w", encoding="utf-8") as f:
            json.dump(rep, f, indent=1, default=str)
        with open(os.path.join(stage_dir, "validation_report.md"), "w", encoding="utf-8") as f:
            f.write(markdown(rep))
    return accepted, rep


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--stage-dir", default=OUT)
    ap.add_argument("--db", default=os.path.join(OUT, "portfolio_copy.db"))
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--sample", type=int, default=25)
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(argv)
    _, rep = run(a.stage_dir, a.db, a.seed, a.sample)
    for k, v in rep["kinds"].items():
        print("%-13s read=%d accepted=%d rejected=%d dup_ident=%d dup_conflict=%d" % (
            k, v["rows_read"], v["accepted"], v["rejected_total"], v["duplicates_identical_collapsed"],
            v["duplicates_conflicting_rejected"]))
    print("cross-check compared=%d disagreements=%d" % (rep["cross_check"].get("compared", 0), rep["cross_check"].get("disagreement_count", 0)))
    rej = sum(v["rejected_total"] for v in rep["kinds"].values())
    return 1 if (a.strict and rej) else 0


if __name__ == "__main__":
    sys.exit(main())
