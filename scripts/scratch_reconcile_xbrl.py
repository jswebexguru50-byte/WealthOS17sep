import sqlite3
import sys
import os

sys.path.insert(0, ".")

FERE_DB = "data/fere/verified_filings/fere_evidence.db"
PORTFOLIO_DB = "portfolio.db"

fcon = sqlite3.connect(f"file:{FERE_DB}?mode=ro", uri=True)
pcon = sqlite3.connect(f"file:{PORTFOLIO_DB}?mode=ro", uri=True)

# 1. Source facts
total_source = fcon.execute("SELECT COUNT(*) FROM verified_xbrl_fact").fetchone()[0]

from scripts.fundamental.promote_all_xbrl_to_company_facts import FIELD_MAP
tf_placeholders = ",".join("?" * len(FIELD_MAP))
mapped_source = fcon.execute(
    f"SELECT COUNT(*) FROM verified_xbrl_fact WHERE taxonomy_field IN ({tf_placeholders})",
    list(FIELD_MAP.keys())
).fetchone()[0]

unmapped_source = total_source - mapped_source

eligible_source = fcon.execute(f"""
    SELECT COUNT(*) FROM verified_xbrl_fact
    WHERE taxonomy_field IN ({tf_placeholders})
      AND source_url    IS NOT NULL
      AND filing_sha256 IS NOT NULL
      AND available_at  IS NOT NULL
      AND period_end    IS NOT NULL
      AND scope         IS NOT NULL
      AND value         IS NOT NULL
""", list(FIELD_MAP.keys())).fetchone()[0]

ineligible_source = mapped_source - eligible_source

# Deduplicated group count
dedup_count = fcon.execute(f"""
    SELECT COUNT(*) FROM (
        SELECT isin, symbol, taxonomy_field, period_start, period_end, scope, MAX(id)
        FROM verified_xbrl_fact
        WHERE taxonomy_field IN ({tf_placeholders})
          AND source_url    IS NOT NULL
          AND filing_sha256 IS NOT NULL
          AND available_at  IS NOT NULL
          AND period_end    IS NOT NULL
          AND scope         IS NOT NULL
          AND value         IS NOT NULL
        GROUP BY isin, symbol, taxonomy_field, period_start, period_end, scope
    )
""", list(FIELD_MAP.keys())).fetchone()[0]

collapsed_duplicates = eligible_source - dedup_count

# Check company_facts
total_cf = pcon.execute("SELECT COUNT(*) FROM company_facts").fetchone()[0]
fere_cf = pcon.execute("SELECT COUNT(*) FROM company_facts WHERE provider='FERE_NSE_XBRL'").fetchone()[0]

# Metrics breakdown in company_facts
cf_metrics = dict(pcon.execute("SELECT metric, COUNT(*) FROM company_facts WHERE provider='FERE_NSE_XBRL' GROUP BY metric").fetchall())

# The 9 original metrics promoted prior to this run:
ORIGINAL_9 = {"revenue", "pat", "cfo", "pbt", "finance_costs", "depreciation", "total_expenses", "materials_cost", "equity_capital"}

original_9_count = sum(cf_metrics.get(m, 0) for m in ORIGINAL_9)
new_24_count = sum(cnt for m, cnt in cf_metrics.items() if m not in ORIGINAL_9)

print(f"Total Source Facts             : {total_source:,}")
print(f"Mapped Source Facts            : {mapped_source:,}")
print(f"Unmapped Source Facts          : {unmapped_source:,}")
print(f"Eligible Source Facts          : {eligible_source:,}")
print(f"Ineligible (null fields)       : {ineligible_source:,}")
print(f"Deduplicated Group (Attempts)  : {dedup_count:,}")
print(f"Collapsed Duplicate Rows       : {collapsed_duplicates:,}")
print(f"---")
print(f"company_facts Total Rows       : {total_cf:,}")
print(f"company_facts FERE Rows        : {fere_cf:,}")
print(f"Original 9 Metrics Rows        : {original_9_count:,}")
print(f"New 24 Metrics Rows (Net Delta): {new_24_count:,}")
print(f"Updated/Replaced Existing Rows : {dedup_count - new_24_count:,}")
print(f"Sum of Original + New          : {original_9_count + new_24_count:,}")
