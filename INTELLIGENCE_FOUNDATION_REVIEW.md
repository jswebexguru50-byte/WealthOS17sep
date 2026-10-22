# WealthOS Integrated Intelligence Foundation — Reviewer Dossier

**Programme:** WEALTHOS Integrated Intelligence Migration  
**Phase:** `WEALTHOS_INTEGRATED_INTELLIGENCE_FOUNDATION` (Waves 1 & 2)  
**Evaluation Date:** 2026-09-28  
**Repository Branch:** `ai-review`  
**Constitution Status:** STRICT FAIL-CLOSED COMPLIANT  

---

## 1. Executive Summary

This deliverable executes the migration-and-integration programme over existing WealthOS subsystems. **No greenfield rebuild occurred.** 

### Core Architectural Objective
> Unify the seven-strategy reports (S1a, S1b, S2a, S3a, S4a, S4b, S5a), Trendlyne raw/canonical facts (`company_facts`), FERE evidence database (`fere_evidence.db`), DuckDB adjusted OHLCV (`ohlcv.duckdb`), and sector momentum/flow services into one truthful, evidence-backed intelligence architecture, accessible via the canonical `#analyze/:symbol` route.

### What Was Delivered
1. **Immediate P0 Truth Closure:** Complete removal of all synthetic/fabricated/default values across scanner, dossier, Trendlyne intelligence, Smart Money, adapters, and UI components.
2. **Canonical Shared Contracts:** 8 strictly typed contract modules defining analysis modules, fail-closed data statuses, evidence references, fact envelopes, and execution sessions.
3. **Canonical Evidence Repository:** Read-only `AnalysisEvidenceRepository` reading existing data stores without duplication or database mutation.
4. **Identity Migration:** Extended `SecurityIdentityRegistry` supporting multi-segment securities, elimination of synthetic IDs, and race-free initialization.
5. **Audits & Matrices:** Comprehensive capability baseline, capability matrix, and QGLP coverage reports in both JSON and Markdown formats.
6. **Automated Verification:** Unit tests for contracts and evidence repository passing 100%; static audit gate passing with `SYNTHETIC_PRODUCTION_DATA_GATE=PASS`.

---

## 2. P0 Truth Closure Audit

The following table documents every confirmed synthetic/default issue and the exact engineering fix applied:

| File | Confirmed Issue | Resolution / Engineering Change |
|---|---|---|
| `src/server/services/OpportunityScannerEngine.ts` | `fundScore \|\| 50`<br>benchmark fallback `\|\| 2.5`<br>synthetic ternary guesses for `rsi`, `bandwidth`, `relVol` in broad market scan | Replaced with strict null handling. Real zero remains zero; missing factor produces `DATA_INSUFFICIENT` and is excluded from active weight calculation. Synthetic ternary guesses purged. |
| `src/server/services/TechnicalAnalysisEngine.ts` | Pivot-derived bull/base/bear "targets" presented without clear distinction | Renamed to `TECHNICAL_PIVOT_DERIVED` scenarios with explicit formula methodology, non-consensus disclaimers, and clear indication that they are mathematical scenarios, not analyst forecasts. |
| `src/server/services/TrendlyneIntelligenceService.ts` | Synthesized DVM, hardcoded momentum lists (`['SOLARINDS', ...]`), PE fallback `\|\| '30'`, synthetic analyst targets (`cmp * 1.14`) | Removed synthesized DVM. Sourced directly from verified raw snapshots and canonical facts. Purged hardcoded momentum arrays. PE fallback returns `null` + `SOURCE_UNAVAILABLE`. |
| `src/server/services/ScripIntelligenceDossierService.ts` | CMP fallback `\|\| 100`, price change `0.85`, RSI fallback, hardcoded portfolio weight `4.8%` | Missing CMP fails closed to `status: 'DATA_INSUFFICIENT'`. Hardcoded fallback numbers removed. `emaAlignment` supports `DATA_INSUFFICIENT`. |
| `src/server/services/SmartMoneyFlowEngine.ts` | Fabricated sector disk cache and hardcoded participant split (0.52 FII, 0.38 DII, 0.10 Prop, -0.35 Retail) | Disabled live output until direct evidence-backed exchange disclosures are integrated; returns `SOURCE_UNAVAILABLE` / `DATA_INSUFFICIENT`. |
| `src/server/services/FundamentalAlphaEngine.ts` | Mock promoter-squeeze volume proxy | Marked as deprecated/fixture; returns `DATA_INSUFFICIENT` requiring verified SAST regulatory disclosures. |
| `src/server/services/adapters/TechnicalEngineAdapter.ts` | Fictional signals and hardcoded default universe `['RELIANCE', 'TCS', 'INFY']` | Returns `DATA_INSUFFICIENT` until bound to live DuckDB OHLCV and canonical identity. |
| `src/server/services/adapters/ValuationEngineAdapter.ts` | Fake snapshot hash and default universe | Disabled as active module runner until authentic source snapshot IDs are wired. |
| `src/components/StockIntelligenceView.tsx` | Score/scenario/DVM/consensus UI fallbacks (technical score 65, R:R 2.5:1, durability 75, valuation 35/45, momentum 88, consensus 24 desks) | All UI default numbers removed. Missing values render honestly as `N/A`, `FEED_ABSENT`, or `SOURCE_UNAVAILABLE`. |
| `src/components/AnalyzeWorkspace.tsx` | Contained material fabricated defaults | Converted into a forwarding adapter to canonical `#analyze/:symbol` (`StockIntelligenceView`), eliminating all legacy fabricated states. |
| `src/components/ScripIntelligencePortal.tsx` | Competing analysis portal | Converted into a lightweight route adapter and search launcher for `#analyze/:symbol`. |
| `src/components/UISystemPrimitives.tsx` | Missing fail-closed badges | Added explicit badges and colorways for `SOURCE_UNAVAILABLE`, `IDENTITY_REVIEW`, `PIT_NOT_VERIFIABLE`, `NOT_REQUESTED`, `NOT_APPLICABLE`, and `ERROR`. |

