#!/usr/bin/env python3
"""Official NSE shareholding-pattern (Reg 31) ingestion: promoter / FII / DII / MF / public / pledge.

ZERO FABRICATION: every staged number is parsed from an official NSE filing
(corporate-share-holdings-master JSON index + the filed SHP XBRL instance). Unknown = null.

Sources (public, no login):
  index : https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=SYM
  xbrl  : https://nsearchives.nseindia.com/corporate/xbrl/SHP_*.xml  (url taken from the index row)
BSE: api.bseindia.com answers HTTP 403 to non-browser clients (bot detection; not bypassed), so
BSE-only numeric scrip codes are reported as unavailable instead of being guessed.

UNITS: all *_pct are PERCENT POINTS (0..100) of total shares. pledge_pct is % of the PROMOTER's own
shares (Screener-style) = pledged shares / promoter shares * 100 from the filed share counts.
NSE changed XBRL unit conventions (percent before Dec-2025, fraction after); the scale is decided per
file by cross-checking reported pct against filed share counts, never assumed.

Modes (stdlib only, no LLM):
  --stage-only (default)  fetch + parse -> JSONL stage file. NEVER touches portfolio.db writes.
  --apply                 load a stage file into table ShareholdingOfficial (CREATE IF NOT EXISTS,
                          provenance columns). Dry-run unless --yes is also given.
Raw responses are cached gzip under scripts/qa/out/cache; reruns make zero network calls. Resumable.
"""
import argparse
import gzip
import hashlib
import http.cookiejar
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

NSE_HOME = "https://www.nseindia.com/"
NSE_WARM = "https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern"
NSE_MASTER = "https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol={sym}"
SOURCE_XBRL = "NSE_SHP_XBRL"
SOURCE_INDEX = "NSE_SHP_INDEX_JSON"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/128.0.0.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(ROOT, "scripts", "qa", "out")
DEFAULT_CACHE = os.path.join(OUT_DIR, "cache")
DEFAULT_STAGE = os.path.join(OUT_DIR, "shareholding_stage.jsonl")

# XBRL category members (dimension CategoryOfShareholdersAxis), lower-cased
M_PROMOTER = "shareholdingofpromoterandpromotergroupmember"
M_PUBLIC = "publicshareholdingmember"
M_TOTAL = "shareholdingpatternmember"
M_MF = "mutualfundsorutimember"
M_FII = "institutionsforeignmember"
M_DII = "institutionsdomesticmember"
CATS = {"promoter": M_PROMOTER, "public": M_PUBLIC, "mf": M_MF, "fii": M_FII, "dii": M_DII}

PCT_TAG = "ShareholdingAsAPercentageOfTotalNumberOfShares"
SHARES_TAG = "NumberOfShares"
# pledge facts (new schema 2025+, old schema)
PLEDGE_SHARES_TAGS = ("NumberOfSharesEncumberedUnderPledged", "PledgedOrEncumberedNumberOfShares")
PLEDGE_PCT_TAGS = ("EncumberedShareUnderPledgedAsPercentageOfTotalNumberOfShares",
                   "PledgedOrEncumberedSharesHeldAsPercentageOfTotalNumberOfShares")
FLAG_TAGS = ("WhetherAnySharesHeldByPromotersAreEncumberedUnderPledged",
             "WhetherAnySharesHeldByPromotersArePledgeOrOtherwiseEncumbered")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- pure parsers
def _local(tag):
    return tag.rsplit("}", 1)[-1].split(":")[-1]


def _num(text):
    try:
        return float(str(text).replace(",", "").replace("%", "").strip())
    except (ValueError, TypeError):
        return None


def normalize_date(raw):
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(raw).strip().title(), fmt).date().isoformat()
        except ValueError:
            pass
    return None


def is_quarter_end(iso):
    return iso is not None and iso[5:] in ("03-31", "06-30", "09-30", "12-31")


