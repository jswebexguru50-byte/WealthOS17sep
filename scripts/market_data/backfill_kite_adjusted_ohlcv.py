#!/usr/bin/env python3
"""Resumable Kite Connect adjusted-daily OHLCV backfill for TejHQ coverage gaps.

Kite supplies its historical candle series adjusted for corporate actions. This
script never changes portfolio.db's candle tables: it writes symbol-partitioned
Parquet and registers a DuckDB view over them.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

import duckdb
import requests

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
CATALOG = STORE / "ohlcv.duckdb"
OUT = STORE / "kite_adjusted_backfill"
START = dt.date(2016, 9, 22)
END = dt.date.today()
REQUEST_DELAY_SECONDS = 0.38


def token() -> str:
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]: raise RuntimeError("Kite access token unavailable; complete daily Kite login first.")
    return row[0]


def load_local_env() -> None:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def kite_get(session: requests.Session, url: str, params: dict | None = None) -> requests.Response:
    response = session.get(url, params=params, timeout=60, verify=False)
    if response.status_code == 429:
        time.sleep(3)
        return session.get(url, params=params, timeout=60, verify=False)
    response.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return response


def chunks_newest_first(start: dt.date, end: dt.date):
    cursor = end
    while cursor >= start:
        older = max(start, cursor - dt.timedelta(days=1800))
        yield older, cursor
        cursor = older - dt.timedelta(days=1)


def main() -> None:
    load_local_env()
    OUT.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"X-Kite-Version": "3", "Authorization": f"token {os.environ.get('KITE_API_KEY', '')}:{token()}"})
    if not os.environ.get('KITE_API_KEY'): raise RuntimeError("KITE_API_KEY missing from environment.")
    instruments = list(csv.DictReader(io.StringIO(kite_get(session, "https://api.kite.trade/instruments/NSE").text)))
    by_symbol = {x["tradingsymbol"].strip().upper(): x for x in instruments if x.get("instrument_type") == "EQ"}
    con = duckdb.connect(str(CATALOG))
    try:
        with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
            active = db.execute("""SELECT DISTINCT symbol, isin, upstox_key_nse FROM MasterTickers
              WHERE exchange='NSE' AND segment='EQ' AND status='ACTIVE' AND upstox_key_nse IS NOT NULL ORDER BY symbol""").fetchall()
        # Full active Upstox-addressable NSE universe.  Kite's current instrument
        # master appends a series suffix for many SME securities, e.g. PERFECT-SZ.
        gaps = active
        manifest_path = OUT / "manifest.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"source":"KITE_CONNECT", "adjustment":"KITE_CORPORATE_ACTION_ADJUSTED", "requested_start":str(START), "requested_end":str(END), "symbols":{}}
        reconciliation = []
        for symbol, isin, upstox_key in sorted(gaps, reverse=True):
            record = manifest["symbols"].get(symbol, {})
            file_path = OUT / "candles" / f"symbol={symbol}" / "part-0.parquet"
            if record.get("status") == "COMPLETE" and file_path.exists(): continue
            candidates = [symbol, *(f"{symbol}-{suffix}" for suffix in ("SM", "ST", "SZ", "BE", "BZ"))]
            matches = [by_symbol[x] for x in candidates if x in by_symbol]
            instrument = matches[0] if len(matches) == 1 else by_symbol.get(symbol)
            if not instrument:
                manifest["symbols"][symbol] = {"status":"NO_CURRENT_KITE_INSTRUMENT", "isin":isin, "upstox_key":upstox_key}
                manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8"); continue
            rows=[]
            try:
                for from_date, to_date in chunks_newest_first(START, END):
                    endpoint=f"https://api.kite.trade/instruments/historical/{instrument['instrument_token']}/day"
                    candles=kite_get(session, endpoint, {"from":str(from_date), "to":str(to_date)}).json().get("data",{}).get("candles",[])
                    for c in candles:
                        rows.append({"trade_date":c[0][:10], "symbol":symbol, "isin":isin, "upstox_key_nse":upstox_key, "kite_instrument_token":int(instrument['instrument_token']), "open_adjusted":float(c[1]), "high_adjusted":float(c[2]), "low_adjusted":float(c[3]), "close_adjusted":float(c[4]), "volume_raw":int(c[5]), "data_source":"KITE_CORPORATE_ACTION_ADJUSTED"})
                if not rows:
                    raise RuntimeError("Kite returned no daily candles")
                con.execute("CREATE OR REPLACE TEMP TABLE kite_rows AS SELECT * FROM rows") if False else None
                import pandas as pd
                df=pd.DataFrame(rows).drop_duplicates(["symbol","trade_date"]).sort_values("trade_date")
                file_path.parent.mkdir(parents=True, exist_ok=True)
                # A completed candle set becomes visible atomically.  A power
                # loss/interruption can therefore only leave a temporary file;
                # it can never make a partial symbol look complete in manifest.
                temporary_path = file_path.with_suffix(".parquet.partial")
                df.to_parquet(temporary_path, index=False, compression="zstd")
                temporary_path.replace(file_path)
                offline = con.execute("SELECT count(*), min(trade_date), max(trade_date) FROM adjusted_ohlcv WHERE symbol=?", [symbol]).fetchone()
                reconciliation.append({"symbol": symbol, "kite_rows":len(df), "kite_min":df.trade_date.min(), "kite_max":df.trade_date.max(), "tejhq_rows":offline[0], "tejhq_min":str(offline[1]), "tejhq_max":str(offline[2])})
                manifest["symbols"][symbol] = {"status":"COMPLETE", "isin":isin, "upstox_key":upstox_key, "kite_instrument_token":instrument['instrument_token'], "rows":len(df), "min_trade_date":df.trade_date.min(), "max_trade_date":df.trade_date.max(), "path":str(file_path.relative_to(STORE))}
            except Exception as error:
                manifest["symbols"][symbol] = {"status":"ERROR", "isin":isin, "upstox_key":upstox_key, "error":str(error)[:500]}
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (OUT / "reconciliation.json").write_text(json.dumps(reconciliation, indent=2), encoding="utf-8")
        glob=(OUT / "candles" / "symbol=*" / "*.parquet").as_posix().replace("'", "''")
        con.execute(f"CREATE OR REPLACE VIEW kite_adjusted_ohlcv AS SELECT * FROM read_parquet('{glob}', union_by_name=true)")
        # Kite is the primary adjusted source.  TejHQ remains a gap-safe fallback
        # only for identity/date pairs Kite has not supplied yet.
        con.execute("""CREATE OR REPLACE VIEW primary_adjusted_ohlcv AS
          SELECT trade_date, symbol, isin, upstox_key_nse, open_adjusted,
                 high_adjusted, low_adjusted, close_adjusted, volume_raw,
                 data_source
            FROM kite_adjusted_ohlcv
          UNION ALL
          SELECT a.trade_date, a.symbol, a.isin, m.upstox_key_nse,
                 a.open_adjusted, a.high_adjusted, a.low_adjusted,
                 a.close_adjusted, a.volume_raw, a.data_source
            FROM adjusted_ohlcv a
            LEFT JOIN upstox_instrument_map m
              ON a.symbol=m.source_symbol AND a.isin IS NOT DISTINCT FROM m.source_isin
           WHERE NOT EXISTS (
             SELECT 1 FROM kite_adjusted_ohlcv k
              WHERE k.upstox_key_nse=m.upstox_key_nse AND k.trade_date=a.trade_date
           )""")
        con.execute("""CREATE OR REPLACE VIEW market_data_source_policy AS
          SELECT 'KITE_CORPORATE_ACTION_ADJUSTED' AS primary_source,
                 'TEJHQ_HF_OFFICIAL_BHAVCOPY_ADJUSTED' AS fallback_source,
                 'UPSTOX_LIVE_WITH_STORED_ADJUSTMENT_FACTOR' AS live_overlay""")
        summary=con.execute("SELECT count(*), count(DISTINCT symbol), min(trade_date), max(trade_date) FROM kite_adjusted_ohlcv").fetchone()
        manifest["completed_at"]=dt.datetime.now(dt.UTC).isoformat(); manifest["summary"]={"rows":summary[0],"symbols":summary[1],"min_trade_date":str(summary[2]),"max_trade_date":str(summary[3])}
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps(manifest["summary"], indent=2))
    finally: con.close()

if __name__ == '__main__': main()
