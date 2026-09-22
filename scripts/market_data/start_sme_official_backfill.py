#!/usr/bin/env python3
"""Deterministic bootstrap for the official NSE SME backfill.

This deliberately does *not* call an LLM or mutate portfolio.db.  It snapshots
the existing SQLite-only candle evidence for the TejHQ coverage gap into a
quarantined Parquet layer.  Only an NSE-verified subsequent run may promote a
row to NSE_SME_SELF_ADJUSTED.
"""
from __future__ import annotations

import datetime as dt
import json
import sqlite3
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
SQLITE = ROOT / "portfolio.db"


def main() -> None:
    out = STORE / "sme_backfill"
    out.mkdir(parents=True, exist_ok=True)
    catalog = duckdb.connect(str(STORE / "ohlcv.duckdb"))
    try:
        mapped = {
            row[0]
            for row in catalog.execute("SELECT DISTINCT canonical_symbol FROM upstox_instrument_map WHERE upstox_key_nse IS NOT NULL").fetchall()
        }
        with sqlite3.connect(f"file:{SQLITE.as_posix()}?mode=ro", uri=True) as source:
            active = source.execute("""
                SELECT symbol, isin, upstox_key_nse FROM MasterTickers
                 WHERE exchange='NSE' AND segment='EQ' AND status='ACTIVE'
                   AND upstox_key_nse IS NOT NULL
            """).fetchall()
            gap_by_symbol = {}
            for symbol, isin, key in active:
                if symbol not in mapped:
                    # Preserve an ISIN/key when one duplicate master record lacks it.
                    gap_by_symbol.setdefault(symbol, (symbol, isin, key))
            gaps = list(gap_by_symbol.values())
            columns = ["symbol", "trade_date", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw", "turnover", "sqlite_data_source"]
            placeholders = ",".join("?" for _ in gaps)
            rows = pd.read_sql_query(f"""
                SELECT symbol, trade_date, open AS open_raw, high AS high_raw, low AS low_raw,
                       close AS close_raw, volume AS volume_raw, turnover,
                       data_source AS sqlite_data_source
                  FROM DailyOHLCV
                 WHERE symbol IN ({placeholders})
                 ORDER BY symbol, trade_date
            """, source, params=[x[0] for x in gaps])
        identity = pd.DataFrame(gaps, columns=["symbol", "isin", "upstox_key_nse"]).drop_duplicates("symbol")
        rows = rows.merge(identity, on="symbol", how="left")
        raw_path = out / "quarantine_sqlite_raw" / "part-0.parquet"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        rows.to_parquet(raw_path, index=False, compression="zstd")
        quoted = str(raw_path).replace("'", "''")
        catalog.execute(f"CREATE OR REPLACE VIEW sme_backfill_quarantine AS SELECT *, 'SQLITE_UNVERIFIED_RAW' AS verification_status FROM read_parquet('{quoted}')")
        manifest = {
            "started_at": dt.datetime.now(dt.UTC).isoformat(),
            "mode": "deterministic_no_llm",
            "target": "official_nse_sme_eod_and_corporate_actions",
            "active_upstox_gap_symbols": len(gaps),
            "sqlite_raw_symbols": int(rows["symbol"].nunique()),
            "sqlite_raw_rows": len(rows),
            "quarantine_path": str(raw_path.relative_to(STORE)),
            "promotion_rule": "Only raw NSE SME EOD rows plus validated official corporate actions may be promoted as NSE_SME_SELF_ADJUSTED.",
            "next_checkpoint": "download official NSE SME EOD and PR-bundle bc corporate-action files in rate-limited date batches"
        }
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps(manifest, indent=2))
    finally:
        catalog.close()


if __name__ == "__main__":
    main()
