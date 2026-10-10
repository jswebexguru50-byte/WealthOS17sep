# WealthOS 29-Question Research Program V2 — Build Specification for the Developer Bot (2026-10-10)

**Audience:** developer bot (builder). **Reviewer:** the reviewing assistant (Claude session), who will check each pull request against §16.
**Context documents (read first):** `WEALTHOS_29Q_AUDIT_AND_SPEC_V2_2026-10-10.md` (why; defect list F1–F5, H1–H12), `WEALTHOS_29Q_SIX_SCRIP_PROGRAM_SPEC_2026-10-10.md` §4 (the 29 questions and their sub-questions — authoritative list), `AGENT_CONSTITUTION.md`, `IMPLEMENTATION_PLAN.md`, master review §9–10 (guard rails).
**This document supersedes** the build-relevant parts of the audit/spec V2 where they differ (decisions in §1).

---

## 0. Coordination (read before touching anything)

1. **Another agent is working in the same repository** (branch `fix/remediation-p0-p1`, roadmap P0–P4 including migrations 003–014 and routes). **Do not share a working tree with it.** Use your own clone or git worktree, and your own branch: `feat/29q-v2-foundation`, created from the latest `origin/ai-review`. One PR per slice (§15).
2. **Do not modify** files owned by the other work stream unless a slice says so: `server.ts`, `src/App.tsx`, `src/server/routes/*` (except the new `researchV2.ts`), `src/server/db/migrations/001–014`, `src/server/database.ts`, `src/server/fifoEngine.ts`, `src/components/*` (except new files under `src/components/research/`).
3. **Migrations:** put your SQL in `src/server/db/migrations/research_v2_schema.sql` and a migration module that loads it. **The migration version number is assigned at merge** to (highest existing + 1); write the module so the number is one constant. Test it on an in-memory database. Never run it against `portfolio.db`.
4. **New code location:** `src/server/research_v2/**` (TypeScript, ESM, `.js` import suffix) and tests in `tests/research_v2/**`. Pure functions first; no I/O inside calculators.
5. Existing outputs and reports are **not** touched or re-labelled now; they will be refreshed later by running the new pipeline (owner decision).

## 1. Decisions locked (owner, 2026-10-10)
1. **Filters never eliminate a scrip.** The seven fundamental filters become an **informational scorecard**: for each, show the observed value, the threshold, the gap, the evidence basis and a status. No scrip is excluded, ranked out, or labelled pass/fail overall.
2. Existing reports are refreshed later (no action now).
3. **New tables and changes are approved** (add the sign-off log line in `IMPLEMENTATION_PLAN.md`: "WEALTHOS_29Q_V2 schema: User Approved, 2026-10-10 (chat)").
4. **No fixed word cap.** Length follows completeness; every sub-question must reach a terminal state.
5. **LLM-agnostic:** drafter and reviewer agents run through a provider interface; the routine must run unchanged under Claude and ChatGPT (first two adapters), with stubs for Gemini, Bedrock, local.
6. **Scrips in scope:** YUKEN (`YUKEN`), BECTORFOOD (Bectors Food Specialities), VMART, TATATECH, OPTIEMUS (Optiemus Infracom, INE350C01017), ARROWGREEN. "Optimus Finance" was **not found** in any database; keep a config entry `unresolvedEntities: [{name:"Optimus Finance"}]` and fail with a clear message if requested.
7. **Thresholds default to the existing configured values** and are configurable (§6.1): promoter 66.6, ROCE 35, ROE 25, pledge 0, CFO/EBITDA 0.5, profitable quarters 8. Institutional participation: report **level and QoQ change** (no threshold unless the owner sets one).
8. Third-party/secondary sources are **leads**, never statutory evidence (constitution).
9. **DuckDB/OHLCV:** the bundled Python lacks `duckdb`. Make OHLCV access an optional adapter; when unavailable, technical/liquidity calculators return `INSUFFICIENT_DATA` (never a guess). The owner has **not** yet approved installing packages — list the dependency in the PR, do not install silently.

## 2. Environment
- Runtime in this machine's cache (no system Node/Python): `C:\Users\GopalSharma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` and `…\python\python.exe`. Do not hard-code these paths in application code; read `NODE`/`PYTHON` from environment/config with a clear error when missing.
- Read-only access to real data for **tests of derivation** is allowed only via `sqlite3 … mode=ro` and `PRAGMA query_only=ON`, against `data/fere/verified_filings/fere_evidence.db` and small LIMITed reads from `portfolio.db`. Prefer fixtures (§14).
- SQLite value storage: **REAL** for numbers; never TEXT.

## 3. Module map (new files)
```
src/server/research_v2/
  domain/types.ts                 // all contracts in §4
  facts/xbrlPeriods.ts            // §5.1 context handling, de-cumulation, checks
  facts/units.ts                  // §5.2
  facts/metricDefinitions.ts      // §5.3 canonical vocabulary + provider mappings
  facts/factStore.ts              // read/write canonical_period_facts, vintages, tiers (§5.4–5.6)
  facts/readPolicy.ts             // tier/verification/freshness filters for every read
  filters/thresholds.ts           // §6.1 config
  filters/scorecard.ts            // §6.2–6.4 seven-row scorecard
  calc/*.ts                       // §7 one file per calculator family + index
  readiness/readiness.ts          // §8
  acquisition/trendlyneClient.ts  // §9 real client (no simulator), quota-aware
  acquisition/trendlyneCatalogue.ts
  acquisition/callBudget.ts
  acquisition/gapPlanner.ts
  research/researchItems.ts       // §10
  agents/provider.ts              // §11.1 interface
  agents/adapters/{claude,openai,gemini,bedrock,local,mock}.ts
  agents/prompts/{drafter,reviewer}.md  + schemas/*.json
  agents/claimValidator.ts        // §11.3
  agents/completenessGate.ts      // §11.4
  agents/leakageCheck.ts
  agents/orchestrator.ts          // draft → validate → review → revise loop
  report/render.ts                // §12
  routine/ROUTINE_V2.json         // §13 versioned routine definition
src/server/routes/researchV2.ts   // run, status, answers, scorecard endpoints
src/server/db/migrations/research_v2_schema.sql
tests/research_v2/**              // §14
```

