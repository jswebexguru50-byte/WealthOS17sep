# Hugging Face → DuckDB / Parquet adjusted OHLCV

`build_hf_adjusted_ohlcv_store.py` builds a ten-year NSE EOD store from
[`tejhq/indian-markets`](https://huggingface.co/datasets/tejhq/indian-markets).
It does not modify `portfolio.db`.

The output contains:

- `source/prices_adjusted/`: immutable annual Hugging Face source Parquet files.
- `source/actions/`: annual corporate-action Parquet files.
- `curated_adjusted_ohlcv/exchange=NSE/year=YYYY/`: Zstandard-compressed,
  derived Parquet partitions.
- `ohlcv.duckdb`: catalog with `adjusted_ohlcv`, `corporate_actions_raw`, and
  `ingestion_metadata` views.
- `ingestion_manifest.json`: source URLs, SHA-256 checksums, row counts, and
  requested time window.

`open_adjusted`, `high_adjusted`, `low_adjusted`, and `close_adjusted` are
back-adjusted using TejHQ’s cumulative corporate-action factor. `volume_raw`
is intentionally not dividend-adjusted; it remains the exchange-reported
traded quantity.

Run with the workspace-local dependencies:

```powershell
$env:PYTHONPATH = '.tools/hf_ohlcv_env'
& 'C:\Users\gopal\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\market_data\build_hf_adjusted_ohlcv_store.py --allow-insecure-tls
```
