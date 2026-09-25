import duckdb
import pandas as pd
import requests
import datetime as dt
import time
import os
import sqlite3
from pathlib import Path
import json
import csv
import io

ROOT = Path("c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release").resolve()
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
OUT = STORE / "kite_adjusted_backfill"
MANIFEST_PATH = OUT / "manifest.json"

def token() -> str:
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]: raise RuntimeError("Kite access token unavailable")
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
    time.sleep(0.38)
    return response

def main():
    load_local_env()
    session = requests.Session()
    session.headers.update({"X-Kite-Version": "3", "Authorization": f"token {os.environ.get('KITE_API_KEY', '')}:{token()}"})
    
    instruments = list(csv.DictReader(io.StringIO(kite_get(session, "https://api.kite.trade/instruments/NSE").text)))
    by_symbol = {x["tradingsymbol"].strip().upper(): x for x in instruments if x.get("instrument_type") == "EQ"}
    
    manifest = json.loads(MANIFEST_PATH.read_text()) if MANIFEST_PATH.exists() else {}
    symbols_dict = manifest.get("symbols", {})
    
    updated_count = 0
    TARGET_DATE = dt.date(2026, 9, 22)
    
    # We will only update symbols that are COMPLETE but max_trade_date < '2026-09-22'
    for symbol, record in symbols_dict.items():
        if record.get("status") == "COMPLETE":
            max_date_str = record.get("max_trade_date", "")
            if not max_date_str: continue
            
            # If they already have data for target date or later, skip
            if max_date_str >= "2026-09-22":
                continue
                
            # Need to update
            from_date = dt.datetime.strptime(max_date_str, "%Y-%m-%d").date() + dt.timedelta(days=1)
            to_date = dt.date.today()
            if from_date > to_date: continue
            
            instrument_token = record.get("kite_instrument_token")
            if not instrument_token: continue
            
            try:
                endpoint=f"https://api.kite.trade/instruments/historical/{instrument_token}/day"
                resp = kite_get(session, endpoint, {"from":str(from_date), "to":str(to_date)}).json()
                candles = resp.get("data",{}).get("candles",[])
                
                if not candles:
                    continue # No new data available
                
                rows = []
                for c in candles:
                    rows.append({
                        "trade_date": c[0][:10], 
                        "symbol": symbol, 
                        "isin": record.get("isin"), 
                        "upstox_key_nse": record.get("upstox_key"), 
                        "kite_instrument_token": int(instrument_token), 
                        "open_adjusted": float(c[1]), 
                        "high_adjusted": float(c[2]), 
                        "low_adjusted": float(c[3]), 
                        "close_adjusted": float(c[4]), 
                        "volume_raw": int(c[5]), 
                        "data_source": "KITE_CORPORATE_ACTION_ADJUSTED"
                    })
                    
                if not rows: continue
                
                # Load existing parquet
                file_path = OUT / "candles" / f"symbol={symbol}" / "part-0.parquet"
                if not file_path.exists(): continue
                
                df_existing = pd.read_parquet(file_path)
                df_new = pd.DataFrame(rows)
                df_combined = pd.concat([df_existing, df_new]).drop_duplicates(["symbol","trade_date"]).sort_values("trade_date")
                
                temporary_path = file_path.with_suffix(".parquet.partial")
                df_combined.to_parquet(temporary_path, index=False, compression="zstd")
                temporary_path.replace(file_path)
                
                # Update manifest
                new_max = df_combined.trade_date.max()
                record["max_trade_date"] = new_max
                record["rows"] = len(df_combined)
                
                updated_count += 1
                if updated_count % 100 == 0:
                    print(f"Updated {updated_count} symbols...", flush=True)
                    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
                    
            except Exception as e:
                print(f"Error updating {symbol}: {e}")
                
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Done. Updated {updated_count} symbols.")

if __name__ == '__main__': main()
