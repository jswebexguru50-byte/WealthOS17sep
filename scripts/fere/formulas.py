"""Pure FERE formulae. Inputs must be filing-derived, period-aligned facts.

No default observation, sector proxy, or LLM inference is permitted. Financial
institutions require separate models and are NOT_APPLICABLE here.
"""
from __future__ import annotations

import math
from typing import Mapping


def _inputs(facts: Mapping[str, float], names: tuple[str, ...]) -> tuple[dict[str, float], list[str]]:
    missing = [key for key in names if key not in facts or not isinstance(facts[key], (int, float))
               or not math.isfinite(float(facts[key]))]
    return ({key: float(facts[key]) for key in names if key not in missing}, missing)


def _result(value: float | None = None, missing: list[str] | None = None,
            reason: str | None = None) -> dict:
    if missing or reason or value is None or not math.isfinite(value):
        return {'status': 'DATA_INSUFFICIENT', 'value': None,
                'missing_fields': missing or [], 'reason': reason or 'Required inputs unavailable'}
    return {'status': 'VERIFIED', 'value': round(value, 8), 'missing_fields': [], 'reason': None}


def beneish_m(facts: Mapping[str, float]) -> dict:
    names = ('sales_c', 'sales_p', 'receivables_c', 'receivables_p',
             'gross_profit_c', 'gross_profit_p', 'assets_c', 'assets_p',
             'ppe_c', 'ppe_p', 'depreciation_c', 'depreciation_p',
             'sga_c', 'sga_p', 'debt_c', 'debt_p', 'pat_c', 'cfo_c')
    f, missing = _inputs(facts, names)
    if missing:
        return _result(missing=missing)
    try:
        dsri = (f['receivables_c'] / f['sales_c']) / (f['receivables_p'] / f['sales_p'])
        gmi = (f['gross_profit_p'] / f['sales_p']) / (f['gross_profit_c'] / f['sales_c'])
        aqi = (1 - (f['ppe_c'] / f['assets_c'])) / (1 - (f['ppe_p'] / f['assets_p']))
        sgi = f['sales_c'] / f['sales_p']
        depi = (f['depreciation_p'] / (f['depreciation_p'] + f['ppe_p'])) / \
               (f['depreciation_c'] / (f['depreciation_c'] + f['ppe_c']))
        sgai = (f['sga_c'] / f['sales_c']) / (f['sga_p'] / f['sales_p'])
        lvgi = (f['debt_c'] / f['assets_c']) / (f['debt_p'] / f['assets_p'])
        tata = (f['pat_c'] - f['cfo_c']) / f['assets_c']
        return _result(-4.84 + 0.920 * dsri + 0.528 * gmi + 0.404 * aqi
                       + 0.892 * sgi + 0.115 * depi - 0.172 * sgai
                       + 4.679 * tata - 0.327 * lvgi)
    except ZeroDivisionError:
        return _result(reason='Zero denominator in Beneish input ratios')


def altman_z_public_manufacturing(facts: Mapping[str, float]) -> dict:
    names = ('working_capital_c', 'retained_earnings_c', 'ebit_c',
             'market_value_equity_c', 'total_liabilities_c', 'sales_c', 'assets_c')
    f, missing = _inputs(facts, names)
    if missing:
        return _result(missing=missing)
    if f['assets_c'] <= 0 or f['total_liabilities_c'] <= 0:
        return _result(reason='Assets and liabilities must be positive')
    return _result(1.2 * f['working_capital_c'] / f['assets_c']
                   + 1.4 * f['retained_earnings_c'] / f['assets_c']
                   + 3.3 * f['ebit_c'] / f['assets_c']
                   + 0.6 * f['market_value_equity_c'] / f['total_liabilities_c']
                   + f['sales_c'] / f['assets_c'])


def piotroski_f(facts: Mapping[str, float]) -> dict:
    names = ('pat_c', 'assets_c', 'assets_p', 'cfo_c', 'pat_p',
             'long_term_debt_c', 'long_term_debt_p', 'current_assets_c',
             'current_assets_p', 'current_liabilities_c', 'current_liabilities_p',
             'shares_c', 'shares_p', 'gross_profit_c', 'gross_profit_p',
             'sales_c', 'sales_p')
    f, missing = _inputs(facts, names)
    if missing:
        return _result(missing=missing)
    try:
        roa_c, roa_p = f['pat_c'] / f['assets_c'], f['pat_p'] / f['assets_p']
        tests = (roa_c > 0, f['cfo_c'] > 0, roa_c > roa_p,
                 f['cfo_c'] > f['pat_c'],
                 f['long_term_debt_c'] / f['assets_c'] < f['long_term_debt_p'] / f['assets_p'],
                 f['current_assets_c'] / f['current_liabilities_c'] >
                 f['current_assets_p'] / f['current_liabilities_p'],
                 f['shares_c'] <= f['shares_p'],
                 f['gross_profit_c'] / f['sales_c'] > f['gross_profit_p'] / f['sales_p'],
                 f['sales_c'] / f['assets_c'] > f['sales_p'] / f['assets_p'])
        return _result(float(sum(tests)))
    except ZeroDivisionError:
        return _result(reason='Zero denominator in Piotroski input ratios')


def sloan_accrual(facts: Mapping[str, float]) -> dict:
    f, missing = _inputs(facts, ('pat_c', 'cfo_c', 'assets_c', 'assets_p'))
    if missing:
        return _result(missing=missing)
    avg_assets = (f['assets_c'] + f['assets_p']) / 2
    return _result((f['pat_c'] - f['cfo_c']) / avg_assets) if avg_assets > 0 else _result(reason='Average assets must be positive')


def cash_conversion_cycle(facts: Mapping[str, float]) -> dict:
    names = ('receivables_c', 'receivables_p', 'inventory_c', 'inventory_p',
             'payables_c', 'payables_p', 'sales_c', 'cogs_c')
    f, missing = _inputs(facts, names)
    if missing:
        return _result(missing=missing)
    if f['sales_c'] <= 0 or f['cogs_c'] <= 0:
        return _result(reason='Sales and COGS must be positive')
    dso = ((f['receivables_c'] + f['receivables_p']) / 2) / f['sales_c'] * 365
    dio = ((f['inventory_c'] + f['inventory_p']) / 2) / f['cogs_c'] * 365
    dpo = ((f['payables_c'] + f['payables_p']) / 2) / f['cogs_c'] * 365
    return _result(dso + dio - dpo)


def cfo_to_ebitda(facts: Mapping[str, float]) -> dict:
    f, missing = _inputs(facts, ('cfo_c', 'ebitda_c'))
    if missing:
        return _result(missing=missing)
    return _result(f['cfo_c'] / f['ebitda_c']) if f['ebitda_c'] > 0 else _result(reason='EBITDA must be positive')
