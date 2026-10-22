# Forensic Scrip Data Engine — Spec & Design v2
**Revision basis:** expanded FR3 field set, realistic token/quota math, GitHub open-source accelerators, quality-gate and failsafe hardening.

---

## 1. Executive Summary of Changes from v1

| Area | v1 | v2 |
|---|---|---|
| Token budget per concall | ~900 tokens (assumed) | ~3,000 tokens (measured against actual field count) — still ~87% reduction vs. raw transcript |
| Rate-limit design | Sized around TPM (tokens/minute) | Sized around RPM (requests/minute) — the actual binding constraint on free tiers |
| Build approach | Build every tier from scratch | Fork and vendor 4 proven open-source accelerators; build only the differentiated forensic-extraction layer |
| Forensic fields | 4 fields (order book, pass-through, pricing power, capacity) | 20 fields across 6 signal categories, including cross-quarter derived fields |
| Failure handling | Implicit (crash on 429) | Explicit: circuit breakers, budget guards, dead-letter queue, quarantine — nothing fails silently |
| Compute | Local machine / undefined | GitHub Actions on a **public** repo (unlimited free minutes on standard runners; private repos capped at 2,000 min/month) |
| Rollout | Batch-test at 528-scrip scale first | 5-stage gate process, starting at 49 scrips, each stage with explicit pass/fail criteria |

---

## 2. Functional & Non-Functional Requirements

### 2.1 Functional Requirements

| ID | Requirement |
|---|---|
| FR1 | Ingest statutory/structured data (ratings, pledging, insider trades, XBRL footnotes, shareholding, related-party transactions) for every listed scrip, incrementally |
| FR2 | Ingest qualitative concall commentary for scrips with earnings calls, incrementally |
| FR3 | Extract a defined forensic field set (see Section 5) with verbatim citation per LLM-derived field |
| FR4 | Maintain a full historical, append-only event log per scrip so trend signals (e.g. 3 consecutive quarters of rising pledge %) are queryable |
| FR5 | Every extracted record passes a quality gate before being usable downstream — nothing ships silently |
| FR6 | Support cross-quarter derived signals (guidance-vs-actual, capex delta) by injecting prior extraction as prompt context |
| FR7 | Support a single "360° view" query per scrip surfacing positive and negative signals, confidence-weighted |
| FR8 | Route failed/low-confidence extractions to a quarantine queue for review, never silently discard or silently accept |

### 2.2 Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR1 | Operate within free-tier ceilings indefinitely; degrade (defer, don't crash) when ceilings are approached |
| NFR2 | Respect source ToS and rate-limiting norms on every external dependency |
| NFR3 | Fail gracefully under quota exhaustion or upstream breakage — halt and resume, never crash mid-batch |
| NFR4 | Every ingestion step idempotent — re-running a job must never create duplicate events |
| NFR5 | No numeric field is exposed without passing sanity-bound and citation-veracity checks |
| NFR6 | Every field is traceable to source document, extraction engine, and confidence score |
| NFR7 | Maintainable by one person — pinned forks of external repos, no live dependency on third parties continuing to exist |
| NFR8 | Compute runs on free infrastructure (GitHub Actions, public repo) with no server to keep alive |

---

## 3. System Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  PUBLIC GITHUB REPO — unlimited free Actions minutes (standard runners)│
│                                                                          │
│  vendor/  (forked + commit-pinned, not live-installed)                 │
│    fundamental-screener/   (dvygo)      → Tier 0 ELT + event scoring   │
│    screener-finance/       (dhananjaym182) → Tier 0 peers/shareholding │
│    concall-parser/         (JS12540)    → Tier 1 PDF→text preprocessing│
│    concall-tracker-pattern/(psuyog910)  → Tier 3 scheduling pattern    │
│                                                                          │
│  custom/  (the actual differentiated IP)                               │
│    forensic_schema.py       → field definitions, bounds, citations     │
│    forensic_llm_router.py   → Gemini→Groq→OpenRouter waterfall         │
│    quality_audit.py         → sanity bounds, citation veracity, gate   │
│    circuit_breaker.py       → per-dependency failure isolation         │
│    budget_guard.py          → pre-emptive quota deferral               │
│                                                                          │
│  data/  (DuckDB + Parquet — schema-on-read, no server)                 │
│    raw/  extracts/  events/  quarantine/                               │
│                                                                          │
│  .github/workflows/  (the free scheduler)                              │
│    tier0-statutory-daily.yml                                           │
│    tier1-concall-weekly.yml                                            │
│    tier4-quality-audit-weekly.yml                                      │
└───────────────────────────────────────────────────────────────────────┘
```

### 3.1 Data flow

```
Tier 0 (statutory, deterministic) ─┐
Tier 1 (concall, LLM-assisted)  ───┼──► EVENT LOG (append-only)
                                     │
                                     ▼
                              QUALITY GATE
                    ┌────────────────┴────────────────┐
                    ▼                                  ▼
                 PASS → SERVING VIEW           FAIL → QUARANTINE
                (confidence-scored)             (review queue, Section 8)

