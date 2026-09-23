"""Publish only fully evidenced FERE metrics; record precise gaps otherwise."""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone

from formulas import (altman_z_public_manufacturing, beneish_m,
                      cash_conversion_cycle, cfo_to_ebitda,
                      piotroski_f, sloan_accrual)
from verified_filing_pipeline import PORTFOLIO, connect

FORMULAS = {
    'beneish_m': beneish_m,
    'altman_z_public_manufacturing': altman_z_public_manufacturing,
    'piotroski_f': piotroski_f,
    'sloan_accrual': sloan_accrual,
    'cash_conversion_cycle': cash_conversion_cycle,
    'cfo_to_ebitda': cfo_to_ebitda,
}
FORMULA_INPUTS = {
    'beneish_m': ('sales_c','sales_p','receivables_c','receivables_p',
                  'gross_profit_c','gross_profit_p','assets_c','assets_p',
                  'ppe_c','ppe_p','depreciation_c','depreciation_p',
                  'sga_c','sga_p','debt_c','debt_p','pat_c','cfo_c'),
    'altman_z_public_manufacturing': ('working_capital_c','retained_earnings_c',
                                     'ebit_c','market_value_equity_c',
                                     'total_liabilities_c','sales_c','assets_c'),
    'piotroski_f': ('pat_c','assets_c','assets_p','cfo_c','pat_p',
                    'long_term_debt_c','long_term_debt_p','current_assets_c',
                    'current_assets_p','current_liabilities_c','current_liabilities_p',
                    'shares_c','shares_p','gross_profit_c','gross_profit_p',
                    'sales_c','sales_p'),
    'sloan_accrual': ('pat_c','cfo_c','assets_c','assets_p'),
    'cash_conversion_cycle': ('receivables_c','receivables_p','inventory_c',
                              'inventory_p','payables_c','payables_p','sales_c','cogs_c'),
    'cfo_to_ebitda': ('cfo_c','ebitda_c'),
}
VERSION = 'fere_strict_v1'


def annual_groups(con: sqlite3.Connection, isin: str) -> list[tuple[str, str, str]]:
    rows = con.execute('''SELECT DISTINCT period_start,period_end,scope
        FROM verified_xbrl_fact WHERE isin=? AND period_start IS NOT NULL
        ORDER BY period_end DESC''', (isin,)).fetchall()
    result = []
    for start, end, scope in rows:
        if 330 <= (date.fromisoformat(end) - date.fromisoformat(start)).days <= 380:
            result.append((start, end, scope))
    return result


def period_facts(con: sqlite3.Connection, isin: str, group: tuple[str, str, str]) -> dict:
    rows = con.execute('''SELECT id,metric,value,filing_sha256,available_at
      FROM verified_xbrl_fact WHERE isin=? AND period_start=? AND period_end=? AND scope=?
      ORDER BY available_at DESC,id DESC''', (isin, *group)).fetchall()
    result = {}
    for row in rows:
        result.setdefault(row[1], row)
    return result


def combined_inputs(current: dict, prior: dict) -> tuple[dict[str, float], dict[str, tuple]]:
    values: dict[str, float] = {}
    refs: dict[str, tuple] = {}
    for suffix, source in (('_c', current), ('_p', prior)):
        for metric, row in source.items():
            key = metric + suffix
            values[key], refs[key] = float(row[2]), row
    return values, refs


def main() -> None:
    con = connect()
    con.execute('''CREATE TABLE IF NOT EXISTS metric_coverage (
      isin TEXT NOT NULL, metric TEXT NOT NULL, period_end TEXT,
      status TEXT NOT NULL, missing_fields TEXT NOT NULL,
      reason TEXT, checked_at TEXT NOT NULL,
      PRIMARY KEY(isin,metric))''')
    source = sqlite3.connect(f'file:{PORTFOLIO.as_posix()}?mode=ro', uri=True)
    sectors = dict(source.execute('SELECT isin,COALESCE(sector,\'\') FROM MasterTickers'))
    source.close()
    counts = {'verified': 0, 'insufficient': 0, 'not_applicable': 0}
    for (isin,) in con.execute('SELECT isin FROM universe ORDER BY isin'):
        groups = annual_groups(con, isin)
        selected = None
        for current_group in groups:
            prior_group = next((g for g in groups if g[2] == current_group[2] and
                                350 <= (date.fromisoformat(current_group[1]) - date.fromisoformat(g[1])).days <= 380), None)
            if prior_group:
                selected = (current_group, prior_group)
                break
        if selected:
            current, prior = (period_facts(con, isin, g) for g in selected)
            inputs, refs = combined_inputs(current, prior)
            period_end = selected[0][1]
        else:
            inputs, refs, period_end = {}, {}, groups[0][1] if groups else None
        sector = sectors.get(isin, '').lower()
        financial = any(word in sector for word in ('bank', 'finance', 'insurance', 'nbfc'))
        for name, formula in FORMULAS.items():
            if financial and name in ('beneish_m', 'altman_z_public_manufacturing', 'cash_conversion_cycle'):
                outcome = {'status': 'NOT_APPLICABLE', 'missing_fields': [],
                           'reason': 'Industrial model is not applicable to this financial sector'}
            else:
                outcome = formula(inputs)
            if outcome['status'] == 'VERIFIED' and period_end and \
                    (date.today() - date.fromisoformat(period_end)).days > 540:
                outcome = {'status': 'STALE', 'missing_fields': [],
                           'reason': 'Latest comparable annual period is older than 540 days'}
            status = outcome['status']
            missing = outcome.get('missing_fields', [])
            con.execute('''INSERT INTO metric_coverage VALUES(?,?,?,?,?,?,?)
              ON CONFLICT(isin,metric) DO UPDATE SET period_end=excluded.period_end,
              status=excluded.status,missing_fields=excluded.missing_fields,
              reason=excluded.reason,checked_at=excluded.checked_at''',
              (isin,name,period_end,status,json.dumps(missing),outcome.get('reason'),
               datetime.now(timezone.utc).isoformat()))
            if status != 'VERIFIED':
                counts['not_applicable' if status == 'NOT_APPLICABLE' else 'insufficient'] += 1
                continue
            keys = FORMULA_INPUTS[name]
            fact_ids = sorted({refs[key][0] for key in keys})
            hashes = sorted({refs[key][3] for key in keys})
            available = max(refs[key][4] for key in keys)
            con.execute('''INSERT INTO verified_metric
              (isin,period_end,metric,value,formula_version,input_fact_ids,
               filing_hashes,available_at,calculated_at,status)
              VALUES(?,?,?,?,?,?,?,?,?,'VERIFIED')
              ON CONFLICT(isin,period_end,metric,formula_version) DO UPDATE SET
              value=excluded.value,input_fact_ids=excluded.input_fact_ids,
              filing_hashes=excluded.filing_hashes,available_at=excluded.available_at,
              calculated_at=excluded.calculated_at''',
              (isin,period_end,name,outcome['value'],VERSION,json.dumps(fact_ids),
               json.dumps(hashes),available,datetime.now(timezone.utc).isoformat()))
            counts['verified'] += 1
    con.commit()
    print(json.dumps(counts), flush=True)
    con.close()


if __name__ == '__main__':
    main()