---

## 3. Architecture & Contracts

All contracts reside in `src/server/services/intelligence/contracts/`:

```
src/server/services/intelligence/
├── AnalysisEvidenceRepository.ts      # Canonical read-only evidence repository
└── contracts/
    ├── AnalysisModule.ts              # 12 runnable modules (no forced sequence)
    ├── DataStatus.ts                  # Fail-closed data & freshness status enums
    ├── Provenance.ts                  # EvidenceReference, DataProvenance, FactEnvelope<T>
    ├── ModuleResult.ts                # Standardized module outcome contract
    ├── AnalysisContext.ts             # Security, date, scanRun, and snapshot context
    ├── EvidenceAssessment.ts          # Checklist items with quantitative & qualitative proof
    ├── AnalysisSession.ts             # Multi-module coordinated execution session
    ├── AnalysisTelemetry.ts           # Execution latency, evidence counts, telemetry
    └── index.ts                       # Public API barrel export
```

### Fact Envelope Specification (`FactEnvelope<T>`)
Every metric queried by any module or UI tab is wrapped in an immutable fact envelope:
```ts
export interface FactEnvelope<T = any> {
  value: T | null;
  status: DataStatus; // VERIFIED | PARTIAL | DATA_INSUFFICIENT | SOURCE_UNAVAILABLE | IDENTITY_REVIEW | ...
  securityId: string | null;
  metric: string;
  periodType: string | null;
  periodEnd: string | null;
  scope: string | null;
  provenance: EvidenceReference[];
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  missingReason: string | null;
}
```

### Analysis Evidence Repository (`AnalysisEvidenceRepository`)
Reads from existing authoritative stores without duplication or write-side mutations:
- `company_facts`: Primary structured facts mapped via `field_mapping_catalog`.
- `fundamental_endpoint_snapshots`: Immutable raw Trendlyne MCP parameter snapshots.
- `fere_evidence.db`: Verified filing documents, XBRL facts, and management commitment candidates via `readFereEvidence`.
- `DuckDbAdjustedOhlcvService`: 10-year split-adjusted daily OHLCV bars.
- `SectorMomentumService`: Sector EMA20/SMA20 and 20D returns on benchmark indices.
- `SectorFlowService`: Sector flow proxy with a 60% market-cap coverage gate.

---

## 4. Identity Model & Registry Migration

Updated `src/server/services/dataAcquisition/SecurityIdentityRegistry.ts`:
- **Identity Model:**
  ```ts
  export interface SecurityIdentityRecord {
    securityId: string;
    isin: string | null;
    nseSymbol: string | null;
    bseCode: string | null;
    exchange: string;
    segment: SecuritySegment;
    instrumentType: string;
    provider?: string | null;
    providerInstrumentId?: string | null;
    validFrom: string;
    validTo: string | null;
    status: 'ACTIVE' | 'SUSPENDED' | 'DELISTED';
    verifiedAt: string;
  }
  ```
- **Supported Segments:** `NSE`, `BSE`, `ETF`, `MF`, `Index`, `US equity`, `NASDAQ`, `NYSE`, `AIF`, `unlisted`.
- **Constitutional Guardrails:**
  - Zero synthetic `SEC_symbol_NSE` IDs.
  - No assumption that all tickers are NSE equities.
  - Asynchronous loading race eliminated via `ensureLoaded()` promise synchronization.
  - Unmapped securities strictly return `IDENTITY_REVIEW`.

---

## 5. QGLP Delivery Specification

The existing QGLP score is officially classified as:
```text
QGLP_NUMERIC_PROXY
```
In strict compliance with Section 8 of the developer contract:
- Moat durability, Management succession/culture, TAM headroom, and Terminal longevity are marked **`DATA_INSUFFICIENT`**.
- It is constitutionally forbidden for a checklist item to become a "Pass" solely because ROCE or promoter holding is high.
- The detailed audit breakdown is published in:
  - `reports/qglp/QGLP_DATA_COVERAGE.json`
  - `reports/qglp/QGLP_DATA_COVERAGE.md`

