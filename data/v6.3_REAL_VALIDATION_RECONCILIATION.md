# WealthOS / ITAS v6.3: Revision 2 Handover & Verification Dossier

> [!IMPORTANT]
> **CANONICAL AUDIT BOUNDARY**:  
> **This package verifies the integrity and fail-closed behavior of the v6.3 empirical research harness; it does not constitute evidence that the v6.3 strategies have been statistically validated or approved for production deployment.**

**Release Label**: `v6.3 REVISION 2 — RECONCILED FAIL-CLOSED RESEARCH HARNESS — EMPIRICAL PROMOTION BLOCKED`  
**Target Database Artifact**: `portfolio_v6.3_research_subset.db` (Extracted genuine SQLite research database)  
**Database SHA-256**: `f9ad3b132161a2cc8b6927baa1ca1134d9d1b6ad42ec87ecc603b13293d52752` (Verified whole-file)  
**Database Physical Integrity**: `PRAGMA integrity_check` = `ok`  
**Database Relational Integrity**: `PRAGMA foreign_key_check` = `0 errors`  
**Execution Intrabar Ambiguity Policy**: `CONSERVATIVE_STOP_FIRST`  

---

## 1. Canonical Evidence States

To maintain rigorous scientific clarity and prevent any ambiguity during external evaluation, the package establishes the following four canonical evidence states:

| Canonical Evidence State | Independent Status | Technical Rationale & Audit Evidence |
| :--- | :---: | :--- |
| **`REAL_DATA_AVAILABLE`** | **YES** | The packaged database contains 105,243 genuine `DailyOHLCV` records across 60 equities directly extracted from historical sources with zero synthetic row generation. |
| **`REAL_DATA_PIT_VALID`** | **PARTIAL** | OHLCV records carry explicit EOD availability timestamps (`15:35:00+05:30`). Multi-source point-in-time synchronization across corporate filings, shareholding dates, and index membership remains partial. |
| **`STRATEGY_REPLAYABLE`** | **PARTIAL** | Strategies S1–S11 are decoupled and evaluable on next-bar open; S12–S20 require intraday/order-flow feeds not exposed offline. |
| **`STATISTICALLY_VALIDATED`** | **NO** | The research dataset is data-incomplete for full multi-year empirical backtesting. Preflight gate fails closed with `DATA_INSUFFICIENT`. |

---

## 2. Production Status Definitions & Clarification

To prevent conflation between code immutability and empirical authorization, the following definitions are canonical:

```
PRODUCTION_CODE_FREEZE
    Definition: Frozen production implementation was not modified by the research harness.
    Status:     FREEZE VERIFIED (SHA-256 baseline untouched; zero modifications to S1-S20, Overlay, or Capital Protection)

PRODUCTION_PROMOTION
    Definition: Permission to deploy or rely upon empirical strategy results in live production.
    Status:     PROMOTION NOT AUTHORIZED (Dataset incomplete; preflight fails closed; alpha unproven)
```

---

## 3. Reconciled Architectural Audit Matrix

