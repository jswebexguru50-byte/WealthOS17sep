import sqlite3
import json

con = sqlite3.connect('portfolio.db')
cur = con.cursor()

# Get sectors and count of stocks with snapshots
query = """
SELECT 
    m.symbol,
    COALESCE(m.company_name, m.name) as company_name,
    m.sector,
    m.industry,
    (SELECT value FROM company_facts WHERE symbol = m.symbol AND metric = 'market_cap_cr' ORDER BY periodEnd DESC LIMIT 1) as mcap_cr,
    (SELECT count(*) FROM fundamental_endpoint_snapshots WHERE symbol = m.symbol) as snap_count,
    (SELECT count(*) FROM company_facts WHERE symbol = m.symbol) as fact_count
FROM MasterTickers m
WHERE m.symbol IN (SELECT DISTINCT symbol FROM fundamental_endpoint_snapshots)
ORDER BY snap_count DESC, fact_count DESC
"""
cur.execute(query)
rows = cur.fetchall()

print(f"Total stocks with fundamental snapshots: {len(rows)}")

# Group by sectors
by_sector = {}
for r in rows:
    sym, name, sector, ind, mcap, snaps, facts = r
    sec = sector or 'Unknown'
    if sec not in by_sector:
        by_sector[sec] = []
    by_sector[sec].append({
        'symbol': sym,
        'company_name': name,
        'sector': sec,
        'industry': ind,
        'market_cap_cr': mcap,
        'snap_count': snaps,
        'fact_count': facts
    })

print(f"Sectors found: {len(by_sector)}")
for sec, items in sorted(by_sector.items(), key=lambda x: len(x[1]), reverse=True)[:15]:
    print(f"  {sec}: {len(items)} stocks")
