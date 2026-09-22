#!/usr/bin/env python3
"""Build a DuckDB catalog over TejHQ's Hugging Face NSE adjusted OHLCV Parquet.

The catalog stores data as Parquet; DuckDB contains only views and metadata.
Prices are back-adjusted by TejHQ's cumulative corporate-action factor. Volume is
retained as the exchange-reported volume because dividend adjustments do not have
a meaningful volume equivalent.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sqlite3
import ssl
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "data" / "market_data" / "tejhq_hf_10y"
DATASET = "tejhq/indian-markets"
REVISION = "main"


def source_url(tree: str, year: int) -> str:
    return (
        f"https://huggingface.co/datasets/{DATASET}/resolve/{REVISION}/"
        f"{tree}/nse_{year}.parquet"
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, destination: Path, insecure_tls: bool) -> None:
    if destination.exists() and destination.stat().st_size:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    context = ssl._create_unverified_context() if insecure_tls else None
    request = urllib.request.Request(url, headers={"User-Agent": "wealthos-hf-ohlcv/1.0"})
    try:
        with urllib.request.urlopen(request, context=context, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def qliteral(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def create_partition(con, source: Path, destination: Path, start: str, end: str) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    columns = {row[0] for row in con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(source)]).fetchall()}
    required = {"date", "symbol", "open", "high", "low", "close", "volume", "adj_factor_cumulative", "adj_close"}
    missing = required - columns
    if missing:
        raise RuntimeError(f"{source.name} lacks required columns: {sorted(missing)}")
    optional = [name for name in ("series", "isin", "name", "last", "prev_close", "turnover", "trades") if name in columns]
    select_optional = ", ".join(qident(name) for name in optional)
    optional_prefix = (select_optional + ",") if select_optional else ""
    con.execute(
        f"""
        COPY (
          SELECT
            date::DATE AS trade_date,
            symbol,
            {optional_prefix}
            open AS open_raw, high AS high_raw, low AS low_raw, close AS close_raw,
            volume AS volume_raw,
            adj_factor_cumulative,
            open * adj_factor_cumulative AS open_adjusted,
            high * adj_factor_cumulative AS high_adjusted,
            low * adj_factor_cumulative AS low_adjusted,
            adj_close AS close_adjusted,
            'TEJHQ_HF_OFFICIAL_BHAVCOPY_ADJUSTED' AS data_source
          FROM read_parquet(?)
          WHERE date >= ?::DATE AND date <= ?::DATE
        ) TO ? (FORMAT PARQUET, COMPRESSION ZSTD)
        """,
        [str(destination), str(source), start, end],
    )
    return con.execute("SELECT count(*) FROM read_parquet(?)", [str(destination)]).fetchone()[0]


def create_instrument_mapping(con, output: Path) -> dict:
    """Map historic source identities to current Upstox instrument keys via ISIN."""
    import pandas as pd

    sqlite_path = ROOT / "portfolio.db"
    if not sqlite_path.exists():
        raise RuntimeError(f"SQLite master not found: {sqlite_path}")
    with sqlite3.connect(f"file:{sqlite_path.as_posix()}?mode=ro", uri=True) as sqlite:
        masters = pd.read_sql_query(
            """SELECT symbol AS canonical_symbol, isin AS canonical_isin, exchange,
                      upstox_key_nse, upstox_key_bse
                 FROM MasterTickers
                WHERE isin IS NOT NULL
                  AND (upstox_key_nse IS NOT NULL OR upstox_key_bse IS NOT NULL)""",
            sqlite,
        )
    con.register("sqlite_master_tickers", masters)
    glob = (output / "curated_adjusted_ohlcv" / "exchange=NSE" / "year=*" / "*.parquet").as_posix()
    map_path = output / "instrument_mapping" / "upstox_instrument_map.parquet"
    map_path.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        """
        COPY (
          WITH source_ids AS (
            SELECT DISTINCT symbol AS source_symbol, isin AS source_isin
              FROM read_parquet(?)
          ), candidates AS (
            SELECT s.source_symbol, s.source_isin, m.canonical_symbol,
                   m.canonical_isin, m.exchange, m.upstox_key_nse, m.upstox_key_bse,
                   CASE WHEN s.source_isin = m.canonical_isin THEN 'ISIN'
                        ELSE 'SYMBOL_FALLBACK' END AS match_method,
                   row_number() OVER (
                     PARTITION BY s.source_symbol, s.source_isin
                     ORDER BY CASE WHEN s.source_isin = m.canonical_isin THEN 0 ELSE 1 END,
                              m.canonical_symbol
                   ) AS priority
              FROM source_ids s
              JOIN sqlite_master_tickers m
                ON s.source_isin = m.canonical_isin
                OR (s.source_symbol = m.canonical_symbol AND m.exchange = 'NSE')
          )
          SELECT source_symbol, source_isin, canonical_symbol, canonical_isin, exchange,
                 upstox_key_nse, upstox_key_bse, match_method
            FROM candidates WHERE priority = 1
        ) TO ? (FORMAT PARQUET, COMPRESSION ZSTD)
        """,
        [str(map_path), glob],
    )
    con.unregister("sqlite_master_tickers")
    source_count = con.execute("SELECT count(*) FROM (SELECT DISTINCT symbol, isin FROM read_parquet(?))", [glob]).fetchone()[0]
    mapped_count = con.execute("SELECT count(*) FROM read_parquet(?)", [str(map_path)]).fetchone()[0]
    return {"source_identities": source_count, "upstox_mapped_identities": mapped_count, "path": str(map_path.relative_to(output))}


def create_catalog(con, output: Path, metadata_path: Path) -> None:
    glob = (output / "curated_adjusted_ohlcv" / "exchange=NSE" / "year=*" / "*.parquet").as_posix()
    actions_glob = (output / "source" / "actions" / "*.parquet").as_posix()
    map_path = (output / "instrument_mapping" / "upstox_instrument_map.parquet").as_posix()
    con.execute(f"CREATE OR REPLACE VIEW adjusted_ohlcv AS SELECT * FROM read_parquet({qliteral(glob)})")
    con.execute(f"CREATE OR REPLACE VIEW corporate_actions_raw AS SELECT * FROM read_parquet({qliteral(actions_glob)})")
    con.execute(f"CREATE OR REPLACE VIEW upstox_instrument_map AS SELECT * FROM read_parquet({qliteral(map_path)})")
    con.execute("""CREATE OR REPLACE VIEW upstox_adjusted_ohlcv AS
      SELECT m.upstox_key_nse AS instrument_key, m.canonical_symbol, a.*
        FROM adjusted_ohlcv a
        JOIN upstox_instrument_map m
          ON a.symbol = m.source_symbol AND a.isin IS NOT DISTINCT FROM m.source_isin""")
    con.execute(f"CREATE OR REPLACE VIEW ingestion_metadata AS SELECT * FROM read_json_auto({qliteral(str(metadata_path))})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--start", default=(dt.date.today().replace(year=dt.date.today().year - 10)).isoformat())
    parser.add_argument("--end", default=dt.date.today().isoformat())
    parser.add_argument("--allow-insecure-tls", action="store_true", help="Required only for TLS-intercepting environments.")
    parser.add_argument("--mapping-only", action="store_true", help="Refresh the SQLite-to-Upstox mapping without downloading or rewriting candle partitions.")
    args = parser.parse_args()
    start, end = dt.date.fromisoformat(args.start), dt.date.fromisoformat(args.end)
    if end < start:
        raise ValueError("--end must be on or after --start")

    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Install duckdb and pyarrow first; see README in this directory.") from exc

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    # Newest first: useful/current data becomes available before historical backfill.
    years = range(end.year, start.year - 1, -1)
    source_prices = output / "source" / "prices_adjusted"
    source_actions = output / "source" / "actions"
    metadata_path = output / "ingestion_manifest.json"
    catalog_path = output / "ohlcv.duckdb"
    manifest = {"dataset": DATASET, "revision": REVISION, "exchange": "NSE", "requested_start": str(start), "requested_end": str(end), "generated_at": dt.datetime.now(dt.UTC).isoformat(), "partitions": []}
    if args.mapping_only:
        if not metadata_path.exists():
            raise RuntimeError("Cannot refresh mapping before the candle store has been built.")
        manifest = json.loads(metadata_path.read_text(encoding="utf-8"))
        manifest["mapping_refreshed_at"] = dt.datetime.now(dt.UTC).isoformat()
    con = duckdb.connect(str(catalog_path))
    try:
        if not args.mapping_only:
            for year in years:
                price_file = source_prices / f"nse_{year}.parquet"
                action_file = source_actions / f"nse_{year}.parquet"
                download(source_url("prices_adjusted", year), price_file, args.allow_insecure_tls)
                download(source_url("actions", year), action_file, args.allow_insecure_tls)
                partition = output / "curated_adjusted_ohlcv" / "exchange=NSE" / f"year={year}" / "part-0.parquet"
                rows = create_partition(con, price_file, partition, str(start), str(end))
                manifest["partitions"].append({"year": year, "price_url": source_url("prices_adjusted", year), "actions_url": source_url("actions", year), "price_sha256": sha256_file(price_file), "actions_sha256": sha256_file(action_file), "adjusted_rows": rows, "curated_path": str(partition.relative_to(output))})
        manifest["upstox_mapping"] = create_instrument_mapping(con, output)
        metadata_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        create_catalog(con, output, metadata_path)
        bounds = con.execute("SELECT min(trade_date), max(trade_date), count(*), count(DISTINCT symbol) FROM adjusted_ohlcv").fetchone()
        print(json.dumps({"catalog": str(catalog_path), "parquet_root": str(output / "curated_adjusted_ohlcv"), "min_trade_date": str(bounds[0]), "max_trade_date": str(bounds[1]), "rows": bounds[2], "symbols": bounds[3]}, indent=2))
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
