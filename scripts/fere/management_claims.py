"""Human-reviewed management commitment ledger with deterministic candidate search."""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone

METRICS = ("revenue", "growth", "margin", "capacity", "capex", "commissioning",
           "debt reduction", "order book", "exports", "working capital",
           "acquisition", "project")
STATUSES = ("OPEN", "ON_TRACK", "ACHIEVED", "PARTIAL", "MISSED", "REVISED", "NOT_VERIFIABLE")


def ensure_schema(con: sqlite3.Connection) -> None:
    con.executescript('''
      CREATE TABLE IF NOT EXISTS management_claim_candidate (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        claim_date TEXT NOT NULL, source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL,
        evidence_text TEXT NOT NULL, detected_metric TEXT, detected_target REAL,
        detected_unit TEXT, detected_deadline TEXT, decision TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(decision IN ('PENDING','ACCEPT','EDIT','IGNORE')),
        UNIQUE(isin,source_sha256,evidence_text));
      CREATE TABLE IF NOT EXISTS management_commitment (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        claim_date TEXT NOT NULL, source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL,
        source_evidence TEXT NOT NULL, metric TEXT NOT NULL, target REAL,
        unit TEXT, deadline TEXT, status TEXT NOT NULL,
        actual_value REAL, actual_fact_ids TEXT, evaluated_at TEXT,
        UNIQUE(isin,source_sha256,source_evidence));
    ''')


def detect_candidates(text: str) -> list[dict]:
    sentences = re.split(r'(?<=[.!?])\s+|[\r\n]+', text)
    pattern = re.compile(r'\b(expect|target|guidance|aim|plan|commission|reach|reduce|increase)\w*\b', re.I)
    number = re.compile(r'(?:₹|rs\.?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(%|crore|cr|lakh|mw|gw|tonnes?|units?)?', re.I)
    results = []
    for sentence in sentences:
        lower = sentence.lower()
        metric = next((m for m in METRICS if m in lower), None)
        value = number.search(sentence)
        if metric and pattern.search(sentence) and value:
            results.append({"evidence_text": sentence.strip(), "metric": metric,
                            "target": float(value.group(1)), "unit": value.group(2),
                            "deadline": None})
    return results


def accept(con: sqlite3.Connection, candidate_id: int, edits: dict | None = None) -> int:
    ensure_schema(con)
    row = con.execute('SELECT isin,symbol,claim_date,source_url,source_sha256,evidence_text,detected_metric,detected_target,detected_unit,detected_deadline FROM management_claim_candidate WHERE id=?',
                      (candidate_id,)).fetchone()
    if not row:
        raise ValueError("Claim candidate not found")
    values = dict(zip(("isin","symbol","claim_date","source_url","source_sha256","source_evidence","metric","target","unit","deadline"), row))
    values.update(edits or {})
    if not values.get("metric"):
        raise ValueError("Accepted commitment requires a metric")
    cur = con.execute('''INSERT INTO management_commitment
      (isin,symbol,claim_date,source_url,source_sha256,source_evidence,metric,target,unit,deadline,status)
      VALUES(:isin,:symbol,:claim_date,:source_url,:source_sha256,:source_evidence,:metric,:target,:unit,:deadline,'OPEN')
      ON CONFLICT(isin,source_sha256,source_evidence) DO UPDATE SET metric=excluded.metric,target=excluded.target,
      unit=excluded.unit,deadline=excluded.deadline,status='OPEN' RETURNING id''', values)
    con.execute("UPDATE management_claim_candidate SET decision=? WHERE id=?", ('EDIT' if edits else 'ACCEPT', candidate_id))
    con.commit()
    return int(cur.fetchone()[0])


def due_commitments(con: sqlite3.Connection, isin: str, today: str | None = None) -> list[dict]:
    today = today or datetime.now(timezone.utc).date().isoformat()
    con.row_factory = sqlite3.Row
    return [dict(row) for row in con.execute("SELECT * FROM management_commitment WHERE isin=? AND deadline IS NOT NULL AND deadline<=? AND status IN ('OPEN','ON_TRACK','PARTIAL')", (isin, today))]
