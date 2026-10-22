# WEALTHOS CONTROL PATH & REPRODUCIBILITY INVARIANTS

This document records the immutable control path of WealthOS across all releases (v6.3, v6.4.1, v6.4.2, v6.4.3, v6.5, v6.6, v6.7).

## Immutable Control Invariant
```text
v6.5_PURE_TECHNICAL_BASELINE must remain 100% reproducible after all v6.6/v6.7 changes.
```

---

## Control Path Audit Table

| Control Version | Source SHA-256 | Dataset SHA-256 | Configuration SHA-256 | Replay ID | Ledger SHA-256 | Equity SHA-256 | Unit Test Count | Authorization State |
|---|---|---|---|---|---|---|---|---|
| **v6.3** | `035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485` | `portfolio.db` | `v63_config` | `REPLAY_V63_CANONICAL` | `035d8867f1f8...` | N/A | 14 | `CANONICAL_LOCKBOX_ONLY` |
| **v6.4.1** | `14359` bytes | `v6.4.1_pit_data` | `v641_config` | `REPLAY_V641_PIT` | `v641_ledger_sha` | N/A | 18 | `PIT_RECONSTRUCTION_CLOSED` |
| **v6.4.2** | `29666` bytes | `V642_PIT_DATA_VALIDATION_CLOSED` | `v642_config` | `REPLAY_V642_CLOSURE` | `v642_ledger_sha` | N/A | 26 | `V642_PIT_DATA_VALIDATION_CLOSED` |
| **v6.4.3** | `6978` bytes | `v643_pit_extension` | `v643_config` | `REPLAY_V643_CURRENT` | `v643_ledger_sha` | N/A | 32 | `PIT_EXTENSION_ACTIVE` |
| **v6.5 Baseline** | `ed18f3b9a403cf26da954e43bf7e95942aa35f368c61f643eef6c2da869f60b8` | `V642_PIT_DATA_VALIDATION_CLOSED` | `v6.5_pure_technical` | `REPLAY_V65_ED18F3B9A403` | `f2177c218c0fee5e139d563fff3f43f2b9a2ad75cdae4c96ff9228cb71a1fec3` | `2a274cda1cd1a1f428782e3ee8b0ae058c45d442af0c715657dae06c91d5cabc` | 49 | `REMEDIATED_EMPIRICAL_REPLAY` (`promotion=false`) |

---

## Frozen Source Hashes (Phase 0 Immutability Guard)

- `src/server/services/PureTechnicalStrategiesEngine.ts`: `825fa6c067cf26ab28e15451abea80e1015ea15a8f24145102f7fc054977a2a3`
- `src/server/services/StrategyParameterConfig.ts`: `901ca7a27b2eb4e09183426c9e0dfd7b812aeebf84472b49b9f829661fe7194b`
- `src/server/services/SignalQualityOverlay.ts`: `c41cddb152c150bea932a8b9bd8fcc6ea01a03a2ba030a723789aaada5c17452`
- `src/server/services/CapitalProtectionEngine.ts`: `63b8317889f5a60e9462f883e89acb57fe99e819935ec8f7b30036ecfe4ed753`
- `src/server/services/NewTechnicalStrategiesEngine.ts`: `78415ba3c74ca6a9cc2fcc96d2e54ba871e9bca73fc6e078570c412781b1d354`
- `src/server/services/UpstoxIntradayIngestor.ts`: `0f1c96d0e0c704672517f378990e17facdced7bfbf359daf9c6f37333be1b151`
- `data/v6.3_REAL_trade_identity_ledger.jsonl`: `035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485`

---

## Governance Assertion
`productionPromotionAuthorized = false` strictly enforced across all v6.6 and v6.7 pipelines.
