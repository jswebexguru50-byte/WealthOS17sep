#!/usr/bin/env python3
"""Pure derived-metric functions over official-filing inputs.

Rule: a metric is computed ONLY when every input exists and is finite.
Otherwise the function returns None (never 0, never an estimate).
No I/O, no database, no randomness. All money inputs must already be in one
consistent unit (the staging file normalises to INR crore); ratios are
unit-free and percentages are returned in percent points.
"""
from __future__ import annotations

import math
from typing import Mapping, Optional, Sequence


def _ok(*xs) -> bool:
    for x in xs:
        if x is None or isinstance(x, bool):
            return False
        try:
            if not math.isfinite(float(x)):
                return False
        except (TypeError, ValueError):
            return False
    return True


def ttm(quarters: Sequence[Optional[float]]) -> Optional[float]:
    """Trailing-4-quarter sum; requires exactly four present quarterly values."""
    if len(quarters) != 4 or not _ok(*quarters):
        return None
    return float(sum(quarters))


def operating_profit(sales, total_expenses, finance_costs, depreciation) -> Optional[float]:
    """Operating profit (EBITDA excl. other income) = sales - (total expenses - finance costs - depreciation).

    Valid for Ind-AS statements where `Expenses` includes finance cost and D&A.
    """
    if not _ok(sales, total_expenses, finance_costs, depreciation):
        return None
    return float(sales) - (float(total_expenses) - float(finance_costs) - float(depreciation))


def ebit(pbt, finance_costs) -> Optional[float]:
    if not _ok(pbt, finance_costs):
        return None
    return float(pbt) + float(finance_costs)


def roce_ttm_pct(ebit_last_4q: Sequence[Optional[float]], total_assets, current_liabilities) -> Optional[float]:
    """ROCE % = trailing-4Q EBIT / (total assets - current liabilities) at the latest balance sheet."""
    t = ttm(ebit_last_4q)
    if t is None or not _ok(total_assets, current_liabilities):
        return None
    ce = float(total_assets) - float(current_liabilities)
    if ce <= 0:
        return None
    return t / ce * 100.0


def roe_pct(pat, equity_begin, equity_end) -> Optional[float]:
    """ROE % = PAT / average(opening, closing total equity). Average must be positive."""
    if not _ok(pat, equity_begin, equity_end):
        return None
    avg = (float(equity_begin) + float(equity_end)) / 2.0
    if avg <= 0:
        return None
    return float(pat) / avg * 100.0


def cfo_to_ebitda(cfo, ebitda) -> Optional[float]:
    """CFO / EBITDA as a ratio; undefined (None) when EBITDA <= 0."""
    if not _ok(cfo, ebitda) or float(ebitda) <= 0:
        return None
    return float(cfo) / float(ebitda)


def sales_cagr_pct(sales_start, sales_end, years: int = 5) -> Optional[float]:
    """Compound annual growth % between two annual sales figures `years` apart; both must be > 0."""
    if years <= 0 or not _ok(sales_start, sales_end):
        return None
    if float(sales_start) <= 0 or float(sales_end) <= 0:
        return None
    return ((float(sales_end) / float(sales_start)) ** (1.0 / years) - 1.0) * 100.0


_PIO_KEYS = ("pat", "cfo", "total_assets", "long_term_debt", "current_assets",
             "current_liabilities", "shares", "sales", "gross_profit")


def piotroski_f(cur: Mapping[str, Optional[float]], prev: Mapping[str, Optional[float]]) -> Optional[int]:
    """Piotroski F-score (0..9). Needs all nine inputs for both consecutive years, else None.

    Signals (ROA and ratios use year-end total assets):
      1 ROA>0; 2 CFO>0; 3 ROA up; 4 CFO>PAT; 5 LTD/assets down; 6 current ratio up;
      7 no increase in share count; 8 gross margin up; 9 asset turnover up.
    """
    for d in (cur, prev):
        if not _ok(*[d.get(k) for k in _PIO_KEYS]):
            return None
    for d in (cur, prev):
        if float(d["total_assets"]) <= 0 or float(d["current_liabilities"]) <= 0 or float(d["sales"]) <= 0:
            return None
    c = {k: float(cur[k]) for k in _PIO_KEYS}
    p = {k: float(prev[k]) for k in _PIO_KEYS}
    roa_c, roa_p = c["pat"] / c["total_assets"], p["pat"] / p["total_assets"]
    score = 0
    score += roa_c > 0
    score += c["cfo"] > 0
    score += roa_c > roa_p
    score += c["cfo"] > c["pat"]
    score += c["long_term_debt"] / c["total_assets"] < p["long_term_debt"] / p["total_assets"]
    score += c["current_assets"] / c["current_liabilities"] > p["current_assets"] / p["current_liabilities"]
    score += c["shares"] <= p["shares"]
    score += c["gross_profit"] / c["sales"] > p["gross_profit"] / p["sales"]
    score += c["sales"] / c["total_assets"] > p["sales"] / p["total_assets"]
    return int(score)


def altman_z(working_capital, retained_earnings, ebit_value, market_value_equity,
             total_liabilities, sales, total_assets) -> Optional[float]:
    """Altman (1968) Z = 1.2 WC/TA + 1.4 RE/TA + 3.3 EBIT/TA + 0.6 MVE/TL + 1.0 Sales/TA."""
    if not _ok(working_capital, retained_earnings, ebit_value, market_value_equity,
               total_liabilities, sales, total_assets):
        return None
    ta, tl = float(total_assets), float(total_liabilities)
    if ta <= 0 or tl <= 0:
        return None
    return (1.2 * float(working_capital) / ta + 1.4 * float(retained_earnings) / ta
            + 3.3 * float(ebit_value) / ta + 0.6 * float(market_value_equity) / tl
            + 1.0 * float(sales) / ta)
