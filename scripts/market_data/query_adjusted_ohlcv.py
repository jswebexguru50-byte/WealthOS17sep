#!/usr/bin/env python3
"""Read-only JSON query bridge for the app's permanent DuckDB candle store."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "market_data" / "tejhq_hf_10y" / "ohlcv.duckdb"

parser = argparse.ArgumentParser()
parser.add_argument("--symbol", required=True)
parser.add_argument("--limit", type=int, default=365)
parser.add_argument("--from-date", default="1900-01-01")
parser.add_argument("--to-date", default="2999-12-31")
args = parser.parse_args()
if not args.symbol.replace("-", "").replace("_", "").isalnum() or args.limit < 1 or args.limit > 10000:
    raise SystemExit("Invalid query")
con = duckdb.connect(str(CATALOG), read_only=True)
try:
    rows = con.execute("""SELECT trade_date, symbol, isin, upstox_key_nse,
          open_adjusted, high_adjusted, low_adjusted, close_adjusted, volume_raw, data_source
        FROM app_adjusted_ohlcv
        WHERE upper(symbol)=upper(?) AND trade_date BETWEEN ? AND ?
        ORDER BY trade_date DESC LIMIT ?""", [args.symbol, args.from_date, args.to_date, args.limit]).fetchdf()
    print(rows.to_json(orient="records", date_format="iso"))
finally:
    con.close()
