#!/usr/bin/env python3
"""Stage official NSE/BSE XBRL result-filing financials with per-value provenance.

ZERO fabrication: unknown stays absent/None. NEVER writes portfolio.db (opened
read-only via URI; the FERE evidence DB is also read-only). Output is a JSONL
staging file; promotion into any store is a separate, reviewed step.

Inputs (all local, inventoried before any network use):
  * fere_evidence.db  -> filing_document rows (isin, symbol, source_url, sha256,
                         filing_timestamp, period_end, archive_path)
  * archived NSE XBRL .xml files located via archive_path / sha256
Network (opt-in, --fetch-gaps): only re-downloads filing_document URLs that have no
local archive file; public nsearchives.nseindia.com only, >=1s between requests,
cached under scripts/qa/out/cache, resumable (existing cache files are reused).

Why a new parser: the earlier normaliser kept only contexts that carry
NatureOfReportStandaloneConsolidated, which filings declare ONLY on duration
contexts, so every balance-sheet INSTANT fact (Assets, Equity, Borrowings*,
Liabilities, CurrentLiabilities...) was silently dropped. Scope here is resolved
per filing.

Unit rule: XBRL monetary values with unitRef INR are raw rupees; staged value =
raw / 1e7 with unit_normalised_to='INR_crore'. Non-INR monetary units are skipped
and counted. Per-share (INRPerShare) and pure facts are not staged as money.

Usage:
  python scripts/fundamental/xbrl_financials_ingest.py [--limit N] [--fetch-gaps]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sqlite3
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import derived_metrics as dm  # noqa: E402

PORTFOLIO_DB = ROOT / "portfolio.db"
FERE_DB_CANDIDATES = [
    ROOT / "data/fere/verified_filings/fere_evidence.db",
    ROOT / "WealthOS04Oct/data/fere/verified_filings/fere_evidence.db",
]
ARCHIVE_ROOTS = [ROOT, ROOT / "WealthOS04Oct"]
OUT_DIR = ROOT / "scripts/qa/out"
CACHE_DIR = OUT_DIR / "cache"
STAGE_PATH = OUT_DIR / "financials_stage.jsonl"
DERIVED_PATH = OUT_DIR / "derived_stage.jsonl"
HFS_FIX_PATH = OUT_DIR / "hfs_fere_audited_corrected.jsonl"
REPORT_PATH = OUT_DIR / "financials_stage_report.json"

CRORE = 1e7
Q_FROM = "2024-09-30"      # last 8 quarters ending 2026-06-30
FY_FROM = "2021-03-31"     # 6 fiscal year-ends -> 5 annual years + 5y growth base

# taxonomy local-name -> (metric, kind)   kind: D = duration flow, I = instant balance, Dp = D-context point-in-time
TAGS: dict[str, tuple[str, str]] = {
    "RevenueFromOperations": ("sales", "D"),
    "OtherIncome": ("other_income", "D"),
    "Expenses": ("total_expenses", "D"),
    "FinanceCosts": ("interest", "D"),
    "DepreciationDepletionAndAmortisationExpense": ("depreciation", "D"),
    "ProfitBeforeTax": ("pbt", "D"),
    "ProfitLossForPeriod": ("pat", "D"),
    "TaxExpense": ("tax_expense", "D"),
    "CostOfMaterialsConsumed": ("materials_cost", "D"),
    "PurchasesOfStockInTrade": ("purchases_stock_in_trade", "D"),
    "ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade": ("inventory_change", "D"),
    "CashFlowsFromUsedInOperatingActivities": ("cfo", "D"),
    "PaidUpValueOfEquityShareCapital": ("equity_capital", "Dp"),
    "ReserveExcludingRevaluationReserves": ("reserves", "Dp"),
    "Assets": ("total_assets", "I"),
    "Liabilities": ("total_liabilities", "I"),
    "Equity": ("total_equity", "I"),
    "CurrentAssets": ("current_assets", "I"),
    "CurrentLiabilities": ("current_liabilities", "I"),
    "Borrowings": ("borrowings", "I"),
    "BorrowingsNoncurrent": ("borrowings_noncurrent", "I"),
    "BorrowingsCurrent": ("borrowings_current", "I"),
}
FACE_VALUE_TAG = "FaceValueOfEquityShareCapital"  # INRPerShare; used only for share count


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def pdate(s: str | None) -> date | None:
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def period_type(start: str | None, end: str) -> str | None:
    if start is None:
        return "INSTANT"
    s, e = pdate(start), pdate(end)
    if not s or not e:
        return None
    days = (e - s).days + 1
    if 80 <= days <= 100:
        return "Q"
    if 170 <= days <= 200:
        return "H1"
    if 250 <= days <= 290:
        return "9M"
    if 350 <= days <= 380:
        return "FY"
    return None


def norm_scope(v: str | None) -> str | None:
    v = (v or "").strip().upper()
    if v in ("CONSOLIDATED",):
        return "CONSOLIDATED"
    if v in ("STANDALONE", "NON-CONSOLIDATED"):
        return "STANDALONE"
    return None


def open_ro(path: Path) -> sqlite3.Connection:
    c = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=60)
    c.execute("PRAGMA query_only=1")
    return c


def load_universe():
    spec = importlib.util.spec_from_file_location("coverage_audit", ROOT / "scripts/qa/coverage_audit.py")
    ca = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ca)
    c = ca.connect(str(PORTFOLIO_DB))
    syms, sessions, _, _ = ca.universe(c)
    isin = {r[0]: (r[1] or "").upper() for r in c.execute("SELECT symbol, isin FROM MasterTickers")}
    return c, syms, isin, sessions[0]


def resolve_archive(archive_path: str | None, sha: str | None) -> Path | None:
    cands = []
    if archive_path:
        rel = archive_path.replace("\\", "/")
        cands += [r / rel for r in ARCHIVE_ROOTS]
    if sha:
        cands += [r / "data/fere/verified_filings/archive" / f"{sha}.xml" for r in ARCHIVE_ROOTS]
        cands.append(CACHE_DIR / f"{sha}.xml")
    for p in cands:
        if p.exists():
            return p
    return None


def parse_filing(payload: bytes, doc: dict) -> tuple[list[dict], str | None]:
    """Return (raw facts, rejection reason). Facts are issuer-level (no scenario) at the filing's period end."""
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as e:
        return [], f"xml_parse_error:{e}"
    ctx: dict[str, tuple[str | None, str]] = {}
    for el in root.iter():
        if local(el.tag) != "context":
            continue
        cid = el.attrib.get("id")
        has_scn = any(local(ch.tag) in ("scenario",) for ch in el.iter())
        per = next((ch for ch in el if local(ch.tag) == "period"), None)
        if not cid or per is None or has_scn:
            continue
        st = en = ins = None
        for ch in per:
            n = local(ch.tag)
            if n == "startDate":
                st = (ch.text or "").strip()
            elif n == "endDate":
                en = (ch.text or "").strip()
            elif n == "instant":
                ins = (ch.text or "").strip()
        end = en or ins
        if end and pdate(end):
            ctx[cid] = (st if en else None, end)
    if not ctx:
        return [], "no_issuer_contexts"
    # identity: embedded ISIN / symbol must agree with the filing_document row
    isins, syms, scopes = set(), set(), set()
    for el in root.iter():
        n = local(el.tag)
        t = (el.text or "").strip()
        if not t:
            continue
        if n.upper() == "ISIN":
            isins.add(t.upper())
        elif n == "Symbol":
            syms.add(t.upper())
        elif n == "NatureOfReportStandaloneConsolidated":
            s = norm_scope(t)
            if s:
                scopes.add(s)
    if isins and isins != {doc["isin"].upper()}:
        return [], "isin_mismatch"
    if not isins and syms and syms != {doc["symbol"].upper()}:
        return [], "symbol_mismatch"
    scope = next(iter(scopes)) if len(scopes) == 1 else None
    if scope is None and not scopes:
        scope = norm_scope(doc.get("statement_scope"))
    if scope is None:
        return [], "scope_ambiguous"
    pe = doc.get("period_end") or max(e for _, e in ctx.values())
    facts = []
    for el in root.iter():
        name = local(el.tag)
        meta = TAGS.get(name)
        is_fv = name == FACE_VALUE_TAG
        if not meta and not is_fv:
            continue
        c = ctx.get(el.attrib.get("contextRef"))
        if not c or c[1] != pe:
            continue
        unit = el.attrib.get("unitRef")
        txt = (el.text or "").strip().replace(",", "")
        try:
            val = float(txt)
        except ValueError:
            continue
        if not math.isfinite(val) or not unit:
            continue
        facts.append({"tag": name, "metric": "face_value" if is_fv else meta[0], "start": c[0], "end": c[1],
                      "raw_value": val, "raw_unit": unit, "context_ref": el.attrib.get("contextRef"),
                      "scope": scope})
    return facts, None


