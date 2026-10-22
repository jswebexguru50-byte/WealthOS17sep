import sqlite3
import json

symbols = [
    'TCS', 'INFY', 'BAJFINANCE', 'HDFCBANK', 'RELIANCE',
    'TATAMOTORS', 'TATASTEEL', 'SUNPHARMA', 'TITAN', 'LTIM',
    'LT', 'ASTRAL', 'POLYCAB', 'DEEPAKNTR', 'PIDILITIND',
    'AAVAS', 'CLEAN', 'RAMCOIND', 'DYCL', 'STYL'
]

con = sqlite3.connect('portfolio.db')
cur = con.cursor()

results = []
for sym in symbols:
    cur.execute("SELECT symbol, COALESCE(company_name, name), sector, industry FROM MasterTickers WHERE symbol = ?", (sym,))
    ticker = cur.fetchone()
    cur.execute("SELECT count(*) FROM fundamental_endpoint_snapshots WHERE symbol = ?", (sym,))
    snaps = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM company_facts WHERE symbol = ?", (sym,))
    facts = cur.fetchone()[0]
    
    results.append({
        'symbol': sym,
        'name': ticker[1] if ticker else 'Unknown',
        'sector': ticker[2] if ticker else 'Unknown',
        'industry': ticker[3] if ticker else 'Unknown',
        'snapshot_count': snaps,
        'fact_count': facts,
        'has_data': snaps > 0 or facts > 0
    })

print(json.dumps(results, indent=2))
print("Total found:", len([r for r in results if r['has_data']]), "/", len(symbols))
