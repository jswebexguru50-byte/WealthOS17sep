#!/usr/bin/env python3
"""Export current OHLCV-derived values for the attached ITAS 49-stock workbook."""
from __future__ import annotations
import json
from pathlib import Path
import openpyxl
import duckdb

ROOT = Path(__file__).resolve().parents[2]
BOOK = Path(r'C:\Users\gopal\Downloads\ITAS_49_Stock_Master_Dossier_Advanced_Quant_V3.xlsx')
OUT = ROOT / 'scratch' / 'itas49_duckdb_snapshot.json'
KITE = ROOT / 'data' / 'market_data' / 'tejhq_hf_10y' / 'kite_adjusted_backfill' / 'candles'

book = openpyxl.load_workbook(BOOK, read_only=True, data_only=True)
sheet = book['🏆 49 Stock Master List']
symbols = [str(sheet.cell(row, 2).value).strip().upper() for row in range(2, sheet.max_row + 1) if sheet.cell(row, 2).value]
files = [KITE / f'symbol={symbol}' / 'part-0.parquet' for symbol in symbols]
existing = [file.as_posix().replace("'", "''") for file in files if file.exists()]
con = duckdb.connect(':memory:')
try:
    query_files = ','.join(f"'{file}'" for file in existing)
    rows = con.execute(f"""WITH data AS (
        SELECT trade_date, symbol, open_adjusted, high_adjusted, low_adjusted, close_adjusted, volume_raw,
          lag(close_adjusted) over (partition by symbol order by trade_date) prev_close
        FROM read_parquet([{query_files}], union_by_name=true)
      ), calc AS (
        SELECT *, abs(high_adjusted-low_adjusted) tr,
          row_number() over (partition by symbol order by trade_date desc) rn
        FROM data
      ) SELECT symbol, trade_date, close_adjusted, volume_raw,
          avg(tr) filter (where rn <= 14) over (partition by symbol) atr14,
          avg(volume_raw) filter (where rn <= 20) over (partition by symbol) avg_volume20,
          max(case when rn=1 then volume_raw end) over (partition by symbol) latest_volume
      FROM calc WHERE rn=1""").fetchall()
finally:
    con.close()
snapshot = {symbol: {'trade_date': str(date), 'close': float(close), 'volume': int(volume), 'atr14': float(atr or 0), 'delivery_surge': round(float(latest or 0) / float(avgvol or 1), 3)} for symbol, date, close, volume, atr, avgvol, latest in rows}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({'as_of': max((row['trade_date'] for row in snapshot.values()), default=None), 'symbols': snapshot}, indent=2), encoding='utf-8')
print(json.dumps({'symbols_in_workbook': len(symbols), 'duckdb_matched': len(snapshot), 'as_of': max((row['trade_date'] for row in snapshot.values()), default=None)}))
