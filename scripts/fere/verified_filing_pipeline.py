"""Deterministic, fail-closed NSE filing archive. No LLM or inferred financial values.

Run: python scripts/fere/verified_filing_pipeline.py --init
     python scripts/fere/verified_filing_pipeline.py --collect --limit 0

The collector stores discovery responses and source files, not FERE scores. A
score may only be published after independently tested XBRL field mappings.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sqlite3
import ssl
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

import requests
from requests.adapters import HTTPAdapter

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / 'data' / 'fere' / 'verified_filings'
ARCHIVE = STORE / 'archive'
DB_PATH = STORE / 'fere_evidence.db'
PORTFOLIO = ROOT / 'portfolio.db'
NSE_HOME = 'https://www.nseindia.com/'
DISCOVERY = 'https://www.nseindia.com/api/corporates-financial-results'
INTEGRATED = 'https://www.nseindia.com/api/integrated-filing-results'
NIFTY500_CSV = 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv'
ALLOWED_HOSTS = {'www.nseindia.com', 'nseindia.com', 'nsearchives.nseindia.com',
                 'archives.nseindia.com', 'www.bseindia.com', 'bseindia.com'}
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                         'AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
           'Accept': 'application/json,text/html,application/pdf,*/*',
           'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-financial-results'}


class WindowsTrustAdapter(HTTPAdapter):
    """Use the OS trust store without bypassing certificate validation."""
    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        pool_kwargs['ssl_context'] = ssl.create_default_context()
        return super().init_poolmanager(connections, maxsize, block=block, **pool_kwargs)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    STORE.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.execute('PRAGMA journal_mode=WAL')
    con.executescript('''
      CREATE TABLE IF NOT EXISTS universe (
        isin TEXT PRIMARY KEY, symbol TEXT NOT NULL, exchange TEXT,
        status TEXT, listing_date TEXT, source TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS filing_discovery (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        period_type TEXT NOT NULL, source_url TEXT NOT NULL,
        retrieved_at TEXT NOT NULL, http_status INTEGER, response_sha256 TEXT,
        response_path TEXT, status TEXT NOT NULL, error TEXT,
        UNIQUE(isin, period_type, source_url));
      CREATE TABLE IF NOT EXISTS filing_document (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        document_type TEXT NOT NULL, source_url TEXT NOT NULL,
        retrieved_at TEXT NOT NULL, filing_timestamp TEXT,
        period_end TEXT, statement_scope TEXT,
        sha256 TEXT, archive_path TEXT, content_type TEXT,
        status TEXT NOT NULL, error TEXT,
        UNIQUE(isin, source_url));
      CREATE TABLE IF NOT EXISTS source_fact (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, filing_id INTEGER NOT NULL,
        period_end TEXT NOT NULL, scope TEXT NOT NULL,
        metric TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
        original_field_path TEXT NOT NULL, available_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('VERIFIED','REJECTED')),
        UNIQUE(isin, filing_id, period_end, scope, metric, original_field_path));
      CREATE TABLE IF NOT EXISTS verified_metric (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, period_end TEXT NOT NULL,
        metric TEXT NOT NULL, value REAL NOT NULL, formula_version TEXT NOT NULL,
        input_fact_ids TEXT NOT NULL, filing_hashes TEXT NOT NULL,
        available_at TEXT NOT NULL, calculated_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status='VERIFIED'),
        UNIQUE(isin, period_end, metric, formula_version));
      CREATE TABLE IF NOT EXISTS legacy_fere_status (
        symbol TEXT PRIMARY KEY, quality_status TEXT NOT NULL,
        reason TEXT NOT NULL, marked_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS authenticated_evidence (
        evidence_id TEXT PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES filing_document(id),
        issuer_symbol TEXT NOT NULL,
        quoted_text TEXT NOT NULL,
        document_hash TEXT NOT NULL,
        extraction_method TEXT NOT NULL,
        verification_status TEXT NOT NULL CHECK(verification_status IN ('VERIFIED','UNVERIFIED')),
        created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_filing_isin ON filing_document(isin,status);
      CREATE INDEX IF NOT EXISTS idx_fact_isin_period ON source_fact(isin,period_end,scope);
    ''')
    columns = {row[1] for row in con.execute('PRAGMA table_info(universe)')}
    if 'priority_tier' not in columns:
        con.execute('ALTER TABLE universe ADD COLUMN priority_tier INTEGER NOT NULL DEFAULT 2')
    if 'priority_source' not in columns:
        con.execute('ALTER TABLE universe ADD COLUMN priority_source TEXT')
    return con


def seed_universe(con: sqlite3.Connection) -> int:
    src = sqlite3.connect(f'file:{PORTFOLIO.as_posix()}?mode=ro', uri=True)
    rows = src.execute('''SELECT isin, symbol, exchange, status, listing_date FROM MasterTickers
                          WHERE isin IS NOT NULL AND symbol IS NOT NULL''').fetchall()
    con.executemany('''INSERT INTO universe(isin,symbol,exchange,status,listing_date,source)
                       VALUES(?,?,?,?,?,'portfolio.db:MasterTickers')
                       ON CONFLICT(isin) DO UPDATE SET symbol=excluded.symbol,
                       exchange=excluded.exchange,status=excluded.status,
                       listing_date=excluded.listing_date''', rows)
    legacy = src.execute('SELECT symbol FROM FEREEnrichedLedger').fetchall()
    con.executemany('''INSERT OR IGNORE INTO legacy_fere_status VALUES
        (?, 'LEGACY_UNVERIFIED', 'Inputs lacked filing hashes and period-level lineage', ?)''',
        [(s, now()) for (s,) in legacy])
    held = [row[0] for row in src.execute('SELECT DISTINCT isin FROM Holdings WHERE quantity > 0 AND isin IS NOT NULL')]
    con.execute('''UPDATE universe SET
      priority_source=CASE WHEN priority_tier=1 THEN priority_source ELSE NULL END,
      priority_tier=CASE WHEN priority_tier=1 THEN 1 ELSE 2 END''')
    con.executemany("UPDATE universe SET priority_tier=0,priority_source='portfolio.db:Holdings' WHERE isin=?",
                    [(isin,) for isin in held])
    con.commit()
    src.close()
    return len(rows)


def refresh_index_priority(con: sqlite3.Connection) -> int:
    session = requests.Session()
    session.mount('https://', WindowsTrustAdapter())
    response = request(session, NIFTY500_CSV)
    digest, local = archive_bytes(response.content, '.csv')
    rows = list(csv.DictReader(io.StringIO(response.content.decode('utf-8-sig'))))
    matched = 0
    for row in rows:
        isin = (row.get('ISIN Code') or '').strip().upper()
        symbol = (row.get('Symbol') or '').strip().upper()
        result = con.execute('''UPDATE universe SET priority_tier=1,priority_source=?
          WHERE isin=? AND upper(symbol)=? AND priority_tier>1''',
          (f'{NIFTY500_CSV} sha256={digest} archive={local}', isin, symbol))
        matched += result.rowcount
    con.commit()
    return matched


def official_url(url: str) -> str | None:
    value = urljoin(NSE_HOME, url.strip())
    parsed = urlparse(value)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS:
        return None
    return value


def request(session: requests.Session, url: str, params: dict | None = None) -> requests.Response:
    # TLS verification is mandatory; a certificate problem is a source failure.
    for attempt in range(3):
        response = session.get(url, params=params, headers=HEADERS, timeout=(12, 35))
        if response.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(30, 3 * (2 ** attempt)))
            continue
        response.raise_for_status()
        return response
    response.raise_for_status()
    return response


def archive_bytes(payload: bytes, suffix: str) -> tuple[str, str]:
    digest = hashlib.sha256(payload).hexdigest()
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    target = ARCHIVE / f'{digest}{suffix}'
    if not target.exists():
        temp = target.with_suffix(target.suffix + '.part')
        temp.write_bytes(payload)
        os.replace(temp, target)
    return digest, str(target.relative_to(ROOT))


def discover_links(value: object) -> list[str]:
    links: set[str] = set()
    def walk(item: object) -> None:
        if isinstance(item, dict):
            for key, val in item.items():
                if isinstance(val, str) and any(t in key.lower() for t in
                    ('xbrl', 'attach', 'file', 'pdf', 'url', 'link')):
                    candidate = official_url(val)
                    if candidate and re.search(r'\.(pdf|xml|xhtml|html|zip)(\?|$)', candidate, re.I):
                        links.add(candidate)
                else:
                    walk(val)
        elif isinstance(item, list):
            for child in item:
                walk(child)
    walk(value)
    return sorted(links)


def recent_xbrl_links(value: object, limit: int) -> list[tuple[str, dict]]:
    """Prefer recent structured filings; never fetch every old HTML detail page."""
    if isinstance(value, dict):
        value = value.get('data', [])
    if not isinstance(value, list):
        return []
    entries: list[tuple[str, dict]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        link = official_url(str(item.get('xbrl') or '')) if item.get('xbrl') else None
        if link and urlparse(link).path.lower().endswith('.xml'):
            entries.append((link, item))
    def period_key(pair: tuple[str, dict]) -> datetime:
        label = pair[1].get('toDate') or pair[1].get('qe_Date') or '01-Jan-1900'
        try:
            return datetime.strptime(label.title(), '%d-%b-%Y')
        except ValueError:
            return datetime(1900, 1, 1)
    entries.sort(key=period_key, reverse=True)
    unique: dict[str, dict] = {}
    for link, item in entries:
        unique.setdefault(link, item)
    ordered = list(unique.items())
    if isinstance(value, list) and ordered and any('qe_Date' in item for _, item in ordered):
        annual = [(link, item) for link, item in ordered if
                  str(item.get('qe_Date', '')).upper().startswith('31-MAR') and
                  str(item.get('audited', '')).upper().startswith('AUDITED')]
        consolidated = [(link, item) for link, item in ordered if
                        str(item.get('consolidated', '')).upper() == 'CONSOLIDATED']
        preferred: dict[str, dict] = {}
        for link, item in consolidated[:2] + [pair for pair in annual if
                                                    str(pair[1].get('consolidated', '')).upper() == 'CONSOLIDATED'][:2]:
            preferred.setdefault(link, item)
        if not preferred:
            for link, item in ordered[:limit]:
                preferred.setdefault(link, item)
        return list(preferred.items())[:max(limit, 4)]
    return ordered[:limit]


def collect(con: sqlite3.Connection, limit: int, delay: float, max_documents: int) -> None:
    session = requests.Session()
    session.mount('https://', WindowsTrustAdapter())
    symbols = con.execute('''SELECT isin,symbol FROM universe WHERE UPPER(COALESCE(status,''))='ACTIVE'
                             AND UPPER(COALESCE(exchange,'NSE'))='NSE'
                             ORDER BY priority_tier,symbol''').fetchall()
    if limit > 0:
        symbols = symbols[:limit]
    consecutive_network_errors = 0
    for index, (isin, symbol) in enumerate(symbols, 1):
        for period_type in ('Quarterly', 'Annual', 'Integrated'):
            endpoint = (f'{INTEGRATED}?index=equities&symbol={quote(symbol)}'
                        f'&type=Integrated+Filing-+Financials&page=1&size=40') if period_type == 'Integrated' else \
                       f'{DISCOVERY}?index=equities&symbol={quote(symbol)}&period={period_type}'
            try:
                prior = con.execute('''SELECT response_path FROM filing_discovery
                                       WHERE isin=? AND period_type=? AND source_url=? AND status='ARCHIVED' ''',
                                    (isin,period_type,endpoint)).fetchone()
                if prior and prior[0] and (ROOT / prior[0]).exists():
                    data = json.loads((ROOT / prior[0]).read_text(encoding='utf-8'))
                else:
                    response = request(session, endpoint)
                    body = response.content
                    data = response.json()
                    digest, local = archive_bytes(body, '.json')
                    con.execute('''INSERT INTO filing_discovery
                    (isin,symbol,period_type,source_url,retrieved_at,http_status,response_sha256,response_path,status)
                    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(isin,period_type,source_url) DO UPDATE SET
                    retrieved_at=excluded.retrieved_at,http_status=excluded.http_status,
                    response_sha256=excluded.response_sha256,response_path=excluded.response_path,status=excluded.status,error=NULL''',
                    (isin,symbol,period_type,endpoint,now(),response.status_code,digest,local,'ARCHIVED'))
                for link, item in recent_xbrl_links(data, max_documents):
                    archived = con.execute('''SELECT archive_path FROM filing_document
                                              WHERE isin=? AND source_url=? AND status IN ('ARCHIVED_UNPARSED','PARSED_PARTIAL','IDENTITY_REVIEW')''',
                                           (isin,link)).fetchone()
                    if archived and archived[0] and (ROOT / archived[0]).exists():
                        continue
                    try:
                        doc = request(session, link)
                        kind = 'XBRL'
                        suffix = Path(urlparse(link).path).suffix.lower() or '.bin'
                        file_hash, file_path = archive_bytes(doc.content, suffix)
                        con.execute('''INSERT INTO filing_document
                            (isin,symbol,document_type,source_url,retrieved_at,filing_timestamp,
                             period_end,statement_scope,sha256,archive_path,content_type,status)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(isin,source_url) DO UPDATE SET
                            retrieved_at=excluded.retrieved_at,sha256=excluded.sha256,
                            archive_path=excluded.archive_path,content_type=excluded.content_type,
                            filing_timestamp=excluded.filing_timestamp,period_end=excluded.period_end,
                            statement_scope=excluded.statement_scope,status=excluded.status,error=NULL''',
                            (isin,symbol,kind,link,now(),item.get('broadCastDate') or item.get('broadcast_Date'),
                             item.get('toDate') or item.get('qe_Date'),
                             item.get('consolidated'),file_hash,file_path,doc.headers.get('Content-Type'),'ARCHIVED_UNPARSED'))
                    except Exception as exc:
                        con.execute('''INSERT INTO filing_document
                            (isin,symbol,document_type,source_url,retrieved_at,status,error)
                            VALUES(?,?,?,?,?,?,?) ON CONFLICT(isin,source_url) DO UPDATE SET
                            retrieved_at=excluded.retrieved_at,status=excluded.status,error=excluded.error''',
                            (isin,symbol,'UNKNOWN',link,now(),'SOURCE_UNAVAILABLE',str(exc)[:500]))
                    time.sleep(delay)
                consecutive_network_errors = 0
            except Exception as exc:
                con.execute('''INSERT INTO filing_discovery
                    (isin,symbol,period_type,source_url,retrieved_at,status,error)
                    VALUES(?,?,?,?,?,?,?) ON CONFLICT(isin,period_type,source_url) DO UPDATE SET
                    retrieved_at=excluded.retrieved_at,status=excluded.status,error=excluded.error''',
                    (isin,symbol,period_type,endpoint,now(),'SOURCE_UNAVAILABLE',str(exc)[:500]))
                consecutive_network_errors += 1
            con.commit()
            time.sleep(delay)
            if consecutive_network_errors >= 8:
                print('STOP: eight consecutive source failures; inspect TLS/network and filing endpoint', flush=True)
                return
        if index % 25 == 0:
            print(f'processed {index}/{len(symbols)} securities', flush=True)


def report(con: sqlite3.Connection) -> dict:
    xbrl_count = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='verified_xbrl_fact'").fetchone()
    return {
      'generated_at': now(),
      'universe': con.execute('SELECT COUNT(*) FROM universe').fetchone()[0],
      'legacy_unverified': con.execute('SELECT COUNT(*) FROM legacy_fere_status').fetchone()[0],
      'priority_tiers': dict(con.execute('SELECT priority_tier,COUNT(*) FROM universe GROUP BY priority_tier').fetchall()),
      'discovery': dict(con.execute('SELECT status,COUNT(*) FROM filing_discovery GROUP BY status').fetchall()),
      'documents': dict(con.execute('SELECT status,COUNT(*) FROM filing_document GROUP BY status').fetchall()),
      'verified_facts': con.execute("SELECT COUNT(*) FROM source_fact WHERE status='VERIFIED'").fetchone()[0],
      'xbrl_facts_with_lineage': con.execute('SELECT COUNT(*) FROM verified_xbrl_fact').fetchone()[0] if xbrl_count else 0,
      'identity_review_documents': con.execute("SELECT COUNT(*) FROM filing_document WHERE status='IDENTITY_REVIEW'").fetchone()[0],
      'verified_metrics': con.execute("SELECT COUNT(*) FROM verified_metric WHERE status='VERIFIED'").fetchone()[0],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--init', action='store_true')
    parser.add_argument('--collect', action='store_true')
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--delay', type=float, default=2.0)
    parser.add_argument('--max-documents', type=int, default=8)
    parser.add_argument('--refresh-priority', action='store_true')
    args = parser.parse_args()
    con = connect()
    if args.init or args.collect or args.refresh_priority:
        print(f'seeded {seed_universe(con)} ISIN identities', flush=True)
    if args.refresh_priority:
        print(f'prioritized {refresh_index_priority(con)} matching NIFTY 500 ISINs', flush=True)
    if args.collect:
        collect(con, args.limit, max(1.0, args.delay), max(1, args.max_documents))
    result = report(con)
    (STORE / 'coverage.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result), flush=True)
    con.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
