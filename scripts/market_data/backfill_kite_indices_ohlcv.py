#!/usr/bin/env python3
"""Resumable, zero-LLM ten-year Kite daily OHLCV import for NSE/BSE indices."""
from __future__ import annotations

import datetime as dt
import json
import os
import sqlite3
import sys
import time
import re
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.tools' / 'hf_ohlcv_env'))
import duckdb
STORE = ROOT / 'data' / 'market_data' / 'tejhq_hf_10y'
INVENTORY = ROOT / 'reports' / 'readiness' / 'kite_index_instrument_inventory.csv'
OUT = STORE / 'kite_index_backfill'
START = dt.date.today() - dt.timedelta(days=3652)
END = dt.date.today()


def load_env() -> None:
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip())


def access_token() -> str:
    with sqlite3.connect(f'file:{ROOT / "portfolio.db"}?mode=ro', uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]:
        raise RuntimeError('Kite access token unavailable; complete daily Kite login first.')
    return row[0]


def chunks():
    cursor = END
    while cursor >= START:
        older = max(START, cursor - dt.timedelta(days=1800))
        yield older, cursor
        cursor = older - dt.timedelta(days=1)


def safe_name(exchange: str, symbol: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '_', f'{exchange}__{symbol}')


def main() -> None:
    load_env()
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {
        'source': 'KITE_CONNECT',
        'dataset': 'KITE_INDEX_DAILY_OHLCV',
        'note': 'Indices are not corporate-action adjusted securities; values are Kite published index levels.',
        'indices': {},
    }
    session = requests.Session()
    session.headers.update({'X-Kite-Version': '3', 'Authorization': f"token {os.environ.get('KITE_API_KEY', '')}:{access_token()}"})
    indices = pd.read_csv(INVENTORY, dtype=str).fillna('')
    indices = indices[indices.exchange.isin(['NSE', 'BSE'])].sort_values(['exchange', 'tradingsymbol'])
    for item in indices.itertuples(index=False):
        identity = f'{item.exchange}:{item.tradingsymbol}'
        output = OUT / 'candles' / f'index={safe_name(item.exchange, item.tradingsymbol)}' / 'part-0.parquet'
        existing = manifest['indices'].get(identity, {})
        if existing.get('status') == 'COMPLETE' and output.exists():
            continue
        try:
            rows = []
            for begin, end in chunks():
                response = session.get(
                    f'https://api.kite.trade/instruments/historical/{item.instrument_token}/day',
                    params={'from': str(begin), 'to': str(end)}, timeout=60, verify=False,
                )
                response.raise_for_status()
                time.sleep(0.40)
                for candle in response.json().get('data', {}).get('candles', []):
                    rows.append({
                        'trade_date': candle[0][:10], 'symbol': identity, 'index_name': item.name,
                        'exchange': item.exchange, 'kite_instrument_token': int(item.instrument_token),
                        'open': float(candle[1]), 'high': float(candle[2]), 'low': float(candle[3]),
                        'close': float(candle[4]), 'volume': int(candle[5]),
                        'data_source': 'KITE_PUBLISHED_INDEX_LEVEL',
                    })
            if not rows:
                manifest['indices'][identity] = {
                    'status': 'NO_KITE_HISTORICAL_CANDLES', 'name': item.name,
                    'kite_instrument_token': item.instrument_token,
                }
                continue
            frame = pd.DataFrame(rows).drop_duplicates(['symbol', 'trade_date']).sort_values('trade_date')
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix('.parquet.partial')
            # DuckDB is bundled with the project, unlike pyarrow in the Kite
            # client runtime. It produces a standards-compliant ZSTD Parquet
            # partition without adding a cloud dependency or an LLM step.
            connection = duckdb.connect()
            try:
                connection.register('index_candles', frame)
                destination = temporary.as_posix().replace("'", "''")
                connection.execute(f"COPY index_candles TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD)")
            finally:
                connection.close()
            temporary.replace(output)
            manifest['indices'][identity] = {
                'status': 'COMPLETE', 'name': item.name, 'kite_instrument_token': item.instrument_token,
                'rows': len(frame), 'first_trade_date': frame.trade_date.min(), 'last_trade_date': frame.trade_date.max(),
                'path': str(output.relative_to(STORE)),
            }
        except Exception as exc:
            manifest['indices'][identity] = {'status': 'ERROR', 'name': item.name, 'error': str(exc)[:500]}
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({status: sum(record.get('status') == status for record in manifest['indices'].values()) for status in sorted({record.get('status') for record in manifest['indices'].values()})}, indent=2))


if __name__ == '__main__':
    main()
