"""Stage NSE/BSE shareholding rows without overwriting existing evidence.

The downloader is intentionally separate: this module accepts already fetched
rows and only performs the deterministic, idempotent database write.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date
from typing import Iterable, Mapping


def ingest_rows(db: sqlite3.Connection, rows: Iterable[Mapping]) -> int:
    """Insert authoritative SHP rows; return the number of newly inserted rows."""
    inserted = 0
    with db:
        for row in rows:
            symbol = row.get('symbol')
            as_of = row.get('as_of_date')
            if symbol is None or as_of is None:
                continue
            exists = db.execute(
                "SELECT 1 FROM HistoricalShareholdingPattern WHERE symbol = ? AND as_of_date = ? LIMIT 1",
                (symbol, as_of),
            ).fetchone()
            if exists:
                continue
            cur = db.execute(
                """INSERT OR IGNORE INTO HistoricalShareholdingPattern
                   (symbol, promoter_pct, fii_pct, dii_pct, pledge_pct,
                    quarter_label, as_of_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (symbol, row.get('promoter_pct'), row.get('fii_pct'),
                 row.get('dii_pct'), row.get('pledge_pct'),
                 row.get('quarter_label'), as_of),
            )
            inserted += cur.rowcount
    return inserted


def ingest_file(db: sqlite3.Connection, path: str) -> int:
    """Read a JSON array of normalized rows and ingest it."""
    with open(path, encoding='utf-8') as handle:
        rows = json.load(handle)
    if not isinstance(rows, list):
        raise ValueError('shareholding input must be a JSON array')
    return ingest_rows(db, rows)


def ingest_stage_file(db: sqlite3.Connection, path: str) -> int:
    """Promote normalized NSE/BSE XBRL stage rows into the scan table.

    The upstream ``nse_bse_shareholding.py`` fetches and parses official filings.
    This bounded promotion only accepts stage records with a real quarter end;
    it never guesses a date or overwrites an existing symbol/date evidence row.
    """
    with open(path, encoding='utf-8') as handle:
        stage = [json.loads(line) for line in handle if line.strip()]
    rows = []
    for record in stage:
        as_of = record.get('quarter_end')
        if record.get('symbol') is None or as_of is None:
            continue
        try:
            quarter = date.fromisoformat(as_of)
        except (TypeError, ValueError):
            continue
        rows.append({
            'symbol': record.get('symbol'), 'as_of_date': as_of,
            'quarter_label': quarter.strftime('%b %Y'),
            'promoter_pct': record.get('promoter_pct'),
            'fii_pct': record.get('fii_pct'), 'dii_pct': record.get('dii_pct'),
            # XBRL pledge is the authoritative supplied value; None stays None.
            'pledge_pct': record.get('pledge_pct'),
        })
    return ingest_rows(db, rows)
