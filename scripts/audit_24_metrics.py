import sqlite3
import json
import numpy as np

FERE_DB = "data/fere/verified_filings/fere_evidence.db"
PORTFOLIO_DB = "portfolio.db"

fcon = sqlite3.connect(f"file:{FERE_DB}?mode=ro", uri=True)
pcon = sqlite3.connect(f"file:{PORTFOLIO_DB}?mode=ro", uri=True)

NEW_24_METRICS = [
    # Income & Expense decomposition
    ("OtherIncome", "other_income"),
    ("Income", "total_income"),
    ("OtherExpenses", "other_expenses"),
    ("PurchasesOfStockInTrade", "purchases_stock_trade"),
    ("ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade", "inventory_change"),
    ("EmployeeBenefitExpense", "employee_expenses"),
    # P&L quality / adjustments
    ("ProfitBeforeExceptionalItemsAndTax", "pbt_before_exceptional"),
    ("ExceptionalItemsBeforeTax", "exceptional_items_pretax"),
    ("OtherComprehensiveIncomeNetOfTaxes", "oci"),
    ("ExceptionalItems", "exceptional_items"),
    # Tax breakdown
    ("TaxExpense", "tax_expense"),
    ("CurrentTax", "current_tax"),
    ("DeferredTax", "deferred_tax_charge"),
    # EPS & capital
    ("BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations", "eps_basic"),
    ("DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations", "eps_diluted"),
    ("FaceValueOfEquityShareCapital", "face_value"),
    # Cash flow lines
    ("CashFlowsFromUsedInInvestingActivities", "cfi"),
    ("CashFlowsFromUsedInFinancingActivities", "cff"),
    ("RepaymentsOfBorrowingsClassifiedAsFinancingActivities", "debt_repaid"),
    ("ProceedsFromBorrowingsClassifiedAsFinancingActivities", "debt_raised"),
    ("DividendsPaidClassifiedAsFinancingActivities", "dividends_paid"),
    # Ratios
    ("DebtEquityRatio", "debt_to_equity"),
    ("DebtServiceCoverageRatio", "dscr"),
    ("ReturnOnAssets", "roa"),
]

# Map taxonomy field to canonical metric
TF_TO_CM = {tf: cm for tf, cm in NEW_24_METRICS}
CM_TO_TF = {cm: tf for tf, cm in NEW_24_METRICS}
tf_set = set(TF_TO_CM.keys())
cm_set = set(CM_TO_TF.keys())

# Storage for streaming aggregation
from collections import defaultdict
source_data = defaultdict(lambda: {"values": [], "units": set(), "samples": []})
cf_data = defaultdict(lambda: {"values": [], "units": set(), "samples": []})

print("Streaming verified_xbrl_fact for 24 metrics...")
tf_placeholders = ",".join("?" for _ in tf_set)
cursor = fcon.execute(f"""
    SELECT taxonomy_field, value, unit, isin, symbol, period_end, scope, context_ref
    FROM verified_xbrl_fact
    WHERE taxonomy_field IN ({tf_placeholders}) AND value IS NOT NULL
""", list(tf_set))

count = 0
for tf, val, unit, isin, sym, p_end, scope, ctx in cursor:
    count += 1
    d = source_data[tf]
    if len(d["values"]) < 20000:  # sample up to 20k values for percentiles/stats
        try:
            d["values"].append(float(val))
        except (ValueError, TypeError):
            pass
    d["units"].add(unit)
    if len(d["samples"]) < 5:
        d["samples"].append({"val": val, "unit": unit, "sym": sym, "period": p_end, "scope": scope})

print(f"Finished verified_xbrl_fact pass: processed {count} matching rows.")

print("Streaming company_facts for 24 metrics...")
cm_placeholders = ",".join("?" for _ in cm_set)
cursor_cf = pcon.execute(f"""
    SELECT metric, value, unit, symbol, periodEnd, scope
    FROM company_facts
    WHERE metric IN ({cm_placeholders}) AND provider = 'FERE_NSE_XBRL' AND value IS NOT NULL
""", list(cm_set))

count_cf = 0
for cm, val, unit, sym, p_end, scope in cursor_cf:
    count_cf += 1
    d = cf_data[cm]
    if len(d["values"]) < 20000:
        try:
            d["values"].append(float(val))
        except (ValueError, TypeError):
            pass
    d["units"].add(unit)
    if len(d["samples"]) < 5:
        d["samples"].append({"val": val, "unit": unit, "sym": sym, "period": p_end, "scope": scope})

print(f"Finished company_facts pass: processed {count_cf} matching rows.")

results = {}
for tf, cm in NEW_24_METRICS:
    s_d = source_data[tf]
    c_d = cf_data[cm]
    s_vals = s_d["values"]
    c_vals = c_d["values"]

    results[cm] = {
        "taxonomyField": tf,
        "sourceUnits": list(s_d["units"]),
        "cfUnits": list(c_d["units"]),
        "sourceSampleSize": len(s_vals),
        "cfSampleSize": len(c_vals),
        "sourceStats": {
            "min": min(s_vals) if s_vals else None,
            "max": max(s_vals) if s_vals else None,
            "mean": float(np.mean(s_vals)) if s_vals else None,
            "median": float(np.median(s_vals)) if s_vals else None,
            "p5": float(np.percentile(s_vals, 5)) if s_vals else None,
            "p95": float(np.percentile(s_vals, 95)) if s_vals else None,
        },
        "cfStats": {
            "min": min(c_vals) if c_vals else None,
            "max": max(c_vals) if c_vals else None,
            "mean": float(np.mean(c_vals)) if c_vals else None,
            "median": float(np.median(c_vals)) if c_vals else None,
            "p5": float(np.percentile(c_vals, 5)) if c_vals else None,
            "p95": float(np.percentile(c_vals, 95)) if c_vals else None,
        },
        "samplesSource": s_d["samples"],
        "samplesCf": c_d["samples"]
    }
    print(f"Metric: {cm} | Source Unit: {s_d['units']} -> CF Unit: {c_d['units']} | Median: {results[cm]['sourceStats']['median']} -> {results[cm]['cfStats']['median']}")

with open("reports/review/runs/XBRL_BASELINE_VERIFICATION/raw_metric_analysis.json", "w") as f:
    json.dump(results, f, indent=2)
print("Saved analysis to reports/review/runs/XBRL_BASELINE_VERIFICATION/raw_metric_analysis.json")
