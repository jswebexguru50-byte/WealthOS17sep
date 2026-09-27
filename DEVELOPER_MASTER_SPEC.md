# WealthOS Developer Master Implementation Specification

## 1. Final Architectural Principle

**WealthOS IS NOT:**
*   a forensic application
*   a stock-scoring application
*   a DCF calculator
*   a technical screener
*   an AI stock picker

**WealthOS IS:**
*   **an evidence-backed investment decision platform.**

**Its job is to continuously answer:**
1. WHAT companies are becoming economically better?
2. WHY are they becoming better?
3. HOW LARGE could the change become?
4. IS management actually delivering?
5. ARE profits translating into cash and returns on capital?
6. WHAT is already priced into the stock?
7. WHAT risks could destroy the thesis?
8. WHEN does price/volume offer an interesting setup?
9. WHAT has changed since the investment was made?
10. WHAT evidence would prove the original thesis wrong?

---

## 2. Core Data Architecture & Schemas

Do not create isolated engine silos. There is **one canonical investment-data platform**. Every engine consumes the exact same facts, evidence, events, and thesis states.

### A. Canonical Fact Layer (`CompanyFact`)
*Rule: Do not invent missing data. No numeric `confidence` scores. Separate missing data from scenarios.*

```typescript
interface CompanyFact {
  factId: string;
  companyId: string;
  symbol: string;
  isin?: string;

  metric: string;
  value: number | string | boolean | null;
  unit?: string;
  currency?: 'INR' | 'USD' | null;

  periodType: 'INSTANT' | 'QUARTER' | 'TTM' | 'ANNUAL' | 'EVENT';
  periodStart?: string;
  periodEnd?: string;
  asOfDate: string;
  reportedAt?: string;

  factType: 'REPORTED' | 'DERIVED' | 'MANAGEMENT_GUIDANCE' | 'EXTERNAL_ESTIMATE' | 'ASSUMPTION' | 'SCENARIO' | 'MISSING';
  sourceType: 'PRIMARY' | 'STRUCTURED_SECONDARY' | 'DERIVED' | 'USER_INPUT';
  
  provider?: string;
  sourceDocumentId?: string;
  sourceUrl?: string;
  evidenceText?: string;
  evidencePage?: number;

  verificationStatus: 'PRIMARY_VERIFIED' | 'SECONDARY_VERIFIED' | 'UNVERIFIED' | 'CONFLICTING' | 'NOT_APPLICABLE';

  parentFactIds?: string[];
  calculationMethod?: string;
  
  fetchedAt: string;
  freshnessTtlDays?: number;
}
```

### B. Business Inflection Engine (`BusinessEvent`)
Tracks the mechanisms that could drive earnings changes before they hit the financial statements.

```typescript
interface BusinessEvent {
  eventId: string;
  companyId: string;

  eventType: 'CAPACITY_EXPANSION' | 'CAPACITY_COMMISSIONED' | 'ORDER_WIN' | 'ORDER_CANCELLED' | 'NEW_PRODUCT' | 'NEW_CUSTOMER' | 'EXPORT_EXPANSION' | 'REGULATORY_APPROVAL' | 'ACQUISITION' | 'DIVESTMENT' | 'DEBT_REDUCTION' | 'FUND_RAISE';
  announcedAt: string;

  amount?: number;
  capacityChange?: number;
  expectedRevenueImpact?: number;
  expectedCompletion?: string;
  actualCompletion?: string;

  sourceDocumentId: string;
  evidenceText: string;

  status: 'ANNOUNCED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'CANCELLED';
}
```

### C. Management Intelligence (`ManagementCommitment`)
Tracks "Walk-the-Talk". Avoids subjective CEO credibility scores.

```typescript
interface ManagementCommitment {
  commitmentId: string;
  companyId: string;
  statementDate: string;
  statement: string;

  category: 'REVENUE' | 'MARGIN' | 'CAPACITY' | 'CAPEX' | 'ORDER_BOOK' | 'DEBT' | 'EXPORT' | 'PRODUCT' | 'CASH_FLOW' | 'OTHER';
  metric?: string;
  targetValue?: number;
  targetUnit?: string;
  targetPeriod?: string;
  actualValue?: number;

  sourceDocumentId: string;
  evidenceText: string;
  verificationEvidenceIds?: string[];

  status: 'PENDING' | 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'MISSED' | 'DELAYED' | 'WITHDRAWN';
}
```

