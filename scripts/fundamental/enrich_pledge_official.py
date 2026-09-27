import json
import sqlite3
import hashlib
import os
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import time

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FERE_DB = os.path.join(ROOT_DIR, 'data', 'fere', 'verified_filings', 'fere_evidence.db')
ARCHIVE_DIR = os.path.join(ROOT_DIR, 'data', 'fere', 'verified_filings', 'archive')
MANIFEST_PATH = os.environ.get(
    'FUNDAMENTAL_MANIFEST_PATH',
    os.path.join(ROOT_DIR, 'data', 'fundamental_enrichment', 'excel_strategy_manifest.json'),
)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://www.nseindia.com/'
}

def parse_pledge_from_xml(payload: bytes) -> tuple[float | None, bool]:
    """Parse pledge percentage accurately from official NSE XBRL."""
    try:
        root = ET.fromstring(payload)
    except Exception:
        return None, False

    has_encumbrance_flag = None
    for elem in root.iter():
        tag = elem.tag.rsplit('}', 1)[-1].split(':')[-1]
        if 'WhetherAnySharesHeldByPromotersAreEncumberedUnderPledged' in tag:
            text = str(elem.text or '').strip().lower()
            if text in ('false', '0', 'no'):
                has_encumbrance_flag = False
            elif text in ('true', '1', 'yes'):
                has_encumbrance_flag = True

    if has_encumbrance_flag is False:
        return 0.0, True

    exact_tags = {
        'EncumberedShareUnderPledgedAsPercentageOfTotalNumberOfShares',
        'EncumberedSharesHeldAsPercentageOfTotalNumberOfShares',
        'SharesPledgedOrOtherwiseEncumberedAsAPercentageOfTotalSharesHeld',
        'ShareholdingAsAPercentageOfTotalSharesHeldPledgedOrOtherwiseEncumbered',
        'PercentageOfSharesPledgedOrOtherwiseEncumbered',
        'PledgedOrEncumberedSharesAsPercentageOfPromoterShares'
    }
    values = []
    for elem in root.iter():
        tag = elem.tag.rsplit('}', 1)[-1].split(':')[-1]
        if tag in exact_tags and elem.text:
            try:
                v = float(str(elem.text).replace(',', '').replace('%', '').strip())
                if 0 <= v <= 100:
                    values.append(v)
            except:
                pass

    if values:
        return max(values), True
    if has_encumbrance_flag is True:
        # Encumbrance was declared true, but percentage tag was not matched; fail closed as None
        return None, False
    return 0.0, True

def run():
    print("[Enrichment Step 1] Ingesting Official NSE Shareholding & Promoter Pledge...")
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        target_symbols = set(json.load(f)['symbols'])

    conn = sqlite3.connect(FERE_DB)
    cur = conn.cursor()

    # Load master shareholding snapshot
    row = cur.execute("SELECT archive_path FROM official_source_snapshot WHERE source_type='NSE_SHAREHOLDING_MASTER' ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        print("ERROR: NSE_SHAREHOLDING_MASTER snapshot not found")
        return

    master_path = os.path.join(ROOT_DIR, row[0])
    with open(master_path, 'r', encoding='utf-8') as f:
        master_data = json.load(f)

    items = master_data if isinstance(master_data, list) else master_data.get('data', [])
    matched_items = {str(it.get('symbol', '')).upper(): it for it in items if str(it.get('symbol', '')).upper() in target_symbols}

    print(f"Matched {len(matched_items)} / {len(target_symbols)} symbols in official NSE shareholding master.")

    session = requests.Session()
    session.headers.update(HEADERS)

    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    success_count = 0

    isin_map = {row[1].upper(): row[0] for row in cur.execute('SELECT isin, symbol FROM universe').fetchall()}

    for sym, it in matched_items.items():
        isin = it.get('isin') or isin_map.get(sym)
        if not isin:
            print(f"  [{sym}] Warning: ISIN missing, skipping")
            continue
        raw_date = it.get('date') or it.get('asOnDate') or '2026-06-30'
        period = '2026-06-30'
        for fmt in ('%d-%b-%Y', '%d-%m-%Y', '%Y-%m-%d'):
            try:
                period = datetime.strptime(str(raw_date).title(), fmt).date().isoformat()
                break
            except ValueError:
                pass

        promoter = float(it['pr_and_prgrp']) if it.get('pr_and_prgrp') else None
        public = float(it['public_val']) if it.get('public_val') else None
        trusts = float(it['employeeTrusts']) if it.get('employeeTrusts') else None
        xbrl_url = it.get('xbrl')

        if not xbrl_url:
            continue

        # Check if already archived
        digest = hashlib.sha256(xbrl_url.encode('utf-8')).hexdigest()
        target_file = os.path.join(ARCHIVE_DIR, f"shp_{digest}.xml")

        payload = None
        if os.path.exists(target_file):
            with open(target_file, 'rb') as f:
                payload = f.read()
            doc_sha = hashlib.sha256(payload).hexdigest()
        else:
            try:
                resp = session.get(xbrl_url, timeout=12)
                if resp.status_code == 200 and len(resp.content) > 100:
                    payload = resp.content
                    doc_sha = hashlib.sha256(payload).hexdigest()
                    with open(target_file, 'wb') as f:
                        f.write(payload)
                time.sleep(0.15) # Polite delay
            except Exception as e:
                print(f"  [{sym}] download failed: {e}")
                continue

        if payload:
            pledge_val, is_valid = parse_pledge_from_xml(payload)
            now_iso = datetime.now(timezone.utc).isoformat()
            
            # Insert into official_source_snapshot
            rel_archive = os.path.relpath(target_file, ROOT_DIR)
            cur.execute("""
                INSERT OR IGNORE INTO official_source_snapshot(source_type, source_url, retrieved_at, sha256, archive_path)
                VALUES(?, ?, ?, ?, ?)
            """, ('NSE_SHAREHOLDING_XBRL', xbrl_url, now_iso, doc_sha, rel_archive))

            # Upsert into shareholding_snapshot
            cur.execute("""
                INSERT INTO shareholding_snapshot(
                    isin, symbol, period_end, promoter_holding, promoter_pledge,
                    public_holding, employee_trusts, source_url, source_sha256, available_at, status
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(isin, period_end, source_sha256) DO UPDATE SET
                    promoter_holding = excluded.promoter_holding,
                    promoter_pledge = excluded.promoter_pledge,
                    public_holding = excluded.public_holding,
                    employee_trusts = excluded.employee_trusts,
                    status = excluded.status
            """, (
                isin, sym, period, promoter, pledge_val,
                public, trusts, xbrl_url, doc_sha, now_iso, 'VERIFIED_OFFICIAL'
            ))
            success_count += 1
            if success_count % 15 == 0 or success_count == len(matched_items):
                conn.commit()
                print(f"  Processed {success_count}/{len(matched_items)}: {sym} -> Promoter: {promoter}%, Pledge: {pledge_val}%")

    conn.commit()
    conn.close()
    print(f"[Enrichment Step 1 Finished] Successfully enriched {success_count} symbols with official promoter pledge.")

if __name__ == '__main__':
    run()
