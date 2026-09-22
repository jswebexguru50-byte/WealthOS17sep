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
parser.add_argument("--symbol")
parser.add_argument("--symbols", help="Comma-separated canonical symbols for a bounded batch query")
parser.add_argument("--limit", type=int, default=365)
parser.add_argument("--from-date", default="1900-01-01")
parser.add_argument("--to-date", default="2999-12-31")
args = parser.parse_args()
symbols = [s.strip().upper() for s in (args.symbol or "").split(",") if s.strip()]
symbols.extend(s.strip().upper() for s in (args.symbols or "").split(",") if s.strip())
symbols = list(dict.fromkeys(symbols))
if not symbols or len(symbols) > 500 or any(not s.replace("-", "").replace("_", "").isalnum() for s in symbols) or args.limit < 1 or args.limit > 10000:
    raise SystemExit("Invalid query")
con = duckdb.connect(str(CATALOG), read_only=True)
try:
    placeholders = ",".join("?" for _ in symbols)
    rows = con.execute(f"""SELECT trade_date, symbol, isin, upstox_key_nse,
          open_adjusted, high_adjusted, low_adjusted, close_adjusted, volume_raw, data_source
        FROM app_adjusted_ohlcv
        WHERE upper(symbol) IN ({placeholders}) AND trade_date BETWEEN ? AND ?
        QUALIFY row_number() OVER (PARTITION BY upper(symbol) ORDER BY trade_date DESC) <= ?
        ORDER BY symbol, trade_date ASC""", [*symbols, args.from_date, args.to_date, args.limit]).fetchdf()
    print(rows.to_json(orient="records", date_format="iso"))
finally:
    con.close()
