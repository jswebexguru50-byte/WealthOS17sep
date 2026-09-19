# Ledger Lock Specification
**Phase 0 Discovery Artifact for Delivery 2.2**

This specification defines the cryptographic lock barrier that must separate the Replay Engine (which generates the Canonical Ledger) from the Metrics and Statistical Engines in Delivery 2.2.

## The Problem
In the previous synthetic implementation, statistics and metrics could execute on arbitrarily generated arrays of trades, or algebraic formulas disconnected from the trades entirely. 

## The Requirement
No downstream module is allowed to run against:
1. An unfrozen ledger.
2. A partially generated ledger.
3. A synthetic fixture when requesting production results.
4. A different ledger than the one originally evaluated.

## Implementation Mechanism
1. **Ledger Freezing:** When the `EconomicReplayEngine` finishes executing the full replay, it must seal the `FULL_REPLAY_LEDGER.jsonl`.
2. **Cryptographic Sealing:** The engine must compute a SHA-256 hash of the entire sealed ledger file and output it to `LEDGER_HASH_LOCK.json`.
3. **Consumer Verification Barrier:** Every downstream module (`ReplayMetricsEngine`, `ReplayOOSPartitioner`, `ReplayRegimeEngine`, `ReplayCapacityEngine`, `ReplaySensitivityEngine`, `StationaryBlockBootstrap`, `MultipleTestingFDR`, `NineGateDisposition`) must:
   - Accept the explicit path to the Canonical Ledger and the Expected Hash.
   - Re-read the Canonical Ledger from disk.
   - Re-compute the SHA-256 hash of the payload on disk.
   - Assert `ComputedHash === ExpectedHash`.
   - If the hash check fails or is omitted, throw a `LedgerLockViolationError` and refuse to calculate any statistics.

By forcing this exact sequential flow, it is mechanically impossible for the statistical layer to evaluate anything other than the exact empirical trades historically replayed in Phase 3.
