# 29-Question Investor Report — Six-Scrip Program Specification (2026-10-10)

**Status:** specification and plan for the developer bot. **No research was run, no Trendlyne call was made, no code or database was changed.** Reasons: this session has no Trendlyne tool, no Node/Python runtime, and running against the production database is prohibited by the guard rails. Everything below about *what the companies are* is limited to what is in the repo data; no company facts are asserted.

**Builds on:** `scripts/fundamental/institutional29/` (existing 29-question contract, bundle builder, validator, synthesis, archive), `docs/fundamental/INSTITUTIONAL_DUE_DILIGENCE_29_QUESTION_SOURCE_MAP.md`, `AGENT_CONSTITUTION.md`, `IMPLEMENTATION_PLAN.md`, and the guard rails in the master review (`WEALTHOS_MASTER_REVIEW_AND_SPEC_2026-10-08.md` §9–10). **The constitution's scope lock and sign-off rules apply to everything here.**

---

## 1. Scrips and identity

| # | You wrote | Symbol found in repo data | Legal name found in repo data | Note |
|---|---|---|---|---|
| 1 | Yuken India | `YUKEN` | (name not confirmed from data scan) | |
| 2 | Bector Food | `BECTORFOOD` | Bectors Food Specialities Limited | |
| 3 | V-Mart | `VMART` | (name not confirmed from data scan) | |
| 4 | Tata Tech | `TATATECH` | (name not confirmed from data scan) | |
| 5 | Optimus | `OPTIEMUS` | Optiemus Infracom Limited | **Please confirm** "Optimus" means Optiemus Infracom |
| 6 | Arrow Green | `ARROWGREEN` | (name not confirmed from data scan) | |

The constitution requires a valid identity (symbol + ISIN + exchange) before any fact is promoted. The bot must resolve ISINs from `MasterTickers`/`SecurityIdentityRegistry` and stop on any ambiguity.

**Premise check (important):** several of the 29 questions assume a business shape that may not fit a given company — Q4 ("customers that account for 50% or more of the **order book**"), Q2/Q7 (order book), Q1 ("short-term **bullish** price action"), Q24 (floating-rate debt). Each scrip is therefore evaluated independently with a *premise check*: if the premise is false (e.g., a retailer has no order book; the price action is not bullish), the answer says so, states what was checked, and answers the *underlying* question instead (e.g., revenue concentration, what is driving price action). A forced answer to a false premise is a defect.

---

## 2. Your requirements vs what already exists (gap analysis)

| Req. | You asked | Already in repo | Gap to close |
|---|---|---|---|
| **A** | Answer **every sub-question** inside each of the 29 questions, in full | One-sentence question per ID; fixed **150–250 words** per answer; validator enforces word band (`contract.mjs`, `validate_report.mjs`) | No sub-question decomposition; word cap forces the "first sub-question only" behaviour. Add `subQuestions[]`, per-sub-question answer states and a larger budget (§4) |
| **B** | Each scrip evaluated **independently**; comparison only for peers (Q3, Q17) | Reports built as two-company comparative documents, then split (`split_comparative_report.mjs`) | Move to **one isolated run per symbol** (separate bundle, separate synthesis call, no shared context); add a leakage validator (§7.3) |
| **C** | Assess **all** Trendlyne data (3,500+ metrics) and decide what to download per scrip | 51 verified tokens mapped to 41 canonical metrics; F01–F07 packs; source map says "build packs from the discovered catalogue" | One-time **catalogue discovery → classification → tiered packs** (§5) |
| **C2** | Fallback: FERE and XBRL canonical facts; then independent research | Authority rules and gap-resolution plan exist | Make the **ladder explicit and automatic** per gap (§6) |
| **D** | Minimise calls: **10 scrips × 50 metrics per call**; efficient third-party research | `fetch_probe_symbols.ts` batches 10 symbols; comment says 30 metrics/call | Budget planner with hard cap, gap-driven queries, caching, dedupe (§5.3, §6.3) |
| **E** | Compile raw data, LLM synthesises, then **independent quality review** | Frozen-bundle synthesis contract exists; LLM may not create facts | Add a **second-pass reviewer** with a rubric before release (§7) |
| **F** | **Persist** all fetched data and summaries; **promote to canonical** for the front end | `ResearchAnalysisArchive` (immutable versions), `ResearchAnalysisJobs`, canonical fact tables, Analyze Scrip UI shows history | Promotion rules for **secondary/third-party** findings; sub-question level storage; new tables need sign-off (§8) |
| **G** | Save the whole routine permanently so the app never returns **partial** data; top summary with the **8 filter questions** | `CONTRACT_VERSION`, `synthesis_instructions.md` | A versioned **routine definition** and a **completeness gate**; the 8 filter questions are **not defined anywhere in the repo** — I need them from you (§9) |

