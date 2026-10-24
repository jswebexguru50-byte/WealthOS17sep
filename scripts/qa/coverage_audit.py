#!/usr/bin/env python3
"""Deterministic data-coverage audit for the 29 research questions and filters F1-F7.

stdlib only, no LLM, read-only on portfolio.db (sqlite URI mode=ro; no
integrity_check; large tables are read with indexed symbol/date range scans).

Inputs : scripts/qa/field_registry.json (what each question/filter needs and
         where in the DB it should live)
Outputs: scripts/qa/out/coverage_audit.json   (machine readable)
         docs/COVERAGE_MATRIX.md              (with --write-matrix)

Per field it reports, over the research universe:
  fill%        symbols with >=1 non-null value (union of all DB probes)
  canon_fill%  same but only the canonical table.column (alt probes are
               interim/non-canonical copies, never promoted silently)
  prov%        of filled symbols, share whose value row carries provenance
  stale%       of filled+dated symbols, share older than the field TTL
  strict%      non-null AND provenance AND within TTL (what 'covered' means)
  flags        unit/scale/default-fill problems (see _unit_flags)

Nothing is imputed: a symbol with no non-null value is counted as uncovered.
Usage: python scripts/qa/coverage_audit.py [--db portfolio.db] [--asof YYYY-MM-DD] [--write-matrix]
"""
from __future__ import annotations

import argparse
import calendar
import collections
import datetime as dt
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MON = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_date(v):
    """ISO date/datetime or 'Mon YYYY' label (-> month end). None if unparseable."""
    if v is None:
        return None
    s = str(v).strip()
    try:
        return dt.date.fromisoformat(s[:10])
    except ValueError:
        pass
    try:
        mon, yr = s.split()[:2]
        y, m = int(yr), MON[mon[:3].lower()]
        return dt.date(y, m, calendar.monthrange(y, m)[1])
    except Exception:
        return None


def parse_period(v):
    """Reporting-period label -> period-end date, or None.

    Accepts 'Mon YYYY', 'QnFYyy' (Indian FY: Q1=Apr-Jun), 'FYyy'/'Mar YYYY', and ISO
    dates that are month-ends. Relative labels ('1Q Ago', '... (Latest Qtr)') are
    NOT periods and return None so they cannot be counted as extra quarters.
    """
    if v is None:
        return None
    s = str(v).strip()
    low = s.lower()
    if "ago" in low or "latest" in low or not s:
        return None
    import re
    m = re.fullmatch(r"Q([1-4])\s*FY\s*(\d{2,4})", s, re.I)
    if m:
        q, y = int(m.group(1)), int(m.group(2))
        y = y + 2000 if y < 100 else y  # FY27 ends Mar 2027
        endm, endy = {1: (6, y - 1), 2: (9, y - 1), 3: (12, y - 1), 4: (3, y)}[q]
        return dt.date(endy, endm, calendar.monthrange(endy, endm)[1])
    m = re.fullmatch(r"FY\s*(\d{2,4})", s, re.I)
    if m:
        y = int(m.group(1)); y = y + 2000 if y < 100 else y
        return dt.date(y, 3, 31)
    d = parse_date(s)
    if d is not None and re.match(r"\d{4}-\d{2}-\d{2}", s) and d.day != calendar.monthrange(d.year, d.month)[1]:
        return None
    return d


def num(v):
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and abs(f) != float("inf") else None


def connect(db):
    path = os.path.abspath(db).replace("\\", "/")
    c = sqlite3.connect("file:%s?mode=ro" % path, uri=True)
    c.execute("PRAGMA query_only=1")
    return c


def has_col(c, table, col):
    return any(r[1] == col for r in c.execute("PRAGMA table_info(%s)" % table))


