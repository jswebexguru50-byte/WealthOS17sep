"""Stream one adjusted daily OHLCV JSON record per locally covered symbol."""
from __future__ import annotations

import argparse
import json

import duckdb

from vpa_three_leg_screen import DEFAULT_PARQUET_ROOT, load_local_symbols, read_adjusted_daily


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of-date", required=True)
    parser.add_argument("--first-history-date", default="2025-01-01")
    args = parser.parse_args()
    symbols = load_local_symbols(DEFAULT_PARQUET_ROOT)
    con = duckdb.connect(":memory:")
    for symbol in symbols["symbol"]:
        daily = read_adjusted_daily(symbol, DEFAULT_PARQUET_ROOT, con)
        if daily.empty:
            print(json.dumps({"symbol": symbol, "candles": []}), flush=True)
            continue
        daily = daily.loc[(daily["trade_date"].astype(str) >= args.first_history_date) &
                          (daily["trade_date"].astype(str) <= args.as_of_date)]
        candles = [{"date": str(row.trade_date), "open": float(row.open), "high": float(row.high),
                    "low": float(row.low), "close": float(row.close), "volume": float(row.volume)}
                   for row in daily.itertuples(index=False)]
        print(json.dumps({"symbol": symbol, "candles": candles}, separators=(",", ":")), flush=True)
    con.close()


if __name__ == "__main__":
    main()
