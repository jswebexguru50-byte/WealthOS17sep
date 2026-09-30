import sqlite3
import requests
import json
import os
from pathlib import Path

ROOT = Path("c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release").resolve()
DB_PATH = ROOT / "portfolio.db"
NEW_TOKEN = "Gcm143wcXGQbZjg0clcprGTUSs8C95VK"
API_KEY = "m8wqr277nffl4sx1"

# 1. Update AppConfig in portfolio.db
with sqlite3.connect(DB_PATH) as db:
    db.execute("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token', ?)", (NEW_TOKEN,))
    db.execute("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token_Updated_At', datetime('now'))")
    db.commit()
    print(f"[OK] AppConfig updated with new Kite Access Token.")

# 2. Test Kite profile endpoint
headers = {
    "X-Kite-Version": "3",
    "Authorization": f"token {API_KEY}:{NEW_TOKEN}"
}
try:
    resp = requests.get("https://api.kite.trade/user/profile", headers=headers, timeout=10)
    print(f"Kite Profile Status Code: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"[OK] Kite Authenticated successfully as user: {data.get('data', {}).get('user_name')} ({data.get('data', {}).get('user_id')})")
    else:
        print(f"[Warning] Kite response: {resp.text}")
except Exception as e:
    print(f"[Error] Kite connection error: {e}")

# 3. Data coverage audit
with sqlite3.connect(DB_PATH) as db:
    db.row_factory = sqlite3.Row
    
    # Tables check
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    
    # Distinct symbols in various domains
    def get_syms(query):
        try:
            return set(r[0] for r in db.execute(query).fetchall() if r[0])
        except:
            return set()
            
    fact_syms = get_syms("SELECT DISTINCT symbol FROM company_facts")
    doc_syms = get_syms("SELECT DISTINCT symbol FROM source_documents")
    event_syms = get_syms("SELECT DISTINCT symbol FROM company_events")
    mgmt_syms = get_syms("SELECT DISTINCT symbol FROM management_commitments")
    bar_syms = get_syms("SELECT DISTINCT symbol FROM daily_bars")
    port_syms = get_syms("SELECT DISTINCT symbol FROM Portfolio")
    watch_syms = get_syms("SELECT DISTINCT symbol FROM Watchlist")
    
    # Check DuckDB / Parquet store if exists
    tejhq_dir = ROOT / "data" / "market_data" / "tejhq_hf_10y" / "kite_adjusted_backfill"
    manifest_path = tejhq_dir / "manifest.json"
    parquet_syms = set()
    if manifest_path.exists():
        try:
            m = json.loads(manifest_path.read_text(encoding="utf-8"))
            parquet_syms = set(m.get("symbols", {}).keys())
        except:
            pass

    all_tracked = fact_syms | doc_syms | event_syms | mgmt_syms | bar_syms | port_syms | watch_syms | parquet_syms
    
    # 11 Benchmark companies
    benchmarks = ['DYCL', 'TCS', 'HDFCBANK', 'RELIANCE', 'TATAMOTORS', 'TATASTEEL', 'INFY', 'ICICIBANK', 'SUNPHARMA', 'TITAN', 'BEL']
    
    full_data = []
    partial_data = []
    need_download = []
    
    for s in all_tracked:
        has_f = s in fact_syms
        has_d = s in doc_syms
        has_e = s in event_syms
        has_m = s in mgmt_syms
        has_b = (s in bar_syms) or (s in parquet_syms)
        
        # Domains: Financial Facts, Documents, Events, Management, OHLCV Bars
        domains_present = sum([has_f, has_d, has_e, has_m, has_b])
        if domains_present >= 4:
            full_data.append(s)
        elif domains_present >= 1:
            partial_data.append(s)
        else:
            need_download.append(s)
            
    print("\n--- WEALTHOS DATA ESTATE COVERAGE REPORT ---")
    print(f"Total Tracked Stocks in System: {len(all_tracked)}")
    print(f"Stocks with Full / Near-Complete Data (>= 4 domains): {len(full_data)}")
    print(f"Stocks with Partial Data (1 - 3 domains): {len(partial_data)}")
    print(f"Stocks Needing Initial Ingestion / Download: {len(need_download)}")
    print(f"Portfolio Holdings: {len(port_syms)}")
    print(f"Watchlist Stocks: {len(watch_syms)}")
    print(f"Stocks with OHLCV daily bars in SQLite/Parquet: {len(bar_syms | parquet_syms)}")
    print(f"Stocks with Canonical Facts: {len(fact_syms)}")
    print(f"Stocks with Source Documents: {len(doc_syms)}")
    
    print("\nBenchmark 11 Status:")
    for b in benchmarks:
        domains = []
        if b in fact_syms: domains.append("Facts")
        if b in doc_syms: domains.append("Docs")
        if b in event_syms: domains.append("Events")
        if b in mgmt_syms: domains.append("Mgmt")
        if b in bar_syms or b in parquet_syms: domains.append("OHLCV")
        print(f" - {b}: [{', '.join(domains)}] (Total {len(domains)}/5 domains)")
