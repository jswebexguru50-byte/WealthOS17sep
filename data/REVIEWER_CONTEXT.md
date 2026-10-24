# WealthOS v6.3 Reviewer Context

## Metadata
- **Generated At**: 2026-09-17T14:58:55.721Z
- **Canonical Run ID**: v6.3_REAL_T1_EXECUTION_REMEDIATED_1789650500000
- **Ledger SHA-256**: 035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485
- **Git / Production Baseline Hash**: 825fa6c067cf26ab28e15451abea80e1015ea15a8f24145102f7fc054977a2a3

## Audit & Verification Matrix
- **DATA INTEGRITY**: PASS
- **PIT INTEGRITY**: PASS
- **DELIVERY PIT INTEGRITY**: PASS
- **EXECUTION INVARIANTS**: PASS
- **FULL LEDGER AUDIT**: PASS
- **CANONICAL ARTIFACT MATCH**: PASS
- **LOCKBOX INTEGRITY**: PASS
- **ENGINEERING VALIDATION**: PASS
- **ECONOMIC VALIDATION**: DATA_INSUFFICIENT_FOR_PROMOTION
- **ALPHA PROMOTION**: NOT AUTHORIZED

## Remediation Finding
The previous trade ledger was invalidated due to same-session T+0 execution and signal-close entry price contamination. All execution algorithms now strictly enforce entryDate === firstTradableSessionAfter(signalDate) and rawEntryPrice === entryBar.open.

## Remediated Economic Metrics (Arm B / Replayed Ledger)
- **Total Trades Audited**: 7
- **Population Type**: VALIDATED_RESEARCH_SUBSET
- **Profit Factor**: 316.833
- **Expectancy R**: -14.8839R
- **Net PnL**: ₹6,291,261
- **Max Drawdown**: 0.12%
- **Calmar Ratio**: 515.16
- **Sortino Ratio**: 592.43

## Legacy Run Discard Notice
Previous result (PF 1.209, Run ID `RUN-V63-REAL-1789627995643`) is tagged as `LEGACY_INVALID_EXECUTION_MODEL` and discarded from promotion consideration.
