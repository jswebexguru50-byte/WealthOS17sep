#!/usr/bin/env python3
"""Validate and publish Kite index Parquet partitions in the local DuckDB catalog."""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.tools' / 'hf_ohlcv_env'))
import duckdb

STORE = ROOT / 'data' / 'market_data' / 'tejhq_hf_10y'
PARTITIONS = STORE / 'kite_index_backfill' / 'candles'
CATALOG = STORE / 'ohlcv.duckdb'
MANIFEST = STORE / 'kite_index_backfill' / 'manifest.json'
REPORT = ROOT / 'reports' / 'readiness' / 'kite_index_ohlcv_coverage.json'


def main() -> None:
    files = sorted(PARTITIONS.glob('index=*/part-0.parquet'))
    if not files:
        raise SystemExit('No index Parquet partitions available.')
    source_glob = (PARTITIONS / 'index=*' / 'part-0.parquet').as_posix().replace("'", "''")
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    statuses: dict[str, int] = {}
    for record in manifest['indices'].values():
        status = record.get('status', 'UNKNOWN')
        statuses[status] = statuses.get(status, 0) + 1
    connection = duckdb.connect(str(CATALOG))
    try:
        connection.execute(f"CREATE OR REPLACE VIEW kite_index_ohlcv AS SELECT * FROM read_parquet('{source_glob}', union_by_name=true)")
        connection.execute("""CREATE OR REPLACE VIEW index_ohlcv AS
            SELECT * FROM kite_index_ohlcv
             WHERE trade_date IS NOT NULL AND open > 0 AND high > 0 AND low > 0 AND close > 0
               AND high >= low AND high >= open AND high >= close AND low <= open AND low <= close""")
        rows, symbols, first_date, last_date = connection.execute(
            'SELECT count(*), count(DISTINCT symbol), min(trade_date), max(trade_date) FROM index_ohlcv'
        ).fetchone()
    finally:
        connection.close()
    payload = {
        'generated_at': dt.datetime.now(dt.UTC).isoformat(),
        'status': 'READY',
        'catalog': str(CATALOG.relative_to(ROOT)),
        'view': 'index_ohlcv',
        'source': 'KITE_PUBLISHED_INDEX_LEVEL',
        'note': 'Index levels are not corporate-action-adjusted securities.',
        'validated_partitions': len(files), 'rows': rows, 'indices': symbols,
        'first_trade_date': str(first_date), 'last_trade_date': str(last_date),
        'kite_inventory_statuses': statuses,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(json.dumps(payload, indent=2))


if __name__ == '__main__':
    main()
