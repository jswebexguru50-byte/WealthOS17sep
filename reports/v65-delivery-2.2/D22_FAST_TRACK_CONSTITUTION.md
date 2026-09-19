# D2.2 Fast-Track Constitution

Version: 1.0

## Purpose

This constitution governs the D2.2 fast-track data-enrichment,
filter-engineering, empirical-replay and production-readiness
pipeline.

The purpose is to permit additive engineering while preserving
the integrity guarantees established by CP2.1.

## 1. CP2.1 Ancestry

All D2.2 work must descend from:

6d0e78f5b394e882212d67c76edfd21df7705981

The CP2.1 baseline must not be rewritten.

## 2. Frozen Controls

The following seven files are immutable:

- src/server/services/PureTechnicalStrategiesEngine.ts
- src/server/services/StrategyParameterConfig.ts
- src/server/services/SignalQualityOverlay.ts
- src/server/services/CapitalProtectionEngine.ts
- src/server/services/NewTechnicalStrategiesEngine.ts
- src/server/services/UpstoxIntradayIngestor.ts
- data/v6.3_REAL_trade_identity_ledger.jsonl

Any byte-level modification is a hard stop.

## 3. Existing Strategy Immutability

D2.2 additional filters must not modify existing strategy logic.

The original strategy signal must remain independently reconstructable.

The architecture is:

REAL DATA
→ EXISTING STRATEGY
→ ORIGINAL SIGNAL
→ ADDITIONAL FILTER
→ QUALIFIED RESULT

The additional filter layer must never rewrite the original signal.

## 4. Authentic Data Only

The following are prohibited as production evidence:

- fabricated OHLCV
- synthetic market prices
- synthetic timestamps
- simulated historical observations
- strategy-ID-derived statistics
- arbitrary entry prices
- arbitrary exit prices
- formula-generated historical trades
- current data substituted for historical data
- current index constituents substituted for historical constituents
- current sector classifications substituted for historical classifications

Synthetic fixtures may exist only in isolated unit tests and must
never enter empirical datasets or production ledgers.

## 5. Point-in-Time Integrity

Historical decisions may only consume information that was available
at or before the decision timestamp.

PIT states are:

- PIT_VERIFIED
- PIT_NOT_VERIFIABLE
- PIT_INVALID
- NOT_APPLICABLE

PIT_NOT_VERIFIABLE and PIT_INVALID are never promotion-valid.

## 6. Missing Data

Missing evidence must fail closed.

Permitted outcomes include:

- DATA_INSUFFICIENT
- BLOCKED
- NOT_APPLICABLE

Missing data must never silently become PASS.

No forward filling, interpolation or current-value substitution is
permitted unless explicitly documented and independently authorized
for the relevant dataset.

## 7. Market Calendar

Historical market observations must be validated against the
appropriate exchange calendar.

Fabricated bars are prohibited.

## 8. Corporate Actions

The price basis used by each dataset must be explicitly documented.

Corporate-action treatment must be consistent across:

- signal generation
- entry
- exit
- return calculation
- economic-cost calculation
- replay

## 9. Intraday Data

15-minute observations must retain:

- bar start timestamp
- bar end timestamp
- provider timestamp
- observation timestamp
- acquisition timestamp
- source
- dataset ID
- observation hash

Only closed bars may generate normal historical signals unless an
explicit live-data policy permits otherwise.

## 10. Canonical Evidence Hashing

Canonical observation hashes must be deterministic.

Invalid numeric values such as:

- NaN
- Infinity
- -Infinity

must cause canonicalization failure.

They must never silently become JSON null.

## 11. Dataset Promotion

Dataset promotion is evidence-driven.

A dataset may only be promoted when all required validation checks
pass.

Possible decisions are:

- PROMOTE
- REJECT
- DATA_INSUFFICIENT

The caller must not be able to directly assert PROMOTE.

## 12. Ledger Integrity

Canonical trade ledgers must be sealed before economic metrics consume
them.

Metrics must verify the ledger identity before calculation.

## 13. Replay Integrity

Empirical replay must use:

REAL HISTORICAL DATA
→ REAL STRATEGY
→ REAL SIGNAL
→ REAL ENTRY
→ REAL EXIT
→ DATE-EFFECTIVE COSTS
→ CANONICAL LEDGER

No fabricated trades are permitted.

## 14. Additive Development

New D2.2 commits are permitted after the CP2.1 baseline.

Repository-wide byte equality with the CP2.1 tree is not required.

The following remain immutable:

- CP2.1 ancestry
- frozen controls
- constitution
- authorized control-plane root

## 15. Force Push

Force-push and history rewriting of the authorized control-plane
branch/tag are prohibited.

## 16. Production Authorization

Passing unit tests does not constitute production authorization.

Production authorization requires:

- verified data provenance
- PIT validation
- calendar validation
- corporate-action validation
- frozen-control verification
- strategy immutability
- empirical replay
- canonical ledger sealing
- replay reconciliation
- independent verification

## 17. Hard Stops

The following immediately block progression:

- frozen-control modification
- synthetic production evidence
- future-data leakage
- invalid PIT evidence
- missing required PIT evidence
- current constituents used historically
- current sector mapping used historically
- fabricated timestamps
- fabricated market observations
- unlocked ledger consumed by metrics
- replay reconciliation failure
- unverifiable dataset provenance
- failed dataset promotion gate

## 18. Control-Tower Status

The control tower must distinguish:

- ACQUIRING
- BLOCKED
- VERIFIED

Creation of staging directories is not evidence of dataset readiness.

## 19. Auditability

Every promoted dataset must have:

- dataset ID
- provider
- source
- acquisition timestamp
- coverage
- row count
- SHA-256
- PIT status
- calendar status
- price basis
- validation status
- readiness status

## 20. Human Authorization

This constitution does not authorize investment decisions.

It defines software/data-integrity controls required before WealthOS
may expose empirical strategy results or production recommendations.
