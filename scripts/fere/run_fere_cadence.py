"""Daily coordinator: new FERE companies now; full official refresh every N days."""
from __future__ import annotations
import argparse, json, os, sqlite3, subprocess, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from verified_filing_pipeline import DB_PATH, ROOT

STATE = DB_PATH.parent / 'fere_cadence_state.json'
PROGRESS = DB_PATH.parent / 'fere_cadence_progress.json'
LOG = DB_PATH.parent / 'fere_cadence.log'
LOCK = DB_PATH.parent / 'fere_cadence.lock'

def now(): return datetime.now(timezone.utc).isoformat()
def load(path, fallback):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError): return fallback
def save(path, value):
    temp = path.with_suffix('.tmp'); temp.write_text(json.dumps(value, indent=2), encoding='utf-8'); os.replace(temp, path)
def active_symbols():
    con = sqlite3.connect(DB_PATH)
    rows = con.execute("SELECT symbol FROM universe WHERE UPPER(COALESCE(exchange,'NSE'))='NSE' AND UPPER(COALESCE(status,''))='ACTIVE' ORDER BY symbol").fetchall()
    con.close(); return [str(row[0]).upper() for row in rows if row[0]]
def card_symbols():
    con = sqlite3.connect(DB_PATH); rows = con.execute('SELECT symbol FROM company_check_result').fetchall(); con.close()
    return {str(row[0]).upper() for row in rows if row[0]}
def is_due(last, days):
    try: return datetime.now(timezone.utc) >= datetime.fromisoformat(last) + timedelta(days=days)
    except (TypeError, ValueError): return True
def lock_file():
    fh = LOCK.open('a+b')
    if os.name == 'nt':
        import msvcrt
        try: fh.seek(0); msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError: fh.close(); return None
    return fh

def run_batches(symbols, args, full, progress):
    runner = Path(__file__).with_name('run_company_checks.py')
    with LOG.open('a', encoding='utf-8') as log:
        for index in range(0, len(symbols), args.batch_size):
            batch = symbols[index:index + args.batch_size]
            progress.update(status='RUNNING', current_batch=index // args.batch_size + 1,
                total_batches=(len(symbols) + args.batch_size - 1) // args.batch_size,
                current_symbols=batch, updated_at=now())
            save(PROGRESS, progress)
            command = [sys.executable, str(runner), '--symbols', ','.join(batch), '--workers', '6', '--force', '--refresh-source']
            if not full: command.append('--fast-card')
            try: result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=args.batch_timeout_minutes * 60, check=False)
            except subprocess.TimeoutExpired:
                progress.setdefault('failed_batches', []).append({'symbols':batch, 'reason':'TIMEOUT'}); save(PROGRESS, progress); return False
            if result.returncode:
                progress.setdefault('failed_batches', []).append({'symbols':batch, 'reason':f'EXIT_{result.returncode}'}); save(PROGRESS, progress); return False
            progress['completed_symbols'] += len(batch); save(PROGRESS, progress); time.sleep(1)
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--interval-days', type=int, default=15)
    parser.add_argument('--batch-size', type=int, default=25)
    parser.add_argument('--batch-timeout-minutes', type=int, default=45)
    parser.add_argument('--force-full-refresh', action='store_true')
    args = parser.parse_args()
    if args.interval_days < 1: raise ValueError('interval-days must be at least 1')
    fh = lock_file()
    if not fh: return 0
    try:
        state = load(STATE, {}); universe = active_symbols(); new = [s for s in universe if s not in card_symbols()]
        full = args.force_full_refresh or is_due(state.get('last_full_refresh_completed_at'), args.interval_days)
        targets = universe if full else new
        progress = {'started_at':now(), 'updated_at':now(), 'status':'NO_WORK', 'interval_days':args.interval_days,
            'active_universe':len(universe), 'new_companies_detected':len(new), 'full_refresh_due':full,
            'requested_symbols':len(targets), 'completed_symbols':0, 'failed_batches':[]}
        save(PROGRESS, progress)
        ok = True if not targets else run_batches(targets, args, full, progress)
        progress.update(status='COMPLETED' if ok else 'COMPLETED_WITH_FAILURES', completed_at=now()); save(PROGRESS, progress)
        if ok:
            state.update(last_discovery_at=now(), known_active_symbols=universe)
            if full: state['last_full_refresh_completed_at'] = now()
            save(STATE, state)
        return 0 if ok else 1
    finally: fh.close()
if __name__ == '__main__': raise SystemExit(main())