---

## 6. Audit & Acceptance Reports

Generated and verified under `reports/`:
- `reports/intelligence/WEALTHOS_EXISTING_CAPABILITY_BASELINE.json`
- `reports/intelligence/WEALTHOS_EXISTING_CAPABILITY_BASELINE.md`
- `reports/intelligence/WEALTHOS_CAPABILITY_MATRIX.json`
- `reports/intelligence/WEALTHOS_CAPABILITY_MATRIX.md`
- `reports/qglp/QGLP_DATA_COVERAGE.json`
- `reports/qglp/QGLP_DATA_COVERAGE.md`

---

## 7. Automated Test & Validation Evidence

### 1. Static Hardcoded Values & Mock Audit
Command: `npm run wealthos:test:static`
```
✅ TS14-01: No hardcoded LTP/stock prices in production services
✅ TS14-02: Recommendations not statically hardcoded
✅ TS14-03: Conviction scores not statically hardcoded
✅ TS14-05b: Tax rates not duplicated outside decimalUtils.ts
✅ TS14-06: No fake/demo company names in production server code
✅ TS14-10: No hardcoded API keys or secrets in source files
✅ TS14-12: No synthetic fallbacks or mock data left in core services
✅ TS14-13: No hardcoded fallback stock arrays

SYNTHETIC_PRODUCTION_DATA_GATE=PASS
```

### 2. Unit Tests
Command: `npx vitest run tests/unit/analysis_evidence_repository.test.ts`
```
 ✓ tests/unit/analysis_evidence_repository.test.ts
   ✓ exposes all 12 canonical analysis modules without forced sequence
   ✓ SecurityIdentityRegistry returns IDENTITY_REVIEW for unmapped identifiers without synthesizing SEC_symbol_NSE
   ✓ SecurityIdentityRegistry registers and resolves canonical security records using genuine ISIN or Master ID
   ✓ AnalysisEvidenceRepository returns fail-closed IDENTITY_REVIEW envelope when querying unmapped securities
   ✓ AnalysisEvidenceRepository returns DATA_INSUFFICIENT envelope with null value when metric is absent
   ✓ AnalysisEvidenceRepository returns SOURCE_UNAVAILABLE when querying sector momentum with unavailable index data

Test Files  1 passed (1)
Tests       6 passed (6)
```

Command: `npx vitest run tests/unit/point_in_time_data_integrity.test.ts`
```
Test Files  1 passed (1)
Tests       14 passed (14)
```

---

## 8. File & Directory Review Manifest

### New Files
- `src/server/services/intelligence/AnalysisEvidenceRepository.ts`
- `src/server/services/intelligence/contracts/AnalysisModule.ts`
- `src/server/services/intelligence/contracts/DataStatus.ts`
- `src/server/services/intelligence/contracts/Provenance.ts`
- `src/server/services/intelligence/contracts/ModuleResult.ts`
- `src/server/services/intelligence/contracts/AnalysisContext.ts`
- `src/server/services/intelligence/contracts/EvidenceAssessment.ts`
- `src/server/services/intelligence/contracts/AnalysisSession.ts`
- `src/server/services/intelligence/contracts/AnalysisTelemetry.ts`
- `src/server/services/intelligence/contracts/index.ts`
- `reports/intelligence/WEALTHOS_EXISTING_CAPABILITY_BASELINE.json`
- `reports/intelligence/WEALTHOS_EXISTING_CAPABILITY_BASELINE.md`
- `reports/intelligence/WEALTHOS_CAPABILITY_MATRIX.json`
- `reports/intelligence/WEALTHOS_CAPABILITY_MATRIX.md`
- `reports/qglp/QGLP_DATA_COVERAGE.json`
- `reports/qglp/QGLP_DATA_COVERAGE.md`
- `tests/unit/analysis_evidence_repository.test.ts`
- `INTELLIGENCE_FOUNDATION_REVIEW.md`

### Key Modified Files
- `src/server/services/OpportunityScannerEngine.ts`
- `src/server/services/TechnicalAnalysisEngine.ts`
- `src/server/services/TrendlyneIntelligenceService.ts`
- `src/server/services/ScripIntelligenceDossierService.ts`
- `src/server/services/SmartMoneyFlowEngine.ts`
- `src/server/services/FundamentalAlphaEngine.ts`
- `src/server/services/adapters/TechnicalEngineAdapter.ts`
- `src/server/services/adapters/ValuationEngineAdapter.ts`
- `src/server/services/dataAcquisition/SecurityIdentityRegistry.ts`
- `src/components/StockIntelligenceView.tsx`
- `src/components/AnalyzeWorkspace.tsx`
- `src/components/ScripIntelligencePortal.tsx`
- `src/components/UISystemPrimitives.tsx`