def parse_index(text):
    """NSE per-symbol index JSON -> newest-first list of quarter-end filings (one per period).

    Non-quarter-end dates and superseded duplicates are dropped; for a repeated period the filing
    with the latest broadcastDate wins (revisions).
    """
    data = json.loads(text)
    items = data if isinstance(data, list) else data.get("data", [])
    best = {}
    for it in items:
        d = normalize_date(it.get("date") or "")
        if not is_quarter_end(d):
            continue
        bc = it.get("broadcastDate") or ""
        try:
            bk = datetime.strptime(bc.title(), "%d-%b-%Y %H:%M:%S")
        except ValueError:
            bk = datetime.min
        cur = best.get(d)
        if cur is None or bk >= cur[0]:
            best[d] = (bk, it)
    out = []
    for d in sorted(best, reverse=True):
        it = best[d][1]
        xb = it.get("xbrl")
        out.append({
            "symbol": str(it.get("symbol", "")).strip().upper(), "quarter_end": d,
            "xbrl": xb if xb and xb != "-" else None,
            "promoter_pct": _num(it.get("pr_and_prgrp")), "public_pct": _num(it.get("public_val")),
            "filing_date": normalize_date(it.get("submissionDate") or "") or None,
            "record_id": it.get("recordId"),
        })
    return out


def _schema_is_fraction(root_text_head):
    m = re.search(r'in-bse-shp-(\d{4}-\d{2}-\d{2})\.xsd', root_text_head)
    return bool(m and m.group(1) >= "2025-10-31"), (m.group(1) if m else None)


def _decide_scale(reported, count_ratio, anchor, schema_fraction):
    """Return 1 (value already percent) or 100 (value is fraction) or None (cannot tell)."""
    if reported is None:
        return None
    refs = [r for r in (count_ratio, anchor) if r is not None]
    for ref in refs:
        if abs(reported - ref) <= 0.6:
            return 1
        if abs(reported * 100 - ref) <= 0.6:
            return 100
    if refs:
        return None  # disagrees with filed counts and index under both scales: refuse
    if reported == 0:
        return 100 if schema_fraction else 1  # 0 is the same either way; only flags the schema
    return None


