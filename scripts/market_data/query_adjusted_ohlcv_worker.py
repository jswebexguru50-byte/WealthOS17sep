"""Line-delimited JSON worker for read-only canonical adjusted OHLCV queries.

The TypeScript service owns lifecycle and retry policy. This worker deliberately
does not call an external provider or create fallback bars: an absent parquet file
is reported as a coverage gap, and malformed input is rejected.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import duckdb

try:
    CON = duckdb.connect(":memory:")
    CON.execute("SET threads = 4")
    CON.execute("SET preserve_insertion_order = false")
except Exception as error:
    sys.stderr.write(f"Worker init failed: {error}\n")
    sys.exit(1)

KITE_ROOT = Path("data/market_data/tejhq_hf_10y/kite_adjusted_backfill/candles").resolve()
ALIAS_ROOT = Path("data/market_data/tejhq_hf_10y/resolved_symbol_aliases").resolve()
INDEX_ROOT = Path("data/market_data/tejhq_hf_10y/kite_index_backfill/candles").resolve()
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SYMBOL_RE = re.compile(r"^[A-Z0-9&._ -]+$")

def send_response(response: dict) -> None:
    sys.stdout.write(json.dumps(response, default=str) + "\n")
    sys.stdout.flush()

def request_dates(request: dict) -> tuple[str, str]:
    from_date = str(request.get("fromDate", "1900-01-01"))
    to_date = str(request.get("toDate", "2999-12-31"))
    if not DATE_RE.fullmatch(from_date) or not DATE_RE.fullmatch(to_date):
        raise ValueError("fromDate and toDate must be ISO YYYY-MM-DD dates")
    if from_date > to_date:
        raise ValueError("fromDate must not be after toDate")
    return from_date, to_date

def request_limit(request: dict) -> int:
    try:
        limit = int(request.get("limit", 1000))
    except (TypeError, ValueError) as error:
        raise ValueError("limit must be an integer") from error
    return max(1, min(limit, 10_000))

def clean_symbol(value: object) -> str:
    symbol = str(value).strip().upper()
    if not symbol or not SYMBOL_RE.fullmatch(symbol):
        raise ValueError("symbol contains unsupported characters")
    return symbol

def index_path(symbol: str) -> Path | None:
    for candidate in (
        INDEX_ROOT / f"index=NSE__{symbol}" / "part-0.parquet",
        INDEX_ROOT / f"index=BSE__{symbol}" / "part-0.parquet",
        INDEX_ROOT / f"index={symbol}" / "part-0.parquet",
    ):
        if candidate.exists():
            return candidate
    return None

def handle_query(request: dict) -> None:
    request_id = request.get("id")
    started_at = time.time()
    try:
        raw_symbols = request.get("symbols", [])
        if not isinstance(raw_symbols, list):
            raise ValueError("symbols must be an array")
        symbols = [clean_symbol(symbol) for symbol in raw_symbols if str(symbol).strip()]
        limit = request_limit(request)
        from_date, to_date = request_dates(request)
    except ValueError as error:
        send_response({"id": request_id, "ok": False, "error": str(error)})
        return
    if not symbols:
        send_response({"id": request_id, "ok": True, "rows": [], "coveredSymbols": [], "coverageGaps": [], "queryMs": int((time.time() - started_at) * 1000)})
        return
    if len(symbols) == 1:
        path = index_path(symbols[0])
        if path:
            try:
                rows = CON.execute("""
                    SELECT trade_date::VARCHAR AS trade_date, ? AS symbol,
                           NULL::VARCHAR AS isin, NULL::VARCHAR AS upstox_key_nse,
                           open AS open_adjusted, high AS high_adjusted,
                           low AS low_adjusted, close AS close_adjusted,
                           volume AS volume_raw, data_source
                    FROM read_parquet(?)
                    WHERE trade_date >= ? AND trade_date <= ?
                    ORDER BY trade_date DESC LIMIT ?
                    """, [symbols[0], str(path), from_date, to_date, limit]).fetchdf().to_dict(orient="records")
                rows.reverse()
                send_response({"id": request_id, "ok": True, "rows": rows, "coveredSymbols": symbols, "coverageGaps": [], "queryMs": int((time.time() - started_at) * 1000)})
            except Exception as error:
                send_response({"id": request_id, "ok": False, "error": str(error)})
            return
    covered, gaps, parquet_files = [], [], []
    for symbol in symbols:
        alias = ALIAS_ROOT / f"symbol={symbol}" / "part-0.parquet"
        path = alias if alias.exists() else KITE_ROOT / f"symbol={symbol}" / "part-0.parquet"
        if path.exists():
            covered.append(symbol)
            parquet_files.append(str(path))
        else:
            gaps.append(symbol)
    if not covered:
        send_response({"id": request_id, "ok": True, "rows": [], "coveredSymbols": [], "coverageGaps": gaps, "queryMs": int((time.time() - started_at) * 1000)})
        return
    try:
        rows = CON.execute("""
            SELECT trade_date::VARCHAR AS trade_date, symbol, isin, upstox_key_nse,
                   open_adjusted, high_adjusted, low_adjusted, close_adjusted,
                   volume_raw, data_source
            FROM read_parquet(?, union_by_name=true)
            WHERE trade_date >= ? AND trade_date <= ?
            QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) <= ?
            ORDER BY symbol, trade_date ASC
            """, [parquet_files, from_date, to_date, limit]).fetchdf().to_dict(orient="records")
        send_response({"id": request_id, "ok": True, "rows": rows, "coveredSymbols": covered, "coverageGaps": gaps, "queryMs": int((time.time() - started_at) * 1000)})
    except Exception as error:
        sys.stderr.write(f"Query error: {error}\n")
        send_response({"id": request_id, "ok": False, "error": str(error), "queryMs": int((time.time() - started_at) * 1000)})

def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            sys.stderr.write("Invalid JSON request\n")
            continue
        command = request.get("cmd")
        if command == "ping":
            send_response({"id": request.get("id"), "ok": True, "pong": True})
        elif command == "shutdown":
            send_response({"id": request.get("id"), "ok": True})
            return
        elif command == "query":
            handle_query(request)
        else:
            send_response({"id": request.get("id"), "ok": False, "error": "Unknown command"})

if __name__ == "__main__":
    main()
