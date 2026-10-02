#!/usr/bin/env python3
"""
promote_all_xbrl_to_company_facts.py

Deterministic, no-LLM, no-network promotion of canonically-identified
XBRL facts from fere_evidence.db -> portfolio.db::company_facts.

CANONICAL IDENTIFICATION — uses the exact FIELD_MAP from normalize_nse_xbrl.py.
That normalizer maps NSE XBRL taxonomy field names to canonical metric names and
stores the original taxonomy name in verified_xbrl_fact.taxonomy_field.
A row is canonical if AND ONLY IF its taxonomy_field is a key in FIELD_MAP.
Generic xbrl_* rows (taxonomy_field not in FIELD_MAP) are evidence inventory
and are NOT promoted.

Additional gates per promoted row:
  - period_end: parseable YYYY-MM-DD ISO date
  - period_start: parseable if present
  - filing_sha256: present (filing identity verified)
  - available_at: present (broadcast timestamp verified)
  - source_url: present (provenance traceable)
  - value: finite float
  - scope: STANDALONE or CONSOLIDATED

Canonical FIELD_MAP (mirrors normalize_nse_xbrl.py exactly):
  RevenueFromOperations                      -> revenue         (INR Crore)
  ProfitLossForPeriod                        -> pat             (INR Crore)
  DepreciationDepletionAndAmortisationExpense-> depreciation    (INR Crore)
  Expenses                                   -> total_expenses  (INR Crore)
  FinanceCosts                               -> finance_costs   (INR Crore)
  ProfitBeforeTax                            -> pbt             (INR Crore)
  CostOfMaterialsConsumed                    -> materials_cost  (INR Crore)
  PaidUpValueOfEquityShareCapital            -> equity_capital  (INR Crore)
  Assets                                     -> total_assets    (INR Crore)
  Liabilities                                -> total_liabilities(INR Crore)
  CashFlowsFromUsedInOperatingActivities     -> cfo             (INR Crore)
  Borrowings                                 -> total_debt      (INR Crore)
  CashAndCashEquivalents                     -> cash_and_equivalents (INR Crore)
  TradeReceivables                           -> trade_receivables    (INR Crore)
  Inventories                                -> inventories          (INR Crore)

Latest filing wins per (isin, taxonomy_field, period_start, period_end, scope).
INSERT OR REPLACE — idempotent, safe to re-run.
Progress printed every 25,000 rows.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # scripts/fundamental -> scripts -> repo root

# portfolio.db lives at repo root, not data/
PORTFOLIO_DB = str(ROOT / "portfolio.db")
FERE_DB = ROOT / "data" / "fere" / "verified_filings" / "fere_evidence.db"
REPORT_PATH = ROOT / "data" / "fundamental_enrichment" / "xbrl_canonical_promotion_report.json"

# ── FIELD_MAP: mirrors normalize_nse_xbrl.py EXACTLY ────────────────────────
# Key   = NSE XBRL taxonomy field name (stored in verified_xbrl_fact.taxonomy_field)
# Value = canonical metric name written to company_facts.metric
# This IS the canonical identification Codex uses. Do not extend without
# updating the normalizer too — they must stay in sync.
FIELD_MAP: dict[str, str] = {
    # ── Original 9 promoted fields ───────────────────────────────────────────
    "RevenueFromOperations":                                              "revenue",
    "ProfitLossForPeriod":                                                "pat",
    "DepreciationDepletionAndAmortisationExpense":                        "depreciation",
    "Expenses":                                                           "total_expenses",
    "FinanceCosts":                                                       "finance_costs",
    "ProfitBeforeTax":                                                    "pbt",
    "CostOfMaterialsConsumed":                                            "materials_cost",
    "PaidUpValueOfEquityShareCapital":                                    "equity_capital",
    "CashFlowsFromUsedInOperatingActivities":                             "cfo",
    # ── Balance-sheet placeholders (absent in quarterly archive) ─────────────
    "Assets":                                                             "total_assets",
    "Liabilities":                                                        "total_liabilities",
    "Borrowings":                                                         "total_debt",
    "CashAndCashEquivalents":                                             "cash_and_equivalents",
    "TradeReceivables":                                                   "trade_receivables",
    "Inventories":                                                        "inventories",
    # ── NEW: Income & expense decomposition ──────────────────────────────────
    "Income":                                                             "total_income",
    "OtherIncome":                                                        "other_income",
    "OtherExpenses":                                                      "other_expenses",
    "PurchasesOfStockInTrade":                                            "purchases_stock_trade",
    "ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade":  "inventory_change",
    "EmployeeBenefitExpense":                                             "employee_expenses",
    # ── NEW: P&L quality & adjustments ───────────────────────────────────────
    "ProfitBeforeExceptionalItemsAndTax":                                 "pbt_before_exceptional",
    "ExceptionalItemsBeforeTax":                                          "exceptional_items_pretax",
    "OtherComprehensiveIncomeNetOfTaxes":                                 "oci",
    "ExceptionalItems":                                                   "exceptional_items",
    # ── NEW: Tax breakdown ────────────────────────────────────────────────────
    "TaxExpense":                                                         "tax_expense",
    "CurrentTax":                                                         "current_tax",
    "DeferredTax":                                                        "deferred_tax_charge",
    # ── NEW: Per-share metrics & equity ──────────────────────────────────────
    "BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations":   "eps_basic",
    "DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations": "eps_diluted",
    "FaceValueOfEquityShareCapital":                                      "face_value",
    # ── NEW: Cash flow — investing & financing activities ────────────────────
    "CashFlowsFromUsedInInvestingActivities":                             "cfi",
    "CashFlowsFromUsedInFinancingActivities":                             "cff",
    "RepaymentsOfBorrowingsClassifiedAsFinancingActivities":              "debt_repaid",
    "ProceedsFromBorrowingsClassifiedAsFinancingActivities":              "debt_raised",
    "DividendsPaidClassifiedAsFinancingActivities":                       "dividends_paid",
    # ── NEW: Ratios ──────────────────────────────────────────────────────────
    "DebtEquityRatio":                                                    "debt_to_equity",
    "DebtServiceCoverageRatio":                                           "dscr",
    "ReturnOnAssets":                                                     "roa",
}

# Metrics that are per-share (in INR)
PER_SHARE_METRICS = {
    "eps_basic",
    "eps_diluted",
    "face_value",
}

# Metrics that are unitless ratios
RATIO_METRICS = {
    "debt_to_equity",
    "dscr",
    "roa",
}

# Monetary INR aliases -> divide by 10,000,000 -> INR Crore
INR_UNIT_ALIASES = {"INR", "inr", "INR1", "INR Rupees"}

PROGRESS_EVERY = 25_000
BATCH_SIZE = 1_000


def validate_iso_date(value: str | None) -> bool:
    """Return True only if value is a parseable YYYY-MM-DD date string."""
    if not value:
        return False
    try:
        datetime.strptime(str(value).strip()[:10], "%Y-%m-%d")
        return True
    except ValueError:
        return False


def period_type(start: str | None, end: str) -> str:
    if not start:
        return "PERIOD"
    try:
        s = datetime.strptime(start[:10], "%Y-%m-%d")
        e = datetime.strptime(end[:10], "%Y-%m-%d")
        days = (e - s).days + 1
        if 80 <= days <= 100:
            return "QUARTERLY"
        if 170 <= days <= 200:
            return "HALF_YEARLY"
        if 250 <= days <= 290:
            return "NINE_MONTHS"
        if 330 <= days <= 380:
            return "ANNUAL"
    except ValueError:
        pass
    return "PERIOD"


def fact_id(isin: str, metric: str, period_end: str, scope: str, pt: str) -> str:
    parts = ["fere_xbrl_v2", isin, metric, period_end.replace("-", ""), scope, pt]
    return "_".join(str(p) for p in parts)[:200]


INSERT_SQL = """
    INSERT OR REPLACE INTO company_facts (
        factId, companyId, symbol, isin,
        metric, value, unit, currency,
        periodType, periodStart, periodEnd, asOfDate, reportedAt,
        factType, sourceType, scope, provider,
        sourceDocumentId, sourceUrl,
        evidenceText, verificationStatus, availabilityStatus,
        calculationMethod, fetchedAt, freshnessTtlDays,
        providerToken, exactProviderLabel,
        availableAt, publishedAt,
        derivationFormula, inputFactIds
    ) VALUES (
        ?,?,?,?,  ?,?,?,?,  ?,?,?,?,?,
        ?,?,?,?,  ?,?,  ?,?,?,
        ?,?,?,  ?,?,  ?,?,  ?,?
    )
