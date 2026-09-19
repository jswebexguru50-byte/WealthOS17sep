# Existing Entry/Exit Audit
**Phase 0 Discovery Artifact for Delivery 2.2**

This audit documents the state of the existing Delivery 2.1 EntryResolutionEngine prior to any Delivery 2.2 modifications. Per orchestration rules, this engine should be **reused and tested first**, and only modified if an explicit defect is found and approved.

## Target Engine
**File:** `src/server/services/phase2fasttrack/EntryResolutionEngine.ts`

## Current Implementation

The engine implements strategy-specific entry resolution by strictly matching `decisionTimestamp` against empirical observations. It natively supports rejecting trades without resorting to synthetic generation when data is missing.

### Supported Entry Types
1. **`DAILY_CLOSE_BOUND`**: Resolves to the daily close on the exact decision date.
2. **`NEXT_OPEN`**: Resolves to the open of the immediate subsequent trading day after the decision date.
3. **`INTRADAY_BREAKOUT` (S10)**: Resolves to a specific 15-minute intraday observation that matches or exceeds the `decisionTimestamp`.

### Point-in-Time (PIT) Validation
* The engine accepts a `PointInTimeDataEngine` instance.
* For every resolved observation, it enforces that the observation timestamp is strictly available and knowable relative to the `decisionTimestamp`.
* If PIT validation fails, it safely exits and returns `status: 'PIT_REJECTED'` instead of synthesizing a trade.

### Timestamp Semantics
* Decision dates and observation timestamps use strict ISO8601 strings (e.g. `"2026-03-01T09:30:00+05:30"`).
* For daily strategies, chronological ordering is strictly enforced (`b.timestamp > decisionTimestamp` for NEXT_OPEN).

### Missingness Handling
* Returns `{ status: 'DATA_INSUFFICIENT', reason: '...' }` safely.
* Does not fallback to placeholder entries, randomly generate trades, or throw fatal errors that halt the execution pipeline.

## Current Exit Resolution (Missing Component)
While entry resolution is robustly handled via `EntryResolutionEngine`, an equivalent `ExitResolutionEngine` for sequential bar traversal (evaluating stop-loss and targets against high/low) is noticeably absent in the Delivery 2.1 architecture and must be explicitly designed and integrated for Delivery 2.2.

## Known Limitations / Risks
1. **Slippage**: Slippage is not explicitly handled by the engine's core resolution logic (it resolves to the raw price).
2. **Collision Semantics**: For NEXT_OPEN gaps, if the target and stop loss are simultaneously hit on the entry bar, collision arbitration rules are not defined in this entry engine.
3. **Intraday Bar Feed**: The `IntradayBreakoutBar` feed is expected to be provided in the method signature, but the repository's `portfolio.db` currently only holds `DailyOHLCV`.
