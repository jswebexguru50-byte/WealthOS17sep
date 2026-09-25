"""Restart the resumable overnight fetcher until every deterministic batch completes."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from verified_filing_pipeline import DB_PATH, ROOT

PROGRESS = DB_PATH.parent / 'overnight_progress.json'
WATCHDOG_LOG = DB_PATH.parent / 'overnight_watchdog.log'
LOCK_FILE = DB_PATH.parent / 'overnight_watchdog.lock'


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def complete() -> bool:
    try: return json.loads(PROGRESS.read_text(encoding='utf-8')).get('status') == 'COMPLETED'
    except Exception: return False


def main() -> int:
    # Keep one watchdog per machine, including when a scheduled task is
    # accidentally started twice. Windows releases the byte lock on exit.
    lock = LOCK_FILE.open('a+b')
    if os.name == 'nt':
        import msvcrt
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            lock.close()
            return 0
    runner = Path(__file__).with_name('run_overnight_fetch.py')
    try:
        with WATCHDOG_LOG.open('a', encoding='utf-8') as log:
            while not complete():
                log.write(f'{now()} starting/resuming deterministic fetcher\n'); log.flush()
                result = subprocess.run([sys.executable, str(runner), '--batch-size', '25',
                                         '--batch-timeout-minutes', '45'], cwd=ROOT,
                                        stdout=log, stderr=subprocess.STDOUT, check=False)
                log.write(f'{now()} fetcher exit={result.returncode}\n'); log.flush()
                if not complete(): time.sleep(60)
        return 0
    finally:
        lock.close()


if __name__ == '__main__':
    raise SystemExit(main())
