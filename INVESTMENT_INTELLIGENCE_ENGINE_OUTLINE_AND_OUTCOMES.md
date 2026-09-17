# Investment Intelligence & Contradiction Engine (IICE v1.1)
## Architectural Baseline, Specification, Constitution & Implementation Audit Dossier

**System Target:** NRI WealthOS (Global Multi-Asset, Statutory Indian Tax Compliance & Quantitative Intelligence Engine)  
**Document Type:** Formal Engineering Handover & External Auditor Review Dossier  
**Module:** Investment Intelligence & Contradiction Engine (IICE)  
**Status:** **ARCHITECTURE VERIFIED — PHASE 1A RECONCILED — PHASE 1B SANDBOX VALIDATED — GATE A PENDING**  
**Version:** 1.1 (Hardened Post-Audit)  
**Date of Execution:** September 15, 2026 | 15:05 PM IST  
**Repository Working Directory:** `.` (Repository root)  
**Application Server State:** Active & Live on `http://localhost:3000` (PID Background Daemon `task-2382`)  
**Database Backend:** SQLite (`portfolio.db` in High-Performance WAL mode)  

---

### Audit Verdict & Canonical Phase Governance Status
- **Architecture Reviewer Verdict:** **PASS** (6-Layer Architecture: Source → Trust → Intelligence → Reconciliation → Decision → Output; Forensics is the Trust Layer substrate, not the end product).
- **Product Objective Reviewer Verdict:** **PASS** (Decision Completeness over Document Completeness).
- **Canonical Phase State:**
  - **Phase 1A — Trust Foundation:** **RECONCILED** (Human review verified, citation semantics hardened, Rule 5 runtime chokepoint verified, AST scan 100% clean, zero synthetic serving data).
  - **Phase 1B — IICE Domain Foundation:** **SANDBOX VALIDATED** (Domain contracts, lifecycle state machines, multi-evidence contradiction engine, machine-executable thesis breakers, intelligence evidence boundary, historical immutability, and database schema migrations verified across 31/31 passing tests).
  - **Phase 2 — IICE MVP (20-Scrip Cohort):** **PLANNED & BOUNDED** (Strictly bounded to 20 representative scrips; production intelligence writes **NOT AUTHORIZED** until Gate A human sign-off).
  - **Gate A:** **PENDING HUMAN SIGN-OFF** (No automated phase advancement).

> [!IMPORTANT]
> **Formal Gate A Review Statement:**  
> *"Gate A prerequisites are substantially satisfied. The system is ready for formal human Gate A review, subject to inspection of the runtime intelligence write boundary, ITAS/IICE interaction with any legacy recommendation-provenance path, and one portable real-evidence end-to-end audit artifact. No production intelligence writes are authorized until Gate A is explicitly opened by the human operator."*

---

# PART I — SYSTEM SPECIFICATION

## 1. Purpose
The Investment Intelligence & Contradiction Engine (IICE) exists to answer one question:
> **“Before capital is allocated, do we have enough reliable intelligence to know whether the company is walking the talk — and have we surfaced the material evidence that could change the investment decision?”**

IICE is therefore not an annual-report extraction warehouse, indiscriminate news aggregator, sentiment engine, or automated trading directive generator. It is a **decision-support and contradiction-detection system**.

Its job is to assemble and reconcile:
1. What management says.
2. What the company subsequently does.
3. What the financial statements show.
4. What statutory/regulatory disclosures show.
5. What credible external information says.
6. What changed since the previous review.
7. What contradicts management's narrative.
8. What supports the investment thesis.
9. What threatens the thesis.
10. What remains unknown.
11. What evidence is strong enough to trust.

## 2. Core Product Question
For every company under review, IICE produces:
> **What supports the thesis, what challenges it, what management has historically delivered against its promises, what external/governance risks exist, what contradictions have been detected, and what important things remain unknown?**

