#!/usr/bin/env python3
"""Persist target NSE raw EOD rows from already archived official bhavcopies."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "data/market_data/tejhq_hf_10y/nse_official_gap_audit"
TARGETS = ROOT / "reports/readiness/adjusted_ohlcv_remaining_targets.csv"
OUT = BASE / "nse_gap_raw_all_archived.parquet"


def main() -> None:
    with TARGETS.open(encoding="utf-8") as f:
        targets = {r["isin"].upper(): r["symbol"] for r in csv.DictReader(f) if r["isin"]}
    rows = []
    for source in sorted(BASE.glob("BhavCopy_NSE_CM_0_0_0_*_F_0000.csv.zip")):
        with zipfile.ZipFile(source) as archive:
            csv_name = next(n for n in archive.namelist() if n.lower().endswith(".csv"))
            with archive.open(csv_name) as data:
                for item in csv.DictReader(io.TextIOWrapper(data, encoding="utf-8-sig")):
                    isin = str(item.get("ISIN", "")).upper()
                    if isin not in targets:
                        continue
                    try:
                        o, h, l, c = (float(item[k]) for k in ("OpnPric", "HghPric", "LwPric", "ClsPric"))
                        volume = int(float(item["TtlTradgVol"]))
                    except (ValueError, KeyError):
                        continue
                    if min(o, h, l, c) <= 0 or h < max(o, c, l) or l > min(o, c):
                        continue
                    rows.append({"trade_date": item["TradDt"], "requested_symbol": targets[isin],
                        "exchange_symbol": item.get("TckrSymb", ""), "isin": isin,
                        "exchange_series": item.get("SctySrs", ""),
                        "open_raw": o, "high_raw": h, "low_raw": l, "close_raw": c,
                        "volume_raw": volume, "source_archive": source.name,
                        "data_source": "NSE_CM_UDIFF_OFFICIAL_RAW_PENDING_ADJUSTMENT"})
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise RuntimeError("No target rows found in archived NSE bhavcopies")
    frame = frame.drop_duplicates(["trade_date", "isin", "exchange_series", "exchange_symbol"])
    con = duckdb.connect(":memory:")
    try:
        con.register("nse_gap_raw", frame)
        tmp = OUT.with_suffix(".parquet.partial")
        quoted = str(tmp).replace("'", "''")
        con.execute(f"COPY nse_gap_raw TO '{quoted}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        tmp.replace(OUT)
    finally:
        con.close()
    summary = {"archives": len(list(BASE.glob("BhavCopy_NSE_CM_0_0_0_*_F_0000.csv.zip"))),
        "rows": len(frame), "symbols": int(frame["isin"].nunique()),
        "first_trade_date": str(frame["trade_date"].min()),
        "last_trade_date": str(frame["trade_date"].max()),
        "adjustment_status": "RAW_PENDING_OFFICIAL_CA_RECONCILIATION",
        "path": str(OUT.relative_to(ROOT))}
    (BASE / "raw_extraction_manifest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
