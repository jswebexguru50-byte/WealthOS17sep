# Lane B.1 Baseline

LANE B.1 STARTED
Baseline: 5ce3dd21ce8d49df6a163f8c9e5bdb02a94bbbf8
Frozen controls: VERIFIED
Current blockers: 6
Parallel agents: A-F
Empirical acquisition: DISABLED
FILTER_DATA_READY: false

## Frozen Hashes
All 7 controls verified unchanged:
1. `src/server/services/PureTechnicalStrategiesEngine.ts`: `825FA6C067CF26AB28E15451ABEA80E1015EA15A8F24145102F7FC054977A2A3`
2. `src/server/services/StrategyParameterConfig.ts`: `901CA7A27B2EB4E09183426C9E0DFD7B812AEEBF84472B49B9F829661FE7194B`
3. `src/server/services/SignalQualityOverlay.ts`: `C41CDDB152C150BEA932A8B9BD8FCC6EA01A03A2BA030A723789AAADA5C17452`
4. `src/server/services/CapitalProtectionEngine.ts`: `63B8317889F5A60E9462F883E89ACB57FE99E819935EC8F7B30036ECFE4ED753`
5. `src/server/services/NewTechnicalStrategiesEngine.ts`: `78415BA3C74CA6A9CC2FCC96D2E54BA871E9BCA73FC6E078570C412781B1D354`
6. `src/server/services/UpstoxIntradayIngestor.ts`: `0F1C96D0E0C704672517F378990E17FACDCED7BFBF359DAF9C6F37333BE1B151`
7. `data/v6.3_REAL_trade_identity_ledger.jsonl`: `035D8867F1F8DBC65F9FE35EA45263F20F9FEE00A48D3D7F48807C24A2AFD485`

## Identified Blockers
1. IndependentVerifier implements only ~12 of 21 predicates.
2. Raw hash verification can fail open when physical raw file is absent.
3. DatasetManifestWriter and IndependentVerifier use different canonical serialization paths.
4. Acquisition dates remain hard-coded in B1/B2/B3/B6.
5. B6 describes chunking but does not actually chunk provider requests.
6. Adversarial tests need physical-byte tamper tests.
(And CP2.1 regression D2-RI-14 / D2-RI-16 to be investigated).