def parse_shp_xbrl(payload, anchor_promoter_pct=None):
    """Parse one SHP XBRL instance -> dict (values None when not filed/not verifiable).

    anchor_promoter_pct: promoter % from the NSE index JSON (percent points), used as a unit anchor.
    """
    res = {"promoter_pct": None, "fii_pct": None, "dii_pct": None, "mf_pct": None, "public_pct": None,
           "pledge_pct": None, "pledged_shares": None, "promoter_shares": None, "total_shares": None,
           "pledge_status": "unknown", "pledge_basis": None, "flags": []}
    try:
        text = payload.decode("utf-8", "replace") if isinstance(payload, bytes) else payload
        root = ET.fromstring(payload)
    except Exception:
        res["flags"].append("bad_xml")
        return res
    sf, schema = _schema_is_fraction(text[:6000])
    res["schema"] = schema
    ctx = {}
    for c in root.iter():
        if _local(c.tag) == "context":
            ctx[c.get("id")] = [(m.text or "").split(":")[-1].strip().lower()
                                for m in c.iter() if _local(m.tag) == "explicitMember"]
    pct, shares, pshares, ppct = {}, {}, {}, {}
    flag = None
    for e in root:
        t = _local(e.tag)
        txt = (e.text or "").strip()
        if not txt:
            continue
        if t in FLAG_TAGS:
            low = txt.lower()
            flag = True if low in ("true", "1", "yes") else (False if low in ("false", "0", "no") else flag)
            continue
        mem = ctx.get(e.get("contextRef"), [])
        if len(mem) != 1:
            continue
        mem = mem[0]
        v = _num(txt)
        if v is None:
            continue
        if t == PCT_TAG:
            pct.setdefault(mem, v)
        elif t == SHARES_TAG:
            shares.setdefault(mem, v)
        elif t in PLEDGE_SHARES_TAGS:
            pshares.setdefault(mem, v)
            if t == PLEDGE_SHARES_TAGS[1]:
                res["pledge_basis"] = "pledged_or_encumbered"
            else:
                res["pledge_basis"] = "pledged"
        elif t in PLEDGE_PCT_TAGS:
            ppct.setdefault(mem, v)
    tot_sh = shares.get(M_TOTAL)
    res["total_shares"] = tot_sh
    res["promoter_shares"] = shares.get(M_PROMOTER)

    def ratio(mem):
        if tot_sh and mem in shares and tot_sh > 0:
            return shares[mem] / tot_sh * 100.0
        return None

    scale = _decide_scale(pct.get(M_PROMOTER), ratio(M_PROMOTER), anchor_promoter_pct, sf)
    if scale is None:
        res["flags"].append("unit_unverified")
    else:
        for key, mem in CATS.items():
            if mem in pct:
                val = round(pct[mem] * scale, 4)
                if 0 <= val <= 100.0001:
                    res[key + "_pct"] = val
                else:
                    res["flags"].append("out_of_range_" + key)
        pp, pb = res["promoter_pct"], res["public_pct"]
        if pp is not None and pb is not None and pp + pb > 100.5:
            res["flags"].append("promoter_public_sum_gt_100")
            for k in ("promoter_pct", "public_pct"):
                res[k] = None
        inst = [res[k] for k in ("fii_pct", "dii_pct") if res[k] is not None]
        if res["public_pct"] is not None and inst and sum(inst) > res["public_pct"] + 0.6:
            res["flags"].append("institutions_gt_public")  # institutions are a subset of public
            res["fii_pct"] = res["dii_pct"] = res["mf_pct"] = None
    # ---- pledge (of promoter shares)
    ps, prs = pshares.get(M_PROMOTER), shares.get(M_PROMOTER)
    if flag is False:
        res["pledge_pct"], res["pledge_status"] = 0.0, "none_reported"
        res["pledged_shares"] = 0
    elif ps is not None and prs and prs > 0 and ps >= 0:
        v = round(ps / prs * 100.0, 4)
        if v <= 100.0001:
            res["pledge_pct"], res["pledged_shares"] = v, ps
            res["pledge_status"] = "pledged" if ps > 0 else "none_reported"
            rp = ppct.get(M_PROMOTER)
            if rp is not None and abs(rp - v) > 0.6 and abs(rp * 100 - v) > 0.6:
                res["flags"].append("pledge_pct_mismatch_reported")
        else:
            res["flags"].append("pledge_out_of_range")
    elif ps is None and flag is True:
        res["flags"].append("pledge_flag_true_no_count")  # fail closed: leave NULL
    return res


# ---------------------------------------------------------------- network/cache
def _valid_json(data):
    try:
        json.loads(data.decode("utf-8"))
        return True
    except Exception:
        return False


class Fetcher:
    """Rate-limited (>=1s between network calls), fixed backoff, gzip disk cache, cookie warm-up."""

    def __init__(self, cache_dir=DEFAULT_CACHE, delay=1.0, retries=3, backoff=5.0, opener=None,
                 referer=NSE_HOME, warm_urls=(NSE_HOME, NSE_WARM), json_ttl_days=7.0):
        self.cache_dir, self.retries, self.backoff = cache_dir, retries, backoff
        self.delay = max(1.0, float(delay))  # hard floor: never faster than 1 req/s
        self.referer, self.warm_urls, self.json_ttl = referer, warm_urls, json_ttl_days * 86400
        self.net_calls = self.cache_hits = 0
        self.failures = []
        self._last = 0.0
        self._opener = opener
        self._warm = False
        os.makedirs(cache_dir, exist_ok=True)

    def _open(self):
        if self._opener is None:
            self._opener = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        return self._opener

    def _path(self, url):
        return os.path.join(self.cache_dir, "raw_" + hashlib.sha256(url.encode()).hexdigest() + ".gz")

    def _throttle(self):
        wait = self.delay - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.time()

    def _do_warm(self):
        for u in self.warm_urls:
            self._throttle()
            try:
                self._open().open(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=20).read()
            except Exception:
                pass  # NSE home may 403 once; the listing page sets the cookies
        self._warm = True

    def cached(self, url, is_json):
        p = self._path(url)
        if not os.path.exists(p):
            return None
        if is_json and self.json_ttl and time.time() - os.path.getmtime(p) > self.json_ttl:
            return None
        with gzip.open(p, "rb") as f:
            return f.read()

    def get(self, url, is_json=True):
        data = self.cached(url, is_json)
        if data is not None:
            self.cache_hits += 1
            return data
        if not self._warm:
            self._do_warm()
        last = None
        for i in range(self.retries):
            self._throttle()
            try:
                self.net_calls += 1
                req = urllib.request.Request(url, headers={
                    "User-Agent": UA, "Referer": self.referer, "Accept-Language": "en-US,en;q=0.9",
                    "Accept": "application/json, text/plain, */*" if is_json else "*/*"})
                data = self._open().open(req, timeout=30).read()
                if len(data) > 20 or (is_json and _valid_json(data)):
                    tmp = self._path(url) + ".tmp"
                    with gzip.open(tmp, "wb", compresslevel=6) as f:
                        f.write(data)
                    os.replace(tmp, self._path(url))
                    return data
                last = "short body"
            except Exception as e:  # noqa
                last = e
                if "403" in str(e) or "401" in str(e):
                    self._warm = False
                    self._do_warm()
            time.sleep(self.backoff)  # fixed backoff
        self.failures.append((url, str(last)))
        print(f"  fetch failed {url}: {last}", file=sys.stderr)
        return None


