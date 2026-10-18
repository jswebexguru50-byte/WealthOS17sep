"""TradingView source adapter for SourceWaterfallEngine. No LLM, no randomness, no synthetic values.

Contract: fn(symbols, fields) -> {symbol: {field: {'value','as_of','source':'tradingview'} | None}}
Unknown / unmapped / NaN -> None (never 0). Cache-first (tv_universe.json written by fetch_tv_universe.py);
live calls (tradingview-screener) happen only for cache misses, batched, with fixed backoff.
Optional libs (tradingview-ta, tvdatafeed) are lazy; absent -> their fields return None.
"""
from __future__ import annotations

import json
import math
import os
import time
from typing import Any, Callable, Dict, List, Optional

SOURCE = "tradingview"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# canonical field -> TV screener column (same columns as fetch_tv_universe.py), tv_universe.json key,
# and divisor for live raw values (cache stores crore; TV returns INR).
FIELD_MAP: Dict[str, Dict[str, Any]] = {
    "close":          {"col": "close", "cache": "close"},
    "price":          {"col": "close", "cache": "close"},
    "market_cap":     {"col": "market_cap_basic", "cache": "mkt_cap_cr", "div": 1e7},
    "pe":             {"col": "price_earnings_ttm", "cache": "pe"},
    "pb":             {"col": "price_to_book_fq", "cache": "pb"},
    "roe":            {"col": "return_on_equity", "cache": "roe"},
    "roa":            {"col": "return_on_assets", "cache": "roa"},
    "de_ratio":       {"col": "total_debt_to_equity_fq", "cache": "de_ratio"},
    "debt_to_equity": {"col": "total_debt_to_equity_fq", "cache": "de_ratio"},
    "opm":            {"col": "operating_margin_ttm", "cache": "opm"},
    "eps":            {"col": "earnings_per_share_diluted_ttm", "cache": "eps"},
    "dividend_yield": {"col": "dividends_yield_current", "cache": "div_yield"},
    "revenue":        {"col": "revenue_ttm", "cache": "revenue_cr", "div": 1e7},
    "net_income":     {"col": "net_income_ttm", "cache": "net_income_cr", "div": 1e7},
    "sector":         {"col": "sector", "cache": "sector", "text": True},
    "industry":       {"col": "industry", "cache": "industry", "text": True},
    "rsi":            {"col": "RSI", "cache": "rsi"},
    "rel_volume":     {"col": "relative_volume_10d_calc", "cache": "rel_vol"},
    "recommend_all":  {"col": "Recommend.All", "cache": "rec_all"},
    "perf_1w":        {"col": "Perf.W", "cache": "perf_w"},
    "perf_1m":        {"col": "Perf.1M", "cache": "perf_1m"},
    "perf_3m":        {"col": "Perf.3M", "cache": "perf_3m"},
    "high_52w":       {"col": "52 Week High", "cache": "high_52w"},
    "low_52w":        {"col": "52 Week Low", "cache": "low_52w"},
    "avg_volume":     {"col": "average_volume_10d_calc", "cache": "avg_vol"},
    "sma20":          {"col": "SMA20", "cache": "sma20"},
    "sma200":         {"col": "SMA200", "cache": "sma200"},
    # live only (not in tv_universe.json)
    "ema20":          {"col": "EMA20", "cache": None},
    "ema50":          {"col": "EMA50", "cache": None},
    "ema200":         {"col": "EMA200", "cache": None},
}
# Deliberately unmapped: TV screener has no equivalent (ROIC is not ROCE; no promoter/pledge/FII data).
UNSUPPORTED = ("roce", "promoter_pct", "pledge_pct", "fii_pct", "dii_pct")
TA_FIELDS = {"ta_recommendation": "RECOMMENDATION"}
HISTORY_FIELDS = ("ohlcv",)


def _clean(v: Any, text: bool = False) -> Any:
    if v is None:
        return None
    if text:
        return v if isinstance(v, str) and v.strip() else None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return None if (math.isnan(v) or math.isinf(v)) else v


def _default_query(symbols: List[str], columns: List[str]) -> List[dict]:
    """Live batch via tradingview-screener; rows keyed by column name plus 'symbol'."""
    from tradingview_screener import Query, Column
    cols = sorted(set(columns) | {"name", "exchange"})
    _, df = (Query().set_markets("india").select(*cols)
             .where(Column("name").isin(list(symbols)), Column("type").isin(["stock"]))
             .limit(max(len(symbols) * 3, 50)).get_scanner_data())
    rows = df.to_dict("records")
    for r in rows:
        r["symbol"] = r.get("name")
    rows.sort(key=lambda r: 0 if r.get("exchange") == "NSE" else 1)  # NSE preferred, as fetch_tv_universe.py
    return rows