---

## 3. Program (end-to-end routine per scrip)

```
0 Identity & premise check ─▶ 1 Local-first inventory (canonical facts, FERE/XBRL, DuckDB OHLCV, docs)
 ─▶ 2 Gap list per sub-question ─▶ 3 Trendlyne structured pack (only missing tokens, batched 10×50)
 ─▶ 4 Trendlyne non-parameter views + focused document queries (only for open gaps)
 ─▶ 5 Statutory refresh (FERE/XBRL/NSE/BSE) for still-open statutory gaps
 ─▶ 6 Independent research (filings, concalls, regulators, agencies, media) for still-open gaps only
 ─▶ 7 Normalise, tag source tier, promote what qualifies to canonical (rest = leads)
 ─▶ 8 Freeze bundle (hash) ─▶ 9 LLM synthesis (one isolated call per scrip)
 ─▶ 10 Independent quality review ─▶ 11 Completeness gate ─▶ 12 Persist immutable version + render report
```
Each stage writes to the job record, so a failed or partial run resumes instead of restarting, and the gate (step 11) blocks publication until every sub-question has a terminal state (§7.2).

---

## 4. The 29-question template v2 (sub-questions)

**Answer states per sub-question:** `ANSWERED` (cited), `PARTIAL` (what is known + exact gap + next action), `NOT_DISCLOSED` (sources searched listed), `NOT_APPLICABLE` (premise check result). No other state may be published. **Each answer carries:** source tier, as-of date, period/scope/unit, evidence reference, confidence, and conflicts retained.

**Length:** replace the fixed 150–250 words with a budget per sub-question (suggest 60–150 words) and a hard cap per question (suggest 350–700 words). Short where the evidence is thin; no padding.

Sub-questions below are derived from the existing question text and the "required evidence" column of the source map. **Please review wording once** — they define what "full answer" means.

