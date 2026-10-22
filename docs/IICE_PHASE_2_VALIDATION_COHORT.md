# IICE Phase 2: 20-Company Real-World Validation Cohort Specification

**Canonical Status:** GATE A PASSED — PHASE 2 ACTIVE  
**Authorization Date:** September 15, 2026  
**Authorized By:** Human Operator  
**Operational Rule:** Architectural redesign is strictly frozen. No production intelligence writes authorized. Execution is bounded to the 20-company cohort to validate real-world evidence heterogeneity.

---

## 1. Executive Summary & Objective

Phase 2 moves IICE from sandbox/pilot validation into a bounded, real-world empirical test across 20 representative Indian equities. The core question Phase 2 answers is:

> **"Does IICE produce materially useful, evidence-grounded investment intelligence on a small representative cohort under heterogeneous real-world disclosure conditions?"**

To prevent "selection bias" (choosing only companies where clean reports make the engine look good), this cohort is intentionally structured with challenging failure modes, sparse disclosures, guidance misses, high leverage, and adverse corporate events.

---

## 2. The 20-Company Cohort Matrix

The cohort is partitioned into 4 distinct validation batches of 5 companies each:

### Batch 1: Benchmark Clean & Growth Leaders (Baseline Verification)
Validates that well-governed, clean-delivery companies receive high credibility without artificial contradiction generation.

| # | Symbol | Company Name | Segment / Board | Key Test Objective |
|---|---|---|---|---|
| 1 | `SOLARINDS` | Solar Industries India Ltd | LargeCap (Main Board) | Defense order book scaling; pristine balance sheet baseline |
| 2 | `ARVSMART` | Arvind SmartSpaces Ltd | SmallCap (Main Board) | Asset-light plotted real estate delivery; low leverage check |
| 3 | `NOVARTIND` | Novartis India Ltd | MidCap (MNC Healthcare) | MNC corporate governance; high dividend payout vs thin concall guidance |
| 4 | `BAJAJHLDNG`| Bajaj Holdings & Investment | LargeCap (Conglomerate) | Pure holding company NAV dynamics; near-zero operational promises |
| 5 | `UNOMINDA` | UNO Minda Ltd | LargeCap (Auto Ancillary) | High-growth EV kit value transition claims vs OEM order realization |

---

### Batch 2: Execution Delays, Capex & Guidance Misses
Validates that when management guidance lags actual financial results, the engine accurately transitions claims to `MISSED` / `PARTIALLY_ACHIEVED` and generates `CLAIM_VS_RESULT` contradictions.

| # | Symbol | Company Name | Segment / Board | Key Test Objective |
|---|---|---|---|---|
| 6 | `VMART` | V-Mart Retail Ltd | MidCap (Consumer Retail) | Retail store expansion promises vs margin compression & store closures |
| 7 | `TATATECH` | Tata Technologies Ltd | MidCap (ER&D Tech) | Post-IPO margin and TCV deal guidance vs global auto slowdown |
| 8 | `HINDCOPPER` | Hindustan Copper Ltd | MidCap (Govt CPSE) | Long-delayed mine expansion capex claims vs statutory delays |
| 9 | `SCI` | Shipping Corp of India | MidCap (Govt CPSE) | Disinvestment timeline promises vs regulatory/statutory deferrals |
| 10 | `BOROLTD` | Borosil Ltd | SmallCap (Consumer Glass) | Capex commissioning timeline vs temporary margin headwinds |

---

### Batch 3: High Leverage, Working Capital & Governance Stress
Validates that quantitative leverage breakers trigger accurately, off-balance-sheet liabilities surface, and adverse regulatory actions are flagged.

| # | Symbol | Company Name | Segment / Board | Key Test Objective |
|---|---|---|---|---|
| 11 | `PURVA` | Puravankara Ltd | SmallCap (Real Estate) | High leverage developer; Net Debt / EBITDA breaker sensitivity test |
| 12 | `STLNETWORK` | Sterlite Technologies Ltd | SmallCap (Telecom Cables) | High debt reduction promises vs repeated guidance revisions & cash flow squeeze |
| 13 | `SENCO` | Senco Gold Ltd | SmallCap (Retail Jewelry) | Working capital bank limits & gold metal loan reliance vs store expansion claims |
| 14 | `GMDCLTD` | Gujarat Mineral Dev Corp | MidCap (State CPSE) | Regulatory/environmental clearance dependencies on rare earth & lignite projects |
| 15 | `360ONE` | 360 ONE WAM Ltd | MidCap (Wealth Management)| SEBI regulatory inquiries, AUM flow disclosures, and fee yield compression |

---

### Batch 4: Thin Disclosure, SME & Structural Distress
Validates that when evidence is absent or difficult to retrieve, the system **honestly marks intelligence risk as `UNKNOWN`** rather than fabricating false confidence, and flags broken theses on distressed companies.

| # | Symbol | Company Name | Segment / Board | Key Test Objective |
|---|---|---|---|---|
| 16 | `MANORAMA` | Manorama Industries Ltd | MicroCap / SME Emerge | Thin concall disclosure; relies primarily on annual report MD&A |
| 17 | `IKIO` | IKIO Lighting Ltd | SmallCap (ODM Electronics) | Customer concentration contradiction test (Signify/Philips dependence vs diversification) |
| 18 | `THOMASCOOK`| Thomas Cook India Ltd | SmallCap (Travel & Forex) | Post-restructuring debt recovery claims vs pandemic restructuring legacy |
| 19 | `RPGLIFE` | RPG Life Sciences Ltd | SmallCap (Pharma / API) | USFDA / CDSCO inspection outcome testing vs clean domestic track record |
| 20 | `KAVVERITEL` | Kavveri Telecom Products | MicroCap / Distressed | Past insolvency / forensic red flag test: verifies thesis state resolves to `BROKEN` |

---

## 3. Strict Phase 2 Operating Invariants

1. **No Code Redesigns**:
   `IntelligenceQualityGate`, `ClaimLedgerService`, `ContradictionEngine`, `ThesisBreakerEngine`, and `ItasIiceReconciliationService` operate strictly as verified in Gate A.
2. **Dual-Axis Integrity**:
   ITAS quantitative opportunity and IICE intelligence risk remain strictly decoupled for every scrip.
3. **Zero Synthetic Serving Data**:
   Every claim, event, and contradiction must have a primary evidence span pointing to a real filing with SHA-256 hash and physical page number.
4. **Append-Only Immutability**:
   Historical claim records cannot be mutated in place; evaluation outcomes append superseding resolution records.
5. **Dossier Outputs**:
   For each of the 20 companies, a reproducible audit dossier is assembled with the complete 11-point Investment Intelligence Brief.
