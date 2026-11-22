# Parallel opportunity scan — detailed implementation specification

Status: build proposal, not a completed integration. Baseline: 22 November 2026 bundle; read-only cross-check against the main checkout database. Review the strategy-code report and constitution before implementation. Existing dossier and source DB remain unchanged.

## Outcome

For every scanner-selected stock over the existing 22 market sessions, present its original strategy signals plus signal timing, data reliability, liquidity, company evidence, valuation context and a traceable review state. The default view includes every selected stock and every underlying strategy signal, including those omitted by the legacy tier gate. Output is research support, not a trade recommendation.

## Contracts

### 1. Inputs and run identity

A run manifest MUST include `run_id`, schema version, scanner run ID, universe version, scan start/end sessions, source file hashes, price table and snapshot identity, strategy version/hash, build revision, configuration hash, generated UTC time and per-source as-of timestamps. The adapter MUST use explicit input paths and reject mixed runs or schema incompatibility. The scanner currently lacks a complete manifest: generating/verifying one is a prerequisite, not a fact implied by filenames. If reproducible SQLite snapshot cannot be created safely with WAL, mark reproducibility unverified; never copy just the DB while writes are active. Read-only connections and isolated output paths only.

Normalize each signal to: stable event ID, original symbol and exchange, verified ISIN when available, strategy and family, signal date, evaluation date if known, known-at timestamp or UNKNOWN, original entry/stop/target, final scanner levels, explicit entry convention, original row and source hash. Do not infer an evaluation date from a signal date. Scanner output does not always preserve raw stops or evaluation dates; mark unavailable and propose instrumentation, never reconstruct as fact. The current newest-first cooldown can retain multiple non-adjacent hits for one stock/strategy; preserve all retained rows and audit discarded occurrences if supplied.

### 2. Identity and coverage

Use verified ISIN + exchange when available; preserve symbol and source ID. Verify BSE codes, aliases, series and renames; unresolved mappings are errors rather than fuzzy joins. Record universe count, evaluated and skipped names by strategy/session, missing bars and reasons. Show named no-trade/suspension explanations only when backed by evidence. Capture coverage distinctions: 1,521 universe names, those with sufficient history, those actually evaluated, and those with signals. Common 60-bar engine gate and per-strategy requirements must be exposed separately. Avoid claiming lifetime ATH or 52-week coverage where historical data is incomplete.

### 3. Price/lifecycle

Use the same price snapshot and basis as scanner; track each row's source/status, adjustment reliability and corporate action. When unavailable, show quality unknown. Validate OHLC, units, duplicate dates and exchange sessions. Compute signal age as count of actual market sessions after signal; do not use calendar days or a fabricated fresh cutoff. For each level and each complete post-signal session record range touch and gaps; distinguish pre-entry events, unobservable ordering and unknown due to missing bar or unreliable basis. Treat same-bar stop/target or entry/stop as ambiguous. Do not classify a signal as live, expired or a trade fill until owner approves entry and expiry semantics for its strategy. Signal-day touch can be shown separately; a close-confirmed signal cannot automatically be executed earlier in the same session.

Liquidity facts: per-session close × volume is an approximation, not exchange turnover. Report median and mean of the last 20 observed sessions, number of valid sessions, no-trade/missing sessions and recent volume; label calculation period and proxy. Prefer exchange actual turnover if available. Spread, circuit limits, surveillance and next results date require current source evidence; absent is unknown. No hard thresholds without owner approval.

### 4. Fundamental evidence

Use cached Screener values and Trendlyne MCP, preserving consolidated/standalone basis and period. Initial display (subject to verified availability): 3–5 years revenue, profit, ROCE/ROE, operating cash flow, capex, debt, interest coverage and diluted shares; recent quarter; promoter holding/pledge and change. Banks/NBFC template: capital, asset quality, provisioning and funding; ETFs separate. Computed ratios define numerator, denominator, units, period and negative/zero behavior. No undocumented CFO/PAT substitution. A quality narrative describes evidence, questions and unknowns, not a certified grade. FII/DII changes, screen data and statements may refer to different periods—never silently align them.

Valuation: current price and dated P/E, P/B or EV/EBITDA as relevant, historical range where available, peer definition and normalized earnings assumptions. Scenario values are explicit user-reviewed assumptions, not automated price targets. Track exceptional items and denominator validity.

Governance/business: retrieve source-backed relevant passages from annual reports, results, auditor reports and earnings calls. Each claim links document, issuer, date, page/section or exact source location, quotation or bounded excerpt, and review status. 'No issue found' is forbidden without a documented search scope and timestamp; even then it is not assurance. Summaries must be checked against sources.

### 5. Trendlyne MCP integration

