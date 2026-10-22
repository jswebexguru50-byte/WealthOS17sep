import duckdb
from pathlib import Path

kite_path = Path("data/market_data/tejhq_hf_10y/kite_adjusted_backfill/candles")
partitions = list(kite_path.glob("symbol=*"))
print(f"Total partitions in kite_adjusted_backfill: {len(partitions)}")

con = duckdb.connect()
dates = []
for p in partitions[:50]:
    f = p / "part-0.parquet"
    if f.exists():
        d = con.execute(f"SELECT max(trade_date) FROM read_parquet('{f.as_posix()}')").fetchone()[0]
        dates.append(str(d)[:10])

print("Sample max dates:", sorted(list(set(dates))))
