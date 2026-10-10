# WealthOS Institutional 29 research package

This package converts the agreed 29-question institutional due-diligence framework into a reusable, evidence-first workflow for any NSE/BSE symbol.

## What it produces

For every requested symbol:

- `research_bundle.json` — canonical facts, source readiness, all 29 question contracts and exact gaps;
- `acquisition_plan.json` — local-first, Trendlyne, statutory, market and secondary-source work still required;
- `gap_resolution_plan.json` — an executable source map for every missing item, including local tables, primary source, Trendlyne tool/query, canonical destination, priority and existing WealthOS executor;
- `report_working.md` — 29-section report shell with available evidence and 150–250-word answer slots;
- `synthesis_instructions.md` — reusable LLM contract enforcing primary-source authority, scope/period labelling, conflict retention and inference guardrails;
- `index.json` — multi-symbol batch summary.

The command does not spend provider calls. By default it archives the generated evidence bundle in `ResearchAnalysisArchive`; use `--no-persist` only for disposable/test runs.

## Usage

```powershell
cd C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release
npm run fundamental:institutional29 -- AZAD RRKABEL
```

Optional point-in-time and liquidity inputs:

```powershell
npm run fundamental:institutional29 -- AZAD --as-of 2026-10-08 --position-value 1000000 --participation-rate 0.10
```

Default output:

```text
outputs/institutional29/<SYMBOL>/
```

## Validate and render a completed report

Every completed comparative report can be checked for all 29 questions, both companies, an evidence state and the agreed 150–250 words per question:

```powershell
npm run fundamental:institutional29:validate -- outputs/institutional29/<REPORT>.md
```

Create a professionally formatted Word version with the bundled Python runtime and `python-docx`:

```powershell
python scripts/fundamental/institutional29/render_report_docx.py outputs/institutional29/<REPORT>.md
```

Split a two-company comparative report into one standalone 29-question report per symbol:

```powershell
node scripts/fundamental/institutional29/split_comparative_report.mjs outputs/institutional29/<COMPARATIVE_REPORT>.md
```

## Operating lifecycle

1. Build the bundle and inspect `acquisition_plan.json`.
   Use `gap_resolution_plan.json` for the precise, deduplicated actions needed to close each partial or insufficient question.
2. Consume already stored `company_facts`, statements, shareholding, FERE evidence, documents, events, deals and adjusted DuckDB OHLCV.
3. Run existing FERE/XBRL/NSE/BSE jobs for statutory gaps.
4. Run the existing Trendlyne acquisition with full 10-symbol/50-parameter batches and the missing non-parameter views.
5. Promote only evidence with valid identity, period, unit, scope and provenance.
6. Rebuild the bundle. Questions move from `DATA_INSUFFICIENT`/`PARTIAL` to `READY_FOR_ANALYSIS`.
7. Generate business-language answers from the frozen bundle. LLM synthesis may explain evidence but cannot create facts.
8. Persist every deterministic or LLM narrative as a new immutable archive version. The Analyze Scrip frontend exposes the saved history.

## Frontend and scheduled updates

- In **Analyze Scrip**, choose a symbol and select **Update Research** for an individual refresh.
- On the Analyze Scrip landing screen, enter up to 50 symbols in **Batch Institutional Research Update**.
- Select **Run All On-Hand Research** to build the cohort from verified INR NSE/BSE equity holdings, rank it by stored market value, and carry the actual position value into the liquidity/exit analysis. US, mutual-fund, AIF and unlisted rows are explicitly excluded rather than forced through an Indian listed-equity framework.
- The backend creates a `ResearchAnalysisJobs` record, rebuilds evidence for every symbol, invokes the configured server-side Gemini model only when available, and archives both the evidence bundle and narrative.
- LLM credentials remain server-side. If no key is configured, `LLM_IF_AVAILABLE` saves the evidence bundle and reports `NOT_CONFIGURED`; it never substitutes fabricated prose.
- Use `LLM_REQUIRED` through the API when a batch must fail rather than complete without a narrative.

Plan or run the same on-hand workflow from the terminal:

```powershell
npm run fundamental:institutional29:onhand -- --plan --as-of 2026-10-08
npm run fundamental:institutional29:onhand -- --as-of 2026-10-08
npm run fundamental:institutional29:onhand:synthesize -- --as-of 2026-10-08
```

Add `--require-llm` when the evidence run must stop unless a server-side Gemini or AWS Bedrock provider is configured. The cohort manifest is saved under `reports/fundamental/` and records the exact order, valuation date, exclusions and final job outcome. The synthesis-only command resumes from saved evidence bundles and records progress after every symbol, avoiding repeated acquisition after an interruption.

## Guardrails

- Existing evidence is never deleted by this package.
- Adjusted DuckDB OHLCV is mandatory for historical technical analysis.
- Kite/Upstox are current-quote and missing-candle sources, not fundamental authorities.
- Screener is a labelled cross-check, not a statutory source.
- Trendlyne raw success does not mean canonical completeness.
- Missing facts remain missing; zero and current-date substitutions are prohibited.
- Backtests must exclude evidence whose `availableAt` is after the evaluation timestamp.
- External reviews and prior narratives are acquisition leads, not evidence; proposed corrections must pass the same primary-source policy.
- Customer/supplier concentration, pass-through, backlog conversion, customer funding and reverse-DCF assumptions may not be inferred from ratios or generic industry practice.
