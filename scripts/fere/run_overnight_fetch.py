"""Resumable, deterministic overnight FERE fetcher. No LLM calls or inferred values."""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from verified_filing_pipeline import DB_PATH, PORTFOLIO, ROOT
from generate_status_report import main as generate_status_report

STORE = DB_PATH.parent
PROGRESS = STORE / 'overnight_progress.json'
LOG = STORE / 'overnight_fetch.log'
VALID_SYMBOL = re.compile(r'^[A-Z0-9&-]{1,30}$')


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def eligible_holdings() -> list[str]:
    con = sqlite3.connect(PORTFOLIO)
    con.execute('ATTACH DATABASE ? AS fere', (str(DB_PATH),))
    rows = con.execute('''SELECT u.symbol,h.isin,
      SUM(COALESCE(NULLIF(h.current_value,0),h.quantity*h.ltp,h.total_cost)) AS value_inr
      FROM Holdings h JOIN fere.universe u ON u.isin=h.isin
      WHERE h.quantity>0 AND UPPER(COALESCE(h.currency,'INR'))='INR' AND h.isin LIKE 'INE%'
      GROUP BY u.symbol,h.isin ORDER BY value_inr DESC''').fetchall()
    con.close()
    return list(dict.fromkeys(str(row[0]) for row in rows
            if str(row[0]) == str(row[0]).upper() and VALID_SYMBOL.fullmatch(str(row[0]))))


def nifty500_symbols() -> list[str]:
    con = sqlite3.connect(DB_PATH)
    row = con.execute("SELECT priority_source FROM universe WHERE priority_source LIKE '%ind_nifty500list.csv%' LIMIT 1").fetchone()
    con.close()
    if not row or 'archive=' not in row[0]:
        raise RuntimeError('Official archived Nifty 500 constituent file is unavailable.')
    archive = Path(row[0].split('archive=', 1)[1])
    path = archive if archive.is_absolute() else ROOT / archive
    with path.open('r', encoding='utf-8-sig', newline='') as handle:
        symbols = [str(item.get('Symbol') or '').strip().upper() for item in csv.DictReader(handle)]
    return [symbol for symbol in symbols if VALID_SYMBOL.fullmatch(symbol)]


def remaining_nse_universe() -> list[str]:
    con = sqlite3.connect(DB_PATH)
    rows = con.execute('''SELECT symbol FROM universe
                          WHERE exchange='NSE' AND UPPER(COALESCE(status,''))='ACTIVE'
                            AND isin LIKE 'INE%' ORDER BY symbol''').fetchall()
    con.close()
    return [str(row[0]) for row in rows
            if str(row[0]) == str(row[0]).upper() and VALID_SYMBOL.fullmatch(str(row[0]))]


def load_progress(symbols: list[str], batch_size: int, deep_evidence: bool) -> dict:
    if PROGRESS.exists():
        try:
            saved = json.loads(PROGRESS.read_text(encoding='utf-8'))
            if (saved.get('batch_size') == batch_size and saved.get('symbols') == symbols
                    and saved.get('deep_evidence') == deep_evidence):
                return saved
        except Exception:
            pass
    return {'created_at': now(), 'updated_at': now(), 'batch_size': batch_size,
            'symbols': symbols, 'batches': {}, 'status': 'RUNNING'}


def save_progress(progress: dict) -> None:
    progress['updated_at'] = now()
    temporary = PROGRESS.with_suffix('.tmp')
    temporary.write_text(json.dumps(progress, indent=2), encoding='utf-8')
    temporary.replace(PROGRESS)


def verify_integrity(symbols: list[str]) -> dict:
    con = sqlite3.connect(DB_PATH)
    placeholders = ','.join('?' for _ in symbols)
    rows = con.execute(f'SELECT symbol,result_json FROM company_check_result WHERE symbol IN ({placeholders})', symbols).fetchall()
    con.close()
    cards = {row[0]: json.loads(row[1]) for row in rows}
    violations = [symbol for symbol, card in cards.items()
                  if card.get('synthetic_values') != 0 or card.get('ghost_sources') != 0]
    if violations:
        raise RuntimeError(f'Integrity failure for: {violations}')
    return {'cards': len(cards), 'missing_cards': sorted(set(symbols) - set(cards)),
            'synthetic_values': 0, 'ghost_sources': 0}


