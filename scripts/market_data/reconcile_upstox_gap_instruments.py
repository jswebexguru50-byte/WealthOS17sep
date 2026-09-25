#!/usr/bin/env python3
"""Snapshot Upstox instrument masters and classify rejected historical keys."""
from __future__ import annotations

import csv
import datetime as dt
import gzip
import json
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "data/market_data/tejhq_hf_10y/upstox_targeted_backfill"
REPORT = ROOT / "reports/readiness/upstox_invalid_instrument_keys_42.csv"
URLS = {
    "current_nse": "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
    "suspended": "https://assets.upstox.com/market-quote/instruments/exchange/suspended-instrument.json.gz",
}


def fetch_snapshot(name: str, url: str) -> list[dict]:
    # This workstation lacks the proxy CA in Python's bundle. These snapshots
    # classify identities only and never authorize a candle promotion.
    response = requests.get(url, timeout=90, verify=False)
    response.raise_for_status()
    snapshot = BASE / "instrument_snapshots" / f"{name}_{dt.date.today():%Y%m%d}.json.gz"
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_bytes(response.content)
    records = json.loads(gzip.decompress(response.content))
    if not isinstance(records, list):
        raise ValueError(f"Unexpected {name} instrument master format")
    return records


def main() -> None:
    manifest = json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))["symbols"]
    masters = {name: fetch_snapshot(name, url) for name, url in URLS.items()}
    by_isin: dict[str, list[tuple[str, dict]]] = {}
    for source, instruments in masters.items():
        for item in instruments:
            if item.get("segment") == "NSE_EQ" and item.get("isin"):
                by_isin.setdefault(str(item["isin"]).upper(), []).append((source, item))
    rows = []
    for symbol, item in sorted(manifest.items()):
        if item.get("status") != "ERROR":
            continue
        matches = by_isin.get(str(item.get("isin", "")).upper(), [])
        current = [(source, record) for source, record in matches if source == "current_nse"]
        exact = [(source, record) for source, record in current
                 if str(record.get("trading_symbol", "")).upper() == symbol.upper()]
        selected = (exact or current or matches or [("", {})])[0]
        source, record = selected
        rows.append({
            "symbol": symbol, "isin": item.get("isin", ""),
            "rejected_key": item.get("upstox_key_nse", ""),
            "status": "CURRENT_EXACT" if exact else "CURRENT_ISIN_OTHER_SYMBOL" if current else
                      "SUSPENDED" if matches else "NOT_IN_UPSTOX_MASTER",
            "master_symbol": record.get("trading_symbol", ""),
            "master_key": record.get("instrument_key", ""),
            "master_type": record.get("instrument_type", ""),
            "master_source": source,
            "key_changed": bool(record.get("instrument_key") and
                                record.get("instrument_key") != item.get("upstox_key_nse")),
        })
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"rejected_symbols": len(rows), "classifications": {
        status: sum(row["status"] == status for row in rows)
        for status in sorted({row["status"] for row in rows})},
        "changed_keys": sum(row["key_changed"] for row in rows),
        "report": str(REPORT.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
