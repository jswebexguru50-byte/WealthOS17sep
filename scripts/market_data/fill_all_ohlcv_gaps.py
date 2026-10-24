#!/usr/bin/env python3
"""
Comprehensive OHLCV gap-filler.
For each active NSE symbol, reads the actual last date in its parquet file
and fetches from that date to today — handling ALL historical gaps in one pass.
"""
from __future__ import annotations
import csv, datetime as dt, io, json, os, sqlite3, sys, time, warnings
from pathlib import Path
import pandas as pd
import requests

warnings.filterwarnings("ignore")

ROOT  = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
OUT   = STORE / "kite_adjusted_backfill"
TODAY = dt.date.today()
DELAY = 0.38
MIN_REFRESH_DAYS = 1   # skip if data is already current to today


def token() -> str:
    supplied = os.environ.get("KITE_ACCESS_TOKEN")
    if supplied:
        return supplied
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        row = db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]:
        raise RuntimeError("Kite access token unavailable")
    return row[0]


def load_env() -> None:
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def kite_get(session, url, params=None):
    r = session.get(url, params=params, timeout=60, verify=False)
    if r.status_code == 429:
        print("  [rate-limit] sleeping 5s...")
        time.sleep(5)
        r = session.get(url, params=params, timeout=60, verify=False)
    r.raise_for_status()
    time.sleep(DELAY)
    return r


def get_parquet_last_date(file_path: Path) -> dt.date | None:
    """Return the max trade_date in an existing parquet file, or None if missing."""
    if not file_path.exists():
        return None
    try:
        df = pd.read_parquet(file_path, columns=["trade_date"])
        if df.empty:
            return None
        return dt.date.fromisoformat(str(df["trade_date"].max())[:10])
    except Exception:
        return None


def fetch_and_merge(session, instrument_token: str, symbol: str, isin: str,
                    upstox_key: str, from_date: dt.date, file_path: Path) -> tuple[int, str]:
    """Fetch Kite candles from_date→TODAY and merge into existing parquet. Returns (new_rows, max_date)."""
    endpoint = f"https://api.kite.trade/instruments/historical/{instrument_token}/day"
    # Kite max window is 2000 days — split into 1800-day chunks if needed
    all_rows = []
    cursor = TODAY
    while cursor >= from_date:
        chunk_start = max(from_date, cursor - dt.timedelta(days=1800))
        candles = kite_get(session, endpoint, {
            "from": str(chunk_start), "to": str(cursor)
        }).json().get("data", {}).get("candles", [])
        for c in candles:
            all_rows.append({
                "trade_date": c[0][:10], "symbol": symbol, "isin": isin,
                "upstox_key_nse": upstox_key, "kite_instrument_token": int(instrument_token),
                "open_adjusted": float(c[1]), "high_adjusted": float(c[2]),
                "low_adjusted": float(c[3]), "close_adjusted": float(c[4]),
                "volume_raw": int(c[5]), "data_source": "KITE_CORPORATE_ACTION_ADJUSTED"
            })
        cursor = chunk_start - dt.timedelta(days=1)

    if not all_rows:
        return 0, str(from_date)

    new_df = pd.DataFrame(all_rows)
    if file_path.exists():
        old_df = pd.read_parquet(file_path)
        # Keep old rows before the fetch window; replace from from_date onward
        old_df = old_df[old_df["trade_date"] < str(from_date)]
        merged = pd.concat([old_df, new_df]).drop_duplicates(["symbol", "trade_date"]).sort_values("trade_date")
    else:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        merged = new_df.drop_duplicates(["symbol", "trade_date"]).sort_values("trade_date")

    tmp = file_path.with_suffix(".parquet.partial")
    merged.to_parquet(tmp, index=False, compression="zstd")
    tmp.replace(file_path)
    return len(all_rows), str(merged["trade_date"].max())