# ---------------------------------------------------------------- stage pipeline
def load_universe(db, symbols_arg=None, limit=0, offset=0, stride=0):
    if symbols_arg:
        syms = [s.strip().upper() for s in symbols_arg.split(",") if s.strip()]
    else:
        sys.path.insert(0, os.path.join(ROOT, "scripts", "qa"))
        import coverage_audit as ca  # universe definition lives there
        c = ca.connect(db)
        syms = ca.universe(c)[0]
        c.close()
    if stride:
        syms = syms[::stride]
    syms = syms[offset:]
    return syms[:limit] if limit else syms


def read_done(path):
    done = set()
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                    done.add((r["symbol"], r["quarter_end"]))
                except Exception:
                    pass
    return done


def stage_record(sym, row, parsed, source, url):
    rec = {"symbol": sym, "quarter_end": row["quarter_end"], "source": source, "source_url": url,
           "filing_date": row["filing_date"], "fetched_at": now_iso(), "record_id": row.get("record_id")}
    for k in ("promoter_pct", "fii_pct", "dii_pct", "mf_pct", "public_pct", "pledge_pct", "pledged_shares",
              "promoter_shares", "total_shares", "pledge_status", "pledge_basis"):
        rec[k] = parsed.get(k)
    rec["flags"] = parsed.get("flags", [])
    return rec


def run_stage(symbols, fetcher, stage_path, quarters=8, log=print, fail_path=None):
    """Depth-major so every symbol gets its latest quarter before older ones (resumable)."""
    done = read_done(stage_path)
    idx = {}
    nonnse = []
    for s in symbols:
        if s.isdigit():  # BSE scrip code: no official NSE series and BSE API is 403
            nonnse.append(s)
            continue
        raw = fetcher.get(NSE_MASTER.format(sym=s))
        if raw is None:
            continue
        try:
            idx[s] = parse_index(raw.decode("utf-8", "replace"))[:quarters]
        except Exception as e:
            log(f"  index parse failed {s}: {e}")
    log(f"index ready: {len(idx)} symbols, bse_only_skipped={len(nonnse)}, net={fetcher.net_calls}")
    out = open(stage_path, "a", encoding="utf-8")
    n = 0
    try:
        for depth in range(quarters):
            for s, rows in idx.items():
                if depth >= len(rows) or (s, rows[depth]["quarter_end"]) in done:
                    continue
                row = rows[depth]
                parsed, source, url = None, None, None
                if row["xbrl"]:
                    xb = fetcher.get(row["xbrl"], is_json=False)
                    if xb is not None:
                        parsed = parse_shp_xbrl(xb, row["promoter_pct"])
                        source, url = SOURCE_XBRL, row["xbrl"]
                if parsed is None:  # index-only fallback: promoter/public as filed, rest unknown
                    parsed = {"promoter_pct": row["promoter_pct"], "public_pct": row["public_pct"],
                              "flags": ["xbrl_unavailable"]}
                    source, url = SOURCE_INDEX, NSE_MASTER.format(sym=s)
                rec = stage_record(s, row, parsed, source, url)
                out.write(json.dumps(rec) + "\n")
                out.flush()
                done.add((s, row["quarter_end"]))
                n += 1
                if n % 100 == 0:
                    log(f"  depth {depth}: staged {n} rows, net={fetcher.net_calls}, cache={fetcher.cache_hits}")
    finally:
        out.close()
    if fail_path and fetcher.failures:
        with open(fail_path, "a", encoding="utf-8") as f:
            for u, e in fetcher.failures:
                f.write(json.dumps({"url": u, "error": e, "at": now_iso()}) + "\n")
    return {"symbols_indexed": len(idx), "bse_only_skipped": nonnse, "rows_staged": n,
            "net_calls": fetcher.net_calls, "cache_hits": fetcher.cache_hits, "failures": len(fetcher.failures)}


