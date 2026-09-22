#!/usr/bin/env python3
"""Non-LLM resumable Kite BSE adjusted-daily OHLCV backfill."""
from __future__ import annotations
import csv, datetime as dt, io, json, os, sqlite3, time
from pathlib import Path
import pandas as pd
import requests

ROOT=Path(__file__).resolve().parents[2]
STORE=ROOT/'data'/'market_data'/'tejhq_hf_10y'
OUT=STORE/'kite_bse_adjusted_backfill'
START=dt.date(2016,9,22); END=dt.date.today()

def env():
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1); os.environ.setdefault(k.strip(),v.strip())

def token():
    with sqlite3.connect(f'file:{ROOT / "portfolio.db"}?mode=ro',uri=True) as db:
        row=db.execute("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").fetchone()
    if not row or not row[0]: raise RuntimeError('Kite access token unavailable; complete daily Kite login.')
    return row[0]

def chunks():
    cursor=END
    while cursor>=START:
        older=max(START,cursor-dt.timedelta(days=1800)); yield older,cursor; cursor=older-dt.timedelta(days=1)

def main():
    env(); OUT.mkdir(parents=True,exist_ok=True)
    s=requests.Session(); s.headers.update({'X-Kite-Version':'3','Authorization':f"token {os.environ.get('KITE_API_KEY','')}:{token()}"})
    r=s.get('https://api.kite.trade/instruments/BSE',timeout=60,verify=False); r.raise_for_status()
    instruments={x['tradingsymbol'].upper():x for x in csv.DictReader(io.StringIO(r.text)) if x.get('instrument_type')=='EQ'}
    with sqlite3.connect(f'file:{ROOT / "portfolio.db"}?mode=ro',uri=True) as db:
        active=db.execute("""SELECT upper(symbol), isin, upstox_key_bse FROM MasterTickers
          WHERE exchange='BSE' AND status='ACTIVE' AND upstox_key_bse IS NOT NULL ORDER BY upper(symbol)""").fetchall()
    manifest_path=OUT/'manifest.json'; manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'source':'KITE_CONNECT_BSE','adjustment':'KITE_CORPORATE_ACTION_ADJUSTED','symbols':{}}
    for symbol,isin,key in active:
        rec=manifest['symbols'].get(symbol,{})
        dest=OUT/'candles'/f'symbol={symbol}'/'part-0.parquet'
        if rec.get('status')=='COMPLETE' and dest.exists(): continue
        inst=instruments.get(symbol)
        if not inst:
            manifest['symbols'][symbol]={'status':'NO_CURRENT_KITE_BSE_INSTRUMENT','isin':isin,'upstox_key_bse':key}; manifest_path.write_text(json.dumps(manifest,indent=2)); continue
        try:
            rows=[]
            for begin,end in chunks():
                url=f"https://api.kite.trade/instruments/historical/{inst['instrument_token']}/day"
                rr=s.get(url,params={'from':str(begin),'to':str(end)},timeout=60,verify=False)
                rr.raise_for_status(); time.sleep(.38)
                for c in rr.json().get('data',{}).get('candles',[]):
                    rows.append({'trade_date':c[0][:10],'symbol':symbol,'isin':isin,'upstox_key_nse':None,'upstox_key_bse':key,'kite_instrument_token':int(inst['instrument_token']),'open_adjusted':float(c[1]),'high_adjusted':float(c[2]),'low_adjusted':float(c[3]),'close_adjusted':float(c[4]),'volume_raw':int(c[5]),'data_source':'KITE_BSE_CORPORATE_ACTION_ADJUSTED'})
            if not rows: raise RuntimeError('Kite returned no BSE daily candles')
            df=pd.DataFrame(rows).drop_duplicates(['symbol','trade_date']).sort_values('trade_date'); dest.parent.mkdir(parents=True,exist_ok=True)
            temp=dest.with_suffix('.parquet.partial'); df.to_parquet(temp,index=False,compression='zstd'); temp.replace(dest)
            manifest['symbols'][symbol]={'status':'COMPLETE','isin':isin,'upstox_key_bse':key,'kite_instrument_token':inst['instrument_token'],'rows':len(df),'first_trade_date':df.trade_date.min(),'last_trade_date':df.trade_date.max(),'path':str(dest.relative_to(STORE))}
        except Exception as e:
            manifest['symbols'][symbol]={'status':'ERROR','isin':isin,'upstox_key_bse':key,'error':str(e)[:500]}
        manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({s:sum(1 for r in manifest['symbols'].values() if r.get('status')==s) for s in sorted({r.get('status') for r in manifest['symbols'].values()})},indent=2))
if __name__=='__main__': main()