## 4. Contracts (`domain/types.ts`)
```ts
export type Scope = 'CONSOLIDATED' | 'STANDALONE';
export type PeriodType = 'DISCRETE_Q' | 'YTD_6M' | 'YTD_9M' | 'ANNUAL' | 'TTM' | 'POINT_IN_TIME';
export type SourceTier = 'STATUTORY' | 'PROVIDER_VERIFIED' | 'PROVIDER_LATEST' | 'SECONDARY_LEAD' | 'SIMULATED';
export interface Fact {
  factId: string; isin: string; symbol: string; scope: Scope; metric: string;        // canonical metric (§5.3)
  periodType: PeriodType; periodStart: string; periodEnd: string;                      // ISO dates; real dates only
  valueCr: number | null;                                                              // REAL, crore for money; null = missing
  unit: 'INR_CR' | 'PCT' | 'RATIO' | 'SHARES' | 'INR' | 'DAYS' | 'X';
  sourceTier: SourceTier; source: string; sourceRef: string;                           // filing id / url / provider call id
  availableAt: string;                                                                 // ISO UTC; point-in-time
  vintage: number; supersedesId?: string; derivation?: { formula: string; inputs: string[] };
  qualityFlags: string[]; quarantined: boolean;
}
export type AnswerState = 'ANSWERED' | 'PARTIAL' | 'NOT_DISCLOSED' | 'NOT_APPLICABLE';
export interface Claim { claimId: string; text: string; value?: number; unit?: string; period?: string; scope?: Scope;
  refs: string[]; /* factId | calcId | researchItemId */ kind: 'FACT' | 'CALC' | 'RESEARCH' | 'INFERENCE'; }
export interface SubAnswer { subQuestionId: string; state: AnswerState; claims: Claim[]; narrative: string;
  gap?: string; nextAction?: string; sourcesSearched?: string[]; premiseCheck?: { holds: boolean; note: string }; }
export type ScorecardStatus = 'MEETS_THRESHOLD' | 'BELOW_THRESHOLD' | 'ABOVE_THRESHOLD' | 'UNVERIFIABLE';
export interface ScorecardRow { filterId: 1|2|3|4|5|6|7; label: string; observed: number | null; unit: string;
  threshold: number | null; comparator: '>' | '>=' | '<=' | '==' | 'info'; gap: number | null;     // observed − threshold
  status: ScorecardStatus; basis: 'OFFICIAL' | 'PROVIDER' | 'DERIVED' | 'UPPER_BOUND'; asOf: string | null;
  period: string | null; scope: Scope | null; sources: string[]; formula: string; note?: string; reasonIfUnverifiable?: string; }
export interface LlmProvider { id: string; complete(req: { system: string; messages: {role:'user'|'assistant'; content:string}[];
  jsonSchema?: object; temperature?: number; maxTokens?: number; seed?: number }): Promise<{ text: string; json?: unknown; usage: {inTok:number; outTok:number; costUsd?:number} }>; }
```

## 5. Data foundation

### 5.1 XBRL period handling (the root-cause fix) — `facts/xbrlPeriods.ts`
**Verified facts about the raw table** `verified_xbrl_fact(id, isin, symbol, filing_id, filing_sha256, source_url, available_at, period_start, period_end, scope, context_ref, metric, value, unit, taxonomy_field)` (read-only probe, 2026-10-10): `context_ref` is `OneD` (≈1.16M rows) or `FourD` (≈2.2M rows). For flow metrics (sales, PAT, PBT, CFO, finance cost, depreciation, other income, exceptional, capex…):
- `OneD` = the **discrete value for the reporting quarter ending `period_end`**.
- `FourD` = the **year-to-date value from the fiscal-year start (1 April) to `period_end`**, but for Q2/Q3 filings its `period_start` is wrongly the quarter start (e.g., YUKEN `2024-07-01`→`2024-09-30` FourD sales 2258.588M = 6-month total). **Therefore classify by `context_ref`, never by `period_start/period_end` duration.** For Q4 (`period_end` 31 March) `FourD` has the full-year dates and equals the annual value; for Q1, `OneD = FourD`.
- Example (YUKEN consolidated, sales, rupees): Q1 FY25 OneD 110.20 Cr; Q2 OneD 1,156,571,000 (115.6571 Cr) / FourD 2,258,588,000 (225.8588 Cr = 6M); Q3 OneD 1,068,465,000 (106.8465) / FourD 3,327,053,000 (332.7053 = 9M); Q4 OneD 1,246,510,000 (124.651) and FourD annual 4,573,563,000 (457.3563).

