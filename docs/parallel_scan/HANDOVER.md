# Parallel scan — progress and handover

Updated: 22 November 2026. Owner: Gopal Sharma. Branch: `parallel-scan` in `jswebexguru50-byte/WealthOS17sep`. The branch is public. This document is a working checkpoint; update it and commit after each meaningful development stage.

## Objective and constraints

Start from the existing 1,521-name technical scanner universe, retain all technical triggers, then support review of fundamentals, valuation, liquidity and risk. Preserve the original scanner and do not change strategy definitions, thresholds or weights without explicit owner approval. No orders or unvalidated buy verdicts. See `CONSTITUTION.md` and `IMPLEMENTATION_SPEC.md`.

The owner explicitly approved publishing the parallel-scan code and review documents to this public repository. Do not publish `portfolio.db`, credentials, private MCP URLs, downloaded provider responses or generated company-level results. The browser inspection surfaced a Trendlyne token; the owner was asked to refresh it. Do not reuse that token or put replacement credentials in chat, GitHub or logs.

## Status by activity

| Activity | Status | Evidence / next action |
|---|---|---|
| Strategy code review | Done for static bundle review; validation incomplete | `STRATEGY_CODE_REVIEW.md` documents timing, pivot and data issues; replay and backtest remain. |
| Branch and documentation | Done | Branch `parallel-scan`; constitution, spec and review are present. |
| Read-only shadow scan | Initial implementation complete | `scripts/parallel_scan/parallel_scan.py`; reads explicit review ZIP and existing DB, never runs or modifies scanner. |
| Signal reconciliation | Pilot passed | 2026-11-22 bundle: 1,288 signals, 688 unique stocks. DB was current at inspection, not verified as immutable scan snapshot. |
| Candidate interface | Initial implementation complete | `index.html`, `companies.html`, `signals.csv` and `report.json` generated locally; evidence and warnings shown. Not a finished product UI. |
| Screener | Cached DB integration complete | `ScreenerFundamentals` and field provenance; as-of signal dates and reporting periods unverified. Live refresh not integrated. |
| Trendlyne | Cached DB integration; live pilot prepared, untested | `trendlyne_latest` plus `trendlyne_fetch.mjs` and conservative `trendlyne_parse.py`. Confirm token refresh; configure privately; run small live pilot and validate provider output. |
| TradingView | Browser access verified; automation incomplete | Signed-in screener was visible. Use manual chart/screener review and supported exports/alerts. TradingView prohibits automated data collection; do not build scraping. |
| Tests | Six targeted tests passed | `python3 -m unittest discover -s tests/parallel_scan -v`; full integration, source quality and browser validation remain. |
| Daily pipeline | Not complete | Need stable scanner-run manifest, supported input handoff, safe snapshot strategy, error recovery, freshness and scheduling. |
| Backtesting and trade lifecycle | Not complete | Define execution semantics with owner; obtain point-in-time data and replay. Current range touches are observations, not fills. |
| Investment assessment | Not complete | Add sector-specific evidence, period-aware financial history, valuation scenarios and cited governance research; no inferred investment grade. |

## Resume sequence

1. Read `AGENT_CONSTITUTION.md` and repository instructions, plus this directory's constitution, implementation spec and strategy review. Respect the owner's explicit scope: isolated parallel scan, original scanner intact.
2. Retrieve branch files from GitHub; the session workspace used a detached worktree and files under `docs/parallel_scan` and `scripts/parallel_scan` may be ignored by the base `.gitignore`. Ensure new artifacts are explicitly tracked.
3. Inspect the existing live system and environment before changing configuration. Main checkout has `portfolio.db` and the 2026-11-22 bundle at `outputs/dossier_review/EightStrategy_Scan_Code_and_Specs_2026-11-22.zip`. DB is large and uses WAL. Open read-only; do not copy the DB alone while writes occur.
4. Confirm the owner has refreshed the Trendlyne MCP token exposed in the earlier browser observation. Use a secure local environment or credential store for the replacement; do not request it in chat. Chrome can access Trendlyne, Screener and TradingView; browser connection can be checked with the browser inventory. Network and SDK access must be verified in the actual execution environment.
5. Run a small bounded Trendlyne MCP test using verified symbol and parameter tokens; inspect the raw response privately, test mapping, basis, units, dates, failure behavior and quota. `--trendlyne-response` can include parsed observations as unverified evidence. Do not conflate cached and live fields or auto-promote them to trusted facts.
6. Add repeatable source inputs and DB snapshot/run identity; add tests for inconsistent ZIPs, aliases, run timestamps, coverage, invalid bars and incomplete fundamentals. Next build the company evidence and usable review interface, then implement the approved daily workflow.
7. After each stage run appropriate tests and a non-destructive pilot, update this document with date, commit, status, observed results and unresolved items, and commit/push to the public branch. Do not upload local output data or secrets.

## Running the existing pilot

```
python3 scripts/parallel_scan/parallel_scan.py \
  --archive /Users/gopalsharma/WealthOS/outputs/dossier_review/EightStrategy_Scan_Code_and_Specs_2026-11-22.zip \
  --db /Users/gopalsharma/WealthOS/portfolio.db \
  --aliases /Users/gopalsharma/WealthOS/data/reference/tier1_symbol_aliases.json \
  --output /private/tmp/wealthos-parallel-NEW-RUN
python3 -m unittest discover -s tests/parallel_scan -v
```

Use a new output directory each run. Local pilot output exists at `/private/tmp/wealthos-parallel-pilot-08`, but temporary files may disappear. Never interpret a touch as a fill or current cached data as historically available. No live Trendlyne test has been completed.

## Checkpoint log

- 22 Nov 2026: Initial documentation and shadow pipeline uploaded. Pilot matched 1,288 signals and 688 companies. Screener and Trendlyne cached snapshots added; original scanner unchanged.
- 22 Nov 2026: Chrome session verified. Budget-limited Trendlyne MCP client, conservative parser and optional response inclusion added. No live MCP call; token refresh pending confirmation. Six tests passed, including a synthetic archive-to-SQLite report integration test.
- 22 Nov 2026: Added this handover and activity tracker. Next: secure Trendlyne pilot and reproducible input provenance.

- 22 Nov 2026: Added a synthetic archive-to-read-only-SQLite integration test covering reconciliation, source basis, signal age and unverified MCP observations. Six tests pass.

## Owner direction — Trendlyne website

The owner asked to use the signed-in Trendlyne website and leave MCP out. Chrome access was verified. A normal company financial-table export showed “This is a subscriber feature”; MCP Max does not establish entitlement to that website feature. Do not collect Chrome cookies or use undocumented endpoints by default. Trendlyne website terms restrict use in searchable machine-readable databases absent specific written authorization; verify the account's applicable license and permitted export/API before implementing automated collection. Browser review and already licensed/available local snapshots remain possible; keep their provenance and dates. The existing MCP experimental code is retained for history but is not the active integration. TradingView automated collection remains prohibited by its published policy.
