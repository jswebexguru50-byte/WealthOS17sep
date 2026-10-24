#!/usr/bin/env python3
"""Fetch annual CFO/operating income for dossier candidates; no canonical DB writes.
TradingView FY fields share the provider's fiscal_period_fy and statement scope.
Trendlyne annual CFO is retained as supplemental evidence, never mixed with TV OP.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import requests

ENDPOINT = 'https://scanner.tradingview.com/india/scan'
COLUMNS = ['name', 'cash_f_operating_activities_fy', 'oper_income_fy', 'fiscal_period_fy']


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def evidence(row, fetched_at, digest):
    symbol, cfo, op, year = row['d']
    if not number(cfo) or not number(op) or not isinstance(year, (str, int)) or not str(year).isdigit():
        return None
    fiscal_year = int(year)
    if not 2000 <= fiscal_year <= int(fetched_at[:4]):
        return None
    # A non-positive denominator has no meaningful >=0.5 quality interpretation.
    if op <= 0:
        return None
    ratio = cfo / op
    if not math.isfinite(ratio):
        return None
    exchange, ticker = row['s'].split(':', 1)
    return {'ratio': ratio, 'cfoINR': cfo, 'operatingIncomeINR': op,
            'source': 'TradingView', 'sourceUrl': f'https://www.tradingview.com/symbols/{exchange}-{ticker}/financials-cash-flow/',
            'period': f'FY {year}', 'periodType': 'ANNUAL',
            'scope': 'TradingView provider default statement scope',
            'denominator': 'Annual operating income (after depreciation; not EBITDA)',
            'fetchedAt': fetched_at, 'responseSha256': digest}


def atomic_json(path, data):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as f:
        json.dump(data, f, ensure_ascii=False, allow_nan=False)
        temp = f.name
    os.replace(temp, path)


def enrich(scan_path):
    scan = json.loads(Path(scan_path).read_text())
    stocks = scan['stocks']
    fetched = dt.datetime.now(dt.timezone.utc).isoformat()
    audit = {'fetchedAt': fetched, 'tradingview': [], 'trendlyne': {}, 'errors': []}
    # Existing bridge owns provider configuration and credential handling.
    # CFO alone cannot establish a ratio: keep Trendlyne evidence separate.
    try:
        from trendlyne_bridge import fetch
        audit['trendlyne'] = {'status': 'available', 'annualCfo': fetch([s['symbol'] for s in stocks], ['cfoa'])}
    except Exception as exc:
        audit['trendlyne'] = {'status': 'unavailable', 'errorType': type(exc).__name__}
        print(f'Trendlyne unavailable ({type(exc).__name__}); using TradingView.', file=sys.stderr)
    values = {}
    for start in range(0, len(stocks), 75):
        batch = stocks[start:start + 75]
        tickers = [f'{ex}:{s["symbol"]}' for s in batch for ex in ('NSE', 'BSE')]
        try:
            response = requests.post(ENDPOINT, json={'symbols': {'tickers': tickers}, 'columns': COLUMNS, 'range': [0, len(tickers)]}, timeout=30)
            response.raise_for_status()
            body = response.json()
            if not isinstance(body.get('data'), list):
                raise ValueError('Unexpected TradingView response')
            digest = hashlib.sha256(response.content).hexdigest()
            audit['tradingview'].append({'symbols': tickers, 'sha256': digest, 'response': body, 'rawResponse': response.text})
            for row in sorted(body['data'], key=lambda r: not r['s'].startswith('NSE:')):
                ev = evidence(row, fetched, digest)
                if ev:
                    values.setdefault(row['d'][0], ev)
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            audit['errors'].append({'batchStart': start, 'errorType': type(exc).__name__})
            print(f'TradingView batch {start} failed: {type(exc).__name__}', file=sys.stderr)
        print(f'Cash-flow enrichment: {min(start+75,len(stocks))}/{len(stocks)} candidates', file=sys.stderr)
    covered = 0
    for s in stocks:
        ev = values.get(s['symbol'])
        if ev:
            s['cfRatio'] = ev['ratio']
            s['cashFlowEvidence'] = ev
            if not isinstance(s.get('filters'), dict):
                s['filters'] = {}
            s['filters']['F5_cashflow'] = ev['ratio'] >= .5
            s['passCount'] = sum(v is True for v in s['filters'].values())
            covered += 1
    audit_path = str(scan_path) + '.cashflow-evidence.json'
    atomic_json(audit_path, audit)
    scan['cashFlowEnrichment'] = {'fetchedAt': fetched, 'covered': covered, 'total': len(stocks),
                                 'trendlyneStatus': audit['trendlyne']['status'], 'auditPath': audit_path,
                                 'basis': 'TradingView annual CFO / annual operating income, same provider FY'}
    atomic_json(scan_path, scan)
    print(f'F5 cash-flow coverage: {covered}/{len(stocks)}; evidence: {audit_path}')


def self_test():
    row = {'s': 'NSE:TEST', 'd': ['TEST', 80, 100, '2025']}
    assert evidence(row, '2026-10-23', 'hash')['ratio'] == .8
    for bad in (None, True, float('nan'), float('inf')):
        assert evidence({'s': 'NSE:TEST', 'd': ['TEST', bad, 100, '2025']}, '2026-10-23', 'hash') is None
    for op in (0, -1):
        assert evidence({'s': 'NSE:TEST', 'd': ['TEST', 80, op, '2025']}, '2026-10-23', 'hash') is None
    assert evidence({'s': 'NSE:TEST', 'd': ['TEST', 80, 100, None]}, '2026-10-23', 'hash') is None
    print('Cash-flow ratio validation checks passed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scan_json', nargs='?')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.scan_json:
        enrich(args.scan_json)
    else:
        parser.error('scan_json is required')
