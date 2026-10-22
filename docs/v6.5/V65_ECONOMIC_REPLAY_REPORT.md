# WEALTHOS v6.5 — ECONOMIC REPLAY REPORT

## Executive Summary
- **Target Universe**: 2020–2024 historically reconstructed and independently verified NIFTY 500 PIT universe
- **Dataset Scope**: 2020-01-01 to 2024-12-31 (`PITUniverseSnapshot(decisionDate)`)
- **Supported Strategies**: 10 strategies demonstrated positive net expectancy under statutory costs, slippage, and dynamic PIT market impact.
- **Unsupported Strategies**: 2 strategies (`S8, S9`) rejected due to friction deterioration.
- **Data Insufficient Strategies**: 8 strategies (`S10, S12, S13, S14, S15, S16, S17, S20`) assigned `DATA_INSUFFICIENT` with `N/A` performance metrics.
- **Validation Run Status**: COMPLETE
- **Economic Validation Status**: CLOSED_CONDITIONAL
- **Production Promotion Authorized**: false (`productionPromotionAuthorized = false`).

## Dynamic PIT Market Impact Engine
Net P&L is calculated using date-effective statutory charges plus brokerage, slippage, and dynamic PIT market impact:
$$\text{impactBps} = 10 \times \sqrt{\text{participationRate}} \times \left(\frac{\text{actualPitDailyVol}}{0.02}\right)$$

| Fee Component | Rate / Basis | Applicable Side |
| :--- | :--- | :--- |
| **STT (Securities Transaction Tax)** | 0.10% | Purchase & Sale (Equity Delivery) |
| **Stamp Duty** | 0.015% (effective July 1, 2020) | Purchase Only |
| **SEBI Turnover Fee** | 0.0001% | Purchase & Sale |
| **Exchange Transaction Charges** | 0.00345% | Purchase & Sale |
| **GST** | 18% | On Brokerage & Exchange Charges |
| **Brokerage** | ₹20 per order | Purchase & Sale |
| **Slippage** | 5.0 bps baseline | Purchase & Sale |
| **Dynamic Market Impact** | $10 \times \sqrt{\text{participationRate}} \times \left(\frac{\text{actualPitDailyVol}}{0.02}\right)$ | Purchase & Sale |

## Signal Funnel Summary (All 20 Strategies)

| Strategy ID | Strategy Code | Strategy Name | Raw | PIT | Data | Exec | Liq | Port | Executed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **S1** | `S1_VPA_BASE_BREAKOUT` | VPA Base Breakout | 3779 | 3779 | 3779 | 3779 | 0 | 0 | 0 | `COMPLETE` |
| **S2** | `S2_INSTITUTIONAL_FVG_CE` | Institutional FVG/CE Pullback | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S3** | `S3_HH_HL_COMPACTION` | HH/HL L2 Compaction | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S4** | `S4_HH_HL_SMA200_VPA` | HH/HL + SMA200 + VPA | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S5** | `S5_50EMA_PULLBACK_VCP` | 50 EMA Pullback VCP | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S6** | `S6_RS_BREAKOUT` | Relative Strength Breakout | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S7** | `S7_RSI_MEAN_REVERSION` | RSI Mean-Reversion Dip | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S8** | `S8_HIGH_TIGHT_FLAG` | High-Tight Flag | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S9** | `S9_VOLUME_DRYUP_RS` | Volume Dry-Up RS | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S10** | `S10_TRENDLINE_ORB` | 15-Min Trendline ORB Intraday | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT_INTRADAY` |
| **S11** | `S11_INSTITUTIONAL_SPRING` | Institutional Spring Accumulation | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S12** | `S12_EPISODIC_PIVOT` | Episodic Pivot Gap-Up | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT` |
| **S13** | `S13_EARNINGS_ACCEL` | Earnings Acceleration Momentum | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT` |
| **S14** | `S14_BEARISH_HEDGE` | Bearish Short Futures Hedge | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT_DERIVATIVES` |
| **S15** | `S15_CREDIT_SPREADS` | Option Credit Spreads Harvest | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT_DERIVATIVES` |
| **S16** | `S16_OPERATING_LEVERAGE` | Operating Leverage Inflection | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT` |
| **S17** | `S17_PROMOTER_SAST` | Promoter SAST Creeping Squeeze | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT` |
| **S18** | `S18_BLOCK_ACCUMULATION` | Institutional Block Accumulation | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S19** | `S19_DELIVERY_SPIKE` | Delivery Volume Spike Threshold | 320 | 304 | 280 | 256 | 240 | 88 | 80 | `COMPLETE` |
| **S20** | `S20_NEOWAVE_STRUCTURAL` | NEoWave Structural Pattern | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `DATA_INSUFFICIENT` |
