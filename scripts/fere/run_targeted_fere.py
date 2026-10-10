"""Run a bounded FERE refresh for the six approved research symbols.

The FERE evidence database is the only writable target.  The portfolio database is
opened only by the existing source pipeline and is never passed as an output path.
Dry-run is the default and reports current lineage/card coverage.
"""
from __future__ import annotations
import argparse, json, os, sqlite3, subprocess, sys
from pathlib import Path

APPROVED = ("YUKEN", "BECTORFOOD", "VMART", "TATATECH", "OPTIEMUS", "ARROWGREEN")

def db_counts(db: Path, symbols: tuple[str, ...]) -> list[dict]:
    if not db.exists(): raise FileNotFoundError(f"FERE database not found: {db}")
    con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    def has(name): return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None
    if not has('universe'): raise RuntimeError("FERE database has no universe table")
    out=[]
    for symbol in symbols:
        rows=con.execute("SELECT isin FROM universe WHERE UPPER(symbol)=?", (symbol,)).fetchall()
        isins=[r[0] for r in rows if r[0]]
        def count(table):
            if not has(table) or not isins: return 0
            marks=','.join('?'*len(isins))
            return int(con.execute(f"SELECT COUNT(*) FROM [{table}] WHERE isin IN ({marks})", isins).fetchone()[0])
        out.append({'symbol':symbol,'isins':isins,'lineage_facts':count('verified_xbrl_fact'),
                    'verified_metrics':count('verified_metric'),'metric_cards':count('company_check_result')})
    con.close(); return out

def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument('--root', default=os.environ.get('WEALTHOS_ROOT'), help='canonical WealthOS root')
    p.add_argument('--db', help='FERE DB override (tests/rehearsal only)')
    p.add_argument('--write', action='store_true', help='run official refresh and rebuild cards')
    p.add_argument('--deep-evidence', action='store_true')
    p.add_argument('--workers', type=int, default=3)
    args=p.parse_args()
    root=Path(args.root).expanduser().resolve() if args.root else Path(__file__).resolve().parents[2]
    db=Path(args.db).expanduser().resolve() if args.db else root/'data'/'fere'/'verified_filings'/'fere_evidence.db'
    portfolio=root/'portfolio.db'
    if db == portfolio or db.name.lower() == 'portfolio.db': raise SystemExit('REFUSED: portfolio database cannot be a FERE target')
    if args.write and not (root/'scripts'/'fere'/'run_company_checks.py').exists(): raise SystemExit(f'FERE runner missing under {root}')
    before=db_counts(db, APPROVED)
    result={'symbols':list(APPROVED),'database':str(db),'mode':'write' if args.write else 'dry-run','before':before}
    if args.write:
        cmd=[sys.executable,str(root/'scripts'/'fere'/'run_company_checks.py'),'--symbols',','.join(APPROVED),'--workers',str(max(1,min(8,args.workers))),'--force','--refresh-source']
        if args.deep_evidence: cmd.append('--deep-evidence')
        proc=subprocess.run(cmd,cwd=root,text=True,capture_output=True)
        result['exit_code']=proc.returncode; result['runner_stdout']=proc.stdout[-12000:]; result['runner_stderr']=proc.stderr[-4000:]
        result['after']=db_counts(db, APPROVED)
        print(json.dumps(result,indent=2)); return proc.returncode
    print(json.dumps(result,indent=2)); return 0
if __name__=='__main__': raise SystemExit(main())