def universe(c):
    sessions = [r[0] for r in c.execute("SELECT DISTINCT trade_date FROM DailyOHLCV ORDER BY trade_date DESC LIMIT 7")]
    if not sessions:
        raise SystemExit("DailyOHLCV empty")
    cutoff = sessions[-1]
    live = {r[0] for r in c.execute("SELECT DISTINCT symbol FROM DailyOHLCV WHERE trade_date>=?", (cutoff,))}
    mt = {r[0] for r in c.execute(
        "SELECT symbol FROM MasterTickers WHERE status='ACTIVE' AND exchange IN ('NSE','BSE') AND (series='EQ' OR series IS NULL)")}
    return sorted(live & mt), sessions, len(live), len(mt)


class Agg:
    """Per-symbol aggregate for one probe."""
    __slots__ = ("n", "maxd", "prov", "vals", "undated")

    def __init__(self):
        self.n = 0; self.maxd = None; self.prov = False; self.vals = []; self.undated = True


def _add(a, v, d, prov, keep):
    a.n += 1
    if d is not None:
        a.undated = False
        if a.maxd is None or d > a.maxd:
            a.maxd = d
    if prov:
        a.prov = True
    if keep and v is not None:
        a.vals.append(v)


def run_probe(c, p, U, fields_state, sessions):
    """Return (dict symbol->Agg restricted to U, note)."""
    Uset = set(U)
    out = collections.defaultdict(Agg)
    k = p["kind"]
    if k == "absent":
        return {}, p["reason"]
    if k == "col":
        t, col = p["table"], p["col"]
        if not has_col(c, t, col):
            return {}, "column %s.%s does not exist" % (t, col)
        d, pv = p.get("date") or {}, p.get("prov")
        dsel = d.get("col") or d.get("label")
        sel = "symbol, %s, %s, %s" % (col, dsel if dsel else "NULL", pv["col"] if pv else "NULL")
        q = "SELECT %s FROM %s WHERE %s IS NOT NULL" % (sel, t, col) + (" AND " + p["where"] if p.get("where") else "")
        keep = p.get("unit") != "text"
        for s, v, dv, pr in c.execute(q):
            if s in Uset:
                _add(out[s], num(v) if keep else 1, (parse_period(dv) if d.get("label") else parse_date(dv)), bool(pr and str(pr).strip()), keep)
        return out, None
    if k == "count_ge":
        t = p["table"]
        pv = p.get("prov")
        q = "SELECT symbol, %s, %s, %s FROM %s WHERE %s IS NOT NULL" % (
            p["label"], p["col"], pv["col"] if pv else "NULL", t, p["col"]) + (" AND " + p["where"] if p.get("where") else "")
        labels = collections.defaultdict(set); tmp = {}; bad = 0
        for s, lab, v, pr in c.execute(q):
            if s in Uset and lab is not None:
                pd_ = parse_period(lab)
                if pd_ is None:
                    bad += 1
                    continue
                labels[s].add(pd_)
                a = tmp.setdefault(s, Agg())
                _add(a, None, pd_, bool(pr and str(pr).strip()), False)
        for s, ls in labels.items():
            if len(ls) >= p["n"]:
                a = tmp[s]; a.n = len(ls); out[s] = a
        return out, "distinct reporting periods counted (relative/unparseable labels excluded: %d rows); symbols with 1..n-1 periods: %d" % (
            bad, sum(1 for s, ls in labels.items() if len(ls) < p["n"]))
    if k == "tl_token":
        q = ("SELECT symbol, rawValue, providerAsOf, responseHash FROM trendlyne_mirror_observations "
             "WHERE providerToken=? AND rawValue IS NOT NULL")
        for s, v, dv, pr in c.execute(q, (p["token"],)):
            if s in Uset:
                _add(out[s], num(v), parse_date(dv), bool(pr), True)
        return out, None
    if k == "docs":
        ph = ",".join("?" * len(p["source_types"]))
        q = ("SELECT symbol, published_at, source_authority, content_hash FROM source_documents "
             "WHERE source_type IN (%s)" % ph)
        for s, dv, au, ch in c.execute(q, p["source_types"]):
            if s in Uset:
                _add(out[s], 1, parse_date(dv), bool(au and ch), False)
        return out, None
    if k == "news":
        for (ek, pub) in c.execute("SELECT entity_keys, published_at FROM news_events"):
            keys = ek
            try:
                j = json.loads(ek)
                keys = j if isinstance(j, list) else [str(j)]
            except Exception:
                keys = str(ek or "").replace(";", ",").split(",")
            for s in keys:
                s = str(s).strip()
                if s in Uset:
                    _add(out[s], 1, parse_date(pub), True, False)
        return out, None
    if k == "corp_actions":
        for s, ex, src in c.execute("SELECT symbol, ex_date, source FROM CorporateActions"):
            if s in Uset:
                _add(out[s], 1, parse_date(ex), bool(src), False)
        return out, None
    if k == "ohlcv_bars":
        cut = (parse_date(sessions[0]) - dt.timedelta(days=330)).isoformat()
        for s, n, mx, ds in c.execute(
                "SELECT symbol, COUNT(*), MAX(trade_date), MAX(data_source) FROM DailyOHLCV WHERE trade_date>=? GROUP BY symbol", (cut,)):
            if s in Uset and n >= p["min_bars"]:
                a = out[s]; a.n = n; a.maxd = parse_date(mx); a.undated = False; a.prov = bool(ds)
        return out, None
    if k == "ohlcv_col":
        col = p["col"]
        for s, n, mx, ds in c.execute(
                "SELECT symbol, COUNT(%s), MAX(trade_date), MAX(data_source) FROM DailyOHLCV WHERE trade_date>=? GROUP BY symbol" % col,
                (sessions[-1],)):
            if s in Uset and n:
                a = out[s]; a.n = n; a.maxd = parse_date(mx); a.undated = False; a.prov = bool(ds)
        return out, None
    if k == "derived":
        sets = [fields_state[n]["_strict"] for n in p["needs"]]
        ok = set.intersection(*sets) if sets else set()
        for s in ok:
            a = out[s]; a.n = 1; a.undated = True; a.prov = True
        # derived rows inherit freshness/provenance from components (already strict)
        a_fill = set.intersection(*[fields_state[n]["_fill"] for n in p["needs"]])
        for s in a_fill - ok:
            a = out[s]; a.n = 1; a.undated = True; a.prov = False
        return out, "derived from " + "+".join(p["needs"])
    raise ValueError("unknown probe kind " + k)