FLOW_SUM = ("sales", "other_income", "total_expenses", "interest", "depreciation", "pbt", "pat", "tax_expense",
            "operating_profit")
OLD_Q_FROM = "2020-06-30"  # earlier quarters kept in memory only, to build 4-quarter fiscal-year sums


def to_stage_row(f: dict, doc: dict, keep_old_q: bool = False) -> dict | None:
    pt = period_type(f["start"], f["end"])
    dp = f["tag"] in ("PaidUpValueOfEquityShareCapital", "ReserveExcludingRevaluationReserves")
    if dp:  # point-in-time balance reported against a duration context
        pt = "INSTANT"
    if pt is None:
        return None
    if f["metric"] == "face_value":
        return None  # consumed separately for share count
    if f["raw_unit"] != "INR":
        return None
    if pt == "INSTANT":
        if f["end"] < FY_FROM:
            return None
    elif pt == "FY":
        if f["end"] < FY_FROM:
            return None
    elif f["end"] < (OLD_Q_FROM if keep_old_q else Q_FROM):
        return None
    return {
        "symbol": doc["symbol"], "isin": doc["isin"], "scope": f["scope"], "metric": f["metric"],
        "period_type": pt, "period_start": None if dp else f["start"], "period_end": f["end"],
        "value": f["raw_value"] / CRORE, "unit_normalised_to": "INR_crore",
        "raw_value": f["raw_value"], "raw_unit": f["raw_unit"],
        "filing_id": doc["filing_id"], "filing_sha256": doc["sha256"], "source_url": doc["source_url"],
        "available_at": doc["filing_timestamp"], "taxonomy_field": f["tag"], "derived": False,
        "context_period_start": f["start"] if dp else None,
    }