**Algorithm (per isin, scope, flow metric, fiscal year):**
1. Fiscal year (India): 1 Apr–31 Mar. Derive `fy` from `period_end`; quarter index from the month of `period_end` (Jun=Q1, Sep=Q2, Dec=Q3, Mar=Q4).
2. For each `period_end`, take latest-vintage rows by `available_at`. Map: `OneD` → candidate `DISCRETE_Q`; `FourD` → `YTD_{3M|6M|9M|12M}` with corrected `period_start` = 1 April of the fiscal year.
3. Emit `DISCRETE_Q` from `OneD`. If a quarter lacks `OneD` but has YTD for itself and the previous quarter, **derive** `DISCRETE_Q = YTD(this) − YTD(prev)` with `derivation` recorded and flag `DERIVED`. Q4 without `OneD`: `ANNUAL − YTD_9M`.
4. Emit `ANNUAL` from the March `FourD`; emit `YTD_*` rows too (as `YTD`, never as quarters).
5. **Reconciliation checks** (store results in `qualityFlags`): (a) Σ four discrete quarters of a fiscal year ≈ annual (tolerance max(0.05 Cr, 0.1%)); (b) YTD_6M = Q1+Q2 etc.; (c) discrete quarter ≤ YTD of same period; a failure sets flag `PERIOD_RECON_FAIL` and the fact is **excluded from calculators** until reviewed.
6. Balance-sheet and other point-in-time metrics (equity, borrowings, receivables, inventory, total assets, cash): `POINT_IN_TIME` at `period_end`; no OneD/FourD logic (verify per metric which context XBRL uses).
7. **Scope is part of the key.** Calculators use one scope per company (consolidated if available for the period, else standalone) and state it; never mix.
8. Restatements: a later filing for the same key creates a **new vintage** (higher `vintage`, `supersedesId`), ordered by `available_at`; as-of reads return the latest vintage with `available_at <= asOf`. Never overwrite.
9. Cash-flow items filed only half-yearly/annually: keep as `YTD_6M`/`ANNUAL`; **never** divide by a quarterly operating profit (§7).

**Golden tests (must pass):** YUKEN consolidated FY25 sales discrete quarters 110.20, 115.6571, 106.8465, 124.651 sum to annual 457.3563 within 0.05; Q2 discrete is **not** 225.8588. YUKEN consolidated FY25 PAT quarters 5.2407, 7.0066, 4.5077, 7.8466 (sum 24.6016 ≈ annual 24.60). VMART standalone Sep-25: discrete −8.87, YTD_6M +24.73 = Jun-25 33.60 + (−8.87).

### 5.2 Units — `facts/units.ts`
- FERE `unit='INR'` (rupees) → **crore = value / 1e7**, stored REAL. Lakh = /1e5. Record the conversion in `derivation`.
- Unknown/other unit strings are **rejected** (not passed through). Trendlyne money values labelled `INR` are already in crore → map explicitly per token via the catalogue (§9), never by label.
- Magnitude guard: flag `UNIT_SUSPECT` when a value differs by >10³× from the same metric's adjacent period (example to catch: YUKEN FY25 `equity_capital` 1.3e13 INR vs FY26 1.36e8).
- Percent vs fraction: store percent as percent (`PCT`), fractions as `RATIO`; the mapping table declares which (e.g., `dividendpayoutnpa` fraction vs `dividendpayout` percent).

### 5.3 Metric definitions — `facts/metricDefinitions.ts` + table `research_metric_definitions`
One canonical name per metric, with definition, unit, period basis, and provider mappings. Minimum set and definitions:
`revenue_from_operations` (XBRL RevenueFromOperations) · `other_income` · `total_income` (= revenue_from_operations + other_income; **Trendlyne “Total Rev.” maps here, not to revenue**) · `pbt_before_exceptional` · `exceptional_items` (positive = gain) · `pbt` · `tax_expense` · `pat_total` · `pat_attributable_to_owners` · `finance_cost` · `depreciation_amortisation` · `ebitda_derived` = `pbt_before_exceptional + finance_cost + depreciation_amortisation − other_income` (**before exceptional items; reproduces Trendlyne operating profit for TATATECH FY26: 848.43 + 34.12 + 144.95 − 174.55 = 852.95**) · `cfo` · `capex_cash_outflow` (flag PPE-only vs total) · `equity_total` · `borrowings_total` · `lease_liabilities` · `cash_and_equivalents` · `trade_receivables` · `inventory` · `trade_payables` · `promoter_pct`, `promoter_pledge_pct_of_promoter`, `fii_pct`, `dii_other_pct`, `mutual_funds_pct`, `public_pct` · price/volume metrics.
A single alias layer maps legacy names (`revenue`, `pat`, `cfo`, `revenue_cr`, `pat_cr`, `cfo_cr`, `roe_pct`, `roce_pct`) → canonical; `CanonicalFactService`-style readers must use the canonical names only.

### 5.4 Provider tiers and read policy — `facts/readPolicy.ts`
Tiers: `STATUTORY` (XBRL/FERE, NSE/BSE) > `PROVIDER_VERIFIED` (provider value with real period + cross-check) > `PROVIDER_LATEST` (undated snapshot; **never used in time series**) > `SECONDARY_LEAD` > `SIMULATED`. **Every read** applies: `quarantined=0`, tier not `SIMULATED`, not `MISSING`, no `NaN`, no `LATEST*` period strings, `availableAt <= asOf` (use datetime comparison, not string), scope-consistent, period sorted by real date. Conflicts between sources are **retained and surfaced** (`research_conflicts`), not silently resolved; statutory wins for the headline value.

### 5.5 Quarantine of fake data (non-destructive)
Migration flags: set `quarantined=1` on all existing `company_facts` rows with provider `TRENDLYNE_MCP_MAX` (and any row whose source is the simulator in `TrendlyneMcpClient.getStockParameterValues`). The simulator code path must **throw** (`SIMULATOR_DISABLED`) in non-test environments; tests may enable a mock via explicit injection only. Do not delete rows. Produce a report (CSV) of affected symbols and metrics.

