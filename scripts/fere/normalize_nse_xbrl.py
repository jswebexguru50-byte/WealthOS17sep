"""Normalize exact, unambiguous NSE XBRL facts from archived XML.

No fuzzy field matching. Every fact retains filing hash, source URL, context,
period, scope, unit, and NSE broadcast timestamp.

Curated FIELD_MAP metrics are normalized to WealthOS canonical names. Other
numeric issuer-level facts are preserved under exact taxonomy-derived metric
names prefixed with ``xbrl_`` so no downloaded XBRL information is silently
dropped. These generic metrics are evidence inventory, not interpreted ratios.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

from verified_filing_pipeline import DB_PATH, ROOT, connect

IST = timezone(timedelta(hours=5, minutes=30))
XBRLI = '{http://www.xbrl.org/2003/instance}'
FIELD_MAP = {
    # ── Already promoted (9 original fields) ─────────────────────────────────
    'RevenueFromOperations':                                              'revenue',
    'ProfitLossForPeriod':                                                'pat',
    'DepreciationDepletionAndAmortisationExpense':                        'depreciation',
    'Expenses':                                                           'total_expenses',
    'FinanceCosts':                                                       'finance_costs',
    'ProfitBeforeTax':                                                    'pbt',
    'CostOfMaterialsConsumed':                                            'materials_cost',
    'PaidUpValueOfEquityShareCapital':                                    'equity_capital',
    'CashFlowsFromUsedInOperatingActivities':                             'cfo',
    # ── Balance-sheet names retained for completeness but absent in archive ─
    # These exist in FIELD_MAP for forward-compatibility when/if NSE adds them.
    'Assets':                                                             'total_assets',
    'Liabilities':                                                        'total_liabilities',
    'Borrowings':                                                         'total_debt',
    'CashAndCashEquivalents':                                             'cash_and_equivalents',
    'TradeReceivables':                                                   'trade_receivables',
    'Inventories':                                                        'inventories',
    # ── NEW: Income decomposition (TIER 1 — 45k–46k rows, 2,700+ ISINs) ─────
    'Income':                                                             'total_income',
    'OtherIncome':                                                        'other_income',
    'OtherExpenses':                                                      'other_expenses',
    'PurchasesOfStockInTrade':                                            'purchases_stock_trade',
    'ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade':  'inventory_change',
    'EmployeeBenefitExpense':                                             'employee_expenses',
    # ── NEW: P&L quality / adjustments ───────────────────────────────────────
    'ProfitBeforeExceptionalItemsAndTax':                                 'pbt_before_exceptional',
    'ExceptionalItemsBeforeTax':                                          'exceptional_items_pretax',
    'OtherComprehensiveIncomeNetOfTaxes':                                 'oci',
    # ── NEW: Tax breakdown ────────────────────────────────────────────────────
    'TaxExpense':                                                         'tax_expense',
    'CurrentTax':                                                         'current_tax',
    'DeferredTax':                                                        'deferred_tax_charge',
    # ── NEW: EPS (45k rows, 2,687 ISINs) ─────────────────────────────────────
    'BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations':   'eps_basic',
    'DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations': 'eps_diluted',
    'FaceValueOfEquityShareCapital':                                      'face_value',
    # ── NEW: Cash flow — investing & financing (15k rows, 2,711 ISINs) ───────
    'CashFlowsFromUsedInInvestingActivities':                             'cfi',
    'CashFlowsFromUsedInFinancingActivities':                             'cff',
    'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities': 'capex_cash_outflow',
    'PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities':          'capex_intangible_cash_outflow',
    'PurchaseOfInvestmentPropertyClassifiedAsInvestingActivities':        'capex_investment_property_cash_outflow',
    'PurchaseOfOtherLongTermAssetsClassifiedAsInvestingActivities':       'capex_other_long_term_assets_cash_outflow',
    'RepaymentsOfBorrowingsClassifiedAsFinancingActivities':              'debt_repaid',
    'ProceedsFromBorrowingsClassifiedAsFinancingActivities':              'debt_raised',
    'DividendsPaidClassifiedAsFinancingActivities':                       'dividends_paid',
    # ── NEW: Ratios (NSE-reported, no computation needed) ────────────────────
    'DebtEquityRatio':                                                    'debt_to_equity',
    'DebtServiceCoverageRatio':                                           'dscr',
    'ReturnOnAssets':                                                     'roa',
    'ExceptionalItems':                                                   'exceptional_items',
}
EXCLUDED_GENERIC_FIELDS = {
    # Identity / metadata fields should not be promoted as analytical facts.
    'Symbol',
    'ScripCode',
    'ISIN',
    'NameOfCompany',
    'NatureOfReportStandaloneConsolidated',
}


def local_name(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def generic_metric_name(taxonomy: str) -> str:
    parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)|\d+', taxonomy)
    snake = '_'.join(part.lower() for part in parts if part)
    return f'xbrl_{snake or taxonomy.lower()}'


def filed_at(value: str | None) -> str | None:
    if not value:
        return None
    for fmt in ('%d-%b-%Y %H:%M:%S', '%d-%b-%Y %H:%M'):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=IST).astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return None


def metadata_by_url(con: sqlite3.Connection) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for (path,) in con.execute("SELECT response_path FROM filing_discovery WHERE status='ARCHIVED'"):
        try:
            payload = json.loads((ROOT / path).read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        entries = payload if isinstance(payload, list) else payload.get('data', []) if isinstance(payload, dict) else []
        for item in entries:
            if isinstance(item, dict):
                for key in ('xbrl', 'resultDetailedDataLink'):
                    url = item.get(key)
                    if isinstance(url, str) and url.startswith('https://'):
                        lookup[url] = item
    return lookup


def ensure_schema(con: sqlite3.Connection) -> None:
    con.executescript('''
      CREATE TABLE IF NOT EXISTS verified_xbrl_fact (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        filing_id INTEGER NOT NULL, filing_sha256 TEXT NOT NULL,
        source_url TEXT NOT NULL, available_at TEXT NOT NULL,
        period_start TEXT, period_end TEXT NOT NULL, scope TEXT NOT NULL,
        context_ref TEXT NOT NULL, metric TEXT NOT NULL,
        value REAL NOT NULL, unit TEXT NOT NULL, taxonomy_field TEXT NOT NULL,
        UNIQUE(filing_id, context_ref, metric, taxonomy_field));
      CREATE INDEX IF NOT EXISTS idx_xbrl_isin_period
        ON verified_xbrl_fact(isin,period_end,period_start,scope,metric);
    ''')


def normalize_one(con: sqlite3.Connection, doc: tuple, meta: dict) -> int:
    filing_id, isin, symbol, url, file_hash, relative_path = doc
    if str(meta.get('symbol', '')).upper() != symbol.upper():
        raise ValueError('NSE metadata symbol mismatch')
    available = filed_at(meta.get('broadCastDate') or meta.get('broadcast_Date') or
                         meta.get('revised_Date') or meta.get('creation_Date') or meta.get('filingDate'))
    if not available:
        raise ValueError('NSE broadcast timestamp missing')
    path = ROOT / relative_path
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != file_hash:
        raise ValueError('Archived file hash mismatch')
    root = ET.fromstring(payload)
    embedded_symbols = {(elem.text or '').strip().upper() for elem in root.iter()
                        if local_name(elem.tag) == 'Symbol' and (elem.text or '').strip()}
    if embedded_symbols != {symbol.upper()}:
        raise ValueError('XBRL issuer symbol mismatch')
    scrip_codes = {(elem.text or '').strip() for elem in root.iter()
                   if local_name(elem.tag) == 'ScripCode' and (elem.text or '').strip()}
    embedded_isins = {(elem.text or '').strip().upper() for elem in root.iter()
                      if local_name(elem.tag).upper() == 'ISIN' and (elem.text or '').strip()}
    if len(embedded_isins) > 1:
        raise ValueError('Conflicting ISINs inside XBRL')
    filing_isin = str(meta.get('isin') or next(iter(embedded_isins), '')).upper()
    if not (len(filing_isin) == 12 and filing_isin.isalnum()):
        raise ValueError('NSE filing ISIN missing or invalid')
    if embedded_isins and filing_isin not in embedded_isins:
        raise ValueError('NSE metadata/XBRL ISIN mismatch')
    label = meta.get('toDate') or meta.get('qe_Date')
    if not label:
        raise ValueError('NSE filing period end missing')
    filing_period_end = datetime.strptime(label.title(), '%d-%b-%Y').date().isoformat()
    contexts: dict[str, tuple[str | None, str, str]] = {}
    for elem in root.findall(f'{XBRLI}context'):
        context_id = elem.attrib.get('id')
        identifier = elem.find(f'.//{XBRLI}identifier')
        period = elem.find(f'{XBRLI}period')
        allowed_identifiers = {symbol.upper(), *scrip_codes}
        if not context_id or identifier is None or (identifier.text or '').upper() not in allowed_identifiers or period is None:
            continue
        # Dimensional sub-tables are not issuer-level totals.
        if elem.find(f'{XBRLI}scenario') is not None:
            continue
        start, end, instant = (period.find(f'{XBRLI}{name}') for name in ('startDate', 'endDate', 'instant'))
        end_value = end.text if end is not None else instant.text if instant is not None else None
        if end_value:
            contexts[context_id] = (start.text if start is not None else None, end_value, (identifier.text or '').upper())
    scopes = {}
    for elem in root.iter():
        if local_name(elem.tag) == 'NatureOfReportStandaloneConsolidated':
            value = (elem.text or '').strip().upper()
            if value in ('STANDALONE', 'CONSOLIDATED'):
                scopes[elem.attrib.get('contextRef')] = value
    count = 0
    for elem in root.iter():
        taxonomy = local_name(elem.tag)
        metric = FIELD_MAP.get(taxonomy)
        context_ref = elem.attrib.get('contextRef')
        if context_ref not in contexts or scopes.get(context_ref) not in ('STANDALONE', 'CONSOLIDATED'):
            continue
        if not metric:
            if taxonomy in EXCLUDED_GENERIC_FIELDS:
                continue
            metric = generic_metric_name(taxonomy)
        unit_ref = elem.attrib.get('unitRef')
        if not unit_ref:
            continue
        try:
            value = float((elem.text or '').strip().replace(',', ''))
        except ValueError:
            continue
        if not math.isfinite(value):
            continue
        start, end, _ = contexts[context_ref]
        if end != filing_period_end:
            continue
        con.execute('''INSERT OR IGNORE INTO verified_xbrl_fact
          (isin,symbol,filing_id,filing_sha256,source_url,available_at,
           period_start,period_end,scope,context_ref,metric,value,unit,taxonomy_field)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
          (filing_isin,symbol,filing_id,file_hash,url,available,start,end,scopes[context_ref],
           context_ref,metric,value,unit_ref,taxonomy))
        count += 1
    con.execute('''UPDATE filing_document SET filing_timestamp=?, period_end=?,
                   statement_scope=?,status=?,error=NULL WHERE id=?''',
                (available, filing_period_end,
                 str(meta.get('consolidated') or '').upper(),
                 ('IDENTITY_REVIEW' if filing_isin != isin else 'PARSED_PARTIAL') if count else 'ARCHIVED_UNPARSED', filing_id))
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--reparse-all', action='store_true',
                        help='Re-read every archived XML document. Existing facts are preserved by INSERT OR IGNORE.')
    args = parser.parse_args()
    con = connect()
    ensure_schema(con)
    metadata = metadata_by_url(con)
    stats = {'parsed_documents': 0, 'facts_seen': 0, 'unmapped_documents': 0, 'errors': 0}
    if args.reparse_all:
        docs = con.execute('''SELECT id,isin,symbol,source_url,sha256,archive_path
                              FROM filing_document
                              WHERE lower(source_url) LIKE '%.xml'
                                AND archive_path IS NOT NULL
                              ORDER BY id''').fetchall()
    else:
        docs = con.execute('''SELECT id,isin,symbol,source_url,sha256,archive_path
                              FROM filing_document
                              WHERE (status='ARCHIVED_UNPARSED'
                                OR (status='PARSE_ERROR' AND error='NSE broadcast timestamp missing'))
                                AND lower(source_url) LIKE '%.xml' ORDER BY id''').fetchall()
    for doc in docs:
        item = metadata.get(doc[3])
        if not item:
            stats['unmapped_documents'] += 1
            continue
        try:
            count = normalize_one(con, doc, item)
            stats['parsed_documents'] += int(count > 0)
            stats['facts_seen'] += count
        except Exception as exc:
            stats['errors'] += 1
            con.execute('UPDATE filing_document SET status=?,error=? WHERE id=?',
                        ('PARSE_ERROR', str(exc)[:500], doc[0]))
        con.commit()
    stats['stored_facts'] = con.execute('SELECT COUNT(*) FROM verified_xbrl_fact').fetchone()[0]
    stats['stored_metrics'] = con.execute('SELECT COUNT(DISTINCT metric) FROM verified_xbrl_fact').fetchone()[0]
    print(json.dumps(stats), flush=True)
    con.close()


if __name__ == '__main__':
    main()