def already_processed(symbols: list[str]) -> set[str]:
    """Never re-fetch a symbol with a saved, validated FERE card.

    This batch collector is an enrichment backfill, not a periodic refresh.  A
    card remains complete across restarts and changed batch ordering unless a
    separate, explicit refresh operation requests it.
    """
    if not symbols:
        return set()
    con = sqlite3.connect(DB_PATH)
    placeholders = ','.join('?' for _ in symbols)
    rows = con.execute(f'''SELECT symbol,result_json FROM company_check_result
                           WHERE symbol IN ({placeholders})''', symbols).fetchall()
    con.close()
    completed = set()
    for symbol, result_json in rows:
        try:
            card = json.loads(result_json)
            if (card.get('symbol') == symbol
                    and card.get('status') in ('VERIFIED_PARTIAL', 'DATA_INSUFFICIENT')
                    and card.get('synthetic_values') == 0 and card.get('ghost_sources') == 0):
                completed.add(symbol)
        except (TypeError, ValueError):
            continue
    return completed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch-size', type=int, default=25)
    parser.add_argument('--batch-timeout-minutes', type=int, default=45)
    parser.add_argument('--deep-evidence', action='store_true')
    parser.add_argument('--plan-only', action='store_true')
    args = parser.parse_args()
    holdings = eligible_holdings(); nifty = nifty500_symbols(); universe = remaining_nse_universe()
    symbols = holdings + [symbol for symbol in nifty if symbol not in set(holdings)]
    selected = set(symbols); symbols += [symbol for symbol in universe if symbol not in selected]
    symbols = list(dict.fromkeys(symbols))
    progress = load_progress(symbols, args.batch_size, bool(args.deep_evidence))
    progress.update({'holdings_count': len(holdings), 'nifty500_count': len(nifty),
                     'full_nse_candidates': len(universe), 'unique_total': len(symbols),
                     'deep_evidence': bool(args.deep_evidence)})
    save_progress(progress)
    if args.plan_only:
        print(json.dumps({'holdings': len(holdings), 'nifty500': len(nifty), 'full_nse_candidates': len(universe), 'unique_symbols': len(symbols),
                          'batch_size': args.batch_size, 'batches': (len(symbols) + args.batch_size - 1) // args.batch_size,
                          'first_batch': symbols[:args.batch_size]}, indent=2))
        return 0
    runner = Path(__file__).with_name('run_company_checks.py')
    total_batches = (len(symbols) + args.batch_size - 1) // args.batch_size
    with LOG.open('a', encoding='utf-8') as log:
        log.write(f'\n{now()} start symbols={len(symbols)} batches={total_batches}\n'); log.flush()
        for index in range(total_batches):
            key = str(index + 1); prior = progress['batches'].get(key, {})
            if prior.get('status') == 'COMPLETED':
                continue
            batch = symbols[index * args.batch_size:(index + 1) * args.batch_size]
            previously_checked = already_processed(batch)
            pending = [symbol for symbol in batch if symbol not in previously_checked]
            started = time.monotonic()
            progress['batches'][key] = {'status': 'RUNNING', 'symbols': batch, 'started_at': now(),
                                        'reused_recent_cards': len(previously_checked)}
            save_progress(progress)
            try:
                if pending:
                    command = [sys.executable, str(runner), '--symbols', ','.join(pending), '--workers', '6',
                               '--force', '--refresh-source']
                    if args.deep_evidence: command.append('--deep-evidence')
                    result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                            timeout=args.batch_timeout_minutes * 60, check=False)
                    return_code = result.returncode
                else:
                    return_code = 0
                integrity = verify_integrity(batch)
                status = 'COMPLETED' if return_code == 0 and not integrity['missing_cards'] else 'FAILED'
                detail = {'return_code': return_code, 'fetched_symbols': len(pending),
                          'reused_recent_cards': len(previously_checked), **integrity}
            except subprocess.TimeoutExpired:
                status, detail = 'FAILED', {'error': 'BATCH_TIMEOUT'}
            except Exception as exc:
                status, detail = 'FAILED', {'error': str(exc)}
            progress['batches'][key].update({'status': status, 'completed_at': now(),
                                             'elapsed_seconds': round(time.monotonic() - started, 2),
                                             **detail})
            save_progress(progress); log.write(f'{now()} batch={key}/{total_batches} status={status} {detail}\n'); log.flush()
            try: generate_status_report()
            except Exception as exc:
                log.write(f'{now()} status-report warning={exc}\n'); log.flush()
    statuses = [item.get('status') for item in progress['batches'].values()]
    progress['status'] = 'COMPLETED' if len(statuses) == total_batches and all(s == 'COMPLETED' for s in statuses) else 'COMPLETED_WITH_FAILURES'
    save_progress(progress)
    try: generate_status_report()
    except Exception: pass
    return 0 if progress['status'] == 'COMPLETED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