### 5.6 Backfill (read-only from raw → new table)
`scripts/research_v2/backfill_facts.mjs --symbols YUKEN,BECTORFOOD,VMART,TATATECH,OPTIEMUS,ARROWGREEN --dry-run` computes clean facts from `verified_xbrl_fact` into memory and prints a **before/after diff** versus `company_facts` (counts, changed values, failed reconciliations). Writing to the new table happens only with `--write` and only to a database path supplied explicitly (a copy). Never to `portfolio.db` directly.

## 6. Seven-filter scorecard (informational) — `filters/scorecard.ts`

### 6.1 Configuration (`filters/thresholds.ts`, overridable per run)
```ts
export const DEFAULT_THRESHOLDS = {
  promoterPct:        { value: 66.6, comparator: '>'  },   // as currently set by the owner
  profitableQuarters: { value: 8,    comparator: '>=' },   // consecutive discrete quarters with PAT>0
  roce:               { value: 35,   comparator: '>=' },
  roe:                { value: 25,   comparator: '>=' },
  promoterPledge:     { value: 0,    comparator: '<=', tolerance: 0.01 },
  institutional:      { value: null, comparator: 'info' },   // level + QoQ change shown, no threshold
  cfoToEbitda:        { value: 0.5,  comparator: '>=' },
};
```

### 6.2 Row semantics
Each filter returns one `ScorecardRow` (§4). `status`: `MEETS_THRESHOLD` / `BELOW_THRESHOLD` (for ≥/> filters) / `ABOVE_THRESHOLD` (for ≤ filters, i.e., pledge) / `UNVERIFIABLE` (with `reasonIfUnverifiable`). `gap = observed − threshold`. **Never emit a default value; never treat unknown as fail or pass.** The summary line is descriptive only: “n of m evaluable checks meet their thresholds; k unverifiable” — it is **not** a gate and is not used to include/exclude a scrip.

### 6.3 Definitions
1. **Promoter holding:** latest official `shareholding_snapshot.promoter_holding` (quarter date stored), **without any pledge-not-null condition**. Basis `OFFICIAL`.
2. **Profitability, 8 quarters:** last 8 consecutive **discrete** quarter-ends (no gaps), one scope, `pat_attributable_to_owners` (fall back to `pat_total`, flagged). `observed` = number of consecutive quarters from the latest with PAT>0 (max 8) and expose `quarterPats[]`, `quartersAvailable`. `UNVERIFIABLE` only if fewer than 8 discrete quarters can be established; otherwise status from comparison (`observed >= 8`). A loss quarter yields `BELOW_THRESHOLD` with the loss visible in `quarterPats`.
3. **ROCE:** `EBIT / average capital employed`, EBIT = `pbt_before_exceptional + finance_cost`; capital employed = `equity_total + borrowings_total (+ lease_liabilities if Ind AS 116 basis)`; period FY or TTM stated. If borrowings are missing: compute **upper bound** `EBIT / equity_total`, basis `UPPER_BOUND`, status `BELOW_THRESHOLD` only if the bound is below the threshold, else `UNVERIFIABLE`. Provider ROCE may be shown as a labelled cross-check (basis `PROVIDER`), never as the primary value when a derived value exists. Exclude banks/NBFCs (`NOT_APPLICABLE` note).
4. **ROE:** `pat_attributable_to_owners / average equity_total` (FY or TTM, stated); if only closing equity exists, use it and flag `CLOSING_BALANCE`.
5. **Promoter pledge:** pledged % of promoter holding. Official `promoter_pledge` is mostly NULL → fall back to the dated Trendlyne/NSE series with its quarter date. NULL = `UNVERIFIABLE`. Compare with tolerance.
6. **Institutional participation:** `fii + dii_other + mutual_funds` at the latest **quarter-end** (no monthly points), plus QoQ change vs the prior quarter-end; show both; `comparator: 'info'`. Provide `components` in the note. Basis `PROVIDER` unless official.
7. **Operating cash-flow discipline:** `CFO / ebitda_derived` on the **same duration basis** (FY or TTM; never a quarter vs a half-year). Lessee-heavy retailers: also show the Ind AS 116-adjusted ratio (CFO − lease principal paid) with a note. Banks/NBFCs `NOT_APPLICABLE`.

### 6.4 Expected audit-derived values (golden fixtures; reproduce within stated tolerance, or document why not)
| Filter | YUKEN | BECTORFOOD | VMART | TATATECH | OPTIEMUS | ARROWGREEN |
|---|---|---|---|---|---|---|
| Promoter % (official 30-Jun-26) | 58.04 | 49.04 | 44.15 | 55.17 | 72.17 | 65.65 |
| Consecutive profitable quarters (of 8) | UNVERIFIABLE (Jun–Dec-25 missing) | 8 (one derived quarter) | **3** (quarters newest→oldest: 47.21, 11.28, 87.99, −8.87, 33.60, 18.51, 71.63, −56.51) | UNVERIFIABLE | UNVERIFIABLE | 8 (one derived quarter) |
| ROCE (FY26) | ≤ 8.9 upper bound (provider 7.76) | 13.58 (provider) | ≤ 24.2 upper bound | ≤ 19.7 upper bound (provider 17.57) | ≤ 12.8 upper bound (provider 9.84) | 27.29 (provider) |
| ROE (FY26, PAT/closing equity) | 3.86 | 11.08 | 13.04 | 13.93 | 8.50 | 20.22 |
| Pledge % | UNVERIFIABLE | 0.0 | UNVERIFIABLE | 0.0 | UNVERIFIABLE | 0.0 |
| Institutional FII+DII, Jun-26 vs Mar-26 | UNVERIFIABLE | 34.03 vs 35.61 (−1.58) | UNVERIFIABLE | 10.78 vs 9.21 (+1.57) | 4.23 vs 4.32 (−0.09) | 1.19 vs 0.89 (+0.30) |
| CFO / EBITDA (FY26) | 41.29/50.52 = 0.817 | 217.79/257.66 = 0.845 | 500.54/512.27 = 0.977 (Ind AS 116 inflates) | 775.7/852.95 = **0.909** (EBITDA before exceptional; the earlier 745.22 deducted the −107.73 exceptional) | −12.15/97.70 = −0.12 | 43.05/64.58 = 0.667 |
These come from the audit's read-only recomputation; ROCE rows without debt data are bounds. If the builder's values differ, investigate and record the reason; do not tune code to match.

