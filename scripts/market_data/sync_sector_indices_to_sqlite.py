#!/usr/bin/env python3
"""Sync sector index OHLCV from Parquet partitions into SQLite IndexOHLCV table."""
import json
import sqlite3
import time
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / 'data' / 'market_data' / 'tejhq_hf_10y'
PARTITIONS = STORE / 'kite_index_backfill' / 'candles'
DB_PATH = ROOT / 'portfolio.db'

INDEX_MAP = {
    'NIFTY BANK': 'NSE__NIFTY BANK',
    'NIFTY FIN SERVICE': 'NSE__NIFTY FIN SERVICE',
    'NIFTY IT': 'NSE__NIFTY IT',
    'NIFTY AUTO': 'NSE__NIFTY AUTO',
    'NIFTY PHARMA': 'NSE__NIFTY PHARMA',
    'NIFTY FMCG': 'NSE__NIFTY FMCG',
    'NIFTY METAL': 'NSE__NIFTY METAL',
    'NIFTY REALTY': 'NSE__NIFTY REALTY',
    'NIFTY ENERGY': 'NSE__NIFTY ENERGY',
    'NIFTY PSU BANK': 'NSE__NIFTY PSU BANK',
    'NIFTY INFRA': 'NSE__NIFTY INFRA',
    'NIFTY CONSUMPTION': 'NSE__NIFTY CONSUMPTION',
    'NIFTY MEDIA': 'NSE__NIFTY MEDIA',
    'NIFTY 50': 'NSE__NIFTY 50',
    'NIFTY 500': 'NSE__NIFTY 500',
}

def main():
    print(f"Connecting to {DB_PATH}...")
    con_sqlite = sqlite3.connect(str(DB_PATH), timeout=30.0)
    con_sqlite.execute("PRAGMA journal_mode=WAL")
    cur = con_sqlite.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS IndexOHLCV (
            index_symbol TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume INTEGER,
            turnover REAL,
            data_source TEXT DEFAULT 'NSE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (index_symbol, trade_date)
        )
    """)

    con_duck = duckdb.connect(':memory:')

    total_inserted = 0
    t0 = time.time()

    for index_symbol, dir_name in INDEX_MAP.items():
        parquet_file = PARTITIONS / f"index={dir_name}" / "part-0.parquet"
        if not parquet_file.exists():
            print(f"[-] Parquet not found for {index_symbol} at {parquet_file}")
            continue

        df = con_duck.execute("""
            SELECT 
                trade_date::VARCHAR as trade_date,
                open,
                high,
                low,
                close,
                volume,
                data_source
            FROM read_parquet(?)
            WHERE trade_date IS NOT NULL AND close > 0
            ORDER BY trade_date ASC
        """, [str(parquet_file)]).df()

        rows = []
        for _, row in df.iterrows():
            rows.append((
                index_symbol,
                str(row['trade_date']),
                float(row['open']) if row['open'] is not None else None,
                float(row['high']) if row['high'] is not None else None,
                float(row['low']) if row['low'] is not None else None,
                float(row['close']),
                int(row['volume']) if row['volume'] is not None else 0,
                0.0,
                'KITE_PUBLISHED_INDEX_LEVEL'
            ))

        cur.executemany("""
            INSERT OR REPLACE INTO IndexOHLCV 
            (index_symbol, trade_date, open, high, low, close, volume, turnover, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, rows)

        total_inserted += len(rows)
        print(f"[+] Loaded {len(rows)} candles for {index_symbol}")

    con_sqlite.commit()
    con_sqlite.close()

    print(f"\nCompleted! Total rows synced: {total_inserted} in {time.time() - t0:.2f}s")

if __name__ == '__main__':
    main()