Use official authenticated MCP transport/client; do not invent its URL/auth. Resolve identifiers with `search_entities` and parameter tokens with `search_financial_parameters`; verify exact field definitions, annual history and consolidated basis in a pilot. `get_stock_parameter_values` documents at most 10 stock codes and 50 parameter tokens per call. Partition both axes, deduplicate requests, persist per-request status; validate missing or duplicate results, units, dates and ambiguous Markdown responses. Max plan published as 1,000 calls/day and 10,000/month; confirm current account limits and terms. A full 688-stock, single-parameter-set refresh would need at least 69 value calls if all identities are already resolved, excluding other requests, retries and document retrieval. Cache with source-specific expiry; choose actual TTLs and batch budgets after pilot. Fail closed on credentials, retry transient errors with bounded backoff, and surface stale/partial data. Do not log tokens. Documents fetched on demand or publication changes, subject to permissions.

### 6. UI and review workflow

Default table: symbol, exchange, signal date/age, strategies, original entry/stop/target, evidence status, latest comparable price/date, liquidity proxy, factual financial fields, missing/quality flags and review state. All signals remain in an expandable detail view. Separately show strategy-dated observations and current fundamentals; do not imply the latter were known at signal. User filters are visible and resettable; counts include total, visible and omitted. Export preserves evidence references, missing-state codes, source timestamps and run ID. User decisions are append-only notes: thesis, horizon, intended price/risk, invalidation and reviewer/date. Do not generate orders.

TradingView: use supported watchlist import/manual setup when available and verify symbol/exchange. Review weekly and daily trend, gap, nearby support/resistance, volume, events and adjustment/session settings. Saved screener templates and price/watchlist alerts support manual triage; availability and plan limits must be checked. Manual TradingView observations are dated and distinguished from automated data. Avoid assuming correlated indicators or four related gap strategies are independent confirmations. No scraping.

## Strategy-specific research backlog

Baseline is exactly packaged implementation. Prioritize S4a close-dependent same-day entry; S5a pivot-trigger vs buffered entry and close-dependent data; S2a older signal with later ATR/volume; S3a insufficient compared higher lows; S4a historical market cap; S4a1 gap-day versus later volume baseline; S1a setup-date ATH basis and close-known RSI; S4b/S4b1 volume baseline; S5a pattern semantics. See STRATEGY_CODE_REVIEW.md for evidence and DB checks. Preserve original output; put any corrected proposal in a separate experiment pending owner approval. Do not optimize to produce a desired number of names.

## Validation

Automated: schema and identity mapping, duplicate signals and counts, 60-bar eligibility, full input/run provenance, calendar ages, split and mismatched price basis, stale/missing fundamentals, bank applicability, bounded MCP batches and quotas, valid and invalid values, entry/stop/target gaps and same-bar ambiguity, S2a timing replay, source-link verification and atomic writes. Synthetic strategy cases must express expected economic behavior independently of the implementation; equivalence-only tests are insufficient.

Manual pilot: 10–20 stocks across several strategies, banks, thin names and missing data; compare exact values/periods against source and inspect charts. Success means every original signal and source discrepancy is accounted for, not a target number of picks. Compare archived 22 Nov outputs to DB only after snapshot provenance verified.

Research validation: pre-register strategy/entry rules, use point-in-time universe and fundamentals including delistings, prevent look-ahead and account for corporate actions. Model next-executable fills, gaps, transaction costs, slippage, restrictions, time exits and overlapping portfolio positions. Where OHLC is ambiguous, report bounds or use reliable higher-frequency data. Evaluate net expectancy, trade counts, drawdown, turnover, risk exposure, regimes and uncertainty against simple benchmarks and untouched chronological holdout. Test incremental value of fundamentals. Log all variants and forward paper trade. No threshold/weight changes without owner's approval.

## Delivery plan and gates

P0: Confirm bundle/run provenance and use a safe DB snapshot. Agree signals/entry-time definitions and list approved data sources. Deliver coverage report and 10–20 representative cases.
P1: Build read-only adapter, event identity, lifecycle facts and deterministic run manifest. Acceptance: every input signal reconciles; ambiguous/missing states tested; outputs isolated.
P2: Pilot MCP metrics, identity/basis/units and cache. Acceptance: reconcile pilot values to source, measure actual calls and show partial-failure behavior.
P3: Build cards and UI; include TradingView handoff and review notes. Acceptance: user can trace every fact, view all signals and export without loss of context.
P4: Baseline backtest and forward shadow run. Acceptance: documented assumptions, holdout, source coverage and costs; no unvalidated verdicts. Owner decides any strategy changes.

Each phase can proceed independently where inputs permit; do not wait for a score or AI analysis to establish reliable signal lineage.
