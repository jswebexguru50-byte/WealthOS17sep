#!/usr/bin/env python3
"""Offline coverage audit for the active Upstox-addressable NSE universe."""
from __future__ import annotations

import csv
import datetime as dt
import json
import sqlite3
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "market_data" / "tejhq_hf_10y" / "ohlcv.duckdb"
MANIFEST = ROOT / "data" / "market_data" / "tejhq_hf_10y" / "kite_adjusted_backfill" / "manifest.json"
OUT = ROOT / "reports" / "readiness" / "adjusted_ohlcv_coverage_audit.csv"
SUMMARY = ROOT / "reports" / "readiness" / "adjusted_ohlcv_coverage_summary.json"
START = "2016-09-22"
LATEST_REQUIRED = "2026-09-18"  # latest completed NSE trading session in the imported dataset


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["symbols"]
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        active = db.execute("""SELECT upper(symbol), max(isin), max(upstox_key_nse)
              FROM MasterTickers
             WHERE exchange='NSE' AND segment='EQ' AND status='ACTIVE'
               AND upstox_key_nse IS NOT NULL AND trim(upstox_key_nse)<>''
             GROUP BY upper(symbol) ORDER BY upper(symbol)""").fetchall()
    con = duckdb.connect(str(CATALOG), read_only=True)
    try:
        stats = {row[0]: row[1:] for row in con.execute("""SELECT upper(symbol), count(*),
              min(trade_date)::VARCHAR, max(trade_date)::VARCHAR,
              string_agg(DISTINCT data_source, ', ')
              FROM primary_adjusted_ohlcv GROUP BY upper(symbol)""").fetchall()}
    finally:
        con.close()

    rows, counts = [], {}
    for symbol, isin, upstox_key in active:
        bar_count, first, last, sources = stats.get(symbol, (0, None, None, None))
        kite_status = manifest.get(symbol, {}).get("status", "NOT_ATTEMPTED")
        if first and first <= START and last and last >= LATEST_REQUIRED:
            status = "CLEAN_FULL_10Y"
        elif last and last >= LATEST_REQUIRED and kite_status == "COMPLETE":
            status = "CURRENT_KITE_SHORTER_THAN_10Y"
        elif last and last >= LATEST_REQUIRED:
            status = "CURRENT_FALLBACK_ONLY"
        elif bar_count:
            status = "STALE_OR_PARTIAL"
        elif kite_status == "NO_CURRENT_KITE_INSTRUMENT":
            status = "NEEDS_SOURCE_KITE_UNAVAILABLE"
        else:
            status = "NEEDS_SOURCE"
        counts[status] = counts.get(status, 0) + 1
        rows.append({"symbol": symbol, "isin": isin or "", "upstox_key_nse": upstox_key or "",
                     "coverage_status": status, "kite_import_status": kite_status,
                     "rows": bar_count, "first_trade_date": first or "", "last_trade_date": last or "",
                     "sources": sources or "", "action": "NONE" if status == "CLEAN_FULL_10Y" else
                     "VERIFY_LISTING_DATE" if status == "CURRENT_KITE_SHORTER_THAN_10Y" else
                     "MAP_OR_BACKFILL"})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    payload = {"generated_at": dt.datetime.now(dt.UTC).isoformat(), "universe": len(rows),
               "required_start": START, "required_latest": LATEST_REQUIRED,
               "counts": counts, "clean_full_10y_pct": round(100 * counts.get("CLEAN_FULL_10Y", 0) / len(rows), 2),
               "detail_report": str(OUT.relative_to(ROOT))}
    SUMMARY.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
