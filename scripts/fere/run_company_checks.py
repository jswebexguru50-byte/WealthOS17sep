"""Run incremental FERE company checks with bounded company-level concurrency."""
from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from company_check import run_company_check
from official_company_sources import refresh_official_sources
from verified_filing_pipeline import PORTFOLIO


def update_job(job_id: str | None, status: str, stage: str, detail: str | None = None) -> None:
    if not job_id: return
    from verified_filing_pipeline import connect, now
    con = connect()
    con.execute('''CREATE TABLE IF NOT EXISTS company_refresh_job (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL,
      detail TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT)''')
    con.execute('''UPDATE company_refresh_job SET status=?,stage=?,detail=?,updated_at=?,
      completed_at=CASE WHEN ? IN ('COMPLETED','FAILED') THEN ? ELSE completed_at END WHERE id=?''',
      (status,stage,detail,now(),status,now(),job_id)); con.commit(); con.close()


def portfolio_symbols(mode: str) -> list[str]:
    con = sqlite3.connect(f'file:{PORTFOLIO.as_posix()}?mode=ro', uri=True)
    if mode == "holdings":
        rows = con.execute('''SELECT DISTINCT m.symbol FROM Holdings h JOIN MasterTickers m ON m.isin=h.isin
                              WHERE h.quantity>0 AND m.symbol IS NOT NULL''').fetchall()
    else:
        candidates = ("OpportunityEngineCandidates", "TechnicalShortlist", "OpportunityShortlist")
        table = next((t for t in candidates if con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone()), None)
        rows = con.execute(f'SELECT DISTINCT symbol FROM [{table}] WHERE symbol IS NOT NULL').fetchall() if table else []
    con.close(); return sorted({r[0].upper() for r in rows})


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--holdings', action='store_true')
    group.add_argument('--symbols')
    group.add_argument('--opportunity-shortlist', action='store_true')
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--refresh-source', action='store_true',
                        help='Pull official filings and normalize them before rebuilding cards.')
    parser.add_argument('--job-id', help='Refresh job identifier created by the API.')
    args = parser.parse_args()
    symbols = ([s.strip().upper() for s in args.symbols.split(',') if s.strip()] if args.symbols
               else portfolio_symbols('holdings' if args.holdings else 'opportunities'))
    workers = min(8, max(4, args.workers))
    if args.refresh_source and symbols:
        folder = Path(__file__).resolve().parent
        try:
            update_job(args.job_id, 'RUNNING', 'FINANCIAL_FILINGS')
            subprocess.run([sys.executable, str(folder / 'verified_filing_pipeline.py'), '--collect',
                            '--symbols', ','.join(symbols)], check=True)
            update_job(args.job_id, 'RUNNING', 'OFFICIAL_SHAREHOLDING_AND_EVENTS')
            refresh_official_sources(symbols)
            update_job(args.job_id, 'RUNNING', 'NORMALIZING_FACTS')
            subprocess.run([sys.executable, str(folder / 'normalize_nse_xbrl.py')], check=True)
        except Exception as exc:
            update_job(args.job_id, 'FAILED', 'SOURCE_REFRESH_FAILED', str(exc)); raise
    update_job(args.job_id, 'RUNNING', 'BUILDING_COMPANY_CARD')
    results = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(run_company_check, symbol, args.force): symbol for symbol in symbols}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                results.append({"symbol": symbol, "status": "ERROR", "error": str(exc)})
    summary = {"requested": len(symbols), "workers": workers,
               "processed": sum(r.get('run_status') == 'PROCESSED' for r in results),
               "skipped": sum(r.get('run_status') == 'SKIPPED_NO_NEW_INFORMATION' for r in results),
               "errors": sum(r.get('status') == 'ERROR' for r in results), "results": results}
    update_job(args.job_id, 'FAILED' if summary['errors'] else 'COMPLETED',
               'COMPANY_CARD_FAILED' if summary['errors'] else 'DONE',
               json.dumps({k: summary[k] for k in ('requested','processed','skipped','errors')}))
    print(json.dumps(summary, indent=2)); return 1 if summary['errors'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
