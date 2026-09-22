#!/usr/bin/env python3
"""Resumable, non-LLM Upstox staging backfill for the remaining OHLCV gaps.

Responses are persisted as Parquet/JSON and deliberately excluded from the
primary adjusted view until a corporate-action reconciliation approves them.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import sqlite3
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
TARGETS = ROOT / "reports" / "readiness" / "adjusted_ohlcv_remaining_targets.csv"
OUT = ROOT / "data" / "market_data" / "tejhq_hf_10y" / "upstox_targeted_backfill"
MANIFEST = OUT / "manifest.json"
START = "2016-09-22"
END = dt.date.today().isoformat()


def access_token() -> str:
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Access_Token'").fetchone()
    if not row or not row[0]:
        raise RuntimeError("Upstox access token is not available in AppConfig.")
    return row[0]


def get(session: requests.Session, url: str) -> requests.Response:
    response = session.get(url, timeout=45, verify=False)
    if response.status_code == 429:
        time.sleep(3); response = session.get(url, timeout=45, verify=False)
    if not response.ok:
        raise RuntimeError(f"HTTP {response.status_code}: {response.text[:800]}")
    time.sleep(0.3)
    return response


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {
        "source": "UPSTOX_V2", "adjustment_status": "RAW_PENDING_CA_RECONCILIATION", "symbols": {}}
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {access_token()}", "Accept": "application/json"})
    with TARGETS.open(encoding="utf-8") as f:
        targets = list(csv.DictReader(f))
    # The operator-friendly target CSV intentionally omits broker keys; resolve
    # them from the canonical SQLite instrument master by ISIN first.
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        keys = {(str(isin or "").upper(), str(symbol or "").upper()): key
                for isin, symbol, key in db.execute("""SELECT isin, symbol, upstox_key_nse
                  FROM MasterTickers WHERE upstox_key_nse IS NOT NULL""")}
    for target in targets:
        symbol, isin = target["symbol"], target["isin"]
        key = keys.get((isin.upper(), symbol.upper()))
        if not key:
            manifest["symbols"][symbol] = {"status": "NO_UPSTOX_MAPPING", "isin": isin}
            MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            continue
        if manifest["symbols"].get(symbol, {}).get("status") == "STAGED":
            continue
        try:
            encoded_key = requests.utils.quote(key, safe="")
            candles_url = f"https://api.upstox.com/v2/historical-candle/{encoded_key}/day/{END}/{START}"
            candles = get(session, candles_url).json().get("data", {}).get("candles", [])
            ca_url = f"https://api.upstox.com/v2/fundamentals/{requests.utils.quote(isin, safe='')}/corporate-actions"
            actions = get(session, ca_url).json()
            action_path = OUT / "corporate_actions" / f"symbol={symbol}.json"
            action_path.parent.mkdir(parents=True, exist_ok=True)
            action_path.write_text(json.dumps(actions, indent=2), encoding="utf-8")
            if not candles:
                manifest["symbols"][symbol] = {"status": "NO_UPSTOX_CANDLES", "isin": isin, "upstox_key_nse": key,
                                                 "corporate_actions_path": str(action_path.relative_to(OUT))}
            else:
                rows = [{"trade_date": str(c[0])[:10], "symbol": symbol, "isin": isin, "upstox_key_nse": key,
                         "open_raw": c[1], "high_raw": c[2], "low_raw": c[3], "close_raw": c[4], "volume_raw": c[5],
                         "data_source": "UPSTOX_RAW_PENDING_CA_RECONCILIATION"} for c in candles]
                df = pd.DataFrame(rows).drop_duplicates(["symbol", "trade_date"]).sort_values("trade_date")
                path = OUT / "candles" / f"symbol={symbol}" / "part-0.parquet"
                path.parent.mkdir(parents=True, exist_ok=True)
                temp = path.with_suffix(".parquet.partial"); df.to_parquet(temp, index=False, compression="zstd"); temp.replace(path)
                manifest["symbols"][symbol] = {"status": "STAGED", "isin": isin, "upstox_key_nse": key, "rows": len(df),
                                                 "first_trade_date": str(df.trade_date.min()), "last_trade_date": str(df.trade_date.max()),
                                                 "path": str(path.relative_to(OUT)), "corporate_actions_path": str(action_path.relative_to(OUT))}
        except Exception as error:
            manifest["symbols"][symbol] = {"status": "ERROR", "isin": isin, "upstox_key_nse": key, "error": str(error)[:500]}
        MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({k: sum(1 for r in manifest["symbols"].values() if r.get("status") == k)
                      for k in sorted({r.get("status") for r in manifest["symbols"].values()})}, indent=2))


if __name__ == "__main__":
    main()
