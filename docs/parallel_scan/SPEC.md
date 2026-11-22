# WealthOS parallel opportunity review — plan and specification

Status: implementation proposal, 22 November 2026. This is a shadow research workflow. It does not alter the live scanner, strategy rules, stop formula, scores, weights or dossier. All thresholds and new selection rules require owner approval. No orders are placed.

## Objective and scope

Start with the existing 1,521-name universe and the existing eight strategy signals over the full 22-session window. Help the owner identify technically interesting, financially solid and executable opportunities. Preserve every signal and supply evidence for a human decision. Group by stock for review but retain each strategy, trigger, entry, stop and target. No automatic investment-grade or buy verdict is justified by current validation.

## Deliverables

1. A run-scoped `signals.jsonl` normalized from the existing scan; `candidate_cards.jsonl`; `errors.jsonl`; and an HTML/CSV view. Record schema version, scanner run ID, universe ID, code/config versions, price snapshot, data timestamps and hashes in `manifest.json`.
2. Each card: security identity and exchange; all triggers and strategy families; trading-session age; entry convention; price-data quality; subsequent-bar observations; median traded value and recent no-trade sessions; fundamental facts with source and periods; valuation context; explicit missing data and dated evidence links; no combined score.
3. Review states are descriptive: `needs_data`, `needs_review`, `reviewed`; user decisions are stored separately with date, rationale and invalidation conditions. None means a buy recommendation.
4. Filters and sorting are optional presentation controls. Defaults must not silently suppress any stock, including names excluded from legacy Picks. Counts reconcile 1,288 signals and 688 names for the sample run, conditional on input availability.

## Pipeline contract

- Inputs are immutable, explicit paths, never 'latest file'. Scanner adapter reads only completed output; preserve input files and mapping warnings. Reject invalid dates, duplicate signal IDs, absent run IDs, inconsistent universe or missing critical columns. Identity uses ISIN when verified, plus exchange and original symbol; unresolved mappings go to review, never guessed.
- Steps: validate manifest and signals → read price history through a read-only connection/snapshot → calculate lifecycle and liquidity → request stale/missing fundamentals using a cached MCP adapter → normalize observations and identify missing data → generate cards → publish output atomically in a separate run directory. Failed enrichment produces partial cards and explicit errors, not fabricated data.
- Capture source and retrieval time, company reporting period, consolidated/standalone basis, units, original value and point-in-time availability if known. Do not substitute data across periods or bases silently. No future financial observations in historical analysis.
- Use the same authorized price-table snapshot as the source scan; record raw/unadjusted/derived/unanchored quality. Compare adjusted prices only on the same basis. Flag action or unreliable seams, and do not assert lifecycle where price basis is uncertain.
- Daily refresh: bars and observed lifecycle. On new results or stale cache: financial statements. Ownership on publication. Documents on demand or when a new document is available. Set concrete TTLs only after the pilot and owner decision. Never treat fetch date as publication date.

## Lifecycle semantics

Daily OHLC cannot establish an order fill or intrabar sequence. Record facts, not hypothetical trade status. For completed bars after the signal, record whether high/low range contains each level. Both stop and target in one bar is ambiguous; touching levels before a hypothetical entry is not an executed trade. Gaps can skip levels; report gap-through separately. Determine signal-day and post-signal eligible entry using the actual strategy convention, after its definition is supplied. Incomplete final bars must not be used. Missing sessions and splits imply unknown unless data is reconciled. Historical entry/stop/target are kept unchanged and not presented as current executable quotes.

## Fundamentals and interpretation

Pilot field set, subject to vendor mapping: annual revenue, EBIT, profit, operating cash flow, capex, net debt, interest coverage, ROCE, ROE, diluted share count; quarterly revenue/profit; promoter holding and pledge; current P/E and peer definition. Retrieve up to five annual observations if available, with actual reporting dates. Define FCF and cash conversion explicitly; absent denominator, negative earnings and negative denominators need explicit treatment. Banks/NBFCs need a different template (capital adequacy, GNPA/NNPA, provisioning, funding) and ETFs must not be assessed as companies. Evidence about auditors, related-party transactions, customer concentration and management must cite the source passage, document/date and confidence; missing is unknown, not clean.

Current fundamentals describe today, not the historical signal date. Historical backtests need point-in-time publication dates, historical universe membership and delistings. Do not retroactively use today's data as if known at trigger.

## TradingView workflow

Create a user-managed watchlist of candidates using supported import or manual entry when available; verify NSE/BSE symbol mapping and plan limits. Use its Stock Screener on that watchlist with saved templates to inspect traded value, trend and relative strength; vary filter thresholds as exploratory views, not approved strategy filters. Inspect weekly/daily charts, corporate-action basis, levels, volume and nearby earnings. Add price alerts to individually reviewed levels; use a watchlist alert only when the same condition across symbols is meaningful. Plan-dependent capabilities must be checked. TradingView and Kite are not independent confirmation when indicators use the same prices. Divergences trigger investigation, not automatic winner selection. No automated TradingView data scraping. Optionally compare selected chart values manually and record symbol, exchange, timeframe, session and adjustment settings.

## Strategy critical review and validation plan

Scope: the supplied dossier summarizes strategies; source definitions and bundle were not available in this checkout. Findings below are hypotheses or documented issues, not verified code defects.