All external calls wrapped in CIRCUIT BREAKERS (Section 7.1)
All LLM calls preceded by BUDGET GUARD checks (Section 7.2)
```

---

## 4. Component Specifications

### 4.1 Tier 0 — Statutory & Structured Data (deterministic, zero LLM cost)

**Sources:** BSE/NSE announcement feeds, XBRL filings, shareholding pattern filings, credit rating agency releases.  
**Built from:** forked `fundamental-screener` (ELT + landing zone) + `screener-finance` (peers, shareholding, ratios).  
**Output events:** `RATING_ACTION`, `SHAREHOLDING_CHANGE`, `INSIDER_TRADING`, `XBRL_FOOTNOTE_DISCLOSURE`, `BOARD_OUTCOME`, `LITIGATION`, `AUDITOR_CHANGE`, `KMP_ATTRITION`, `DILUTION_EVENT`, `RELATED_PARTY_TXN`.  
**Schedule:** daily, all scrips, `tier0-statutory-daily.yml`.  
**Cost:** $0 — no LLM involvement.  
**Idempotency:** SHA-256 content hash per filing; already-processed hashes skipped.

### 4.2 Tier 1 — Concall Qualitative Extraction (LLM-assisted, narrow scope)

**Sources:** official concall PDF (preferred) → BSE feed → YouTube subtitles → audio (last resort, confidence-penalized).  
**Built from:** forked `concall-parser` for PDF-to-text and Q&A structuring, feeding your custom `forensic_schema.py` + `forensic_llm_router.py`.  
**Retrieval:** BM25 micro-RAG across 7 consolidated query groups (Section 5.2), top-2 chunks each.  
**Prior-context injection:** last quarter's extraction pulled from the event log and injected into the prompt for cross-quarter fields (guidance accuracy, capex delta) — see Section 5.3.  
**Token budget:** ~3,000 tokens/scrip (retrieval + prompt + JSON output) — an 87% reduction vs. the ~24,000-token raw transcript, revised up from the original 900-token estimate to reflect the actual field count.  
**Schedule:** event-driven — fires only when a scrip has a new transcript since last run (hash check), not on a fixed calendar sweep.

### 4.3 Tier 2 — Fallback Transcript Acquisition

**Role:** minority-path only, for scrips with no official PDF/BSE-feed transcript.  
**Order:** Screener PDF → BSE feed → YouTube subtitle track (not audio download) → Gemini native audio (confidence-penalized, flagged `AUDIO_TRANSCRIBED`) → annual report MD&A as final fallback.  
**Design note:** every source below "official PDF" carries a confidence penalty that flows into the field's composite confidence score (Section 6).

### 4.4 Tier 3 — Incremental Scheduler & Orchestration

**Pattern borrowed from:** `concall-tracker`'s GitHub Actions cron design (proven in production as a zero-server-cost personal project).  
**Compute host:** **public** GitHub repo — standard runners are free and unmetered here; a private repo would cap at 2,000 minutes/month, which Tier 0's daily full-universe run would consume quickly at scale.  
**Logic:** Tier 0 runs daily for all scrips (cheap). Tier 1 runs only for scrips with a genuinely new transcript, checked via content hash — this is what keeps LLM spend proportional to actual new information rather than repeated re-processing of unchanged companies.

### 4.5 Tier 4 — Quality, Audit & Confidence Scoring

**Sanity bounds** (per field, Section 5.4), **citation veracity** (verbatim-overlap check against source text, <30% match → quarantine), **dual-model spot-check** (10% random sample, Gemini vs. Groq agreement on numeric fields, target ≥80% agreement), **provenance ledger** (source tier, engine, timestamps, scores) on every record.

---

## 5. Forensic Extraction Schema (FR3)

### 5.1 Field categories

| Category | Example fields | Source | Method |
|---|---|---|---|
| Growth & demand | order book visibility, demand tone, market share direction | Concall | LLM |
| Cost & margin | pass-through %, raw materials named, one-off items, hedging | Concall | LLM |
| Capacity & capex | capacity utilization, capex guidance + delta | Concall (+ prior context) | LLM |
| Capital allocation | dividend/buyback/debt stance, dilution events | Concall / BSE feed | LLM / rule-based |
| Governance & red flags | auditor change, KMP attrition, pledge trend, insider trades, litigation | BSE/NSE/XBRL | Rule-based (Tier 0) — highest asymmetric value, lowest cost |
| Competitive positioning | market share commentary, product/capacity launch specificity | Concall | LLM |

Governance/red-flag fields are deliberately Tier 0, not Tier 1 — they're rare but high-impact signals, and capturing them costs nothing extra once Tier 0 is running.

### 5.2 BM25 query groups (consolidated to control token spend)

```python
FORENSIC_QUERIES = {
    "growth_and_demand": "order book backlog, revenue visibility, demand outlook, and order inflow trend",
    "cost_and_pricing": "raw material cost inflation, pass-through ability, and pricing power versus customers",
    "capacity_and_capex": "capacity utilization, brownfield expansion, and capex plans",
    "guidance": "revenue and margin guidance for the year",
    "one_off_and_hedging": "one-time exceptional items and hedging of raw material or currency exposure",
    "capital_allocation": "dividend, buyback, and debt repayment priorities",
    "competitive_position": "market share versus competitors and competitive positioning",
}
```

### 5.3 Schema (`forensic_schema.py`)

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class ForensicExtraction(BaseModel):
    # --- Growth & demand ---
    orderBookVisibilityMonths: Optional[float] = Field(None, ge=1, le=60)
    orderBookCitation: Optional[str] = None
    demandCommentaryTone: Optional[Literal["strong", "stable", "muted", "deteriorating"]] = None
    demandCommentaryCitation: Optional[str] = None
    marketShareDirection: Optional[Literal["gaining", "stable", "losing", "not_discussed"]] = None
    marketShareCitation: Optional[str] = None

    # --- Cost & margin ---
    rawMaterialsNamed: Optional[list[str]] = None
    passThroughPct: Optional[float] = Field(None, ge=0, le=100)
    passThroughCitation: Optional[str] = None
    pricingPowerEvidence: Optional[str] = None
    hedgingPolicyDisclosed: Optional[bool] = None
    oneOffItemFlag: bool = False
    oneOffItemDescription: Optional[str] = None

    # --- Capacity & capex ---
    capacityUtilizationPct: Optional[float] = Field(None, ge=20, le=100)
    capacityCitation: Optional[str] = None
    capexGuidanceThisCallCr: Optional[float] = None

    # --- Cross-quarter fields (require prior-context injection, not retrieval) ---
    capexGuidancePriorQuarterCr: Optional[float] = None   # injected from event log
    capexDeltaFlag: Optional[Literal["on_track", "delayed", "accelerated", "not_comparable"]] = None
    revenueGuidanceThisCall: Optional[str] = None
    revenueGuidancePriorQuarter: Optional[str] = None       # injected
    guidanceAccuracyFlag: Optional[Literal["beat", "met", "missed", "not_comparable"]] = None

    # --- Capital allocation ---
    capitalAllocationStance: Optional[str] = None

    # --- Metadata (always populated) ---
    scripCode: str
    quarter: str
    sourceTierUsed: Literal["SCREENER_PDF", "BSE_FEED", "YT_SUBTITLE", "AUDIO_TRANSCRIBED"]
    engineUsed: Literal["gemini", "groq", "openrouter", "heuristic"]
    extractionTimestamp: datetime
    citationVeracityScore: Optional[float] = None
    confidenceScore: Optional[float] = None
```

