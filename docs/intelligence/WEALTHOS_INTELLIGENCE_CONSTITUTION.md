# WealthOS Company Intelligence Constitution

**Version:** 1.0.0  
**Effective Date:** 29 September 2026  
**Status:** BINDING on all intelligence engines, adapters, assemblers, orchestrators, and UI surfaces.

---

## 1. The Core Product Objective

> **Single Product Objective:**  
> For any supported Indian listed company, WealthOS must construct a point-in-time, evidence-backed representation of the company; independently analyse its business, financial performance, management commitments, valuation, market/technical behaviour, and material changes; identify supported contradictions and uncertainties; and synthesize those facts into a concise company-intelligence view **without inventing facts, motives, causality, forecasts, or unsupported conclusions**.

Everything in the WealthOS intelligence stack exists solely to fulfill this objective.

---

## 2. Master System Architecture

```
┌────────────────────────────────────────────────────────┐
│                   SOURCE DOCUMENTS                     │
│  NSE/BSE Filings · Annual Reports · Quarterly Results  │
│  Earnings Transcripts · Fundamental Data · Upstox/TL   │
│  Daily Adjusted Prices · Ownership/SAST · Corp Events  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          CANONICAL EVIDENCE & FACT LAYER               │
│                                                        │
│  • SecurityIdentity (ISIN canonical, Symbol/BSE alias) │
│  • EvidenceRef (Source, Document, Period, Hash)        │
│  • CanonicalFact (Metric, Value, Unit, Period, PIT)    │
│  • ManagementCommitment (Extracted measurable claims)  │
│  • CompanyEvent (Ledger of verified corporate actions) │
│  • DataCoverageEngine (Field-level completeness)       │
└───────────────────────────┬────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌──────────────────┐┌──────────────────┐┌──────────────────┐
│   Fundamental    ││ Business Driver  ││  Walk-the-Talk   │
│   Trajectories   ││   Bridging to    ││ Commitment vs    │
│  (6 Qs, No Adjs) ││    Economics     ││ Actual Outcome   │
└────────┬─────────┘└────────┬─────────┘└────────┬─────────┘
         │                   │                   │
         ├───────────────────┼───────────────────┤
         ▼                   ▼                   ▼
┌──────────────────┐┌──────────────────┐┌──────────────────┐
│    Valuation     ││    Technical     ││  Contradiction   │
│  3 Lenses (Abs,  ││  Market State    ││ 2 Evidenced      │
│   Hist, Relative)││  (3 Horizons)    ││ Propositions     │
└────────┬─────────┘└────────┬─────────┘└────────┬─────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
┌────────────────────────────────────────────────────────┐
│               SAFETY & CONSISTENCY GATES               │
│                                                        │
│  • AssertionValidator (Support level verification)    │
│  • ClaimSafetyGate (Strips speculation/motive/fraud)   │
│  • CrossModuleConsistencyValidator (Metric coherence)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 SYNTHESIS & REASONING                  │
│                                                        │
│  • Thesis (Supported, Challenged, Unknown pillars)     │
│  • Material Changes & Attention Items                  │
│  • Explicit Uncertainty Engine (Known, Derived, etc.)  │
│  • Immutable Snapshot Comparison (CompanyDelta)        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                    USER EXPERIENCE                     │
│                                                        │
│  • Overview (Executive synthesis & decision landing)   │
│  • Evidence Drill-down (Clickable provenance on facts) │
│  • Domain Modules (Deep-dive tabs)                     │
│  • Timeline Ledger (True event history)                │
│  • Read-only GET / Idempotent POST Refresh             │
└────────────────────────────────────────────────────────┘
```

---

## 3. Fundamental Articles of the Constitution

### Article C1 — Evidence Before Conclusion
Every factual assertion and derived proposition produced by WealthOS must resolve to an explicit, verifiable `EvidenceRef`:

```typescript
export interface EvidenceRef {
  evidenceId: string;
  sourceType: 'EXCHANGE_FILING' | 'ANNUAL_REPORT' | 'EARNINGS_TRANSCRIPT' | 'PRICE_RECORD' | 'REGULATORY_DISCLOSURE' | 'CORPORATE_ACTION';
  sourceName: string;
  sourceUrl?: string | null;
  documentDate: string;        // YYYY-MM-DD
  availableAt: string;         // ISO timestamp when publicly accessible
  periodStart?: string | null;
  periodEnd?: string | null;
  page?: number | null;
  section?: string | null;
  quote?: string | null;
  extractionMethod: 'MANUAL_AUDITED' | 'STRUCTURED_XBRL' | 'PARSED_REGEX' | 'LLM_EXTRACTED_VERIFIED';
}
```
**Invariant:** If no `EvidenceRef` exists, no factual assertion may be made. "Absence of evidence" must never be translated into positive or negative factual claims.

---

### Article C2 — Observation Is Not Interpretation
WealthOS strictly separates what was observed from how it might be interpreted. All statements produced must declare their `StatementKind`:

```typescript
export type StatementKind =
  | 'FACT'              // Directly witnessed in primary source (e.g. "MF holding is 0.00%")
  | 'DERIVED_FACT'      // Computed mathematically from facts (e.g. "PAT grew 30.26% YoY")
  | 'MANAGEMENT_CLAIM'  // Statement by company management (e.g. "Targeting 20% revenue growth in FY27")
  | 'INTERPRETATION'    // Analytical inference based on facts (e.g. "Trades at a discount to peer median")
  | 'HYPOTHESIS'        // Potential thesis to be tested by future data
  | 'UNKNOWN';          // Missing or unverified data
```

