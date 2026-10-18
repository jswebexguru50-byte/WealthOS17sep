"""Priority source waterfall with a canonical fact cache. Stdlib only, no LLM, no hidden clock."""
from __future__ import annotations

import os
import sys
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

try:
    from canonical_fact_store import FactStore, iso, to_dt
except ImportError:  # imported as a package
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from canonical_fact_store import FactStore, iso, to_dt

PRIORITY = ("trendlyne_mcp", "tradingview", "trendlyne_web", "upstox", "kite",
            "nse_bse", "mca", "news", "screener_in")

DEFAULT_CONFIDENCE = {n: round(1.0 - 0.1 * i, 2) for i, n in enumerate(PRIORITY)}

# (substrings, ttl_seconds) rules, first match wins; field class -> TTL
DEFAULT_TTL_RULES = (
    (("price", "ltp", "close", "volume", "change_pct"), 300),                    # live
    (("pe", "pb", "market_cap", "mcap", "dividend_yield", "52w"), 6 * 3600),    # valuation
    (("promoter", "fii", "dii", "pledge", "shareholding"), 30 * 86400),         # quarterly
    (("revenue", "profit", "pat", "ebitda", "eps", "roce", "roe", "margin", "debt"), 30 * 86400),
    (("sector", "industry", "isin", "name", "incorporat", "cin"), 90 * 86400),  # static
)
DEFAULT_TTL = 86400


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
    def __init__(self, sources: Dict[str, Callable], store: FactStore, clock: Callable[[], Any],
                 confidence: Optional[Dict[str, float]] = None, ttl_rules=DEFAULT_TTL_RULES,
                 default_ttl: int = DEFAULT_TTL, ttl_overrides: Optional[Dict[str, int]] = None,
                 tolerance: float = 0.10, batch_size: int = 200):
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
                        conflicts.append({"symbol": s, "field": f, "source": name, "value": a,
                                          "other_source": nxt, "other_value": b, "rel_diff": diff})
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