### 5.4 Sanity bounds (enforced by Tier 4)

```python
SANITY_BOUNDS = {
    "orderBookVisibilityMonths": (1, 60),
    "passThroughPct": (0, 100),
    "capacityUtilizationPct": (20, 100),
}

CITATION_REQUIRED_FIELDS = [
    "orderBookVisibilityMonths", "demandCommentaryTone",
    "marketShareDirection", "passThroughPct", "capacityUtilizationPct",
]
```

### 5.5 Deferred to v3 (not in current gate criteria)

- `analystConcernThemes` — needs Q&A-specific chunking, distinct from management-commentary retrieval
- `commodityInputCorrelation` — needs a second joined data source (live commodity price feed)
- `managementCredibilityScore` — fully computed from accumulated `guidanceAccuracyFlag` history; only meaningful after 3–4 tracked quarters per scrip; a Stage 4+ concern, not Stage 2

---

## 6. Confidence Scoring Model

```
confidence = source_tier_weight × citation_veracity_score × cross_check_agreement (if sampled)

source_tier_weight:
  XBRL tagged numeric     = 1.0
  Official announcement   = 0.95
  Screener/exchange PDF   = 0.9
  LLM extraction (Gemini) = 0.7 base, adjusted by citation_veracity
  Audio-transcribed       = 0.55 base
```

Fields with confidence < 0.6 are shown in the serving view as "unverified," never presented with the same visual/numeric weight as a deterministic, source-tier-1.0 field. This keeps a hallucination-prone LLM field from being silently trusted as much as an XBRL-tagged number.

---

## 7. Failsafe Design

### 7.1 Circuit breaker (per external dependency: BSE, NSE, Screener, Gemini, Groq, OpenRouter)