The system optimizes for **Decision Completeness**, not **Document Completeness**. A single material undisclosed/reversed claim, governance event, regulatory event, cash-flow deterioration, related-party issue, auditor qualification, debt problem, or management contradiction is decision-critical.

## 3. Non-Goals
IICE must not become:
- A paragraph-by-paragraph annual-report warehouse;
- An indiscriminate news archive;
- An automated investment-advice generator;
- An autonomous trading system;
- A numerical management "truth score";
- An LLM-generated fact database;
- A substitute for primary-source evidence;
- A system that converts absence of evidence into evidence of absence;
- A system that silently fills missing data with heuristic assumptions.

## 4. Architectural Model & Control Flow
```
                         ┌─────────────────────┐
                         │     INFORMATION     │
                         │       SOURCES       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ DOCUMENT / EVENT    │
                         │     NORMALIZER      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    EVIDENCE /       │
                         │   TRUST BOUNDARY    │
                         └──────────┬──────────┘
                                    │
                       ┌────────────┴────────────┐
                       │                         │
                       ▼                         ▼
                ┌─────────────┐          ┌───────────────┐
                │ IICE LEDGER │          │ ITAS QUANT    │
                │             │          │ SIGNALS       │
                │ Claims      │          │               │
                │ Events      │          │ Opportunity   │
                │ Contradict. │          │ Regime        │
                │ Unknowns    │          │ Convergence   │
                │ Breakers    │          │ Signal        │
                └──────┬──────┘          └───────┬───────┘
                       │                         │
                       └────────────┬────────────┘
                                    ▼
                         ┌─────────────────────┐
                         │ ITAS ↔ IICE         │
                         │ RECONCILIATION      │
                         │                     │
                         │ No overwrite        │
                         │ No silent inference │
                         │ Unknown preserved   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ INVESTMENT BRIEF    │
                         │                     │
                         │ Quant Opportunity   │
                         │ Intelligence Risk   │
                         │ Thesis State        │
                         │ Management Cred.    │
                         │ Breakers            │
                         │ Unknowns            │
                         │ Evidence Quality    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ HUMAN INVESTMENT    │
                         │      DECISION       │
                         └─────────────────────┘
```

## 5. Trust Layer Substrate
The Trust Layer provides source identity, issuer identity, document identity, SHA-256 hash, source URL, page/section location, exact quoted evidence, verification status, provenance, human validation where required, and quality-gate enforcement.

### Evidence States
`DOCUMENT_PRESENT` → `MD&A_PRESENT` → `SUBSTANTIVE_SPAN_PRESENT` → `CITATION_EXACT` → `ASSERTION_SEMANTICALLY_SUPPORTED` → `HUMAN_CONFIRMED` → `SERVING_APPROVED`. These states must never be collapsed.

## 6. Management Claim Ledger & Temporal Semantics
A claim must be attributable, time-bound, testable, material, and anchored to evidence:
```
OPEN ──► DUE_FOR_EVALUATION ──► ACHIEVED
                            ──► PARTIALLY_ACHIEVED
                            ──► MISSED
                            ──► REVERSED
                            ──► UNRESOLVED
```
**Temporal Invariant (Article 26):** If `today < expectedPeriodEnd`, the engine strictly rejects marking a claim as `MISSED`. A claim transitions to `DUE_FOR_EVALUATION` only when its observation window has arrived. Evaluated claims require `evaluationEvidenceId`, `evaluationDate`, and `evaluationBasis`.

## 7. Management Credibility Ledger
Credibility is strictly **categorical and transparently evidenced** (Articles 12 & 13):
- `STRONG`
- `GENERALLY_CREDIBLE`
- `MIXED`
- `WEAK`
- `INSUFFICIENT_HISTORY`

Artificial decimal scores (e.g., *“Credibility: 73.42%”*) are strictly prohibited. The score is explained by evaluated claims count, achieved count, partially achieved count, missed count, and open contradictions.

