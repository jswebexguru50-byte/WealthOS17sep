#!/usr/bin/env python3
"""Archive official NSE CM bhavcopies and audit recent target trading dates."""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import time
import zipfile
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data/market_data/tejhq_hf_10y/nse_official_gap_audit"
TARGETS = ROOT / "reports/readiness/adjusted_ohlcv_remaining_targets.csv"
OUT = ROOT / "reports/readiness/nse_official_gap_date_audit.csv"
BASE_URL = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{date}_F_0000.csv.zip"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2026-09-01")
    parser.add_argument("--end", default="2026-09-21")
    args = parser.parse_args()
    start, end = dt.date.fromisoformat(args.start), dt.date.fromisoformat(args.end)
    with TARGETS.open(encoding="utf-8") as f:
        targets = list(csv.DictReader(f))
    by_isin = {r["isin"].upper(): r for r in targets if r["isin"]}
    observed: dict[str, list[str]] = {isin: [] for isin in by_isin}
    failures: list[dict] = []
    STORE.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (compatible; local-market-data-audit/1.0)"
    day = start
    archives = 0
    while day <= end:
        if day.weekday() < 5:
            date_key = day.strftime("%Y%m%d")
            dest = STORE / f"BhavCopy_NSE_CM_0_0_0_{date_key}_F_0000.csv.zip"
            try:
                if not dest.exists():
                    response = session.get(BASE_URL.format(date=date_key), timeout=45, verify=False)
                    if response.status_code in (404, 403):
                        day += dt.timedelta(days=1)
                        time.sleep(0.5)
                        continue
                    response.raise_for_status()
                    if not zipfile.is_zipfile(io.BytesIO(response.content)):
                        raise ValueError("NSE returned a non-ZIP response")
                    temporary = dest.with_suffix(".partial")
                    temporary.write_bytes(response.content)
                    temporary.replace(dest)
                    time.sleep(0.5)
                archives += 1
                with zipfile.ZipFile(dest) as archive:
                    csv_name = next(name for name in archive.namelist() if name.lower().endswith(".csv"))
                    with archive.open(csv_name) as data:
                        reader = csv.DictReader(io.TextIOWrapper(data, encoding="utf-8-sig"))
                        for row in reader:
                            normalized = {k.strip().upper(): v for k, v in row.items() if k}
                            isin = (normalized.get("ISIN") or normalized.get("TCKR_SYMB") or "").upper()
                            if isin in observed:
                                observed[isin].append(day.isoformat())
            except (requests.RequestException, OSError, ValueError, KeyError, StopIteration) as error:
                failures.append({"date": day.isoformat(), "error": str(error)[:200]})
        day += dt.timedelta(days=1)
    rows = [{"symbol": r["symbol"], "isin": r["isin"],
             "prior_status": r["coverage_status"],
             "nse_trade_days_in_window": len(observed.get(r["isin"].upper(), [])),
             "nse_latest_trade_date": max(observed.get(r["isin"].upper(), []), default=""),
             "source": "NSE_CM_UDIFF_OFFICIAL_RAW"} for r in targets]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (STORE / "manifest.json").write_text(json.dumps({"start": str(start), "end": str(end),
        "downloaded_archives": archives, "failures": failures,
        "report": str(OUT.relative_to(ROOT))}, indent=2), encoding="utf-8")
    print(json.dumps({"archives": archives, "targets": len(rows),
        "targets_with_nse_trades": sum(r["nse_trade_days_in_window"] > 0 for r in rows),
        "failed_dates": len(failures), "report": str(OUT.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
