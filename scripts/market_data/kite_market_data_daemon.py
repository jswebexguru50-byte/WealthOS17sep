#!/usr/bin/env python3
"""Deterministic Kite market-data cycle.

This job is deliberately limited to broker market data: it refreshes the
instrument master, writes an auditable canonical mapping, captures the complete
15-minute session after market close, and then delegates daily-candle refresh to
the existing adjusted-OHLCV updater. It never calls an LLM and never writes
candles into portfolio.db.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import logging
import os
import sqlite3
import ssl
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
MASTER_ROOT = STORE / "kite_instrument_master"
INTRADAY_ROOT = STORE / "kite_15m_backfill"
CATALOG = STORE / "ohlcv.duckdb"
PROGRESS = STORE / "kite_market_data_daemon_progress.json"
LOG_PATH = ROOT / "data" / "market_data" / "kite_market_data_daemon.log"
HISTORICAL_MIN_INTERVAL_SECONDS = 0.37  # Kite historical limit is 3 requests/sec.


def configure_logging() -> logging.Logger:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8"), logging.StreamHandler()],
    )
    return logging.getLogger("kite-market-daemon")


LOG = configure_logging()


def load_local_env() -> None:
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def get_access_token() -> str:
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]:
        raise RuntimeError("Kite access token is unavailable. Complete the daily Kite login first.")
    return str(row[0])


def windows_root_ca_bundle() -> Path:
    """Materialise the operator-approved Windows Root store for requests.

    The local network uses an inspected TLS proxy. Using the Windows trust store
    keeps normal certificate verification on without an insecure verify=False
    bypass or an additional Python dependency.
    """
    if not hasattr(ssl, "enum_certificates"):
        raise RuntimeError("Python runtime cannot access the Windows certificate store")
    certificates = ssl.enum_certificates("ROOT")
    pem = "".join(
        ssl.DER_cert_to_PEM_cert(certificate)
        for certificate, encoding, _trust in certificates
        if encoding == "x509_asn"
    )
    if not pem:
        raise RuntimeError("Windows Root certificate store returned no X.509 certificates")
    path = STORE / "kite_tls_windows_root.pem"
    temporary = path.with_suffix(".partial")
    temporary.write_text(pem, encoding="ascii")
    temporary.replace(path)
    return path


class KiteSession:
    def __init__(self, api_key: str, access_token: str, ca_bundle: Path) -> None:
        self.session = requests.Session()
        self.session.headers.update({
            "X-Kite-Version": "3",
            "Authorization": f"token {api_key}:{access_token}",
        })
        self.session.verify = str(ca_bundle)
        self.lock = threading.Lock()
        self.last_historical_call = 0.0

    def get(self, url: str, *, params: dict[str, str] | None = None, historical: bool = False) -> requests.Response:
        for attempt in range(5):
            if historical:
                with self.lock:
                    wait = HISTORICAL_MIN_INTERVAL_SECONDS - (time.monotonic() - self.last_historical_call)
                    if wait > 0:
                        time.sleep(wait)
                    self.last_historical_call = time.monotonic()
            response = self.session.get(url, params=params, timeout=45)
            if response.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            if response.status_code in (500, 502, 503, 504):
                time.sleep(attempt + 1)
                continue
            response.raise_for_status()
            return response
        raise RuntimeError(f"Kite request exhausted retries: {url}")


def atomic_parquet(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".partial")
    frame.to_parquet(temporary, index=False, compression="zstd")
    temporary.replace(path)


def write_progress(payload: dict[str, Any]) -> None:
    payload["updated_at"] = dt.datetime.now(dt.UTC).isoformat()
    temporary = PROGRESS.with_suffix(".partial")
    temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temporary.replace(PROGRESS)


def active_universe() -> list[dict[str, str | None]]:
    query = """
      SELECT DISTINCT upper(symbol) AS symbol, isin, exchange, upstox_key_nse, upstox_key_bse
      FROM MasterTickers
      WHERE status='ACTIVE' AND exchange IN ('NSE', 'BSE')
      ORDER BY exchange, symbol
    """
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        fields = [column[0] for column in db.execute(query).description]
        return [dict(zip(fields, row)) for row in db.execute(query).fetchall()]


def download_instrument_master(session: KiteSession, trade_date: dt.date) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    masters: dict[str, list[dict[str, str]]] = {}
    for exchange in ("NSE", "BSE"):
        response = session.get(f"https://api.kite.trade/instruments/{exchange}")
        rows = list(csv.DictReader(io.StringIO(response.text)))
        masters[exchange] = [row for row in rows if row.get("instrument_type") == "EQ"]
        atomic_parquet(pd.DataFrame(rows), MASTER_ROOT / f"as_of_date={trade_date}" / f"exchange={exchange}" / "instruments.parquet")
    return masters["NSE"], masters["BSE"]


def resolve_mapping(universe: list[dict[str, str | None]], nse_rows: list[dict[str, str]], bse_rows: list[dict[str, str]], trade_date: dt.date) -> list[dict[str, Any]]:
    nse_by_symbol = {str(row.get("tradingsymbol", "")).upper(): row for row in nse_rows}
    bse_by_symbol = {str(row.get("tradingsymbol", "")).upper(): row for row in bse_rows}
    bse_by_exchange_token = {str(row.get("exchange_token", "")): row for row in bse_rows}
    mappings: list[dict[str, Any]] = []
    for item in universe:
        symbol, exchange = str(item["symbol"]), str(item["exchange"])
        candidates: list[dict[str, str]] = []
        if exchange == "NSE":
            for name in (symbol, *(f"{symbol}-{suffix}" for suffix in ("SM", "ST", "SZ", "BE", "BZ"))):
                if name in nse_by_symbol:
                    candidates.append(nse_by_symbol[name])
        else:
            candidate = bse_by_exchange_token.get(symbol) or bse_by_symbol.get(symbol)
            if candidate:
                candidates.append(candidate)
        record: dict[str, Any] = {
            "as_of_date": str(trade_date), "symbol": symbol, "isin": item["isin"], "exchange": exchange,
            "upstox_key_nse": item["upstox_key_nse"], "upstox_key_bse": item["upstox_key_bse"],
            "kite_instrument_token": None, "kite_tradingsymbol": None, "mapping_status": "NO_KITE_INSTRUMENT",
            "mapping_source": "KITE_DAILY_INSTRUMENT_MASTER",
        }
        if len(candidates) == 1:
            record.update({
                "kite_instrument_token": int(candidates[0]["instrument_token"]),
                "kite_tradingsymbol": candidates[0]["tradingsymbol"],
                "mapping_status": "VERIFIED_CURRENT_INSTRUMENT",
            })
        elif len(candidates) > 1:
            record["mapping_status"] = "IDENTITY_REVIEW_MULTIPLE_KITE_INSTRUMENTS"
        mappings.append(record)
    atomic_parquet(pd.DataFrame(mappings), MASTER_ROOT / f"as_of_date={trade_date}" / "canonical_mapping.parquet")
    return mappings


def capture_intraday(session: KiteSession, mappings: list[dict[str, Any]], trade_date: dt.date, progress: dict[str, Any]) -> None:
    eligible = [row for row in mappings if row["mapping_status"] == "VERIFIED_CURRENT_INSTRUMENT"]
    progress["intraday"] = {"requested": len(eligible), "completed": 0, "empty": 0, "failed": 0, "last_symbol": None}
    write_progress(progress)
    start = f"{trade_date} 09:15:00"
    end = f"{trade_date} 15:30:00"
    for index, item in enumerate(eligible, start=1):
        symbol = str(item["symbol"])
        try:
            response = session.get(
                f"https://api.kite.trade/instruments/historical/{item['kite_instrument_token']}/15minute",
                params={"from": start, "to": end}, historical=True,
            )
            candles = response.json().get("data", {}).get("candles", [])
            if not candles:
                progress["intraday"]["empty"] += 1
            else:
                rows = pd.DataFrame([{
                    "timestamp": candle[0], "trade_date": candle[0][:10], "symbol": symbol,
                    "isin": item["isin"], "exchange": item["exchange"],
                    "kite_instrument_token": item["kite_instrument_token"],
                    "open": float(candle[1]), "high": float(candle[2]), "low": float(candle[3]),
                    "close": float(candle[4]), "volume": int(candle[5]),
                    "data_source": "KITE_HISTORICAL_15MINUTE", "retrieved_at": dt.datetime.now(dt.UTC).isoformat(),
                } for candle in candles])
                path = INTRADAY_ROOT / f"exchange={item['exchange']}" / f"symbol={symbol}" / f"trade_date={trade_date}" / "part-0.parquet"
                if path.exists():
                    rows = pd.concat([pd.read_parquet(path), rows]).drop_duplicates(["symbol", "timestamp"]).sort_values("timestamp")
                atomic_parquet(rows, path)
                progress["intraday"]["completed"] += 1
        except Exception as exc:
            progress["intraday"]["failed"] += 1
            LOG.warning("intraday capture failed for %s: %s", symbol, exc)
        progress["intraday"]["last_symbol"] = symbol
        if index % 25 == 0 or index == len(eligible):
            write_progress(progress)


def publish_intraday_view() -> None:
    glob = (INTRADAY_ROOT / "exchange=*" / "symbol=*" / "trade_date=*" / "*.parquet").as_posix().replace("'", "''")
    if not list(INTRADAY_ROOT.glob("exchange=*/symbol=*/trade_date=*/*.parquet")):
        return
    with duckdb.connect(str(CATALOG)) as catalog:
        catalog.execute(f"CREATE OR REPLACE VIEW kite_15m_ohlcv AS SELECT * FROM read_parquet('{glob}', union_by_name=true)")
        catalog.execute("""CREATE OR REPLACE VIEW intraday_ohlcv_source_policy AS
            SELECT 'KITE_HISTORICAL_15MINUTE' AS primary_source,
                   'EOD_CAPTURE_AFTER_MARKET_CLOSE' AS capture_mode,
                   'INTRADAY_BARS_ARE_NOT_CORPORATE_ACTION_EVENT_RECORDS' AS limitation""")


def refresh_daily(trade_date: dt.date) -> None:
    command = [sys.executable, str(ROOT / "scripts" / "market_data" / "update_ohlcv_duckdb_today.py"), "--target-date", str(trade_date)]
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    LOG.info("daily refresh exit=%s", completed.returncode)
    if completed.returncode:
        LOG.error("daily refresh stderr: %s", completed.stderr[-4000:])
        raise RuntimeError("daily adjusted-OHLCV refresh failed")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run deterministic Kite market-data ingestion.")
    parser.add_argument("--mode", choices=("instruments", "intraday", "daily", "all"), default="all")
    parser.add_argument("--trade-date", type=dt.date.fromisoformat, default=dt.date.today())
    args = parser.parse_args()
    if args.trade_date.weekday() >= 5:
        LOG.info("%s is not an NSE/BSE trading weekday; no fetch performed", args.trade_date)
        return
    load_local_env()
    api_key = os.environ.get("KITE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("KITE_API_KEY is not configured")
    progress: dict[str, Any] = {"status": "RUNNING", "mode": args.mode, "trade_date": str(args.trade_date), "llm_calls": 0}
    write_progress(progress)
    try:
        session = KiteSession(api_key, get_access_token(), windows_root_ca_bundle())
        session.get("https://api.kite.trade/user/profile")
        nse_rows, bse_rows = download_instrument_master(session, args.trade_date)
        mappings = resolve_mapping(active_universe(), nse_rows, bse_rows, args.trade_date)
        progress["instrument_mapping"] = {
            "requested": len(mappings),
            "verified": sum(row["mapping_status"] == "VERIFIED_CURRENT_INSTRUMENT" for row in mappings),
            "identity_review": sum(row["mapping_status"] != "VERIFIED_CURRENT_INSTRUMENT" for row in mappings),
        }
        write_progress(progress)
        if args.mode in ("intraday", "all"):
            capture_intraday(session, mappings, args.trade_date, progress)
            publish_intraday_view()
        if args.mode in ("daily", "all"):
            refresh_daily(args.trade_date)
        progress["status"] = "COMPLETE"
    except Exception as exc:
        progress["status"] = "FAILED"
        progress["error"] = str(exc)
        LOG.exception("Kite market-data cycle failed")
        raise
    finally:
        write_progress(progress)


if __name__ == "__main__":
    main()