## 7. Calculation library (`calc/*`) — deterministic, unit-tested, no LLM
Common return type: `{ calcId, name, value, unit, period, scope, inputs: string[] /*factIds*/, formula, status: 'OK'|'INSUFFICIENT_DATA'|'NOT_APPLICABLE', note }`. Missing inputs → `INSUFFICIENT_DATA` listing the missing items. Zero is a value, not a missing marker.
- **Growth/margins:** discrete-quarter YoY and sequential; revenue/EBITDA/PAT CAGR 3y/5y on annual facts (same scope); margins from `ebitda_derived`; operating leverage note.
- **Cash:** `CFO/PAT_attributable`, accruals = (PAT − CFO)/avg total assets (needs total assets), `FCF = CFO − capex` (flag PPE-only capex), reinvestment rate = capex/CFO.
- **Working capital:** DSO = avg receivables / revenue × 365; DIO = avg inventory / COGS × 365 (COGS definition stated: materials + changes in inventory + direct costs where available, else `INSUFFICIENT_DATA`); DPO similarly; CCC = DSO + DIO − DPO. Use average balances when both ends exist, else closing with flag `CLOSING_BALANCE`.
- **Returns on capital:** ROIC = NOPAT / invested capital (components shown); incremental ROIC over a stated window; ROCE/ROE as §6.3.
- **Leverage:** net debt = borrowings + leases − cash; net debt/EBITDA; interest coverage = EBIT / finance cost (also variant excluding other income); show both.
- **Rate sensitivity (Q24):** needs floating-rate borrowing amount. `pretax_delta = floating_debt × 0.0025`; `after_tax = pretax_delta × (1 − effective_tax)` only if tax rate evidenced (`tax_expense / pbt`) else report pre-tax and label any tax assumption. **Never apply to total debt.** No floating split → `INSUFFICIENT_DATA`.
- **Valuation:** P/E, P/B, EV/EBITDA, FCF yield from a priced date; own-history percentile; **reverse DCF** only with explicit stored assumptions, labelled illustrative.
- **Price/technical (optional adapter, needs OHLCV):** returns over 1/5/20 sessions using `close[-1]/close[-1-n]`; relative return vs index; SMA/EMA 20/50/200, ATR, swing pivots, volume-at-price, 52-week levels; **bar integrity must include staleness vs as-of** and OHLC sanity; use **adjusted** prices for returns and **raw** price × raw volume (or volume adjusted for splits/bonus) for traded value.
- **Liquidity:** ADTV 20/60 (value and volume), `exit_days = position_value / (participation_rate × ADTV_value)`; `participation_rate` may be 0 (→ `INSUFFICIENT_DATA`/infinite, not silently 0.10); position size from `userInputs`.
- **Related-party materiality:** RPT amounts / revenue, assets, net worth (needs parsed RPT table; else `INSUFFICIENT_DATA`).
Golden values to reproduce: YUKEN FY26 CFO/PAT = 41.2888/14.3904 = 2.87; FCF = 41.2888 − 83.0337 = −41.74 Cr; EBITDA 50.52 Cr (10.93% on revenue 462.17); interest coverage (PBT+interest)/interest = 3.08 (2.71 excl. other income). TATATECH FY26 EBITDA 852.95; interest coverage ≈ 25.9×; effective tax 218.13/740.7 = 29.45%; CFO/PAT 775.7/546.59 = 1.42.

## 8. Readiness rule (`readiness/readiness.ts`) — replaces “a row exists”
A sub-question is `READY` only if **every** declared input satisfies all of: scope consistent; period type and coverage (e.g., ≥8 discrete quarters for bottoming/8Q questions; ≥5 annual points for CAGR); units validated; tier ≥ required (statutory for numbers that statutes govern); freshness (latest filed period within the allowed lag of `asOf`); no unresolved conflict above tolerance; for documents: `parse_status='PARSED'` **and** an excerpt exists (an unparsed document is not evidence). Otherwise `PARTIAL` (list what is missing) or `DATA_INSUFFICIENT`. Remove hard-coded `PEERS=1`, `SEGMENTS=0`, `RPT=0`; derive them from data. Premise checks are part of readiness (e.g., Q4 requires an order-book disclosure or becomes `NOT_APPLICABLE` with the underlying revenue-concentration question).

