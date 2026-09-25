import duckdb
res = duckdb.query("SELECT MAX(trade_date) FROM read_parquet('data/market_data/tejhq_hf_10y/kite_adjusted_backfill/candles/*/*.parquet')").fetchall()
print("Kite candles max date:", res)

try:
    res2 = duckdb.query("SELECT MAX(trade_date) FROM read_parquet('data/market_data/tejhq_hf_10y/kite_index_backfill/candles/*/*.parquet')").fetchall()
    print("Kite index max date:", res2)
except Exception as e:
    pass