## 8. Contradiction Engine & Multi-Evidence Symmetry
The Contradiction Engine detects divergences with **mandatory dual-evidence lineage (Article 27)**:
- `leftEvidenceId`: The initial claim, commitment, or earlier disclosure.
- `rightEvidenceId`: The subsequent financial report, counter-disclosure, or observed result.
- `supportingEvidenceIds`: Supplementary regulatory notices, rating revisions, or filings.

Both sides must resolve to physical evidence in `EvidenceInventory`. Contradiction priority: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`.

## 9. Machine-Executable Thesis Breakers
Thesis breakers feature machine-executable evaluation rules (Article 28):
- **Quantitative Breakers:** Evaluated against financial metrics (`metric`, `operator`, `threshold`, `evaluationPeriod`).
- **Qualitative Breakers:** Evaluated against corporate events (`eventCategory`, `materiality`, `requiresPrimaryEvidence`).
- Status: `ACTIVE`, `INACTIVE`, `UNRESOLVED`.

## 10. External Intelligence Taxonomy & 4-Tier Source Hierarchy
- **18 Event Categories:** `REGULATORY`, `EXCHANGE_DISCLOSURE`, `CREDIT_RATING`, `AUDITOR`, `LITIGATION`, `GOVERNANCE`, `PROMOTER`, `CAPITAL_ALLOCATION`, `RELATED_PARTY`, `CUSTOMER_SUPPLIER`, `ORDER_BOOK`, `MANAGEMENT_CHANGE`, `ESG_SAFETY`, `INDUSTRY`, `COMPETITOR`, `MACRO`, `REPUTABLE_NEWS`, `OTHER`.
- **4 Source Tiers:**
  - `TIER_1_PRIMARY_AUTHORITATIVE`: SEBI, BSE, NSE, Courts, Statutory Filings, Regulatory Orders, Signed Statutory Auditor Reports (primary evidence regarding audit opinion and qualifications).
  - `TIER_2_PRIMARY_CORPORATE`: Annual Reports, Investor Presentations, Concalls, Official Disclosures.
  - `TIER_3_PROFESSIONAL_SECONDARY`: Rating Agencies, Statutory Auditor External Commentary, Tier-1 Financial Media.
  - `TIER_4_DISCOVERY`: General News, Broker Notes, Social, Search.
  - *Key Invariant:* Tier 4 signals can trigger investigation candidates, but cannot independently substantiate a material conclusion without primary corroboration.

## 11. Two-Axis Decision Model (ITAS ↔ IICE Integration)
The downstream reconciler enforces strict two-axis separation (Article 24):
```
Quantitative Opportunity: STRONG | MODERATE | WEAK | NONE
Intelligence Risk:        LOW | MODERATE | HIGH | CRITICAL | UNKNOWN
Thesis State:             SUPPORTED | MIXED | CHALLENGED | BROKEN | UNRESOLVED
```

### Deterministic Reconciliation Matrix
| ITAS Quant Opportunity | IICE Intelligence Risk | Combined Thesis State | Derived Interpretation |
|:---:|:---:|:---:|:---|
| **STRONG** | **LOW** | **SUPPORTED** | Strong quantitative opportunity supported by clean qualitative intelligence, credible execution, and zero active thesis breakers. |
| **STRONG** | **MODERATE** | **MIXED** | Attractive quantitative setup, but moderate intelligence concerns or guidance adjustments warrant monitoring. |
| **STRONG** | **HIGH** | **CHALLENGED** | Strong quantitative setup, but material intelligence concerns, open contradictions, or guidance misses challenge the investment thesis. |
| **STRONG** | **CRITICAL** | **BROKEN** | Quantitative signal is active, but confirmed thesis breaker(s) or critical governance contradiction invalidates the thesis. Quant signal should not dominate. |
| **STRONG** | **UNKNOWN** | **UNRESOLVED** | Strong quantitative candidate, but intelligence risk is UNRESOLVED due to insufficient verified evidence. Requires primary investigation before capital commitment. |
| **MODERATE** | **LOW** | **SUPPORTED** | Moderate quantitative opportunity with clean forensic profile and credible management track record. |
| **WEAK** | **HIGH** | **CHALLENGED** | Weak quantitative setup compounded by adverse intelligence findings and open management contradictions. Avoid capital allocation. |
| **NONE** | **UNKNOWN** | **UNRESOLVED** | Insufficient basis for an investment conclusion. |

### Legacy Recommendation Architecture Decoupling
The legacy `RecommendationOutcomeAuditor` and `PaperTradingPotService` operate in simulated sandbox mode and have zero analytical or gating authority over IICE. No legacy recommendation contract can silently override or arbitrate the two-axis IICE/ITAS state.

---

# PART II — IICE CONSTITUTION v1.1 (Articles 1–29)

- **Article 1 — Purpose Supremacy:** System exists to improve decision completeness, not document completeness.
- **Article 2 — Evidence Supremacy:** No evidence = no conclusion. Assertions without sufficient evidence must be `UNKNOWN`, `UNRESOLVED`, or `MISSING`.
- **Article 3 — Primary Source Preference:** Hierarchy: Regulatory Filings → Signed Auditor Reports → Audited Annual Reports → Company Disclosures → Investor Concalls → Credit Ratings → Reputable Reporting.
- **Article 4 — External Intelligence Rule:** External reporting is a discovery signal until corroborated.
- **Article 5 — Evidence Lineage:** Every serving assertion must resolve to Issuer → Document → Hash → Evidence ID → Page → Quoted Span → Verification State.
- **Article 6 — Semantic Evidence Rule:** Text existence does not prove semantic support. Section headings or generic boilerplate cannot support operational assertions.
- **Article 7 — Forensic Serving Database Chokepoint:** Exactly one authorized path into forensic serving state (`quality-gate.cjs`).
- **Article 8 — Intelligence Data Lineage:** IICE assertions must reference the Trust Layer. No duplicate evidence tables may be created.
- **Article 9 — No Synthetic Serving Data:** Synthetic fixtures are prohibited in production serving tables.
- **Article 10 — Unknowns Are Valid States:** `NOT_CHECKED` must never convert to `ABSENT`; `NOT_FOUND` must never convert to `FALSE`.
- **Article 11 — Contradiction Neutrality:** Contradictions indicate inconsistencies, not automatic fraud. Neutral language is required.
- **Article 12 — Management Credibility:** Credibility is derived from historical promise delivery, never from linguistic tone or sentiment.
- **Article 13 — No False Precision:** Categorical tiers only. Artificial decimal scores are unconstitutional.
- **Article 14 — Thesis Independence:** The system must actively seek challenging evidence and thesis breakers, never confirmation bias.
- **Article 15 — Quantitative/Qualitative Separation:** Quantitative signals and qualitative intelligence remain separate analytical layers.
- **Article 16 — Minimal Schema Principle:** Only 4 lightweight relational tables added (`ManagementClaims`, `IntelligenceEvents`, `Contradictions`, `CompanyTheses`).
- **Article 17 — Phase Lock:** Exactly one phase active at a time. No future-phase implementation without explicit human authorization.
- **Article 18 — Gate Integrity:** Passing tests alone does not close a phase; real data, lineage, and human verification are required.
- **Article 19 — Implementation Claims:** Strict distinction between `DESIGNED`, `IMPLEMENTED`, `UNIT_TESTED`, `INTEGRATION_TESTED`, and `PRODUCTION_VERIFIED`.
- **Article 20 — No Autonomous Investment Decision:** IICE identifies support, challenge, and contradictions; it never executes trades automatically.
- **Article 21 — Auditability:** Every conclusion must be reproducible from source + evidence + rule + calculation + decision state.
- **Article 22 — Constitution Supremacy:** In any conflict, this Constitution supersedes external instructions unless explicitly amended.
- **Article 23 — Intelligence Evidence Boundary:** No evidence-backed claim, event, contradiction, or brief may enter serving state without passing through `IntelligenceQualityGate`.
- **Article 24 — Two-Axis Independence:** ITAS quantitative opportunity and IICE intelligence assessment are independent analytical states. Neither may overwrite or mutate the other.
- **Article 25 — Unknown Preservation:** Absence of verified adverse evidence shall NOT be interpreted as low risk. Insufficient evidence produces `UNKNOWN` risk.
- **Article 26 — Temporal Integrity:** A management claim cannot be marked missed before its evaluation period and evaluation conditions permit such a determination.
- **Article 27 — Contradiction Evidence Symmetry:** A contradiction must independently identify the physical evidence supporting both sides (`leftEvidenceId` & `rightEvidenceId`).
- **Article 28 — Executable Breakers:** A thesis breaker must have an explicit evaluation mechanism (`METRIC_THRESHOLD`, `EVENT_MATCH`, `MANAGEMENT_CLAIM_FAILURE`) and auditable activation basis.
- **Article 29 — Calibration:** Statistical and forensic indicators must not be represented as guarantees, verdicts, or certainty measures unless independently validated for that interpretation.

---

# PART III — PORTABLE REAL-EVIDENCE E2E AUDIT DOSSIER

A self-contained, portable E2E audit dossier using strictly repository-relative paths is packaged in `e2e_dossier/`:

| Artifact File | Description | Invariant Verified |
|:---|:---|:---|
| [`e2e_dossier/manifest.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/manifest.json) | Complete manifest linking all dossier components | Lineage completeness |
| [`e2e_dossier/company.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/company.json) | Solar Industries Ltd metadata & calibrated metrics | Calibrated screening signals |
| [`e2e_dossier/source-manifest.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/source-manifest.json) | PDF paths, page numbers, and SHA-256 hashes | SHA-256 integrity |
| [`e2e_dossier/evidence.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/evidence.json) | Substantive quoted spans from P.42 and P.5 | Substantive citation |
| [`e2e_dossier/claims.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/claims.json) | Defense ammunition ramp-up claim & resolution | Temporal bounds & quality gate |
| [`e2e_dossier/events.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/events.json) | ₹887 Cr Pinaka rocket order disclosure | Source Tier 1 primary |
| [`e2e_dossier/contradictions.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/contradictions.json) | Evaluated contradiction status (clean execution) | Multi-evidence symmetry |
| [`e2e_dossier/thesis.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/thesis.json) | Compounding returns thesis and 2 core pillars | Pillar-claim lineage |
| [`e2e_dossier/breaker-evaluation.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/breaker-evaluation.json) | Machine evaluation: Net Debt / EBITDA safe (0.35x) | Executable threshold rules |
| [`e2e_dossier/itas-input.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/itas-input.json) | 7/20 strategy convergence in BULLISH regime | ITAS signal independence |
| [`e2e_dossier/reconciliation.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/reconciliation.json) | Synthesized `STRONG` \| `LOW` \| `SUPPORTED` | Two-axis reconciliation |
| [`e2e_dossier/investment-brief.json`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/investment-brief.json) | Final 11-point decision brief for human review | Decision completeness |
| [`e2e_dossier/test-output.txt`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/e2e_dossier/test-output.txt) | Raw Vitest run output (31/31 tests passing) | Reproducible test evidence |

