# WEALTHOS PHASE 2.1 — S1–S10 NIFTY 500 HISTORICAL SIGNAL FORENSIC REPLAY (CALENDAR CORRECTED)

## 1. Executive Summary
- **Primary Review Period**: 20-Mar-2026 to 05-Apr-2026 (17 Calendar Days)
- **NSE Trading Sessions**: 7 Valid Sessions (`20-Mar`, `23-Mar`, `24-Mar`, `25-Mar`, `27-Mar`, `30-Mar`, `02-Apr`)
- **Exchange Holidays**: 4 Days (`26-Mar` Ram Navami, `31-Mar` Mahavir Jayanti, `01-Apr` Annual Bank Closing, `03-Apr` Good Friday)
- **Weekends**: 6 Days (`21-Mar`, `22-Mar`, `28-Mar`, `29-Mar`, `04-Apr`, `05-Apr`)
- **PIT Universe**: NIFTY500_PIT_UNIVERSE
- **Evaluated Security-Days**: 3500 (500 PIT x 7 Sessions)
- **Dataset Version**: V674-S110-V1 (`26F39782D388A233F444F7BF046CC765D59554C355DA9DC9B985B60470024FE9`)
- **Git Commit SHA**: `40b88c4080145417ba1083b917387f7d024b1001`
- **Total Strategy Signals Generated**: 6501
- **Signals with Downstream Context**: 6501 (`SIGNALS_WITH_DOWNSTREAM_CONTEXT`)
- **Unique Stocks Signaled**: 500
- **Multi-Dimensional Clean-Room Match**: 100% MATCH (`Signal, Parameter & Outcome Hashes Identified`)

---

## 2. Selection Rule Immutability
> **Absolute Principle**: S1–S10 parameters ALONE determine whether a stock is selected by a strategy (`Sx = TRUE/FALSE`). Downstream systems (FERE, QGLP, Smart Money, Double Momentum, Sector Rotation, Valuation, Market Regime, Risk, Capital Protection, Fractional Kelly) are ADDITIONAL INFORMATION ONLY (`SIGNALS_WITH_DOWNSTREAM_CONTEXT`) and NEVER modify `Sx = TRUE/FALSE`.

---

## 3. Daily Signal Summary Table
| Date | Day Classification | Session | PIT Size | Evaluated | Signals | Unique Stocks | Near Misses |
|---|---|---|---|---|---|---|---|
| 2026-03-20 | TRADING_DAY | 1 | 500 | 500 | 951 | 446 | 2947 |
| 2026-03-21 | SATURDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-03-22 | SUNDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-03-23 | TRADING_DAY | 2 | 500 | 500 | 930 | 444 | 3010 |
| 2026-03-24 | TRADING_DAY | 3 | 500 | 500 | 939 | 446 | 3022 |
| 2026-03-25 | TRADING_DAY | 4 | 500 | 500 | 937 | 449 | 2985 |
| 2026-03-26 | EXCHANGE_HOLIDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-03-27 | TRADING_DAY | 5 | 500 | 500 | 849 | 428 | 3084 |
| 2026-03-28 | SATURDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-03-29 | SUNDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-03-30 | TRADING_DAY | 6 | 500 | 500 | 953 | 452 | 2991 |
| 2026-03-31 | EXCHANGE_HOLIDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-04-01 | EXCHANGE_HOLIDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-04-02 | TRADING_DAY | 7 | 500 | 500 | 942 | 449 | 2969 |
| 2026-04-03 | EXCHANGE_HOLIDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-04-04 | SATURDAY | - | 500 | 0 | 0 | 0 | 0 |
| 2026-04-05 | SUNDAY | - | 500 | 0 | 0 | 0 | 0 |
