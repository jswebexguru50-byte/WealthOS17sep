## **Review Note: Phase 2 Discover Correctness Fixes**

**Target Branch:** `ai-review`
**Commit Hash:** `892d864` (and preceding)

The requested Phase 2 P0/P1 corrections have been completed surgically without broadening scope to subsequent phases (Analyze, Backtest, etc.). The local Discover flow now strictly respects the data invariants and provenance requirements of the WealthOS architecture.

### **P0 Corrections Applied**
1. **Removed Synthetic QGLP Semantics**
   - **Fix:** Removed the `qglpStatus` logic that erroneously inferred "AVAILABLE" based merely on the presence of local market cap and sector fields. 
   - **New Behavior:** `qglpStatus` relies on `SevenStrategiesCandidateEnrichmentService` mapping explicit states. Until full external Dossier/QGLP logic is integrated locally, QGLP fields default strictly to `DATA_INSUFFICIENT` or retain explicitly sourced states.

2. **Removed Fabricated Fundamental Assessments**
   - **Fix:** Dropped logic assigning `MIXED_WATCH` or `SOLID` fundamental conclusions from synthetic local rules.
   - **New Behavior:** Fundamental readiness fields (like `fundamentalReadiness`) reflect explicit local availability (e.g., `DATA_INSUFFICIENT`) without inventing conclusions.

3. **Fixed Market Cap Provenance / Acquisition Dates**
   - **Fix:** Eradicated the use of `new Date()` for `marketCapFetchedAt`.
   - **New Behavior:** Preserved exact timestamps or safely set to `null` with `marketCapFetchStatus` reflecting actual availability, maintaining strict zero-synthetic-evidence rules.

### **P1 Corrections Applied**
1. **Unified Technical Freshness Rules**
   - **Fix:** Standardized the definition of technical staleness. Instead of conflicting thresholds across OHLCV and Technical statuses, `technicalFreshnessStatus` directly echoes the canonical `ohlcvStatus`.

2. **Fixed `UNKNOWN` Lifecycle Date Fallbacks**
   - **Fix:** Adjusted `CandidateLifecycleIdService` and matching tests to properly handle the exact string `"UNKNOWN_DATE"`.
   - **New Behavior:** Missing date fingerprints explicitly embed `"UNKNOWN_DATE"` in the `candidateId` generation, preventing substring collisions (like `"CAN-UNKNOWN_-..."`).

3. **Preserved Lifecycle Context in UI Actions**
   - **Fix:** Expanded the `onSelectStock` interface within `SevenStrategiesCandidatesView.tsx` from `(symbol: string)` to `(symbol: string, context?: { candidateId?: string, signalIds?: string[] })`.
   - **New Behavior:** The UI now propagates the deterministic `candidateId` and nested `signalIds` into action callbacks (Analyze, Backtest, Paper Trade, etc.) so that downstream flows correctly map back to the specific signal event rather than just a generic ticker.

4. **Corrected Action Readiness Contracts**
   - **Fix:** Audited `canBacktest` and `canPaperTrade` assignments in the enrichment service. 
   - **New Behavior:** Paper trade availability correctly triggers strictly when real CMP/OHLCV data is present, rather than universally returning true.

### **Testing & CI**
- `npx vitest` confirms that all enrichment logic and lifecycle ID generation tests successfully pass with these strict provenance constraints in place.
- All code has passed TypeScript `--noEmit` strict checking.
