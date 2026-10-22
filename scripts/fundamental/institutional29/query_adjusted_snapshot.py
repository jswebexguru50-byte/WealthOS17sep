import argparse
import json
from pathlib import Path

import duckdb


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbols', required=True, help='Comma-separated NSE symbols')
    parser.add_argument('--as-of', required=True)
    parser.add_argument('--limit', type=int, default=260)
    args = parser.parse_args()

    catalog = Path('data/market_data/tejhq_hf_10y/ohlcv.duckdb').resolve()
    if not catalog.exists():
        print(json.dumps({'ok': False, 'error': 'DUCKDB_CATALOG_MISSING', 'rows': []}))
        return

    symbols = [item.strip().upper() for item in args.symbols.split(',') if item.strip()]
    connection = duckdb.connect(str(catalog), read_only=True)
    try:
        placeholders = ','.join('?' for _ in symbols)
        rows = connection.execute(
            f'''
            SELECT trade_date, symbol, isin, upstox_key_nse,
                   open_adjusted, high_adjusted, low_adjusted, close_adjusted,
                   volume_raw, data_source
            FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY UPPER(symbol) ORDER BY trade_date DESC) AS rn
                FROM app_adjusted_ohlcv
                WHERE UPPER(symbol) IN ({placeholders}) AND trade_date <= ?
            )
            WHERE rn <= ?
            ORDER BY symbol, trade_date ASC
            ''',
            [*symbols, args.as_of, args.limit],
        ).fetchdf().to_dict(orient='records')
        print(json.dumps({'ok': True, 'rows': rows}, default=str))
    finally:
        connection.close()


if __name__ == '__main__':
    main()
