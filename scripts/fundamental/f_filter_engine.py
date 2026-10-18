"""Authoritative, pure, deterministic F1-F7 filter engine (stdlib only, no I/O).

Canonical definitions: docs/RESEARCH_FRAMEWORK_29Q.md.

    F1 Promoter holding   >= 66.67 %
    F2 PAT                newest 8 quarters ALL > 0 (needs >= 8 quarters)
    F3 ROCE               >= 35 %
    F4 ROE                >= 25 %
    F5 Promoter pledge    <= 0.01 %   (unknown pledge FAILS CLOSED)
    F6 Institutional      (FII+DII) >= 5 % AND QoQ change >= +0.10 pp
    F7 CFO / EBITDA       >= 0.5

UNITS: every percentage input is in PERCENT POINTS (66.7 means 66.7 %, pledge
0.01 means 0.01 %) -- never fractions. A fraction (0.667) would silently fail.
Old code compared pledge <= 0.01 on percent values; that is kept and is now
explicit.

Tri-state: each Fn_pass is True / False / None (None = UNKNOWN). all_pass is
True only if all seven are True, so unknowns fail closed.

INPUT KEYS (all optional; missing/None/NaN = unknown):
    pats            list of quarterly PAT, newest first (None entries = unknown)
    promoter_pct    F1
    roce, roe       F3, F4 (precomputed, percent; prefer TTM, see docs)
    pledge_pct      F5 (None => UNKNOWN; never defaulted to 0)
    fii_pct, dii_pct  F6 (both needed, unless inst_pct given)
    inst_pct        F6 total institutional % (overrides fii+dii)
    inst_change_pp  F6 QoQ change in institutional % in percentage points
    cfo_ebitda      F7 precomputed ratio, else
    cfo, ebitda     F7 ratio = cfo / ebitda (same period basis, e.g. TTM)

DIVERGENCES between the sources (documented definition chosen):
  * F1: run_scan_dossier.py / run_29q_with_tv.py `>= 66.67`;
        StrategyFundamentalFilterService.ts (used by the enrichment daemon)
        `> 66.6`. -> `>= 66.67` (doc).
  * F2: py scripts accepted `len>=4` and silently dropped None quarters;
        TS requires 8 of 8; sync_verified_fundamentals_package.py only counts
        consecutive positive quarters (no threshold). -> exactly 8 (doc).
  * F3: py scripts annualised the LAST quarter x4 (OPM*Sales*4/CE) with a
        TV "ROA*1.5" proxy; TS/sync use stored ROCE (rocea). -> accepts a
        precomputed value; roce_trailing_4q() offers a 4-quarter sum.
        The ROA*1.5 proxy is NOT reproduced here (caller must flag proxies).
  * F4: py scripts differ in precedence (run_scan_dossier prefers TV ROE,
        run_29q_with_tv prefers DB-computed); last PAT x4 / equity. -> value
        supplied by caller; no precedence logic here.
  * F5: py scripts defaulted missing pledge to 0 (SQL `0 as pledge_pct`) and
        passed; TS passes only when pledge == 0 exactly. -> `<= 0.01` (doc)
        and None => UNKNOWN.
  * F6: py scripts `fii+dii >= 5` without trend (a missing value counted as
        0); TS `fii+dii > 0` plus separate "increasing" flag. -> doc: >= 5 AND
        QoQ >= +0.10 pp.
  * F7: py scripts used 4-quarter CFO sum / sum(OPM*sales) and
        `ebitda_sum > 0`; TS uses latest CFO / operating profit with period
        alignment. -> ratio >= 0.5; non-positive EBITDA => False.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence

F_NAMES = ("F1", "F2", "F3", "F4", "F5", "F6", "F7")

F1_PROMOTER_MIN_PCT = 66.67
F2_QUARTERS = 8
F3_ROCE_MIN_PCT = 35.0
F4_ROE_MIN_PCT = 25.0
F5_PLEDGE_MAX_PCT = 0.01
F6_INST_MIN_PCT = 5.0
F6_INST_CHANGE_MIN_PP = 0.10
F7_CFO_EBITDA_MIN = 0.5


def _num(v: Any) -> Optional[float]:
    """Coerce to finite float; None for missing/NaN/inf/non-numeric/bool."""
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def roce_trailing_4q(ebit_q: Sequence[Any], cap_employed: Any) -> Optional[float]:
    """ROCE % = (sum of last 4 quarters EBIT, newest first) / capital employed.

    Needs 4 known quarters and capital employed > 0, else None. Replaces the
    old "last quarter x 4" annualisation.
    """
    ce = _num(cap_employed)
    if ebit_q is None or ce is None or ce <= 0:
        return None
    last4 = [_num(x) for x in list(ebit_q)[:4]]
    if len(last4) < 4 or any(x is None for x in last4):
        return None
    return sum(last4) / ce * 100.0  # type: ignore[arg-type]


def _ge(v: Optional[float], thr: float) -> Optional[bool]:
    return None if v is None else v >= thr


def _f2(pats: Any):
    if not isinstance(pats, (list, tuple)):
        return None, None
    first = [_num(p) for p in list(pats)[:F2_QUARTERS]]
    if not first:
        return None, 0
    count = sum(1 for p in first if p is not None and p > 0)
    if any(p is not None and p <= 0 for p in first):
        return False, count
    if len(first) < F2_QUARTERS:
        return False, count  # insufficient history: 8 quarters not demonstrated
    if any(p is None for p in first):
        return None, count  # 8 slots but some unknown, none negative
    return True, count


def _f6(inp: dict):
    inst = _num(inp.get("inst_pct"))
    if inst is None:
        fii, dii = _num(inp.get("fii_pct")), _num(inp.get("dii_pct"))
        inst = fii + dii if fii is not None and dii is not None else None
    if inst is None:
        return None, None
    if inst < F6_INST_MIN_PCT:
        return False, inst  # definitive fail regardless of trend
    chg = _num(inp.get("inst_change_pp"))
    if chg is None:
        return None, inst
    # tolerance guards float noise at exactly +0.10 pp
    return chg >= F6_INST_CHANGE_MIN_PP - 1e-9, inst


def _f7(inp: dict):
    ratio = _num(inp.get("cfo_ebitda"))
    if ratio is not None:
        return ratio >= F7_CFO_EBITDA_MIN, ratio
    cfo, ebitda = _num(inp.get("cfo")), _num(inp.get("ebitda"))
    if cfo is None or ebitda is None:
        return None, None
    if ebitda <= 0:
        return False, None
    ratio = cfo / ebitda
    return ratio >= F7_CFO_EBITDA_MIN, ratio


def evaluate_f_filters(inp: dict) -> dict:
    """Evaluate F1-F7. Pure: no I/O, input not mutated. See module docstring."""
    inp = inp or {}
    out: Dict[str, Any] = {}

    prom = _num(inp.get("promoter_pct"))
    out["F1_pass"], out["F1_value"] = _ge(prom, F1_PROMOTER_MIN_PCT), prom

    f2, n_pos = _f2(inp.get("pats"))
    out["F2_pass"], out["F2_value"] = f2, n_pos

    roce = _num(inp.get("roce"))
    out["F3_pass"], out["F3_value"] = _ge(roce, F3_ROCE_MIN_PCT), roce

    roe = _num(inp.get("roe"))
    out["F4_pass"], out["F4_value"] = _ge(roe, F4_ROE_MIN_PCT), roe

    pledge = _num(inp.get("pledge_pct"))
    out["F5_pass"] = None if pledge is None else pledge <= F5_PLEDGE_MAX_PCT
    out["F5_value"] = pledge

    out["F6_pass"], out["F6_value"] = _f6(inp)
    out["F7_pass"], out["F7_value"] = _f7(inp)

    unknown: List[str] = [n for n in F_NAMES if out[n + "_pass"] is None]
    fail: List[str] = [n for n in F_NAMES if out[n + "_pass"] is False]
    out["unknown"] = unknown
    out["fail"] = fail
    out["all_pass"] = all(out[n + "_pass"] is True for n in F_NAMES)
    return out
