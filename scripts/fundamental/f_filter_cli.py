#!/usr/bin/env python3
"""Batch CLI over f_filter_engine.evaluate_f_filters.

stdin : JSON array of input dicts (see engine docstring)
stdout: JSON array of engine results, same length and order as the input.
One process spawn per batch; deterministic (sorted keys, no timestamps).
Percent points everywhere; null = unknown.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from f_filter_engine import evaluate_f_filters  # noqa: E402


def run_batch(items):
    if not isinstance(items, list):
        raise ValueError("stdin must be a JSON array of objects")
    return [evaluate_f_filters(i if isinstance(i, dict) else {}) for i in items]


def main():
    raw = sys.stdin.buffer.read().decode("utf-8")
    try:
        out = run_batch(json.loads(raw) if raw.strip() else [])
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"f_filter_cli error: {exc}\n")
        return 2
    sys.stdout.write(json.dumps(out, sort_keys=True, allow_nan=False))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
