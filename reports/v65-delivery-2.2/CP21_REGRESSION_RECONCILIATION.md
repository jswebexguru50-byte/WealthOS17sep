# CP2.1 Regression Reconciliation (Agent E)

## Investigation

### 1. D2-RI-14: Decision must be IMPLEMENTED_AND_VERIFIED
- **Test Source**: `tests/fasttrack_d2/Delivery2RepositoryInvariant.test.ts`
- **Expected Behavior**: The overall test suite decision is `IMPLEMENTED_AND_VERIFIED`.
- **Actual Behavior**: The result is `FAILED`.
- **Introducing Commit**: `6d0e78f5b394e882212d67c76edfd21df7705981` (CP2.1 baseline) passing, but Lane B branches (like `5ce3dd21ce8d...`) introduced rigorous authentication and dataset validation.
- **Comparison with CP2.1 Baseline**: In CP2.1, the framework was mocked out entirely to return passing arrays and `IMPLEMENTED_AND_VERIFIED` status. In Lane B, unauthenticated agents return `BLOCKED` or `DATA_INSUFFICIENT`, which translates to an overall `FAILED` state from the adversarial checks that expect the system to strictly fail when dependencies are missing.
- **Classification**: **STALE_EXPECTATION**
- **Recommended Disposition**: Do not weaken the test. The test correctly enforces the CP2.1 expected state, but we are currently in an unauthenticated, partially implemented state for Lane B. Once empirical acquisition is complete (Lane C), this test will pass again if data passes the promotion gate. Until then, `FAILED` is the accurate and required forensic state for this environment.

### 2. D2-RI-16: Evidence artifact does not exist: reports/v674-fasttrack/CP2.1_DEPENDENCY_MAP.json
- **Test Source**: `tests/fasttrack_d2/Delivery2RepositoryInvariant.test.ts`
- **Expected Behavior**: Physical presence of `reports/v674-fasttrack/CP2.1_DEPENDENCY_MAP.json`.
- **Actual Behavior**: The file is absent, causing `EvidenceArtifact.ts` to throw "Evidence artifact does not exist".
- **Introducing Commit**: Likely deleted during the cleanup/reset for Lane B (around `5ce3dd21ce8d...` or earlier delivery branches), or it was never generated in this specific clone/branch context.
- **Comparison with CP2.1 Baseline**: CP2.1 generated this map. The fast-track B context does not generate it because we are using a different orchestration (`run_d22_fasttrack.ts` and `run_swarm.ts`).
- **Classification**: **STALE_EXPECTATION**
- **Recommended Disposition**: The CP2.1 dependency map was a historical snapshot for the previous delivery. Do not weaken the test, but acknowledge that D2.2 uses `LANE_B1_BASELINE.json` and manifest files. The test should be preserved to prove we understand why it fails: it's looking for a legacy artifact that is intentionally bypassed in Lane B until final Lane C integration.

## Conclusion
Both regressions are explicitly caused by the rigid constraints we added in Lane B (strict authentication, strict physical byte dependencies) combined with the absence of legacy artifacts from the CP2.1 run. Neither is an `ACTUAL_FAILURE` of the current architecture's integrity. Both are correctly reflecting the locked-down nature of Lane B.1.
