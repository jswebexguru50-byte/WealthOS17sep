import sqlite3
import json

con = sqlite3.connect('portfolio.db')
cur = con.cursor()
cur.execute("SELECT endpoint, response_json FROM fundamental_endpoint_snapshots WHERE symbol = 'TCS'")
for ep, js in cur.fetchall():
    try:
        data = json.loads(js)
        print(f"Endpoint: {ep}")
        if isinstance(data, dict):
            if 'data' in data and isinstance(data['data'], dict):
                print(f"  data keys: {list(data['data'].keys())[:10]}")
                if 'sector' in data['data'] or 'industry' in data['data']:
                    print(f"  sector: {data['data'].get('sector')}, industry: {data['data'].get('industry')}")
            else:
                print(f"  keys: {list(data.keys())[:10]}")
    except Exception as e:
        print(f"Error {ep}: {e}")
