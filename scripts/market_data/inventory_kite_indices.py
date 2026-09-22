#!/usr/bin/env python3
"""Write Kite's currently available NSE index instruments to the local audit catalog."""
from __future__ import annotations

import csv
import io
import json
import os
import sqlite3
import ssl
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports' / 'readiness' / 'kite_index_instrument_inventory.csv'


def load_env() -> None:
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip())


def access_token() -> str:
    with sqlite3.connect(f'file:{ROOT / "portfolio.db"}?mode=ro', uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]:
        raise RuntimeError('Kite access token unavailable; complete the daily Kite login first.')
    return row[0]


def main() -> None:
    load_env()
    headers = {
        'X-Kite-Version': '3',
        'Authorization': f"token {os.environ.get('KITE_API_KEY', '')}:{access_token()}",
    }
    request = urllib.request.Request('https://api.kite.trade/instruments', headers=headers)
    with urllib.request.urlopen(request, timeout=60, context=ssl._create_unverified_context()) as response:
        rows = list(csv.DictReader(io.StringIO(response.read().decode('utf-8'))))
    indices = [row for row in rows if row.get('segment', '').upper().endswith('INDICES')]
    indices.sort(key=lambda row: (row.get('exchange', ''), row.get('name', ''), row.get('tradingsymbol', '')))
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=['exchange', 'segment', 'tradingsymbol', 'name', 'instrument_token', 'exchange_token', 'tick_size'])
        writer.writeheader()
        writer.writerows({key: row.get(key, '') for key in writer.fieldnames} for row in indices)
    print(json.dumps({'index_instruments': len(indices), 'report': str(REPORT.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
