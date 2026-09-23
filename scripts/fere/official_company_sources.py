"""Archive and normalize official NSE shareholding and material-event feeds."""
from __future__ import annotations

import io
import json
import re
import sqlite3
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from urllib.parse import quote

import requests

from management_claims import detect_candidates, ensure_schema as ensure_claim_schema
from verified_filing_pipeline import (NSE_HOME, WindowsTrustAdapter, archive_bytes,
                                      connect, now, official_url, request)

SHAREHOLDING = f'{NSE_HOME}api/corporate-share-holdings-master?index=equities'
ANNOUNCEMENTS = f'{NSE_HOME}api/corporate-announcements'


def ensure_schema(con: sqlite3.Connection) -> None:
    ensure_claim_schema(con)
    con.executescript('''
      CREATE TABLE IF NOT EXISTS official_source_snapshot (
        id INTEGER PRIMARY KEY, source_type TEXT NOT NULL, source_url TEXT NOT NULL,
        retrieved_at TEXT NOT NULL, sha256 TEXT NOT NULL, archive_path TEXT NOT NULL,
        UNIQUE(source_type,sha256));
      CREATE TABLE IF NOT EXISTS shareholding_snapshot (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        period_end TEXT NOT NULL, promoter_holding REAL,
        promoter_pledge REAL, public_holding REAL, employee_trusts REAL,
        source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL,
        available_at TEXT NOT NULL, status TEXT NOT NULL,
        UNIQUE(isin,period_end,source_sha256));
      CREATE INDEX IF NOT EXISTS idx_shareholding_isin_period
        ON shareholding_snapshot(isin,period_end DESC);
      CREATE TABLE IF NOT EXISTS company_material_event (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        event_type TEXT NOT NULL, event_date TEXT NOT NULL, severity TEXT NOT NULL,
        explanation TEXT NOT NULL, source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL,
        verified INTEGER NOT NULL CHECK(verified IN (0,1)),
        UNIQUE(isin,event_type,event_date,source_sha256));
    ''')


def as_float(value) -> float | None:
    try:
        return float(str(value).replace(',', '').replace('%', '').strip())
    except (TypeError, ValueError):
        return None


def local_name(tag: str) -> str:
    return tag.rsplit('}', 1)[-1].split(':')[-1]


def iso_date(value: str) -> str | None:
    cleaned = value.strip()
    for fmt in ('%d-%b-%Y', '%d-%m-%Y', '%Y-%m-%d', '%d-%b-%Y %H:%M:%S'):
        try: return datetime.strptime(cleaned.title(), fmt).date().isoformat()
        except ValueError: pass
    return None


def parse_pledge_xml(payload: bytes) -> float | None:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError:
        return None
    exact = {
        'SharesPledgedOrOtherwiseEncumberedAsAPercentageOfTotalSharesHeld',
        'ShareholdingAsAPercentageOfTotalSharesHeldPledgedOrOtherwiseEncumbered',
        'PercentageOfSharesPledgedOrOtherwiseEncumbered',
    }
    values = []
    for element in root.iter():
        if local_name(element.tag) in exact:
            value = as_float(element.text)
            if value is not None and 0 <= value <= 100:
                values.append(value)
    return max(values) if values else None


def source_session() -> requests.Session:
    session = requests.Session(); session.mount('https://', WindowsTrustAdapter())
    return session


def save_source(con: sqlite3.Connection, kind: str, url: str, payload: bytes, suffix: str) -> tuple[str, str]:
    digest, path = archive_bytes(payload, suffix)
    con.execute('INSERT OR IGNORE INTO official_source_snapshot(source_type,source_url,retrieved_at,sha256,archive_path) VALUES(?,?,?,?,?)',
                (kind, url, now(), digest, path))
    return digest, path


def collect_shareholding(con: sqlite3.Connection, session: requests.Session, symbols: set[str]) -> dict:
    response = request(session, SHAREHOLDING)
    digest, _ = save_source(con, 'NSE_SHAREHOLDING_MASTER', SHAREHOLDING, response.content, '.json')
    payload = response.json()
    rows = payload if isinstance(payload, list) else payload.get('data', []) if isinstance(payload, dict) else []
    identities = {row[1].upper(): (row[0], row[1]) for row in con.execute('SELECT isin,symbol FROM universe')}
    counts = {'shareholding': 0, 'pledge': 0}
    for item in rows:
        symbol = str(item.get('symbol') or '').upper()
        if symbol not in symbols or symbol not in identities:
            continue
        isin, canonical = identities[symbol]
        period = iso_date(str(item.get('date') or item.get('asOnDate') or ''))
        if not period:
            continue
        promoter = as_float(item.get('pr_and_prgrp'))
        public = as_float(item.get('public_val'))
        trusts = as_float(item.get('employeeTrusts'))
        xbrl = official_url(str(item.get('xbrl') or '')) if item.get('xbrl') else None
        pledge = None; source_url = SHAREHOLDING; source_hash = digest
        if xbrl:
            try:
                doc = request(session, xbrl)
                source_hash, _ = save_source(con, 'NSE_SHAREHOLDING_XBRL', xbrl, doc.content, '.xml')
                pledge = parse_pledge_xml(doc.content); source_url = xbrl
            except Exception:
                pass
        con.execute('''INSERT INTO shareholding_snapshot
          (isin,symbol,period_end,promoter_holding,promoter_pledge,public_holding,employee_trusts,
           source_url,source_sha256,available_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(isin,period_end,source_sha256) DO UPDATE SET promoter_holding=excluded.promoter_holding,
          promoter_pledge=excluded.promoter_pledge,public_holding=excluded.public_holding,
          employee_trusts=excluded.employee_trusts,available_at=excluded.available_at,status=excluded.status''',
          (isin,canonical,period,promoter,pledge,public,trusts,source_url,source_hash,
           str(item.get('submissionDate') or item.get('broadcastDate') or now()),'VERIFIED_OFFICIAL'))
        counts['shareholding'] += 1; counts['pledge'] += pledge is not None
    con.commit(); return counts


