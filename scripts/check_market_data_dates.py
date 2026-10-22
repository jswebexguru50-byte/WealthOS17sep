import duckdb
import sqlite3
from pathlib import Path

print("=== Checking DuckDB & Parquet ===")
candles_dir = Path("data/market_data/tejhq_hf_10y/candles")
if candles_dir.exists():
    parquet_files = list(candles_dir.glob("*.parquet"))
    print(f"Total parquet files: {len(parquet_files)}")
    if parquet_files:
        con = duckdb.connect()
        sample = parquet_files[0]
        res = con.execute(f"SELECT min(trade_date), max(trade_date) FROM read_parquet('{sample.as_posix()}')").fetchone()
        print(f"Sample {sample.name}: {res}")
        
        # Check 10 random files for max date
        dates = []
        for p in parquet_files[:15]:
            d = con.execute(f"SELECT max(trade_date) FROM read_parquet('{p.as_posix()}')").fetchone()[0]
            dates.append(str(d)[:10])
        print("Max dates across sample candles:", sorted(list(set(dates))))

# Check Kite backfill
kite_dir = Path("data/market_data/tejhq_hf_10y/kite_index_backfill/candles")
if kite_dir.exists():
    con = duckdb.connect()
    for p in list(kite_dir.glob("*.parquet"))[:5]:
        d = con.execute(f"SELECT min(trade_date), max(trade_date) FROM read_parquet('{p.as_posix()}')").fetchone()
        print(f"Kite index {p.name}: {d}")

# Check SQLite HistoricalPrices
print("\n=== Checking portfolio.db ===")
con_sql = sqlite3.connect("portfolio.db")
cur = con_sql.cursor()
for tbl in ["HistoricalPrices", "PriceHistoryCache", "Prices"]:
    try:
        cur.execute(f"SELECT count(*), min(date), max(date) FROM {tbl}")
        print(f"{tbl}: {cur.fetchone()}")
    except Exception as e:
        print(f"{tbl}: error {e}")

# Check strategy reports
print("\n=== Checking Strategy Readiness Reports ===")
rep_dir = Path("reports/readiness/vpa_three_leg")
if rep_dir.exists():
    for f in sorted(rep_dir.glob("*.json"))[-7:]:
        print(f.name)
