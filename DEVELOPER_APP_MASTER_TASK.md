# WEALTHOS / ITAS v6.3 — END-TO-END IMPLEMENTATION TASK

You are implementing the attached v6.3 R1/E2E research bundle into the existing WealthOS / ITAS repository.

SOURCE OF TRUTH:
- v6.2 production code is frozen.
- Do NOT rewrite, refactor, tune, or alter S1-S20, NEoWave, Double Momentum,
  FERE, QGLP, 10-Gate, Capital Protection, or Signal Quality Overlay.
- Treat all existing v6.2 source files as read-only for this task.
- The new code is research infrastructure only.

GOAL:
Complete the empirical research pipeline from PIT validation through deterministic
execution simulation, Trade Identity Ledger, A/B/C/D arms, cumulative A-G ablation,
leave-one-layer-out ablation, rolling 36m/12m OOS walk-forward, bootstrap uncertainty,
cost sensitivity, regime attribution, and precommitted promotion gates.

FIRST:
1. Inspect the existing repository and identify the actual paths/names of the frozen
   v6.2 engines and data providers.
2. Run the supplied fingerprint script before making changes.
3. Compare the resulting manifest with the existing v6.2 baseline.
4. If any production v6.2 file differs, STOP and report the exact diff. Do not silently
   overwrite or "fix" it.

IMPLEMENT:
1. Integrate PointInTimeDataEngine with the real historical data sources.
2. Add the real TradingCalendarService and exchange holiday handling.
3. Add point-in-time universe and historical index membership reconstruction.
4. Add corporate-action sequencing using the repository's actual NSE/BSE data.
5. Add filing/shareholding availability timestamps. Exact exchange filing timestamp wins;
   otherwise use the 45-calendar-day conservative fallback.
6. Add a FutureReadGuard that invalidates the whole run on any future read.
7. Connect frozen S1-S20 signal generation through an adapter. Raw signal output must
   be byte-for-byte/field-for-field unchanged versus v6.2 for the same inputs.
8. Add B = v6.2 overlay, C = challengers evaluation-only, D = Idealized Risk Oracle.
9. Implement deterministic next-available-bar execution. Never execute on the same bar
   merely because its high/low became known later.
10. Implement Indian delivery-equity transaction costs and explicit slippage/impact.
    Do not call estimated P&L "exact".
11. Create the full Trade Identity Ledger with at least 25 auditable fields.
12. Implement cumulative A-G and leave-one-layer-out ablation.
13. Implement rolling 36-month train / 12-month untouched OOS windows.
14. Report bootstrap 95% expectancy CI, P(E>0), P(E>0.20R).
15. Run cost sensitivity at 0.75x, 1x, 1.25x, 1.5x and 2x.
16. Add regime/subperiod attribution.
17. Implement precommitted promotion gates.
18. Create an untouched final lockbox containing code/data/config/run hashes and results.
19. Add deterministic fixtures covering delisting, index membership, split/bonus,
    dividend, filing timestamps, shareholding, EOD availability, future candles,
    corporate action sequencing, suspensions and missing data.

HARD TEST GATES:
- R1 PIT tests: 10/10
- integrated PIT fixture: PASS
- future-read contamination: ZERO
- required missing data: fail closed
- frozen v6.2 fingerprint: unchanged
- full repository TypeScript compile: PASS
- deterministic repeat run: identical hashes/results
- no performance output while R1 lockbox is closed

DO NOT:
- tune thresholds to improve results
- optimize on OOS data
- change S1-S20
- promote a challenger based on in-sample results
- use current index constituents historically
- forward-fill unknowable data
- use future corporate-action knowledge
- use future candle highs/lows
- use Idealized Risk Oracle as a tradable strategy
- claim statistical significance from a single backtest

DELIVER:
A. all source files
B. tests
C. manifests
D. run scripts
E. developer README
F. machine-readable result JSON
G. final research report
H. final lockbox hash
I. exact commands to reproduce every result

At the end, print:
R1_STATUS
FROZEN_BASELINE_HASH
PIT_TESTS
FUTURE_READS
TYPESCRIPT_STATUS
DETERMINISM_STATUS
R2_STATUS
WALK_FORWARD_STATUS
PROMOTION_STATUS

Do not declare success merely because files compile. Every hard gate must be evidenced.
