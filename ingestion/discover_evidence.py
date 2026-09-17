"""
Evidence discovery — Phase 1.

Builds evidence_inventory rows for a scrip: does a concall transcript,
investor presentation, or credit-rating rationale exist and simply wasn't
fetched, or has it genuinely never been filed?

Uses verified libraries only (see IMPLEMENTATION_PLAN.md's library table):
    pip install bsedata bsescraper

Do NOT extend this script to do extraction — it only answers "does this
exist," and writes FOUND / CONFIRMED_ABSENT / SEARCH_FAILED. Extraction is
pipeline/mda-extractor.cjs's job (Node side), which reads this script's
JSON output.

Usage:
    python discover_evidence.py --scrip-code 500325 --nse-symbol RELIANCE \
        --start 01/04/2024 --end 31/03/2026 --out inventory_500325.json

This is a reference implementation, not a finished production script:
    - bsescraper has had "yanked" releases on PyPI; pin a specific,
      non-yanked version and re-check before relying on it.
    - BSE/NSE endpoints and category taxonomies can change without notice —
      verify the category strings below still match the live site before
      a large backfill run.
    - Wire the output into your actual evidence_inventory table; this
      script only produces the JSON, it does not write to portfolio.db.
"""

import argparse
import json
import sys
from datetime import datetime, timezone

try:
    from bsedata.bse import BSE
except ImportError:
    BSE = None  # noqa: N816 — degrade gracefully, see main()

try:
    import bsescraper
except ImportError:
    bsescraper = None


# Keywords that indicate a document is a concall / investor-relations
# artifact rather than a routine filing. Extend cautiously — false
# positives here just mean an extra fetch attempt, false negatives mean a
# real transcript gets mis-classified as CONFIRMED_ABSENT, which is worse.
CONCALL_KEYWORDS = ["transcript", "concall", "conference call", "earnings call"]
PRESENTATION_KEYWORDS = ["investor presentation", "analyst presentation", "investor deck"]
RATING_KEYWORDS = ["credit rating", "rating rationale", "rating action", "crisil", "icra", "care ratings"]

# bsescraper's documented category values — verify against the live site
# before relying on this list for a production backfill.
BSE_CATEGORIES = ["Results", "Company Update", "AGM/EGM", "Others"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def search_bse_announcements(scrip_code: str, keywords: list[str], start: str, end: str) -> dict:
    """
    Returns {"result": "FOUND"|"CONFIRMED_ABSENT"|"SEARCH_FAILED", "hits": [...]}.
    Searches every category in BSE_CATEGORIES with the given keyword list,
    since bsescraper's get_corporate_ann_keywords takes a single category
    per call.
    """
    if bsescraper is None:
        return {"result": "SEARCH_FAILED", "hits": [], "error": "bsescraper not installed"}

    hits = []
    try:
        scraper = bsescraper.BSE()
        for category in BSE_CATEGORIES:
            results = scraper.get_corporate_ann_keywords(
                keywords=keywords,
                code=int(scrip_code),
                category=category,
                startdate=start,
                enddate=end,
            )
            if results:
                hits.extend(results)
    except Exception as exc:  # noqa: BLE001 — a failed search is SEARCH_FAILED, not a crash
        return {"result": "SEARCH_FAILED", "hits": [], "error": str(exc)}

    return {"result": "FOUND" if hits else "CONFIRMED_ABSENT", "hits": hits}


def verify_scrip_code(scrip_code: str) -> bool:
    """Sanity-check the scrip code actually resolves before spending search
    calls on it — catches transposed/stale codes early."""
    if BSE is None:
        return True  # can't verify, don't block the run on it
    try:
        b = BSE(update_codes=False)
        return b.verifyScripCode(scrip_code)
    except Exception:  # noqa: BLE001
        return True  # verification failure isn't proof the code is wrong


def build_inventory(scrip_code: str, nse_symbol: str, start: str, end: str) -> list[dict]:
    rows = []
    checked_at = now_iso()

    if not verify_scrip_code(scrip_code):
        # Don't silently proceed on a code that doesn't resolve — every row
        # below would be a false CONFIRMED_ABSENT otherwise.
        return [{
            "scripId": nse_symbol or scrip_code,
            "sourceType": s,
            "result": "SEARCH_FAILED",
            "checkedAt": checked_at,
            "discoveryMethod": "bsedata.verifyScripCode",
            "note": "scrip code did not verify — fix before trusting any row below",
        } for s in ("CONCALL", "INVESTOR_PRESENTATION", "CREDIT_RATING")]

    for source_type, keywords in (
        ("CONCALL", CONCALL_KEYWORDS),
        ("INVESTOR_PRESENTATION", PRESENTATION_KEYWORDS),
        ("CREDIT_RATING", RATING_KEYWORDS),
    ):
        outcome = search_bse_announcements(scrip_code, keywords, start, end)
        rows.append({
            "scripId": nse_symbol or scrip_code,
            "sourceType": source_type,
            "result": outcome["result"],
            "checkedAt": checked_at,
            "discoveryMethod": "bsescraper.get_corporate_ann_keywords",
            "hits": outcome.get("hits", []),
            "error": outcome.get("error"),
        })

    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scrip-code", required=True, help="BSE numeric scrip code")
    parser.add_argument("--nse-symbol", default="", help="NSE symbol, used as scripId if given")
    parser.add_argument("--start", required=True, help="dd/mm/yyyy")
    parser.add_argument("--end", required=True, help="dd/mm/yyyy")
    parser.add_argument("--out", required=True, help="output JSON path")
    args = parser.parse_args()

    if bsescraper is None:
        print("bsescraper is not installed — pip install bsescraper (check for a non-yanked "
              "version first). Exiting without writing partial/misleading output.", file=sys.stderr)
        sys.exit(1)

    rows = build_inventory(args.scrip_code, args.nse_symbol, args.start, args.end)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)

    found = sum(1 for r in rows if r["result"] == "FOUND")
    print(f"Wrote {len(rows)} inventory rows for {args.nse_symbol or args.scrip_code} "
          f"({found} FOUND) -> {args.out}")


if __name__ == "__main__":
    main()
