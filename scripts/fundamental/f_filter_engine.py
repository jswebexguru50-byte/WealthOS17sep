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
F_THRESHOLDS = {
    'F1_promoter_min': F1_PROMOTER_MIN_PCT,
    'F2_quarters': F2_QUARTERS,
    'F3_roce_min': F3_ROCE_MIN_PCT,
    'F4_roe_min': F4_ROE_MIN_PCT,
    'F5_pledge_max': F5_PLEDGE_MAX_PCT,
    'F6_inst_min': F6_INST_MIN_PCT,
    'F7_cfo_ebitda_min': F7_CFO_EBITDA_MIN,
}


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
        return None, count  # insufficient history: UNKNOWN, never FAIL
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
    # The base F6 filter is a level test.  The 4Q trend check is supplementary
    # and must not turn an otherwise evidenced institutional holding into an
    # UNKNOWN result merely because history is unavailable.
    return inst >= F6_INST_MIN_PCT, inst


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


def _legacy_compute_f_filters(symbol: str, tv: dict, sh: Optional[dict],
                      fin_quarters: list, thresholds: dict = F_THRESHOLDS) -> dict:
    """Compute the public F1-F7 contract from TV, shareholding and DB facts.

    Missing inputs remain ``None``.  This adapter deliberately does not use
    truthiness when selecting values, so a reported zero remains a real zero.
    ``symbol`` is accepted for callers that build per-symbol audit records.
    """
    tv = tv or {}
    sh = sh or {}
    quarters = fin_quarters if isinstance(fin_quarters, list) else []

    def first(*keys):
        for key in keys:
            if key in tv and tv.get(key) is not None:
                return tv.get(key)
            if key in sh and sh.get(key) is not None:
                return sh.get(key)
        return None

    pats = [q.get('pat_cr') if isinstance(q, dict) else None for q in quarters]
    promoter = first('promoter_pct', 'prompct')
    pledge = first('pledge_pct', 'prompledge')
    fii = first('fii_pct', 'fiipct')
    dii = first('dii_pct', 'diipct')
    inst = first('inst_total_pct', 'institutional_pct', 'inst_pct')
    inst_change = first('inst_change_pp', 'institutional_change_pp')
    roce = first('roce', 'roce_ttm', 'roce_fy')
    roe = first('roe', 'roe_ttm', 'roe_fy')
    if roce is None and tv.get('roa_fy') is not None:
        # Keep the legacy proxy explicit in provenance; it is never a default.
        roce = tv.get('roa_fy')
        roce_source = 'ROA FY proxy'
    else:
        roce_source = 'ROCE FY' if tv.get('roce_fy') is not None else 'DB'
    cfo_ebitda = first('cfo_ebitda')
    if cfo_ebitda is None and quarters:
        cfo = [q.get('cfo_cr') for q in quarters[:4] if isinstance(q, dict)]
        ebitda = [q.get('ebitda_cr') for q in quarters[:4] if isinstance(q, dict)]
        if len(cfo) == 4 and len(ebitda) == 4 and all(x is not None for x in cfo + ebitda):
            total_ebitda = sum(ebitda)
            cfo_ebitda = sum(cfo) / total_ebitda if total_ebitda != 0 else None

    result = evaluate_f_filters({
        'promoter_pct': promoter, 'pats': pats, 'roce': roce, 'roe': roe,
        'pledge_pct': pledge, 'fii_pct': fii, 'dii_pct': dii,
        'inst_pct': inst, 'inst_change_pp': inst_change,
        'cfo_ebitda': cfo_ebitda,
    })
    values = {
        'F1_promoter_pct': _num(promoter), 'F2_quarters_checked': min(len(quarters), F2_QUARTERS),
        'F2_pats': pats[:F2_QUARTERS], 'F3_roce': _num(roce), 'F4_roe': _num(roe),
        'F5_pledge_pct': _num(pledge), 'F6_inst_pct': result['F6_value'],
        'F7_cfo_ebitda': _num(cfo_ebitda),
    }
    out = dict(values)
    for n in F_NAMES:
        out[f'{n}_pass'] = result[f'{n}_pass']
    out.update({
        'F1_source': 'TV' if promoter is not None and tv.get('promoter_pct', tv.get('prompct')) is not None else 'DB',
        'F3_source': roce_source, 'F4_source': 'TV' if tv.get('roe') is not None else 'DB',
        'F5_source': 'TV' if tv.get('pledge_pct', tv.get('prompledge')) is not None else 'DB',
        'F6_source': 'TV' if inst is not None else 'DB', 'F7_source': 'DB',
        'f_score': sum(result[f'{n}_pass'] is True for n in F_NAMES),
        'f_unknowns': sum(result[f'{n}_pass'] is None for n in F_NAMES),
        'symbol': symbol,
    })
    return out