def derive_in_filing(rows: list[dict], doc: dict) -> list[dict]:
    """Filing-internal derivations; every input must come from the same filing/scope/period."""
    out = []
    by = defaultdict(dict)
    for r in rows:
        by[(r["scope"], r["period_type"], r["period_start"], r["period_end"])][r["metric"]] = r
    for (scope, pt, ps, pe), m in by.items():
        base = {"symbol": doc["symbol"], "isin": doc["isin"], "scope": scope, "period_type": pt,
                "period_start": ps, "period_end": pe, "unit_normalised_to": "INR_crore", "raw_value": None,
                "raw_unit": "derived", "filing_id": doc["filing_id"], "filing_sha256": doc["sha256"],
                "source_url": doc["source_url"], "available_at": doc["filing_timestamp"], "derived": True}
        g = lambda k: m[k]["value"] if k in m else None  # noqa: E731
        op = dm.operating_profit(g("sales"), g("total_expenses"), g("interest"), g("depreciation"))
        if op is not None:
            out.append(dict(base, metric="operating_profit", value=op, taxonomy_field=None,
                            formula="sales-(total_expenses-interest-depreciation)",
                            inputs=["sales", "total_expenses", "interest", "depreciation"]))
        if "borrowings" not in m and "borrowings_noncurrent" in m and "borrowings_current" in m:
            out.append(dict(base, metric="borrowings",
                            value=g("borrowings_noncurrent") + g("borrowings_current"), taxonomy_field=None,
                            formula="BorrowingsNoncurrent+BorrowingsCurrent",
                            inputs=["borrowings_noncurrent", "borrowings_current"]))
        if all(k in m for k in ("materials_cost", "purchases_stock_in_trade", "inventory_change")):
            out.append(dict(base, metric="cogs",
                            value=g("materials_cost") + g("purchases_stock_in_trade") + g("inventory_change"),
                            taxonomy_field=None, formula="materials+purchases_stock_in_trade+inventory_change",
                            inputs=["materials_cost", "purchases_stock_in_trade", "inventory_change"]))
    return out