# ---------------------------------------------------------------- DB (apply path only)
DDL = """CREATE TABLE IF NOT EXISTS ShareholdingOfficial (
  symbol TEXT NOT NULL, quarter_end TEXT NOT NULL,
  promoter_pct REAL, fii_pct REAL, dii_pct REAL, mf_pct REAL, public_pct REAL,
  pledge_pct REAL, pledged_shares REAL, promoter_shares REAL, total_shares REAL,
  pledge_status TEXT, pledge_basis TEXT, flags TEXT,
  source TEXT NOT NULL, source_url TEXT NOT NULL, filing_date TEXT, fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, quarter_end))"""
COLS = ("symbol", "quarter_end", "promoter_pct", "fii_pct", "dii_pct", "mf_pct", "public_pct", "pledge_pct",
        "pledged_shares", "promoter_shares", "total_shares", "pledge_status", "pledge_basis", "flags",
        "source", "source_url", "filing_date", "fetched_at")


def read_stage(path):
    rows = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            r["flags"] = json.dumps(r.get("flags", []))
            rows[(r["symbol"], r["quarter_end"])] = r
    return list(rows.values())


def apply_stage(db, stage_path, yes=False, log=print):
    rows = read_stage(stage_path)
    log(f"stage rows={len(rows)} target table=ShareholdingOfficial db={db}")
    if not yes:
        log("DRY-RUN: no writes. Add --yes to write.")
        return 0
    conn = sqlite3.connect(db)
    try:
        with conn:
            conn.execute(DDL)
            q = ",".join("?" * len(COLS))
            conn.executemany(f"INSERT OR REPLACE INTO ShareholdingOfficial ({','.join(COLS)}) VALUES ({q})",
                             [tuple(r.get(c) for c in COLS) for r in rows])
        log(f"APPLIED {len(rows)} rows")
    finally:
        conn.close()
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=os.path.join(ROOT, "portfolio.db"), help="read-only universe source")
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE)
    ap.add_argument("--stage-file", default=DEFAULT_STAGE)
    ap.add_argument("--stage-only", action="store_true", help="default behaviour; explicit for clarity")
    ap.add_argument("--apply", action="store_true", help="load stage file into --apply-db (dry-run without --yes)")
    ap.add_argument("--apply-db", default=None)
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--symbols", help="comma list overriding the DB universe")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--stride", type=int, default=0, help="take every Nth universe symbol")
    ap.add_argument("--quarters", type=int, default=8)
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between calls (floor 1.0)")
    a = ap.parse_args(argv)
    if a.apply:
        if not a.apply_db:
            print("ERROR: --apply requires --apply-db (explicit target; portfolio.db is never defaulted)")
            return 2
        return apply_stage(a.apply_db, a.stage_file, yes=a.yes)
    syms = load_universe(a.db, a.symbols, a.limit, a.offset, a.stride)
    f = Fetcher(a.cache_dir, delay=a.delay)
    print(f"universe symbols={len(syms)} quarters={a.quarters} stage={a.stage_file}")
    fail = os.path.join(os.path.dirname(a.stage_file), "shareholding_failures.jsonl")
    print(json.dumps(run_stage(syms, f, a.stage_file, a.quarters, fail_path=fail)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
