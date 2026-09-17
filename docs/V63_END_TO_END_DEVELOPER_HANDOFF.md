# v6.3 End-to-End Developer Handoff

## Objective
Build and test the complete empirical research pipeline without modifying the frozen
v6.2 production strategy engines.

## Mandatory architecture

v6.2-FROZEN
  -> fingerprint / lockbox
  -> Trading Calendar
  -> PointInTimeDataEngine
  -> historical universe + index membership
  -> raw market data
  -> corporate-action derived views
  -> PIT fundamentals/shareholding
  -> FutureReadGuard
  -> frozen S1-S20 raw signals
  -> B v6.2 overlay
  -> C challengers (evaluation only)
  -> D Idealized Risk Oracle (diagnostic only)
  -> deterministic ExecutionSimulator
  -> Trade Identity Ledger
  -> Indian all-in transaction cost + slippage/impact
  -> cumulative A-G ablation
  -> leave-one-layer-out ablation
  -> rolling 36m train / 12m OOS walk-forward
  -> bootstrap CI / P(E>0) / P(E>0.20R)
  -> regime attribution
  -> 0.75x/1x/1.25x/1.5x/2x cost sensitivity
  -> precommitted promotion gate
  -> immutable final lockbox

## Non-negotiable invariants

1. Do not modify S1-S20, NEoWave, Double Momentum, FERE, QGLP, 10-Gate,
   Capital Protection or Signal Quality Overlay production source.
2. Raw OHLCV is immutable.
3. Never use current constituents to reconstruct historical index membership.
4. Never use a disclosure before `availableAt`.
5. Exact exchange filing timestamp is authoritative when available.
6. Missing required data fails closed; no forward-fill of unknowable data.
7. PIT and execution are separate layers.
8. A future-read contamination invalidates the entire research run.
9. Portfolio D is an upper-bound diagnostic and never tradable.
10. No result may be used for strategy promotion unless it is OOS and passes the
    precommitted gate.
11. All costs must be reported as estimated all-in transaction costs; never call
    them exact net P&L.
12. Every trade gets a stable Trade Identity Ledger record.
13. Every research run gets a manifest containing code/data/config hashes.
14. Performance outputs are prohibited while R1 lockbox is closed.

## Trade Identity Ledger — minimum fields

tradeId, signalId, strategyId, arm, symbol, sector, clusterId, signalTimestamp,
entryTimestamp, exitTimestamp, direction, signalEntryPrice, actualEntryPrice,
initialStop, finalExitPrice, quantity, grossPnl, allInCosts, netPnl, netRMultiple,
MAE, MFE, exitReason, regime, dataSnapshotHash, runId, parameterHash,
createdAt, provenance.

## Walk-forward

Default: 36 calendar months train, 12 calendar months untouched OOS, sequential
rolling windows. Training is for parameter selection only. The production strategy
logic itself remains frozen.

## Statistical reporting

For every arm and OOS window report:
N, net P&L, expectancy in R, PF, win rate, MAE/MFE, drawdown, Calmar/Sortino,
bootstrap 95% CI for expectancy, P(E>0), P(E>0.20R), and cost sensitivity.

## Promotion gate

Default precommitment:
N >= 150 trades, E_net >= +0.20R, PF >= 1.40, MaxDD <= 20%, Calmar >= 1,
regime robustness, and stability at 2x modeled slippage/cost stress.

Decision states:
PROMOTE / RETAIN AS RISK CONTROL / REJECT/REVISE.

## Developer completion checklist

- [ ] Existing v6.2 source hash unchanged
- [ ] R1 PIT 10/10
- [ ] Integrated PIT fixture
- [ ] Full repository TypeScript compile
- [ ] Signal adapter uses frozen engines
- [ ] No future-read contamination
- [ ] Execution simulator deterministic
- [ ] Trade ledger complete
- [ ] A/B/C/D arms isolated
- [ ] A-G and leave-one-out ablations
- [ ] 36m/12m rolling OOS
- [ ] Cost sensitivity
- [ ] Bootstrap uncertainty
- [ ] Regime analysis
- [ ] Promotion gate
- [ ] Final lockbox