## 9. Trendlyne acquisition (`acquisition/*`)
1. **Real client only.** Delete/disable the simulator path in production; on no real response return an error result and write a `trendlyne_call_log` row — never fabricate.
2. **Never overwrite a prior SUCCESS** with an error row; keep every response in an append-only store keyed by request hash.
3. **Catalogue enumeration** (`trendlyneCatalogue.ts`): page through discovery until exhausted (not 69 capped queries), store all tokens in `research_trendlyne_catalogue` with label, category, unit (money values are **crore**), period type, mapped metric, tier T1/T2/T3. Record actual catalogue size in the run report (audit found only 277 discovered; the owner's “3,500+” is unverified).
4. **Gap-first planner** (`gapPlanner.ts`): from the readiness gaps (§8) per scrip, request only missing tokens; T1 first; T2/T3 only for named gaps.
5. **Call budget** (`callBudget.ts`): `paramCalls = ⌈symbols/10⌉ × ⌈tokens/50⌉`; views (`overview, technical, news, events, shareholding, sast, bulblockdeal`) per symbol unless a probe proves multi-symbol support; focused document queries only for open document gaps, cached by document id. Hard cap (default 90 for six scrips) throws `CALL_CAP_EXCEEDED`.
6. **Quota handling:** audit shows 89% of parameter calls failed with code 1002 “Maximum weighted channel limit exceeded”. Implement a weighted-cost estimate, token-bucket rate limiter, exponential backoff with jitter, resume queue, and a visible “quota exhausted, resume at …” state.
7. **Mapping fixes:** unit `INR_CR`; separate `total_income` from `revenue_from_operations`; case-insensitive label match (`1Y Ago`, `RoA`); correct dividend-payout scale; add missing tokens (TTM revenue/PAT, interest, total debt, equity, quarterly CFO, `pubpct`, `mfhold`, `prompct4q/8q`, `fiipct4q`, insider tokens); five mapped tokens absent from the discovered catalogue (`contingentliabilitiesa`, `currentprice`, `ebita`, `inventoriesq`, `tradereceivablesa`) must be re-verified.
8. **Real period anchors.** No fetch-date `periodEnd`; relative labels (`1Q Ago`) anchor to the provider-reported latest results quarter (not the shareholding quarter), with a check against XBRL where available.
9. OPTIEMUS currently has **no** Trendlyne data: record the gap; XBRL/FERE and filings carry it until a successful fetch.

## 10. Research items and independent research (`research/*`)
Store every third-party/primary item: `{id, symbol, tier(PRIMARY|SECONDARY), url, title, publisher, publishedAt, retrievedAt, excerpt, subQuestionIds[], status(VERIFIED|UNVERIFIED_LEAD|REJECTED), tracedTo?}`. One **research brief per scrip** from open gaps (sub-question + exact fact + preferred source); caps per scrip (default ≤12 searches, ≤15 fetches); de-duplicate URLs/syndicated copies; cache by URL hash; untraceable items rejected. Secondary items (Moneycontrol, StockScans, Multibagg.ai, ValueResearch, FT, CNBC-TV18, YouTube, social) are **leads** until traced to a primary source (annual report, filings, concall, regulator record). Concall/management statements are labelled `MANAGEMENT_CLAIM`. Provide a pluggable fetcher interface; this slice builds the protocol and storage, not a crawler.

## 11. Agent layer (LLM-agnostic)

### 11.1 Provider interface and adapters
`LlmProvider` (§4). Adapters for Claude and OpenAI first (keys from environment, never from request bodies or DB), stubs for Gemini/Bedrock/local, and a deterministic `mock` for tests. Configuration `routine.agents = { drafter: {provider, model}, reviewer: {provider, model} }`; may differ. Capture usage/cost per call into `report_runs`; enforce per-run and per-day spend caps (default configurable) before each call.

### 11.2 Prompts and schemas (`agents/prompts`, `schemas`)
- **Drafter:** one scrip's frozen bundle only. Output JSON: `SubAnswer[]` for all 29 questions’ sub-questions. Rules in the system prompt: use only bundle facts/calcs/research items; every number appears as a claim with `refs`; premise check first; terminal state for every sub-question; no verdict labels, no price targets or recommendations; flag inference as `kind:'INFERENCE'`; never name another scrip outside Q3/Q17 peer sections.
- **Reviewer:** separate system prompt; input = bundle + draft; output = `findings[] {subQuestionId, severity, defect, evidence, requiredFix}`; applies the rubric (§11.5); cannot add facts; may mark `PASS` only when zero blocking findings.
- Both prompts are **provider-neutral Markdown + JSON Schema** and stored in the routine pack (§13) so they can be run unchanged by another provider.

### 11.3 Claim validator (deterministic) — `claimValidator.ts`
For every claim with a numeric `value`: resolve each `ref` in the bundle (factId/calcId/researchItemId must exist); check `value` equals the referenced value within tolerance (default 0.5% or 0.01 absolute), `unit` matches, `period` and `scope` labels match; reject claims citing `quarantined`, `SIMULATED`, `LATEST*` or `SECONDARY_LEAD` as primary statutory evidence. Scan narrative text for numeric tokens (including ₹/Cr/%/x forms) that are **not** covered by a claim → defect `UNCLAIMED_NUMBER`. Dates and fiscal labels must match the period of the referenced fact.

### 11.4 Completeness gate and leakage check
`completenessGate`: every sub-question terminal with required fields (`ANSWERED` needs ≥1 claim with refs; `PARTIAL` needs `gap` + `nextAction`; `NOT_DISCLOSED` needs `sourcesSearched`; `NOT_APPLICABLE` needs `premiseCheck`). `leakageCheck`: names/aliases/ISINs of other scrips in the run must not appear outside Q3/Q17 peer sections. Both gate publication.

### 11.5 Reviewer rubric
Number traceability; period/scope/unit labels; latest available period used (staleness vs bundle `asOf`); conflicts disclosed; inference not stated as fact (customer/supplier concentration, pass-through, order-book conversion, reverse-DCF assumptions); premise checks done; all sub-questions terminal; no template/boilerplate text reused across questions; conclusions follow from evidence; arithmetic recomputed from claims; peer comparisons only in Q3/Q17; secondary sources labelled; no investment recommendations.

### 11.6 Orchestrator (`orchestrator.ts`)
`draft → claimValidator + completenessGate + leakageCheck → reviewer → (if blocking findings) revise (max 2 loops) → human escalation`. Persist every iteration (`report_runs`, `answer_store`, `review_findings`). **Parity test:** run the same fixture bundle through two providers (mock-recorded outputs acceptable in CI) and compare validator results and key claims.

## 12. Report layout (`report/render.ts`)
Per scrip, standalone: (1) **Top summary** — what the company is (from evidence), headline evidence-based view, strengths and risks (each with claim refs), data-completeness score, and the **seven-filter scorecard table** (§6: filter · observed · threshold · gap · status · period/as-of · basis · source); (2) the 29 questions in contract order, each showing sub-question answers with state badges and evidence refs; (3) evidence appendix: facts and calcs with ids, conflicts, gaps and next actions, research items, sources searched, routine version and run metadata. Question numbering = `contract.mjs` ids 1–29; retire other numberings. No overall pass/fail, no ranking across scrips, no buy/sell labels. Footer: “Analysis of evidence; not personalised investment advice.”

## 13. Routine definition (the “permanent routine”)
`routine/ROUTINE_V2.json`: `{ version, contractVersion, steps[], sourceLadder[], callCaps, researchCaps, thresholds, readinessRules, answerStates, agents, validators, reportLayout, promptHashes }`. The pipeline refuses to run if the file is missing or the prompt hashes mismatch; every `report_runs` row stores `routineVersion`. Changing the routine requires a version bump and a changelog entry. The same pack (routine + prompts + schemas + validator code) is what is handed to ChatGPT or any other provider.

## 14. Data model (SQLite DDL — `research_v2_schema.sql`)
```sql
CREATE TABLE IF NOT EXISTS research_canonical_period_facts (
  fact_id TEXT PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL, scope TEXT NOT NULL CHECK (scope IN ('CONSOLIDATED','STANDALONE')),
  metric TEXT NOT NULL, period_type TEXT NOT NULL CHECK (period_type IN ('DISCRETE_Q','YTD_6M','YTD_9M','ANNUAL','TTM','POINT_IN_TIME')),
  period_start TEXT NOT NULL, period_end TEXT NOT NULL, value_cr REAL, unit TEXT NOT NULL,
  source_tier TEXT NOT NULL, source TEXT NOT NULL, source_ref TEXT, available_at TEXT NOT NULL,
  vintage INTEGER NOT NULL DEFAULT 1, supersedes_id TEXT, derivation_json TEXT, quality_flags TEXT DEFAULT '[]',
  quarantined INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (isin, scope, metric, period_type, period_start, period_end, vintage)
);
CREATE INDEX IF NOT EXISTS idx_rcpf_lookup ON research_canonical_period_facts (isin, metric, scope, period_type, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_rcpf_symbol ON research_canonical_period_facts (symbol, metric, period_end DESC);

CREATE TABLE IF NOT EXISTS research_metric_definitions (
  metric TEXT PRIMARY KEY, definition TEXT NOT NULL, unit TEXT NOT NULL, period_basis TEXT NOT NULL, provider_mappings_json TEXT DEFAULT '{}', aliases_json TEXT DEFAULT '[]');

CREATE TABLE IF NOT EXISTS research_trendlyne_catalogue (
  token TEXT PRIMARY KEY, label TEXT, category TEXT, unit TEXT, money_in_crore INTEGER DEFAULT 0, period_type TEXT,
  mapped_metric TEXT, tier TEXT CHECK (tier IN ('T1','T2','T3','SKIP')), discovered_at TEXT, notes TEXT);

CREATE TABLE IF NOT EXISTS research_trendlyne_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, purpose TEXT, endpoint TEXT, symbols_json TEXT, tokens_json TEXT,
  request_hash TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT, error_message TEXT, weighted_cost REAL, response_ref TEXT, called_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_rtcl_hash ON research_trendlyne_call_log (request_hash, status);

CREATE TABLE IF NOT EXISTS research_items (
  item_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, tier TEXT NOT NULL, url TEXT NOT NULL, title TEXT, publisher TEXT,
  published_at TEXT, retrieved_at TEXT NOT NULL, excerpt TEXT NOT NULL, sub_question_ids_json TEXT DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('VERIFIED','UNVERIFIED_LEAD','REJECTED','MANAGEMENT_CLAIM')), traced_to TEXT, url_hash TEXT UNIQUE);

CREATE TABLE IF NOT EXISTS research_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, isin TEXT, metric TEXT, period_end TEXT, scope TEXT, fact_a TEXT, fact_b TEXT,
  value_a REAL, value_b REAL, rel_diff REAL, status TEXT DEFAULT 'OPEN', note TEXT, detected_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS research_report_runs (
  run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, as_of TEXT NOT NULL, routine_version TEXT NOT NULL, contract_version TEXT NOT NULL,
  bundle_hash TEXT NOT NULL, drafter_provider TEXT, drafter_model TEXT, reviewer_provider TEXT, reviewer_model TEXT,
  status TEXT NOT NULL, validator_verdict_json TEXT, gate_verdict_json TEXT, spend_usd REAL, loops INTEGER DEFAULT 0, started_at TEXT, finished_at TEXT);

CREATE TABLE IF NOT EXISTS research_answer_store (
  run_id TEXT NOT NULL, sub_question_id TEXT NOT NULL, state TEXT NOT NULL, claims_json TEXT NOT NULL, narrative TEXT,
  gap TEXT, next_action TEXT, sources_searched_json TEXT, premise_check_json TEXT, review_status TEXT, PRIMARY KEY (run_id, sub_question_id));

CREATE TABLE IF NOT EXISTS research_review_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, sub_question_id TEXT, severity TEXT, defect TEXT, evidence TEXT, required_fix TEXT, resolution TEXT, loop_no INTEGER);

CREATE TABLE IF NOT EXISTS research_filter_scorecard (
  run_id TEXT NOT NULL, symbol TEXT NOT NULL, as_of TEXT NOT NULL, filter_id INTEGER NOT NULL, label TEXT, observed REAL, unit TEXT,
  threshold REAL, comparator TEXT, gap REAL, status TEXT NOT NULL, basis TEXT, period TEXT, scope TEXT, sources_json TEXT, formula TEXT, note TEXT, reason_unverifiable TEXT,
  PRIMARY KEY (run_id, symbol, filter_id));
```
Plus a migration step that sets `quarantined=1` on legacy `company_facts` rows where provider = `TRENDLYNE_MCP_MAX` **only if** the column exists (add the column `quarantined INTEGER DEFAULT 0` to `company_facts` additively; do not alter other data).

## 15. Delivery slices (one PR each; review by the assistant after each)
| Slice | Content | Exit criteria |
|---|---|---|
| S1 | Domain types, metric definitions, units, `xbrlPeriods` (§5.1–5.3), golden tests | §5.1 golden tests green; no DB writes |
| S2 | Schema SQL + migration module + sign-off log line; quarantine step; fact store, read policy (§5.4–5.5) | Migration applies idempotently on in-memory DB; read policy tests (quarantine/LATEST/tier/as-of) |
| S3 | Backfill dry-run tool + before/after diff report for the six scrips | Report committed as an artifact; reconciliation flags explained |
| S4 | Seven-filter scorecard (§6) + fixtures | §6.4 values reproduced or discrepancies documented; no overall pass/fail anywhere |
| S5 | Calculator library (§7) + readiness (§8) | Golden calc values; `INSUFFICIENT_DATA` paths tested; no default numbers |
| S6 | Trendlyne client, catalogue, budget, quota (§9) with a **recorded-response fake** | No overwrite of SUCCESS; cap enforcement; catalogue size recorded; simulator throws |
| S7 | Research items store + protocol (§10) | Tier/trace rules tested |
| S8 | Agent layer: provider interface, mock + Claude + OpenAI adapters, prompts/schemas, claim validator, gate, leakage, orchestrator (§11) | Injected wrong number → `UNCLAIMED_NUMBER`/mismatch failure; parity test with two providers |
| S9 | Report renderer + routes + routine file + per-question UI (new components only) (§12–13) | A fixture scrip renders end-to-end with scorecard table and answer states |
| S10 | Six-scrip run on a **database copy**, human review | Six standalone reports; reviewer findings resolved; lessons into routine v2.1 |

## 16. Review checklist (what the reviewing assistant will check on each PR)
1. Scope: only files in §3; nothing from the other work stream modified; branch from latest `origin/ai-review`; no pushes to `ai-review` directly.
2. No runtime DDL; migration idempotent; version assigned at merge; sign-off line present.
3. No real database written; any real-data test is read-only (`mode=ro`) and cited.
4. Units/periods/scope: every money value REAL crore with recorded conversion; flow vs point-in-time correct; no `LATEST*` in series; no cumulative stored as discrete.
5. Never a default number or verdict; `UNVERIFIABLE` / `INSUFFICIENT_DATA` used correctly; scorecard never eliminates or ranks.
6. Tests: unit, golden (§5.1, §6.4, §7), negative (corrupt units, duplicate vintages, missing quarters, simulator enabled), claim-validator mutation tests; `npm run lint` and the project's test runner green; evidence attached.
7. Provider independence: no provider-specific logic outside adapters; prompts neutral; secrets only from environment.
8. Spend/quota caps enforced and tested; no retries without back-off.
9. Reports: every number backed by a claim id; no boilerplate tails; no “answers all 29” claims unless the gate passes.
10. Security: no new unauthenticated mutating route; new routes require the same auth as other admin routes; no secrets in logs or DB.

## 17. Guard rails (summary; full list in master review §10 and the constitution)
No synthetic data in any readable path · no number without a claim id · no default values or verdicts · raw data immutable, promotion additive with vintages, quarantine not delete · periods/scope/units are part of every fact key · secondary sources are leads · one scrip per prompt · reviewer is a separate call · work on copies; additive numbered migrations; no runtime DDL · tax/legal thresholds need a named human sign-off · stop and ask on identity ambiguity, conflicting statutory data, any change to financial logic, quota/cost cap breach, or any need to touch files owned by the other work stream.

## 18. Open items for the owner (do not block S1–S5)
1. Promoter threshold basis (kept at 66.6 as configured; 66.67 = two-thirds if intended).
2. Institutional participation level threshold (currently informational).
3. Optimus Finance identity (ISIN/BSE code) — otherwise excluded.
4. Approval to install `duckdb` (+ parquet reader) for the OHLCV adapter.
5. Daily spend cap and the second provider’s credentials for the parity test.
