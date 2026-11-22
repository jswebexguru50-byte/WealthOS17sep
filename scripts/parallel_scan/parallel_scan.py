#!/usr/bin/env python3
"""Read an explicit scanner review ZIP and SQLite database into an isolated research report.

This early implementation does not calculate strategies, investment grades or orders.
The database is opened read-only; a run on a mutable DB is explicitly non-reproducible.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import html
import json
import math
import os
import sqlite3
import statistics
import tempfile
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

STRATEGIES = ('S1a','S2a','S3a','S4a','S4a1','S4b','S4b1','S5a')
FIELDS = ('roce_pct','roe_pct','sales_yoy_pct','cfo_to_ebitda_pct','debt_to_equity','interest_coverage','promoter_pct','pledged_pct','stock_pe','industry_pe')
FAMILY = {'S1a':'S1','S2a':'S2','S3a':'S3','S4a':'Gap','S4a1':'Gap','S4b':'Gap','S4b1':'Gap','S5a':'S5'}


def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()


def read_archive(path):
    matches={}; input_files={}; dates=set()
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if '_full_universe_90_' not in name or not name.endswith('.json'): continue
            raw=z.read(name); data=json.loads(raw)
            strategy=data.get('strategy_id')
            if strategy not in STRATEGIES: continue
            if strategy in matches: raise ValueError('multiple files for '+strategy)
            records=data.get('matches')
            if not isinstance(records,list) or data.get('match_count') != len(records):
                raise ValueError('invalid count: '+name)
            dates.add(data.get('scan_date')); matches[strategy]=records
            input_files[name]=hashlib.sha256(raw).hexdigest()
    # S1a is emitted in the vpa_three_leg file with its strategy ID; it may be empty.
    missing=set(STRATEGIES)-set(matches)
    if missing: raise ValueError('missing strategy files: '+', '.join(sorted(missing)))
    if len(dates)!=1 or None in dates: raise ValueError('inconsistent scan dates')
    return matches,input_files,dates.pop()


def normalize(strategy, row):
    symbol=row.get('Symbol',row.get('symbol')); signal_date=row.get('Signal_Date',row.get('as_of_date'))
    if not isinstance(symbol,str) or not signal_date: raise ValueError('missing signal identity')
    date.fromisoformat(signal_date)
    levels={}
    for name,keys in {'entry':('Entry','entry'),'stop':('Stop_Loss','stop'),'target':('Target_1','target_1')}.items():
        value=next((row[k] for k in keys if k in row),None)
        if not isinstance(value,(int,float)) or not math.isfinite(value) or value<=0: raise ValueError('invalid '+name)
        levels[name]=value
    event_id=hashlib.sha256((strategy+'|'+symbol+'|'+signal_date).encode()).hexdigest()[:24]
    return {'id':event_id,'symbol':symbol,'strategy':strategy,'family':FAMILY[strategy],
            'signal_date':signal_date,'evaluation_date':None,'known_at':None,
            'levels':levels,'original':row}


def observations(event,bars,expected_sessions):
    """Observed range touches only; no fill, timing, or execution inference."""
    bydate={b['date']:b for b in bars}; results=[]
    for d in expected_sessions:
        if d<=event['signal_date']: continue
        b=bydate.get(d)
        if b is None:
            results.append({'date':d,'state':'missing_bar'}); continue
        if any(b[k] is None or not math.isfinite(b[k]) for k in ('open','high','low','close')) or not (0<b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high']):
            results.append({'date':d,'state':'invalid_bar'}); continue
        result={'date':d,'state':'observed','source_status':b['status']}
        for name,level in event['levels'].items(): result[name+'_range_touch']=b['low']<=level<=b['high']
        result['open_below_stop']=b['open']<event['levels']['stop']
        result['open_above_target']=b['open']>event['levels']['target']
        result['intrabar_order']='unknown'
        results.append(result)
    return results


def build_report(archive,db_path,aliases_path=None):
    matches,hashes,scan_date=read_archive(archive)
    events=[normalize(s,r) for s in STRATEGIES for r in matches[s]]
    if len({e['id'] for e in events})!=len(events): raise ValueError('duplicate strategy/symbol/signal date')
    aliases={}
    if aliases_path:
        aliases=json.loads(Path(aliases_path).read_text()).get('aliases',{})
    uri=Path(db_path).resolve().as_uri()+'?mode=ro'
    conn=sqlite3.connect(uri,uri=True); conn.row_factory=sqlite3.Row
    conn.execute('PRAGMA query_only=ON'); conn.execute('BEGIN')
    try:
        # Market dates and terminal date are taken from the waterfall's actual window, not wall clock.
        with zipfile.ZipFile(archive) as z:
            wf=json.loads(z.read('reports/readiness/tier1_22d_dedup/waterfall_rules.json'))
        window=wf.get('window',{}); end=window.get('end')
        if not end: raise ValueError('waterfall window end missing')
        sessions=[r[0] for r in conn.execute('SELECT trade_date FROM DailyOHLCV_KiteAdj WHERE trade_date<=? GROUP BY trade_date HAVING count(*)>=1000 ORDER BY trade_date DESC LIMIT 22',(end,))][::-1]
        if len(sessions)!=window.get('sessions') or not sessions or sessions[-1]!=end or sessions[0]!=window.get('start'):
            raise ValueError('database calendar does not match archived scan window')
        fundamentals_cache={}
        trendlyne_cache={}
        for e in events:
            alias=aliases.get(e['symbol'],{}); price_symbol=alias.get('price_symbol',e['symbol']) if isinstance(alias,dict) else e['symbol']
            sql='SELECT trade_date AS date,open,high,low,close,volume,status FROM DailyOHLCV_KiteAdj WHERE symbol=? AND trade_date<=? ORDER BY trade_date DESC LIMIT 60'
            rows=[dict(x) for x in conn.execute(sql,(price_symbol,end))][::-1]
            e['price_symbol']=price_symbol; e['identity_mapping']='provided_alias' if price_symbol!=e['symbol'] else 'symbol_only_unverified'
            e['bars']=observations(e,rows,sessions)
            e['age_sessions']=sum(d>e['signal_date'] for d in sessions) if e['signal_date']>=sessions[0] else None
            values=[r['close']*r['volume'] for r in rows[-20:] if r['close'] is not None and r['volume'] is not None and r['close']>0 and r['volume']>=0]
            e['liquidity']={'median_close_x_volume':statistics.median(values) if values else None,'valid_sessions':len(values),'as_of':rows[-1]['date'] if rows else None,'label':'approximation; not exchange turnover'}
            symbol=e['symbol']
            if symbol not in fundamentals_cache:
                row=conn.execute('SELECT * FROM ScreenerFundamentals WHERE symbol=?',(symbol,)).fetchone()
                prov={r['field']:dict(r) for r in conn.execute('SELECT * FROM ScreenerFieldProvenance WHERE symbol=?',(symbol,))}
                if row is None:
                    fundamentals_cache[symbol]={'state':'missing','source':'ScreenerFundamentals','fields':{}}
                else:
                    data=dict(row); fields={}
                    for field in FIELDS:
                        info=prov.get(field,{})
                        fields[field]={'value':data.get(field),'state':'available' if data.get(field) is not None else 'missing',
                            'basis':info.get('basis') or 'unknown','source_run':info.get('source_run'),
                            'reporting_period':None,'published_at':None}
                    fundamentals_cache[symbol]={'state':'available','source':'ScreenerFundamentals',
                        'as_of':data.get('as_of'),'fields':fields,
                        'limitations':['Current snapshot, not as-of signal','Reporting periods and publication dates unverified','Trendlyne enrichment not connected']}
            e['fundamentals']=fundamentals_cache[symbol]
            if symbol not in trendlyne_cache:
                row=conn.execute('SELECT * FROM trendlyne_latest WHERE symbol=?',(symbol,)).fetchone()
                if row is None:
                    trendlyne_cache[symbol]={'state':'missing','source':'trendlyne_latest','fields':{}}
                else:
                    data=dict(row)
                    fields={k:{'value':v,'state':'available' if v is not None else 'missing',
                               'reporting_period':None,'basis':'unknown'}
                            for k,v in data.items() if k not in ('symbol','latest_snapshot_at')}
                    trendlyne_cache[symbol]={'state':'available','source':'trendlyne_latest',
                        'snapshot_at':data.get('latest_snapshot_at'),'fields':fields,
                        'limitations':['Cached current snapshot; not known at historical signal date',
                                       'Reporting period and basis unverified','Not a live MCP query']}
            e['trendlyne']=trendlyne_cache[symbol]
            e['price_quality']='not_verified'; e['review_status']='needs_data'
        return {'manifest':{'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),'scan_date':scan_date,'window_end':end,'archive_sha256':digest(archive),'source_files':hashes,'database_path':str(Path(db_path).resolve()),'snapshot_reproducibility':'unverified','price_table':'DailyOHLCV_KiteAdj','aliases_sha256':digest(aliases_path) if aliases_path else None},
                'counts':{'signals':len(events),'stocks':len({e['symbol'] for e in events}),'by_strategy':{k:len(v) for k,v in matches.items()}},'events':events}
    finally: conn.rollback(); conn.close()


def write_atomic(path,contents):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=str(path.parent),prefix='.parallel-')
    try:
        with os.fdopen(fd,'w',encoding='utf-8',newline='') as f:
            f.write(contents); f.flush(); os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)


def main():
    p=argparse.ArgumentParser(); p.add_argument('--archive',required=True); p.add_argument('--db',required=True); p.add_argument('--output',required=True); p.add_argument('--aliases')
    a=p.parse_args(); result=build_report(a.archive,a.db,a.aliases)
    dest=Path(a.output)
    if dest.exists(): raise SystemExit('Output already exists; choose a new run directory')
    dest.mkdir(parents=True)
    write_atomic(dest/'report.json',json.dumps(result,indent=2,allow_nan=False)+'\n')
    lines=['<!doctype html><meta charset="utf-8"><title>Parallel research scan</title>',
           '<style>body{font:14px system-ui;margin:2rem} table{border-collapse:collapse} td,th{padding:.45rem;border:1px solid #ccc} th{background:#eee;position:sticky;top:0} details{max-width:40rem} .warning{background:#fff1d1;padding:1rem}</style>',
           '<h1>Parallel research scan</h1><p class="warning">Research only. Levels touched do not establish fills. The price basis is unverified. Fundamentals are current snapshots, not signal-date facts. No recommendations are generated.</p>',
           f'<p>Signals: {result["counts"]["signals"]}; stocks: {result["counts"]["stocks"]}; scan end: {html.escape(result["manifest"]["window_end"])}</p>',
           '<label>Filter symbol or strategy <input id="search" type="search"></label> <span id="count"></span>',
           '<table><thead><tr><th>Symbol</th><th>Strategy</th><th>Signal date</th><th>Age in sessions</th><th>Entry</th><th>Stop</th><th>Target</th><th>Median close × volume</th><th>ROCE %</th><th>ROE %</th><th>Debt/equity</th><th>Fundamental as of</th><th>Details</th></tr></thead><tbody>']
    csv_rows=[]
    for e in result['events']:
        values=[e['symbol'],e['strategy'],e['signal_date'],e['age_sessions'],e['levels']['entry'],e['levels']['stop'],e['levels']['target'],e['liquidity']['median_close_x_volume'],e['fundamentals']['fields'].get('roce_pct',{}).get('value'),e['fundamentals']['fields'].get('roe_pct',{}).get('value'),e['fundamentals']['fields'].get('debt_to_equity',{}).get('value'),e['fundamentals'].get('as_of')]
        csv_rows.append(values)
        details=html.escape(json.dumps({'lifecycle':e['bars'],'fundamentals':e['fundamentals'],'trendlyne':e['trendlyne'],'identity':e['identity_mapping'],'price_quality':e['price_quality']},indent=2,allow_nan=False))
        lines.append('<tr>'+''.join('<td>'+html.escape(str(v if v is not None else 'unknown'))+'</td>' for v in values)+'<td><details><summary>Evidence</summary><pre>'+details+'</pre></details></td></tr>')
    lines.append("</tbody></table><script>const q=document.getElementById('search'),rows=[...document.querySelectorAll('tbody tr')],c=document.getElementById('count');function f(){let n=0;for(const r of rows){let v=(r.cells[0].textContent+' '+r.cells[1].textContent).toLowerCase().includes(q.value.toLowerCase());r.hidden=!v;if(v)n++}c.textContent=n+' of '+rows.length+' signals shown'}q.addEventListener('input',f);f()</script>")
    write_atomic(dest/'index.html','\n'.join(lines))
    import io
    out=io.StringIO(newline=''); writer=csv.writer(out); writer.writerow(['symbol','strategy','signal_date','age_sessions','entry','stop','target','median_close_times_volume','roce_percent','roe_percent','debt_to_equity','fundamental_as_of']); writer.writerows(csv_rows)
    write_atomic(dest/'signals.csv',out.getvalue())
    print(json.dumps(result['counts']))

if __name__=='__main__': main()