def _default_ta(symbol: str, exchange: str) -> Optional[dict]:
    try:
        from tradingview_ta import TA_Handler, Interval
    except ImportError:
        return None
    return TA_Handler(symbol=symbol, screener="india", exchange=exchange,
                      interval=Interval.INTERVAL_1_DAY).get_analysis().summary


def _default_history(symbol: str, exchange: str) -> Optional[list]:
    try:
        from tvDatafeed import TvDatafeed, Interval  # rongardF/tvdatafeed, optional
    except ImportError:
        return None
    df = TvDatafeed().get_hist(symbol=symbol, exchange=exchange, interval=Interval.in_daily, n_bars=250)
    if df is None:
        return None
    return [{"date": str(i), **{k: float(r[k]) for k in ("open", "high", "low", "close", "volume")}}
            for i, r in df.iterrows()]


def tradingview_adapter(cache_path: Optional[str] = None, meta_path: Optional[str] = None,
                        query_fn: Optional[Callable] = None, ta_fn: Optional[Callable] = None,
                        history_fn: Optional[Callable] = None, allow_live: bool = True,
                        batch_size: int = 100, backoff: tuple = (2, 5, 15),
                        sleep: Callable[[float], None] = time.sleep) -> Callable:
    cache_path = cache_path or os.path.join(ROOT, "tv_universe.json")
    meta_path = meta_path or os.path.join(os.path.dirname(cache_path), "tv_universe_meta.json")
    query_fn = query_fn or _default_query
    ta_fn = ta_fn or _default_ta
    history_fn = history_fn or _default_history
    state: Dict[str, Any] = {"cache": None, "as_of": None}

    def load():
        if state["cache"] is None:
            state["cache"] = {}
            if os.path.exists(cache_path):
                with open(cache_path, encoding="utf-8") as f:
                    state["cache"] = json.load(f)
                if os.path.exists(meta_path):
                    with open(meta_path, encoding="utf-8") as f:
                        state["as_of"] = json.load(f).get("fetched_at")
        return state["cache"]

    def live(symbols: List[str], columns: List[str]) -> Dict[str, dict]:
        out: Dict[str, dict] = {}
        for i in range(0, len(symbols), batch_size):
            chunk = symbols[i:i + batch_size]
            for attempt in range(len(backoff) + 1):
                try:
                    for r in query_fn(chunk, columns):
                        out.setdefault(r.get("symbol"), r)
                    break
                except ImportError:
                    return out
                except Exception:
                    if attempt == len(backoff):
                        break
                    sleep(backoff[attempt])
        return out

    def fn(symbols, fields):
        symbols, fields = list(symbols), list(fields)
        cache = load()
        res = {s: {f: None for f in fields} for s in symbols}
        need_live: Dict[str, List[str]] = {}
        for s in symbols:
            u = cache.get(s)
            for f in fields:
                m = FIELD_MAP.get(f)
                if not m:
                    continue
                if u is not None and m["cache"] is not None:
                    v = _clean(u.get(m["cache"]), m.get("text", False))
                    if v is not None:
                        res[s][f] = {"value": v, "as_of": state["as_of"], "source": SOURCE}
                        continue
                    if m["cache"] in u:  # cache knows the symbol; TV had no value -> no network
                        continue
                need_live.setdefault(s, []).append(f)
        if allow_live and need_live:
            cols = sorted({FIELD_MAP[f]["col"] for fl in need_live.values() for f in fl})
            rows = live(sorted(need_live), cols)
            for s, fl in need_live.items():
                r = rows.get(s)
                if not r:
                    continue
                for f in fl:
                    m = FIELD_MAP[f]
                    v = _clean(r.get(m["col"]), m.get("text", False))
                    if v is not None and m.get("div"):
                        v = v / m["div"]
                    if v is not None:
                        res[s][f] = {"value": v, "as_of": None, "source": SOURCE}
        if allow_live:
            for s in symbols:
                exch = (cache.get(s) or {}).get("exchange") or "NSE"
                for f in fields:
                    if f in TA_FIELDS:
                        t = ta_fn(s, exch)
                        v = t.get(TA_FIELDS[f]) if isinstance(t, dict) else None
                        if v:
                            res[s][f] = {"value": v, "as_of": None, "source": SOURCE}
                    elif f in HISTORY_FIELDS:
                        h = history_fn(s, exch)
                        if h:
                            res[s][f] = {"value": h, "as_of": h[-1].get("date"), "source": SOURCE}
        return res
    return fn
