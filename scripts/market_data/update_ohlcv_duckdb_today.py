#!/usr/bin/env python3
"""Incremental updater for Kite OHLCV Parquet and DuckDB catalog.

Updates all stocks in kite_adjusted_backfill and indices in kite_index_backfill
up to today's date (2026-09-24). Rebuilds DuckDB views and validates coverage.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sqlite3
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests
import duckdb

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
KITE_STOCKS = STORE / "kite_adjusted_backfill"
KITE_INDICES = STORE / "kite_index_backfill"
CATALOG = STORE / "ohlcv.duckdb"

TARGET_DATE = dt.date(2026, 9, 24)
TARGET_DATE_STR = str(TARGET_DATE)

def get_token() -> str:
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]:
        raise RuntimeError("Kite access token unavailable in portfolio.db")
    return row[0]

def load_local_env() -> None:
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

class RateLimitedKiteSession:
    def __init__(self, api_key: str, access_token: str, min_interval: float = 0.22):
        self.session = requests.Session()
        self.session.headers.update({
            "X-Kite-Version": "3",
            "Authorization": f"token {api_key}:{access_token}"
        })
        self.min_interval = min_interval
        self.lock = threading.Lock()
        self.last_call = 0.0

    def get(self, url: str, params: dict | None = None, max_retries: int = 4) -> dict | None:
        for attempt in range(max_retries):
            with self.lock:
                now = time.time()
                elapsed = now - self.last_call
                wait = self.min_interval - elapsed
                if wait > 0:
                    time.sleep(wait)
                self.last_call = time.time()

            try:
                resp = self.session.get(url, params=params, timeout=20)
                if resp.status_code == 429:
                    backoff = 2.0 * (attempt + 1)
                    print(f"  [429 Rate Limit] Backing off {backoff:.1f}s (attempt {attempt+1}/{max_retries})...")
                    time.sleep(backoff)
                    continue
                if resp.status_code in (500, 502, 503, 504):
                    time.sleep(1.0 * (attempt + 1))
                    continue
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
                time.sleep(1.0 * (attempt + 1))
        return None

def update_stocks(kite_session: RateLimitedKiteSession) -> tuple[int, int, list[str]]:
    manifest_path = KITE_STOCKS / "manifest.json"
    if not manifest_path.exists():
        print("Stock manifest not found!")
        return 0, 0, []
    
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    symbols_dict = manifest.get("symbols", {})

    items_to_update = []
    for symbol, record in symbols_dict.items():
        if record.get("status") == "COMPLETE":
            max_d = record.get("max_trade_date", "")
            if max_d and max_d < TARGET_DATE_STR:
                token = record.get("kite_instrument_token")
                if token:
                    items_to_update.append((symbol, record, max_d, token))

    total = len(items_to_update)
    print(f"\n[Stocks] Found {total} symbols requiring incremental update up to {TARGET_DATE_STR}...")
    if total == 0:
        return 0, 0, []

    updated_count = 0
    skipped_count = 0
    errors = []
    manifest_lock = threading.Lock()
    processed_count = 0

    def process_symbol(item):
        nonlocal updated_count, skipped_count, processed_count
        symbol, record, max_d, token = item
        file_path = KITE_STOCKS / "candles" / f"symbol={symbol}" / "part-0.parquet"
        if not file_path.exists():
            with manifest_lock:
                errors.append(f"{symbol}: parquet file missing")
            return

        from_date = dt.datetime.strptime(max_d, "%Y-%m-%d").date() + dt.timedelta(days=1)
        if from_date > TARGET_DATE:
            return

        endpoint = f"https://api.kite.trade/instruments/historical/{token}/day"
        try:
            res = kite_session.get(endpoint, {"from": str(from_date), "to": TARGET_DATE_STR})
            candles = res.get("data", {}).get("candles", []) if res else []
            if not candles:
                with manifest_lock:
                    skipped_count += 1
                    processed_count += 1
                return

            rows = []
            for c in candles:
                rows.append({
                    "trade_date": c[0][:10],
                    "symbol": symbol,
                    "isin": record.get("isin"),
                    "upstox_key_nse": record.get("upstox_key"),
                    "kite_instrument_token": int(token),
                    "open_adjusted": float(c[1]),
                    "high_adjusted": float(c[2]),
                    "low_adjusted": float(c[3]),
                    "close_adjusted": float(c[4]),
                    "volume_raw": int(c[5]),
                    "data_source": "KITE_CORPORATE_ACTION_ADJUSTED"
                })

            df_existing = pd.read_parquet(file_path)
            df_new = pd.DataFrame(rows)
            df_combined = pd.concat([df_existing, df_new]).drop_duplicates(["symbol", "trade_date"]).sort_values("trade_date")

            tmp = file_path.with_suffix(".parquet.partial")
            df_combined.to_parquet(tmp, index=False, compression="zstd")
            tmp.replace(file_path)

            new_max = df_combined.trade_date.max()
            with manifest_lock:
                record["max_trade_date"] = new_max
                record["rows"] = len(df_combined)
                updated_count += 1
                processed_count += 1
                if processed_count % 100 == 0 or processed_count == total:
                    print(f"  [Stocks: {processed_count}/{total}] Updated {updated_count} (no trades/skipped: {skipped_count}) | Latest: {symbol} -> {new_max}", flush=True)
                    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        except Exception as e:
            with manifest_lock:
                processed_count += 1
                errors.append(f"{symbol}: {e}")
                print(f"  [Error] {symbol}: {e}", flush=True)

    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(process_symbol, items_to_update))

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[Stocks] Finished: {updated_count} updated, {skipped_count} had no trades today, {len(errors)} errors.")
    return updated_count, skipped_count, errors

def update_indices(kite_session: RateLimitedKiteSession) -> tuple[int, int, list[str]]:
    manifest_path = KITE_INDICES / "manifest.json"
    if not manifest_path.exists():
        print("Index manifest not found!")
        return 0, 0, []

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    indices_dict = manifest.get("indices", {})

    items_to_update = []
    for identity, record in indices_dict.items():
        if record.get("status") == "COMPLETE":
            last_d = record.get("last_trade_date", "")
            if last_d and last_d < TARGET_DATE_STR:
                token = record.get("kite_instrument_token")
                if token:
                    items_to_update.append((identity, record, last_d, token))

    total = len(items_to_update)
    print(f"\n[Indices] Found {total} indices requiring incremental update up to {TARGET_DATE_STR}...")
    if total == 0:
        return 0, 0, []

    updated_count = 0
    skipped_count = 0
    errors = []
    manifest_lock = threading.Lock()
    processed_count = 0

    def process_index(item):
        nonlocal updated_count, skipped_count, processed_count
        identity, record, last_d, token = item
        raw_path = record.get("path")
        if raw_path:
            file_path = STORE / raw_path
        else:
            file_path = KITE_INDICES / "candles" / f"index={identity.replace(':', '__')}" / "part-0.parquet"

        if not file_path.exists():
            with manifest_lock:
                errors.append(f"{identity}: parquet file missing at {file_path}")
            return

        from_date = dt.datetime.strptime(last_d, "%Y-%m-%d").date() + dt.timedelta(days=1)
        if from_date > TARGET_DATE:
            return

        endpoint = f"https://api.kite.trade/instruments/historical/{token}/day"
        try:
            res = kite_session.get(endpoint, {"from": str(from_date), "to": TARGET_DATE_STR})
            candles = res.get("data", {}).get("candles", []) if res else []
            if not candles:
                with manifest_lock:
                    skipped_count += 1
                    processed_count += 1
                return

            rows = []
            exchange = identity.split(":")[0]
            for c in candles:
                rows.append({
                    "trade_date": c[0][:10],
                    "symbol": identity,
                    "index_name": record.get("name", identity),
                    "exchange": exchange,
                    "kite_instrument_token": int(token),
                    "open": float(c[1]),
                    "high": float(c[2]),
                    "low": float(c[3]),
                    "close": float(c[4]),
                    "volume": int(c[5]),
                    "data_source": "KITE_PUBLISHED_INDEX_LEVEL"
                })

            df_existing = pd.read_parquet(file_path)
            # Remove partition column 'index' if accidentally present
            cols_to_keep = [c for c in df_existing.columns if c != "index"]
            df_existing = df_existing[cols_to_keep]
            df_new = pd.DataFrame(rows)
            df_combined = pd.concat([df_existing, df_new]).drop_duplicates(["symbol", "trade_date"]).sort_values("trade_date")

            tmp = file_path.with_suffix(".parquet.partial")
            df_combined.to_parquet(tmp, index=False, compression="zstd")
            tmp.replace(file_path)

            new_max = df_combined.trade_date.max()
            with manifest_lock:
                record["last_trade_date"] = new_max
                record["rows"] = len(df_combined)
                updated_count += 1
                processed_count += 1
                if processed_count % 25 == 0 or processed_count == total:
                    print(f"  [Indices: {processed_count}/{total}] Updated {updated_count} (no trades/skipped: {skipped_count}) | Latest: {identity} -> {new_max}", flush=True)
                    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        except Exception as e:
            with manifest_lock:
                processed_count += 1
                errors.append(f"{identity}: {e}")
                print(f"  [Error] {identity}: {e}", flush=True)

    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(process_index, items_to_update))

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[Indices] Finished: {updated_count} updated, {skipped_count} had no trades today, {len(errors)} errors.")
    return updated_count, skipped_count, errors

def finalize_store() -> None:
    print("\n--- Rebuilding DuckDB Views & Publishing Coverage ---")
    sys.path.insert(0, str(ROOT / "scripts" / "market_data"))

    print("Running finalize_adjusted_ohlcv_store.py...")
    import finalize_adjusted_ohlcv_store
    finalize_adjusted_ohlcv_store.main()

    print("\nRunning finalize_kite_index_ohlcv.py...")
    import finalize_kite_index_ohlcv
    finalize_kite_index_ohlcv.main()

    print("\nRunning audit_adjusted_ohlcv_coverage.py...")
    import audit_adjusted_ohlcv_coverage
    audit_adjusted_ohlcv_coverage.main()

def verify_duckdb() -> None:
    print("\n=== VERIFYING DUCKDB (ohlcv.duckdb) ===")
    con = duckdb.connect(str(CATALOG), read_only=True)
    try:
        r_stock = con.execute(f"""
            SELECT count(*), count(DISTINCT symbol), min(trade_date), max(trade_date)
            FROM app_adjusted_ohlcv
        """).fetchone()
        print(f"app_adjusted_ohlcv total: {r_stock[0]} rows, {r_stock[1]} symbols, range: {r_stock[2]} to {r_stock[3]}")

        today_stock = con.execute(f"""
            SELECT count(*), count(DISTINCT symbol)
            FROM app_adjusted_ohlcv
            WHERE trade_date = '{TARGET_DATE_STR}'
        """).fetchone()
        print(f"app_adjusted_ohlcv TODAY ({TARGET_DATE_STR}): {today_stock[0]} rows, {today_stock[1]} symbols")

        r_idx = con.execute(f"""
            SELECT count(*), count(DISTINCT symbol), min(trade_date), max(trade_date)
            FROM index_ohlcv
        """).fetchone()
        print(f"index_ohlcv total: {r_idx[0]} rows, {r_idx[1]} indices, range: {r_idx[2]} to {r_idx[3]}")

        today_idx = con.execute(f"""
            SELECT count(*), count(DISTINCT symbol)
            FROM index_ohlcv
            WHERE trade_date = '{TARGET_DATE_STR}'
        """).fetchone()
        print(f"index_ohlcv TODAY ({TARGET_DATE_STR}): {today_idx[0]} rows, {today_idx[1]} indices")

        print("\nSample Quotes for Today (2026-09-24):")
        samples = con.execute(f"""
            SELECT symbol, trade_date, open_adjusted, high_adjusted, low_adjusted, close_adjusted, volume_raw
            FROM app_adjusted_ohlcv
            WHERE trade_date = '{TARGET_DATE_STR}' AND symbol IN ('RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK')
            ORDER BY symbol
        """).df()
        print(samples.to_string(index=False))

        print("\nSample Indices for Today (2026-09-24):")
        idx_samples = con.execute(f"""
            SELECT symbol, trade_date, open, high, low, close
            FROM index_ohlcv
            WHERE trade_date = '{TARGET_DATE_STR}' AND symbol IN ('NSE:NIFTY 50', 'NSE:NIFTY BANK', 'BSE:SENSEX')
            ORDER BY symbol
        """).df()
        print(idx_samples.to_string(index=False))

    finally:
        con.close()

def main():
    load_local_env()
    api_key = os.environ.get("KITE_API_KEY", "m8wqr277nffl4sx1")
    access_token = get_token()
    print(f"Initialized Kite session with API Key: {api_key}, Target Date: {TARGET_DATE_STR}")
    
    kite_session = RateLimitedKiteSession(api_key, access_token, min_interval=0.22)
    
    # Verify profile
    profile = kite_session.get("https://api.kite.trade/user/profile")
    if not profile or profile.get("status") != "success":
        raise RuntimeError("Failed to authenticate with Kite API")
    user_name = profile.get("data", {}).get("user_name", "Unknown")
    print(f"Authenticated Kite user: {user_name}")

    t0 = time.time()
    stock_up, stock_skip, stock_err = update_stocks(kite_session)
    idx_up, idx_skip, idx_err = update_indices(kite_session)

    finalize_store()
    verify_duckdb()

    total_time = time.time() - t0
    print(f"\nAll operations completed successfully in {total_time/60:.2f} minutes!")

if __name__ == "__main__":
    main()
