"""Observable bounded FERE refresh for the six approved research symbols."""
from __future__ import annotations
import argparse,json,os,sqlite3,subprocess,sys,time
from pathlib import Path
APPROVED=("YUKEN","BECTORFOOD","VMART","TATATECH","OPTIEMUS","ARROWGREEN")
def stamp(): return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
def emit(payload,status_file=None):
    text=json.dumps(payload,indent=2)
    print(text,flush=True)
    if status_file:
        target=Path(status_file).expanduser().resolve(); target.parent.mkdir(parents=True,exist_ok=True)
        tmp=target.with_suffix(target.suffix+'.tmp'); tmp.write_text(text+'\n',encoding='utf-8'); os.replace(tmp,target)
def db_counts(db,symbols):
    if not db.exists(): raise FileNotFoundError(f"FERE database not found: {db}")
    con=sqlite3.connect(f"file:{db.as_posix()}?mode=ro",uri=True,timeout=5)
    try:
      def has(n): return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(n,)).fetchone() is not None
      if not has('universe'): raise RuntimeError("FERE database has no universe table")
      out=[]
      for symbol in symbols:
        isins=[r[0] for r in con.execute("SELECT isin FROM universe WHERE UPPER(symbol)=?",(symbol,)).fetchall() if r[0]]
        def count(table):
          if not has(table) or not isins:return 0
          marks=','.join('?'*len(isins)); return int(con.execute(f"SELECT COUNT(*) FROM [{table}] WHERE isin IN ({marks})",isins).fetchone()[0])
        aliases=[]
        if has('verified_xbrl_fact'):
          marks=','.join('?'*len(isins)) or "''"
          q=f"SELECT DISTINCT isin FROM verified_xbrl_fact WHERE UPPER(symbol)=? AND isin NOT IN ({marks}) ORDER BY isin" if isins else "SELECT DISTINCT isin FROM verified_xbrl_fact WHERE UPPER(symbol)=? ORDER BY isin"
          rows=con.execute(q,[symbol,*isins] if isins else [symbol]).fetchall(); aliases=[r[0] for r in rows if r[0]]
        out.append({'symbol':symbol,'isins':isins,'lineage_facts':count('verified_xbrl_fact'),'verified_metrics':count('verified_metric'),'metric_cards':count('company_check_result'),'identity_resolution':{'status':'CANONICAL' if not aliases else 'REVIEW_REQUIRED','canonical_isins':isins,'observed_alias_isins':aliases}})
      return out
    finally: con.close()
def main():
 p=argparse.ArgumentParser(); p.add_argument('--root',default=os.environ.get('WEALTHOS_ROOT')); p.add_argument('--db'); p.add_argument('--status-file'); p.add_argument('--write',action='store_true'); p.add_argument('--deep-evidence',action='store_true'); p.add_argument('--workers',type=int,default=3); a=p.parse_args()
 root=Path(a.root).expanduser().resolve() if a.root else Path(__file__).resolve().parents[2]; db=Path(a.db).expanduser().resolve() if a.db else root/'data/fere/verified_filings/fere_evidence.db'; portfolio=root/'portfolio.db'
 result={'symbols':list(APPROVED),'database':str(db),'mode':'write' if a.write else 'dry-run','status':'STARTED','started_at':stamp()}
 emit(result,a.status_file)
 try:
  if db==portfolio or db.name.lower()=='portfolio.db': raise PermissionError('REFUSED: portfolio database cannot be a FERE target')
  runner=root/'scripts/fere/run_company_checks.py'
  if a.write and not runner.exists(): raise FileNotFoundError(f'FERE runner missing under {root}')
  result['status']='INSPECTING'; result['before']=db_counts(db,APPROVED); emit({'event':'inspection_complete','status':'INSPECTING','before':result['before']},a.status_file)
  if a.write:
   cmd=[sys.executable,str(runner),'--symbols',','.join(APPROVED),'--workers',str(max(1,min(8,a.workers))),'--force','--refresh-source']+(['--deep-evidence'] if a.deep_evidence else [])
   result.update(status='RUNNING',command=' '.join(cmd)); proc=subprocess.run(cmd,cwd=root,text=True,capture_output=True); result.update(exit_code=proc.returncode,runner_stdout=proc.stdout[-12000:],runner_stderr=proc.stderr[-4000:],status='COMPLETED' if proc.returncode==0 else 'FAILED'); result['after']=db_counts(db,APPROVED)
  else: result['status']='DRY_RUN_COMPLETE'
  result['finished_at']=stamp(); emit(result,a.status_file); return 0 if result['status'] in ('DRY_RUN_COMPLETE','COMPLETED') else 1
 except Exception as e:
  result.update(status='FAILED',error_type=type(e).__name__,error=str(e),finished_at=stamp()); emit(result,a.status_file); return 2
if __name__=='__main__': raise SystemExit(main())
