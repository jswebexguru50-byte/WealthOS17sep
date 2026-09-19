# V6.5 Strategy Invocation Map
**Phase 0 Discovery Artifact for Delivery 2.2**

This document maps canonical strategy IDs S1–S20 to their actual production implementations. This explicitly supersedes the legacy `v65_runner_source.ts` strategy registry which contained synthetic fallbacks.

## Canonical S1–S20 Family Mapping

| Canonical ID | Production Engine | Method | Required Data | Entry Semantics | Exit Semantics | Expected Output | Status |
|---|---|---|---|---|---|---|---|
| **S1** | `PureTechnicalStrategiesEngine` | `evaluateStrategy1()` | Daily OHLCV (52wk) | Breakout/Next Open | Base Trailing Stop | `Strategy1Result` | **EXECUTABLE** |
| **S2** | `PureTechnicalStrategiesEngine` | `evaluateStrategy2()` | Daily OHLCV (52wk) | CE Pullback | Invalidation Stop | `Strategy2Result` | **EXECUTABLE** |
| **S3** | `PureTechnicalStrategiesEngine` | `evaluateStrategy3()` | Daily OHLCV (52wk) | HH/HL Compaction | Invalidation (L2) | `Strategy3Result` | **EXECUTABLE** |
| **S4** | `PureTechnicalStrategiesEngine` | `evaluateStrategy4()` | Daily OHLCV (200d) | Next Open | Invalidation (L2) | `Strategy4Result` | **EXECUTABLE** |
| **S5** | `PureTechnicalStrategiesEngine` | `evaluateStrategy5()` | Daily OHLCV (50d) | Pullback | Invalidation Stop | `Strategy5Result` | **EXECUTABLE** |
| **S6** | `PureTechnicalStrategiesEngine` | `evaluateStrategy6()` | Daily OHLCV (52wk) | Breakout | Trailing Stop | `Strategy6Result` | **EXECUTABLE** |
| **S7** | `PureTechnicalStrategiesEngine` | `evaluateStrategy7()` | Daily OHLCV (200d) | Mean Reversion | Invalidation Stop | `Strategy7Result` | **EXECUTABLE** |
| **S8** | `PureTechnicalStrategiesEngine` | `evaluateStrategy8()` | Daily OHLCV (52wk) | Breakout | Trailing Stop | `Strategy8Result` | **EXECUTABLE** |
| **S9** | `PureTechnicalStrategiesEngine` | `evaluateStrategy9()` | Daily OHLCV (50d) | Pullback | Invalidation Stop | `Strategy9Result` | **EXECUTABLE** |
| **S10** | `PureTechnicalStrategiesEngine` | `evaluateStrategy10()` | Daily OHLCV + 15m Intraday | Intraday ORB Breakout | Invalidation Stop | `Strategy10Result` | **DATA_INSUFFICIENT** |
| **S11** | `PureTechnicalStrategiesEngine` | `evaluateStrategy11()` | Daily OHLCV (200d) | Spring Reclaim | Spring Low Stop | `Strategy11Result` | **EXECUTABLE** |
| **S12** | N/A | N/A | Catalyst/Earnings Data | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S13** | N/A | N/A | Earnings Acceleration | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S14** | N/A | N/A | Futures Data | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S15** | N/A | N/A | Options Data | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S16** | N/A | N/A | Fundamental Financials | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S17** | N/A | N/A | Promoter SAST Data | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S18** | N/A | N/A | Block Deal/Tick Data | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S19** | N/A | N/A | Daily Delivery Volume % | N/A | N/A | N/A | **DATA_INSUFFICIENT** |
| **S20** | N/A | N/A | Structural / NEoWave | N/A | N/A | N/A | **DATA_INSUFFICIENT** |

### Key Findings
1. S10 requires 15-minute intraday ORB bars, which are not currently provisioned in the standard `portfolio.db` historical daily feeds. It correctly evaluates to `DATA_INSUFFICIENT_INTRADAY` in the legacy engine.
2. S12-S17 and S20 require alternative data feeds (catalyst, futures/options, fundamentals, NEoWave) that do not exist in the basic daily OHLCV dataset. They correctly evaluate to `DATA_INSUFFICIENT`.
3. S18 (Block Accumulation) and S19 (Delivery Volume Spike) were marked as `COMPLETE` in the legacy `v65_runner_source.ts` script, but **no actual strategy method exists for them in `PureTechnicalStrategiesEngine.ts`**. Their past "execution" was entirely synthetic. They must correctly evaluate to `DATA_INSUFFICIENT` due to missing execution logic and required delivery/block data.

## Non-Canonical Modular Strategy Family (S8B, S21–S26)

The repository also contains `NewTechnicalStrategiesEngine.ts`, which implements:
* `S8B` (Classical Bull Flag)
* `S21` (Cup & Handle)
* `S22` (Volatility Squeeze)
* `S23` (Double Bottom)
* `S24` (Distribution Exit)
* `S25` (Inverse Head & Shoulders)
* `S26` (Head & Shoulders Distribution Exit)

**Status:** These strategies exist outside the canonical S1–S20 replay family evaluated in the original v6.5 baseline. They are behind explicit feature flags (`ENABLE_S8B`, etc.). They will be **excluded** from the standard Delivery 2.2 S1-S20 canonical historical replay unless instructed otherwise by the Orchestrator, to maintain parity with the target scope.
