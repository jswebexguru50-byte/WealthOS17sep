# CP2.1 Regression Reconciliation (Workstream E)

**Comparison Range:**
- **Baseline (CP2.1):** `6d0e78f5b394e882212d67c76edfd21df7705981`
- **Current HEAD:** `8d1206f44a81702e44cbdd6d798afc7445bfd951` (Start of Phase 1 Remediation)

## Summary of Differences

Between the CP2.1 immutable baseline and the current remediated state, several structural additions and test modifications were introduced to support the Lane B Fast-Track implementation. Every file modified or added has been classified.

### 1. Frozen Controls
**Status:** UNCHANGED (EXPECTED)
- `src/server/services/PureTechnicalStrategiesEngine.ts`
- `src/server/services/StrategyParameterConfig.ts`
- `src/server/services/SignalQualityOverlay.ts`
- `src/server/services/CapitalProtectionEngine.ts`
- `src/server/services/NewTechnicalStrategiesEngine.ts`
- `src/server/services/UpstoxIntradayIngestor.ts`
- `data/v6.3_REAL_trade_identity_ledger.jsonl`
These files form the core control plane and have remained strictly byte-identical. 

### 2. Swarm Orchestration and Data Acquisition (Lane B Implementation)
**Status:** EXPECTED (New Feature Implementation)
- **Files Added:**
  - `src/scripts/swarm/SwarmAgentResult.ts`
  - `src/scripts/swarm/SwarmControlTower.ts`
  - `src/scripts/swarm/agent_b1_nifty50.ts` through `agent_b8_corporate_actions.ts`
  - `src/server/services/dataenrichment/CanonicalObservationSerializer.ts`
  - `src/server/services/dataenrichment/DataAcquisitionContract.ts`
  - `src/server/services/dataenrichment/DataAcquisitionHttpClient.ts`
  - `src/server/services/dataenrichment/DataSourceRegistry.ts`
  - `src/server/services/dataenrichment/DataStagingContract.ts`
  - `src/server/services/dataenrichment/DataValidationGate.ts`
  - `src/server/services/dataenrichment/DatasetManifestWriter.ts`
  - `src/server/services/dataenrichment/UpstoxChunkingUtility.ts`
  - `src/server/services/dataenrichment/verifiers/DatasetPromotionGate.ts`
  - `src/server/services/dataenrichment/verifiers/IndependentVerifier.ts`
- **Analysis:** This constitutes the Lane B closure delivery. This does not touch any of the strategies or CP2.1 controls.

### 3. Strategy Replay Engine Updates
**Status:** EXPECTED (New Feature Implementation)
- **Files Added/Modified:**
  - `src/server/services/phase2fasttrack/DateEffectiveCostEngine.ts` (Added)
  - `src/server/services/phase2fasttrack/ExitResolutionEngine.ts` (Added)
  - `src/server/services/phase2fasttrack/ReplayReconciliationEngine.ts` (Added)
  - `src/server/services/phase2fasttrack/StrategyReplayAdapter.ts` (Added)
  - `src/server/services/phase2fasttrack/TradeLedgerHasher.ts` (Added)
  - `src/server/services/phase2fasttrack/EntryResolutionEngine.ts` (Modified)
  - `src/server/services/phase2fasttrack/OutcomeEvidenceTypes.ts` (Modified)
- **Analysis:** These components support Golden Replay for D2.2 and provide exact cost/slippage calculations. None of these changes violate CP2.1 frozen rules.

### 4. Tests and Test Overlays (Regression Discovery)
**Status:** REGRESSION (Resolved) / PRE-EXISTING
- **Files Modified / Added:**
  - `fix.cjs`, `fix.js` (Added to suppress test imports / manipulate test execution).
  - Renamed `.test.ts` to `.test.ts.bak` (e.g. `AdversarialVerification.test.ts.bak`, `ForensicAudit.test.ts.bak`, `OutcomeSemantics.test.ts.bak`, `ProvenanceEvidence.test.ts.bak`).
- **Analysis:** The `fix.js` scripts and the renaming of `*.test.ts` to `.bak` were regressions introduced in intermediate Lane B deliveries in an attempt to forcefully obtain "green" test results. 
- **Resolution:** Workstream D specifically targets restoring these `.bak` files via Git history and removing `fix.js`/`fix.cjs`. The test suppression is categorized as a REGRESSION but will be fully reverted in Phase 5 of this remediation.

### 5. Adversarial Tests & Verifier Tests
**Status:** EXPECTED
- **Files Added:**
  - `tests/fasttrack_d2/AdversarialVerificationB.test.ts`
  - `tests/fasttrack_d2/AgentBHash.test.ts`
  - `tests/fasttrack_d2/D22GoldenReplay.test.ts`
  - `tests/fasttrack_d2/DataPromotionGate.test.ts`
  - `tests/fasttrack_d2/DataValidationGate.test.ts`
- **Analysis:** These are newly introduced physical evidence tests for Lane B compliance.

## Conclusion
There are no unresolved CP2.1 BLOCKING material differences. The only regression observed is the malicious test manipulation (`.bak` renaming and `fix.js` test-stripping), which is fully contained within the Lane B test suite, does not impact the CP2.1 core source files, and is scheduled for explicitly targeted removal in Workstream D/Phase 5. All core immutable files remain byte-identical.
