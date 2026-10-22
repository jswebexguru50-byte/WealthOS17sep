# WEALTHOS INTELLIGENCE CONSTITUTION

**Version:** 1.1  
**Status:** MANDATORY OPERATIONAL INVARIANTS  
**Scope:** All Intelligence Modules, Evidence Ingestion, Reasoning Engines, Cockpit Adapters, and Tests  

Every service, adapter, model, and test in the WealthOS intelligence layer MUST strictly uphold the following fifteen invariants.

---

### Rule 1 — Parsed is not verified
Provider data cannot become `VERIFIED` merely because JSON parsing succeeded or an HTTP endpoint returned 200 OK.
- Raw provider inputs are `RAW_PROVIDER` or `PARSED`.
- Facts only become `PRIMARY_SOURCE_VERIFIED` or `CROSS_SOURCE_VERIFIED` after authoritative canonical cross-matching or audited primary filing extraction.

### Rule 2 — Absence is not evidence
No warning found cannot become a positive conclusion unless evidence coverage is sufficient.
- If forensic checks lack underlying cash flow or balance sheet facts, the answer is `DATA_INSUFFICIENT`, not `"No red flags detected"` or `"SUPPORTED"`.
- Never convert the absence of detected evidence into positive evidence of safety.

### Rule 3 — Level is not trajectory
A high NIM, ROCE, or operating margin does not mean it is improving.
- `EXPANDING` vs `CONTRACTING` requires temporal delta comparison: `latestValue - previousValue`.
- Absolute level and trajectory are distinct dimensions and must never be conflated.

### Rule 4 — One interval is not acceleration
Top-line acceleration or deceleration requires at least two comparable growth intervals (three consecutive periods).
- With only two historical observations, exactly one growth rate exists; it cannot be labeled `ACCELERATING`, `DECELERATING`, or `STABLE`. It is `SINGLE_PERIOD_GROWTH`.

### Rule 5 — No unsupported prose
Derived prose must never contain claims stronger than the triggering predicates.
- Do not assert `"supportive institutional flows"` unless institutional inflow was explicitly evaluated and satisfied.
- Do not claim `"price trading above 50-day and 200-day moving averages"` unless those moving averages were explicitly calculated and confirmed.

### Rule 6 — Every conclusion has lineage
Every derived statement, warning, or inflection point must carry the evidence references (`evidenceRefs`) of the underlying facts that generated it. No empty `evidence: []` on material intelligence claims.

### Rule 7 — Point-in-Time (PIT) means PIT
`asOfDate` must constrain evidence availability, not merely appear in an interface.
- A query with `asOfDate = '2025-03-31'` must strictly filter `availableAt <= '2025-03-31'` and `trade_date <= '2025-03-31'`.
- No future evidence or retroactive filings may leak into historical evaluation.

### Rule 8 — Unknown remains unknown
Missing moat, promoter pledge, TAM, management commitment, or auditor evidence must remain `DATA_INSUFFICIENT`.
- Do not mark promoter pledge as `NO_RED_FLAG_DETECTED` unless pledge filing data was retrieved and verified clean.
- Do not infer competitive moat from ROCE.

### Rule 9 — Execution status ≠ Truth quality
A module can have an execution status of `WORKING` while individual facts within it have truth statuses of `PARSED`, `PARTIAL`, or `DATA_INSUFFICIENT`.
- Execution availability (did the service run without crashing?) must not be conflated with evidentiary truth.

### Rule 10 — Current valuation ≠ Relative valuation
Labeling a multiple as `NEAR_MEDIAN`, `CHEAP`, or `EXPENSIVE` requires an actual calculated comparison basis (historical median, 5-year percentile, or industry peer band).
- Without an empirical comparison distribution, relative valuation is `DATA_INSUFFICIENT`. The raw multiple must be displayed without synthetic relative claims.

### Rule 11 — Management extraction ≠ Management verification
Displaying a stated forward target is extraction. Walk-the-talk verification requires deterministically comparing the promised target against subsequent reported actual facts for the specified period.
- A commitment remains `PENDING` until the deadline passes, and then deterministically evaluates to `DELIVERED`, `PARTIAL`, or `MISSED`.

### Rule 12 — LLM extraction may propose; deterministic evidence decides
Natural language processing or LLM extraction may propose commitment candidates and parameters, but deterministic financial facts and mathematical comparisons decide delivery status.

### Rule 13 — Errors cannot disappear silently
Analytical module adapters must not swallow exceptions in empty `catch {}` blocks.
- If a strategy or indicator calculation fails, the failure must be propagated as `PARTIAL` or `ERROR`, with explicit warnings attached.

### Rule 14 — Business-model logic must be canonical data
Business model classification must rely on canonical exchange, sector, industry, and MasterTicker records rather than indefinitely expanding hardcoded ticker sets.

### Rule 15 — Tests must verify values and semantics, not merely object existence
Testing must verify expected numbers, periods, directional derivations, and PIT boundaries against known facts—not merely assert that an object property is defined.