| Audit Checkpoint | Revision 2 Standard | Reconciled Implementation Status |
| :--- | :--- | :--- |
| **Research Preflight Gate** | Unconditional fail-closed architecture | **PASS** — Evaluates physical integrity, foreign keys, and completeness. Rejects missing data with `DATA_INSUFFICIENT` for both full DB and research subset. |
| **Synthetic Fallbacks** | Zero synthetic reconstruction | **PASS** — Absolute ban on `volume * 0.40`, `close * volume`, or nullish defaults. Verified by automated regex scanner. |
| **Delivery & Turnover** | 100% authentic and complete | **PASS** — `selectContinuousUniverse` enforces `turnoverRows = barCount AND deliveryRows = barCount`. |
| **Layer Ablation** | Genuine leave-one-layer-out | **PASS** — Eradicated arbitrary modulo signal drops (`i % 10`, `i % 6`, `i % 5`). Implements `FrozenLayerAdapters`. |
| **Unexposed Layers** | Honest failure reporting | **PASS** — Unexposed production components return explicit `API_NOT_EXPOSED` with technical justification. |
| **Frozen Overlay Replay** | Authentic historical context | **PASS** — Computes volume surge, delivery ratio, turnover, ATR%, and momentum from bar history; queries DB for events/forensics; enforces `assertContextPIT()`. Zero fabricated constants. |
| **Execution Simulator** | Next tradable bar open | **PASS** — All fills execute on `NEXT_LEGALLY_TRADABLE_BAR_OPEN`. Same-bar execution is hard-rejected (`SAME_BAR_EXECUTION`). |
| **Intrabar Ambiguity** | Conservative order resolution | **PASS** — Formally committed to `CONSERVATIVE_STOP_FIRST` when high and low breach both thresholds in the same bar. |
| **Continuous Portfolio Equity** | Mark-to-market valuation | **PASS** — $\text{Equity}_t = \text{Cash}_t + \sum (\text{Qty} \times \text{MarkPrice})$. Enforces continuity across profit, loss, multi-asset, and liquidation. |
| **Transaction Costs** | Trade Identity Ledger derived | **PASS** — Statutory taxes (STT, GST, Stamp Duty, Exchange Fees) derived directly from ledger executions rather than post-hoc approximations. |
| **Empirical Invariant Tests** | Automated proof of invariants | **PASS** — **47/47 tests pass**, including the 7 hard empirical invariant audit tests in [`empirical_integrity_invariants.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/empirical_integrity_invariants.test.ts). |

---

## 4. Current Research Conclusion

```
WEALTHOS / ITAS v6.3

RESEARCH HARNESS:
    RECONCILED
    FAIL-CLOSED
    ZERO-SYNTHETIC-FALLBACK DESIGN
    PIT-GATED
    REPRODUCIBLE TEST HARNESS

DATABASE:
    PHYSICALLY VALID (PRAGMA integrity_check = ok)
    RELATIONALLY VALID (PRAGMA foreign_key_check = 0)
    SHA-256 VERIFIED (f9ad3b132161a2cc8b6927baa1ca1134d9d1b6ad42ec87ecc603b13293d52752)

EMPIRICAL DATASET:
    REAL HISTORICAL RESEARCH SUBSET
    DATA-INCOMPLETE FOR FULL VALIDATION

STRATEGY REPLAY:
    NOT A COMPLETE FULL-UNIVERSE VALIDATION

ABLATION:
    UNEXPOSED LAYERS ARE NOT FABRICATED
    API_NOT_EXPOSED WHERE REQUIRED

ALPHA:
    NOT ESTABLISHED
    PROMOTION NOT AUTHORIZED

PRODUCTION:
    PROMOTION NOT AUTHORIZED

NEXT REQUIRED EVIDENCE:
    COMPLETE MULTI-SOURCE HISTORICAL DATABASE WITH DELIVERY / TURNOVER / CALENDAR /
    INDEX MEMBERSHIP / SHAREHOLDING / FINANCIAL PERIOD DATES AND OTHER REQUIRED PIT SOURCES.
```

---

## 5. Reviewer Reproduction Instructions

An external reviewer can independently verify this package via two reproducible commands:

### Command 1: Execute Automated Invariant Test Suite (47 Tests)
```bash
npx vitest run tests/unit/empirical_integrity_invariants.test.ts tests/unit/point_in_time_data_integrity.test.ts tests/unit/signal_quality_and_risk_guardrails.test.ts tests/integration/r1_integrated_fixture.test.ts
```
*Expected Outcome*: **47/47 passing tests**, confirming zero synthetic fallbacks, no modulo filters, continuous MTM equity arithmetic, and fail-closed gate mechanics.

### Command 2: Execute Fail-Closed Pipeline Against Packaged Research Database
```bash
npx tsx run_real_historical_v6.3_pipeline.ts portfolio_v6.3_research_subset.db
```
*Expected Outcome*: Pipeline runs `PRAGMA integrity_check` (ok), `PRAGMA foreign_key_check` (0), detects missing secondary tables in the pilot subset, halts immediately, and writes `data/v6.3_REAL_DATA_INSUFFICIENT.json`:
```
====================================================
RESEARCH DATA GATE: DATA_INSUFFICIENT
====================================================
DATA_INSUFFICIENT
 - DELIVERY_DATA_INCOMPLETE: 814/105243
 - TURNOVER_DATA_INCOMPLETE: 814/105243
 - TRADING_CALENDAR_UNAVAILABLE
 - HISTORICAL_INDEX_MEMBERSHIP_UNAVAILABLE
 - SHAREHOLDING_AS_OF_DATE_UNAVAILABLE
 - FINANCIAL_PERIOD_DATE_UNAVAILABLE
```
This confirms that the research harness strictly enforces fail-closed scientific boundaries and refuses to fabricate synthetic surrogates.
