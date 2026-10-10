import json, sqlite3, subprocess, sys
from pathlib import Path

def test_dry_run_reports_six(tmp_path):
    db=tmp_path/'fere.db'; c=sqlite3.connect(db)
    c.execute('create table universe (isin text, symbol text)')
    c.execute('create table verified_xbrl_fact (isin text)')
    c.execute('create table verified_metric (isin text)')
    c.execute('create table company_check_result (symbol text)')
    for i,s in enumerate(('YUKEN','BECTORFOOD','VMART','TATATECH','OPTIEMUS','ARROWGREEN')):
        c.execute('insert into universe values (?,?)',(f'I{i}',s))
    c.commit(); c.close()
    script=Path(__file__).parents[2]/'scripts'/'fere'/'run_targeted_fere.py'
    r=subprocess.run([sys.executable,str(script),'--db',str(db)],capture_output=True,text=True,check=True)
    payload=json.loads(r.stdout); assert payload['mode']=='dry-run'; assert payload['symbols']==['YUKEN','BECTORFOOD','VMART','TATATECH','OPTIEMUS','ARROWGREEN']

def test_rejects_portfolio_name(tmp_path):
    db=tmp_path/'portfolio.db'; sqlite3.connect(db).close()
    script=Path(__file__).parents[2]/'scripts'/'fere'/'run_targeted_fere.py'
    r=subprocess.run([sys.executable,str(script),'--db',str(db)],capture_output=True,text=True)
    assert r.returncode != 0 and 'portfolio' in (r.stderr+r.stdout).lower()

def test_reports_symbol_alias_without_substituting_isin(tmp_path):
    db=tmp_path/'fere.db'; c=sqlite3.connect(db)
    c.execute('create table universe (isin text, symbol text)')
    c.execute('create table verified_xbrl_fact (isin text, symbol text)')
    c.execute('insert into universe values (?,?)',('INE495P01020','BECTORFOOD'))
    c.execute('insert into verified_xbrl_fact values (?,?)',('INE495P01012','BECTORFOOD'))
    c.commit(); c.close()
    script=Path(__file__).parent/'run_targeted_fere.py'
    r=subprocess.run([sys.executable,str(script),'--db',str(db)],capture_output=True,text=True,check=True)
    row=next(x for x in json.loads(r.stdout)['before'] if x['symbol']=='BECTORFOOD')
    assert row['identity_resolution']['status']=='REVIEW_REQUIRED'
    assert row['identity_resolution']['canonical_isins']==['INE495P01020']
    assert row['identity_resolution']['observed_alias_isins']==['INE495P01012']

def test_status_file_is_atomic_and_readable_by_ui(tmp_path):
    db=tmp_path/'fere.db'; c=sqlite3.connect(db)
    c.execute('create table universe (isin text, symbol text)')
    c.execute('create table verified_xbrl_fact (isin text)')
    c.execute('create table verified_metric (isin text)')
    c.execute('create table company_check_result (symbol text)')
    c.execute('insert into universe values (?,?)',('I1','YUKEN'))
    c.commit(); c.close()
    status=tmp_path/'status.json'; script=Path(__file__).parent/'run_targeted_fere.py'
    r=subprocess.run([sys.executable,str(script),'--db',str(db),'--status-file',str(status)],capture_output=True,text=True,check=True)
    payload=json.loads(status.read_text())
    assert payload['job_state']=='completed'
    row=next(x for x in payload['symbols'] if x['symbol']=='YUKEN')
    assert row['state']=='completed'
    assert not (tmp_path/'status.json.tmp').exists()

def test_missing_database_emits_failed_status_snapshot(tmp_path):
    missing=tmp_path/'missing.db'; status=tmp_path/'status.json'; script=Path(__file__).parent/'run_targeted_fere.py'
    r=subprocess.run([sys.executable,str(script),'--db',str(missing),'--status-file',str(status)],capture_output=True,text=True)
    assert r.returncode==2
    payload=json.loads(status.read_text())
    assert payload['job_state']=='failed'
    assert payload['error_type']=='FileNotFoundError'
    assert all(row['state']=='failed' for row in payload['symbol_status'])
    assert json.loads(r.stdout)['error']==payload['error']