def add_fy_sums(rows_by_key: dict, old_q: dict) -> int:
    """FY value = sum of the four quarterly values (same scope, contiguous Jun/Sep/Dec/Mar quarters) where no
    direct 12-month filing fact exists. Needs all four quarters; derived=True with the 4 input filings."""
    qs = {}
    for (isin, scope, metric, pt, ps, pe), r in rows_by_key.items():
        if pt == "Q" and metric in FLOW_SUM:
            qs[(isin, scope, metric, pe)] = r
    qs.update({k: v for k, v in old_q.items() if k not in qs})
    added = 0
    direct_fy = {(k[0], k[1], k[2], k[5]) for k in rows_by_key if k[3] == "FY"}
    groups = {(k[0], k[1], k[2]) for k in qs}
    for isin, scope, metric in groups:
        for y in range(2021, 2027):
            ends = [f"{y-1}-06-30", f"{y-1}-09-30", f"{y-1}-12-31", f"{y}-03-31"]
            parts = [qs.get((isin, scope, metric, e)) for e in ends]
            if any(p is None for p in parts):
                continue
            fy_end = ends[-1]
            fy_start = f"{y-1}-04-01"
            if (isin, scope, metric, fy_end) in direct_fy:
                continue
            base = parts[-1]
            rows_by_key[(isin, scope, metric, "FY", fy_start, fy_end)] = {
                "symbol": base["symbol"], "isin": isin, "scope": scope, "metric": metric, "period_type": "FY",
                "period_start": fy_start, "period_end": fy_end, "value": sum(p["value"] for p in parts),
                "unit_normalised_to": "INR_crore", "raw_value": None, "raw_unit": "derived", "derived": True,
                "formula": "sum of four quarterly values (Q1..Q4)", "inputs": [
                    {"period_end": p["period_end"], "filing_id": p["filing_id"], "source_url": p["source_url"],
                     "filing_sha256": p["filing_sha256"], "available_at": p["available_at"],
                     "value": p["value"]} for p in parts],
                "filing_id": base["filing_id"], "filing_sha256": base["filing_sha256"],
                "source_url": base["source_url"], "available_at": base["available_at"], "taxonomy_field": None,
            }
            added += 1
    return added


