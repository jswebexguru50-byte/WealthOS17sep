#!/usr/bin/env python3
"""Index official NSE/BSE annual reports and corporate announcements (zero fabrication).

Every row is a real document/announcement returned by an exchange endpoint, with its URL.
PDFs (annual reports, concall transcripts, investor presentations) are downloaded, size-capped
and hashed (sha256 of the bytes). Rows without a downloaded file carry content_sha256=NULL and
local_path=NULL (never a guess). Text extraction is deferred.

Output: JSONL (append-only, resumable) and optionally a staging SQLite file. It refuses to
open anything named portfolio*.db. Public endpoints only; global >=1s spacing; fixed backoff.

Usage:
  python scripts/fundamental/exchange_announcements_ingest.py --limit 20 --pdf-symbols 20 --out scripts/qa/out/docs_sample.jsonl
  python scripts/fundamental/exchange_announcements_ingest.py --out scripts/qa/out/docs_stage.jsonl --pdf-symbols 100
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
from urllib.parse import quote

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
QA = os.path.join(ROOT, "scripts", "qa")
CACHE = os.path.join(QA, "out", "cache")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
MIN_GAP = 1.1            # seconds between any two HTTP requests
BACKOFF = 5.0            # fixed sleep between retries
RETRIES = 3
PDF_CAP_BYTES = 40 * 1024 * 1024   # downloads above this are skipped and logged
AR_YEARS = 5
CONCALL_MONTHS = 24      # 8 quarters
COLUMNS = ["symbol", "doc_type", "title", "published_at", "source", "url",
           "content_sha256", "local_path", "fetched_at"]
DOWNLOAD_TYPES = {"annual_report", "concall_transcript", "investor_presentation"}

DDL = ("CREATE TABLE IF NOT EXISTS ExchangeDocuments (symbol TEXT NOT NULL, doc_type TEXT NOT NULL, "
       "title TEXT, published_at TEXT, source TEXT, url TEXT NOT NULL, content_sha256 TEXT, "
       "local_path TEXT, fetched_at TEXT, PRIMARY KEY (symbol, doc_type, url))")

_last = [0.0]


def now_iso():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg):
    print("[%s] %s" % (dt.datetime.now().strftime("%H:%M:%S"), msg), flush=True)


# ---------- pure parsing / classification ----------
def parse_dt(s):
    """NSE 'dd-Mon-yyyy HH:MM:SS' (any month case) or BSE ISO. Returns ISO string or None."""
    if not s:
        return None
    s = str(s).strip()
    m = re.match(r"^(\d{2})-([A-Za-z]{3})-(\d{4})(?: (\d{2}:\d{2}:\d{2}))?$", s)
    if m:
        txt = "%s-%s-%s %s" % (m.group(1), m.group(2).title(), m.group(3), m.group(4) or "00:00:00")
        try:
            return dt.datetime.strptime(txt, "%d-%b-%Y %H:%M:%S").strftime("%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None
    for f in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            return dt.datetime.strptime(s, f).strftime("%Y-%m-%dT%H:%M:%S")
        except ValueError:
            continue
    return None


URL_RX = re.compile(r"https?://[^\s\"'<>)]+")


def classify(category, text):
    """Map exchange category + subject text to a doc_type. Keyword rules only."""
    cat = (category or "").lower()
    t = (text or "").lower()
    both = cat + " " + t
    if "transcript" in both:
        return "concall_transcript"
    if "audio" in both or "recording" in both:
        return "concall_audio_link"
    if "presentation" in both:
        return "investor_presentation"
    if ("con. call" in cat or "analyst" in cat or "investor meet" in cat
            or "earnings call" in both or "conference call" in both):
        return "concall_intimation"
    if "financial result" in both:
        return "results_filing"
    return "exchange_announcement"


def mkrow(symbol, dtype, title, pub, source, url):
    return {"symbol": symbol, "doc_type": dtype, "title": title, "published_at": pub,
            "source": source, "url": url, "content_sha256": None, "local_path": None,
            "fetched_at": now_iso()}


def nse_ann_rows(symbol, items):
    rows = []
    for it in items:
        pub = parse_dt(it.get("an_dt") or it.get("exchdisstime"))
        text = it.get("attchmntText") or ""
        dtype = classify(it.get("desc"), text)
        att = it.get("attchmntFile")
        title = ("%s: %s" % (it.get("desc") or "", text)).strip(": ")[:500]
        if att:
            rows.append(mkrow(symbol, dtype, title, pub, "NSE", att))
        if "audio" in text.lower() or "recording" in text.lower():
            for u in URL_RX.findall(text):
                rows.append(mkrow(symbol, "concall_audio_link", title, pub, "NSE", u))
    return rows


def bse_ann_rows(symbol, items):
    rows = []
    for it in items:
        pub = parse_dt(it.get("NEWS_DT") or it.get("DT_TM"))
        head = it.get("HEADLINE") or ""
        subj = it.get("NEWSSUB") or ""
        cat = (it.get("CATEGORYNAME") or "") + " " + (it.get("SUBCATNAME") or "")
        dtype = classify(cat, subj + " " + head)
        title = ("%s: %s" % (subj, head)).strip(": ")[:500]
        att = it.get("ATTACHMENTNAME")
        url = ("https://www.bseindia.com/xml-data/corpfiling/AttachLive/" + att) if att else it.get("NSURL")
        if url:
            rows.append(mkrow(symbol, dtype, title, pub, "BSE", url))
        if "audio" in head.lower() or "recording" in head.lower():
            for u in URL_RX.findall(head):
                rows.append(mkrow(symbol, "concall_audio_link", title, pub, "BSE", u))
    return rows


def nse_ar_rows(symbol, items):
    items = sorted(items, key=lambda x: str(x.get("toYr") or ""), reverse=True)[:AR_YEARS]
    return [mkrow(symbol, "annual_report", "Annual Report FY%s-%s" % (i.get("fromYr"), i.get("toYr")),
                  parse_dt(i.get("broadcast_dttm")), "NSE", i.get("fileName"))
            for i in items if i.get("fileName")]


def bse_ar_rows(symbol, items):
    items = sorted(items, key=lambda x: str(x.get("Year") or ""), reverse=True)[:AR_YEARS]
    return [mkrow(symbol, "annual_report", "Annual Report FY%s" % i.get("Year"),
                  parse_dt(i.get("Fld_AuthoriseDate")), "BSE", i.get("PDFDownload").replace("\\", ""))
            for i in items if i.get("PDFDownload")]


def within_window(row, cutoff_iso):
    return row["published_at"] is None or row["published_at"] >= cutoff_iso


def dedupe_window(rows, cutoff_iso):
    out, seen = [], set()
    for r in rows:
        if r["doc_type"] != "annual_report" and not within_window(r, cutoff_iso):
            continue
        k = (r["doc_type"], r["url"])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


# ---------- network ----------
class Client:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
        self.failures = {}
        self.warm_at = 0

    def _wait(self):
        gap = MIN_GAP - (time.time() - _last[0])
        if gap > 0:
            time.sleep(gap)
        _last[0] = time.time()

    def warm(self):
        self._wait()
        try:
            self.s.get("https://www.nseindia.com/", timeout=20)
            self.warm_at = time.time()
        except requests.RequestException as e:
            log("warm-up failed: %s" % e)

    def get(self, url, tag, headers=None, stream=False):
        if time.time() - self.warm_at > 240 and "nseindia.com/api" in url:
            self.warm()
        last = None
        for _ in range(RETRIES):
            self._wait()
            try:
                r = self.s.get(url, headers=headers, timeout=45, stream=stream)
                if r.status_code == 200:
                    return r
                last = "HTTP %d" % r.status_code
                if r.status_code in (401, 403) and "nseindia.com/api" in url:
                    self.warm()
                if r.status_code == 404:
                    break
            except requests.RequestException as e:
                last = type(e).__name__
            time.sleep(BACKOFF)
        self.failures[tag] = self.failures.get(tag, 0) + 1
        log("FAIL %s %s (%s)" % (tag, url[:120], last))
        return None


NSE_H = {"Referer": "https://www.nseindia.com/", "Accept": "application/json"}
BSE_H = {"Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com",
         "Accept": "application/json"}


def cached_json(cl, tag, key, url, headers):
    path = os.path.join(CACHE, tag, re.sub(r"[^A-Za-z0-9_.-]", "_", key) + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    r = cl.get(url, tag, headers)
    if r is None:
        return None
    try:
        data = r.json()
    except ValueError:
        cl.failures[tag] = cl.failures.get(tag, 0) + 1
        log("FAIL %s non-JSON for %s" % (tag, key))
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def fetch_symbol(cl, symbol, today):
    """Return metadata rows for one symbol (no downloads)."""
    start = today - dt.timedelta(days=730)
    cutoff = (today - dt.timedelta(days=int(CONCALL_MONTHS * 30.4))).strftime("%Y-%m-%dT00:00:00")
    rows = []
    if symbol.isdigit():  # BSE scrip code
        ar = cached_json(cl, "bse_ar", symbol,
                         "https://api.bseindia.com/BseIndiaAPI/api/AnnualReport_New/w?scripcode=%s" % symbol, BSE_H)
        if ar:
            rows += bse_ar_rows(symbol, ar.get("Table") or [])
        items, page = [], 1
        while page <= 15:
            u = ("https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=%d&strCat=-1"
                 "&strPrevDate=%s&strScrip=%s&strSearch=P&strToDate=%s&strType=C"
                 % (page, start.strftime("%Y%m%d"), symbol, today.strftime("%Y%m%d")))
            d = cached_json(cl, "bse_ann", "%s_p%d_%s" % (symbol, page, today.isoformat()), u, BSE_H)
            tbl = (d or {}).get("Table") or []
            items += tbl
            if len(tbl) < 50:
                break
            page += 1
        rows += bse_ann_rows(symbol, items)
    else:
        ar = cached_json(cl, "nse_ar", symbol,
                         "https://www.nseindia.com/api/annual-reports?index=equities&symbol=%s" % quote(symbol), NSE_H)
        if ar:
            rows += nse_ar_rows(symbol, ar.get("data") or [])
        u = ("https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=%s&from_date=%s&to_date=%s"
             % (quote(symbol), start.strftime("%d-%m-%Y"), today.strftime("%d-%m-%Y")))
        d = cached_json(cl, "nse_ann", "%s_%s" % (symbol, today.isoformat()), u, NSE_H)
        if isinstance(d, list):
            rows += nse_ann_rows(symbol, d)
    return dedupe_window(rows, cutoff)


def download(cl, row, skips):
    """Download row['url'] if document-like and under the cap; fill sha256/local_path."""
    url = row["url"]
    ext = os.path.splitext(url.split("?")[0])[1].lower()
    if ext not in (".pdf", ".zip", ".xlsx", ".xls", ".doc", ".docx", ".ppt", ".pptx"):
        return
    name = hashlib.sha1(url.encode()).hexdigest()
    rel = "/".join(["scripts", "qa", "out", "cache", "files", row["symbol"], name + ext])
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        hdr = BSE_H if "bseindia.com" in url else {"Referer": "https://www.nseindia.com/"}
        r = cl.get(url, "download", hdr, stream=True)
        if r is None and "AttachLive" in url:
            r = cl.get(url.replace("AttachLive", "AttachHis"), "download", hdr, stream=True)
        if r is None:
            return
        size = int(r.headers.get("Content-Length") or 0)
        if size > PDF_CAP_BYTES:
            skips.append({"symbol": row["symbol"], "url": url, "reason": "over_cap", "bytes": size, "cap": PDF_CAP_BYTES})
            log("SKIP over cap %d > %d %s" % (size, PDF_CAP_BYTES, url))
            r.close()
            return
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp, n = path + ".part", 0
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                n += len(chunk)
                if n > PDF_CAP_BYTES:
                    break
                f.write(chunk)
        if n > PDF_CAP_BYTES:
            os.remove(tmp)
            skips.append({"symbol": row["symbol"], "url": url, "reason": "over_cap_streamed", "bytes": n, "cap": PDF_CAP_BYTES})
            return
        for attempt in range(6):  # Windows AV/indexer can briefly lock the fresh file
            try:
                os.replace(tmp, path)
                break
            except PermissionError:
                time.sleep(1.0)
        else:
            cl.failures["download"] = cl.failures.get("download", 0) + 1
            log("FAIL could not finalize %s" % path)
            return
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    row["content_sha256"], row["local_path"] = h.hexdigest(), rel


def open_stage(path):
    if os.path.basename(path).lower().startswith("portfolio"):
        raise SystemExit("refusing to write to portfolio DB: %s" % path)
    c = sqlite3.connect(path)
    c.execute(DDL)
    return c


def load_universe():
    sys.path.insert(0, QA)
    import coverage_audit as ca
    c = ca.connect(os.path.join(ROOT, "portfolio.db"))
    syms = ca.universe(c)[0]
    c.close()
    # NSE tickers first, then BSE numeric scrip codes (stable order => stable 'first 100')
    return sorted(syms, key=lambda x: (x.isdigit(), x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(QA, "out", "docs_stage.jsonl"))
    ap.add_argument("--limit", type=int, default=0, help="first N symbols of the universe")
    ap.add_argument("--symbols", default="", help="comma list overriding the universe")
    ap.add_argument("--pdf-symbols", type=int, default=100, help="download PDFs for the first N symbols only")
    ap.add_argument("--sqlite", default="", help="optional staging sqlite file (never portfolio.db)")
    a = ap.parse_args()

    syms = [s for s in a.symbols.split(",") if s] or load_universe()
    if a.limit:
        syms = syms[:a.limit]
    state_path = a.out + ".state.json"
    done = set()
    if os.path.exists(state_path):
        with open(state_path) as f:
            done = set(json.load(f)["done"])
    stage = open_stage(a.sqlite) if a.sqlite else None
    cl = Client()
    cl.warm()
    today = dt.date.today()
    counts = {}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "a", encoding="utf-8") as out, open(a.out + ".skips.jsonl", "a", encoding="utf-8") as sk:
        for i, sym in enumerate(syms):
            if sym in done:
                continue
            rows = fetch_symbol(cl, sym, today)
            skips = []
            if i < a.pdf_symbols:
                for r in rows:
                    if r["doc_type"] in DOWNLOAD_TYPES:
                        try:
                            download(cl, r, skips)
                        except Exception as e:  # keep the run alive; row stays unhashed
                            cl.failures["download"] = cl.failures.get("download", 0) + 1
                            log("FAIL download %s: %r" % (r["url"][:100], e))
            for r in rows:
                out.write(json.dumps(r, ensure_ascii=False) + "\n")
                counts[r["doc_type"]] = counts.get(r["doc_type"], 0) + 1
                if stage:
                    stage.execute("INSERT OR REPLACE INTO ExchangeDocuments VALUES (?,?,?,?,?,?,?,?,?)",
                                  [r[c] for c in COLUMNS])
            for s in skips:
                sk.write(json.dumps(s) + "\n")
            out.flush()
            sk.flush()
            if stage:
                stage.commit()
            done.add(sym)
            if len(done) % 10 == 0 or i == len(syms) - 1:
                with open(state_path, "w") as f:
                    json.dump({"done": sorted(done)}, f)
                log("progress %d/%d %s fails=%s" % (i + 1, len(syms), counts, cl.failures))
    with open(state_path, "w") as f:
        json.dump({"done": sorted(done)}, f)
    log("DONE counts=%s failures=%s" % (counts, cl.failures))


if __name__ == "__main__":
    main()