| # | Question (existing) | Sub-questions that must each be answered |
|---|---|---|
| 1 | Drivers of recent price action | a) 1/5/20-day returns and vs sector/index; b) volume and delivery abnormality; c) announcements/results/orders/deals/insider activity with timestamps; d) news and sentiment; e) is the premise (direction) correct? |
| 2 | Core products/services and the problem solved | a) products/services and segment mix; b) use cases and customer problem; c) geography; d) capacity; e) order-book composition **if reported** |
| 3 | Prospects, strengths, moat | a) moat evidence (IP, certifications, switching costs, cost, distribution, share); b) margin/return evidence vs peers; c) sustainability and what could erode it; d) **peer comparison (allowed here)** |
| 4 | Major customers / concentration | a) named top customers; b) revenue/order-book share and top-1/top-5 concentration (exact excerpt, period, denominator); c) contract duration/renewal risk; d) premise check (order book exists?) |
| 5 | Supplier concentration and pass-through | a) major suppliers/single-source inputs; b) import and commodity exposure; c) contractual pass-through evidence; d) margin behaviour when costs moved |
| 6 | Market size / ceiling | a) served market and geography; b) industry growth and source methodology; c) company share/penetration; d) headroom vs capacity |
| 7 | Reinvestment runway | a) CFO and FCF history; b) maintenance vs growth capex; c) announced projects, utilisation, funding; d) incremental margins/returns |
| 8 | Incremental-capital returns | a) ROIC/ROCE/ROE history; b) incremental ROIC and reinvestment rate; c) vs cost of capital; d) acquisitions' performance |
| 9 | Outlook, health, catalysts, positioning | a) guidance and outlook; b) balance-sheet condition; c) dated catalysts; d) constraints; e) bull/base/bear |
| 10 | Revenue-growth quality | a) annual + 8-quarter history; b) organic/inorganic; c) volume/price/mix; d) breadth by segment/geography; e) receivable quality |
| 11 | Segments leading recovery | a) segment revenue and growth; b) segment margin; c) segment order book/capacity; d) which segments lead and why |
| 12 | Sequential bottoming | a) 8-quarter revenue/EBITDA/PAT; b) YoY and sequential inflection tests; c) working-capital indicators; d) conclusion with quarter-end anchors |
| 13 | Margin trajectory | a) gross/EBITDA/operating/PAT margins 8Q and 5Y; b) drivers (input cost, mix, operating leverage); c) direction and pressure points |
| 14 | One-offs and earnings quality | a) exceptional items and other income by period; b) direction of effect on PBT; c) reported→normalised PAT bridge; d) core vs non-core share |
| 15 | Cash conversion | a) CFO/PAT by year and rolling; b) accruals; c) receivable/inventory growth; d) structural vs timing gap; e) FCF |
| 16 | Deployment and ROCE | a) ROCE bridge; b) capex, acquisitions, debt repayment, dividends/buybacks; c) cash accumulation; d) uses-of-cash table |
| 17 | Relative valuation | a) current and historical P/E, P/B, EV/EBITDA, PEG, FCF yield; b) **direct peers (allowed here)**; c) growth/return-normalised comparison; d) reverse-DCF assumptions; e) percentile vs own history |
| 18 | Management and legal | a) promoter/director background and track record; b) prior entities, resignations, disqualifications; c) enforcement and litigation; d) active disputes and exposure |
| 19 | Governance history | a) audit qualifications/restatements/auditor changes; b) regulatory actions; c) pledges; d) RPT concerns; e) capital-allocation failures/anomalies |
| 20 | Holding trends and insiders | a) promoter/FII/DII/MF/public by quarter; b) pledge trend; c) insider/SAST trades; d) bulk/block deals; e) holder-level changes |
| 21 | Auditor and board | a) auditor name, tenure, fees, qualifications; b) audit committee; c) board composition, independence, attendance, skills; d) remuneration |
| 22 | Business-model risks | a) demand/disruption; b) concentration; c) regulation; d) cyclicality; e) currency/input; f) execution/leverage/dilution |
| 23 | Watchlist | a) monitored variables with deterministic thresholds from the verified baseline; b) owner source and frequency; c) trigger actions |
| 24 | 25-bps rate shock on PAT | a) floating-rate debt; b) average borrowing cost; c) pre-tax impact; d) after-tax impact (tax rate evidenced or labelled assumption); e) refinancing/maturity effects |
| 25 | Working-capital cycle | a) DSO, DIO, DPO, CCC by aligned period; b) trend; c) is it stretching and why |
| 26 | Leverage and coverage | a) gross debt, cash, leases; b) net debt/EBITDA and coverage history; c) maturities and covenants |
| 27 | Related-party transactions | a) RPT sales/purchases/loans/guarantees by counterparty; b) balances and terms; c) materiality vs revenue/assets/net worth; d) change over time |
| 28 | Liquidity | a) ADTV 20/60-day (value and volume); b) free float; c) days to enter/exit at the stated position size and participation rate; d) depth where available |
| 29 | Support zones | a) swing pivots and volume-at-price; b) ATR bands and 20/50/200 averages; c) 52-week levels; d) invalidation level; e) price date and adjustment basis |

Weak premises to reword in the contract: Q1 ("bullish"), Q4 ("50% or more of the order book"), Q2 ("order book").

---

## 5. Trendlyne acquisition plan (efficient and complete)

### 5.1 One-time catalogue discovery (shared by all scrips, cacheable)
1. Enumerate the full parameter catalogue once (the 3,500+ tokens) and store it as a versioned catalogue: token, provider label, category, unit, period type (annual / quarterly / TTM / point-in-time), sign convention.
2. **Classify each token** to: statement line, ratio, per-share, valuation, ownership, estimate/forecaster, score, price/volume/technical, insider, other.
3. **Map to questions and sub-questions** (§4): a token is *required* if a sub-question needs it and no statutory source supplies it; *enrichment* if it adds cross-check value; *skip* otherwise (e.g., bank/insurance tokens for non-financial companies).
4. Tier the packs: **T1 required** (target ~150–250 tokens), **T2 enrichment** (estimates, per-share, valuation history), **T3 long-tail forensic**. Run T1 for all scrips; run T2/T3 only to close **named gaps**.
5. Discovery output is reviewed once by a human; it is not repeated per scrip.

### 5.2 Per-scrip gap-first selection
Before any call: read what is already canonical for that scrip (financial facts, shareholding, FERE evidence, documents, OHLCV). Request from Trendlyne **only tokens whose canonical value is missing, stale or unverified** for that scrip's sector and reporting basis (standalone vs consolidated).

