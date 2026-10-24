"""BSE filing archive primitives. Network collection is intentionally separate.
Only official BSE attachment URLs, ISIN-resolved identities and content hashes may enter FERE."""
from __future__ import annotations
import hashlib, sqlite3
from pathlib import Path
from urllib.parse import urlparse
OFFICIAL={'www.bseindia.com','bseindia.com','api.bseindia.com'}
def official_bse_url(url:str)->bool:
 p=urlparse(url); return p.scheme=='https' and p.hostname in OFFICIAL
def resolve_identity(con:sqlite3.Connection,scrip:str):
 r=con.execute("SELECT isin,symbol FROM MasterTickers WHERE symbol=? OR symbol=? LIMIT 1",(scrip,str(scrip).zfill(6))).fetchone()
 return {'isin':r[0],'symbol':r[1]} if r and r[0] else None
def archive_filing(con:sqlite3.Connection, root:Path, isin:str, symbol:str, url:str, payload:bytes, content_type='application/xml'):
 if not official_bse_url(url): raise ValueError('BSE_OFFICIAL_URL_REQUIRED')
 digest=hashlib.sha256(payload).hexdigest(); archive=root/'data/fere/verified_filings/archive'; archive.mkdir(parents=True,exist_ok=True)
 suffix='.xml' if 'xml' in content_type.lower() or url.lower().endswith('.xml') else '.bin'; target=archive/f'{digest}{suffix}'
 if not target.exists(): target.write_bytes(payload)
 con.execute('''INSERT INTO filing_document(isin,symbol,document_type,source_url,retrieved_at,sha256,archive_path,content_type,status)
 VALUES(?,?, 'BSE_XBRL',?,datetime('now'),?,?,?,'ARCHIVED_UNPARSED')
 ON CONFLICT(isin,source_url) DO UPDATE SET retrieved_at=excluded.retrieved_at,sha256=excluded.sha256,archive_path=excluded.archive_path,status='ARCHIVED_UNPARSED',error=NULL''',(isin,symbol,url,digest,str(target.relative_to(root)),content_type)); con.commit(); return digest
