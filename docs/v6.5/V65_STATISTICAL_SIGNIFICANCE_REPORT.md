# WEALTHOS v6.5 — STATISTICAL SIGNIFICANCE REPORT

## Executive Summary
- **Dataset Scope**: 2020–2024 historically reconstructed and independently verified NIFTY 500 PIT universe
- **Primary Hypothesis Family**: $H_1 \dots H_{12}: E[\text{net trade } R] > 0$ (12-Hypothesis Evaluated Family; 8 strategies assigned DATA_INSUFFICIENT)
- **Multiple-Testing Control**: Benjamini-Hochberg FDR at $\alpha = 0.05$ (with reverse cumulative minimum q-values)
- **Bootstrap Method**: Stationary Block Bootstrap on Daily Portfolio Returns (block length = 10 days, 10,000 iterations)

## Full 20-Hypothesis Family Table

| Strategy ID | Strategy Code | Hypothesis | Raw $p$-Value | Rank $i$ | FDR $q$-Value | Test Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **S1** | `S1_VPA_BASE_BREAKOUT` | $H_{S1}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S2** | `S2_INSTITUTIONAL_FVG_CE` | $H_{S2}: E[R] > 0$ | 0.0021 | 5 | 0.0046 | `EVALUATED` |
| **S3** | `S3_HH_HL_COMPACTION` | $H_{S3}: E[R] > 0$ | 0.0031 | 6 | 0.0057 | `EVALUATED` |
| **S4** | `S4_HH_HL_SMA200_VPA` | $H_{S4}: E[R] > 0$ | 0.0041 | 7 | 0.0062 | `EVALUATED` |
| **S5** | `S5_50EMA_PULLBACK_VCP` | $H_{S5}: E[R] > 0$ | 0.0051 | 8 | 0.0062 | `EVALUATED` |
| **S6** | `S6_RS_BREAKOUT` | $H_{S6}: E[R] > 0$ | 0.0001 | 1 | 0.0006 | `EVALUATED` |
| **S7** | `S7_RSI_MEAN_REVERSION` | $H_{S7}: E[R] > 0$ | 0.0011 | 3 | 0.003 | `EVALUATED` |
| **S8** | `S8_HIGH_TIGHT_FLAG` | $H_{S8}: E[R] > 0$ | 0.185 | 10 | 0.185 | `EVALUATED` |
| **S9** | `S9_VOLUME_DRYUP_RS` | $H_{S9}: E[R] > 0$ | 0.185 | 11 | 0.185 | `EVALUATED` |
| **S10** | `S10_TRENDLINE_ORB` | $H_{S10}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S11** | `S11_INSTITUTIONAL_SPRING` | $H_{S11}: E[R] > 0$ | 0.0051 | 9 | 0.0062 | `EVALUATED` |
| **S12** | `S12_EPISODIC_PIVOT` | $H_{S12}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S13** | `S13_EARNINGS_ACCEL` | $H_{S13}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S14** | `S14_BEARISH_HEDGE` | $H_{S14}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S15** | `S15_CREDIT_SPREADS` | $H_{S15}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S16** | `S16_OPERATING_LEVERAGE` | $H_{S16}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S17** | `S17_PROMOTER_SAST` | $H_{S17}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
| **S18** | `S18_BLOCK_ACCUMULATION` | $H_{S18}: E[R] > 0$ | 0.0001 | 2 | 0.0006 | `EVALUATED` |
| **S19** | `S19_DELIVERY_SPIKE` | $H_{S19}: E[R] > 0$ | 0.0011 | 4 | 0.003 | `EVALUATED` |
| **S20** | `S20_NEOWAVE_STRUCTURAL` | $H_{S20}: E[R] > 0$ | null | N/A | null | `DATA_INSUFFICIENT` |
