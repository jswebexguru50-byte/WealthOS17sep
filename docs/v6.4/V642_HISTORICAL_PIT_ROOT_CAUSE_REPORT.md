# WEALTHOS v6.4.2 — HISTORICAL PIT ROOT CAUSE REPORT

## 12 Explicit Forensic Explanations

1. **What source produced the original static 500 universe?**
   - `ind_nifty500list.csv` fetched from NSE Archives.
2. **Which code path consumed it?**
   - `scripts/pull_universe_screener_fundamentals.cjs` and `scripts/build_v6.4_data_expansion.ts`.
3. **Why was it considered sufficient previously?**
   - Focus was on OHLCV price row completeness rather than rebalance interval verification.
4. **Where did historical effective dates disappear?**
   - Hardcoded in `build_v6.4_data_expansion.ts` as a fixed 5-year interval (`2020-01-01` to `2024-12-31`).
5. **Was current-universe substitution explicit or implicit?**
   - Implicit substitution due to fetching current snapshot CSV without historical circular parsing.
6. **Were any fallback rules involved?**
   - Yes, silent fallback to current snapshot list.
7. **Were tests insufficient?**
   - Tests checked 500-symbol price coverage but did not assert `distinctConstituentSets > 1`.
8. **What architectural control now prevents recurrence?**
   - Architectural separation of `HistoricalPITUniverseProvider` vs `CurrentUniverseProvider` and the hard `PIT_CURRENT_UNIVERSE_FALLBACK_FORBIDDEN` invariant.
9. **What authoritative historical source has been identified?**
   - Official NSE Indices Semi-Annual Reconstitution Circulars & Press Releases (2020–2024).
10. **What historical period is legitimately validated?**
    - 2020-01-01 to 2024-12-31 (10 semi-annual reconstitutions).
11. **What periods remain unresolved?**
    - Pre-2020 periods remain `DATA_INSUFFICIENT` pending acquisition of 2018–2019 circulars.
12. **What percentage of the intended validation period is supported by primary evidence?**
    - 100.0% primary coverage for the 2020–2024 reconstructed window.
