"""Priority source waterfall with a canonical fact cache. Stdlib only, no LLM, no hidden clock."""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

try:
    from canonical_fact_store import FactStore, iso, to_dt
except ImportError:  # imported as a package
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from canonical_fact_store import FactStore, iso, to_dt

PRIORITY = ("tradingview", "trendlyne_web", "trendlyne_mcp", "nse_bse", "screener", "manual",
            "upstox", "kite", "mca", "news", "screener_in")
DEFAULT_CONFIDENCE = {
    "trendlyne_mcp": 1.0, "tradingview": 0.9, "nse_bse": 0.8,
    "screener": 0.75, "screener_in": 0.75, "manual": 0.7,
    "trendlyne_web": 0.7, "upstox": 0.7, "kite": 0.7, "mca": 0.7, "news": 0.7,
}

# (substrings, ttl_seconds) rules, first match wins; field class -> TTL
DEFAULT_TTL_RULES = (
    (("price", "ltp", "close", "volume", "change_pct"), 300),                    # live
    (("pe", "pb", "market_cap", "mcap", "dividend_yield", "52w"), 6 * 3600),    # valuation
    (("promoter", "fii", "dii", "pledge", "shareholding"), 30 * 86400),         # quarterly
    (("revenue", "profit", "pat", "ebitda", "eps", "roce", "roe", "margin", "debt"), 30 * 86400),
    (("sector", "industry", "isin", "name", "incorporat", "cin"), 90 * 86400),  # static
)
DEFAULT_TTL = 86400


def detect_conflicts(symbol, field, val_a, src_a, val_b, src_b, threshold=0.20):
    """Return an auditable conflict record, or ``None`` when not comparable."""
    if val_a is None or val_b is None:
        return None
    try:
        a, b = float(val_a), float(val_b)
    except (TypeError, ValueError):
        return None
    diff = abs(a - b) / max(abs(a), abs(b), 1e-6)
    if diff <= threshold:
        return None
    return {'symbol': symbol, 'field': field, 'conflict': True,
            'diff_pct': round(diff * 100, 1), 'sources': [src_a, src_b]}


def _is_num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def trendlyne_adapter() -> Callable:
    """Thin adapter over trendlyne_bridge.fetch_batch; returns {} when the bridge is missing/unavailable."""
    def fn(symbols, fields):
        try:
            try:
                import trendlyne_bridge as tb
            except ImportError:
                from scripts.fundamental import trendlyne_bridge as tb
        except ImportError:
            return {}
        unavailable = getattr(tb, "BridgeUnavailable", None)
        try:
            return tb.fetch_batch(symbols, fields)
        except ImportError:
            return {}
        except Exception as e:
            if unavailable and isinstance(e, unavailable):
                return {}
            raise
    return fn


