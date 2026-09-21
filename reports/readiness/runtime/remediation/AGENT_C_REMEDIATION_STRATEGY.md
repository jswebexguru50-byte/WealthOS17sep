# Agent C: Identity Anomalies Remediation Strategy

## Overview
During Phase 10 RM identity reconciliation, **8 records** across three distinct symbols (`GFSTEELS`, `ALPSINDUS`, `NAGAFERT`) were flagged with `IDENTITY_UNRESOLVED` and placed into `QUARANTINE`. 

## Root Cause Analysis
These instruments violated standard OHLC invariants (e.g., `high < open` or `low > open`) and their symbols could not be found in the `MasterTickers` directory. Without a master ticker match, an authoritative ISIN or provider key cannot be resolved. Consequently, any attempted corrections against external archives (like BSE/NSE Bhavcopies) fail because the historical identifier cannot be bridged to a known exchange code.

### The 8 Anomalies Breakdown
- **GFSTEELS (3 records)**: Violated OHLC invariants on 2020-10-13, 2020-11-06, 2021-06-18.
- **ALPSINDUS (4 records)**: Violated OHLC invariants on 2020-11-06, 2023-02-15, 2023-04-17, 2023-06-14.
- **NAGAFERT (1 record)**: Violated OHLC invariants on 2025-05-02.

## Recommended Remediation Strategy

Since these records currently pose no risk of polluting the production database (due to their `QUARANTINE` status and `production_db_written: false`), we can handle them out-of-band using the following strategy:

### 1. Manual Identifier Bridging (Override Dictionary)
A static lookup dictionary must be implemented to manually bridge these legacy/defunct symbols to their canonical ISINs if they are confirmed as valid historical instruments. 
- E.g., if `ALPSINDUS` represents Alps Industries Ltd, its historical ISIN (INE093B01015) can be hardcoded into an `identity_overrides.json` file.

### 2. Archival Discard (Soft Delete)
If financial analysis determines that these instruments are completely defunct, delisted, and hold zero historical weight for strategy performance or tax tracking, the records should be transitioned from `QUARANTINE` to `TERMINAL_DISCARD`.

### 3. Continued Quarantine (Default)
Until a manual mapping or discard directive is issued by the operations team, the records will remain in `QUARANTINE`. This preserves the safety boundary required for R4 certification. 

## Action Plan
1. **Maintain Quarantine**: Confirm that M6 pipeline drops any updates for `GFSTEELS`, `ALPSINDUS`, and `NAGAFERT`.
2. **Review with Domain Experts**: Request the operations team to review the 3 tickers and decide whether to map them to valid ISINs or discard them.
3. **Apply Overrides**: Apply the decision via a manual `identity_overrides` script prior to final execution.