### 5.3 Call budget (planning formula — verify against Trendlyne behaviour in a probe)
- Parameter calls = ⌈symbols ÷ 10⌉ × ⌈tokens ÷ 50⌉. For 6 scrips, all fit in **one symbol batch**, so parameter calls = ⌈M ÷ 50⌉ (e.g., M = 250 tokens → 5 calls; M = 600 → 12 calls). Separate annual and quarterly tokens only if the API requires it.
- Non-parameter views (`overview`, `technical`, `news`, `events`, `shareholding`, `sast`, `bulblockdeal`): up to 7 views × 6 scrips = **42 calls worst case**; probe once whether a view accepts several symbols — if yes, ~7 calls.
- Focused document queries: the source map lists 10; worst case 10 × 6 = **60**. Run only the queries for sub-questions still open after local + parameter data; cache by document id so a chunk is never re-fetched.
- **Target ≤ 60 calls in total for six scrips; hard cap configurable (e.g., 90); the planner refuses to exceed it without approval.** These are planning numbers, not measured.
- Persist every raw response with request hash, so re-runs read from the cache.

### 5.4 Rules
Trendlyne raw availability ≠ canonical completeness: parse, anchor the period, check unit/scope, then promote. Estimates (forecaster) are **provider estimates, never facts**. Trendlyne `technical` is a cross-check only; adjusted DuckDB OHLCV is authoritative.

---

## 6. Source ladder and independent research

### 6.1 Order (stop at the first tier that fully answers the sub-question)
1. Already-promoted canonical facts and stored documents (zero cost).
2. **FERE/XBRL and exchange filings** — statutory numbers (the constitution gives these authority over provider data).
3. Trendlyne parameters, views and focused documents (broad provider layer; gaps and cross-checks).
4. Primary sources outside the store: company website and investor relations, annual reports, presentations, **concall transcripts**, exchange/SEBI/MCA/NCLT/GST and court records, credit-rating reports, intimations to regulators.
5. Secondary sources (labelled, never statutory): reputed agency coverage, Moneycontrol, StockScans, Value Research, Multibagg.ai, Financial Times, CNBC-TV18, interviews and management videos on YouTube, social media. Treated as **acquisition leads**: any number or claim must be traced to a primary source before it is promoted; otherwise it stays `UNVERIFIED_LEAD` and is shown as such.

### 6.2 Your stated order vs the repo's rule
You listed Trendlyne first, then FERE/XBRL, then research. The repo's source authority puts statutory FERE/XBRL above Trendlyne for numbers. The spec keeps *cost* order (cheapest local data first) and *authority* order (statutory controls conflicts); conflicts are retained and shown, not silently resolved.

### 6.3 Efficient research protocol
- Build **one research brief per scrip** from the open-gap list: each line = sub-question + exact fact needed + preferred source. No open-ended browsing.
- Cap per scrip (suggest ≤ 12 searches and ≤ 15 page fetches) with a per-source-type quota; stop when gaps close.
- Query in the company's own terms (legal name, ISIN, exact filing titles); prefer dated primary documents; de-duplicate URLs and syndicated copies; cache by URL hash.
- Record for every item: URL, title, publisher, publication date, retrieved-at, excerpt, tier. Untraceable items are discarded.
- Social media and YouTube are used only to find primary leads (e.g., a concall date), not as evidence.

---

## 7. Synthesis, independent quality review, completeness gate

