#!/usr/bin/env python3
"""Offline-only reconciliation and publication of the adjusted OHLCV store.

Run after (or between resumptions of) the Kite import.  It never writes candle
data into portfolio.db.  It validates every persisted Parquet partition, builds
the durable DuckDB primary/fallback views, and writes a coverage report the app
and operators can inspect without downloading anything.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
CATALOG = STORE / "ohlcv.duckdb"
KITE = STORE / "kite_adjusted_backfill" / "candles"
REPORT = STORE / "offline_reconciliation.json"
READINESS_REPORT = ROOT / "reports" / "readiness" / "adjusted_ohlcv_store_report.json"
MAPPING = STORE / "instrument_mapping" / "kite_upstox_instrument_map.parquet"
INVALID = STORE / "quarantine_invalid_ohlcv.parquet"


def main() -> None:
    partitions = sorted(KITE.glob("symbol=*/part-0.parquet"))
    if not partitions:
        raise SystemExit("No Kite partitions found; run the Kite importer first.")
    glob = (KITE / "symbol=*" / "part-0.parquet").as_posix().replace("'", "''")
    con = duckdb.connect(str(CATALOG))
    try:
        # read_parquet itself validates Parquet footers/schema and fails closed
        con.execute(f"CREATE OR REPLACE VIEW kite_adjusted_ohlcv AS SELECT * FROM read_parquet('{glob}', union_by_name=true)")
        # Deduplicate identity mapping once, then anti-join a compact Kite key
        # set. This avoids a correlated re-scan of multi-million-row Parquet
        # data during validation.
        con.execute("""CREATE OR REPLACE VIEW primary_adjusted_ohlcv_unvalidated AS
          WITH source_map AS (
            SELECT source_symbol, source_isin, any_value(upstox_key_nse) AS upstox_key_nse
              FROM upstox_instrument_map
             GROUP BY source_symbol, source_isin
          ), kite_keys AS (
            SELECT DISTINCT upstox_key_nse, trade_date FROM kite_adjusted_ohlcv
          )
          SELECT trade_date, symbol, isin, upstox_key_nse, open_adjusted,
                 high_adjusted, low_adjusted, close_adjusted, volume_raw, data_source
            FROM kite_adjusted_ohlcv
          UNION ALL
          SELECT a.trade_date, a.symbol, a.isin, m.upstox_key_nse,
                 a.open_adjusted, a.high_adjusted, a.low_adjusted,
                 a.close_adjusted, a.volume_raw, a.data_source
            FROM adjusted_ohlcv a
            LEFT JOIN source_map m
              ON a.symbol=m.source_symbol AND a.isin IS NOT DISTINCT FROM m.source_isin
            LEFT JOIN kite_keys k
              ON k.upstox_key_nse=m.upstox_key_nse AND k.trade_date=a.trade_date
           WHERE k.upstox_key_nse IS NULL""")
        con.execute("""CREATE OR REPLACE VIEW primary_adjusted_ohlcv AS
          SELECT * FROM primary_adjusted_ohlcv_unvalidated
           WHERE trade_date IS NOT NULL AND open_adjusted > 0 AND high_adjusted > 0
             AND low_adjusted > 0 AND close_adjusted > 0 AND high_adjusted >= low_adjusted
             AND high_adjusted >= open_adjusted AND high_adjusted >= close_adjusted
             AND low_adjusted <= open_adjusted AND low_adjusted <= close_adjusted""")
        con.execute("""CREATE OR REPLACE VIEW market_data_source_policy AS
          SELECT 'KITE_CORPORATE_ACTION_ADJUSTED' AS primary_source,
                 'TEJHQ_HF_OFFICIAL_BHAVCOPY_ADJUSTED' AS fallback_source,
                 'UPSTOX_LIVE_WITH_STORED_ADJUSTMENT_FACTOR' AS live_overlay""")
        MAPPING.parent.mkdir(parents=True, exist_ok=True)
        mapping_path = MAPPING.as_posix().replace("'", "''")
        con.execute(f"""COPY (
          SELECT DISTINCT symbol, isin, upstox_key_nse, kite_instrument_token,
                 'KITE_TO_UPSTOX' AS mapping_source
            FROM kite_adjusted_ohlcv
           WHERE upstox_key_nse IS NOT NULL
        ) TO '{mapping_path}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
        summary = con.execute("""SELECT count(*) AS rows, count(DISTINCT symbol) AS symbols,
              min(trade_date) AS first_date, max(trade_date) AS last_date,
              sum(CASE WHEN data_source='KITE_CORPORATE_ACTION_ADJUSTED' THEN 1 ELSE 0 END) AS kite_rows
            FROM primary_adjusted_ohlcv""").fetchone()
        invalid = con.execute("""SELECT count(*) FROM primary_adjusted_ohlcv_unvalidated
              WHERE trade_date IS NULL OR open_adjusted <= 0 OR high_adjusted <= 0
                 OR low_adjusted <= 0 OR close_adjusted <= 0 OR high_adjusted < low_adjusted
                 OR high_adjusted < open_adjusted OR high_adjusted < close_adjusted
                 OR low_adjusted > open_adjusted OR low_adjusted > close_adjusted""").fetchone()[0]
        invalid_path = INVALID.as_posix().replace("'", "''")
        con.execute(f"""COPY (SELECT * FROM primary_adjusted_ohlcv_unvalidated
              WHERE trade_date IS NULL OR open_adjusted <= 0 OR high_adjusted <= 0
                 OR low_adjusted <= 0 OR close_adjusted <= 0 OR high_adjusted < low_adjusted
                 OR high_adjusted < open_adjusted OR high_adjusted < close_adjusted
                 OR low_adjusted > open_adjusted OR low_adjusted > close_adjusted)
              TO '{invalid_path}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
        manifest_path = STORE / "kite_adjusted_backfill" / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        statuses: dict[str, int] = {}
        for record in manifest.get("symbols", {}).values():
            status = record.get("status", "UNKNOWN")
            statuses[status] = statuses.get(status, 0) + 1
        payload = {"generated_at": dt.datetime.now(dt.UTC).isoformat(), "status": "READY",
                   "validated_kite_partitions": len(partitions), "primary_rows": summary[0],
                   "primary_symbols": summary[1], "first_trade_date": str(summary[2]),
                   "last_trade_date": str(summary[3]), "kite_primary_rows": summary[4],
                   "invalid_rows_quarantined": invalid, "catalog": str(CATALOG.relative_to(ROOT)),
                   "datasets": {"kite_primary": "kite_adjusted_backfill/candles",
                                "tejhq_fallback": "curated_adjusted_ohlcv",
                                "app_catalog": "ohlcv.duckdb",
                                "kite_upstox_mapping": str(MAPPING.relative_to(ROOT))},
                   "kite_import_statuses": statuses,
                   "live_policy": "Upstox latest candle is overlaid on the current adjusted price basis; prior history is Kite-adjusted."}
        REPORT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        READINESS_REPORT.parent.mkdir(parents=True, exist_ok=True)
        READINESS_REPORT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(json.dumps(payload, indent=2))
    finally:
        con.close()


if __name__ == "__main__":
    main()
