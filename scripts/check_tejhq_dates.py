import duckdb
from pathlib import Path

duck_path = Path("data/market_data/tejhq_hf_10y/ohlcv.duckdb")
print("DuckDB exists:", duck_path.exists())
if duck_path.exists():
    con = duckdb.connect(str(duck_path), read_only=True)
    tables = con.execute("SHOW TABLES").fetchall()
    print("Tables:", tables)
    for t in tables:
        tbl = t[0]
        cnt = con.execute(f"SELECT count(*) FROM {tbl}").fetchone()[0]
        min_d, max_d = con.execute(f"SELECT min(trade_date), max(trade_date) FROM {tbl}").fetchone()
        print(f"Table {tbl}: count={cnt}, min={min_d}, max={max_d}")

kite_path = Path("data/market_data/tejhq_hf_10y/kite_adjusted_backfill/candles")
print("\nKite backfill exists:", kite_path.exists())
if kite_path.exists():
    partitions = list(kite_path.glob("symbol=*"))
    print(f"Total partitions: {len(partitions)}")
    if partitions:
        sample = list(partitions[0].glob("*.parquet"))
        if sample:
            con = duckdb.connect()
            r = con.execute(f"SELECT min(trade_date), max(trade_date) FROM read_parquet('{sample[0].as_posix()}')").fetchone()
            print(f"Sample partition {partitions[0].name}: min={r[0]}, max={r[1]}")
        # check max date across 20 partitions
        max_dates = []
        for p in partitions[:25]:
            files = list(p.glob("*.parquet"))
            if files:
                m = con.execute(f"SELECT max(trade_date) FROM read_parquet('{files[0].as_posix()}')").fetchone()[0]
                max_dates.append(str(m)[:10])
        print("Max dates across sample partitions:", sorted(list(set(max_dates))))