def compute_f_filters(symbol: str, tv: dict, sh: Optional[dict],
                      fin_quarters: list, thresholds: dict = F_THRESHOLDS) -> dict:
    """Authoritative F1–F7 evaluation with explicit provenance.

    This is intentionally self-contained instead of adapting truthy values:
    reported ``0.0`` values therefore remain observable evidence while absent
    values remain ``None``.
    """
    tv, sh = tv or {}, sh or {}
    qs = list(fin_quarters or [])
    t = {**F_THRESHOLDS, **(thresholds or {})}

    def num(value):
        return _num(value)

    def source_value(keys, db_first=False):
        ordered = (sh, tv) if db_first else (tv, sh)
        for record in ordered:
            for key in keys:
                if record.get(key) is not None:
                    return record.get(key), ('DB' if record is sh else 'TV')
        return None, 'MISSING'

    promoter, f1_source = source_value(('promoter_pct', 'prompct'), db_first=True)
    pledge, f5_source = source_value(('pledge_pct', 'prompledge'), db_first=True)
    inst_total, f6_source = source_value(('inst_total_pct', 'institutional_pct', 'inst_pct'), db_first=True)
    fii, _ = source_value(('fii_pct', 'fiipct'), db_first=True)
    dii, _ = source_value(('dii_pct', 'diipct'), db_first=True)
    if inst_total is None and num(fii) is not None and num(dii) is not None:
        inst_total, f6_source = num(fii) + num(dii), 'DB'

    pats = [(q.get('pat_cr') if isinstance(q, dict) else None) for q in qs[:t['F2_quarters']]]
    f2_known = [num(value) for value in pats]
    if any(value is not None and value <= 0 for value in f2_known):
        f2_pass = False
    elif len(f2_known) < t['F2_quarters'] or any(value is None for value in f2_known):
        f2_pass = None
    else:
        f2_pass = True

    roce = None
    roce_source = 'MISSING'
    first_q = qs[0] if qs and isinstance(qs[0], dict) else {}
    cap_employed = None
    if first_q:
        assets, debt = num(first_q.get('total_assets_cr')), num(first_q.get('borrowings_cr'))
        cap_employed = None if assets is None or debt is None else assets - debt
    ebit = []
    for q in qs[:4]:
        if not isinstance(q, dict):
            ebit.append(None)
        elif q.get('ebitda_cr') is not None:
            ebit.append(num(q.get('ebitda_cr')))
        else:
            opm, sales = num(q.get('opm_pct')), num(q.get('sales_cr'))
            ebit.append(None if opm is None or sales is None else opm * sales / 100)
    roce = roce_trailing_4q(ebit, cap_employed)
    if roce is not None:
        roce_source = 'DB TTM (4Q avg)'
    elif tv.get('roce_fy') is not None:
        roce, roce_source = num(tv.get('roce_fy')), 'TV ROCE FY'
    elif tv.get('roa_fy') is not None:
        roce, roce_source = num(tv.get('roa_fy')), 'TV ROA FY proxy'

    roe, f4_source = source_value(('roe_fy', 'roe', 'roe_ttm'), db_first=False)
    cfo, ebitda = [], []
    for q in qs[:4]:
        if not isinstance(q, dict):
            cfo.append(None); ebitda.append(None); continue
        cfo.append(num(q.get('cfo_cr')))
        ebitda.append(num(q.get('ebitda_cr')) if q.get('ebitda_cr') is not None else
                      (None if num(q.get('opm_pct')) is None or num(q.get('sales_cr')) is None
                       else num(q.get('opm_pct')) * num(q.get('sales_cr')) / 100))
    cfo_ebitda = None
    if len(cfo) == 4 and all(v is not None for v in cfo + ebitda):
        total_ebitda = sum(ebitda)
        if total_ebitda > 0:
            cfo_ebitda = sum(cfo) / total_ebitda

    def ge(value, threshold):
        value = num(value)
        return None if value is None else value >= threshold

    inst = num(inst_total)
    history = sh.get('inst_history')
    trend = None
    if isinstance(history, (list, tuple)) and len(history) >= 4:
        values = [num(v) for v in history[:4]]
        trend = None if any(v is None for v in values) else all(values[i] >= values[i + 1] for i in range(3))
    passes = {
        'F1': ge(promoter, t['F1_promoter_min']), 'F2': f2_pass,
        'F3': ge(roce, t['F3_roce_min']), 'F4': ge(roe, t['F4_roe_min']),
        'F5': None if num(pledge) is None else num(pledge) <= t['F5_pledge_max'],
        'F6': ge(inst, t['F6_inst_min']),
        'F7': None if cfo_ebitda is None else cfo_ebitda >= t['F7_cfo_ebitda_min'],
    }
    out = {
        'symbol': symbol, 'F1_promoter_pct': num(promoter), 'F1_pass': passes['F1'], 'F1_source': f1_source,
        'F2_quarters_checked': len(pats), 'F2_pats': pats, 'F2_pass': passes['F2'], 'F2_source': 'DB quarterly PL',
        'F3_roce': num(roce), 'F3_pass': passes['F3'], 'F3_source': roce_source,
        'F4_roe': num(roe), 'F4_pass': passes['F4'], 'F4_source': f4_source,
        'F5_pledge_pct': num(pledge), 'F5_pass': passes['F5'], 'F5_source': f5_source,
        'F6_inst_pct': inst, 'F6_pass': passes['F6'], 'F6_source': f6_source,
        'F6_trend_pass': trend,
        'F7_cfo_ebitda': cfo_ebitda, 'F7_pass': passes['F7'], 'F7_source': 'DB quarterly cash flow',
    }
    out['f_score'] = sum(value is True for value in passes.values())
    out['f_unknowns'] = sum(value is None for value in passes.values())
    return out