def unit_flags(p, aggs):
    """Scale/default/templating diagnostics from the actual stored values."""
    vals = [v for a in aggs.values() for v in a.vals if v is not None]
    flags = []
    n = len(vals)
    if n < 20:
        return flags
    unit, rng = p.get("unit"), p.get("range")
    if rng:
        bad = sum(1 for v in vals if v < rng[0] or v > rng[1])
        if bad:
            flags.append("RANGE: %d/%d values outside plausible [%g, %g]" % (bad, n, rng[0], rng[1]))
    if unit == "pct":
        nz = [v for v in vals if v != 0]
        if nz and sum(1 for v in nz if 0 < abs(v) <= 1) / len(nz) > 0.9:
            flags.append("SCALE: >90% of non-zero pct values lie in (0,1] - looks like fractions not percent")
    if unit == "cr":
        big = sum(1 for v in vals if abs(v) > 1e7)
        if big / n > 0.05:
            flags.append("SCALE: %d/%d values > 1e7 - possible rupees stored as crore" % (big, n))
        small = sum(1 for v in vals if v != 0 and abs(v) < 0.01)
        if small / n > 0.2:
            flags.append("SCALE: %d/%d |values| < 0.01 - possible lakh/crore or fraction confusion" % (small, n))
    zero = sum(1 for v in vals if v == 0)
    if unit in ("pct", "ratio", "score") and zero / n > 0.5:
        flags.append("DEFAULT: %.0f%% of values are exactly 0 - likely default-filled, not observed" % (100 * zero / n))
    nzv = [round(v, 6) for v in vals if v != 0] if (unit == "pct" and p.get("prov")) else [round(v, 6) for v in vals]
    top = collections.Counter(nzv).most_common(1)[0] if nzv else (0, 0)
    if nzv and top[1] / n >= 0.5 and unit != "text":
        flags.append("TEMPLATED: value %g repeated in %.0f%% of rows - likely synthetic/default" % (top[0], 100 * top[1] / n))
    distinct = len(set(round(v, 6) for v in vals))
    if unit in ("score", "ratio", "cr") and n >= 200 and distinct <= 5 or (unit == "pct" and not p.get("prov") and n >= 200 and distinct <= 5):
        flags.append("TEMPLATED: only %d distinct values over %d rows" % (distinct, n))
    return flags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(ROOT, "portfolio.db"))
    ap.add_argument("--registry", default=os.path.join(HERE, "field_registry.json"))
    ap.add_argument("--asof", default=None, help="reference date (default: today)")
    ap.add_argument("--out", default=os.path.join(HERE, "out", "coverage_audit.json"))
    ap.add_argument("--write-matrix", action="store_true")
    ap.add_argument("--matrix", default=os.path.join(ROOT, "docs", "COVERAGE_MATRIX.md"))
    a = ap.parse_args()

    reg = json.load(open(a.registry, encoding="utf-8"))
    asof = dt.date.fromisoformat(a.asof) if a.asof else dt.date.today()
    c = connect(a.db)
    U, sessions, n_live, n_mt = universe(c)
    N = len(U)
    print("universe=%d (live symbols %d, MasterTickers NSE/BSE EQ %d); latest session %s" % (N, n_live, n_mt, sessions[0]), file=sys.stderr)

    state = {}
    for f in reg["fields"]:
        ttl = f["ttl_days"]
        union_fill, union_strict, canon_fill = set(), set(), set()
        stale_n = dated_n = 0
        union_prov = set()
        probes_out = []
        stale_syms, any_dated = set(), set()
        for p in f["probes"]:
            aggs, note = run_probe(c, p, U, state, sessions)
            fill = set(aggs)
            strict = set(); st = set(); dated = set(); pv = set()
            maxfut = 0
            for s, ag in aggs.items():
                if ag.prov:
                    pv.add(s)
                if ag.maxd is not None:
                    dated.add(s)
                    if ag.maxd > asof:
                        maxfut += 1
                    age = max((asof - ag.maxd).days, 0)
                    if age > ttl:
                        st.add(s)
                    elif ag.prov:
                        strict.add(s)
                elif ag.prov and p["kind"] == "derived":
                    strict.add(s)
            pf = unit_flags(p, aggs) if p["kind"] in ("col", "tl_token") else []
            # Quarantine: a probe whose values look templated/default-filled (or are
            # default-zero with no provenance column) earns no coverage credit.
            quar = any("TEMPLATED" in x for x in pf) or (
                p["kind"] == "col" and not p.get("prov") and any("DEFAULT" in x for x in pf)) or (
                p["kind"] == "col" and not p.get("prov") and not p.get("canonical"))  # unverifiable alt copy
            raw_fill_n = len(fill)
            if quar:
                fill, strict, st, dated, pv = set(), set(), set(), set(), set()
            probes_out.append({"kind": p["kind"], "ref": ("%s.%s" % (p.get("table"), p.get("col")) if p["kind"] in ("col", "count_ge")
                                                         else p.get("token") or ",".join(p.get("source_types", [])) or p.get("col") or p["kind"]),
                               "canonical": bool(p.get("canonical")), "fill_n": len(fill), "prov_n": len(pv), "stale_n": len(st),
                               "strict_n": len(strict), "quarantined": quar, "raw_fill_n": raw_fill_n, "note": note, "flags": pf, "future_dated": maxfut})
            union_fill |= fill; union_strict |= strict; stale_syms |= st; any_dated |= dated; union_prov |= pv
            if p.get("canonical"):
                canon_fill |= fill
        # provenance share among filled: union of probe provenance
        state[f["id"]] = {"_fill": union_fill, "_strict": union_strict, "_canon": canon_fill}
        fl = [x for po in probes_out for x in po["flags"]]
        state[f["id"]].update({
            "id": f["id"], "description": f["description"], "needed_by": f["needed_by"], "ttl_days": ttl, "unit": f["unit"],
            "fill_n": len(union_fill), "fill_pct": 100.0 * len(union_fill) / N,
            "canon_fill_n": len(canon_fill), "canon_fill_pct": 100.0 * len(canon_fill) / N,
            "strict_n": len(union_strict), "strict_pct": 100.0 * len(union_strict) / N,
            "prov_pct_of_filled": (100.0 * len(union_prov & union_fill) / len(union_fill)) if union_fill else None,
            "stale_pct_of_dated": (100.0 * len(stale_syms) / len(any_dated)) if any_dated else None,
            "undated_n": len(union_fill - any_dated),
            "uncovered_strict": N - len(union_strict), "uncovered_fill": N - len(union_fill),
            "gap_n": N - len(union_strict), "flags": fl, "probes": probes_out,
            "sources": f["sources"], "free_official_bulk": f["free_official_bulk"], "never_100pct": f.get("never_100pct"), "tier": f.get("tier")})
    c.close()

    fields = {k: v for k, v in state.items()}
    # question / group / filter roll-ups
    qres = {}
    for q, qd in reg["questions"].items():
        fs = qd["fields"]
        if not fs:
            qres[q] = {"title": qd["title"], "group": qd["group"], "fill_pct": 0.0, "strict_pct": 0.0, "fields": []}
            continue
        qres[q] = {"title": qd["title"], "group": qd["group"], "fields": fs, "note": qd.get("note"),
                   "fill_pct": sum(fields[f]["fill_pct"] for f in fs) / len(fs),
                   "strict_pct": sum(fields[f]["strict_pct"] for f in fs) / len(fs),
                   "weakest": min(fs, key=lambda f: fields[f]["strict_pct"])}
    groups = collections.OrderedDict()
    for q, r in qres.items():
        groups.setdefault(r["group"], []).append(r)
    gres = {g: {"questions": len(rs), "fill_pct": sum(r["fill_pct"] for r in rs) / len(rs),
                "strict_pct": sum(r["strict_pct"] for r in rs) / len(rs)} for g, rs in groups.items()}
    allq = list(qres.values())
    overall = {"fill_pct": sum(r["fill_pct"] for r in allq) / len(allq), "strict_pct": sum(r["strict_pct"] for r in allq) / len(allq)}
    fres = {}
    for fk, fl in reg["filters"].items():
        fs_fill = set.intersection(*[fields[x]["_fill"] for x in fl]); fs_str = set.intersection(*[fields[x]["_strict"] for x in fl])
        fres[fk] = {"fields": fl, "computable_n": len(fs_fill), "computable_pct": 100.0 * len(fs_fill) / N,
                    "strict_n": len(fs_str), "strict_pct": 100.0 * len(fs_str) / N}
    allf = set(U); allfs = set(U)
    for fl in reg["filters"].values():
        for x in fl:
            allf &= fields[x]["_fill"]; allfs &= fields[x]["_strict"]
    fres["F1-F7_all"] = {"computable_n": len(allf), "computable_pct": 100.0 * len(allf) / N,
                         "strict_n": len(allfs), "strict_pct": 100.0 * len(allfs) / N}

    clean = {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")} for k, v in fields.items()}
    result = {"asof": asof.isoformat(), "db": os.path.basename(a.db), "latest_session": sessions[0], "universe_n": N,
              "universe_def": reg["universe"], "fields": clean, "questions": qres, "groups": gres, "overall": overall, "filters": fres}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(result, open(a.out, "w", encoding="utf-8"), indent=1, default=str)

    ranked = sorted(clean.values(), key=lambda x: -x["gap_n"])
    print("| field | fill% | strict% | prov% | stale% | gap | flags |")
    print("|---|---|---|---|---|---|---|")
    for x in ranked:
        print("| %s | %.1f | %.1f | %s | %s | %d | %d |" % (
            x["id"], x["fill_pct"], x["strict_pct"],
            "-" if x["prov_pct_of_filled"] is None else "%.0f" % x["prov_pct_of_filled"],
            "-" if x["stale_pct_of_dated"] is None else "%.0f" % x["stale_pct_of_dated"], x["gap_n"], len(x["flags"])))
    if a.write_matrix:
        write_matrix(result, reg, ranked, a.matrix)
        print("wrote", a.matrix, file=sys.stderr)


def pct(v, d=1):
    return "-" if v is None else ("%." + str(d) + "f%%") % v


def write_matrix(R, reg, ranked, path):
    N = R["universe_n"]
    L = []
    w = L.append
    w("# Coverage Matrix: 29 Questions and Filters F1-F7")
    w("")
    w("Generated by `scripts/qa/coverage_audit.py` (deterministic, stdlib, read-only DB) from `scripts/qa/field_registry.json`. Do not hand-edit; re-run the script.")
    w("")
    w("- As-of: %s | latest price session: %s | DB: %s" % (R["asof"], R["latest_session"], R["db"]))
    w("- Universe: **%d symbols** = %s" % (N, R["universe_def"]))
    w("- **fill** = at least one non-null value exists. **strict** = non-null AND carries provenance AND within the field TTL (this is what counts as covered). Nothing is imputed.")
    w("- Question coverage = mean over the fields each question needs (registry `questions`). Q24/Q25/Q27-Q29 are synthesis questions scored by their evidence inputs (proxy).")
    w("- The **8 dossier filter questions are not specified anywhere** in the repo or docs (only F1-F7 exist); coverage for them is 0 and blocked on the user.")
    w("")
    w("## 1. Headline")
    w("")
    w("| Scope | fill | strict |")
    w("|---|---|---|")
    w("| All 29 questions (mean) | %s | %s |" % (pct(R["overall"]["fill_pct"]), pct(R["overall"]["strict_pct"])))
    for g, v in R["groups"].items():
        w("| %s (%d Q) | %s | %s |" % (g, v["questions"], pct(v["fill_pct"]), pct(v["strict_pct"])))
    w("")
    w("## 2. Filters F1-F7 (symbol can be evaluated, all inputs present)")
    w("")
    w("| Filter | Inputs | computable | strict-covered |")
    w("|---|---|---|---|")
    for k, v in R["filters"].items():
        w("| %s | %s | %d (%s) | %d (%s) |" % (k, ", ".join(v.get("fields", ["all F1-F7 inputs"])), v["computable_n"], pct(v["computable_pct"]), v["strict_n"], pct(v["strict_pct"])))
    w("")
    w("Pledge (F5) fails closed when unknown, so every symbol without a pledge value is a forced F5 FAIL: the F5 gap directly shrinks the pass list.")
    w("")
    w("## 3. Per-question coverage")
    w("")
    w("| Q | Question | Group | fill | strict | weakest input |")
    w("|---|---|---|---|---|---|")
    for q, r in R["questions"].items():
        w("| %s | %s | %s | %s | %s | %s |" % (q, r["title"], r["group"], pct(r["fill_pct"]), pct(r["strict_pct"]), r.get("weakest", "-")))
    w("")
    w("## 4. Field gaps (sorted by strict gap size)")
    w("")
    w("| Field | Needed by | fill | canonical-column fill | prov (of filled) | stale (of dated) | strict | uncovered (strict) | TTL d |")
    w("|---|---|---|---|---|---|---|---|---|")
    for x in ranked:
        w("| %s | %s | %s | %s | %s | %s | %s | %d | %d |" % (
            x["id"], ",".join(x["needed_by"]), pct(x["fill_pct"]), pct(x["canon_fill_pct"]), pct(x["prov_pct_of_filled"], 0), pct(x["stale_pct_of_dated"], 0),
            pct(x["strict_pct"]), x["gap_n"], x["ttl_days"]))
    w("")
    w("## 5. Unit / scale / default-fill flags found")
    w("")
    any_flag = False
    for x in ranked:
        for po in x["probes"]:
            for fl in po["flags"]:
                any_flag = True
                w("- `%s` via `%s`: %s" % (x["id"], po["ref"], fl))
            if po["future_dated"]:
                w("- `%s` via `%s`: %d rows dated after as-of (scheduled/future); excluded from freshness credit only if beyond TTL" % (x["id"], po["ref"], po["future_dated"]))
    if not any_flag:
        w("- none detected")
    w("")
    w("Verified by direct query (2026-10-18): the 256 `FERE_AUDITED_XBRL` quarterly rows (e.g. SANSERA, WELCORP, Q1FY27) store sales/PAT in rupees not crore (values ~1e10), and their sales_cr equals operating_profit_cr; `TRENDLYNE_MCP` rows use relative period labels ('1Q Ago') which the audit refuses to count as quarters. FEREEnrichedLedger carries one repeated value per metric (e.g. Piotroski 9 in 99% of rows, D/E 0.28 in 100%) and no provenance, so it earns no credit.")
    w("")
    w("Quarantined probes (templated/default-filled, or non-canonical copies with no provenance column; earn NO coverage credit, shown with raw non-null counts):")
    for x in ranked:
        for po in x["probes"]:
            if po["quarantined"]:
                w("- `%s` via `%s`: %d non-null symbols ignored" % (x["id"], po["ref"], po["raw_fill_n"]))
    w("")
    w("Probe notes (partial history / missing columns):")
    for x in ranked:
        for po in x["probes"]:
            if po["note"]:
                w("- `%s` / `%s`: %s" % (x["id"], po["ref"], po["note"]))
    w("")
    w("## 6. Ranked ingestion plan")
    w("")
    w("Ranked by symbols uncovered (strict). Best authentic source is the first official entry in the registry ladder (official filings, then TradingView, Trendlyne user export or logged-in session, Screener.in, MCA).")
    w("")
    w("| # | Field | Best authentic source | Free official bulk? | Symbols uncovered | Interim non-canonical copy in DB? |")
    w("|---|---|---|---|---|---|")
    i = 0
    for x in ranked:
        if x["gap_n"] <= 0 or x["id"] == "filter_questions_8":
            continue
        i += 1
        interim = "yes (alt columns; unverified)" if any((not po["canonical"]) and po["fill_n"] for po in x["probes"]) else "no"
        w("| %d | %s | %s | %s | %d | %s |" % (i, x["id"], x["sources"][0], x["free_official_bulk"], x["gap_n"], interim))
    w("")
    w("Note: DailyOHLCV.turnover and delivery_pct are NULL for the recent Kite-parquet sessions; turnover can be derived (close x volume, labelled 'approx traded value') but delivery_pct needs the NSE security-wise delivery file. Master sector/last_price columns carry no provenance column, so they cannot reach strict coverage until a source/as-of column is added.")
    w("")
    w("Suggested order: (1) shareholding incl. pledge from Reg-31 XBRL, (2) quarterly/annual results + cash-flow from results XBRL, (3) derive ROCE/ROE/D-E/Piotroski/Altman/P-E deterministically from (2) and bhavcopy instead of buying them, (4) announcements/transcripts/annual-report document index from NSE/BSE feeds, (5) PIT/SAST, (6) Trendlyne exports only for what is proprietary (DVM).")
    w("")
    w("## 7. Fields that can never reach 100% from authentic data (mark explicitly, never leave null-unknown)")
    w("")
    w("| Field | Explicit state to store | Why |")
    w("|---|---|---|")
    for f in reg["fields"]:
        n = f.get("never_100pct")
        if n:
            w("| %s | `%s` | %s |" % (f["id"], n["mark_as"], n["reason"]))
    w("")
    w("States: `not_disclosed` (no filing exists for that company/period), `not_applicable` (metric undefined for the issuer type), `none_disclosed` (a valid zero-event result for a stated window), `blocked_on_user` (specification missing). Each must carry the query window/source so it is distinguishable from `null` = unknown.")
    w("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
