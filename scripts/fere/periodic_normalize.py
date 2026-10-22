"""No-LLM periodic XBRL normalization and strict FERE publication gate."""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run_once() -> None:
    for name in ('normalize_nse_xbrl.py', 'publish_verified_metrics.py'):
        result = subprocess.run([sys.executable, str(HERE / name)],
                                cwd=HERE.parents[1], capture_output=True,
                                text=True, timeout=300)
        stamp = datetime.now(timezone.utc).isoformat()
        print(f'{stamp} {name} exit={result.returncode} {result.stdout.strip()}', flush=True)
        if result.returncode:
            print(result.stderr[-2000:], file=sys.stderr, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--interval-seconds', type=int, default=600)
    args = parser.parse_args()
    while True:
        run_once()
        time.sleep(max(60, args.interval_seconds))