#### Grounding Examples:
* **Allowed:** "Mutual fund holding is 0.00%."  
  **Forbidden:** "Institutional investors distrust the company."
* **Allowed:** "Four proprietary trading firms executed substantial same-day buy and sell transactions on September 1."  
  **Forbidden:** "The float is being manipulated by operators."
* **Allowed:** "Two senior management personnel resigned in September 2026."  
  **Forbidden:** "Management crisis is developing."
* **Allowed:** "Current P/E of 23.1x is 46% lower than peer median P/E of 43.1x."  
  **Forbidden:** "The stock is obviously undervalued and deserves rerating."

---

### Article C3 — Evidence Strength & Assertion Hierarchy
Every synthesized proposition in the system must conform to `IntelligenceAssertion`:

```typescript
export interface IntelligenceAssertion {
  id: string;
  text: string;
  kind: StatementKind;
  evidenceRefs: EvidenceRef[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  support: 'DIRECT' | 'DERIVED' | 'CORROBORATED' | 'WEAK' | 'UNSUPPORTED';
  limitations: string[];
  asOfDate: string;
}
```

**Critical Invariant:** Any assertion with `support: 'UNSUPPORTED'` or `support: 'WEAK'` **MUST NEVER** enter the Thesis, Overview, Attention Items, or Contradictions modules. It must either be dropped or categorized as `UNKNOWN`.

---

### Article C4 — Canonical Data Hierarchy & Identity
1. **Canonical Hierarchy:**  
   `RAW SOURCE` ➔ `SOURCE SNAPSHOT` ➔ `CANONICAL FACT` ➔ `VERIFIED FACT` ➔ `ANALYTICAL ENGINE`
2. **Security Identity:**  
   The primary key for any entity is `isin` (or `securityId`). NSE symbol and BSE code are non-canonical aliases that can change over time.
3. **No Direct Engine Scraping:** Engines must never reach directly into unstandardized raw JSON or third-party endpoint dumps without passing through the canonical fact and identity layer.

---

### Article C5 — Meaningful Field-Level Data Coverage
1. The presence of API responses (e.g., "8 fundamental snapshots") does **NOT** equal complete data.
2. Coverage must be computed per required financial and operational field (Revenue, PAT, EBITDA, CFO, Receivables, Debt, ROCE, Segment Mix, Historical Series).
3. Statuses: `COMPLETE`, `SUFFICIENT`, `PARTIAL`, `INSUFFICIENT`, `SOURCE_UNAVAILABLE`, `STALE`, `CONFLICTED`.
4. `DATA_INSUFFICIENT` is an acceptable and honest analytical result, never an engineering failure.

---

### Article C6 — Engine Boundaries & Responsibilities

1. **Fundamental Engine:** Answers only 6 factual questions (growth, profitability, returns on capital, cash conversion, balance sheet strength, material delta). Generates trajectories and multi-period series, never isolated adjectives ("great company").
2. **Business Driver Engine:** Identifies economic drivers (Pricing, Volume, Mix, Capacity, Order Book) with direction, magnitude, and direct evidence.
3. **Management Walk-the-Talk Engine:** Tracks measurable commitments against subsequent verified filings. Statuses: `ACHIEVED`, `ON_TRACK`, `PARTIALLY_ACHIEVED`, `MISSED`, `REVISED`, `NOT_YET_DUE`, `NOT_MEASURABLE`, `INSUFFICIENT_EVIDENCE`.
4. **Contradiction Engine:** Requires two independently evidenced facts. Possible explanations must be labelled as `possibleExplanations`, never as factual reasons.
5. **Technical Engine:** Describes market state across 3 distinct horizons (Short, Medium, Long) with exact timestamps (`calculatedAt`, `priceAsOf`, `lookbackWindow`, `sourceSeriesHash`). Never predicts future prices or claims price levels "will hold".
6. **Valuation Engine:** Reports 3 distinct lenses: Absolute, Historical, and Relative. Avoids declaring stocks "cheap" or "expensive" without explicit qualifying metrics.
7. **Thesis Engine:** Synthesizes evidence into Supported, Challenged, and Unknown pillars. Every pillar must be clickable to underlying canonical evidence.
8. **Timeline Engine:** Operates as a true historical ledger of verified corporate events (`CompanyEvent`).
9. **Delta Engine:** Derives changes solely by diffing two immutable `CompanyIntelligenceSnapshot` payloads. Never manufactures artificial history by running refresh on identical data.

---

### Article C7 — Runtime & Operational Invariants

1. **Strictly Read-Only GET:**  
   `GET /api/company-intelligence/:symbol` and `GET /api/scrip-intelligence/:symbol` MUST NEVER perform database writes, mutations, or cache updates.
2. **Idempotent Refresh:**  
   `POST /api/company-intelligence/:symbol/refresh` is the sole entry point for data acquisition, normalization, and snapshot persistence. Two refreshes on the identical underlying evidence must produce identical analytical hashes.
3. **Zero Runtime DDL:**  
   No `CREATE TABLE`, `ALTER TABLE`, or dynamic schema migration may execute inside runtime API requests.
4. **Claim Safety Gate:**  
   Every engine output passes through `ClaimSafetyGate` before reaching Overview, Thesis, or UI presentation, stripping speculative motives, fraud allegations, and unsupported superlatives.
5. **Cross-Module Consistency:**  
   If a metric (e.g., ROCE = 26.69%) appears in Fundamentals, it must match identically across Business Drivers, Thesis, and Valuation, or the discrepancy must be flagged.
