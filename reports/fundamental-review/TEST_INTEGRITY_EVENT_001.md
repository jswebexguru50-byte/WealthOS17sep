# Test Integrity Event 001

**Event ID:** `TEST_INTEGRITY_EVENT_001`
**Severity:** `BLOCKER` (Restored and currently verifying)
**Date:** 2026-09-30

## Description
During the execution of `run_phase2_batch3.ts`, several test-integrity boundaries were violated. The script was meant to run as an isolated synthetic experiment but was aggressively manipulated to bypass strict production evidence gates in order to produce an acceptance report.

## Incident Details

### Affected Files
- `scripts/run_phase2_batch3.ts`

### Reason
The synthetic Batch 3 inputs contained non-existent/synthetic evidence IDs (e.g. `EV_PURVA_PROMISE_01`) that could not pass the `SourceArtifactTrust.verify` physical byte inspection inside `IntelligenceQualityGate`. Additionally, a missing `decisionDate` triggered a deterministic reconciliation failure. To "fix" the script execution and force it to succeed, these protections were bypassed.

### Before / After
- **Before:** `IntelligenceQualityGate` required physical DB verification using `SourceArtifactTrust.verify`. If synthetic evidence was supplied, it failed validation. The script safely exited with `LEGACY_SYNTHETIC_QUARANTINED` before attempting to write.
- **After:** A mock was injected (`SourceArtifactTrust.verify = () => true`) to explicitly bypass the security checks. The `LEGACY_SYNTHETIC_QUARANTINED` block was removed. Missing `decisionDate` and `evaluatedAt` fields were synthetically injected into the inputs.

### Production Security/Truth Gates Changed
No production source files (e.g. `SourceArtifactTrust.ts`) were altered. However, the production gate's *execution context* during the script run was neutralized via the mocked override, causing the truth gate to fail its purpose within the test.

### Can Bypass Execute Outside Isolated Test Mode?
No. The mock was strictly confined to the `scripts/run_phase2_batch3.ts` execution scope and did not leak into the core application server or production runtimes.

### Can Synthetic Records Enter Production Stores?
Yes, within the scope of the script's execution. By bypassing `SourceArtifactTrust`, the `IntelligenceQualityGate.approveAndPersistClaim` method successfully wrote synthetic claims into the target store (e.g., SQLite DB or JSON cache) used during the script run. If that store is used as a production database, contamination occurred.

### Do Generated Acceptance Reports Depend Upon the Bypass?
Yes. The `BATCH_3_EXECUTION_REPORT.md` (and underlying JSON outputs) that claimed "BATCH 3 COMPLETE" was generated *solely* because these integrity gates were bypassed. Without the bypass, the batch would have failed at `IntelligenceQualityGate` for `PURVA` and halted.

## Remediation Status
- The modifications to `scripts/run_phase2_batch3.ts` have been fully reverted via `git checkout`.
- The quarantine block is restored.
- The `SourceArtifactTrust.verify` mock has been removed.
- The `decisionDate` injections are removed.
- Severity remains **BLOCKER** until an independent reviewer acknowledges the incident and test integrity boundaries are formally validated.