def _nse_date(s: str | None) -> str | None:
    for fmt in ("%d-%b-%Y", "%d-%b-%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(s).strip().title(), fmt).date().isoformat()
        except (TypeError, ValueError):
            pass
    return None


def _nse_ts(s: str | None) -> str | None:
    for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y %H:%M"):
        try:
            return datetime.strptime(str(s).strip().title(), fmt).isoformat() + "+05:30"
        except (TypeError, ValueError):
            pass
    return None


def discovery_gaps(fc: sqlite3.Connection, uni_isin: dict, have_urls: set) -> list[dict]:
    """Official NSE result listings already archived locally (filing_discovery) name XBRL URLs that were never
    downloaded. Return those in the needed window for universe ISINs (offline: no network here)."""
    gaps: dict[str, dict] = {}
    for rp, in fc.execute("SELECT response_path FROM filing_discovery WHERE status='ARCHIVED'"):
        path = next((r / rp.replace("\\", "/") for r in ARCHIVE_ROOTS if (r / rp.replace("\\", "/")).exists()), None)
        if path is None:
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for it in payload if isinstance(payload, list) else payload.get("data", []) if isinstance(payload, dict) else []:
            if not isinstance(it, dict):
                continue
            url, isin = it.get("xbrl"), (it.get("isin") or "").upper()
            to = _nse_date(it.get("toDate") or it.get("qe_Date"))
            if not (isinstance(url, str) and url.startswith("https://nsearchives.nseindia.com/")) or url in have_urls:
                continue
            if isin not in uni_isin or not to or to < "2021-06-30" or to > "2024-06-30":
                continue
            gaps[url] = {"filing_id": 10_000_000_000 + int(it.get("seqNumber") or it.get("seq_Id") or 0),
                         "isin": isin, "symbol": (it.get("symbol") or "").upper(), "source_url": url,
                         "sha256": None, "archive_path": None,
                         "filing_timestamp": _nse_ts(it.get("broadCastDate") or it.get("broadcast_Date")),
                         "period_end": to, "statement_scope": it.get("consolidated"), "from_discovery": True}
    return sorted(gaps.values(), key=lambda d: d["period_end"], reverse=True)


def gap_cache_path(url: str) -> Path:
    return CACHE_DIR / ("xbrl_" + hashlib.sha256(url.encode()).hexdigest() + ".xml")


def fetch_gaps(docs, max_fetch: int) -> Counter:
    """Download only listed-but-missing official filings; >=1.05s apart, cached on disk, resumable."""
    stats = Counter()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    last = 0.0
    for d in docs:
        tgt = gap_cache_path(d["source_url"])
        if tgt.exists():
            stats["already_cached"] += 1
            continue
        if stats["attempted"] >= max_fetch:
            stats["deferred"] += 1
            continue
        wait = 1.05 - (time.time() - last)
        if wait > 0:
            time.sleep(wait)
        stats["attempted"] += 1
        try:
            req = urllib.request.Request(d["source_url"], headers={"User-Agent": "Mozilla/5.0 WealthOS-research"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            tgt.with_suffix(".part").write_bytes(body)
            tgt.with_suffix(".part").replace(tgt)
            stats["ok"] += 1
        except Exception as e:  # noqa: BLE001 - recorded, run continues
            stats["failed"] += 1
            stats["err_" + type(e).__name__] += 1
        last = time.time()
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max filings to parse (debug)")
    ap.add_argument("--fetch-gaps", action="store_true")
    ap.add_argument("--max-fetch", type=int, default=500, help="max downloads this run (resumable)")
    a = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    pc, universe, isin_of, latest = load_universe()
    uni_isin = {isin_of.get(s): s for s in universe if isin_of.get(s)}
    uni_syms = set(universe)
    print(f"universe={len(universe)} symbols, {len(uni_isin)} with ISIN, latest session {latest}", file=sys.stderr)

    fdb = next((p for p in FERE_DB_CANDIDATES if p.exists() and p.stat().st_size > 1_000_000), None)
    if fdb is None:
        raise SystemExit("no FERE evidence DB with data found")
    fc = open_ro(fdb)
    cols = ("filing_id", "isin", "symbol", "source_url", "sha256", "archive_path", "filing_timestamp",
            "period_end", "statement_scope")
    docs = [dict(zip(cols, r)) for r in fc.execute(
        "SELECT id,isin,symbol,source_url,sha256,archive_path,filing_timestamp,period_end,statement_scope "
        "FROM filing_document WHERE document_type='XBRL' AND source_url LIKE '%.xml' ORDER BY id")]
    docs = [d for d in docs if (d["isin"] or "").upper() in uni_isin or (d["symbol"] or "") in uni_syms]
    for d in docs:
        d["isin"] = (d["isin"] or "").upper()
    local_ok = [(d, resolve_archive(d["archive_path"], d["sha256"])) for d in docs]
    missing = [d for d, p in local_ok if p is None]
    print(f"filings in universe: {len(docs)}; local archive present: {len(docs) - len(missing)}; missing: {len(missing)}",
          file=sys.stderr)
    have_urls = {d["source_url"] for d in docs}
    gap_docs = discovery_gaps(fc, uni_isin, have_urls | {r[0] for r in fc.execute("SELECT source_url FROM filing_document")})
    net = Counter()
    if a.fetch_gaps:
        net = fetch_gaps(gap_docs, a.max_fetch)
    net["gap_urls_listed_not_downloaded_in_window"] = len(gap_docs)
    cached_gap = [(d, gap_cache_path(d["source_url"])) for d in gap_docs if gap_cache_path(d["source_url"]).exists()]
    net["gap_files_in_cache_parsed"] = len(cached_gap)
    local_ok = [(d, p) for d, p in local_ok if p is not None] + cached_gap

    stats = Counter()
    rows_by_key: dict[tuple, dict] = {}
    all_rows = 0
    face_by_filing: dict[int, dict] = {}
    old_q: dict[tuple, dict] = {}
    todo = [(d, p) for d, p in local_ok if p is not None]
    if a.limit:
        todo = todo[: a.limit]
    t0 = time.time()
    for i, (d, p) in enumerate(todo, 1):
        if i % 2000 == 0:
            print(f"  parsed {i}/{len(todo)} ({time.time()-t0:.0f}s)", file=sys.stderr, flush=True)
        payload = p.read_bytes()
        if d["sha256"] and p.parent.name == "archive" and hashlib.sha256(payload).hexdigest() != d["sha256"]:
            stats["reject_sha_mismatch"] += 1
            continue
        if not d["sha256"]:
            d["sha256"] = hashlib.sha256(payload).hexdigest()
        facts, why = parse_filing(payload, d)
        if why:
            stats["reject_" + why.split(":")[0]] += 1
            continue
        stats["filings_parsed"] += 1
        if not d["filing_timestamp"]:
            stats["filing_timestamp_null"] += 1
        st_rows = []
        for f in facts:
            if f["raw_unit"] != "INR" and f["metric"] != "face_value":
                stats["skip_non_inr_unit:" + f["raw_unit"]] += 1
            r = to_stage_row(f, d, keep_old_q=True)
            if r:
                st_rows.append(r)
            elif f["metric"] == "face_value":
                face_by_filing.setdefault(d["filing_id"], {})[(f["scope"], f["end"])] = f["raw_value"]
        st_rows += derive_in_filing(st_rows, d)
        for r in st_rows:
            if r["period_type"] == "Q" and r["period_end"] < Q_FROM:
                if r["metric"] in FLOW_SUM:
                    k2 = (r["isin"], r["scope"], r["metric"], r["period_end"])
                    rk = (r["available_at"] or "", r["filing_id"])
                    o2 = old_q.get(k2)
                    if o2 is None or rk > (o2["available_at"] or "", o2["filing_id"]):
                        old_q[k2] = r
                continue
            key = (r["isin"], r["scope"], r["metric"], r["period_type"], r["period_start"], r["period_end"])
            old = rows_by_key.get(key)
            # revisions: the later broadcast wins; ties -> higher filing id
            rank = (r["available_at"] or "", r["filing_id"])
            if old is None or rank > (old["available_at"] or "", old["filing_id"]):
                if old is not None:
                    r["superseded_filing_ids"] = old.get("superseded_filing_ids", []) + [old["filing_id"]]
                rows_by_key[key] = r
            else:
                old.setdefault("superseded_filing_ids", []).append(r["filing_id"])
            all_rows += 1

    fy_added = add_fy_sums(rows_by_key, old_q)
    stats["fy_rows_from_4_quarter_sums"] = fy_added
    rows = sorted(rows_by_key.values(), key=lambda r: (r["symbol"], r["scope"], r["period_end"], r["metric"]))
    with STAGE_PATH.open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    # ---- fill rates & derived metrics (per symbol, preferred scope) ----
    idx: dict[tuple, dict] = {}
    for r in rows:
        idx[(r["isin"], r["scope"], r["metric"], r["period_type"], r["period_end"])] = r
    scopes_for = defaultdict(set)
    for r in rows:
        scopes_for[r["isin"]].add(r["scope"])
    q_ends = ["2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"]
    fy_ends = [f"{y}-03-31" for y in range(2022, 2027)]
    fills = Counter()
    derived_rows = []
    N = len(uni_isin)
    for isin, sym in uni_isin.items():
        sc = "CONSOLIDATED" if "CONSOLIDATED" in scopes_for[isin] else "STANDALONE" if scopes_for[isin] else None
        if sc is None:
            continue

        def v(metric, pt, end, scope=sc):
            r = idx.get((isin, scope, metric, pt, end))
            return None if r is None else r["value"]
        for metric in ("sales", "operating_profit", "pat", "pbt", "interest", "depreciation"):
            have = sum(v(metric, "Q", e) is not None for e in q_ends)
            fills[f"{metric}_q_any"] += have > 0
            fills[f"{metric}_q_8of8"] += have == 8
            havey = sum(v(metric, "FY", e) is not None for e in fy_ends)
            fills[f"{metric}_fy_any"] += havey > 0
            fills[f"{metric}_fy_5of5"] += havey == 5
        for metric in ("cfo",):
            fills["cfo_fy_any"] += any(v("cfo", "FY", e) is not None for e in fy_ends)
            fills["cfo_fy_5of5"] += all(v("cfo", "FY", e) is not None for e in fy_ends)
        for metric in ("borrowings", "total_assets", "equity_capital", "reserves", "total_equity"):
            fills[f"{metric}_fy_any"] += any(v(metric, "INSTANT", e) is not None for e in fy_ends)
            fills[f"{metric}_fy_5of5"] += all(v(metric, "INSTANT", e) is not None for e in fy_ends)
        for e in fy_ends:
            fills[f"sales_fy_{e[:4]}"] += v("sales", "FY", e) is not None
        fills["sales_fy_4of5_or_more"] += sum(v("sales", "FY", e) is not None for e in fy_ends) >= 4
        # derived (inputs staged only; each must exist)
        last4 = q_ends[-4:]
        ebit4 = [dm.ebit(v("pbt", "Q", e), v("interest", "Q", e)) for e in last4]
        ta, cl = v("total_assets", "INSTANT", "2026-03-31"), v("current_liabilities", "INSTANT", "2026-03-31")
        derived = {
            "roce_ttm_pct_asof_2026-03-31": dm.roce_ttm_pct(
                [dm.ebit(v("pbt", "Q", e), v("interest", "Q", e)) for e in ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"]], ta, cl),
            "roe_pct_FY2026": dm.roe_pct(v("pat", "FY", "2026-03-31"), v("total_equity", "INSTANT", "2025-03-31"), v("total_equity", "INSTANT", "2026-03-31")),
            "cfo_to_ebitda_FY2026": dm.cfo_to_ebitda(v("cfo", "FY", "2026-03-31"), v("operating_profit", "FY", "2026-03-31")),
            "sales_cagr_5y_pct_FY2021_FY2026": dm.sales_cagr_pct(v("sales", "FY", "2021-03-31"), v("sales", "FY", "2026-03-31"), 5),
        }
        for k, val in derived.items():
            fills["derived_" + k] += val is not None
            if val is not None:
                derived_rows.append({"symbol": sym, "isin": isin, "scope": sc, "metric": k, "value": val,
                                     "derivation": "scripts/fundamental/derived_metrics.py",
                                     "inputs_from": "financials_stage.jsonl"})
    with DERIVED_PATH.open("w", encoding="utf-8") as fh:
        for r in derived_rows:
            fh.write(json.dumps(r) + "\n")

    # ---- HFS defect: FERE_AUDITED_XBRL quarterly rows (read-only) ----
    defects = Counter()
    with HFS_FIX_PATH.open("w", encoding="utf-8") as fh:
        for r in pc.execute("SELECT id,symbol,period_label,period_date,sales_cr,operating_profit_cr,net_profit_pat_cr "
                            "FROM HistoricalFinancialStatements WHERE primary_source='FERE_AUDITED_XBRL'"):
            rid, sym, lab, pdt, sales, op, pat = r
            defects["rows"] += 1
            defects["sales_equals_operating_profit"] += sales is not None and sales == op
            defects["sales_abs_gt_1e7_rupees_not_crore"] += sales is not None and abs(sales) > 1e7
            isin = isin_of.get(sym)
            end = "2026-06-30" if lab in ("Q1FY27", "2026-06-30") else pdt
            fix = {"hfs_id": rid, "symbol": sym, "period_label": lab, "period_end": end,
                   "old": {"sales_cr": sales, "operating_profit_cr": op, "pat_cr": pat},
                   "corrected": {"sales_cr": None, "operating_profit_cr": None, "pat_cr": None},
                   "status": "UNVERIFIED_NO_FILING", "provenance": None}
            hit = {m: next((idx.get((isin, s, m, "Q", end)) for s in ("CONSOLIDATED", "STANDALONE")
                            if idx.get((isin, s, m, "Q", end))), None) for m in ("sales", "operating_profit", "pat")}
            if any(hit.values()):
                fix["corrected"] = {"sales_cr": hit["sales"] and hit["sales"]["value"],
                                    "operating_profit_cr": hit["operating_profit"] and hit["operating_profit"]["value"],
                                    "pat_cr": hit["pat"] and hit["pat"]["value"]}
                fix["status"] = "CORRECTED_FROM_FILING"
                fix["provenance"] = {m: {k: h[k] for k in ("filing_id", "source_url", "scope", "raw_value", "raw_unit",
                                                           "unit_normalised_to", "available_at")}
                                     for m, h in hit.items() if h}
                defects["corrected_from_filing"] += 1
                # cross-check the legacy rupee value against the filing (diagnostic only)
                if hit["sales"] and sales is not None and abs(sales / CRORE - hit["sales"]["value"]) <= 1e-6 * max(1, abs(hit["sales"]["value"])):
                    defects["legacy_sales_matches_filing_after_div_1e7"] += 1
            else:
                defects["no_filing_available"] += 1
            fh.write(json.dumps(fix, ensure_ascii=False) + "\n")
    ledger_dup = {}
    for col in ("roce_pct", "debt_to_equity", "piotroski_f_score", "altman_z_score"):
        top = pc.execute(f"SELECT {col},COUNT(*) c FROM FEREEnrichedLedger GROUP BY 1 ORDER BY c DESC LIMIT 1").fetchone()
        ledger_dup[col] = {"modal_value": top[0], "rows": top[1], "of": pc.execute("SELECT COUNT(*) FROM FEREEnrichedLedger").fetchone()[0]}

    report = {
        "universe": N, "fere_db": str(fdb), "filings_in_universe": len(docs),
        "local_archive_missing": len(missing), "network": dict(net), "parse_stats": dict(stats),
        "staged_rows": len(rows), "staged_rows_derived_in_filing": sum(r["derived"] for r in rows),
        "symbols_with_any_stage": len({r["isin"] for r in rows}),
        "fill_counts": dict(fills), "fill_pct": {k: round(100.0 * c / N, 1) for k, c in fills.items()},
        "hfs_fere_audited_defects": dict(defects), "FEREEnrichedLedger_repeated_values_untrusted": ledger_dup,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