### D. Financial Quality / Guardrails (`RiskSignal`)
Surfaces investigations rather than mechanical sell signals.

```typescript
interface RiskSignal {
  signalType: string;
  severity: 'INFO' | 'WATCH' | 'HIGH' | 'CRITICAL';
  detectedAt: string;

  observedFacts: string[];
  calculation?: string;
  possibleExplanations: string[];
  managementExplanation?: string;
  evidenceIds: string[];

  status: 'NEW' | 'UNDER_REVIEW' | 'EXPLAINED' | 'PERSISTING' | 'RESOLVED';
  nextReviewDate?: string;
}
```

### E. Multibagger Discovery (`GrowthInflection`)
Output contract for earnings acceleration, margin expansion, and operating leverage.

```typescript
type SignalState = 'STRONG' | 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'INSUFFICIENT_DATA';

interface GrowthInflection {
  revenueYoYQ: number | null;
  revenueGrowthTTM: number | null;
  revenueCagr3Y: number | null;
  revenueCagr5Y: number | null;

  ebitdaYoYQ: number | null;
  ebitdaGrowthTTM: number | null;
  patYoYQ: number | null;
  patGrowthTTM: number | null;
  patCagr3Y: number | null;
  epsGrowthTTM: number | null;

  revenueAcceleration: SignalState;
  earningsAcceleration: SignalState;
  marginExpansion: SignalState;
  operatingLeverage: SignalState;
  roceImprovement: SignalState;
  balanceSheetImprovement: SignalState;
}
```

---

## 3. The 12-Phase Implementation Sequence

*Do not build independent silos. Do not build Phase 11 until the underlying data is trustworthy. Do not skip testing.*

**PHASE 0: Freeze known-good infrastructure**
*   Trendlyne MCP feed / S1-S12 / Current pilot.

**PHASE 1: Canonical Fact + Evidence Layer**
*   Implement `CompanyFact` DB schema.
*   Token discovery and verification exercise for Trendlyne parameters. Do not assume mappings without API verification.

**PHASE 2: Financial History + Derived Metrics**
*   Calculate ~370 derived universe metrics (YoY, CAGR, ROIC, Working Capital) cleanly mapped from Phase 1.

**PHASE 3: Multibagger Discovery Engine**
*   Implement `GrowthInflection` engine. Output `SignalState` evaluations (e.g., 4 consecutive quarters of YoY PAT growth = `STRONG`).

**PHASE 4: Business Inflection + Document Intelligence**
*   Implement `BusinessEvent` extractor (capacity, order book).

**PHASE 5: Management Commitment / Walk-the-Talk**
*   Implement `ManagementCommitment` schema and status tracking.

**PHASE 6: Valuation + Expectations + Peer Comparison**
*   **Reverse DCF:** "Market price implies X% growth."
*   **Peer Context:** Contrast stock ROCE against direct peers.
*   **Scenario Ranges:** Bear/Base/Bull valuations. Leave missing inputs as `MISSING` and substitute strictly at the `SCENARIO` level.

**PHASE 7: Risk / Divergence Guardrails**
*   Refactor `ForensicScoringService.ts` to output `RiskSignal` (e.g., "Investigate inventory build" rather than "Score = 12").

**PHASE 8: Thesis Engine**
*   Build structured thesis record (`WHY INTERESTING`, `EARNINGS PATH`, `CATALYSTS`, `RISKS`, `WHAT MUST GO RIGHT`).

**PHASE 9: Fundamental × Technical Convergence**
*   Intersect Phase 3 (Discovery) with S1-S12 setups.

**PHASE 10: Portfolio Intelligence**
*   The "What changed since I bought?" engine. Compare purchase-time thesis vs. now.

**PHASE 11: Opportunity Radar + Company Cockpit**
*   Consolidate UI components.

**PHASE 12: Full-universe rollout + calibration**
*   Scale beyond 10 pilot stocks to ~1000 Indian equities.