- S1a: zero triggers. Check warmup, universe coverage and filter waterfall; distinguish genuinely rare conditions from contradictory rules. Do not loosen thresholds just to get results.
- S2a: documented possible failure to check an unfilled gap. Confirm exact intended gap definition, fill boundary, expiry and treatment of corporate actions; write synthetic examples.
- S3a: documented higher-high/higher-low issue. Verify pivot sequence, confirmation latency and whether future bars leak into a historical trigger.
- S4a: review its own liquidity rule and whether signal-day volume is known at decision time. Audit gap classification and actual entry timing.
- S4a1: documented average-volume timing issue. Verify whether signal bar belongs in baseline and the definition intended by the owner.
- S4b/S4b1: compare exact rule differences and overlap; assess incremental out-of-sample results rather than counting variants as independent confirmations.
- S5a: only nine triggers in sample. Check coverage and stability; avoid conclusions from this count alone.
- All: inspect entry timestamps, signal visibility, exchange calendar, stop-cap interaction, gaps, adjustment and volume basis; quantify duplicates and strategy families. Test on synthetic bars including pivots, boundary values, missing data, actions and same-bar stop/target ambiguity. Equivalence between waterfall and implementation alone does not establish correctness.

Evaluate existing strategies unchanged as baseline. Run proposed fixes as separate versioned experimental variants only after owner approval. Pre-register hypotheses and retain every tested variant. Backtest with point-in-time constituents and financials, as-known signals and executable subsequent fills; define capital, transaction costs, slippage, price bands and gap-through stops, time exits, corporate actions, concurrent signals and portfolio constraints. Daily bars that hit both levels require conservative and optimistic bounds or higher-frequency evidence. Hold out a final period, use chronological walk-forward and compare with market/sector benchmarks and simple baseline signals. Report signal counts, coverage, net expectancy and median return, drawdown, turnover, uncertainty, regime and liquidity breakdowns and sensitivity to cost and data-quality exclusions. Test whether fundamental review adds value after the technical signal. Include delisted companies and account for the selection history of the current universe. Paper trade before relying on results. Do not optimize weights on the holdout.

## Delivery sequence and acceptance

1. Obtain the actual strategy spec, scanner JSON examples, database schema and license/access details. Freeze baseline and inventory current outputs. Validate mapping on 10 stocks.
2. Build normalized adapter and lifecycle shadow run; reconcile every signal against scanner, exercise missing data, gap-through and ambiguous same-bar cases, and show no cross-run mixing.
3. Connect MCP using the supported client, resolve actual parameter tokens and test 10–20 stocks against source filings/Screener; measure calls, historical coverage, bases and errors. Verify Max quota and caching.
4. Create cards and optional TradingView watchlist handoff; manually review a small pilot including banks and thin stocks. Compare source values and verify evidence links.
5. Add scheduled execution with run status, safe retries, quotas, checkpointing and atomic output; never overwrite prior runs. Track freshness and partial failures.
6. Backtest baseline and experiments as above; only propose strategy changes with evidence and explicit approval.

## Operational notes

Credentials belong in the host credential store/environment, not source, output or logs. MCP authentication and unattended execution must be verified for the actual environment; an open browser is not a dependable scheduler. Read price database only; do not edit source files. TradingView automated extraction is prohibited by its policy. Respect each vendor's terms, storage and rate limits. Alerts and order placement are outside this scope.

## Review of subsequently supplied package generator

The supplied `build_strategy_spec_doc.py` generates a document and ZIP; it does not contain the eight strategy implementations. Its referenced template, `strategies.mjs`, scanner, and generated bundle were not found in this checkout. Consequently the strategy review above remains provisional; do not infer executable rules from the generator. Older pasted summaries exist but may predate the current strategies and cannot establish current behavior.

Generator review (based on the pasted text, assuming HTML entities and escaped punctuation are copy/paste artifacts):

- Missing package files are silently omitted (`if p.exists()`), while the printed count reports requested paths, not actual archived files. Fail on missing mandatory files and publish an actual inventory of included paths and SHA-256 digests; record optional omissions explicitly.
- CODE placeholders use fixed line numbers and silently accept out-of-range slices. Source edits may produce incomplete or unrelated snippets. Validate bounds and unresolved placeholders; preferably package complete source files and identify strategy blocks by stable markers or parse structure. Record source revision and per-file hashes.
- The 'latest' 90-session selection compares only the four-digit time, not full date and run identity. It can mix days or strategies and the inner regex may fail for an unexpected filename. Choose an explicit run ID, require all expected outputs, and validate provenance against the waterfall and scan.
- Output timestamp is a user-supplied label, not proof of a consistent input snapshot. Bind output to the actual scan manifest, price snapshot and rule configuration; reject mismatches.
- Validate JSON schema, strategy keys, date input, template placeholder resolution and ZIP members; write files atomically. Verify the printed file count against the actual ZIP. Document that a ZIP hash proves integrity of that ZIP, not correctness or completeness.

To complete the requested strategy-level review, provide the generated `docs/EIGHT_STRATEGY_SCAN_SPEC_AND_CODE.md` or `EightStrategy_Scan_Code_and_Specs_<date>.zip` (including `strategies.mjs`, scanner and tests). Compare it against the actual scan run before proposing any changes.

## Strategy review update

The requested bundle was subsequently found in the main WealthOS checkout and inspected. See [STRATEGY_CODE_REVIEW.md](STRATEGY_CODE_REVIEW.md) for actual code findings. The earlier statement that the bundle was unavailable described the initial checkout only; it is superseded by that review. Strategy thresholds remain unchanged.
