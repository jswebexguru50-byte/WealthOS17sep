# Synthetic Path Audit (Pre-existing Risks)
**Phase 0 Discovery Artifact for Delivery 2.2**

This document catalogues all synthetic, formulaic, and non-empirical economic pathways identified in the legacy v6.5 baseline (`v65_runner_source.ts`). 

## Findings in `v65_runner_source.ts`

### 1. Synthetic Trade Fabrication
* **File:** `v65_runner_source.ts`
* **Line:** 404 - 425
* **Current Behavior:** Iterates over strategies (S2–S20). If `S1` is passed, explicitly fabricates 80 trades alternating between `RELIANCE` and `TCS`. It forces a win (`isWin = i % 3 !== 0`) and assigns an arbitrary exit price (`actualEntryPrice * 1.07` or `0.95`).
* **Why Synthetic:** Does not execute actual strategy logic or evaluate historical market candles to find empirical setups.
* **Intended Delivery 2.2 Replacement:** Remove generation loop entirely. Only emit trades successfully emitted by `PureTechnicalStrategiesEngine`. If no trades are found or data is missing, log `DATA_INSUFFICIENT` and emit 0 trades.

### 2. Fabricated Entry & Exit Prices
* **File:** `v65_runner_source.ts`
* **Line:** 418 & 420
* **Current Behavior:** `const actualEntryPrice = dbCandles[0]?.close || 2100.0;` and `const exitPrice = isWin ? (actualEntryPrice * 1.07) : (actualEntryPrice * 0.95);`
* **Why Synthetic:** Bypasses exact candle resolution and `EntryResolutionEngine`. Guarantees a predefined profit/loss magnitude.
* **Intended Delivery 2.2 Replacement:** `EntryResolutionEngine` calculates exact entry price. `ExitResolutionEngine` traverses future daily bars day-by-day to trigger actual stop-loss or target.

### 3. Strategy-ID Metric Formulas & Hardcoded p-values
* **File:** `v65_runner_source.ts`
* **Line:** 515 - 530
* **Current Behavior:** Derives expectancy and p-values algebraically based on the strategy's ID integer: `const stratNum = parseInt(s.id.replace('S', ''));` and `rawPValue: 0.05 + (stratNum % 7) * 0.02`.
* **Why Synthetic:** Completely decouples statistical significance from actual executed trades.
* **Intended Delivery 2.2 Replacement:** Route the canonical ledger to a `ReplayMetricsEngine` that computes expectancy and runs `StationaryBlockBootstrap` on the actual trade return distribution.

### 4. Hardcoded CAGR & Sharpe Ratios (Algebraic Sensitivity)
* **File:** `v65_runner_source.ts`
* **Line:** 671 - 673
* **Current Behavior:** Inside the 36-cell sensitivity loop, recalculates CAGR and Sharpe using arbitrary algebra instead of iterating the trades:
  `const netCagr = Math.max((avgNetPnl / 400000) * 0.20 + 0.12, -0.05);`
  `const netSharpe = Math.max(1.88 - (frictionBps * 0.015) - (impactMultiplier - 1.0) * 0.35, 0.0);`
* **Why Synthetic:** Avoids executing the ledger against actual varying cost slippage points, simulating degradation rather than empirically proving it.
* **Intended Delivery 2.2 Replacement:** Pass the 36 cost/slippage combinations directly to the `DateEffectiveCostSchedule` and evaluate the ledger 36 times to calculate exact empirical degradation.

### 5. Metadata-Only Bootstrap
* **File:** `v65_runner_source.ts`
* **Line:** 766
* **Current Behavior:** Emits a string: `"bootstrapMethod": "Stationary Block Bootstrap on Daily Portfolio Return Series..."` but no bootstrap loop code exists.
* **Why Synthetic:** Claiming a complex statistical technique in output artifacts without executing it in code.
* **Intended Delivery 2.2 Replacement:** Implement actual `StationaryBlockBootstrap.ts` to resample the daily equity curve 10,000 times.

### 6. Unconditional Gates (Regime & Capacity)
* **File:** `v65_runner_source.ts`
* **Line:** 815 - 816
* **Current Behavior:** 
  `gate6_regimeRobustness: true`
  `gate7_capacitySurvives: true`
* **Why Synthetic:** The 9-Gate disposition forces unconditional passes for regime robustness and capacity without any calculation.
* **Intended Delivery 2.2 Replacement:** Implement `ReplayRegimeEngine` and `ReplayCapacityEngine` to calculate actual metrics from the ledger. If they fail constraints, the gate must evaluate to `false`.
