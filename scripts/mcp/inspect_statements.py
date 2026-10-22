import sqlite3
import json

con = sqlite3.connect('portfolio.db')
cur = con.cursor()

for ep in ['income-statement', 'balance-sheet', 'cash-flow', 'key-ratios']:
    cur.execute("SELECT response_json FROM fundamental_endpoint_snapshots WHERE symbol = 'TCS' AND endpoint = ?", (ep,))
    row = cur.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        print(f"=== {ep} ===")
        if ep == 'income-statement':
            inc = data.get('data', {})
            print("Scope:", inc.get('type'), "Units:", inc.get('units_in'))
            if 'income_statement' in inc:
                cats = [c.get('category') for c in inc['income_statement']]
                print("Categories:", cats)
                if inc['income_statement']:
                    print("First cat sample:", inc['income_statement'][0])
        elif ep == 'balance-sheet':
            bs = data.get('data', {})
            print("BS Scope:", bs.get('type'), "Units:", bs.get('units_in'))
            if 'history' in bs and isinstance(bs['history'], list):
                print("BS Items:", [h.get('particulars') or h.get('category') or list(h.keys()) for h in bs['history'][:5]])
        elif ep == 'cash-flow':
            cf = data.get('data', {})
            print("CF Scope:", cf.get('type'), "Units:", cf.get('units_in'))
            print("CF keys:", list(cf.keys()))
        elif ep == 'key-ratios':
            kr = data.get('data', [])
            if isinstance(kr, list):
                print("Key ratio names:", [r.get('name') for r in kr[:10]])
