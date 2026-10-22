import json
import sqlite3
import hashlib
import os
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
import time
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FERE_DB = os.path.join(ROOT_DIR, 'data', 'fere', 'verified_filings', 'fere_evidence.db')
PORTFOLIO_DB = os.path.join(ROOT_DIR, 'portfolio.db')
ARCHIVE_DIR = os.path.join(ROOT_DIR, 'data', 'fere', 'verified_filings', 'archive')
MANIFEST_PATH = os.environ.get(
    'FUNDAMENTAL_MANIFEST_PATH',
    os.path.join(ROOT_DIR, 'data', 'fundamental_enrichment', 'excel_strategy_manifest.json'),
)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

def clean_num(s):
    if not s:
        return None
    cleaned = re.sub(r'[^\d.-]', '', str(s).strip())
    try:
        return float(cleaned)
    except ValueError:
        return None

def run():
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        all_symbols = set(json.load(f)['symbols'])

    conn_fere = sqlite3.connect(FERE_DB)
    cur_fere = conn_fere.cursor()
    conn_port = sqlite3.connect(PORTFOLIO_DB)
    cur_port = conn_port.cursor()

    already_pledge = {r[0].upper() for r in cur_fere.execute("SELECT DISTINCT symbol FROM shareholding_snapshot WHERE promoter_pledge IS NOT NULL").fetchall()}
    missing_competitors = {r[0].upper() for r in cur_port.execute("""SELECT symbol FROM fundamental_endpoint_snapshots
        WHERE provider='UPSTOX_FUNDAMENTALS' AND endpoint='competitors' AND status='NOT_AVAILABLE'""").fetchall()}
    secondary_with_competitors = set()
    for symbol, payload in cur_port.execute("SELECT symbol,response_json FROM fundamental_source_snapshots WHERE provider='SCREENER_SNAPSHOT' AND status='SUCCESS'").fetchall():
        try:
            if 'competitors' in json.loads(payload or '{}'):
                secondary_with_competitors.add(symbol.upper())
        except Exception:
            pass
    pending_symbols = sorted((all_symbols - already_pledge) | (missing_competitors - secondary_with_competitors))
    print(f"Remaining pending symbols for pledge, facts, or competitors: {len(pending_symbols)}")
    if not pending_symbols:
        return

    isin_map = {r[1].upper(): r[0] for r in cur_fere.execute("SELECT isin, symbol FROM universe").fetchall()}
    isin_port = {r[0].upper(): r[1] for r in cur_port.execute("SELECT symbol, isin FROM MasterTickers WHERE isin IS NOT NULL").fetchall()}
    isin_map.update(isin_port)

    session = requests.Session()
    session.headers.update(HEADERS)

    for i, sym in enumerate(pending_symbols):
        isin = isin_map.get(sym) or f"INE_PENDING_{sym}"
        search_url = f"https://www.screener.in/api/company/search/?q={sym}"
        try:
            r = session.get(search_url, timeout=5)
            results = r.json() if r.status_code == 200 else []
            matched_url = None
            for res in results:
                u = res.get('url', '')
                if f"/{sym}/" in u or not matched_url:
                    matched_url = f"https://www.screener.in{u}"
                    if f"/{sym}/" in u:
                        break

            if not matched_url and results:
                matched_url = f"https://www.screener.in{results[0]['url']}"

            if not matched_url:
                print(f"  [{i+1}/{len(pending_symbols)}] {sym} -> Not found on Screener")
                continue

            # Sleep 1.5s to avoid 429
            time.sleep(1.5)
            page = session.get(matched_url, timeout=10)
            if page.status_code != 200:
                print(f"  [{i+1}/{len(pending_symbols)}] {sym} -> HTTP {page.status_code}")
                time.sleep(2.0)
                continue

            content_bytes = page.content
            doc_sha = hashlib.sha256(content_bytes).hexdigest()
            archive_path = os.path.join(ARCHIVE_DIR, f"screener_{sym}_{doc_sha[:16]}.html")
            with open(archive_path, 'wb') as f:
                f.write(content_bytes)

            soup = BeautifulSoup(page.text, 'html.parser')

            ratios = {}
            for li in soup.find_all('li', class_='flex'):
                name_el = li.find('span', class_='name')
                val_el = li.find('span', class_='nowrap')
                if name_el and val_el:
                    ratios[name_el.text.strip()] = val_el.text.strip()

            promoter_pct = None
            pledge_pct = None
            sh_sec = soup.find('section', id='shareholding')
            if sh_sec:
                table = sh_sec.find('table')
                if table:
                    for tr in table.find_all('tr'):
                        cols = [td.text.strip() for td in tr.find_all(['th', 'td'])]
                        if cols and len(cols) >= 2:
                            cat = cols[0].lower()
                            val = clean_num(cols[-1])
                            if 'promoter' in cat:
                                promoter_pct = val
                            elif 'pledge' in cat or 'encumber' in cat:
                                pledge_pct = val

            competitors = []
            peers_sec = soup.find('section', id='peers')
            if peers_sec:
                for tr in peers_sec.find_all('tr'):
                    link = tr.find('a', href=re.compile(r'^/company/'))
                    if not link:
                        continue
                    competitors.append({
                        'name': link.get_text(' ', strip=True),
                        'url': f"https://www.screener.in{link.get('href')}",
                        'row': [cell.get_text(' ', strip=True) for cell in tr.find_all(['th', 'td'])],
                    })

            borrowings_cr = None
            bs_sec = soup.find('section', id='balance-sheet')
            if bs_sec:
                table = bs_sec.find('table')
                if table:
                    for tr in table.find_all('tr'):
                        cols = [td.text.strip() for td in tr.find_all(['th', 'td'])]
                        if cols and len(cols) >= 2 and 'borrowing' in cols[0].lower():
                            borrowings_cr = clean_num(cols[-1])

            now_iso = datetime.now(timezone.utc).isoformat()
            rel_path = os.path.relpath(archive_path, ROOT_DIR)
            cur_fere.execute("""
                INSERT OR IGNORE INTO official_source_snapshot(source_type, source_url, retrieved_at, sha256, archive_path)
                VALUES(?, ?, ?, ?, ?)
            """, ('SCREENER_HTML_SNAPSHOT', matched_url, now_iso, doc_sha, rel_path))

            if promoter_pct is not None or pledge_pct is not None:
                period_end = now_iso[:10]
                cur_fere.execute("""
                INSERT INTO shareholding_snapshot(
                    isin, symbol, period_end, promoter_holding, promoter_pledge,
                    public_holding, employee_trusts, source_url, source_sha256, available_at, status
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(isin, period_end, source_sha256) DO UPDATE SET
                    promoter_holding = excluded.promoter_holding,
                    promoter_pledge = excluded.promoter_pledge,
                    status = excluded.status
                """, (
                    isin, sym, period_end, promoter_pct, pledge_pct,
                    None, None, matched_url, doc_sha, now_iso, 'SOURCE_SUPPORTED_AGGREGATED'
                ))

            extracted_json = {
                'ratios': ratios,
                'promoter_pct': promoter_pct,
                'pledge_pct': pledge_pct,
                'borrowings_cr': borrowings_cr,
                'competitors': competitors,
                'scraped_url': matched_url
            }
            cur_port.execute("""
                INSERT INTO fundamental_source_snapshots(
                    symbol, isin, provider, authority, source_url, fetched_at, status, error, response_json
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sym, isin, 'SCREENER_SNAPSHOT', 'AGGREGATED_PORTAL', matched_url, now_iso, 'SUCCESS', None, json.dumps(extracted_json)
            ))
            conn_fere.commit()
            conn_port.commit()
            print(f"  [{i+1}/{len(pending_symbols)}] {sym} -> Promoter: {promoter_pct}, Pledge: {pledge_pct}, Debt: {borrowings_cr}, Competitors: {len(competitors)}")
            time.sleep(1.0)
        except Exception as e:
            print(f"  [{i+1}/{len(pending_symbols)}] {sym} Error: {e}")

    conn_fere.close()
    conn_port.close()
    print("[Done] Final batch of remaining symbols completed.")

if __name__ == '__main__':
    run()