EVENT_PATTERNS = [
    ('AUDITOR_RESIGNATION', 'CRITICAL', re.compile(r'\bauditor\b.*\bresign|\bresign.*\bauditor\b', re.I)),
    ('CFO_RESIGNATION', 'MATERIAL', re.compile(r'\bchief financial officer\b.*\bresign|\bcfo\b.*\bresign|\bresign.*\bcfo\b', re.I)),
    ('CREDIT_RATING_DOWNGRADE', 'MATERIAL', re.compile(r'\bcredit rating\b.*\b(downgrade|lowered|negative|default)\b|\b(downgrade|lowered)\b.*\brating\b', re.I)),
    ('DEFAULT_OR_PAYMENT_DELAY', 'CRITICAL', re.compile(r'\bdefault\b|\bpayment delay\b|\bdelay in payment\b', re.I)),
    ('MATERIAL_DILUTION', 'MATERIAL', re.compile(r'\bpreferential issue\b|\bwarrants?\b|\bqualified institutions placement\b|\bqip\b', re.I)),
    ('REGULATORY_ACTION', 'MATERIAL', re.compile(r'\bsebi\b.*\b(order|penalty|action)\b|\bregulatory action\b', re.I)),
    ('GUIDANCE_CUT', 'MATERIAL', re.compile(r'\b(cut|reduce|withdraw|lower)\w*\b.*\bguidance\b', re.I)),
    ('PROJECT_DELAY', 'WATCH', re.compile(r'\b(delay|defer|postpone)\w*\b.*\b(project|commission|plant|capex)\b', re.I)),
]


def announcement_rows(value) -> list[dict]:
    if isinstance(value, list): return [v for v in value if isinstance(v, dict)]
    if isinstance(value, dict):
        for key in ('data', 'results', 'records'):
            if isinstance(value.get(key), list): return [v for v in value[key] if isinstance(v, dict)]
    return []


def collect_announcements(con: sqlite3.Connection, session: requests.Session, symbols: set[str]) -> dict:
    identities = {row[1].upper(): (row[0], row[1]) for row in con.execute('SELECT isin,symbol FROM universe')}
    counts = {'events': 0, 'claim_candidates': 0}
    end = date.today(); start = end - timedelta(days=550)
    for symbol in sorted(symbols):
        if symbol not in identities: continue
        url = f'{ANNOUNCEMENTS}?index=equities&symbol={quote(symbol)}&from_date={start.strftime("%d-%m-%Y")}&to_date={end.strftime("%d-%m-%Y")}'
        try:
            response = request(session, url)
        except Exception:
            continue
        digest, _ = save_source(con, 'NSE_CORPORATE_ANNOUNCEMENTS', url, response.content, '.json')
        isin, canonical = identities[symbol]
        for item in announcement_rows(response.json()):
            subject = str(item.get('desc') or item.get('subject') or item.get('purpose') or '').strip()
            event_date = str(item.get('an_dt') or item.get('broadcastDate') or item.get('date') or now())
            attachment = official_url(str(item.get('attchmntFile') or item.get('attachment') or '')) if (item.get('attchmntFile') or item.get('attachment')) else None
            source_url, source_hash = url, digest
            body_text = ''
            if attachment:
                try:
                    doc = request(session, attachment); suffix = '.pdf' if 'pdf' in doc.headers.get('Content-Type','').lower() else '.bin'
                    source_hash, _ = save_source(con, 'NSE_ANNOUNCEMENT_ATTACHMENT', attachment, doc.content, suffix)
                    source_url = attachment
                    if suffix == '.pdf':
                        try:
                            from pypdf import PdfReader
                            body_text = '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(doc.content)).pages)
                        except Exception:
                            body_text = ''
                except Exception:
                    pass
            combined = f'{subject} {body_text[:10000]}'
            for event_type, severity, pattern in EVENT_PATTERNS:
                if pattern.search(combined):
                    con.execute('''INSERT OR IGNORE INTO company_material_event
                      (isin,symbol,event_type,event_date,severity,explanation,source_url,source_sha256,verified)
                      VALUES(?,?,?,?,?,?,?,?,1)''', (isin,canonical,event_type,event_date,severity,subject,source_url,source_hash))
                    counts['events'] += 1
            if body_text and re.search(r'analyst|investor|conference|presentation|concall', subject, re.I):
                for candidate in detect_candidates(body_text):
                    con.execute('''INSERT OR IGNORE INTO management_claim_candidate
                      (isin,symbol,claim_date,source_url,source_sha256,evidence_text,detected_metric,
                       detected_target,detected_unit,detected_deadline) VALUES(?,?,?,?,?,?,?,?,?,?)''',
                      (isin,canonical,event_date,source_url,source_hash,candidate['evidence_text'],candidate['metric'],
                       candidate['target'],candidate['unit'],candidate['deadline']))
                    counts['claim_candidates'] += 1
        con.commit()
    return counts


def refresh_official_sources(symbols: list[str]) -> dict:
    selected = {s.upper() for s in symbols}; con = connect(); ensure_schema(con); session = source_session()
    result = collect_shareholding(con, session, selected)
    for key, value in collect_announcements(con, session, selected).items(): result[key] = value
    con.close(); return result