### 7.1 Synthesis
One LLM call per scrip over the **frozen bundle** of that scrip only (no other scrips' data in context). The LLM may explain and judge from evidence; it may not create facts. Output is structured JSON (per sub-question) plus rendered Markdown.

### 7.2 Completeness gate (blocks publication)
All 29 questions × all sub-questions must be in a terminal state (`ANSWERED`, `PARTIAL` with named gap and next action, `NOT_DISCLOSED` with sources searched, `NOT_APPLICABLE` with premise-check note). A report with any untreated sub-question cannot be released. `PARTIAL` is allowed only after the ladder (§6.1) has been exhausted or the call/search caps were reached, and the report then says exactly that.

### 7.3 Independent quality review (separate pass, separate prompt)
Checks: every number traces to a bundle item; period/scope/unit labelled; conflicts retained; no inference presented as fact (customer/supplier concentration, pass-through, backlog conversion, reverse-DCF assumptions — per README guardrails); premise checks done; **no other scrip's name or data appears outside peer sections (Q3, Q17)**; third-party claims labelled; arithmetic recomputed; word budgets respected. Fails return to synthesis with the exact defects; max two loops, then escalate to a human.

### 7.4 Report layout (per scrip, standalone)
1. **Top summary** (half page): what the company is, headline view, three strengths, three risks, data completeness score, and the **8-question filter scorecard** (§9).
2. 29 questions in order, each with sub-question answers, evidence tags, source tier and as-of.
3. Evidence appendix: source list, conflicts, gaps and next actions.

---

## 8. Persistence and canonical promotion

- Persist, per scrip and run: raw provider responses (hashed), normalised facts, source documents/chunks, research items with tier, the frozen bundle hash, the synthesis output, the review verdict, and the rendered report as an **immutable version** in `ResearchAnalysisArchive`, with the job in `ResearchAnalysisJobs` (both exist in the working tree).
- **Promote to canonical** only items with valid identity, period, unit, scope and provenance (existing rule). Secondary-source claims are stored as `UNVERIFIED_LEAD` facts and shown in the UI with a visible tier badge; they never overwrite statutory or Trendlyne-verified facts.
- Sub-question answers are stored as structured rows so the front end can show per-question status and history ("what changed since last run").
- **Governance:** new tables or fact types (e.g., `TrendlyneParameterCatalog`, sub-question answer store, research-item store) need a line in the `IMPLEMENTATION_PLAN.md` sign-off log and numbered migrations, not runtime DDL. The unsigned research tables already in the working tree are flagged in the Part 2 review (N9).

### 8.1 "Permanent routine" (the app side)
Ship the routine as a versioned definition the pipeline refuses to deviate from:
`WEALTHOS_RESEARCH_ROUTINE_V2.json` = steps (§3), source ladder (§6.1), call caps (§5.3), completeness gate (§7.2), answer states, report layout, contract version. Every archived report stores the routine version used, so any report can be audited and re-run.

### 8.2 Memory (assistant side)
A short note of this routine has been saved to the assistant's project memory so future sessions start from it. It records the decisions, not the data.

---

## 9. Inputs I need from you (blocking items)
1. **The 8 filter questions** used for dossier creation in the alphanumeric strategy scans. They are not defined in the repo files I searched. Paste them (or point me to the file) and I will build the top-of-report scorecard around them.
2. Confirm **Optimus = Optiemus Infracom (`OPTIEMUS`)**.
3. Do you want sub-question budgets of 60–150 words and per-question caps of 350–700 words (replacing 150–250)?
4. Which LLM provider for synthesis and which for the independent review (the working tree supports Bedrock, Gemini and Groq paths) — and the per-day spend cap.
5. Will the developer bot have the **Trendlyne MCP tool** and a Node/Python runtime, and a **copy** of the database to work on?
6. Approve (or reject) the new tables/fact types in §8 for the sign-off log.
7. Peer sets for Q3/Q17 per scrip: use MasterTickers peers, or give lists.

---

## 10. Code stubs (illustrative; adapt to repo conventions)

### 10.1 Contract extension (sub-questions, premise, budgets)
```ts
// scripts/fundamental/institutional29/contract.v2.mjs
export const ANSWER_STATES = ['ANSWERED','PARTIAL','NOT_DISCLOSED','NOT_APPLICABLE'];
export const q2 = (id, topic, question, { subQuestions, premise, ...rest }) => ({
  id, topic, question,
  subQuestions: subQuestions.map((text, i) => ({ id: `${id}.${String.fromCharCode(97 + i)}`, text })),
  premise: premise || null,                    // e.g. { test: 'has_order_book', ifFalse: 'ANSWER_UNDERLYING_QUESTION' }
  budget: { perSubQuestionWords: [60, 150], perQuestionMaxWords: 700 },
  ...rest,
});
```

### 10.2 Trendlyne call-budget planner
```ts
export function planTrendlyneCalls({ symbols, tokens, views, queries, caps }) {
  const symbolBatches = Math.ceil(symbols.length / 10);
  const paramCalls = symbolBatches * Math.ceil(tokens.length / 50);
  const viewCalls = views.multiSymbol ? symbolBatches * views.names.length : symbols.length * views.names.length;
  const docCalls = queries.length;                         // already gap-filtered, cache-checked
  const total = paramCalls + viewCalls + docCalls;
  if (total > caps.hard) throw new Error(`CALL_CAP_EXCEEDED: ${total} > ${caps.hard}`);
  return { paramCalls, viewCalls, docCalls, total };
}
export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
```

### 10.3 Per-symbol isolation and leakage check
```ts
for (const symbol of symbols) {                          // never one prompt for several scrips
  const bundle = await buildBundle(symbol);               // only this symbol's data
  const report = await synthesize(bundle);
  const others = symbols.filter(s => s !== symbol).flatMap(namesAndAliases);
  const leaks = findMentions(report, others, { allowSections: ['Q3', 'Q17'] });
  if (leaks.length) throw new Error(`CROSS_SCRIP_LEAK: ${symbol} mentions ${leaks.join(', ')}`);
}
```

### 10.4 Completeness gate
```ts
export function completenessGate(answers, contract) {
  const defects = [];
  for (const q of contract.questions) for (const sq of q.subQuestions) {
    const a = answers[sq.id];
    if (!a || !ANSWER_STATES.includes(a.state)) defects.push(`${sq.id}: missing`);
    else if (a.state === 'ANSWERED' && !a.evidence?.length) defects.push(`${sq.id}: no evidence`);
    else if (a.state === 'PARTIAL' && !(a.gap && a.nextAction)) defects.push(`${sq.id}: partial without gap/next action`);
    else if (a.state === 'NOT_DISCLOSED' && !a.sourcesSearched?.length) defects.push(`${sq.id}: no sources listed`);
    else if (a.state === 'NOT_APPLICABLE' && !a.premiseCheck) defects.push(`${sq.id}: no premise check`);
  }
  return { pass: defects.length === 0, defects };
}
```

### 10.5 Research item record (third-party)
```ts
type ResearchItem = { id: string; symbol: string; tier: 'PRIMARY'|'SECONDARY'; url: string; title: string;
  publisher: string; publishedAt?: string; retrievedAt: string; excerpt: string; subQuestionIds: string[];
  status: 'VERIFIED'|'UNVERIFIED_LEAD'|'REJECTED'; tracedTo?: string /* primary item id */ };
```

---

## 11. Implementation plan

| Phase | Work | Exit criteria |
|---|---|---|
| **R0** | Resolve inputs in §9; sign-off log entries; confirm identities and ISINs | Written approvals; six symbols resolved |
| **R1** | Contract v2 (sub-questions, premises, budgets); validator and gate (§10.1, 10.4); routine definition file | Unit tests pass on a fixture; every sub-question has a terminal state or the gate fails |
| **R2** | One-time Trendlyne catalogue discovery, classification and tiered packs (§5.1); probe whether views accept multiple symbols | Catalogue stored, reviewed once; documented call formula verified |
| **R3** | Gap-first acquisition for the six scrips within the call cap; raw-response cache; promotion rules | ≤ target calls; no unpromoted-but-reported facts; cache hit on re-run |
| **R4** | Independent research protocol with caps and tiers (§6.3); research-item store | Every third-party item has URL/date/excerpt/tier; leads never overwrite verified facts |
| **R5** | Per-scrip isolated synthesis + independent review loop (§7); leakage check | Zero cross-scrip leaks; reviewer defects ≤ 2 loops |
| **R6** | Persistence, front-end per-question status and history; report rendering with top summary and 8-question scorecard | Reports open in Analyze Scrip with version history |
| **R7** | Run the six scrips on a **copy** database; human review of all six; lessons into routine v2.1 | Six standalone reports; completeness gate passed; QA notes filed |

## 12. Guard rails (in addition to the master review §10)
1. **No fabricated facts.** Every claim has a source, date and tier; missing stays missing (constitution: no evidence = no conclusion).
2. **Independence:** no cross-scrip data in one prompt; comparison only in Q3/Q17 and only against peers.
3. **Premise checks** before answering; never answer a false premise as if true.
4. **Call and search caps** enforced in code; cache before calling; no retries without back-off; log every call with purpose.
5. **Secondary sources are leads**, not evidence; social media and video are leads only.
6. **LLM output is advisory and reviewed;** stored with provenance and `UNVALIDATED` until the review passes; per-day spend cap.
7. **No runtime DDL, no new tables without sign-off;** numbered migrations only.
8. **Real database untouched** — work on a copy; never run purge/restore/recalculate on production data.
9. **Investment views are the user's decision.** Reports present evidence and analysis; they are not personalised financial advice.
10. Stop and ask a human on identity ambiguity, conflicting statutory data, any change to financial logic, or when a cap would be exceeded.

## 13. Limits
No Trendlyne call, no web research, no execution; question wording for sub-questions is my decomposition from the repo's contract and source map and needs your one-time review; call counts are planning estimates; company descriptions deliberately omitted because they have not been researched in this session.
