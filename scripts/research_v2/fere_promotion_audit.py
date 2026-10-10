#!/usr/bin/env python3
"""Read-only fallback audit for the canonical FERE database.

This mirrors the TypeScript promotion dry-run without requiring Node native
SQLite bindings. It never creates tables, updates rows, or changes the DB.
"""
import argparse
import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone

APPROVED = ("YUKEN", "BECTORFOOD", "VMART", "TATATECH", "OPTIEMUS", "ARROWGREEN")
UNMAPPED = {"beneish_m", "altman_z_public_manufacturing", "piotroski_f", "sloan_accrual", "cash_conversion_cycle", "cfo_to_ebitda"}

def _lists(value):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [str(x) for x in parsed] if isinstance(parsed, list) else [str(value)]
    except (TypeError, ValueError):
        return [str(value)]

def _reason(row):
    isin, symbol, metric = str(row.get("isin") or "").strip().upper(), str(row.get("symbol") or "").strip().upper(), str(row.get("metric") or "").strip()
    if not symbol or len(isin) != 12 or not isin[:2].isalpha() or not isin[-1:].isdigit(): return "INVALID_IDENTITY"
    if metric not in UNMAPPED: return "UNMAPPED_METRIC"
    try:
        if row.get("value") is None or not __import__("math").isfinite(float(row["value"])): return "INVALID_VALUE"
    except (TypeError, ValueError): return "INVALID_VALUE"
    if str(row.get("scope") or "").strip().upper() not in ("CONSOLIDATED", "STANDALONE"): return "INVALID_SCOPE"
    if not row.get("period_start") or not row.get("period_end"): return "MISSING_PERIOD_START"
    try:
        datetime.fromisoformat(str(row["period_start"]))
        datetime.fromisoformat(str(row["period_end"]))
    except ValueError: return "INVALID_PERIOD"
    if not _lists(row.get("input_fact_ids")) or not _lists(row.get("filing_hashes")): return "MISSING_PROVENANCE"
    return None

def audit(db_path):
    # URI mode=ro is deliberate: no journal, schema, or data writes are possible.
    uri = "file:" + os.path.abspath(db_path).replace("\\", "/") + "?mode=ro"
    db = sqlite3.connect(uri, uri=True)
    try:
        db.row_factory = sqlite3.Row
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        universe = {}
        if "universe" in tables:
            for r in db.execute("SELECT isin,symbol FROM universe"):
                if str(r["symbol"] or "").upper() in APPROVED: universe[str(r["isin"])] = str(r["symbol"]).upper()
        rows = []
        if "verified_metric" in tables and universe:
            cols = {r[1] for r in db.execute("PRAGMA table_info(verified_metric)")}
            needed = [c for c in ("isin", "period_end", "metric", "value", "input_fact_ids", "filing_hashes", "available_at", "status", "period_start", "scope") if c in cols]
            for r in db.execute("SELECT " + ",".join(needed) + " FROM verified_metric"):
                d = dict(r)
                if d.get("isin") in universe:
                    d["symbol"] = universe[d["isin"]]; rows.append(d)
    finally:
        db.close()
        # sqlite may retain statement handles briefly on Windows.
        import gc; gc.collect()
    symbols = []
    for symbol in APPROVED:
        selected = [r for r in rows if r["symbol"] == symbol]
        rejected = [_reason(r) for r in selected]
        rejected = [r for r in rejected if r]
        symbols.append({"symbol": symbol, "inputRows": len(selected), "promoted": len(selected) - len(rejected), "rejected": len(rejected), "rejectionReasons": sorted(set(rejected))})
    return {"mode": "dry-run", "database": os.path.abspath(db_path), "generatedAt": datetime.now(timezone.utc).isoformat(), "symbols": symbols, "totals": {"rows": len(rows), "promoted": sum(x["promoted"] for x in symbols), "rejected": sum(x["rejected"] for x in symbols)}}

def main(argv=None):
    p = argparse.ArgumentParser(); p.add_argument("--db", required=True); p.add_argument("--out")
    args = p.parse_args(argv)
    try: report = audit(args.db)
    except Exception as exc:
        print(json.dumps({"mode":"dry-run", "status":"FAILED", "database":os.path.abspath(args.db), "error":type(exc).__name__ + ": " + str(exc)}, indent=2)); return 1
    text = json.dumps(report, indent=2) + "\n"; print(text, end="")
    if args.out:
        fd, temp = tempfile.mkstemp(prefix="fere-audit-", suffix=".tmp", dir=os.path.dirname(os.path.abspath(args.out)) or ".")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f: f.write(text)
            os.replace(temp, args.out)
        finally:
            if os.path.exists(temp): os.unlink(temp)
    return 0

if __name__ == "__main__": raise SystemExit(main())
