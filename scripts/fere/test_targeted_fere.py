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