"""


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    mode_label = "DRY-RUN" if dry_run else "APPLY"

    print(f"Portfolio DB : {PORTFOLIO_DB}", flush=True)
    print(f"FERE DB      : {FERE_DB}", flush=True)
    print(f"Mode         : {mode_label}", flush=True)
    print(f"FIELD_MAP    : {len(FIELD_MAP)} canonical NSE XBRL taxonomy fields", flush=True)
    print(f"Policy       : taxonomy_field-identified + date-verified + hash-verified", flush=True)

    for p, label in [(FERE_DB, "FERE DB"), (PORTFOLIO_DB, "Portfolio DB")]:
        if not os.path.exists(str(p)):
            print(f"ERROR: {label} not found: {p}", flush=True)
            sys.exit(1)

    # ── Load ticker master ───────────────────────────────────────────────────
    pcon = sqlite3.connect(PORTFOLIO_DB, timeout=60)
    pcon.execute("PRAGMA journal_mode=WAL")
    pcon.execute("PRAGMA synchronous=NORMAL")
    tickers = pcon.execute(
        "SELECT id, upper(symbol), upper(isin) FROM MasterTickers WHERE isin IS NOT NULL"
    ).fetchall()
    by_isin   = {r[2]: r for r in tickers}
    by_symbol = {r[1]: r for r in tickers}
    print(f"MasterTickers: {len(tickers):,} rows loaded", flush=True)

    # ── Open FERE DB read-only ───────────────────────────────────────────────
    fcon = sqlite3.connect(f"file:{FERE_DB}?mode=ro", uri=True, timeout=120)
    fcon.execute("PRAGMA journal_mode=WAL")

    total_in_fere = fcon.execute("SELECT COUNT(*) FROM verified_xbrl_fact").fetchone()[0]
    tf_placeholders = ",".join("?" * len(FIELD_MAP))
    canonical_in_fere = fcon.execute(
        f"SELECT COUNT(*) FROM verified_xbrl_fact WHERE taxonomy_field IN ({tf_placeholders})",
        list(FIELD_MAP.keys())
    ).fetchone()[0]
    print(f"FERE total rows     : {total_in_fere:,}", flush=True)
    print(f"FERE canonical rows : {canonical_in_fere:,} (taxonomy_field in FIELD_MAP)", flush=True)

    # ── Stream: latest filing per (isin, taxonomy_field, period, scope) ──────
    # Filter on taxonomy_field — Codex's canonical identification key.
    # Latest filing wins when same company/field/period/scope has multiple rows.
    cursor = fcon.execute(f"""
        SELECT f.id, f.isin, f.symbol, f.filing_id, f.filing_sha256,
               f.source_url, f.available_at, f.period_start, f.period_end,
               f.scope, f.context_ref, f.metric, f.value, f.unit, f.taxonomy_field
        FROM verified_xbrl_fact f
        JOIN (
            SELECT isin, symbol, taxonomy_field, period_start, period_end, scope,
                   MAX(id) AS max_id
            FROM verified_xbrl_fact
            WHERE taxonomy_field IN ({tf_placeholders})
              AND source_url    IS NOT NULL
              AND filing_sha256 IS NOT NULL
              AND available_at  IS NOT NULL
              AND period_end    IS NOT NULL
              AND scope         IS NOT NULL
              AND value         IS NOT NULL
            GROUP BY isin, symbol, taxonomy_field, period_start, period_end, scope
        ) latest ON latest.max_id = f.id
        ORDER BY f.isin, f.period_end DESC, f.taxonomy_field
    """, list(FIELD_MAP.keys()))

    # ── Counters ─────────────────────────────────────────────────────────────
    n_processed = n_promoted = 0
    n_skip_no_ticker = n_skip_bad_date = n_skip_bad_value = n_skip_scope = 0
    metric_counts: dict[str, int] = {}
    promoted_symbols: set[str] = set()
    unmatched_symbols: set[str] = set()

    batch: list[tuple] = []
    t0 = time.time()
    now_iso = datetime.now(timezone.utc).isoformat()

    if not dry_run:
        pcon.execute("BEGIN IMMEDIATE")

    for row in cursor:
        (fere_id, isin, symbol, filing_id, sha256,
         src_url, available_at, period_start, period_end,
         scope, context_ref, raw_metric, raw_value, unit, taxonomy_field) = row

        n_processed += 1

        # ── Gate 1: period_end must be valid ISO date ─────────────────────
        if not validate_iso_date(period_end):
            n_skip_bad_date += 1
            continue

        # ── Gate 2: period_start must be valid if present ─────────────────
        if period_start and not validate_iso_date(period_start):
            n_skip_bad_date += 1
            continue

        # ── Gate 3: scope must be STANDALONE or CONSOLIDATED ──────────────
        scope_clean = str(scope or "").strip().upper()
        if scope_clean not in ("STANDALONE", "CONSOLIDATED"):
            n_skip_scope += 1
            continue

        # ── Gate 4: value must be a finite float ──────────────────────────
        try:
            fvalue = float(raw_value)
        except (TypeError, ValueError):
            n_skip_bad_value += 1
            continue
        if not math.isfinite(fvalue):
            n_skip_bad_value += 1
            continue

        # ── Gate 5: resolve ticker by ISIN first, then symbol ─────────────
        ticker = by_isin.get(str(isin or "").upper()) or by_symbol.get(str(symbol or "").upper())
        if not ticker:
            n_skip_no_ticker += 1
            unmatched_symbols.add(str(symbol or "").upper())
            continue

        # ── All gates passed ──────────────────────────────────────────────
        # Look up canonical name via taxonomy_field (authoritative) with
        # raw_metric as fallback (normalizer already set it from FIELD_MAP).
        canonical = FIELD_MAP.get(taxonomy_field) or FIELD_MAP.get(raw_metric)
        if not canonical:
            # Should not happen given SQL filter, but guard defensively
            continue
        pt = period_type(period_start, period_end)

        # Unit and value conversion
        u = str(unit or "").strip()
        if canonical in PER_SHARE_METRICS:
            canon_value = fvalue
            canon_unit = "INR_PER_SHARE"
            currency = "INR"
            formula = "identity"
        elif canonical in RATIO_METRICS:
            canon_value = fvalue
            canon_unit = "RATIO"
            currency = None
            formula = "identity"
        elif u in INR_UNIT_ALIASES or u.upper() == "INR":
            canon_value = fvalue / 10_000_000
            canon_unit = "INR_CR"
            currency = "INR"
            formula = "value_in_inr / 10000000"
        else:
            canon_value = fvalue
            canon_unit = u or "UNITS"
            currency = None
            formula = None

        fid = fact_id(str(isin or "").upper(), canonical, str(period_end), scope_clean, pt)
        evidence = json.dumps({
            "rawMetric": raw_metric,
            "rawValue": raw_value,
            "rawUnit": unit,
            "taxonomyField": taxonomy_field,
            "contextRef": context_ref,
            "filingId": filing_id,
            "sha256": sha256[:16] if sha256 else None,
            "conversion": formula or "identity",
        }, separators=(",", ":"))

        t_id, t_sym, t_isin = ticker[0], ticker[1], ticker[2]

        if not dry_run:
            batch.append((
                fid, str(t_id), t_sym, t_isin,
                canonical, str(canon_value), canon_unit, currency,
                pt, period_start or None, str(period_end), str(period_end), available_at,
                "REPORTED", "PRIMARY_FILING", scope_clean, "FERE_NSE_XBRL",
                f"FERE_XBRL:{filing_id}:{sha256}", src_url,
                evidence, "VERIFIED", "AVAILABLE",
                "FERE_VERIFIED_XBRL_CANONICAL_V2", now_iso, 540,
                raw_metric, taxonomy_field,
                available_at, now_iso,
                formula,
                json.dumps([f"fere_xbrl_fact:{fere_id}"]),
            ))
            if len(batch) >= BATCH_SIZE:
                pcon.executemany(INSERT_SQL, batch)
                batch.clear()

        n_promoted += 1
        metric_counts[canonical] = metric_counts.get(canonical, 0) + 1
        promoted_symbols.add(t_sym)

        if n_processed % PROGRESS_EVERY == 0:
            elapsed = time.time() - t0
            rate = n_processed / max(elapsed, 0.001)
            eta = (canonical_in_fere - n_processed) / max(rate, 0.001)
            print(
                f"  [{n_processed:>7,}/{canonical_in_fere:,}] promoted={n_promoted:,} "
                f"| skip(date={n_skip_bad_date} scope={n_skip_scope} "
                f"ticker={n_skip_no_ticker} val={n_skip_bad_value})"
                f" | {rate:.0f} rows/s | ETA ~{eta:.0f}s",
                flush=True,
            )

    # Final flush
    if not dry_run and batch:
        pcon.executemany(INSERT_SQL, batch)
    if not dry_run:
        pcon.execute("COMMIT")
        fere_rows_in_cf = pcon.execute(
            "SELECT COUNT(*) FROM company_facts WHERE provider='FERE_NSE_XBRL'"
        ).fetchone()[0]
        print(f"\ncompany_facts FERE_NSE_XBRL rows (total): {fere_rows_in_cf:,}", flush=True)

    fcon.close()
    elapsed_total = time.time() - t0

    report = {
        "generatedAt": now_iso,
        "mode": mode_label,
        "policy": "taxonomy_field_canonical_date_verified",
        "fieldMap": FIELD_MAP,
        "elapsedSeconds": round(elapsed_total, 1),
        "fereFactsTotal": total_in_fere,
        "fereCanonicalRows": canonical_in_fere,
        "rowsProcessed": n_processed,
        "rowsPromoted": n_promoted,
        "skippedBadDate": n_skip_bad_date,
        "skippedBadScope": n_skip_scope,
        "skippedBadValue": n_skip_bad_value,
        "skippedNoTicker": n_skip_no_ticker,
        "symbolsPromoted": len(promoted_symbols),
        "metricCounts": metric_counts,
        "unmatchedSymbolsSample": sorted(unmatched_symbols)[:50],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2))

    print(f"\nReport -> {REPORT_PATH}", flush=True)
    print(json.dumps({k: v for k, v in report.items() if k not in ("unmatchedSymbolsSample", "fieldMap")}, indent=2), flush=True)
    pcon.close()


if __name__ == "__main__":
    main()
