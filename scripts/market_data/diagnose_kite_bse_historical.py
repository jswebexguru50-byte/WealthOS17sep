#!/usr/bin/env python3
"""One delayed, single-call diagnostic for Kite BSE historical access."""
import csv, io, json, os, sqlite3, time
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[2]
for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1); os.environ.setdefault(k.strip(),v.strip())
with sqlite3.connect(f'file:{ROOT / "portfolio.db"}?mode=ro',uri=True) as db:
    token=db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()[0]
manifest=json.loads((ROOT/'data'/'market_data'/'tejhq_hf_10y'/'kite_bse_adjusted_backfill'/'manifest.json').read_text())
scrip=next(symbol for symbol,r in manifest['symbols'].items() if r.get('status')=='ERROR')
headers={'X-Kite-Version':'3','Authorization':f"token {os.environ['KITE_API_KEY']}:{token}"}
master=requests.get('https://api.kite.trade/instruments/BSE',headers=headers,timeout=60,verify=False); master.raise_for_status()
record=next(x for x in csv.DictReader(io.StringIO(master.text)) if x.get('instrument_type')=='EQ' and str(x.get('exchange_token'))==scrip)
time.sleep(10)
response=requests.get(f"https://api.kite.trade/instruments/historical/{record['instrument_token']}/day",
  params={'from':'2026-09-01','to':'2026-09-18'}, headers=headers, timeout=60,verify=False)
print(json.dumps({'status_code':response.status_code,'rate_limit_headers':{k:v for k,v in response.headers.items() if 'rate' in k.lower() or 'limit' in k.lower()},'response':response.text[:1000]},indent=2))