def main() -> None:
    load_env()
    api_key = os.environ.get("KITE_API_KEY", "")
    if not api_key:
        raise RuntimeError("KITE_API_KEY missing")

    session = requests.Session()
    session.headers.update({"X-Kite-Version": "3", "Authorization": f"token {api_key}:{token()}"})

    # Verify token works
    profile = kite_get(session, "https://api.kite.trade/user/profile").json()
    print(f"Authenticated as: {profile.get('data', {}).get('user_name', 'unknown')}")
    print(f"Target: fill all gaps up to {TODAY}")

    # Load Kite instrument master
    instruments = list(csv.DictReader(io.StringIO(kite_get(session, "https://api.kite.trade/instruments/NSE").text)))
    by_symbol = {x["tradingsymbol"].strip().upper(): x for x in instruments if x.get("instrument_type") == "EQ"}
    print(f"Loaded {len(by_symbol)} Kite NSE instruments")

    # Load active symbols from portfolio DB
    with sqlite3.connect(f"file:{ROOT / 'portfolio.db'}?mode=ro", uri=True) as db:
        active = db.execute("""
            SELECT DISTINCT symbol, isin, upstox_key_nse FROM MasterTickers
            WHERE exchange='NSE' AND segment='EQ' AND status='ACTIVE'
              AND upstox_key_nse IS NOT NULL
            ORDER BY symbol
        """).fetchall()
    print(f"Active symbols in DB: {len(active)}")

    # Build gap list: symbols where parquet last_date < TODAY
    gaps = []
    for symbol, isin, upstox_key in active:
        file_path = OUT / "candles" / f"symbol={symbol}" / "part-0.parquet"
        last_date = get_parquet_last_date(file_path)
        if last_date is None:
            gaps.append((symbol, isin, upstox_key, dt.date(2016, 9, 22), file_path, "NO_FILE"))
        elif (TODAY - last_date).days > MIN_REFRESH_DAYS:
            # Fetch from day after last known date
            fetch_from = last_date + dt.timedelta(days=1)
            gap_days = (TODAY - last_date).days
            gaps.append((symbol, isin, upstox_key, fetch_from, file_path, f"GAP_{gap_days}d"))

    # Sort: longest gaps first (most critical)
    gaps.sort(key=lambda x: x[3])

    print(f"\nSymbols needing update: {len(gaps)}")
    if gaps:
        no_file = sum(1 for g in gaps if g[5] == "NO_FILE")
        big_gaps = sum(1 for g in gaps if g[5].startswith("GAP_") and int(g[5][4:-1]) > 30)
        print(f"  - No parquet file: {no_file}")
        print(f"  - Gap > 30 days:   {big_gaps}")
        print(f"  - Gap 1-30 days:   {len(gaps) - no_file - big_gaps}")

    updated = skipped_no_instrument = skipped_no_data = errors = 0
    results = []

    for i, (symbol, isin, upstox_key, fetch_from, file_path, gap_type) in enumerate(gaps):
        # Find Kite instrument
        candidates = [symbol] + [f"{symbol}-{s}" for s in ("SM", "ST", "SZ", "BE", "BZ")]
        instrument = next((by_symbol[c] for c in candidates if c in by_symbol), None)
        if not instrument:
            skipped_no_instrument += 1
            results.append({"symbol": symbol, "status": "NO_KITE_INSTRUMENT", "gap_type": gap_type})
            continue

        try:
            new_rows, max_date = fetch_and_merge(
                session, instrument["instrument_token"], symbol,
                isin, upstox_key, fetch_from, file_path
            )
            if new_rows == 0:
                skipped_no_data += 1
                results.append({"symbol": symbol, "status": "NO_NEW_DATA", "gap_type": gap_type, "max_date": str(fetch_from)})
            else:
                updated += 1
                results.append({"symbol": symbol, "status": "UPDATED", "gap_type": gap_type,
                                 "new_rows": new_rows, "max_date": max_date})
        except Exception as e:
            errors += 1
            results.append({"symbol": symbol, "status": "ERROR", "gap_type": gap_type, "error": str(e)[:200]})
            if errors <= 10:
                print(f"  ERROR [{symbol}]: {e}")

        if (i + 1) % 100 == 0:
            elapsed_mins = (i + 1) * DELAY / 60
            print(f"  [{i+1}/{len(gaps)}] updated={updated} skipped_no_inst={skipped_no_instrument} "
                  f"no_data={skipped_no_data} errors={errors} (~{elapsed_mins:.0f} min elapsed)")

    print(f"\n=== COMPLETE ===")
    print(f"Updated:        {updated}")
    print(f"No instrument:  {skipped_no_instrument}")
    print(f"No new data:    {skipped_no_data}")
    print(f"Errors:         {errors}")

    # Save results report
    report_path = ROOT / "data" / "market_data" / "gap_fill_report.json"
    report = {
        "run_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "target_date": str(TODAY),
        "gaps_found": len(gaps),
        "updated": updated,
        "skipped_no_instrument": skipped_no_instrument,
        "skipped_no_data": skipped_no_data,
        "errors": errors,
        "details": results
    }
    report_path.write_text(json.dumps(report, indent=2))
    print(f"Report: {report_path}")

    # Update DuckDB view
    try:
        import duckdb
        catalog = STORE / "ohlcv.duckdb"
        con = duckdb.connect(str(catalog))
        glob = (OUT / "candles" / "symbol=*" / "*.parquet").as_posix().replace("'", "''")
        con.execute(f"CREATE OR REPLACE VIEW kite_adjusted_ohlcv AS SELECT * FROM read_parquet('{glob}', union_by_name=true)")
        r = con.execute("SELECT count(*), count(DISTINCT symbol), min(trade_date), max(trade_date) FROM kite_adjusted_ohlcv").fetchone()
        print(f"\nDuckDB kite_adjusted_ohlcv: {r[0]:,} rows | {r[1]} symbols | {r[2]} → {r[3]}")
        con.close()
    except Exception as e:
        print(f"DuckDB update warning: {e}")


if __name__ == "__main__":
    main()
