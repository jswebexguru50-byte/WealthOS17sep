# WEALTHOS v6.4.2 — CURRENT PIT LINEAGE FORENSIC REPORT

## Executive Summary
WealthOS v6.4.2 conducted a forensic audit to establish why the v6.4/v6.4.1 dataset produced a static 500-member universe across 2020–2024 instead of genuine point-in-time (PIT) index membership intervals.

## Exact Root Cause
The root cause is a **single-snapshot current-universe backfill flaw**:

1. **Source Ingestion Flaw**: `scripts/pull_universe_screener_fundamentals.cjs` fetched `ind_nifty500list.csv` from NSE Archives, which is a live, single-point-in-time snapshot of today's constituents containing zero historical rebalance metadata.
2. **Interval Backfill Flaw**: `scripts/build_v6.4_data_expansion.ts` looped through 500 symbols and hardcoded `effective_from: "2020-01-01"` and `effective_to: "2024-12-31"` for all 500 items.
3. **Validation Flag**: The v6.4.1 independent validator derived constituent set hashes across 10 semi-annual rebalance dates (2020 to 2024) and correctly flagged `distinctConstituentSets = 1`, `entryEvents = 0`, `exitEvents = 0` (`LIKELY_STATIC_UNIVERSE`).
