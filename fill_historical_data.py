"""
NSE Historical Data Gap Filler - Yahoo Finance Direct HTTP
Fills DailyOHLCV for all symbols from 2019-01-01 onward using Yahoo Finance.
Uses INSERT OR IGNORE so existing rows are not touched.

Run: python fill_historical_data.py
"""

import sqlite3
import time
import requests
import urllib3
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List
import sys

urllib3.disable_warnings()

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH       = r"C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release\portfolio.db"
START_DATE    = "2019-01-01"
END_DATE      = "2026-09-10"   # up to today
CONCURRENCY   = 25             # parallel Yahoo requests (conservative to avoid rate-limit)
BATCH_FLUSH   = 8000           # rows to accumulate before DB write
RETRY_DELAY   = 1.5            # seconds between retries on 429

# ── Database helpers ──────────────────────────────────────────────────────────
def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=90)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")
    return conn

INSERT_SQL = """
    INSERT OR IGNORE INTO DailyOHLCV
        (symbol, trade_date, open, high, low, close, volume, turnover, data_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

def flush_rows(conn, rows):
    if not rows:
        return 0
    conn.executemany(INSERT_SQL, rows)
    conn.commit()
    return len(rows)

# ── Yahoo Finance HTTP ────────────────────────────────────────────────────────
YAHOO_BASE = "https://query2.finance.yahoo.com/v8/finance/chart"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})

def fetch_yahoo_symbol(symbol: str, p1: int, p2: int, attempt: int = 0) -> List[tuple]:
    url = f"{YAHOO_BASE}/{symbol}.NS?period1={p1}&period2={p2}&interval=1d"
    try:
        resp = SESSION.get(url, timeout=15, verify=False)
        if resp.status_code == 429:
            if attempt < 2:
                time.sleep(RETRY_DELAY * (attempt + 1))
                return fetch_yahoo_symbol(symbol, p1, p2, attempt + 1)
            return []
        if not resp.ok:
            return []
        j = resp.json()
        result = j.get("chart", {}).get("result")
        if not result or not result[0]:
            return []
        result = result[0]
        timestamps = result.get("timestamp") or []
        q = (result.get("indicators", {}).get("quote") or [{}])[0]
        if not timestamps or not q:
            return []

        opens   = q.get("open") or []
        highs   = q.get("high") or []
        lows    = q.get("low") or []
        closes  = q.get("close") or []
        volumes = q.get("volume") or []

        rows = []
        for i, ts in enumerate(timestamps):
            close = closes[i] if i < len(closes) else None
            if not close or close <= 0:
                continue
            date = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            rows.append((
                symbol, date,
                (opens[i]   if i < len(opens)   and opens[i]   else close),
                (highs[i]   if i < len(highs)   and highs[i]   else close),
                (lows[i]    if i < len(lows)    and lows[i]    else close),
                close,
                int(volumes[i] if i < len(volumes) and volumes[i] else 0),
                None,
                "YAHOO_FINANCE"
            ))
        return rows
    except Exception:
        return []

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*60}")
    print(f" NSE Historical Data Filler — Yahoo Finance")
    print(f" Range: {START_DATE} to {END_DATE}")
    print(f" Concurrency: {CONCURRENCY} parallel requests")
    print(f"{'='*60}\n")

    conn = get_conn()

    # Get all unique symbols from DailyOHLCV (3521 symbols)
    cur = conn.execute("SELECT DISTINCT symbol FROM DailyOHLCV ORDER BY symbol")
    all_symbols = [r[0] for r in cur.fetchall()]
    print(f"Total symbols in DB: {len(all_symbols)}")

    # Filter: only symbols that need historical data (earliest date > 2020-01-01)
    cur2 = conn.execute("""
        SELECT symbol, MIN(trade_date) as first_date, MAX(trade_date) as last_date, COUNT(*) as bars
        FROM DailyOHLCV
        GROUP BY symbol
        HAVING first_date > '2020-01-01'
        ORDER BY first_date DESC
    """)
    gap_rows = cur2.fetchall()
    gap_symbols = [r[0] for r in gap_rows]
    print(f"Symbols needing historical fill (first_date > 2020-01-01): {len(gap_symbols)}")

    if not gap_symbols:
        print("No gaps found! All symbols have pre-2020 data.")
        conn.close()
        return

    # Show a sample
    print("Sample symbols to fill:")
    for r in gap_rows[:10]:
        print(f"  {r[0]}: {r[2]} bars, {r[1]} to {r[2]}")

    p1 = int(datetime.strptime(START_DATE, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    p2 = int(datetime.strptime(END_DATE, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())

    total_inserted = 0
    total_failed   = 0
    completed      = 0
    batch_rows     = []
    start_time     = time.time()

    print(f"\nStarting download at {CONCURRENCY} concurrent threads...\n")

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = {ex.submit(fetch_yahoo_symbol, sym, p1, p2): sym for sym in gap_symbols}

        for fut in as_completed(futures):
            sym = futures[fut]
            rows = fut.result()

            if rows:
                batch_rows.extend(rows)
            else:
                total_failed += 1

            completed += 1

            # Flush to DB
            if len(batch_rows) >= BATCH_FLUSH or completed == len(gap_symbols):
                if batch_rows:
                    inserted = flush_rows(conn, batch_rows)
                    total_inserted += inserted
                    batch_rows = []

            if completed % 100 == 0 or completed == len(gap_symbols):
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                eta = (len(gap_symbols) - completed) / rate if rate > 0 else 0
                print(f"  [{completed}/{len(gap_symbols)}] Inserted: {total_inserted:,} rows | "
                      f"Failed: {total_failed} | Rate: {rate:.1f}/s | ETA: {eta:.0f}s")
                sys.stdout.flush()

    # Final DB stats
    row = conn.execute("""
        SELECT COUNT(*), MIN(trade_date), MAX(trade_date), COUNT(DISTINCT symbol)
        FROM DailyOHLCV
    """).fetchone()

    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f" DONE in {elapsed:.0f}s ({elapsed/60:.1f} min)")
    print(f" New rows inserted: {total_inserted:,}")
    print(f" Failed symbols: {total_failed}")
    print(f" DailyOHLCV: {row[0]:,} rows | {row[3]} symbols | {row[1]} to {row[2]}")
    print(f"{'='*60}\n")

    conn.close()

if __name__ == "__main__":
    main()
