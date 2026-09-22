#!/usr/bin/env python3
"""Read-only JSON query bridge for the app's permanent DuckDB candle store."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
KITE = STORE / "kite_adjusted_backfill" / "candles"
TEJHQ = STORE / "curated_adjusted_ohlcv" / "exchange=NSE"

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
con = duckdb.connect(":memory:")
try:
    placeholders = ",".join("?" for _ in symbols)
    # Query immutable Parquet directly. This avoids a cross-process lock on
    # the DuckDB catalog when the desktop app has concurrent strategy reads.
    # Kite remains primary; the curated adjusted source fills only absent keys.
    kite_files = [KITE / f"symbol={symbol}" / "part-0.parquet" for symbol in symbols]
    existing = [file.as_posix().replace("'", "''") for file in kite_files if file.exists()]
    if not existing:
        print("[]")
        raise SystemExit(0)
    file_list = ','.join(f"'{file}'" for file in existing)
    result = con.execute(f"""SELECT trade_date, symbol, isin, upstox_key_nse,
          open_adjusted, high_adjusted, low_adjusted, close_adjusted, volume_raw, data_source
        FROM read_parquet([{file_list}], union_by_name=true)
        WHERE upper(symbol) IN ({placeholders}) AND trade_date BETWEEN ? AND ?
        QUALIFY row_number() OVER (PARTITION BY upper(symbol) ORDER BY trade_date DESC) <= ?
        ORDER BY symbol, trade_date ASC""", [*symbols, args.from_date, args.to_date, args.limit])
    columns = [column[0] for column in result.description]
    print(json.dumps([dict(zip(columns, row)) for row in result.fetchall()], default=str, separators=(',', ':')))
finally:
    con.close()
