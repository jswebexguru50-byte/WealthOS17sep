#!/usr/bin/env python3
"""Incremental Kite OHLCV updater — fetches only the last N days and merges into existing parquet."""
from __future__ import annotations
import csv, datetime as dt, io, json, os, sqlite3, sys, time, warnings
from pathlib import Path
import requests

warnings.filterwarnings("ignore")

ROOT   = Path(__file__).resolve().parents[2]
STORE  = ROOT / "data" / "market_data" / "tejhq_hf_10y"
OUT    = STORE / "kite_adjusted_backfill"
DAYS_BACK = int(os.environ.get("DAYS_BACK", "10"))
END    = dt.date.today()
START  = END - dt.timedelta(days=DAYS_BACK)
DELAY  = 0.38


def token() -> str:
    supplied = os.environ.get("KITE_ACCESS_TOKEN")
    if supplied:
        return supplied
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]:
        raise RuntimeError("Kite access token unavailable")
    return row[0]


def load_env() -> None:
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def kite_get(session, url, params=None):
    r = session.get(url, params=params, timeout=60, verify=False)
    if r.status_code == 429:
        time.sleep(3)
        r = session.get(url, params=params, timeout=60, verify=False)
    r.raise_for_status()
    time.sleep(DELAY)
    return r


def main() -> None:
    load_env()
    api_key = os.environ.get("KITE_API_KEY", "")
    if not api_key:
        raise RuntimeError("KITE_API_KEY missing")

    session = requests.Session()
    session.headers.update({"X-Kite-Version": "3", "Authorization": f"token {api_key}:{token()}"})

    print(f"Fetching {START} → {END} ({DAYS_BACK} days back)")

    instruments = list(csv.DictReader(io.StringIO(kite_get(session, "https://api.kite.trade/instruments/NSE").text)))
    by_symbol = {x["tradingsymbol"].strip().upper(): x for x in instruments if x.get("instrument_type") == "EQ"}
    print(f"Loaded {len(by_symbol)} Kite NSE instruments")

    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        active = db.execute("""SELECT DISTINCT symbol, isin, upstox_key_nse FROM MasterTickers
          WHERE exchange='NSE' AND segment='EQ' AND status='ACTIVE' AND upstox_key_nse IS NOT NULL
          ORDER BY symbol""").fetchall()
    print(f"Processing {len(active)} active symbols")

    import pandas as pd

    updated = skipped = errors = 0
    for i, (symbol, isin, upstox_key) in enumerate(active):
        file_path = OUT / "candles" / f"symbol={symbol}" / "part-0.parquet"
        candidates = [symbol] + [f"{symbol}-{s}" for s in ("SM", "ST", "SZ", "BE", "BZ")]
        instrument = next((by_symbol[c] for c in candidates if c in by_symbol), None)
        if not instrument:
            skipped += 1
            continue
        try:
            endpoint = f"https://api.kite.trade/instruments/historical/{instrument['instrument_token']}/day"
            candles = kite_get(session, endpoint, {"from": str(START), "to": str(END)}).json().get("data", {}).get("candles", [])
            if not candles:
                skipped += 1
                continue
            new_rows = [{
                "trade_date": c[0][:10], "symbol": symbol, "isin": isin,
                "upstox_key_nse": upstox_key, "kite_instrument_token": int(instrument["instrument_token"]),
                "open_adjusted": float(c[1]), "high_adjusted": float(c[2]),
                "low_adjusted": float(c[3]), "close_adjusted": float(c[4]),
                "volume_raw": int(c[5]), "data_source": "KITE_CORPORATE_ACTION_ADJUSTED"
            } for c in candles]
            new_df = pd.DataFrame(new_rows)
            if file_path.exists():
                old_df = pd.read_parquet(file_path)
                # Remove old rows for dates we're replacing, append new
                old_df = old_df[old_df["trade_date"] < str(START)]
                merged = pd.concat([old_df, new_df]).drop_duplicates(["symbol", "trade_date"]).sort_values("trade_date")
            else:
                file_path.parent.mkdir(parents=True, exist_ok=True)
                merged = new_df
            tmp = file_path.with_suffix(".parquet.partial")
            merged.to_parquet(tmp, index=False, compression="zstd")
            tmp.replace(file_path)
            updated += 1
            if updated % 50 == 0:
                print(f"  [{i+1}/{len(active)}] {updated} updated, {skipped} skipped, {errors} errors")
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  ERROR {symbol}: {e}")

    print(f"\nDone: {updated} updated, {skipped} skipped, {errors} errors")
    print(f"Date range fetched: {START} → {END}")

    # Update DuckDB view to reflect new data
    try:
        import duckdb
        catalog = STORE / "ohlcv.duckdb"
        con = duckdb.connect(str(catalog))
        glob = (OUT / "candles" / "symbol=*" / "*.parquet").as_posix().replace("'", "''")
        con.execute(f"CREATE OR REPLACE VIEW kite_adjusted_ohlcv AS SELECT * FROM read_parquet('{glob}', union_by_name=true)")
        r = con.execute("SELECT count(*), min(trade_date), max(trade_date) FROM kite_adjusted_ohlcv").fetchone()
        print(f"DuckDB kite_adjusted_ohlcv: {r[0]:,} rows, {r[1]} → {r[2]}")
        con.close()
    except Exception as e:
        print(f"DuckDB update warning: {e}")


if __name__ == "__main__":
    main()
