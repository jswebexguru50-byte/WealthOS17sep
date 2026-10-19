"""Canonical fact store over the `canonical_fact_store` table (migration v16).

Stdlib only, deterministic: every time-dependent call takes an explicit `now`.
Values are stored as JSON text so numbers/strings round-trip with their type.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional, Sequence, Tuple

CHUNK = 400  # per-axis chunk; keeps total bound params < SQLite's 999 default limit


def to_dt(x: Any) -> datetime:
    """Accept datetime, ISO string or epoch seconds; naive values are treated as UTC."""
    if isinstance(x, datetime):
        d = x
    elif isinstance(x, (int, float)):
        d = datetime.fromtimestamp(x, tz=timezone.utc)
    else:
        s = str(x)
        d = datetime.fromisoformat(s[:-1] + "+00:00" if s.endswith("Z") else s)
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


def iso(x: Any) -> str:
    return to_dt(x).isoformat()


def _chunks(seq: Sequence, n: int):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def _row_to_fact(r) -> Dict[str, Any]:
    try:
        value = json.loads(r[2]) if r[2] is not None else None
    except (TypeError, ValueError):
        value = r[2]
    return {"symbol": r[0], "field": r[1], "value": value, "source": r[3],
            "confidence": r[4], "fetched_at": r[5], "ttl_seconds": r[6]}


def _expired(fact: Dict[str, Any], now: datetime) -> bool:
    try:
        exp = to_dt(fact["fetched_at"]) + timedelta(seconds=int(fact["ttl_seconds"] or 0))
    except (TypeError, ValueError):
        return True
    return now >= exp


class FactStore:
    def __init__(self, conn):
        self.conn = conn

    def get(self, symbol: str, field: str, now: Any) -> Optional[Dict[str, Any]]:
        r = self.conn.execute(
            "SELECT symbol, field, value, source, confidence, fetched_at, ttl_seconds "
            "FROM canonical_fact_store WHERE symbol=? AND field=?", (symbol, field)).fetchone()
        if r is None:
            return None
        f = _row_to_fact(r)
        return None if _expired(f, to_dt(now)) else f

    def get_many(self, symbols: Iterable[str], fields: Iterable[str], now: Any
                 ) -> Dict[Tuple[str, str], Dict[str, Any]]:
        """Fresh facts keyed by (symbol, field); chunked IN queries on both axes."""
        syms = sorted(set(symbols))
        flds = sorted(set(fields))
        nowd = to_dt(now)
        out: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for sc in _chunks(syms, CHUNK):
            for fc in _chunks(flds, CHUNK):
                q = ("SELECT symbol, field, value, source, confidence, fetched_at, ttl_seconds "
                     "FROM canonical_fact_store WHERE symbol IN (%s) AND field IN (%s)"
                     % (",".join("?" * len(sc)), ",".join("?" * len(fc))))
                for r in self.conn.execute(q, (*sc, *fc)):
                    f = _row_to_fact(r)
                    if not _expired(f, nowd):
                        out[(f["symbol"], f["field"])] = f
        return out

    def put_many(self, facts: Iterable[Dict[str, Any]]) -> int:
        """Upsert in one transaction only when confidence strictly increases.

        Expiry controls read freshness; it never weakens evidence precedence.
        ``None`` is an unknown value and is therefore not a storable fact.
        """
        facts = list(facts)
        facts = [f for f in facts if f.get("value") is not None]
        if not facts:
            return 0
        existing: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for sc in _chunks(sorted({f["symbol"] for f in facts}), CHUNK):
            q = ("SELECT symbol, field, value, source, confidence, fetched_at, ttl_seconds "
                 "FROM canonical_fact_store WHERE symbol IN (%s)" % ",".join("?" * len(sc)))
            for r in self.conn.execute(q, tuple(sc)):
                f = _row_to_fact(r)
                existing[(f["symbol"], f["field"])] = f
        final: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for f in facts:  # later facts in the batch compete with earlier ones via `existing`
            k = (f["symbol"], f["field"])
            fetched = iso(f["fetched_at"])
            cur = existing.get(k)
            if cur is not None and float(f["confidence"]) <= float(cur["confidence"] or 0.0):
                continue
            new = {"symbol": k[0], "field": k[1], "value": f["value"], "source": f["source"],
                   "confidence": float(f["confidence"]), "fetched_at": fetched,
                   "ttl_seconds": int(f["ttl_seconds"])}
            existing[k] = new
            final[k] = new
        if not final:
            return 0
        with self.conn:  # single transaction
            self.conn.executemany(
                "INSERT OR REPLACE INTO canonical_fact_store "
                "(symbol, field, value, source, confidence, fetched_at, ttl_seconds) VALUES (?,?,?,?,?,?,?)",
                [(r["symbol"], r["field"], json.dumps(r["value"]), r["source"], r["confidence"],
                  r["fetched_at"], r["ttl_seconds"]) for _, r in sorted(final.items())])
        return len(final)
