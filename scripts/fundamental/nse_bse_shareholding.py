#!/usr/bin/env python3
"""Populate HistoricalShareholdingPattern.pledge_pct from official NSE shareholding XBRL.

UNITS / CONVENTION (matches f_filter_engine F5, which passes if pledge <= 0.01):
  pledge_pct = shares pledged/encumbered by promoters as PERCENT POINTS of the
  PROMOTER's own holding (0..100), the Screener-style "pledged percentage".
  If a filing only reports pledge as % of TOTAL shares, it is converted:
      pledge_of_promoter = pledge_of_total / promoter_pct_of_total * 100
  NULL = unknown (never written as 0 unless the filing explicitly says no encumbrance).

Stdlib only, no LLM. Dry-run by default; --apply writes in one transaction.
Raw downloads cached under --cache-dir; reruns make zero network calls.
NOTE: XBRL tag names below follow the pre-existing enrich_pledge_official.py list and
were not re-verified against live NSE payloads in this offline build.
BSE: no stable bulk endpoint implemented; use --master-file to feed any NSE-shaped JSON.
"""
import argparse
import hashlib
import http.cookiejar
import json
import os
import sqlite3
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

NSE_HOME = "https://www.nseindia.com/"
NSE_MASTER = "https://www.nseindia.com/api/corporate-share-holdings-master?index=equities"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/128.0.0.0 Safari/537.36")

# % of PROMOTER holding (preferred)
PROMOTER_BASIS_TAGS = (
    "PledgedOrEncumberedSharesAsPercentageOfPromoterShares",
    "SharesPledgedOrOtherwiseEncumberedAsAPercentageOfTotalSharesHeld",
    "ShareholdingAsAPercentageOfTotalSharesHeldPledgedOrOtherwiseEncumbered",
    "PercentageOfSharesPledgedOrOtherwiseEncumbered",
)
# % of TOTAL company shares (needs conversion)
TOTAL_BASIS_TAGS = (
    "EncumberedShareUnderPledgedAsPercentageOfTotalNumberOfShares",
    "EncumberedSharesHeldAsPercentageOfTotalNumberOfShares",
)
FLAG_TAG = "WhetherAnySharesHeldByPromotersAreEncumberedUnderPledged"


# ---------------------------------------------------------------- pure parsers
def _local(tag):
    return tag.rsplit("}", 1)[-1].split(":")[-1]


def _num(text):
    try:
        return float(str(text).replace(",", "").replace("%", "").strip())
    except (ValueError, TypeError):
        return None


def parse_pledge_xbrl(payload, promoter_pct=None):
    """Return (pledge_pct_of_promoter_holding | None, reason).

    None means unknown/skip. Values outside 0..100 are rejected (reason 'out_of_range').
    """
    try:
        root = ET.fromstring(payload)
    except Exception:
        return None, "bad_xml"
    flag = None
    prom, tot = [], []
    for el in root.iter():
        t = _local(el.tag)
        txt = (el.text or "").strip()
        if not txt:
            continue
        if FLAG_TAG in t:
            low = txt.lower()
            if low in ("false", "0", "no"):
                flag = False
            elif low in ("true", "1", "yes"):
                flag = True
        elif t in PROMOTER_BASIS_TAGS:
            v = _num(txt)
            if v is not None:
                prom.append(v)
        elif t in TOTAL_BASIS_TAGS:
            v = _num(txt)
            if v is not None:
                tot.append(v)
    if flag is False:
        return 0.0, "no_encumbrance"
    if prom:
        v = max(prom)
        return (v, "promoter_basis") if 0 <= v <= 100 else (None, "out_of_range")
    if tot:
        v = max(tot)
        if not 0 <= v <= 100:
            return None, "out_of_range"
        if v == 0:
            return 0.0, "total_basis_zero"
        if not promoter_pct or promoter_pct <= 0:
            return None, "total_basis_no_promoter_pct"
        c = v / promoter_pct * 100.0
        return (round(c, 4), "total_basis_converted") if 0 <= c <= 100.0001 else (None, "out_of_range")
    if flag is True:
        return None, "encumbered_but_no_pct"  # fail closed
    return None, "no_pledge_data"  # absent tags are NOT evidence of zero


def normalize_date(raw):
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(raw).strip().title(), fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_master(text):
    """NSE master JSON -> list of dicts {symbol, as_of, xbrl, promoter_pct}."""
    data = json.loads(text)
    items = data if isinstance(data, list) else data.get("data", [])
    out = []
    for it in items:
        sym = str(it.get("symbol", "")).strip().upper()
        d = normalize_date(it.get("date") or it.get("asOnDate") or "")
        url = it.get("xbrl")
        if not sym or not d or not url or url == "-":
            continue
        out.append({"symbol": sym, "as_of": d, "xbrl": url,
                    "promoter_pct": _num(it.get("pr_and_prgrp"))})
    return out


