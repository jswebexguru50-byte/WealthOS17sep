# Parallel scan: initial shadow implementation

This is a work-in-progress, read-only analysis of a single explicit scanner review bundle. It does not run, edit or replace the scanner. It reports all archived events and reads current Screener snapshots; it does not calculate scores or place orders.

Run with Python 3.9+:

```
python3 scripts/parallel_scan/parallel_scan.py --archive /path/to/EightStrategy_Scan_Code_and_Specs_2026-11-22.zip --db /path/to/portfolio.db --aliases /path/to/tier1_symbol_aliases.json --output /path/to/new-run-directory
python3 -m unittest discover -s tests/parallel_scan -v
```

Outputs contain sensitive research results. Keep them out of version control and public repositories. `report.json` retains complete original signal rows, per-session observations and current fundamental fields; `index.html` is a minimal view. Reusing an existing output directory fails. The scanner archive, database and aliases remain unchanged. Database access uses a read-only transaction; that is consistent for the duration of a run but is not a portable immutable snapshot. No statement is made that this database matches the archived run. Aliases are optional; identity is unverified without a documented mapping.

Data limitations: vendor snapshot reporting periods/publication times are not yet available, current financials are not historical. No confidence, valuation verdict, execution inference or scored ranking is produced. The CLI currently requires the archived waterfall and an existing adjusted table; missing tables fail rather than guessing. TradingView is not scraped. MCP authentication/enrichment, source-event identity, per-check sector-aware applicability, deeper evidence and complete UI remain to build. See `docs/parallel_scan/IMPLEMENTATION_SPEC.md` and `STRATEGY_CODE_REVIEW.md`.

Pilot on 2026-11-22 bundle and current main-checkout DB: 1,288 events, 688 distinct symbols; not an independently verified historical snapshot. Tests cover ambiguous bar ordering, gap-through-stop and missing levels. Before unattended use add snapshot integrity, exchange-calendar coverage, vendor observation dates and authentication, retry/cache policies, robust data-quality reporting, UI review and broader integration tests.