class SourceWaterfallEngine:
    def __init__(self, sources, store: Optional[FactStore] = None, clock: Optional[Callable[[], Any]] = None,
                 confidence: Optional[Dict[str, float]] = None, ttl_rules=DEFAULT_TTL_RULES,
                 default_ttl: int = DEFAULT_TTL, ttl_overrides: Optional[Dict[str, int]] = None,
                 tolerance: float = 0.10, batch_size: int = 200, server: str = 'http://localhost:3000'):
        self.db = sources if isinstance(sources, sqlite3.Connection) else None
        if self.db is not None:
            sources = {}
            store = FactStore(self.db)
            clock = lambda: datetime.now(timezone.utc)
        if store is None or clock is None:
            raise TypeError('store and clock are required unless the first argument is a sqlite connection')
        unknown = sorted(set(sources) - set(PRIORITY))
        if unknown:
            raise ValueError("unknown sources: %s" % unknown)
        self.order = [n for n in PRIORITY if n in sources]
        self.sources = dict(sources)
        self.store = store
        self.clock = clock
        self.confidence = {**DEFAULT_CONFIDENCE, **(confidence or {})}
        self.ttl_rules = ttl_rules
        self.default_ttl = default_ttl
        self.ttl_overrides = dict(ttl_overrides or {})
        self.tolerance = tolerance
        self.batch_size = batch_size
        self.server = server

    def get_field(self, symbol: str, field: str) -> tuple:
        """Return ``(value, source_name)`` for one field, or ``(None, None)``."""
        if self.db is not None:
            fact = self.store.get(symbol, field, self.clock())
            return (fact['value'], fact['source']) if fact is not None else (None, None)
        result = self.resolve([symbol], [field])
        value = result.get('values', {}).get(symbol, {}).get(field)
        meta = result.get('provenance', {}).get(symbol, {}).get(field) or {}
        return value, meta.get('source')

    def get_shareholding(self, symbols: list, enrich: bool = False) -> dict:
        """Resolve the canonical shareholding fields without synthetic values."""
        if self.db is not None:
            fields = ('promoter_pct', 'fii_pct', 'dii_pct', 'pledge_pct', 'inst_total_pct')
            result = {}
            for i in range(0, len(symbols), min(self.batch_size, 500)):
                batch = list(symbols[i:i + min(self.batch_size, 500)])
                if not batch:
                    continue
                ph = ','.join('?' * len(batch))
                try:
                    rows = self.db.execute(f"""SELECT symbol, promoter_pct, fii_pct, dii_pct,
                        pledge_pct, quarter_label, as_of_date FROM v_latest_shareholding
                        WHERE symbol IN ({ph})""", batch).fetchall()
                except sqlite3.Error:
                    rows = []
                for row in rows:
                    result[row[0]] = {'promoter_pct': row[1], 'fii_pct': row[2], 'dii_pct': row[3],
                                      'pledge_pct': row[4], 'sh_quarter': row[5], 'sh_date': row[6]}
            for symbol, values in result.items():
                history = self.db.execute("""SELECT fii_pct, dii_pct FROM HistoricalShareholdingPattern
                    WHERE symbol = ? ORDER BY as_of_date DESC LIMIT 4""", (symbol,)).fetchall()
                if len(history) == 4 and all(r[0] is not None and r[1] is not None for r in history):
                    values['inst_history'] = [r[0] + r[1] for r in history]
            missing = [s for s in symbols if s not in result]
            cached = self.store.get_many(missing, fields, self.clock())
            for symbol in missing:
                values = {field: cached[(symbol, field)]['value']
                          for field in fields if (symbol, field) in cached}
                if values:
                    values['sh_quarter'] = 'canonical_fact_store'
                    result[symbol] = values
            if enrich:
                try:
                    import trendlyne_bridge as bridge
                    fetched = bridge.fetch_and_store(self.db, [s for s in symbols if s not in result], list(fields), server=self.server)
                    for symbol, values in fetched.items():
                        clean = {key: value for key, value in values.items() if key in fields and value is not None}
                        if clean:
                            clean['sh_quarter'] = 'trendlyne_mcp'
                            result[symbol] = clean
                except Exception:
                    pass
            return result
        fields = ['promoter_pct', 'fii_pct', 'dii_pct', 'pledge_pct', 'inst_total_pct']
        # ``enrich`` is intentionally a routing hint only; callers decide which
        # live source is registered, keeping this class free of network I/O.
        return self.resolve(symbols, fields, verify=True).get('values', {})

    def put_field(self, symbol, field, value, source, confidence, ttl_days=30):
        """Persist one non-null fact through the confidence-guarded store."""
        if value is None:
            return False
        self.store.put_many([{'symbol': symbol, 'field': field, 'value': value,
                              'source': source, 'confidence': confidence,
                              'fetched_at': self.clock(),
                              'ttl_seconds': ttl_days * 86400}])
        return True

    def record_conflict(self, conflict: Optional[dict]):
        """Persist a detected conflict when the v17 table is available."""
        connection = self.db or getattr(self.store, 'conn', None)
        if conflict is None or connection is None:
            return False
        exists = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_conflicts'").fetchone()
        if not exists:
            raise RuntimeError('data_conflicts is unavailable; apply migration 17 before recording conflicts')
        connection.execute("""INSERT INTO data_conflicts
            (symbol, field, source_a, source_b, diff_pct, detected_at) VALUES (?,?,?,?,?,?)""",
            (conflict['symbol'], conflict['field'], conflict['sources'][0], conflict['sources'][1],
             conflict['diff_pct'], iso(self.clock())))
        connection.commit()
        return True

    def record_external_conflicts(self, symbol: str, values: dict,
                                  source: str = 'tradingview') -> int:
        """Compare supplied evidence with fresh Trendlyne CFS facts.

        Only comparable, non-null values are written.  This is deliberately
        append-only: each observed disagreement retains its own timestamp.
        """
        if not values:
            return 0
        aliases = {
            'roce': ('roce', 'roce_fy', 'roce_ttm'),
            'roe': ('roe', 'roe_fy', 'roe_ttm'),
            'promoter_pct': ('promoter_pct',),
            'pledge_pct': ('pledge_pct',),
            'fii_pct': ('fii_pct',),
            'dii_pct': ('dii_pct',),
        }
        persisted = 0
        for field, keys in aliases.items():
            external = next((values.get(key) for key in keys if values.get(key) is not None), None)
            cached = self.store.get(symbol, field, self.clock())
            if cached is None or cached.get('source') != 'trendlyne_mcp':
                continue
            conflict = detect_conflicts(symbol, field, external, source,
                                        cached.get('value'), cached.get('source'), self.tolerance)
            if self.record_conflict(conflict):
                persisted += 1
        return persisted

    def ttl_for(self, field: str) -> int:
        if field in self.ttl_overrides:
            return self.ttl_overrides[field]
        lf = field.lower()
        for keys, ttl in self.ttl_rules:
            if any(k in lf for k in keys):
                return ttl
        return self.default_ttl

    def _call(self, name: str, pairs, calls: List[dict]) -> Dict[Tuple[str, str], dict]:
        """One batched call per chunk of symbols; returns hits restricted to `pairs`."""
        wanted = set(pairs)
        syms = sorted({p[0] for p in wanted})
        hits: Dict[Tuple[str, str], dict] = {}
        for i in range(0, len(syms), self.batch_size):
            sc = syms[i:i + self.batch_size]
            scs = set(sc)
            fl = sorted({p[1] for p in wanted if p[0] in scs})
            entry = {"source": name, "symbols": len(sc), "fields": len(fl)}
            try:
                res = self.sources[name](list(sc), list(fl)) or {}
            except Exception as e:  # a failing source must not abort the waterfall
                entry["error"] = "%s: %s" % (type(e).__name__, e)
                calls.append(entry)
                continue
            calls.append(entry)
            for s in sc:
                for f in fl:
                    cell = (res.get(s) or {}).get(f)
                    if (s, f) in wanted and cell and cell.get("value") is not None:
                        hits[(s, f)] = cell
        return hits

    def resolve(self, symbols: Iterable[str], fields: Iterable[str], verify: bool = False) -> Dict[str, Any]:
        now = to_dt(self.clock())
        syms = sorted(set(symbols))
        flds = sorted(set(fields))
        values: Dict[str, Dict[str, Any]] = {}
        prov: Dict[str, Dict[str, dict]] = {}
        calls: List[dict] = []
        conflicts: List[dict] = []

        def record(s, f, v, meta):
            values.setdefault(s, {})[f] = v
            prov.setdefault(s, {})[f] = meta

        cached = self.store.get_many(syms, flds, now)
        for (s, f), fact in sorted(cached.items()):
            record(s, f, fact["value"], {"source": fact["source"], "confidence": fact["confidence"],
                                         "fetched_at": fact["fetched_at"], "from_cache": True})
        pending = {(s, f) for s in syms for f in flds if (s, f) not in cached}
        to_persist = []
        for idx, name in enumerate(self.order):
            if not pending:
                break
            hits = self._call(name, sorted(pending), calls)
            nxt = self.order[idx + 1] if idx + 1 < len(self.order) else None
            check: Dict[Tuple[str, str], dict] = {}
            if verify and nxt:
                num = sorted(p for p, c in hits.items() if _is_num(c["value"]))
                if num:
                    check = self._call(nxt, num, calls)
            for (s, f), cell in sorted(hits.items()):
                conf = self.confidence[name]
                record(s, f, cell["value"], {"source": name, "confidence": conf, "as_of": cell.get("as_of"),
                                             "fetched_at": iso(now), "from_cache": False})
                to_persist.append({"symbol": s, "field": f, "value": cell["value"], "source": name,
                                   "confidence": conf, "fetched_at": now, "ttl_seconds": self.ttl_for(f)})
                other = check.get((s, f))
                if other and _is_num(other["value"]):
                    a, b = cell["value"], other["value"]
                    den = max(abs(a), abs(b))
                    diff = abs(a - b) / den if den else 0.0
                    if diff > self.tolerance:
                        conflict = {"symbol": s, "field": f, "source": name, "value": a,
                                    "other_source": nxt, "other_value": b, "rel_diff": diff}
                        conflicts.append(conflict)
                        self.record_conflict(detect_conflicts(s, f, a, name, b, nxt, self.tolerance))
                pending.discard((s, f))
        self.store.put_many(to_persist)
        conflicts.sort(key=lambda c: (c["symbol"], c["field"]))
        by_source: Dict[str, int] = {}
        for c in calls:
            by_source[c["source"]] = by_source.get(c["source"], 0) + 1
        return {"values": values, "provenance": prov,
                "missing": [list(p) for p in sorted(pending)], "conflicts": conflicts,
                "calls_made": {"total": len(calls), "by_source": by_source, "log": calls}}


def tradingview_adapter(**kw) -> Callable:
    """Factory for the TradingView source; implementation lives in tv_source.py."""
    try:
        from tv_source import tradingview_adapter as _f
    except ImportError:
        from scripts.fundamental.tv_source import tradingview_adapter as _f
    return _f(**kw)