# ---------------------------------------------------------------- network/cache
class Fetcher:
    def __init__(self, cache_dir, delay=0.4, retries=3, backoff=5.0, opener=None):
        self.cache_dir, self.delay, self.retries, self.backoff = cache_dir, delay, retries, backoff
        self.net_calls = 0
        os.makedirs(cache_dir, exist_ok=True)
        self._opener = opener
        self._warm = False

    def _open(self):
        if self._opener is None:
            self._opener = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        return self._opener

    def _path(self, url):
        return os.path.join(self.cache_dir, "raw_" + hashlib.sha256(url.encode()).hexdigest() + ".bin")

    def get(self, url):
        p = self._path(url)
        if os.path.exists(p):
            with open(p, "rb") as f:
                return f.read()
        op = self._open()
        if not self._warm:
            try:
                op.open(urllib.request.Request(NSE_HOME, headers={"User-Agent": UA}), timeout=20).read()
            except Exception:
                pass
            self._warm = True
        last = None
        for i in range(self.retries):
            try:
                self.net_calls += 1
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": NSE_HOME,
                                                           "Accept": "*/*"})
                data = op.open(req, timeout=25).read()
                time.sleep(self.delay)
                if len(data) > 50:
                    with open(p, "wb") as f:
                        f.write(data)
                    return data
                last = "short body"
            except Exception as e:  # noqa
                last = e
            time.sleep(self.backoff)
        print(f"  fetch failed {url}: {last}", file=sys.stderr)
        return None


# ---------------------------------------------------------------- DB
def has_column(conn, table, col):
    return any(r[1] == col for r in conn.execute(f"PRAGMA table_info({table})"))


def open_db(path, write):
    if write:
        return sqlite3.connect(path)
    uri = "file:" + os.path.abspath(path).replace("\\", "/") + "?mode=ro"
    return sqlite3.connect(uri, uri=True)


def build_updates(master_items, db_pairs, get_payload, log=print):
    """db_pairs: set of (symbol, as_of_date) present in table. Returns list of (pledge, symbol, as_of)."""
    updates, skipped = [], {}
    for it in master_items:
        key = (it["symbol"], it["as_of"])
        if key not in db_pairs:
            skipped["no_db_row"] = skipped.get("no_db_row", 0) + 1
            continue
        payload = get_payload(it["xbrl"])
        if payload is None:
            skipped["fetch_failed"] = skipped.get("fetch_failed", 0) + 1
            continue
        v, why = parse_pledge_xbrl(payload, it["promoter_pct"])
        if v is None:
            skipped[why] = skipped.get(why, 0) + 1
            if why == "out_of_range":
                log(f"  skip {key}: pledge out of range")
            continue
        updates.append((v, it["symbol"], it["as_of"]))
    return updates, skipped


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default="portfolio.db")
    ap.add_argument("--cache-dir", required=True)
    ap.add_argument("--master-file", help="local NSE-shaped master JSON (skips master download)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(argv)

    conn = open_db(a.db, write=False)
    colok = has_column(conn, "HistoricalShareholdingPattern", "pledge_pct")
    if a.apply and not colok:
        print("ERROR: pledge_pct column missing. Run the app once (npm run dev / npm start) "
              "so migration v16 in src/server/database.ts applies, then rerun --apply.")
        return 2
    pairs = {(r[0], r[1]) for r in conn.execute(
        "SELECT symbol, as_of_date FROM HistoricalShareholdingPattern WHERE as_of_date IS NOT NULL")}
    conn.close()

    f = Fetcher(a.cache_dir, delay=a.delay)
    if a.master_file:
        text = open(a.master_file, encoding="utf-8").read()
    else:
        raw = f.get(NSE_MASTER)
        if raw is None:
            print("ERROR: could not obtain NSE master")
            return 1
        text = raw.decode("utf-8", "replace")
    items = parse_master(text)
    if a.limit:
        items = items[:a.limit]
    updates, skipped = build_updates(items, pairs, f.get)
    print(f"master items={len(items)} db_rows={len(pairs)} updates={len(updates)} "
          f"skipped={skipped} network_calls={f.net_calls} pledge_col={'yes' if colok else 'NO (apply blocked)'}")
    for u in updates[:10]:
        print("  sample:", u)
    if not a.apply:
        print("DRY-RUN: no writes. Use --apply to write.")
        return 0
    conn = open_db(a.db, write=True)
    try:
        with conn:
            n = 0
            for v, s, d in updates:
                n += conn.execute("UPDATE HistoricalShareholdingPattern SET pledge_pct=? "
                                  "WHERE symbol=? AND as_of_date=?", (v, s, d)).rowcount
        print(f"APPLIED: {n} rows updated")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
