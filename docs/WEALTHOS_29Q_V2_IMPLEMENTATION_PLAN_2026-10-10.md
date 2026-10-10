# WealthOS 29-Question Research Program V2 — Implementation Plan

## Objective

Build the 29-question research pipeline as a separate, provider-neutral, evidence-bounded subsystem. It must preserve raw facts, classify periods and units correctly, expose data gaps, validate every numerical claim, and produce one standalone report per scrip without rankings, pass/fail investment labels, or invented values.

The implementation follows `WEALTHOS_29Q_V2_BUILD_SPEC_2026-10-10.md` and is delivered as ten reviewable PRs. Each slice is tested and reviewed before the next begins.

## Coordination and boundaries

- Base branch: `origin/ai-review`; documentation branch: `docs/29q-v2-spec`.
- Work in an isolated worktree. Do not edit the Downloads checkout used by the other remediation stream.
- Target each slice PR at `ai-review`; never commit directly to `ai-review` or `master`.
- New implementation is confined to `src/server/research_v2/**`, `src/server/routes/researchV2.ts`, `src/server/db/migrations/research_v2_schema.sql`, and `tests/research_v2/**`.
- Do not modify existing routes, components, migrations 001–014, `server.ts`, `database.ts`, or `fifoEngine.ts`.
- Never write to `portfolio.db`, its backups, or live user data. Real-data inspection is read-only; writes use fixtures or an explicitly supplied database copy.
- No package installation without owner approval. DuckDB/OHLCV remains optional.

## Slice sequence

### S1 — Periods, units, and canonical vocabulary

Add domain contracts, XBRL context handling, unit conversion, and metric definitions. Treat `OneD` as discrete quarter data and `FourD` as YTD data; derive missing quarters only from compatible YTD values. Preserve scope, period type, vintage, source, and derivation metadata.

Files: `domain/types.ts`, `facts/xbrlPeriods.ts`, `facts/units.ts`, `facts/metricDefinitions.ts`, and unit/golden tests.

Exit gate: YUKEN and VMART period golden tests pass; unknown units, cumulative-as-quarter, scope mixing, and magnitude anomalies fail deterministically; no database writes.

### S2 — Schema, vintages, quarantine, and read policy

Add the research schema and an idempotent migration module. Implement canonical fact storage, immutable vintages, as-of selection, conflict retention, and tier/freshness/quarantine rules. Quarantine legacy simulator rows without deleting them.

Tables include canonical period facts, metric definitions, conflicts, and the shared research tables needed by later slices.

Exit gate: migration applies repeatedly to an in-memory database; read-policy tests reject simulated, quarantined, latest-only, stale, future, NaN, and scope-inconsistent facts. Add the approved schema sign-off line to `IMPLEMENTATION_PLAN.md`.

### S3 — Six-scrip backfill and reconciliation report

Add a dry-run backfill tool for YUKEN, BECTORFOOD, VMART, TATATECH, OPTIEMUS, and ARROWGREEN. It reads raw verified XBRL data, produces an in-memory before/after diff, reports unit conversions and reconciliation failures, and writes only when an explicit copy is supplied with `--write`.

Exit gate: committed report artifact, no production DB writes, and every discrepancy classified as corrected, derived, quarantined, or unresolved.

### S4 — Seven-filter informational scorecard

Implement configurable thresholds and seven scorecard rows: promoter holding, eight-quarter profitability, ROCE, ROE, promoter pledge, institutional participation, and CFO/EBITDA.

Each row exposes observed value, threshold, comparator, gap, status, period, scope, basis, formula, sources, and an unverifiable reason. Missing data is never converted to zero or failure. Filters never remove or rank a scrip.

Exit gate: golden scorecard fixtures reproduce the six-scrip expected values or document source discrepancies; no overall pass/fail output exists.

### S5 — Calculator library and readiness

