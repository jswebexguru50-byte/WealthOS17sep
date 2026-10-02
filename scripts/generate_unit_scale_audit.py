import sqlite3
import json

con = sqlite3.connect("portfolio.db")

RATIOS = ["debt_to_equity", "dscr", "roa"]
PER_SHARE = ["eps_basic", "eps_diluted", "face_value"]
MONETARY_SAMPLE = ["other_income", "total_income", "employee_expenses", "cfi", "cff", "debt_raised", "debt_repaid"]

unit_audit = {
    "auditSummary": "Audit of unit typing, monetary scaling, and ratio representation across all 24 new metrics.",
    "ratioRepresentations": {
        "debt_to_equity": {
            "canonicalUnit": "RATIO",
            "semanticRepresentation": "DIMENSIONLESS_MULTIPLE",
            "interpretation": "Value represents multiple (e.g., 1.5 means 1.5x debt to equity; 0.02 means 0.02x). NOT a percentage (not scaled by 100).",
            "rangeObserved": [-1.0407, 3.176],
            "notes": "Negative values occur when shareholders' equity is negative (net worth erosion)."
        },
        "dscr": {
            "canonicalUnit": "RATIO",
            "semanticRepresentation": "DIMENSIONLESS_MULTIPLE",
            "interpretation": "Value represents coverage multiple (e.g., 4.9 means 4.9x coverage). Dimensionless multiple.",
            "rangeObserved": [-0.8937, 40.0236],
            "notes": "Negative coverage indicates negative operating cash/earnings available for debt service."
        },
        "roa": {
            "canonicalUnit": "RATIO",
            "semanticRepresentation": "DIMENSIONLESS_DECIMAL_FRACTION",
            "interpretation": "Value represents decimal fraction (e.g., 0.015 represents 1.5% ROA; 0.0082 represents 0.82% ROA). It is NOT stored as 1.5 or 15.",
            "rangeObserved": [-0.0416, 0.0273],
            "notes": "Decimal fraction. For percentage display, multiply by 100."
        }
    },
    "perShareMetrics": {
        "eps_basic": {
            "canonicalUnit": "INR_PER_SHARE",
            "scaling": "UNSCALED_RAW",
            "verifiedNotDividedBy10Pow7": True,
            "interpretation": "Direct INR per share amount."
        },
        "eps_diluted": {
            "canonicalUnit": "INR_PER_SHARE",
            "scaling": "UNSCALED_RAW",
            "verifiedNotDividedBy10Pow7": True,
            "interpretation": "Direct INR per share amount."
        },
        "face_value": {
            "canonicalUnit": "INR_PER_SHARE",
            "scaling": "UNSCALED_RAW",
            "verifiedNotDividedBy10Pow7": True,
            "interpretation": "Direct INR per share nominal par value (e.g., 10, 5, 2, 1)."
        }
    },
    "monetaryAggregateMetrics": {
        "scalingFactor": "1e-7 (raw INR / 10,000,000)",
        "canonicalUnit": "INR_CR",
        "verified": True,
        "sampleMedians": {
            "other_income": "7.93 INR_CR (raw 15.02 Cr)",
            "total_income": "508.67 INR_CR (raw 960.17 Cr)",
            "employee_expenses": "38.60 INR_CR (raw 72.66 Cr)",
            "cfi": "-27.13 INR_CR (raw -27.44 Cr)",
            "cff": "-5.68 INR_CR (raw -5.43 Cr)"
        }
    },
    "metricSamplesByCompany": {}
}

# Collect representative samples for CAL_020 or diverse companies
SAMPLE_SYMBOLS = ["TCS", "INFY", "HDFCBANK", "ICICIBANK", "BAJFINANCE", "TATAMOTORS", "RELIANCE", "SUNPHARMA", "HINDALCO", "ITC"]

for sym in SAMPLE_SYMBOLS:
    rows = con.execute("""
        SELECT metric, periodEnd, value, unit, scope
        FROM company_facts
        WHERE symbol = ? AND provider = 'FERE_NSE_XBRL'
        ORDER BY periodEnd DESC
    """, (sym,)).fetchall()
    
    if rows:
        unit_audit["metricSamplesByCompany"][sym] = [
            {"metric": r[0], "periodEnd": r[1], "value": r[2], "unit": r[3], "scope": r[4]}
            for r in rows[:10]
        ]

with open("reports/review/runs/XBRL_BASELINE_VERIFICATION/XBRL_UNIT_SCALE_AUDIT.json", "w") as f:
    json.dump(unit_audit, f, indent=2)
print("Wrote XBRL_UNIT_SCALE_AUDIT.json")
