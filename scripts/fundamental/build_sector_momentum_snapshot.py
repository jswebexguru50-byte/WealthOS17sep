#!/usr/bin/env python3
"""Build a provenance-preserving sector-momentum snapshot from saved index candles.

This program is deliberately read-only.  It joins a symbol to its existing
MasterTickers sector, maps only recognised sectors to an NSE sector index, and
calculates values from the persisted Kite index parquet file.  It never fetches
market data and never assigns a sector when the database has none.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

import duckdb


SECTOR_INDEX_MAP: dict[str, str] = {
    "BANK": "NIFTY BANK", "BANKING": "NIFTY BANK",
    "FINANCIAL": "NIFTY FIN SERVICE", "FINANCIAL SERVICES": "NIFTY FIN SERVICE",
    "IT": "NIFTY IT", "INFORMATION TECHNOLOGY": "NIFTY IT", "TECHNOLOGY": "NIFTY IT",
    "AUTO": "NIFTY AUTO", "AUTOMOBILE": "NIFTY AUTO",
    "PHARMA": "NIFTY PHARMA", "PHARMACEUTICALS": "NIFTY PHARMA", "HEALTHCARE": "NIFTY PHARMA",
    "FMCG": "NIFTY FMCG", "CONSUMER DEFENSIVE": "NIFTY FMCG",
    "METAL": "NIFTY METAL", "METALS": "NIFTY METAL", "BASIC MATERIALS": "NIFTY METAL",
    "REALTY": "NIFTY REALTY", "REAL ESTATE": "NIFTY REALTY",
    "ENERGY": "NIFTY ENERGY", "OIL & GAS": "NIFTY ENERGY", "UTILITIES": "NIFTY ENERGY",
    "PSU BANK": "NIFTY PSU BANK", "PRIVATE BANK": "NIFTY PVT BANK",
    "INDUSTRIALS": "NIFTY INFRA", "INFRASTRUCTURE": "NIFTY INFRA",
    "CONSUMER CYCLICAL": "NIFTY CONSUMPTION", "CONSUMPTION": "NIFTY CONSUMPTION",
    "RETAIL": "NIFTY NEW CONSUMP", "RETAILING": "NIFTY NEW CONSUMP",
    "COMMUNICATION SERVICES": "NIFTY MEDIA", "MEDIA": "NIFTY MEDIA",
}


def sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    result = sum(values[:period]) / period
    alpha = 2 / (period + 1)
    for value in values[period:]:
        result = value * alpha + result * (1 - alpha)
    return result


def unavailable(symbol: str, sector: str | None, reason: str, index_symbol: str | None = None) -> dict:
    return {
        "symbol": symbol, "sector": sector, "indexSymbol": index_symbol,
        "asOf": None, "close": None, "ema20": None, "sma20": None,
        "return20dPct": None, "aboveEma20": None, "aboveSma20": None,
        "status": "SOURCE_UNAVAILABLE", "availabilityReason": reason,
        "source": "KITE_INDEX_PARQUET",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--symbols-json", type=Path, required=True)
    parser.add_argument("--index-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provider-proxy-map", type=Path)
    args = parser.parse_args()

    provider_proxy_map: dict[str, str] = {}
    if args.provider_proxy_map and args.provider_proxy_map.exists():
        provider_proxy_map = json.loads(args.provider_proxy_map.read_text(encoding="utf-8")).get("mappings", {})

    symbols = [str(s).strip().upper() for s in json.loads(args.symbols_json.read_text(encoding="utf-8"))]
    conn = sqlite3.connect(f"file:{args.db.resolve().as_posix()}?mode=ro", uri=True)
    sector_rows = conn.execute(
        "SELECT UPPER(symbol) AS symbol, sector FROM MasterTickers WHERE UPPER(symbol) IN ({})".format(
            ",".join("?" for _ in symbols)
        ), symbols
    ).fetchall()
    conn.close()

    sectors_by_symbol: dict[str, set[str]] = {}
    for symbol, sector in sector_rows:
        clean = str(sector or "").strip()
        if clean:
            sectors_by_symbol.setdefault(symbol, set()).add(clean)

    con = duckdb.connect(":memory:", read_only=False)
    results: list[dict] = []
    for symbol in symbols:
        assigned = sectors_by_symbol.get(symbol, set())
        if not assigned:
            results.append(unavailable(symbol, None, "No verified sector mapping in MasterTickers."))
            continue
        if len(assigned) != 1:
            results.append(unavailable(symbol, None, "Conflicting sector mappings in MasterTickers."))
            continue
        sector = next(iter(assigned))
        index_symbol = SECTOR_INDEX_MAP.get(sector.upper()) or provider_proxy_map.get(sector)
        mapping_method = (
            "TRENDLYNE_SECTOR_TO_NSE_INDEX_PROXY"
            if sector in provider_proxy_map else "MASTER_TICKER_SECTOR_TO_NSE_INDEX"
        )
        if not index_symbol:
            results.append(unavailable(symbol, sector, "No approved NSE sector-index mapping for this sector.", None))
            continue
        parquet = args.index_root / f"index=NSE__{index_symbol}" / "part-0.parquet"
        if not parquet.exists():
            results.append(unavailable(symbol, sector, "Saved NSE sector-index candles are unavailable.", index_symbol))
            continue
        try:
            data = con.execute(
                "SELECT trade_date, close FROM read_parquet(?) ORDER BY trade_date", [str(parquet)]
            ).fetchall()
        except Exception as exc:
            results.append(unavailable(symbol, sector, f"Could not read saved sector-index candles: {exc}", index_symbol))
            continue
        closes = [float(close) for _, close in data if close is not None]
        if len(closes) < 21:
            results.append(unavailable(symbol, sector, "Fewer than 21 saved sector-index closes.", index_symbol))
            continue
        latest_date, latest_close = data[-1]
        latest_close = float(latest_close)
        ema20 = ema(closes, 20)
        sma20 = sma(closes, 20)
        return20 = ((latest_close / closes[-21]) - 1) * 100 if closes[-21] else None
        above_ema = latest_close > ema20 if ema20 is not None else None
        above_sma = latest_close > sma20 if sma20 is not None else None
        results.append({
            "symbol": symbol, "sector": sector, "indexSymbol": index_symbol,
            "asOf": str(latest_date), "close": latest_close, "ema20": ema20, "sma20": sma20,
            "return20dPct": return20, "aboveEma20": above_ema, "aboveSma20": above_sma,
            "status": "BULLISH" if above_ema and above_sma else "NOT_BULLISH",
            "availabilityReason": "Calculated from saved Kite NSE sector-index OHLCV.",
            "source": "KITE_INDEX_PARQUET",
            "indexMappingMethod": mapping_method,
        })

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "source": "KITE_INDEX_PARQUET",
        "rows": results,
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
