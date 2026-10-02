# WealthOS Fundamental Intelligence Calibration Pilot — Baseline Assessment

## Executive Summary
This baseline assessment documents the calibration of WealthOS's production fundamental analysis capability across the **200-company calibration cohort**.
The evaluation was executed against a disposable copy of `portfolio.db` with `persist: false`, preserving all production data with cryptographic SHA-256 before-and-after verification.

## Universal Review Protocol Compliance
- **Core Principle**: *No evidence = no conclusion.*
- **Zero Fabrication**: No missing financial figure was defaulted to zero or estimated.
- **Fail-Closed QGLP**: QGLP emitted `DATA_INSUFFICIENT` for companies lacking verified Capex, FCF, or forensic statutory evidence rather than assigning synthetic scores.
- **Period & Scope Integrity**: Annual vs. quarterly and Consolidated vs. Standalone scopes were preserved without cross-contamination.

## Cohort Summary
- **Total Companies**: **200**
- **Large Cap (>₹20,000 Cr)**: **50**
- **Mid Cap (₹5,000–₹20,000 Cr)**: **75**
- **Small Cap (<₹5,000 Cr)**: **75**
- **Seven-Strategy Candidates Covered**: **77** (Quota: $\ge 50$)
- **Portfolio Held Companies Covered**: **49** (Quota: $\ge 25$)
- **Data-Challenged Companies Covered**: **200** (Quota: $\ge 25$)
- **Promoter Pledged**: **13** | **Unpledged**: **187**
- **High Institutional (>25%)**: **33** | **Low Institutional (<5%)**: **80**
- **Positive CFO**: **82** | **Negative CFO**: **90**
- **Short History / Recently Listed**: **15** (Quota: $\ge 10$)
- **Thinly Traded / Low Liquidity**: **13** (Quota: $\ge 10$)
- **Corporate Actions / Deals Disclosed**: **65** (Quota: $\ge 10$)
- **Trendlyne MCP Covered**: **85**

## Cryptographic State Invariance
- **Production DB SHA-256 (Before)**: `3c62b9380e8a500aceee07fd67286d299f7cba05873cd082bede8c513001d3d4`
- **Zero Production Mutations**: Verified by before-and-after SHA-256 comparison.
