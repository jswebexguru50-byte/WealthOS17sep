#!/usr/bin/env python3
"""Compare staged Upstox candles to adjusted history without promoting rows."""
from __future__ import annotations

import csv
import datetime as dt
import gzip
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data/market_data/tejhq_hf_10y"
STAGING = STORE / "upstox_targeted_backfill"
OUT = ROOT / "reports/readiness/upstox_staged_68_reconciliation.csv"


def main() -> None:
    manifest = json.loads((STAGING / "manifest.json").read_text(encoding="utf-8"))["symbols"]
    snapshot_dir = STAGING / "instrument_snapshots"
    current_files = sorted(snapshot_dir.glob("current_nse_*.json.gz"))
    suspended_files = sorted(snapshot_dir.glob("suspended_*.json.gz"))
    current_isins = {str(x.get("isin", "")).upper() for x in json.loads(gzip.decompress(current_files[-1].read_bytes()))} if current_files else set()
    suspended_isins = {str(x.get("isin", "")).upper() for x in json.loads(gzip.decompress(suspended_files[-1].read_bytes()))} if suspended_files else set()
    con = duckdb.connect(str(STORE / "ohlcv.duckdb"), read_only=True)
    rows = []
    try:
        staged_records = [r for r in manifest.values() if r.get("status") == "STAGED"]
        isins = sorted({r["isin"] for r in staged_records})
        placeholders = ",".join("?" for _ in isins)
        con.execute(f"""CREATE TEMP TABLE comparison_existing AS
            SELECT isin, upstox_key_nse, trade_date, close_adjusted
            FROM primary_adjusted_ohlcv WHERE isin IN ({placeholders})""", isins)
        for symbol, record in sorted(manifest.items()):
            if record.get("status") != "STAGED":
                continue
            candle_path = (STAGING / record["path"]).as_posix().replace("'", "''")
            result = con.execute(f"""
                WITH existing AS (
                    SELECT trade_date, close_adjusted FROM comparison_existing
                    WHERE isin = ? AND upstox_key_nse = ?
                ), staged AS (SELECT trade_date, close_raw FROM read_parquet('{candle_path}')),
                comparison AS (
                    SELECT s.trade_date, s.close_raw, e.close_adjusted,
                           (SELECT max(trade_date) FROM existing) AS existing_last
                    FROM staged s LEFT JOIN existing e USING (trade_date)
                )
                SELECT count(*) FILTER (WHERE close_adjusted IS NOT NULL),
                       count(*) FILTER (WHERE close_adjusted IS NULL AND trade_date > existing_last),
                       max(abs(close_raw / nullif(close_adjusted, 0) - 1))
                           FILTER (WHERE close_adjusted IS NOT NULL),
                       max(trade_date) FILTER (WHERE close_adjusted IS NOT NULL),
                       max(existing_last), max(trade_date)
                FROM comparison
            """, [record["isin"], record["upstox_key_nse"]]).fetchone()
            actions_payload = json.loads((STAGING / record["corporate_actions_path"]).read_text(encoding="utf-8"))
            actions = actions_payload.get("data", [])
            names = sorted({str(x.get("name", "")).upper() for x in actions})
            rows.append({
                "symbol": symbol, "isin": record["isin"], "staged_rows": record["rows"],
                "instrument_status": "CURRENT" if record["isin"].upper() in current_isins else
                                     "SUSPENDED" if record["isin"].upper() in suspended_isins else "ABSENT",
                "staged_last_date": record["last_trade_date"],
                "adjusted_last_date": str(result[4] or ""),
                "overlap_rows": result[0], "newer_staged_rows": result[1],
                "max_overlap_close_deviation_pct": round(100 * result[2], 4) if result[2] is not None else "",
                "last_overlap_date": str(result[3] or ""),
                "action_response_status": actions_payload.get("status", ""),
                "reported_action_types": ",".join(names),
                "decision": "HOLD_ACTION_RECONCILIATION" if names else
                            "HOLD_PRICE_BASIS_MISMATCH" if result[2] is None or result[2] > 0.02 else
                            "HOLD_STALE_SOURCE" if not result[1] else "CANDIDATE_RECENT_EXTENSION",
            })
    finally:
        con.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    counts = {status: sum(r["decision"] == status for r in rows)
              for status in sorted({r["decision"] for r in rows})}
    print(json.dumps({"generated_at": dt.datetime.now(dt.UTC).isoformat(),
                      "staged_symbols": len(rows), "decisions": counts,
                      "newer_staged_rows": sum(r["newer_staged_rows"] for r in rows),
                      "report": str(OUT.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