```python
class CircuitBreaker:
    def __init__(self, threshold=3):
        self.failure_count = 0
        self.threshold = threshold
        self.state = "CLOSED"  # CLOSED | OPEN | HALF_OPEN

    async def call(self, fn, fallback):
        if self.state == "OPEN":
            return await fallback()
        try:
            result = await fn()
            self.failure_count = 0
            return result
        except Exception:
            self.failure_count += 1
            if self.failure_count >= self.threshold:
                self.state = "OPEN"
            return await fallback()
```
A tripped BSE breaker doesn't halt the pipeline — it falls through to NSE, then cached last-known-good, while the job continues.

### 7.2 Budget guard (pre-emptive, not reactive)

```python
async def check_budget_before_call(engine: str) -> str:
    usage = await get_usage_today(engine)
    if usage.requests >= SAFE_CEILING[engine] * 0.85:
        return "DEFER_TO_NEXT_RUN"
    return "PROCEED"
```
Stops cleanly before a 429, resumes on the next scheduled run — this replaces the v1 failure mode where quota exhaustion crashed the whole batch.

### 7.3 Dead-letter queue

A scrip failing extraction 3 times in a week moves to a manual-review list instead of retrying indefinitely — bounded retry budget, no silent infinite loop burning quota.

### 7.4 Rollback via supersession

The event log is append-only; a corrected batch is marked `superseded_by`, never deleted. Full historical auditability of what the system believed at any point in time is preserved.

---

## 8. Quarantine & Review Queue

```python
class QuarantinedRecord(BaseModel):
    scripCode: str
    fieldName: str
    extractedValue: str
    failureReason: Literal["SANITY_BOUND_VIOLATION", "CITATION_VERACITY_LOW", "CROSS_CHECK_DISAGREEMENT"]
    citationVeracityScore: Optional[float]
    sourceDocument: str
    quarantinedAt: datetime
    reviewStatus: Literal["PENDING", "ACCEPTED", "REJECTED", "CORRECTED"] = "PENDING"
    reviewedAt: Optional[datetime] = None
    reviewerNote: Optional[str] = None
```
Nothing that fails the quality gate is silently dropped or silently passed — it lands here with enough context (source document, failure reason, extracted value) for a five-minute manual check, and the resolution (`ACCEPTED`/`REJECTED`/`CORRECTED`) is itself an event in the log, closing the audit loop.

---

## 9. Stage-Gate Rollout Plan

| Stage | Scope | Builds | Gate to pass | If gate fails |
|---|---|---|---|---|
| **1** | 49-scrip portfolio | DuckDB lake, forked Tier 0 accelerators, dedup logic, `tier0-statutory-daily.yml` | 49/49 ingest on 3 consecutive daily runs; zero duplicate events on re-run; complete provenance on every event | Fix source adapter/dedup bug; do not proceed |
| **2** | Same 49 | `concall-parser` fork, `forensic_schema.py`, LLM router, quality gate | Citation veracity ≥0.75 avg on 20+ test extractions; zero unflagged sanity violations reach serving view; 10 manual spot-checks confirm accuracy | Tighten BM25 queries / extraction prompt before scaling |
| **3** | Same 49 (chaos test) | Circuit breakers, budget guard, dead-letter queue, dual-model spot-check | Simulated BSE outage → pipeline continues via fallback; simulated 85% quota → clean defer, no crash; dual-model agreement ≥80% | Do not skip — fix resilience gaps before real traffic |
| **4** | 528 priority scrips | Scale-out | Actions minutes tracked and sustainable; real RPM-bound timing measured (not assumed); dead-letter rate <5% of batch | Diagnose bottleneck class (rate limit / source availability / extraction quality) before adding scrips |
| **5** | Full universe (~3,554) | Scale-out | Stage 4 stable 2–4 consecutive weeks with no manual intervention beyond routine quarantine review | Hold at Stage 4 scale |

---

## 10. Weekly Quality Dashboard (what to actually watch)

- **Completeness**: % of scrips with a Tier 0 event this week vs. expected filing cadence
- **Confidence distribution**: share of served fields >0.8 vs. quarantined vs. shown-as-unverified
- **Citation veracity trend**: drifting down = router/prompt/model degradation signal
- **Dead-letter queue size**: steady growth = systematic problem, not noise
- **Actions minutes consumed**: trending toward any ceiling before it's hit

---

## 11. Open Items for Next Iteration

- Exact XBRL taxonomy element names for Ind AS 37/24 — verify against the official taxonomy business-rules document for the target filing year before hardcoding
- `analystConcernThemes` Q&A-specific chunking strategy
- `managementCredibilityScore` computation logic, once 3–4 quarters of `guidanceAccuracyFlag` history exist per scrip
- CI test suite to enforce Stage 1 gate criteria automatically rather than manual verification
