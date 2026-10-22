# WealthOS / ITAS v6.3.0-R1 — Implementation Protocol

## Scope
R1 is PIT validation only. S1-S20, NEoWave, Double Momentum, FERE, QGLP,
10-Gate, Capital Protection and Signal Quality Overlay are frozen.

## Hard gate
No performance metric, equity curve, walk-forward simulation or strategy promotion
is permitted until:
1. frozen baseline manifest exists;
2. all 10 PIT tests pass;
3. integrated PIT fixture passes;
4. future-read contamination count is zero;
5. missing required data fails closed;
6. raw price records remain immutable;
7. historical universe/index reconstruction passes;
8. exact filing timestamp precedence and 45-day fallback pass;
9. repository TypeScript compilation passes;
10. the same fixture/run is reproducible.

## Availability
Use the authoritative source availability timestamp when supplied. 15:35 IST is
the conservative EOD fallback, not a universal statement about every vendor.

## Corporate actions
Raw OHLCV is immutable. Adjusted prices are derived views. A portfolio must use
either explicit ex-date dividend cash accounting or a total-return series, never both.

## Research integrity
Any `availableAt > simulationAsOf` access is a future-read contamination and
invalidates the entire run. PIT and execution layers remain separate.

## Next milestone
After R1 PASS:
R2 = deterministic execution simulator + Trade Identity Ledger + all-in
cost/slippage model; then A/B/C/D walk-forward and ablation.
