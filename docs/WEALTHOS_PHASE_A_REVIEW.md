# WealthOS Phase A — Reviewer Brief

## Purpose

Review the current Phase A implementation: a truthful, evidence-backed
Discover → Analyze → FERE experience. This is not a request to begin
StockScans parity or the candidate lifecycle.

## Implemented in this change set

- The canonical company-analysis API is `GET /api/scrip-intelligence/:symbol`
  and `GET /api/company-intelligence/:symbol`.
- A normal GET is side-effect free. Only explicit `POST .../:symbol/refresh`
  may request snapshot/thesis/contradiction persistence.
- The compatibility `actionSignal` contains null decision fields; it cannot
  claim a score, probability, target, stop, or recommendation.
- The canonical `StockIntelligenceView` includes an evidence-aware Company
  Intelligence Overview for drivers, changes, contradictions, management,
  valuation, thesis and research questions.
- Values without item-level provenance are not rendered as company facts.
- Intelligence modules now require source-backed evidence for catalysts,
  risks, contradiction records and narrative changes.
- Point-in-time retrieval and financial period comparison use actual
  availability dates and exact prior annual/quarterly periods.
- Provider provenance maps Upstox, Kite and Trendlyne snapshots to their true
  provider source types.
- Legacy synthetic fallbacks in scanner, dossier, Trendlyne and smart-money
  paths now fail explicitly rather than manufacturing decision data.
- The full-population fundamental synchronizer was made fail-closed for
  shareholding: no inferred public holding or free float; rows requiring the
  legacy non-null free-float field are written only when public holding is
  source-reported.

## Evidence of validation

Passed locally:

```text
npx tsc --noEmit
npx vitest run tests/unit/intelligence_truth_closure.test.ts --pool=forks --maxWorkers=1
  6 passed
npx vitest run tests/unit/p0-truth-closure.test.ts tests/unit/company_intelligence_overview.test.ts --pool=forks --maxWorkers=1
  5 passed
```

The five-company validation script was run for RELIANCE, TCS, HDFCBANK,
TATAMOTORS and TATASTEEL. It generated no hard-coded company catalysts or
structural risks. The generated report is deliberately excluded from Git
because it is a local runtime artifact.

Fundamental synchronization completed for 3,564 symbols after the
shareholding correction. Completion means collected facts were synchronized;
it does not mean every field is available for every symbol.

## Reviewer questions

1. Confirm that a GET cannot advance persistent intelligence state, including
   when supplied `?refresh=true`.
2. Confirm that every displayed company-level conclusion has item-level
   evidence, provider, timestamp and source identifier.
3. Confirm that missing data becomes `DATA_INSUFFICIENT`,
   `SOURCE_UNAVAILABLE`, `NOT_REQUESTED`, or `IDENTITY_REVIEW`, not a numeric
   default or positive/negative conclusion.
4. Confirm PIT correctness: a fact fetched after `asOfDate` cannot appear in
   an older analysis, and comparisons use the actual preceding fiscal year or
   same quarter.
5. Confirm the Company Intelligence Overview is the canonical Analyze UI and
   no second authoritative Analyze implementation exists.
6. Confirm provider source types match source IDs (for example an
   `UPSTOX_*` source must not be `TRENDLYNE_SNAPSHOT`).

## Known open work — not hidden defects

- Validate the DuckDB OHLCV bridge in the normal application runtime using
  `PYTHON_BIN=C:\\Users\\gopal\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`.
  The DuckDB catalog exists and that Python has DuckDB installed, but the
  restricted Codex test shell cannot launch the local Python process.
- Run disposable-DB API/browser smoke testing: candidate list → `#analyze`
  → FERE evidence → missing-data symbol, while proving production DB hashes
  are unchanged.
- Generate a field-level coverage audit across the 3,564 synchronized symbols.
- Phase B StockScans parity and Phase C candidate lifecycle are explicitly
  deferred and require separate approval.

## Guardrails

- No production defaults or fabricated evidence.
- No runtime schema DDL or migrations in this change set.
- No strategy scan, FERE refresh, or candidate persistence is part of normal
  analysis-page reads.
- Review generated local reports separately; do not treat them as source data.