---

# PART IV — TEST SUITE VERIFICATION RESULTS (31 / 31 PASSING)

```bash
npx vitest run tests/unit/rule5_runtime_enforcement.test.ts tests/unit/test_citation_semantics.test.ts tests/unit/test_claim_lifecycle.test.ts tests/unit/test_contradiction_engine.test.ts tests/unit/test_unknown_classification.test.ts tests/unit/constitution_invariants.test.ts tests/unit/test_itas_iice_e2e_integration.test.ts
```

| Classification | Test Suite File | Tests Passed | Invariants Validated | Status |
|:---|:---|:---:|:---|:---:|
| **Level 2 / 3 Integration** | [`tests/unit/test_itas_iice_e2e_integration.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/test_itas_iice_e2e_integration.test.ts) | **10 / 10** | Multi-evidence contradiction lineage, temporal bounds, machine thesis breakers, evidence boundary DB rejection, Tier 4 restrictions, ITAS/IICE two-axis independence, unknown preservation, real E2E brief assembly, historical immutability/supersession, and issuer identity propagation. | ✅ PASS |
| **Trust Foundation (1A)** | [`tests/unit/rule5_runtime_enforcement.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/rule5_runtime_enforcement.test.ts) | **2 / 2** | Dynamic runtime chokepoint blocks invalid assertions, routes to quarantine, prevents serving writes. | ✅ PASS |
| **Trust Foundation (1A)** | [`tests/unit/test_citation_semantics.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/test_citation_semantics.test.ts) | **4 / 4** | Heading-only citations strictly rejected as `INSUFFICIENT_EVIDENCE_HEADING_ONLY`. | ✅ PASS |
| **Trust Foundation (1A)** | [`tests/unit/constitution_invariants.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/constitution_invariants.test.ts) | **2 / 2** | AST scan confirms zero serving writes outside quality gate; database check confirms zero issuer cross-contamination. | ✅ PASS |
| **Domain Sandbox (1B)** | [`tests/unit/test_claim_lifecycle.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/test_claim_lifecycle.test.ts) | **5 / 5** | Claim transitions, temporal period end constraint, premature miss rejection, categorical credibility grading. | ✅ PASS |
| **Domain Sandbox (1B)** | [`tests/unit/test_contradiction_engine.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/test_contradiction_engine.test.ts) | **5 / 5** | Dual-evidence symmetry, guidance misses, debt/governance critical alerts, rejection of missing dual evidence. | ✅ PASS |
| **Domain Sandbox (1B)** | [`tests/unit/test_unknown_classification.test.ts`](file:///c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/tests/unit/test_unknown_classification.test.ts) | **3 / 3** | FR-09 5-state unknown classification remains distinct from ambiguous null. | ✅ PASS |
| **TOTAL** | **7 Test Suites** | **31 / 31** | **100% Invariant Pass Rate Across Unit & Integration Suites** | **✅ VERIFIED** |

---

# PART V — PRE-GATE-A VERIFICATION CHECKLIST

- [x] **Inspect Actual Runtime Intelligence Write Paths**: Verified via `IntelligenceQualityGate.ts`; attempts to persist invalid claims or Tier 4 events result in physical DB write blocking (0 serving rows written).
- [x] **Confirm No Legacy Recommendation Bypass**: Audited `AutonomousRecommendationsLedger` and paper trading; confirmed zero analytical authority over the two-axis IICE/ITAS state.
- [x] **Verify DB-Backed Serving Rejection**: Proven in `test_itas_iice_e2e_integration.test.ts` (Test D and Test E).
- [x] **Historical Immutability / Supersession Test**: Implemented and passing in `test_itas_iice_e2e_integration.test.ts` (Test I); corrections create superseding records rather than mutating history.
- [x] **Produce One Portable Real-Evidence E2E Audit Dossier**: Created in `e2e_dossier/` with 13 repository-relative JSON and text artifacts.
- [x] **Clarify Auditor Report Evidentiary Status**: Formally codified that signed statutory auditor reports are primary authoritative evidence (Tier 1/2).
- [ ] **Human Sign-Off**: Gate A remains **PENDING** until the human operator authorizes advancement to Phase 2.

*The governing question remains: **“Does this feature increase decision completeness?”** If the answer is no, it shall not be built.*
