import duckdb

con = duckdb.connect("data/market_data/tejhq_hf_10y/ohlcv.duckdb", read_only=True)
for tbl in ["app_adjusted_ohlcv", "kite_adjusted_ohlcv", "primary_adjusted_ohlcv"]:
    try:
        print(f"\n=== Table {tbl} ===")
        rows = con.execute(f"""
            SELECT trade_date, count(distinct symbol), count(*) 
            FROM {tbl} 
            WHERE trade_date >= '2026-09-25' 
            GROUP BY trade_date 
            ORDER BY trade_date
        """).fetchall()
        for r in rows:
            print(" ", r)
    except Exception as e:
        print(f"  error in {tbl}: {e}")
