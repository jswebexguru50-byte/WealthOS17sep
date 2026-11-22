# Parallel scan: initial shadow implementation

This is a work-in-progress, read-only analysis of a single explicit scanner review bundle. It does not run, edit or replace the scanner. It reports all archived events and reads current Screener and cached Trendlyne snapshots; it does not calculate scores or place orders.

Run with Python 3.9+:

```
python3 scripts/parallel_scan/parallel_scan.py --archive /path/to/EightStrategy_Scan_Code_and_Specs_2026-11-22.zip --db /path/to/portfolio.db --aliases /path/to/tier1_symbol_aliases.json --output /path/to/new-run-directory
python3 -m unittest discover -s tests/parallel_scan -v
```

Outputs contain sensitive research results. Keep them out of version control and public repositories. `report.json` retains complete original signal rows, per-session observations and current fundamental fields; `index.html` is a searchable view with expandable evidence; `companies.html` groups signals by company; `signals.csv` is a compact export. Reusing an existing output directory fails. The scanner archive, database and aliases remain unchanged. Database access uses a read-only transaction; that is consistent for the duration of a run but is not a portable immutable snapshot. No statement is made that this database matches the archived run. Aliases are optional; identity is unverified without a documented mapping.

Data limitations: vendor snapshot reporting periods/publication times are not yet available, current financials are not historical. Trendlyne observations are cached, not live MCP responses. No confidence, valuation verdict, execution inference or scored ranking is produced. The CLI currently requires the archived waterfall and an existing adjusted table; missing tables fail rather than guessing. TradingView is not scraped. MCP authentication/enrichment, source-event identity, per-check sector-aware applicability, deeper evidence and complete UI remain to build. See `docs/parallel_scan/IMPLEMENTATION_SPEC.md` and `STRATEGY_CODE_REVIEW.md`.

Pilot on 2026-11-22 bundle and current main-checkout DB: 1,288 events, 688 distinct symbols; not an independently verified historical snapshot. Tests cover ambiguous bar ordering, gap-through-stop and missing levels. Before unattended use add snapshot integrity, exchange-calendar coverage, vendor observation dates and authentication, retry/cache policies, robust data-quality reporting, UI review and broader integration tests.

## Optional Trendlyne MCP pilot

`trendlyne_fetch.mjs` is an independent, budget-limited raw fetcher for Trendlyne MCP. It requires the official `@modelcontextprotocol/sdk` dependency, a private `TRENDLYNE_MCP_URL` environment variable, a local JSON file with verified `stock_codes`, Trendlyne parameter `tokens` under `parameters`, and an explicit `max_calls` budget. It writes only to a new local output file with owner-only permissions; raw provider responses can be supplied explicitly with `--trendlyne-response`; parsed observations remain separate and marked unverified. Obtain parameter tokens using the provider's search tool and validate identity, units, financial period, basis and response structure before using the output. Never commit the URL, requests, provider responses, or generated reports. Credentials can be embedded in the URL: avoid shell history and process logs. The endpoint is restricted to the official Trendlyne HTTPS host. This is not yet a scheduled refresh, cache, parser, or live end-to-end integration.
