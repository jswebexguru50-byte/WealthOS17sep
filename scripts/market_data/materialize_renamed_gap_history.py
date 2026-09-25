#!/usr/bin/env python3
"""Materialize verified same-ISIN ticker renames for app history queries."""
from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data/market_data/tejhq_hf_10y"
STAGING = STORE / "upstox_targeted_backfill"
OUT = STORE / "resolved_symbol_aliases"
TARGETS = ROOT / "reports/readiness/adjusted_ohlcv_remaining_targets.csv"
REPORT = ROOT / "reports/readiness/adjusted_ohlcv_resolved_aliases.csv"


def main() -> None:
    snapshot = sorted((STAGING / "instrument_snapshots").glob("current_nse_*.json.gz"))[-1]
    instruments = json.loads(gzip.decompress(snapshot.read_bytes()))
    current_by_isin = {str(r.get("isin", "")).upper(): str(r.get("trading_symbol", "")).upper()
                       for r in instruments if r.get("segment") == "NSE_EQ" and r.get("isin")}
    with TARGETS.open(encoding="utf-8") as f:
        targets = list(csv.DictReader(f))
    aliases = [(r["symbol"], current_by_isin.get(r["isin"].upper()), r["isin"])
               for r in targets if current_by_isin.get(r["isin"].upper()) and
               current_by_isin[r["isin"].upper()] != r["symbol"]]
    con = duckdb.connect(str(STORE / "ohlcv.duckdb"), read_only=True)
    results = []
    try:
        for old, new, isin in aliases:
            dest = OUT / f"symbol={old}" / "part-0.parquet"
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(".parquet.partial")
            frame = con.execute("""
                SELECT trade_date, ? AS symbol, isin, upstox_key_nse, open_adjusted,
                       high_adjusted, low_adjusted, close_adjusted, volume_raw, data_source
                FROM primary_adjusted_ohlcv WHERE isin = ?
                QUALIFY row_number() OVER (
                    PARTITION BY trade_date ORDER BY
                      CASE WHEN data_source='KITE_CORPORATE_ACTION_ADJUSTED' THEN 0 ELSE 1 END,
                      CASE WHEN symbol=? THEN 0 ELSE 1 END) = 1
                ORDER BY trade_date
            """, [old, isin, new]).df()
            count = len(frame)
            if not count:
                continue
            first, last = frame["trade_date"].min(), frame["trade_date"].max()
            con.register("alias_frame", frame)
            quoted = str(tmp).replace("'", "''")
            con.execute(f"COPY alias_frame TO '{quoted}' (FORMAT PARQUET, COMPRESSION ZSTD)")
            con.unregister("alias_frame")
            tmp.replace(dest)
            results.append({"requested_symbol": old, "current_symbol": new, "isin": isin,
                            "rows": count, "first_trade_date": str(first), "last_trade_date": str(last),
                            "path": str(dest.relative_to(STORE))})
    finally:
        con.close()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "aliases.json").write_text(json.dumps({r["requested_symbol"]: r for r in results}, indent=2), encoding="utf-8")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)
    print(json.dumps({"resolved_aliases": len(results), "rows": sum(r["rows"] for r in results),
                      "report": str(REPORT.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