Add pure calculators for growth, margins, cash flow, working capital, ROIC/ROCE/ROE, leverage, interest coverage, rate sensitivity, valuation, technical indicators, liquidity, and related-party materiality. Add readiness checks for scope, period coverage, units, tier, freshness, conflicts, parsed documents, and premise checks.

Every calculator returns `READY`, `PARTIAL`, `INSUFFICIENT_DATA`, or `NOT_APPLICABLE` where appropriate. Missing inputs never receive defaults.

Exit gate: YUKEN and TATATECH golden calculations pass; missing-OHLCV, missing-debt, missing-tax-rate, missing-quarter, and bank/NBFC paths are tested.

### S6 — Trendlyne acquisition, catalogue, and quota control

Add a real provider client, full catalogue enumeration, token mappings, gap-first planner, weighted call budget, append-only call log, rate limiter, retry/backoff, resume queue, and quota-exhaustion state.

The simulator must throw outside explicit tests. Prior successful calls cannot be overwritten by later errors. Provider-reported result periods are used instead of fetch timestamps.

Exit gate: recorded-response tests cover catalogue exhaustion, mapping, quota caps, retries, resume state, success preservation, and simulator rejection. No provider package is installed in this slice.

### S7 — Research items and source traceability

Add storage and protocol for primary and secondary research items. Secondary sources remain leads until traced to primary evidence. Add URL hashing, deduplication, source limits, management-claim labels, and a pluggable fetcher interface.

Exit gate: tier, traceability, duplicate, URL-cache, cap, and rejected-lead tests pass. This slice does not build a crawler.

### S8 — Provider-neutral agent layer

Add the provider interface, Claude/OpenAI adapters, Gemini/Bedrock/local stubs, deterministic mock, drafter/reviewer prompts and schemas, claim validator, completeness gate, leakage check, and draft-review-revise orchestrator.

The validator resolves every claim reference, checks values, units, periods, scopes, source tiers, and narrative numbers. The completeness gate requires terminal states for every sub-question. The reviewer is a separate call and cannot introduce facts. Persist every iteration and finding.

Exit gate: mutated-number, missing-reference, unclaimed-number, incomplete-answer, leakage, secondary-source, and provider-parity tests pass. Spend caps and usage are recorded before calls.

### S9 — Reports, route, routine, and UI

Add the routine pack, report renderer, research routes, and new research components only under `src/components/research/`. The report contains a top summary, seven-filter scorecard, all 29 questions in contract order, sub-question states, claims, evidence appendix, conflicts, gaps, sources, and run metadata.

The routine refuses to run when prompt hashes or routine version do not match. No report may show an unsupported number, overall pass/fail, ranking, buy/sell label, or personalised recommendation.

Exit gate: one fixture scrip renders end to end through the new route and displays scorecard rows, answer states, claim references, and evidence gaps.

### S10 — Controlled six-scrip run

Run the complete pipeline against a database copy for the six named scrips. Produce six standalone reports and a run manifest with bundle hashes, routine version, provider/model, spend, validator/gate/leakage results, reviewer findings, and final status.

Resolve reviewer findings and record lessons in routine v2.1. Keep `Optimus Finance` as an unresolved entity that fails clearly when requested.

Exit gate: six reports exist, every blocking finding is resolved or escalated, and no production database was modified.

## Verification protocol

Before each PR:

```text
npm run lint
npm test
```

Also run the slice-specific golden, negative, and fixture tests. Record runtime paths through environment/configuration rather than hard-coding machine paths. Attach output and a scope audit to each PR.

## Open owner decisions

These do not block S1–S5:

- Promoter threshold: 66.6 or 66.67
- Institutional participation threshold, currently informational
- Optimus Finance identity
- Approval to install DuckDB/parquet support
- Daily spend cap
- Credentials for the second provider parity test

## Immediate next action

Create `feat/29q-v2-s1-periods` from the latest `origin/ai-review`, implement only S1, run the golden and negative tests, and open the first PR. Do not begin S2 until the S1 review findings are resolved.
