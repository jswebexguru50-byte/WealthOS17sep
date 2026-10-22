#!/usr/bin/env python3
"""Pure parser: BSE public shareholding JSON (captured in a real browser session) -> stage row.

ZERO FABRICATION: values come only from the filed rows. A field the filing lacks is None; nothing
is estimated. Same row schema as scripts/fundamental/nse_bse_shareholding.py stage_record(), with
source='bse'. See bse_browser_shareholding.md for the endpoints and the in-page fetch snippets.

Inputs (all JSON already decoded):
  qrow    : one element of SHPQNewFormat/w?scripcode=C -> Table[]  (quarter name, filing time, qtrid)
  summary : CorporatesSHPSecuritybeta/w?scripcode=C&qtrid=Q  (Table = flags, Table1 = A/B/Total rows)
  public  : Corp_shpSec_SHPPubShold_ng/w?SCRIPCODE=C&QtrCode=Q (Table1 = institution rows) or None
"""
import calendar
from datetime import datetime, timezone

SOURCE = "bse"
API = "https://api.bseindia.com/BseIndiaAPI/api/"
FIELDS = ("promoter_pct", "fii_pct", "dii_pct", "mf_pct", "public_pct", "pledge_pct", "pledged_shares",
          "promoter_shares", "total_shares", "pledge_status", "pledge_basis")


def _f(v):
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def quarter_end(qname):
    """'June 2026' / 'Sep-26' -> '2026-06-30' (None if not a calendar quarter-end)."""
    s = str(qname or "").strip()
    for fmt in ("%B %Y", "%b %Y", "%b-%y", "%B-%y"):
        try:
            d = datetime.strptime(s, fmt)
        except ValueError:
            continue
        if d.month not in (3, 6, 9, 12):
            return None
        return "%04d-%02d-%02d" % (d.year, d.month, calendar.monthrange(d.year, d.month)[1])
    return None


def source_url(code, qtrid, endpoint="CorporatesSHPSecuritybeta"):
    return "%s%s/w?scripcode=%s&qtrid=%.2f" % (API, endpoint, code, float(qtrid))


def _row(rows, code):
    for r in rows or []:
        if r.get("Fld_Code") == code:
            return r
    return None


def parse_summary(summary):
    out = dict.fromkeys(("promoter_pct", "public_pct", "promoter_shares", "total_shares", "pledge_pct",
                         "pledged_shares", "pledge_basis"))
    out["pledge_status"] = "unknown"
    flags = []
    t0 = (summary.get("Table") or [{}])[0]
    rows = summary.get("Table1") or []
    a, b, tot = _row(rows, "STA1A2"), _row(rows, "STB1B2B3"), _row(rows, "STABC")
    out["promoter_pct"] = _f(a and a.get("Fld_TotalPercentageOf_A_B_C2"))
    out["public_pct"] = _f(b and b.get("Fld_TotalPercentageOf_A_B_C2"))
    out["promoter_shares"] = _f(a and a.get("Fld_TotalNoOfShares"))
    out["total_shares"] = _f(tot and tot.get("Fld_TotalNoOfShares"))
    if a is None or tot is None:
        flags.append("summary_rows_missing")
    ps, ts = out["promoter_shares"], out["total_shares"]
    if ps is not None and ts and out["promoter_pct"] is not None \
            and abs(ps / ts * 100 - out["promoter_pct"]) > 0.6:  # filed percent vs filed counts
        flags.append("promoter_pct_vs_counts_mismatch")
        out["promoter_pct"] = None
    if out["promoter_pct"] is not None and out["public_pct"] is not None \
            and out["promoter_pct"] + out["public_pct"] > 100.5:
        flags.append("promoter_public_sum_gt_100")
        out["promoter_pct"] = out["public_pct"] = None
    is_pledge = t0.get("Fld_IsPledge")
    if is_pledge is False:
        out.update(pledge_pct=0.0, pledged_shares=0, pledge_status="none_reported")
    elif is_pledge is True:
        n = _f(a and a.get("Fld_PledgeEncumberedNoOfShares"))
        if n is not None and ps and 0 <= n <= ps * 1.0001:
            out.update(pledged_shares=n, pledge_pct=round(n / ps * 100, 4), pledge_basis="pledged",
                       pledge_status="pledged" if n > 0 else "none_reported")
        else:
            flags.append("pledge_flag_true_no_count")  # fail closed: leave null
    return out, flags


def parse_public(public):
    """MF / DII / FII from the Table III rows. Only explicit filed category subtotals are used."""
    out = {"mf_pct": None, "dii_pct": None, "fii_pct": None}
    if not public:
        return out, ["public_table_missing"]
    for r in public.get("Table1") or []:
        if (r.get("Fld_ShareHolderName") or "").strip():
            continue  # named individual holder rows are not category totals
        lvl = (r.get("Fld_Level") or "").strip()
        sub = (r.get("Fld_SubCategory") or "").strip()
        p = _f(r.get("Fld_TotalPercentageOf_A_B_C2"))
        if p is None:
            continue
        if lvl.startswith("Mutual Fund") and out["mf_pct"] is None:
            out["mf_pct"] = p
        elif lvl == "Sub Total B1" and sub == "Institutions (Domestic)":
            out["dii_pct"] = p
        elif lvl == "Sub Total B2" and sub == "Institutions (Foreign)":
            out["fii_pct"] = p
    flags = []
    if out["dii_pct"] is None and out["fii_pct"] is None:
        flags.append("no_domestic_foreign_split")  # layout without the split: left null, not inferred
    return out, flags


def build_row(code, qrow, summary, public):
    """Stage row (schema of shareholding_stage.jsonl, source='bse'). Never raises on missing fields."""
    qe = quarter_end(qrow.get("qtr"))
    s, f1 = parse_summary(summary)
    p, f2 = parse_public(public)
    rec = {"symbol": str(code), "quarter_end": qe, "source": SOURCE,
           "source_url": source_url(code, qrow["qtrid"]),
           "filing_date": str(qrow.get("filing_date_time") or "")[:10] or None,
           "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "record_id": (summary.get("Table") or [{}])[0].get("Fld_RecordId")}
    for k in FIELDS:
        rec[k] = p[k] if k in p else s.get(k)
    inst = [rec[k] for k in ("fii_pct", "dii_pct") if rec[k] is not None]
    if rec["public_pct"] is not None and inst and sum(inst) > rec["public_pct"] + 0.6:
        f2.append("institutions_gt_public")
        rec["fii_pct"] = rec["dii_pct"] = rec["mf_pct"] = None
    rec["flags"] = f1 + f2 + ([] if qe else ["quarter_end_unparsed"])
    if str(qrow.get("status") or "").lower() not in ("", "new"):
        rec["flags"].append("bse_status_" + str(qrow["status"]).lower())
    return rec
