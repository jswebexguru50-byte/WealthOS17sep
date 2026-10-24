"""TradingView source adapter for SourceWaterfallEngine. No LLM, no randomness, no generated or default values.

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
from datetime import datetime, timezone
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
    "pb":             {"col": "price_book_fq", "cache": "pb"},
    "roe":            {"col": "return_on_equity", "cache": "roe"},
    "roa":            {"col": "return_on_assets", "cache": "roa"},
    "de_ratio":       {"col": "debt_to_equity", "cache": "de_ratio"},
    "debt_to_equity": {"col": "debt_to_equity", "cache": "de_ratio"},
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
    "high_52w":       {"col": "price_52_week_high", "cache": "high_52w"},
    "low_52w":        {"col": "price_52_week_low", "cache": "low_52w"},
    "avg_volume":     {"col": "average_volume_10d_calc", "cache": "avg_vol"},
    "sma20":          {"col": "SMA20", "cache": "sma20"},
    "sma200":         {"col": "SMA200", "cache": "sma200"},
    "ema20":          {"col": "EMA20", "cache": "ema20"},
    "ema50":          {"col": "EMA50", "cache": "ema50"},
    "ema200":         {"col": "EMA200", "cache": "ema200"},
    "sma50":          {"col": "SMA50", "cache": "sma50"},
    "beta_1y":        {"col": "beta_1_year", "cache": "beta_1y"},
    "net_margin":     {"col": "net_margin_ttm", "cache": "net_margin"},
    "ebitda_margin":  {"col": "ebitda_margin_ttm", "cache": "ebitda_margin"},
    "avg_volume_30d": {"col": "average_volume_30d_calc", "cache": "avg_vol_30d"},
    "volume_day":     {"col": "volume", "cache": "volume"},
    "value_traded_day": {"col": "Value.Traded", "cache": "value_traded"},  # one session; NOT turnover_adtv
    "float_shares":   {"col": "float_shares_outstanding", "cache": "float_shares"},
    "borrowings":     {"col": "total_debt", "cache": "borrowings_cr", "div": 1e7},
    "total_assets":   {"col": "total_assets", "cache": "total_assets_cr", "div": 1e7},
    # annual-basis variants: separate keys (different period), never fallbacks for the MRQ/TTM fields
    "pb_fy":          {"col": "price_book_ratio", "cache": "pb_fy"},
    "roe_fy":         {"col": "return_on_equity_fy", "cache": "roe_fy"},
    "roa_fy":         {"col": "return_on_assets_fy", "cache": "roa_fy"},
    "roce_fq":        {"col": "return_on_capital_employed_fq", "cache": "roce_fq"},
    "roce_fy":        {"col": "return_on_capital_employed_fy", "cache": "roce_fy"},
    "debt_to_equity_fy": {"col": "debt_to_equity_fy", "cache": "de_fy"},
    "borrowings_fy":  {"col": "total_debt_fy", "cache": "borrowings_fy_cr", "div": 1e7},
    "total_assets_fy": {"col": "total_assets_fy", "cache": "total_assets_fy_cr", "div": 1e7},
    "cfo_annual_fy":  {"col": "cash_f_operating_activities_fy", "cache": "cfo_fy_cr", "div": 1e7},
    "shareholders_equity_fy": {"col": "shrhldrs_equity_fy", "cache": "equity_fy_cr", "div": 1e7},
    "sales_fy":       {"col": "total_revenue_fy", "cache": "sales_fy_cr", "div": 1e7},
    "ebitda_annual":  {"col": "ebitda_fy", "cache": "ebitda_fy_cr", "div": 1e7},
    "net_income_fy":  {"col": "net_income_fy", "cache": "net_income_fy_cr", "div": 1e7},
    "sales_quarterly": {"col": "total_revenue_fq", "cache": "sales_fq_cr", "div": 1e7},
    "ebitda_quarterly": {"col": "ebitda_fq", "cache": "ebitda_fq_cr", "div": 1e7},
    "pat_quarterly_latest": {"col": "net_income_fq", "cache": "net_income_fq_cr", "div": 1e7},
    "sales_growth_5y": {"col": "total_revenue_cagr_5y", "cache": "revenue_cagr_5y"},
    "piotroski_f_ttm": {"col": "piotroski_f_score_ttm", "cache": "piotroski_f_ttm"},
    "piotroski_f_fy": {"col": "piotroski_f_score_fy", "cache": "piotroski_f_fy"},
    "altman_z_ttm":   {"col": "altman_z_score_ttm", "cache": "altman_z_ttm"},
    "altman_z_fy":    {"col": "altman_z_score_fy", "cache": "altman_z_fy"},
}
# registry-id aliases of the keys above (identical metric): pe_ttm=pe, market_cap_cr=market_cap, ltp=close.
FIELD_MAP["pe_ttm"] = FIELD_MAP["pe"]
FIELD_MAP["market_cap_cr"] = FIELD_MAP["market_cap"]
FIELD_MAP["ltp"] = FIELD_MAP["close"]
# Deliberately unmapped: TV screener has no equivalent. "roce" stays unmapped because the period must be
# explicit (use roce_fq / roce_fy); ROIC is never used for ROCE. No promoter/pledge/FII/DII/delivery/ADTV columns.
UNSUPPORTED = ("roce", "promoter_pct", "pledge_pct", "promoter_pledge_pct", "fii_pct", "dii_pct",
               "delivery_pct", "turnover_adtv", "equity_reserves", "mf_holding_pct")
TA_FIELDS = {"ta_recommendation": "RECOMMENDATION"}
HISTORY_FIELDS = ("ohlcv",)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    try:  # tradingview-ta raises on unknown symbol/exchange and on HTTP errors -> unknown (None)
        return TA_Handler(symbol=symbol, screener="india", exchange=exchange,
                          interval=Interval.INTERVAL_1_DAY).get_analysis().summary
    except Exception:
        return None


def _default_history(symbol: str, exchange: str) -> Optional[list]:
    try:
        from tvDatafeed import TvDatafeed, Interval  # rongardF/tvdatafeed, optional
    except ImportError:
        return None
    try:
        df = TvDatafeed().get_hist(symbol=symbol, exchange=exchange, interval=Interval.in_daily, n_bars=250)
    except Exception:
        return None
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
    alias_path = os.path.join(os.path.dirname(cache_path), "tv_symbol_aliases.json")
    state: Dict[str, Any] = {"cache": None, "as_of": None, "alias": None}

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

    def alias() -> Dict[str, str]:
        # audit symbol (e.g. BSE scrip code) -> TV symbol, resolved by exact ISIN in fetch_tv_universe.py
        if state["alias"] is None:
            state["alias"] = {}
            if os.path.exists(alias_path):
                with open(alias_path, encoding="utf-8") as f:
                    state["alias"] = json.load(f)
        return state["alias"]

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
            u = cache.get(alias().get(s, s))
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
                        res[s][f] = {"value": v, "as_of": now_iso(), "source": SOURCE}
        if allow_live:
            for s in symbols:
                tv_sym = alias().get(s, s)
                exch = (cache.get(tv_sym) or {}).get("exchange") or "NSE"
                for f in fields:
                    if f in TA_FIELDS:
                        try:
                            t = ta_fn(tv_sym, exch)
                        except Exception:
                            t = None
                        v = t.get(TA_FIELDS[f]) if isinstance(t, dict) else None
                        if v:
                            res[s][f] = {"value": v, "as_of": now_iso(), "source": SOURCE}
                    elif f in HISTORY_FIELDS:
                        try:
                            h = history_fn(tv_sym, exch)
                        except Exception:
                            h = None
                        if h:
                            res[s][f] = {"value": h, "as_of": h[-1].get("date"), "source": SOURCE}
        return res
    return fn
