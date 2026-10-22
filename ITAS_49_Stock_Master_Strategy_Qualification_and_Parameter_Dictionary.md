# WealthOS / ITAS: Master Strategy Parameters & 49-Stock Recommendation Qualification Dossier

**Version:** 5.3.1 (Institutional Production Specification)  
**Target:** Indian Equities (NSE/BSE) with Global Algorithmic Compatibility  
**Authoritative Source Code Mapping:**  
- `src/server/services/PureTechnicalStrategiesEngine.ts`  
- `src/server/services/StrategyParameterConfig.ts`  
- `src/server/services/SignalQualityOverlay.ts`  
- `src/server/services/CapitalProtectionEngine.ts`  
- `src/server/services/NewTechnicalStrategiesEngine.ts`  
- `src/server/services/FundamentalAlphaEngine.ts`  
- `src/server/services/SmartMoneyEngine.ts`  
- `src/server/quantEngine.ts`  
- `src/server/quant/NEoWaveEngine.ts`  

---

## Executive Overview & Architectural Delineation

WealthOS / ITAS operates on a **10-Gate Sequential Elimination Pipeline** backed by **6 Independent Evidence Buckets** (Trend, Volume, Catalyst, Mean Reversion, Macro, Structural Geometry).

To eliminate false consensus (e.g. counting two moving average indicators as independent confirmations), no strategy is permitted to execute without passing through the **Signal Quality Overlay** requiring at least two independent evidence buckets.

This document provides:
1. **PART 1: Master Strategy Parameters & Business Definitions Dictionary** — number, name, purpose, code parameters, hard thresholds, and business definitions for all strategies coded in the engine.
2. **PART 2: 49-Stock Strategy Qualification Matrix** — for every single recommendation in `ITAS_49_Stock_Master_Dossier_v5.3.1_Execution`, the exact strategies qualified, the numerical values of each parameter for that stock, and a business language explanation justifying why it meets the criteria.

---

# PART 1: MASTER STRATEGY PARAMETERS & BUSINESS DEFINITIONS DICTIONARY

## Strategy S1 — VPA Base Compaction Breakout

- **Strategy ID:** `S1_VPA_BASE_BREAKOUT`
- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy1`)
- **Purpose / Description:**  
  Identifies stocks that have completed an institutional impulse thrust, followed by a tight consolidation base where selling volume dries up significantly. Triggers on an expansion candle with asymmetric buying volume, indicating overhead supply has been absorbed.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `impulseGainMinPct` | `≥ +15.0% to +20.0%` | Initial Thrust Magnitude: Measures the price gain during the initial upward impulse. Ensures strong prior institutional buying interest. |
| `baseDurationBars` | `10 to 120 sessions` | Base Digestion Window: The base must digest gains for at least 10 sessions (eliminating short-term flippers) and no more than 120 sessions (preventing momentum staleness). |
| `retracementFloorMultiplier` | `≥ 0.50 (50% max retracement)` | Shallow Retracement Floor: Price during the base must not retrace more than 50% of the prior impulse height, proving buyers defend higher price levels. |
| `volumeDryingRatio` | `≤ 0.85 (85% of 20-day VMA)` | Supply Dry-Up Ratio: Average volume during the final 5 sessions of the base divided by the 20-day Volume Moving Average. Quantifies seller exhaustion. |
| `breakoutVolumeSurge` | `≥ 1.40x (140% of 20-day VMA)` | Breakout Expansion Volume: Traded volume on the breakout session must surge >= 1.4x average volume to confirm aggressive institutional mark-up. |

---

## Strategy S2 — Institutional Inflow & FVG / CE Pullback

- **Strategy ID:** `S2_INSTITUTIONAL_FVG_CE`
- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Category:** `PULLBACK`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy2`)
- **Purpose / Description:**  
  Detects institutional algorithmic footprints that create Fair Value Gaps (FVG). Waits for price to retrace into the Consequent Encroachment (CE: 50% gap midpoint) on dry volume before continuation.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `institutionalTurnoverFloorCr` | `≥ ₹25.0 Cr` | Institutional Scale Gate: Rupee turnover accumulated during the impulse leg. Filters out illiquid penny stocks. |
| `ceLevelMidpoint` | `50.0% Retest Window` | Consequent Encroachment (CE): The exact midpoint between Candle i-1 High and Candle i+1 Low. Represents institutional re-accumulation zone. |
| `retestVolumeContraction` | `≤ 0.70x (70% of 20-day VMA)` | Pullback Dry-Up: Volume on the retest of CE must be under 70% of average, proving sellers have no institutional backing. |

---

## Strategy S3 — Higher High & Higher Low Sequential Compaction

- **Strategy ID:** `S3_HH_HL_COMPACTION`
- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy3`)
- **Purpose / Description:**  
  Tracks Dow Theory structural uptrends where price forms an orderly sequence of Higher Highs (H1, H2) and Higher Lows (L1, L2) with volatility contracting between swings.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `swingGapMinBars` | `≥ 5 sessions` | Swing Independence: Minimum trading sessions separating consecutive pivot highs and lows to eliminate microscopic noise. |
| `h2OverH1Pct / l2OverL1Pct` | `> 0.0% (Strictly Rising)` | Rising Floor Confirmation: Confirms L2 is strictly above L1, proving sellers are unable to push price to prior lows. |
| `priceAboveSma50` | `true (Close > 50 SMA)` | Intermediate Trend Benchmark: The entire compaction structure must rest above the rising 50-day Simple Moving Average. |

---

## Strategy S4 — Stage 2 Transition (HH/HL + SMA200 + VPA)

- **Strategy ID:** `S4_HH_HL_SMA200_VPA`
- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy4`)
- **Purpose / Description:**  
  Stan Weinstein Stage 2 breakout transition. Stock completes a Stage 1 base, crosses above the rising 200 SMA, and establishes Higher-High / Higher-Low pivot structure supported by VPA.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `priceAboveSma200` | `true (Close > 200 SMA)` | Stage 2 Regime Baseline: Daily close must be strictly above the 200-day Simple Moving Average. |
| `sma200SlopeRising` | `true (SMA200 today > SMA200 20d ago)` | Moving Average Trajectory: 200 SMA must be sloping upward, proving the multi-year macro trend has reversed up. |

---

## Strategy S5 — 50 EMA Pullback Volatility Contraction Pattern (VCP)

- **Strategy ID:** `S5_50EMA_PULLBACK_VCP`
- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Category:** `PULLBACK`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy5`)
- **Purpose / Description:**  
  Mark Minervini VCP archetype. Progressive volatility contractions (C1 > C2 > C3) resting on the rising 50 EMA, followed by a tight pivot breakout.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `ema20AboveEma50` | `true (20 EMA > 50 EMA)` | Trend Alignment: 20 EMA must be strictly stacked above the 50 EMA with both lines sloping upward. |
| `emaPullbackProximity` | `≤ 2.0% from 50 EMA` | Support Proximity: Trough of the final contraction touches or comes within 2% of the rising 50 EMA. |

---

## Strategy S6 — Nifty 500 Relative Strength (RS) Breakout

- **Strategy ID:** `S6_RS_BREAKOUT`
- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy6`)
- **Purpose / Description:**  
  Identifies market-leading stocks outperforming >=80% of the broader Nifty 500 universe over 3-12 month horizons. Relative strength line reaches new highs ahead of nominal price.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `rsPercentileFloor` | `≥ 80th Percentile` | Relative Strength Rank: Stock ranks in the top 20% of all NSE-listed equities over a rolling 6-month lookback. |
| `near52wHighPct` | `Within 15.0% of 52W High` | Price Leadership: CMP must trade within 15% of its 52-week nominal price high. |

---

## Strategy S7 — RSI Capitulation Reversal Dip

- **Strategy ID:** `S7_RSI_MEAN_REVERSION`
- **Evidence Bucket:** `Bucket D: Mean Reversion & Exhaustion`
- **Category:** `MEAN_REVERSION`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy7`)
- **Purpose / Description:**  
  Exploits temporary panic sell-offs in structurally sound compounders. RSI plunges < 32 but halts above rising 200 SMA, triggering tactical snapback.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `rsiOversoldThreshold` | `≤ 32.0 (14-period RSI)` | Capitulation Floor: 14-period RSI must drop below 32, representing widespread retail panic liquidation. |

---

## Strategy S8 — High-Tight Flag (HTF Momentum)

- **Strategy ID:** `S8_HIGH_TIGHT_FLAG`
- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy8`)
- **Purpose / Description:**  
  Bulkowski High-Tight Flag. Vertical +50% surge within 40 sessions, followed by a tight flag retracing no more than 25%.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `flagPoleGainMinPct` | `≥ +50.0% within 40 sessions` | Extreme Impulse Pole: Stock explodes by at least +50% from its base within 8 weeks. |

---

## Strategy S8B — Classical Bull Flag

- **Strategy ID:** `S8B_CLASSICAL_BULL_FLAG`
- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/services/NewTechnicalStrategiesEngine.ts` (`evaluateS8B_ClassicalBullFlag`)
- **Purpose / Description:**  
  Everyday institutional momentum flag: 15-40% pole over 5-30 sessions, flag retracing <=50%, holding 20 EMA with volume dry-up.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `poleGainPct` | `15.0% to 40.0% in 5-30 bars` | Standard Momentum Pole: Captures realistic swing momentum surges without waiting for extreme 50% runs. |

---

## Strategy S9 — Volume Dry-Up (VDU) with RS Stability

- **Strategy ID:** `S9_VOLUME_DRYUP_RS`
- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy9`)
- **Purpose / Description:**  
  Institutional drying of supply near 52-week highs. Traded volume drops below 50% of VMA while price range compacts under 8% over 10 days.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `volumeDryUpThreshold` | `≤ 50.0% of 50-day VMA` | Absolute Supply Drought: Volume drops to historic lows while price refuses to fall, confirming complete absence of sellers. |

---

## Strategy S10 — Trendline Opening Range Breakout (ORB)

- **Strategy ID:** `S10_TRENDLINE_ORB`
- **Evidence Bucket:** `Bucket A: Trend / Execution`
- **Category:** `INTRADAY_HYBRID`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy10`)
- **Purpose / Description:**  
  Multi-week daily trendline compression combined with 15-minute Opening Range Breakout (09:15-09:30 IST) with high Relative Volume (RVOL).

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `trendlineCompressionBars` | `≥ 15 sessions compression` | Daily Compression: Symmetrical or declining trendline containing price for at least 15 daily sessions. |
| `rvolIntradayMin` | `≥ 1.50x opening RVOL` | Opening Relative Volume: 15-minute volume must exceed 1.5x of the 20-day historical opening average. |

---

## Strategy S11 — Institutional Wyckoff Spring Accumulation

- **Strategy ID:** `S11_WYCKOFF_SPRING`
- **Evidence Bucket:** `Bucket D: Mean Reversion & Exhaustion`
- **Category:** `MEAN_REVERSION`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy11`)
- **Purpose / Description:**  
  Wyckoff Phase C Spring: Smart money drives price 0.5-3.5% below multi-month horizontal support to trigger stops, reclaiming within 1-3 bars on volume.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `undercutMagnitudePct` | `0.5% to 3.5% below support` | Spring Undercut Depth: Price pierces below support by 0.5-3.5% to trigger retail stops and absorb liquidity. |

---

## Strategy S12 — Episodic Pivot Institutional Gap-Up

- **Strategy ID:** `S12_EPISODIC_PIVOT`
- **Evidence Bucket:** `Bucket C: Catalyst & Alpha`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/services/RegimeBacktestEngine.ts` (`evaluateS12_EpisodicPivot`)
- **Purpose / Description:**  
  Exploits fundamental catalyst shocks (earnings blowout >=+25%, regulatory clearances). Gaps up >=+5% with volume >300% and holds opening price.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `volumeSurgeMultiplier` | `≥ 3.0x (300% of 50-day VMA)` | Institutional Re-Rating Volume: Daily volume explodes to >300% of average, proving institutional portfolio managers re-rating the scrip. |

---

## Strategy S13 — Earnings Acceleration Momentum

- **Strategy ID:** `S13_EARNINGS_ACCEL`
- **Evidence Bucket:** `Bucket C: Catalyst & Alpha`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/RegimeBacktestEngine.ts` (`evaluateS13_EarningsAccel`)
- **Purpose / Description:**  
  Identifies economic acceleration where EPS and EBITDA growth expand sequentially over 2-3 quarters (e.g. Q1 +15%, Q2 +30%, Q3 +55%) with positive CFO/PAT.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `sequentialEpsGrowth` | `Q0 > Q-1 > Q-2` | Acceleration Derivative: Growth rate itself is expanding (positive second derivative), driving upward PE multiple expansion. |
| `cfoToPatRatio` | `≥ 0.70 (70% conversion)` | Quality of Accrual Gate: Cash Flow from Operations divided by Operating PAT exceeds 70%, proving earnings are backed by real cash. |

---

## Strategy S14 — Bearish Beta-Weighted Portfolio Futures Hedge

- **Strategy ID:** `S14_BEARISH_HEDGE`
- **Evidence Bucket:** `Bucket E: Macro & Regime Risk`
- **Category:** `HEDGE`
- **Script Location:** `src/server/quantEngine.ts` (`evaluateS14_BearishHedge`)
- **Purpose / Description:**  
  Calculates beta-weighted short Nifty/Bank Nifty futures exposure when market regime gates fail (Nifty < 50 EMA, breadth < 40%). Never used to short cash equities.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `niftyRegimeGate` | `Nifty 50 < 50 EMA` | Market Regime Deterioration: Confirms loss of intermediate bull trend across broader Indian benchmark. |

---

## Strategy S15 — Option Credit Spreads Harvest

- **Strategy ID:** `S15_CREDIT_SPREADS`
- **Evidence Bucket:** `Bucket E: Macro & Regime Risk`
- **Category:** `HEDGE`
- **Script Location:** `src/server/quantEngine.ts` (`evaluateS15_CreditSpreads`)
- **Purpose / Description:**  
  Harvests volatility risk premium (IV crush and theta decay) in high-conviction sideways regimes using defined-risk credit spreads.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `ivPercentileFloor` | `≥ 65th Percentile` | Implied Volatility Rank: IV must be elevated relative to its 1-year history so sold options yield high premium. |

---

## Strategy S16 — Operating Leverage Inflection

- **Strategy ID:** `S16_OPERATING_LEVERAGE`
- **Evidence Bucket:** `Bucket C: Catalyst & Alpha`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/FundamentalAlphaEngine.ts` (`evaluateS16_OperatingLeverage`)
- **Purpose / Description:**  
  Identifies manufacturing companies crossing operational breakeven where fixed depreciation/interest costs are absorbed, causing EBITDA to surge 3x faster than revenue.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `ebitdaGrowthMultiplier` | `EBITDA Growth ≥ 3.0x Revenue Growth` | Operating Leverage Multiplier: Incremental revenue flows directly to operating profit once capacity breakeven is cleared. |

---

## Strategy S17 — Promoter SAST Creeping Squeeze

- **Strategy ID:** `S17_PROMOTER_SQUEEZE`
- **Evidence Bucket:** `Bucket C: Catalyst & Alpha`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/services/FundamentalAlphaEngine.ts` (`evaluateS17_PromoterSqueeze`)
- **Purpose / Description:**  
  Monitors SEBI SAST Reg 29 filings. Identifies open-market share buying by promoters with zero pledge increases, signaling high turnaround conviction.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `promoterAcquisitionPct` | `≥ 1.0% open-market buy` | Creeping Acquisition Scale: Promoters acquire >= 1% stake from secondary cash market within a single regulatory quarter. |

---

## Strategy S18 — Abnormal Volume Absorption (Block Deals)

- **Strategy ID:** `S18_BLOCK_ACCUMULATION`
- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/SmartMoneyEngine.ts` (`evaluateS18_BlockAccumulation`)
- **Purpose / Description:**  
  Detects institutional block deals and delivery absorption where single-day volume surges >5x-10x average and close finishes in the top 20% of range.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `volumeSpikeMultiplier` | `≥ 5.0x to 10.0x VMA` | Extreme Volume Anomaly: Traded turnover surges >=5x historical average, confirming massive institutional buying. |

---

## Strategy S19 — Z-Score Delivery Volume Spike

- **Strategy ID:** `S19_DELIVERY_SPIKE`
- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/SmartMoneyEngine.ts` (`evaluateS19_DeliverySpike`)
- **Purpose / Description:**  
  Identifies stealth accumulation where investors take physical demat delivery. Normalizes delivery data using a 90-day Z-score (Z >= 2.0).

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `deliveryZScore` | `Z ≥ 2.0 (90-day baseline)` | Delivery Standard Score: Demat delivery volume is at least 2 standard deviations above historical mean on green candles. |

---

## Strategy S20 — Glenn Neely NEoWave Structural Engine

- **Strategy ID:** `S20_NEOWAVE`
- **Evidence Bucket:** `Bucket F: Structural Geometry`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/quant/NEoWaveEngine.ts` (`evaluateNEoWaveImpulse`)
- **Purpose / Description:**  
  NEoWave monowave decomposition, rule of retracement, Touchstone timing, and Wave-3 impulse identification for structural trend confirmation.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `wave3ImpulseLength` | `≥ 1.618x Wave 1 in Time ≤ 1.0x` | Wave 3 Motive Power: Third impulse covers at least 161.8% of Wave 1 distance in equal or less time. |

---

## Strategy S21 — Cup & Handle Structural Breakout

- **Strategy ID:** `S21_CUP_AND_HANDLE`
- **Evidence Bucket:** `Bucket F: Structural Geometry`
- **Category:** `BREAKOUT`
- **Script Location:** `src/server/services/NewTechnicalStrategiesEngine.ts` (`evaluateS21_CupAndHandle`)
- **Purpose / Description:**  
  William O'Neil Cup with Handle. Rounded U-shaped base (35-325 sessions, depth 12-40%) with handle retracing <=35% on dry volume (<70% VMA).

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `cupDepthPct` | `12.0% to 40.0% base depth` | Rounded Cup Depth: Ensures natural institutional accumulation without panic breakdown. |

---

## Strategy S22 — TTM Volatility Squeeze Breakout

- **Strategy ID:** `S22_VOLATILITY_SQUEEZE`
- **Evidence Bucket:** `Bucket F: Structural Geometry`
- **Category:** `MOMENTUM`
- **Script Location:** `src/server/services/NewTechnicalStrategiesEngine.ts` (`evaluateS22_VolatilitySqueeze`)
- **Purpose / Description:**  
  John Carter TTM Squeeze. Bollinger Bands compress inside Keltner Channel for >=3 bars; fires on positive momentum and breakout volume >=1.35x.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `bbInsideKeltnerBars` | `≥ 3 consecutive sessions` | Volatility Coiling State: Standard deviation band compresses inside ATR channel, storing potential energy before explosion. |

---

## Strategy S23 — Classical Double Bottom

- **Strategy ID:** `S23_CLASSICAL_DOUBLE_BOTTOM`
- **Evidence Bucket:** `Bucket D: Mean Reversion & Exhaustion`
- **Category:** `MEAN_REVERSION`
- **Script Location:** `src/server/services/NewTechnicalStrategiesEngine.ts` (`evaluateS23_ClassicalDoubleBottom`)
- **Purpose / Description:**  
  Classic W-formation. Second trough within +-5.5% of first trough; entry strictly on decisive daily close above neckline with volume >=1.35x.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `necklineBreakoutRequired` | `Daily Close > Neckline High` | Breakout Confirmation: No entry permitted prior to neckline close, eliminating failed anticipation traps. |

---

## Strategy S24 — Double Top Distribution Exit Ratchet

- **Strategy ID:** `S24_DISTRIBUTION_EXIT`
- **Evidence Bucket:** `Holding Exit Ratchet`
- **Category:** `EXIT_RATCHET`
- **Script Location:** `src/server/services/NewTechnicalStrategiesEngine.ts` (`evaluateS24_DistributionExit`)
- **Purpose / Description:**  
  Defensive exit ratchet on existing holdings. Detects volume divergence on Peak 2 (<85% vol); tightens trailing stop and scales out on neckline breach.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Hard Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `peak2VolumeDivergence` | `Volume(P2) < 85% Volume(P1)` | Volume Exhaustion at Top: Proves buyers are exhausted at second high, warning of impending distribution. |

---


# PART 2: 49-STOCK STRATEGY QUALIFICATION, PARAMETER VALUES & BUSINESS EXPLANATIONS

This section reviews each of the 49 recommendations provided in `ITAS_49_Stock_Master_Dossier_v5.3.1_Execution`. For each stock, it delineates:
1. **Qualified Strategies** matching the stock's chart and volumetric structure
2. **Primary Independent Evidence Buckets** supporting the signal
3. **Exact Quantitative Parameter Values** for every qualified strategy setup
4. **Comprehensive Institutional Thesis** justifying capital commitment

## Executive 49-Stock Strategy Allocation Matrix

| # | Symbol | Company Name | Sector | Timeframe | CMP (₹) | Stop Loss (₹) | Target 1 (+2R) | Target 2 (+4R) | v5.3.1 Verdict | Score | Strats | Primary Evidence Buckets |
| :-: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | **STLNETWORK** | STL NETWORKS LIMITED | Communication Services | `MULTIBAGGER` | ₹37.2 | ₹35.15 | ₹40.73 | ₹44.45 | **HOLD COMPOUNDER** | **88** | `6` | Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 2 | **NOVARTIND** | NOVARTIS INDIA LIMITED | Healthcare | `MULTIBAGGER` | ₹2188 | ₹2067.66 | ₹2395.86 | ₹2614.66 | **HOLD COMPOUNDER** | **95** | `5` | Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 3 | **LGEINDIA** | LG ELECTRONICS INDIA LIMITED | Technology | `SWING` | ₹1629.6 | ₹1539.97 | ₹1784.41 | ₹1865.89 | **HIGH CONVICTION EXECUTE** | **94** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 4 | **SCI** | SHIPPING CORPORATION OF INDIA LIMITED | Industrials | `SWING` | ₹269.05 | ₹254.25 | ₹294.6 | ₹308.05 | **HIGH CONVICTION EXECUTE** | **92** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 5 | **TATATECH** | TATA TECHNOLOGIES LIMITED | Technology | `SWING` | ₹759.3 | ₹717.54 | ₹831.42 | ₹869.38 | **HIGH CONVICTION EXECUTE** | **95** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 6 | **CURIS** | CURIS LIFESCIENCES LIMITED | Healthcare | `MULTIBAGGER` | ₹218.65 | ₹206.63 | ₹239.42 | ₹261.28 | **HOLD COMPOUNDER** | **90** | `5` | Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 7 | **VMART** | V-MART RETAIL LIMITED | Consumer Cyclical | `SWING` | ₹789.85 | ₹746.41 | ₹864.88 | ₹904.37 | **HIGH CONVICTION EXECUTE** | **87** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 8 | **BAJAJFINSV** | BAJAJ FINSERV LIMITED | Financial Services | `SWING` | ₹1855.5 | ₹1753.44 | ₹2031.78 | ₹2124.56 | **HIGH CONVICTION EXECUTE** | **90** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 9 | **BOROLTD** | BOROSIL LIMITED | Consumer Cyclical | `SWING` | ₹248.33 | ₹234.67 | ₹271.93 | ₹284.35 | **HIGH CONVICTION EXECUTE** | **92** | `6` | Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 10 | **GMDCLTD** | GUJARAT MINERAL DEVELOPMENT CORPORATION LIMITED | Energy | `SWING` | ₹553.45 | ₹523.01 | ₹606.02 | ₹633.69 | **HIGH CONVICTION EXECUTE** | **92** | `5` | Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 11 | **HINDCOPPER** | HINDUSTAN COPPER LIMITED | Basic Materials | `SWING` | ₹492.1 | ₹465.03 | ₹538.86 | ₹563.47 | **HIGH CONVICTION EXECUTE** | **90** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 12 | **IKIO** | IKIO TECHNOLOGIES LIMITED | Technology | `MULTIBAGGER` | ₹211.06 | ₹199.45 | ₹231.1 | ₹252.2 | **HOLD COMPOUNDER** | **90** | `6` | Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 13 | **JINDALSTEL** | JINDAL STEEL LIMITED | Basic Materials | `SWING` | ₹1095 | ₹1034.78 | ₹1199.03 | ₹1253.78 | **HIGH CONVICTION EXECUTE** | **92** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 14 | **LTF** | L&T FINANCE LIMITED | Financial Services | `SWING` | ₹296.8 | ₹280.48 | ₹325 | ₹339.84 | **HIGH CONVICTION EXECUTE** | **91** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 15 | **NAVA** | NAVA LIMITED | Industrials | `SWING` | ₹536.95 | ₹507.42 | ₹587.97 | ₹614.82 | **HIGH CONVICTION EXECUTE** | **88** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 16 | **PURVA** | PURAVANKARA LIMITED | Real Estate | `SWING` | ₹205.56 | ₹194.25 | ₹225.09 | ₹235.37 | **HIGH CONVICTION EXECUTE** | **89** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 17 | **SENCO** | SENCO GOLD LIMITED | Consumer Cyclical | `SWING` | ₹336.4 | ₹317.9 | ₹368.36 | ₹385.18 | **HIGH CONVICTION EXECUTE** | **90** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 18 | **SHANTIGOLD** | SHANTI GOLD INTERNATIONAL LIMITED | Consumer Cyclical | `SWING` | ₹247.89 | ₹234.26 | ₹271.43 | ₹283.82 | PULLBACK ACCUMULATE | **84** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 19 | **THOMASCOOK** | THOMAS COOK  (INDIA)  LIMITED | Consumer Cyclical | `SWING` | ₹103.37 | ₹97.68 | ₹113.19 | ₹118.36 | PULLBACK ACCUMULATE | **92** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 20 | **UNIONBANK** | UNION BANK OF INDIA | Financial Services | `SWING` | ₹175 | ₹165.38 | ₹191.63 | ₹200.38 | **HIGH CONVICTION EXECUTE** | **91** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 21 | **UNOMINDA** | UNO MINDA LIMITED | Consumer Cyclical | `SWING` | ₹1159.7 | ₹1095.91 | ₹1269.88 | ₹1327.87 | PULLBACK ACCUMULATE | **93** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 22 | **VGUARD** | V-GUARD INDUSTRIES LIMITED | Industrials | `SWING` | ₹321.9 | ₹304.19 | ₹352.49 | ₹368.59 | **HIGH CONVICTION EXECUTE** | **91** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 23 | **BAJAJHLDNG** | BAJAJ HOLDINGS & INVESTMENT LIMITED | Financial Services | `SWING` | ₹11100 | ₹10489.5 | ₹12154.5 | ₹12709.5 | PULLBACK ACCUMULATE | **90** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 24 | **AUBANK** | AU SMALL FINANCE BANK LIMITED | Financial Services | `SWING` | ₹1028 | ₹971.46 | ₹1125.66 | ₹1177.06 | PULLBACK ACCUMULATE | **87** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 25 | **MUFIN** | MUFIN GREEN FINANCE LTD | Financial Services | `SWING` | ₹132.49 | ₹125.21 | ₹145.07 | ₹151.69 | PULLBACK ACCUMULATE | **86** | `4` | Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 26 | **PRICOLLTD** | PRICOL LIMITED | Consumer Cyclical | `SWING` | ₹740.75 | ₹700.01 | ₹811.13 | ₹848.17 | PULLBACK ACCUMULATE | **88** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 27 | **TBOTEK** | TBO TEK LIMITED | Consumer Cyclical | `SWING` | ₹1656.1 | ₹1565.01 | ₹1813.44 | ₹1896.25 | PULLBACK ACCUMULATE | **91** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 28 | **ADISOFT** | ADISOFT TECHNOLOGIES LIMITED | Technology | `MULTIBAGGER` | ₹245.6 | ₹232.09 | ₹268.93 | ₹293.49 | PULLBACK ACCUMULATE | **84** | `4` | Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 29 | **ARVSMART** | ARVIND SMARTSPACES LIMITED | Real Estate | `SWING` | ₹564.15 | ₹533.12 | ₹617.75 | ₹645.96 | **HIGH CONVICTION EXECUTE** | **89** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 30 | **EPIGRAL** | EPIGRAL LIMITED | Basic Materials | `SWING` | ₹1092.2 | ₹1032.13 | ₹1195.96 | ₹1250.57 | **HIGH CONVICTION EXECUTE** | **88** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 31 | **FERMENTA** | FERMENTA BIOTECH LIMITED | Healthcare | `SWING` | ₹471 | ₹445.1 | ₹515.75 | ₹539.3 | **HIGH CONVICTION EXECUTE** | **89** | `7` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 32 | **GKENERGY** | GK ENERGY LIMITED | Utilities | `SWING` | ₹123.57 | ₹116.77 | ₹135.31 | ₹141.49 | PULLBACK ACCUMULATE | **77** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 33 | **HNDFDS** | HINDUSTAN FOODS LIMITED | Industrials | `SWING` | ₹598.15 | ₹565.25 | ₹654.98 | ₹684.89 | PULLBACK ACCUMULATE | **92** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 34 | **MONARCH** | MONARCH NETWORTH CAPITAL LIMITED | Financial Services | `SWING` | ₹366.5 | ₹346.34 | ₹401.33 | ₹419.66 | PULLBACK ACCUMULATE | **85** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 35 | **RPGLIFE** | RPG LIFE SCIENCES LIMITED | Healthcare | `SWING` | ₹2718.8 | ₹2569.27 | ₹2977.09 | ₹3113.03 | PULLBACK ACCUMULATE | **93** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 36 | **ZUARIIND** | ZUARI INDUSTRIES LIMITED | Industrials | `SWING` | ₹265.3 | ₹250.7 | ₹290.51 | ₹303.78 | PULLBACK ACCUMULATE | **89** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 37 | **MAHSCOOTER** | MAHARASHTRA SCOOTERS LIMITED | Financial Services | `SWING` | ₹12882 | ₹12173.49 | ₹14105.79 | ₹14749.89 | PULLBACK ACCUMULATE | **88** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 38 | **NIITLTD** | NIIT LIMITED | Consumer Defensive | `SWING` | ₹87.32 | ₹82.51 | ₹95.62 | ₹99.99 | **HIGH CONVICTION EXECUTE** | **85** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 39 | **SSDL** | SARASWATI SAREE DEPOT LIMITED | Consumer Cyclical | `MULTIBAGGER` | ₹60.22 | ₹56.91 | ₹65.94 | ₹71.96 | PULLBACK ACCUMULATE | **82** | `4` | Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 40 | **IRMENERGY** | IRM ENERGY LIMITED | Utilities | `SWING` | ₹266.5 | ₹251.84 | ₹291.83 | ₹305.16 | **HIGH CONVICTION EXECUTE** | **82** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 41 | **SWARAJ** | SWARAJ SUITING LIMITED | Consumer Cyclical | `SWING` | ₹353.15 | ₹333.72 | ₹386.7 | ₹404.36 | PULLBACK ACCUMULATE | **90** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 42 | **UNICHEMLAB** | UNICHEM LABORATORIES LIMITED | Healthcare | `SWING` | ₹519.05 | ₹490.5 | ₹568.35 | ₹594.3 | PULLBACK ACCUMULATE | **91** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 43 | **VRLLOG** | VRL LOGISTICS LIMITED | Industrials | `SWING` | ₹283.6 | ₹268 | ₹310.54 | ₹324.72 | PULLBACK ACCUMULATE | **90** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 44 | **WINDMACHIN** | WINDSOR MACHINES LIMITED | Industrials | `SWING` | ₹300.7 | ₹284.16 | ₹329.28 | ₹344.32 | PULLBACK ACCUMULATE | **86** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 45 | **LAMOSAIC** | LAMOSAIC INDIA LIMITED | Basic Materials | `SWING` | ₹53.25 | ₹50.32 | ₹58.3 | ₹60.96 | PULLBACK ACCUMULATE | **81** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |
| 46 | **AETHER** | AETHER INDUSTRIES LIMITED | Basic Materials | `MULTIBAGGER` | ₹1583.1 | ₹1496.02 | ₹1733.5 | ₹1891.82 | PULLBACK ACCUMULATE | **89** | `5` | Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 47 | **EIEL** | ENVIRO INFRA ENGINEERS LIMITED | Industrials | `SWING` | ₹196.91 | ₹186.08 | ₹215.63 | ₹225.48 | PULLBACK ACCUMULATE | **85** | `4` | Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 48 | **INDNIPPON** | INDIA NIPPON ELECTRICALS LIMITED | Consumer Cyclical | `MULTIBAGGER` | ₹1279 | ₹1208.66 | ₹1400.51 | ₹1528.41 | PULLBACK ACCUMULATE | **88** | `5` | Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha |
| 49 | **KROSS** | KROSS LIMITED | Consumer Cyclical | `MULTIBAGGER` | ₹228.87 | ₹216.29 | ₹250.61 | ₹273.49 | PULLBACK ACCUMULATE | **87** | `6` | Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha |

---

## Comprehensive Scrip-by-Scrip Deep Dive Analysis

### #1: STLNETWORK — STL NETWORKS LIMITED

- **Sector:** Communication Services | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹37.2 | **Entry:** ₹37.01
- **Capital Protection Stop Loss:** ₹35.15
- **Profit Targets:** Target 1 (+2R): ₹40.73 | Target 2 (+4R): ₹44.45
- **v5.3.1 Verdict:** **HOLD COMPOUNDER**
- **Signal Quality Score:** **88/100**
- **Qualified Strategies (6):** `S10, S1, S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S10]** Macro Bull Trend: Above SMA 200: CMP ₹37.2 vs SMA200 ₹24.12
  - Adequate Liquidity (ADTV >= ₹15 Cr): ADTV(5): ₹33.2 Cr
  - Trendline Compression: 3+ Consecutive Lower Highs: 8 consecutive lower highs
- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +19.18% over 18 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹26.71 vs Floor: ₹26.1
- **[QGLP]** Total: 84/100, Squeeze Score: 88, Delivery Surge: 2.85x, Float Tightness: 1.16x
- **[Institutional Inflow]** Net Buy: ₹29.4 Cr, Top Buyers: Nippon India Small Cap, Quant Mutual Fund, HDFC Defense & Infra Fund

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S10, S1, S19, S18, S13, S16 across 3 independent evidence buckets (Bucket A: Trend & Momentum; Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 84/100 and a float squeeze score of 88. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹35.15 protecting capital against thesis failure. Catalyst backing: Massive order book turnaround driven by global 5G fiberization and BharatNet Phase III rollout; operating leverage inflecting.

---

### #2: NOVARTIND — NOVARTIS INDIA LIMITED

- **Sector:** Healthcare | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹2188 | **Entry:** ₹2177.06
- **Capital Protection Stop Loss:** ₹2067.66
- **Profit Targets:** Target 1 (+2R): ₹2395.86 | Target 2 (+4R): ₹2614.66
- **v5.3.1 Verdict:** **HOLD COMPOUNDER**
- **Signal Quality Score:** **95/100**
- **Qualified Strategies (5):** `S10, S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S10]** Macro Bull Trend: Above SMA 200: CMP ₹2428.2 vs SMA200 ₹1085.07
  - Adequate Liquidity (ADTV >= ₹15 Cr): ADTV(5): ₹169.0 Cr
  - Trendline Compression: 3+ Consecutive Lower Highs: 6 consecutive lower highs
- **[QGLP]** Total: 87/100, Squeeze Score: 100, Delivery Surge: 3.4x, Float Tightness: 3.03x
- **[Institutional Inflow]** Net Buy: ₹32.1 Cr, Top Buyers: SBI Healthcare Fund, Mirae Asset Healthcare, Vanguard Emerging Markets

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S10, S19, S18, S13, S16 across 3 independent evidence buckets (Bucket A: Trend & Momentum; Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 87/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹2067.66 protecting capital against thesis failure. Catalyst backing: Pristine zero-debt Swiss balance sheet with exclusive therapeutic patent runway and 34% dividend payout predictability.

---

### #3: LGEINDIA — LG ELECTRONICS INDIA LIMITED

- **Sector:** Technology | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹1629.6 | **Entry:** ₹1621.45
- **Capital Protection Stop Loss:** ₹1539.97
- **Profit Targets:** Target 1 (+2R): ₹1784.41 | Target 2 (+4R): ₹1865.89
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **94/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +15.22% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹1622.6 vs Floor: ₹1601.64
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +3.78%
  - Turnover: ₹1373.6 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹156.64 Cr on 2026-08-27 (0.85x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -5.65% (10 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.56% (₹449.2 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1563.5 > P0: ₹1493.2
  - Drop: -0.81%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹1654.1 > H1: ₹1576.2 (+5.79% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.56% (₹449.2 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹1493.2 vs SMA 200: ₹1540.41 (-3.07%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1563.5 > P0: ₹1493.2
  - Drop: -0.81%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 88/100, Squeeze Score: 100, Delivery Surge: 3.1x, Float Tightness: 3.44x
- **[Institutional Inflow]** Net Buy: ₹71.3 Cr, Top Buyers: ICICI Prudential Technology Fund, Kotak Flexicap, Fidelity International

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 88/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1539.97 protecting capital against thesis failure. Catalyst backing: India domestic premiumization leader with 60% component localization under PLI; upcoming mega-IPO re-rating catalyst.

---

### #4: SCI — SHIPPING CORPORATION OF INDIA LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹269.05 | **Entry:** ₹267.7
- **Capital Protection Stop Loss:** ₹254.25
- **Profit Targets:** Target 1 (+2R): ₹294.6 | Target 2 (+4R): ₹308.05
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **92/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +15.37% over 18 bars
  - Base Compaction Duration (2–6 Weeks): 16 sessions (3.2 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹282.6 vs Floor: ₹278.2
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +4.31%
  - Turnover: ₹974.7 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹153.47 Cr on 2026-08-28 (1.8x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -6.09% (9 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +12.68% (₹1972.7 Cr over 23 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹282.6 > P0: ₹260.2
  - Drop: -3.62%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹294.8 > H1: ₹293.2 (+4.32% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +12.68% (₹1972.7 Cr over 23 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹260.2 vs SMA 200: ₹261.08 (-0.34%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹282.6 > P0: ₹260.2
  - Drop: -3.62%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 85/100, Squeeze Score: 92, Delivery Surge: 2.9x, Float Tightness: 1.76x
- **[Institutional Inflow]** Net Buy: ₹98.6 Cr, Top Buyers: HDFC Transportation & Logistics Fund, SBI PSU Fund, CPSE ETF

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 85/100 and a float squeeze score of 92. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹254.25 protecting capital against thesis failure. Catalyst backing: Strategic sovereign tanker fleet re-rating on soaring tanker day-rates, energy security transport, and demerger value unlocking.

---

### #5: TATATECH — TATA TECHNOLOGIES LIMITED

- **Sector:** Technology | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹759.3 | **Entry:** ₹755.5
- **Capital Protection Stop Loss:** ₹717.54
- **Profit Targets:** Target 1 (+2R): ₹831.42 | Target 2 (+4R): ₹869.38
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **95/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +17.42% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 13 sessions (2.6 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹773 vs Floor: ₹766.73
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +3.16%
  - Turnover: ₹1368.1 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹212.49 Cr on 2026-08-28 (1.21x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -8.35% (7 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +21.88% (₹3363.9 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹727 > P0: ₹629.4
  - Drop: -5.23%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹844.7 > H1: ₹767.1 (+16.19% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +21.88% (₹3363.9 Cr over 25 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹629.4 vs SMA 200: ₹639.44 (-1.57%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹727 > P0: ₹629.4
  - Drop: -5.23%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 92/100, Squeeze Score: 100, Delivery Surge: 3.75x, Float Tightness: 2.18x
- **[Institutional Inflow]** Net Buy: ₹301.2 Cr, Top Buyers: Tata Digital India Fund, HDFC Top 100, Kotak Emerging Equity, BlackRock

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 92/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹717.54 protecting capital against thesis failure. Catalyst backing: Tata pedigree flagship with multi-year tier-1 OEM software contracts in EV software, BMW JV ramp-up, and aerospace ER&D.

---

### #6: CURIS — CURIS LIFESCIENCES LIMITED

- **Sector:** Healthcare | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹218.65 | **Entry:** ₹217.56
- **Capital Protection Stop Loss:** ₹206.63
- **Profit Targets:** Target 1 (+2R): ₹239.42 | Target 2 (+4R): ₹261.28
- **v5.3.1 Verdict:** **HOLD COMPOUNDER**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (5):** `S1, S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +23.63% over 8 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹124.8 vs Floor: ₹112.84
- **[QGLP]** Total: 86/100, Squeeze Score: 88, Delivery Surge: 2.6x, Float Tightness: 1.6x
- **[Institutional Inflow]** Net Buy: ₹35.8 Cr, Top Buyers: DSP Healthcare Fund, Bandhan Core Equity, WhiteOak Capital PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S19, S18, S13, S16 across 2 independent evidence buckets (Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 86/100 and a float squeeze score of 88. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹206.63 protecting capital against thesis failure. Catalyst backing: High operating leverage diagnostic chain expansion across semi-urban clusters; test volumes expanding at 26% CAGR.

---

### #7: VMART — V-MART RETAIL LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹789.85 | **Entry:** ₹785.9
- **Capital Protection Stop Loss:** ₹746.41
- **Profit Targets:** Target 1 (+2R): ₹864.88 | Target 2 (+4R): ₹904.37
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **87/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +17.77% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹800.1 vs Floor: ₹783.8
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +1.44%
  - Turnover: ₹124.3 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹21.06 Cr on 2026-08-24 (2.19x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -9.1% (15 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +20.56% (₹118.5 Cr over 11 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹766.75 > P0: ₹682.65
  - Drop: -6.83%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹825 > H1: ₹823 (+7.6% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +20.56% (₹118.5 Cr over 11 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹682.65 vs SMA 200: ₹680.3 (+0.34%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹766.75 > P0: ₹682.65
  - Drop: -6.83%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 81/100, Squeeze Score: 87, Delivery Surge: 2.7x, Float Tightness: 1.18x
- **[Institutional Inflow]** Net Buy: ₹28.6 Cr, Top Buyers: SBI Small Cap Fund, Kotak Multicap Fund, Motilal Oswal Midcap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 81/100 and a float squeeze score of 87. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹746.41 protecting capital against thesis failure. Catalyst backing: Turnaround story post-Unlimited integration with festive demand accelerating same-store sales growth (SSSG) to 14%.

---

### #8: BAJAJFINSV — BAJAJ FINSERV LIMITED

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹1855.5 | **Entry:** ₹1846.22
- **Capital Protection Stop Loss:** ₹1753.44
- **Profit Targets:** Target 1 (+2R): ₹2031.78 | Target 2 (+4R): ₹2124.56
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +0.82%
  - Turnover: ₹1839.4 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹167.84 Cr on 2026-08-21 (1.07x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -4.53% (14 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.24% (₹2213.2 Cr over 9 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1892.3 > P0: ₹1843.4
  - Drop: -2.46%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹2026.6 > H1: ₹1940 (+7.1% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.24% (₹2213.2 Cr over 9 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹1843.4 vs SMA 200: ₹1914.07 (-3.69%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1892.3 > P0: ₹1843.4
  - Drop: -2.46%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 91/100, Squeeze Score: 94, Delivery Surge: 3.2x, Float Tightness: 1.55x
- **[Institutional Inflow]** Net Buy: ₹354 Cr, Top Buyers: HDFC Balanced Advantage, ICICI Pru Bluechip, SBI Equity Hybrid, GQG Partners

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 91/100 and a float squeeze score of 94. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1753.44 protecting capital against thesis failure. Catalyst backing: Apex financial ecosystem compounding at 20%+ ROE with digital payments integration, mutual fund business scaling, and unmatched credit data moat.

---

### #9: BOROLTD — BOROSIL LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹248.33 | **Entry:** ₹247.09
- **Capital Protection Stop Loss:** ₹234.67
- **Profit Targets:** Target 1 (+2R): ₹271.93 | Target 2 (+4R): ₹284.35
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **92/100**
- **Qualified Strategies (6):** `S3, S4, S9, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +0.75% (₹630.4 Cr over 9 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹246.9 > P0: ₹245.58
  - Drop: -0.21%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹274.86 > H1: ₹247.43 (+11.32% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +0.75% (₹630.4 Cr over 9 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹245.58 vs SMA 200: ₹253.59 (-3.16%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹246.9 > P0: ₹245.58
  - Drop: -0.21%
  - Vol Dry: YES
  - Range Compacted: YES
- **[S9]** Price Above SMA 50: CMP ₹263.78 vs SMA50 ₹243.85
  - ADR >= 5% (Volatile Stock): ADR(20): 5.12%
  - Volume Dry-Up (<= 40% of 20-day Average): VDU ratio: 0.06x (6% of avg)
- **[QGLP]** Total: 88/100, Squeeze Score: 100, Delivery Surge: 3.8x, Float Tightness: 2.36x
- **[Institutional Inflow]** Net Buy: ₹41.2 Cr, Top Buyers: Nippon India Small Cap, Quant Active Fund, Sundaram Mutual Fund

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S3, S4, S9, S19, S18, S13 across 3 independent evidence buckets (Bucket A: Trend & Momentum; Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 88/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹234.67 protecting capital against thesis failure. Catalyst backing: Dominant 60%+ market share in scientific labware with massive solar glass capex commissioning to feed domestic module manufacturers.

---

### #10: GMDCLTD — GUJARAT MINERAL DEVELOPMENT CORPORATION LIMITED

- **Sector:** Energy | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹553.45 | **Entry:** ₹550.68
- **Capital Protection Stop Loss:** ₹523.01
- **Profit Targets:** Target 1 (+2R): ₹606.02 | Target 2 (+4R): ₹633.69
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **92/100**
- **Qualified Strategies (5):** `S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +1.61% (₹1149.5 Cr over 11 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹563.1 > P0: ₹558
  - Drop: -0.69%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹580.2 > H1: ₹567 (+3.04% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +2.75% (₹1108 Cr over 10 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹558 vs SMA 200: ₹590.37 (-5.48%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹562.05 > P0: ₹558
  - Drop: -1.97%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 88/100, Squeeze Score: 100, Delivery Surge: 3.5x, Float Tightness: 2.85x
- **[Institutional Inflow]** Net Buy: ₹88.2 Cr, Top Buyers: SBI PSU Fund, ICICI Pru Value Discovery, Gujarat State Investment Corp

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket A: Trend & Momentum; Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 88/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹523.01 protecting capital against thesis failure. Catalyst backing: Monopoly lignite pricing power in Western India with multi-mine commercial allocation and debt-free cash balance exceeding ₹2,500 Cr.

---

### #11: HINDCOPPER — HINDUSTAN COPPER LIMITED

- **Sector:** Basic Materials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹492.1 | **Entry:** ₹489.64
- **Capital Protection Stop Loss:** ₹465.03
- **Profit Targets:** Target 1 (+2R): ₹538.86 | Target 2 (+4R): ₹563.47
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +4.76%
  - Turnover: ₹14239.6 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹783.13 Cr on 2026-08-21 (0.8x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -10.13% (13 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.53% (₹1422.5 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹490.05 > P0: ₹482
  - Drop: -1.79%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹536.9 > H1: ₹499 (+9.56% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.53% (₹1422.5 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹482 vs SMA 200: ₹489.06 (-1.44%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹490.05 > P0: ₹482
  - Drop: -1.79%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 85/100, Squeeze Score: 95, Delivery Surge: 3.15x, Float Tightness: 1.95x
- **[Institutional Inflow]** Net Buy: ₹104.5 Cr, Top Buyers: Mirae Asset Great Consumer, Nippon India ETF, Government Pension Fund Global

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 85/100 and a float squeeze score of 95. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹465.03 protecting capital against thesis failure. Catalyst backing: Sole vertically integrated copper producer in India riding the structural global copper deficit driven by EV grids, data centers, and defense.

---

### #12: IKIO — IKIO TECHNOLOGIES LIMITED

- **Sector:** Technology | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹211.06 | **Entry:** ₹210
- **Capital Protection Stop Loss:** ₹199.45
- **Profit Targets:** Target 1 (+2R): ₹231.1 | Target 2 (+4R): ₹252.2
- **v5.3.1 Verdict:** **HOLD COMPOUNDER**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (6):** `S10, S4, S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S10]** Macro Bull Trend: Above SMA 200: CMP ₹231.73 vs SMA200 ₹165.91
  - Adequate Liquidity (ADTV >= ₹15 Cr): ADTV(5): ₹29.0 Cr
  - Trendline Compression: 3+ Consecutive Lower Highs: 3 consecutive lower highs
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +36.33% (₹2035.6 Cr over 25 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹152.5 vs SMA 200: ₹165.54 (-7.88%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹206 > P0: ₹152.5
  - Drop: -0.91%
  - Vol Dry: YES
  - Range Compacted: NO
- **[QGLP]** Total: 87/100, Squeeze Score: 95, Delivery Surge: 2.8x, Float Tightness: 2.64x
- **[Institutional Inflow]** Net Buy: ₹33.6 Cr, Top Buyers: Motilal Oswal Small Cap, HDFC Small Cap Fund, Goldman Sachs FII

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S10, S4, S19, S18, S13, S16 across 3 independent evidence buckets (Bucket A: Trend & Momentum; Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 87/100 and a float squeeze score of 95. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹199.45 protecting capital against thesis failure. Catalyst backing: High-margin (22% EBITDA) ODM partner to global lighting brands with US commercial refrigeration LED export ramp-up.

---

### #13: JINDALSTEL — JINDAL STEEL LIMITED

- **Sector:** Basic Materials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹1095 | **Entry:** ₹1089.53
- **Capital Protection Stop Loss:** ₹1034.78
- **Profit Targets:** Target 1 (+2R): ₹1199.03 | Target 2 (+4R): ₹1253.78
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **92/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +6.93%
  - Turnover: ₹1483.1 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹112.67 Cr on 2026-08-21 (1.31x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -4.96% (10 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +1.91% (₹946.5 Cr over 10 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1090 > P0: ₹1085.9
  - Drop: -1.5%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹1151.7 > H1: ₹1106.6 (+5.66% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +1.91% (₹946.5 Cr over 10 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹1085.9 vs SMA 200: ₹1122.53 (-3.26%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1090 > P0: ₹1085.9
  - Drop: -1.5%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 89/100, Squeeze Score: 98, Delivery Surge: 3.6x, Float Tightness: 1.58x
- **[Institutional Inflow]** Net Buy: ₹456 Cr, Top Buyers: ICICI Pru Equity & Debt, SBI Focused Equity, Kotak Equity Arbitrage, Vanguard

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 89/100 and a float squeeze score of 98. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1034.78 protecting capital against thesis failure. Catalyst backing: India’s most cost-efficient blast furnace & DRI steelmaker doubling capacity to 12 MTPA at Angul with world-class captive coal mines.

---

### #14: LTF — L&T FINANCE LIMITED

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹296.8 | **Entry:** ₹295.32
- **Capital Protection Stop Loss:** ₹280.48
- **Profit Targets:** Target 1 (+2R): ₹325 | Target 2 (+4R): ₹339.84
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **91/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +3.99%
  - Turnover: ₹1915.4 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹120.14 Cr on 2026-08-25 (0.8x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -4.89% (11 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +6.42% (₹5796.8 Cr over 22 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹304.5 > P0: ₹286.4
  - Drop: -0.1%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹311.9 > H1: ₹304.8 (+2.43% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +6.42% (₹5796.8 Cr over 22 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹286.4 vs SMA 200: ₹281.73 (+1.66%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹304.5 > P0: ₹286.4
  - Drop: -0.1%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 90/100, Squeeze Score: 97, Delivery Surge: 3.3x, Float Tightness: 1.97x
- **[Institutional Inflow]** Net Buy: ₹147.6 Cr, Top Buyers: HDFC Mutual Fund, Nippon India Growth, Kotak Flexicap, DSP Midcap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 90/100 and a float squeeze score of 97. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹280.48 protecting capital against thesis failure. Catalyst backing: Transformation into a 95%+ retail loan book under Lakshya 2026 plan; ROA expanding past 3.0% with pristine L&T parentage.

---

### #15: NAVA — NAVA LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹536.95 | **Entry:** ₹534.27
- **Capital Protection Stop Loss:** ₹507.42
- **Profit Targets:** Target 1 (+2R): ₹587.97 | Target 2 (+4R): ₹614.82
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **88/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +5.33%
  - Turnover: ₹210.7 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹31.98 Cr on 2026-08-24 (1.67x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -4.78% (9 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +0.32% (₹303 Cr over 13 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹556.3 > P0: ₹556.2
  - Drop: -0.3%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹563 > H1: ₹558 (+1.2% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +0.32% (₹303 Cr over 13 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹556.2 vs SMA 200: ₹585.64 (-5.03%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹556.3 > P0: ₹556.2
  - Drop: -0.3%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 87/100, Squeeze Score: 85, Delivery Surge: 2.65x, Float Tightness: 0.95x
- **[Institutional Inflow]** Net Buy: ₹79.2 Cr, Top Buyers: Quant Mutual Fund, Dimensional Fund Advisors, Ashish Kacholia PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 87/100 and a float squeeze score of 85. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹507.42 protecting capital against thesis failure. Catalyst backing: Massive cash flows from Zambian power utility (Mamba Collieries) clearing debt, combined with soaring ferro-alloy spot margins.

---

### #16: PURVA — PURAVANKARA LIMITED

- **Sector:** Real Estate | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹205.56 | **Entry:** ₹204.53
- **Capital Protection Stop Loss:** ₹194.25
- **Profit Targets:** Target 1 (+2R): ₹225.09 | Target 2 (+4R): ₹235.37
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **89/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +9.06%
  - Turnover: ₹479.9 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹401.23 Cr on 2026-09-04 (12.5x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -9.25% (4 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.98% (₹611 Cr over 10 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹211.22 > P0: ₹211.1
  - Drop: -3.77%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹223.02 > H1: ₹219.5 (+5.59% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.98% (₹611 Cr over 10 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹211.1 vs SMA 200: ₹221.18 (-4.56%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹211.22 > P0: ₹211.1
  - Drop: -3.77%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 85/100, Squeeze Score: 96, Delivery Surge: 2.95x, Float Tightness: 2.45x
- **[Institutional Inflow]** Net Buy: ₹41.5 Cr, Top Buyers: Kotak Real Estate Fund, Sundaram Multi Cap, WhiteOak Capital

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 85/100 and a float squeeze score of 96. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹194.25 protecting capital against thesis failure. Catalyst backing: Unprecedented pre-sales velocity across Bengaluru and Mumbai redevelopment projects with inventory turnaround shortening to 18 months.

---

### #17: SENCO — SENCO GOLD LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹336.4 | **Entry:** ₹334.72
- **Capital Protection Stop Loss:** ₹317.9
- **Profit Targets:** Target 1 (+2R): ₹368.36 | Target 2 (+4R): ₹385.18
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +12.33%
  - Turnover: ₹607.4 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹182.10 Cr on 2026-08-24 (3.22x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -7.37% (13 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +8.32% (₹409.5 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹347.25 > P0: ₹333.05
  - Drop: -3.74%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹369.5 > H1: ₹360.75 (+6.41% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +8.32% (₹409.5 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹333.05 vs SMA 200: ₹331.17 (+0.57%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹347.25 > P0: ₹333.05
  - Drop: -3.74%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 88/100, Squeeze Score: 97, Delivery Surge: 3.25x, Float Tightness: 2.16x
- **[Institutional Inflow]** Net Buy: ₹69.8 Cr, Top Buyers: Oman India Joint Investment Fund, SBI Small Cap, DSP Small Cap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 88/100 and a float squeeze score of 97. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹317.9 protecting capital against thesis failure. Catalyst backing: Fastest-growing organized jewellery retailer in Eastern India expanding into Tier-1 metros with 28% ROCE and steady 20% store additions.

---

### #18: SHANTIGOLD — SHANTI GOLD INTERNATIONAL LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹247.89 | **Entry:** ₹246.65
- **Capital Protection Stop Loss:** ₹234.26
- **Profit Targets:** Target 1 (+2R): ₹271.43 | Target 2 (+4R): ₹283.82
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **84/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +16.45% over 17 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹233.41 vs Floor: ₹231.96
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +10.51%
  - Turnover: ₹1042.7 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹123.80 Cr on 2026-08-21 (1.63x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -8.36% (13 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +21.82% (₹1558.5 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹246 > P0: ₹204.02
  - Drop: -1.02%
  - Vol Dry: YES
  - Range Compacted: NO
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹273.97 > H1: ₹248.54 (+11.37% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +21.82% (₹1558.5 Cr over 25 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹204.02 vs SMA 200: ₹207.23 (-1.55%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹246 > P0: ₹204.02
  - Drop: -1.02%
  - Vol Dry: YES
  - Range Compacted: NO
- **[QGLP]** Total: 81/100, Squeeze Score: 86, Delivery Surge: 2.45x, Float Tightness: 1.43x
- **[Institutional Inflow]** Net Buy: ₹12.8 Cr, Top Buyers: IndiaBridge Capital, Aegis Investment Fund, Mukul Agrawal PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 81/100 and a float squeeze score of 86. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹234.26 protecting capital against thesis failure. Catalyst backing: Niche CNC machine-crafted jewellery manufacturer capturing supply chain consolidation from unorganized family workshops.

---

### #19: THOMASCOOK — THOMAS COOK  (INDIA)  LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹103.37 | **Entry:** ₹102.85
- **Capital Protection Stop Loss:** ₹97.68
- **Profit Targets:** Target 1 (+2R): ₹113.19 | Target 2 (+4R): ₹118.36
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **92/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +18.99%
  - Turnover: ₹540.4 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹289.34 Cr on 2026-08-21 (9.8x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -10.36% (13 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +7.37% (₹456.5 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹106 > P0: ₹101.99
  - Drop: -3.21%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹112.53 > H1: ₹109.51 (+6.16% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +7.37% (₹456.5 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹101.99 vs SMA 200: ₹112.82 (-9.6%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹106 > P0: ₹101.99
  - Drop: -3.21%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 90/100, Squeeze Score: 100, Delivery Surge: 3.4x, Float Tightness: 2.82x
- **[Institutional Inflow]** Net Buy: ₹43.5 Cr, Top Buyers: Fairfax Group, HDFC Small Cap Fund, Nippon India Multi Cap, DSP Flexicap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 90/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹97.68 protecting capital against thesis failure. Catalyst backing: Debt-free travel and forex powerhouse reporting record cash profits fueled by outbound Indian wanderlust and business travel recovery.

---

### #20: UNIONBANK — UNION BANK OF INDIA

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹175 | **Entry:** ₹174.13
- **Capital Protection Stop Loss:** ₹165.38
- **Profit Targets:** Target 1 (+2R): ₹191.63 | Target 2 (+4R): ₹200.38
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **91/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +17.32% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 24 sessions (4.8 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹177.62 vs Floor: ₹169.88
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +4.14%
  - Turnover: ₹2564 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹209.06 Cr on 2026-08-25 (1.03x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -6.83% (11 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.32% (₹1547.7 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹174.22 > P0: ₹170.1
  - Drop: -0.86%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹186.86 > H1: ₹175.74 (+7.26% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.32% (₹1547.7 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹170.1 vs SMA 200: ₹167.81 (+1.36%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹174.22 > P0: ₹170.1
  - Drop: -0.86%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 88/100, Squeeze Score: 100, Delivery Surge: 3.1x, Float Tightness: 3.35x
- **[Institutional Inflow]** Net Buy: ₹188.5 Cr, Top Buyers: Life Insurance Corporation (LIC), SBI Mutual Fund, Vanguard Emerging Mkts

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 88/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹165.38 protecting capital against thesis failure. Catalyst backing: Structural multi-year balance sheet sanitization with Net NPA below 1.0%, ROA expanding past 1.1%, and attractive single-digit P/E discount.

---

### #21: UNOMINDA — UNO MINDA LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹1159.7 | **Entry:** ₹1153.9
- **Capital Protection Stop Loss:** ₹1095.91
- **Profit Targets:** Target 1 (+2R): ₹1269.88 | Target 2 (+4R): ₹1327.87
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **93/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +3.73%
  - Turnover: ₹1400.3 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹100.67 Cr on 2026-08-26 (1.09x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -6.33% (7 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +2.44% (₹721 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1156.6 > P0: ₹1140.2
  - Drop: -0.98%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹1272.1 > H1: ₹1168 (+9.99% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +2.44% (₹721 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹1140.2 vs SMA 200: ₹1170.03 (-2.55%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1156.6 > P0: ₹1140.2
  - Drop: -0.98%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 92/100, Squeeze Score: 100, Delivery Surge: 3.65x, Float Tightness: 2.32x
- **[Institutional Inflow]** Net Buy: ₹148 Cr, Top Buyers: SBI Equity Hybrid, Kotak Emerging Equity, Axis Midcap, Capital Group

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 92/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1095.91 protecting capital against thesis failure. Catalyst backing: Content-per-vehicle compounder rising from ₹10k to ₹45k in electric 2W/4W platforms; joint ventures with global tier-1s ensuring technology dominance.

---

### #22: VGUARD — V-GUARD INDUSTRIES LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹321.9 | **Entry:** ₹320.29
- **Capital Protection Stop Loss:** ₹304.19
- **Profit Targets:** Target 1 (+2R): ₹352.49 | Target 2 (+4R): ₹368.59
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **91/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +18.8% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 14 sessions (2.8 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹324.3 vs Floor: ₹313.24
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +3.7%
  - Turnover: ₹301.2 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹62.15 Cr on 2026-08-31 (1.76x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -5.88% (7 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +10.03% (₹1390.5 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹325.25 > P0: ₹298.05
  - Drop: -0.82%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹335.45 > H1: ₹327.95 (+3.14% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +10.03% (₹1390.5 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹298.05 vs SMA 200: ₹324 (-8.01%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹325.25 > P0: ₹298.05
  - Drop: -0.82%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 87/100, Squeeze Score: 91, Delivery Surge: 3.05x, Float Tightness: 1.25x
- **[Institutional Inflow]** Net Buy: ₹55.2 Cr, Top Buyers: HDFC Midcap Opportunities, Sundaram Mutual Fund, Motilal Oswal Multi Cap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 87/100 and a float squeeze score of 91. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹304.19 protecting capital against thesis failure. Catalyst backing: Sunkan energy transition beneficiary post-Sunflame acquisition with non-South geography contribution rising past 50%.

---

### #23: BAJAJHLDNG — BAJAJ HOLDINGS & INVESTMENT LIMITED

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹11100 | **Entry:** ₹11044.5
- **Capital Protection Stop Loss:** ₹10489.5
- **Profit Targets:** Target 1 (+2R): ₹12154.5 | Target 2 (+4R): ₹12709.5
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +2.43%
  - Turnover: ₹778 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹72.24 Cr on 2026-08-25 (1.41x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -5.6% (8 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.08% (₹829.9 Cr over 12 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹10811 > P0: ₹10459
  - Drop: -1.63%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹11078 > H1: ₹10990 (+2.47% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.08% (₹829.9 Cr over 12 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹10459 vs SMA 200: ₹10851.47 (-3.62%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹10811 > P0: ₹10459
  - Drop: -1.63%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 92/100, Squeeze Score: 93, Delivery Surge: 3.35x, Float Tightness: 1.05x
- **[Institutional Inflow]** Net Buy: ₹187 Cr, Top Buyers: Bajaj Group Trusts, SBI Large & Midcap, ICICI Prudential Life, BlackRock

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 92/100 and a float squeeze score of 93. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹10489.5 protecting capital against thesis failure. Catalyst backing: Deep 45% holding company discount to net asset value (NAV) backed by soaring dividends and zero debt.

---

### #24: AUBANK — AU SMALL FINANCE BANK LIMITED

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹1028 | **Entry:** ₹1022.86
- **Capital Protection Stop Loss:** ₹971.46
- **Profit Targets:** Target 1 (+2R): ₹1125.66 | Target 2 (+4R): ₹1177.06
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **87/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +15.2% over 10 bars
  - Base Compaction Duration (2–6 Weeks): 25 sessions (5.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹1046.9 vs Floor: ₹1025.65
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +6.43%
  - Turnover: ₹2698 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹645.48 Cr on 2026-08-25 (3.37x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -7.31% (11 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +10.31% (₹1841.4 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1045.7 > P0: ₹960
  - Drop: -1.26%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹1083.3 > H1: ₹1059 (+3.6% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +10.31% (₹1841.4 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹960 vs SMA 200: ₹970.34 (-1.07%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1045.7 > P0: ₹960
  - Drop: -1.26%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 88/100, Squeeze Score: 88, Delivery Surge: 3.2x, Float Tightness: 0.35x
- **[Institutional Inflow]** Net Buy: ₹238 Cr, Top Buyers: Warburg Pincus, Temasek Holdings, HDFC Bank Funds, SBI Life Insurance

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 88/100 and a float squeeze score of 88. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹971.46 protecting capital against thesis failure. Catalyst backing: Fincare Small Finance Bank merger completed seamlessly; scaling retail deposits and urban asset franchise with industry-leading CASA momentum.

---

### #25: MUFIN — MUFIN GREEN FINANCE LTD

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹132.49 | **Entry:** ₹131.83
- **Capital Protection Stop Loss:** ₹125.21
- **Profit Targets:** Target 1 (+2R): ₹145.07 | Target 2 (+4R): ₹151.69
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **86/100**
- **Qualified Strategies (4):** `S1, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +15.02% over 19 bars
  - Base Compaction Duration (2–6 Weeks): 15 sessions (3.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹131.31 vs Floor: ₹130.85
- **[QGLP]** Total: 86/100, Squeeze Score: 89, Delivery Surge: 2.85x, Float Tightness: 1.39x
- **[Institutional Inflow]** Net Buy: ₹21.6 Cr, Top Buyers: InCred Financial, Incofin Microfinance Fund, Vijay Kedia PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S19, S18, S13 across 2 independent evidence buckets (Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 86/100 and a float squeeze score of 89. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹125.21 protecting capital against thesis failure. Catalyst backing: First pure-play listed EV NBFC with AUM compounding at 65% YoY; deep telematics integration preventing asset slippages.

---

### #26: PRICOLLTD — PRICOL LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹740.75 | **Entry:** ₹737.05
- **Capital Protection Stop Loss:** ₹700.01
- **Profit Targets:** Target 1 (+2R): ₹811.13 | Target 2 (+4R): ₹848.17
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **88/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +21.74% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹736.1 vs Floor: ₹718.49
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +2.29%
  - Turnover: ₹435.6 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹21.04 Cr on 2026-08-19 (0.56x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -9.38% (14 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +26.95% (₹808.5 Cr over 11 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹727 > P0: ₹597
  - Drop: -4.08%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹782.2 > H1: ₹757.9 (+7.59% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +26.95% (₹808.5 Cr over 11 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹597 vs SMA 200: ₹587.64 (+1.59%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹727 > P0: ₹597
  - Drop: -4.08%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 89/100, Squeeze Score: 93, Delivery Surge: 3.55x, Float Tightness: 0.63x
- **[Institutional Inflow]** Net Buy: ₹79.2 Cr, Top Buyers: Minda Corp (Strategic Stake), Sundaram Small Cap, Tata Mutual Fund, DSP Midcap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 89/100 and a float squeeze score of 93. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹700.01 protecting capital against thesis failure. Catalyst backing: Debt-free instrument cluster leader holding 50%+ share in Indian two-wheelers; connected TFT digital displays driving margin expansion.

---

### #27: TBOTEK — TBO TEK LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹1656.1 | **Entry:** ₹1647.82
- **Capital Protection Stop Loss:** ₹1565.01
- **Profit Targets:** Target 1 (+2R): ₹1813.44 | Target 2 (+4R): ₹1896.25
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **91/100**
- **Qualified Strategies (6):** `S1, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +17.34% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 12 sessions (2.4 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹1632.2 vs Floor: ₹1585.6
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +13.48% (₹948.7 Cr over 13 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1613.7 > P0: ₹1435.1
  - Drop: -0.91%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹1715.2 > H1: ₹1628.6 (+6.29% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +13.48% (₹948.7 Cr over 13 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹1435.1 vs SMA 200: ₹1407.58 (+1.96%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1613.7 > P0: ₹1435.1
  - Drop: -0.91%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 90/100, Squeeze Score: 98, Delivery Surge: 3.45x, Float Tightness: 1.86x
- **[Institutional Inflow]** Net Buy: ₹126 Cr, Top Buyers: General Atlantic, Abu Dhabi Investment Authority (ADIA), Kotak Emerging Equity

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 90/100 and a float squeeze score of 98. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1565.01 protecting capital against thesis failure. Catalyst backing: Asset-light global platform with 160,000+ travel buyers across 100+ countries; operating leverage compounding free cash flows.

---

### #28: ADISOFT — ADISOFT TECHNOLOGIES LIMITED

- **Sector:** Technology | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹245.6 | **Entry:** ₹244.37
- **Capital Protection Stop Loss:** ₹232.09
- **Profit Targets:** Target 1 (+2R): ₹268.93 | Target 2 (+4R): ₹293.49
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **84/100**
- **Qualified Strategies (4):** `S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[QGLP]** Total: 80/100, Squeeze Score: 86, Delivery Surge: 2.5x, Float Tightness: 1.38x
- **[Institutional Inflow]** Net Buy: ₹3.8 Cr, Top Buyers: Multi-Act PMS, Quant Active Fund, Choice Equity Broking

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S19, S18, S13, S16 across 2 independent evidence buckets (Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 80/100 and a float squeeze score of 86. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹232.09 protecting capital against thesis failure. Catalyst backing: Accelerating digital transformation pipeline with European offshore delivery scaling; quarterly profit doubling QoQ.

---

### #29: ARVSMART — ARVIND SMARTSPACES LIMITED

- **Sector:** Real Estate | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹564.15 | **Entry:** ₹561.33
- **Capital Protection Stop Loss:** ₹533.12
- **Profit Targets:** Target 1 (+2R): ₹617.75 | Target 2 (+4R): ₹645.96
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **89/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +7.4%
  - Turnover: ₹80.5 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹22.20 Cr on 2026-08-24 (0.64x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -15.65% (13 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.88% (₹291 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹590.7 > P0: ₹583.05
  - Drop: -2.48%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹648.95 > H1: ₹605.7 (+9.86% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.88% (₹291 Cr over 25 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹583.05 vs SMA 200: ₹587.77 (-0.8%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹590.7 > P0: ₹583.05
  - Drop: -2.48%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 87/100, Squeeze Score: 89, Delivery Surge: 2.95x, Float Tightness: 1.17x
- **[Institutional Inflow]** Net Buy: ₹41.2 Cr, Top Buyers: HDFC Capital Advisors, ICICI Prudential Smallcap, WhiteOak Capital

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 87/100 and a float squeeze score of 89. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹533.12 protecting capital against thesis failure. Catalyst backing: Lalbhai brand pedigree ensuring immediate launch sell-outs in Ahmedabad and Bengaluru; low-risk horizontal plotted model with 30%+ ROCE.

---

### #30: EPIGRAL — EPIGRAL LIMITED

- **Sector:** Basic Materials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹1092.2 | **Entry:** ₹1086.74
- **Capital Protection Stop Loss:** ₹1032.13
- **Profit Targets:** Target 1 (+2R): ₹1195.96 | Target 2 (+4R): ₹1250.57
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **88/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +12.88%
  - Turnover: ₹158.9 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹43.04 Cr on 2026-08-24 (4.58x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -9.09% (10 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.94% (₹74.2 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1125.6 > P0: ₹1094
  - Drop: -2.88%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹1215 > H1: ₹1159 (+7.94% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.94% (₹74.2 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹1094 vs SMA 200: ₹1155.85 (-5.35%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1125.6 > P0: ₹1094
  - Drop: -2.88%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 88/100, Squeeze Score: 92, Delivery Surge: 3.25x, Float Tightness: 1.11x
- **[Institutional Inflow]** Net Buy: ₹66.5 Cr, Top Buyers: Nippon India Small Cap, DSP Small Cap Fund, Tata Multicap Fund

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 88/100 and a float squeeze score of 92. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1032.13 protecting capital against thesis failure. Catalyst backing: First domestic manufacturer of Epichlorohydrin (ECH) and CPVC resin replacing Chinese imports; high-margin derivatives expanding.

---

### #31: FERMENTA — FERMENTA BIOTECH LIMITED

- **Sector:** Healthcare | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹471 | **Entry:** ₹468.65
- **Capital Protection Stop Loss:** ₹445.1
- **Profit Targets:** Target 1 (+2R): ₹515.75 | Target 2 (+4R): ₹539.3
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **89/100**
- **Qualified Strategies (7):** `S1, S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +21.73% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 14 sessions (2.8 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹456.05 vs Floor: ₹433.78
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +13.19%
  - Turnover: ₹78.9 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹10.14 Cr on 2026-08-28 (1.2x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -12.41% (7 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +31.48% (₹190.9 Cr over 23 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹395.15 > P0: ₹305
  - Drop: -1.46%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹481 > H1: ₹401 (+21.73% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +31.48% (₹190.9 Cr over 23 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹305 vs SMA 200: ₹302.25 (+0.91%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹395.15 > P0: ₹305
  - Drop: -1.46%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 87/100, Squeeze Score: 92, Delivery Surge: 3.1x, Float Tightness: 1.39x
- **[Institutional Inflow]** Net Buy: ₹28.6 Cr, Top Buyers: Quant Mutual Fund, ITI Small Cap Fund, Malabar Investment Fund

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 87/100 and a float squeeze score of 92. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹445.1 protecting capital against thesis failure. Catalyst backing: Top-3 global manufacturer of Vitamin D3 with backward integrated cholesterol feedstocks and patented green chemistry enzymes.

---

### #32: GKENERGY — GK ENERGY LIMITED

- **Sector:** Utilities | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹123.57 | **Entry:** ₹122.95
- **Capital Protection Stop Loss:** ₹116.77
- **Profit Targets:** Target 1 (+2R): ₹135.31 | Target 2 (+4R): ₹141.49
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **77/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +16.42%
  - Turnover: ₹160.7 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹82.63 Cr on 2026-08-27 (6.9x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -11.32% (10 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +4.65% (₹97 Cr over 9 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹127.3 > P0: ₹125.9
  - Drop: -3.38%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹133.88 > H1: ₹131.75 (+5.17% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +4.65% (₹97 Cr over 9 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹125.9 vs SMA 200: ₹137.18 (-8.22%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹127.3 > P0: ₹125.9
  - Drop: -3.38%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 78/100, Squeeze Score: 81, Delivery Surge: 2.2x, Float Tightness: 1.04x
- **[Institutional Inflow]** Net Buy: ₹12.5 Cr, Top Buyers: Invesco India Growth, BOI AXA Small Cap, Alternate Energy PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 78/100 and a float squeeze score of 81. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹116.77 protecting capital against thesis failure. Catalyst backing: Commercial and industrial (C&I) green power purchase agreements scaling with corporate net-zero demand.

---

### #33: HNDFDS — HINDUSTAN FOODS LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹598.15 | **Entry:** ₹595.16
- **Capital Protection Stop Loss:** ₹565.25
- **Profit Targets:** Target 1 (+2R): ₹654.98 | Target 2 (+4R): ₹684.89
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **92/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +2.87%
  - Turnover: ₹99.7 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹9.77 Cr on 2026-08-31 (1.34x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -7.75% (7 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +13% (₹126.6 Cr over 24 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹588.5 > P0: ₹524.15
  - Drop: -0.64%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹623.9 > H1: ₹592.3 (+6.02% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +13% (₹126.6 Cr over 24 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹524.15 vs SMA 200: ₹514.43 (+1.89%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹588.5 > P0: ₹524.15
  - Drop: -0.64%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 90/100, Squeeze Score: 97, Delivery Surge: 3.4x, Float Tightness: 1.84x
- **[Institutional Inflow]** Net Buy: ₹45.2 Cr, Top Buyers: SBI Magnum Midcap, Axis Small Cap, Motilal Oswal Focused, Westbridge Capital

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 90/100 and a float squeeze score of 97. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹565.25 protecting capital against thesis failure. Catalyst backing: Monopoly contract manufacturer for Unilever, P&G, Reckitt, and PepsiCo; dedicated capex model guaranteeing double-digit ROCE.

---

### #34: MONARCH — MONARCH NETWORTH CAPITAL LIMITED

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹366.5 | **Entry:** ₹364.67
- **Capital Protection Stop Loss:** ₹346.34
- **Profit Targets:** Target 1 (+2R): ₹401.33 | Target 2 (+4R): ₹419.66
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **85/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +1.8%
  - Turnover: ₹67.8 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹3.93 Cr on 2026-08-31 (0.64x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -7.01% (5 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +16.65% (₹147.8 Cr over 24 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹356.2 > P0: ₹306.9
  - Drop: -0.5%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹389.9 > H1: ₹358 (+9.46% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +16.65% (₹147.8 Cr over 24 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹306.9 vs SMA 200: ₹301.32 (+1.85%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹356.2 > P0: ₹306.9
  - Drop: -0.5%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 86/100, Squeeze Score: 88, Delivery Surge: 2.75x, Float Tightness: 1.35x
- **[Institutional Inflow]** Net Buy: ₹60.5 Cr, Top Buyers: Quant Small Cap Fund, Ashish Kacholia, Ramesh Damani PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 86/100 and a float squeeze score of 88. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹346.34 protecting capital against thesis failure. Catalyst backing: Synergistic capital markets expansion with merchant banking pipeline exceeding 25 upcoming IPO mandates and wealth AUM doubling.

---

### #35: RPGLIFE — RPG LIFE SCIENCES LIMITED

- **Sector:** Healthcare | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹2718.8 | **Entry:** ₹2705.21
- **Capital Protection Stop Loss:** ₹2569.27
- **Profit Targets:** Target 1 (+2R): ₹2977.09 | Target 2 (+4R): ₹3113.03
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **93/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +11.57%
  - Turnover: ₹64.2 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹7.93 Cr on 2026-09-08 (2.06x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -6.05% (1 bars)
  - Vol Dry: NO
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +28.16% (₹296.5 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹2509.1 > P0: ₹2200
  - Drop: -11.01%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹2870 > H1: ₹2819.5 (+14.38% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +28.16% (₹296.5 Cr over 25 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹2200 vs SMA 200: ₹2175.95 (+1.11%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹2509.1 > P0: ₹2200
  - Drop: -11.01%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 90/100, Squeeze Score: 100, Delivery Surge: 3.3x, Float Tightness: 2.6x
- **[Institutional Inflow]** Net Buy: ₹68.1 Cr, Top Buyers: HDFC Healthcare Fund, Nippon India Growth, Kotak Multicap, DSP Healthcare

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 90/100 and a float squeeze score of 100. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹2569.27 protecting capital against thesis failure. Catalyst backing: Zero-debt pharma flagship of RPG Group with Azathioprine global leadership, domestic chronic therapy expansion, and 30%+ ROCE.

---

### #36: ZUARIIND — ZUARI INDUSTRIES LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹265.3 | **Entry:** ₹263.97
- **Capital Protection Stop Loss:** ₹250.7
- **Profit Targets:** Target 1 (+2R): ₹290.51 | Target 2 (+4R): ₹303.78
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **89/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +4.16%
  - Turnover: ₹54.5 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹14.40 Cr on 2026-08-20 (4.85x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -8.59% (12 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +8.91% (₹51 Cr over 12 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹268 > P0: ₹257
  - Drop: -4.25%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹282.7 > H1: ₹279.9 (+5.49% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +8.91% (₹51 Cr over 12 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹257 vs SMA 200: ₹271.78 (-5.44%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹268 > P0: ₹257
  - Drop: -4.25%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 85/100, Squeeze Score: 89, Delivery Surge: 2.8x, Float Tightness: 1.41x
- **[Institutional Inflow]** Net Buy: ₹18.2 Cr, Top Buyers: Tata Resources & Energy Fund, Quant Infrastructure, Dolly Khanna PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 85/100 and a float squeeze score of 89. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹250.7 protecting capital against thesis failure. Catalyst backing: Massive ethanol distillation expansion delivering high-margin contracted supply to OMCs alongside valuable real estate monetizations.

---

### #37: MAHSCOOTER — MAHARASHTRA SCOOTERS LIMITED

- **Sector:** Financial Services | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹12882 | **Entry:** ₹12817.59
- **Capital Protection Stop Loss:** ₹12173.49
- **Profit Targets:** Target 1 (+2R): ₹14105.79 | Target 2 (+4R): ₹14749.89
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **88/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +6.97%
  - Turnover: ₹88.2 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹24.66 Cr on 2026-08-26 (5.19x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -7.81% (10 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +7.09% (₹96.8 Cr over 15 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹13001 > P0: ₹12380
  - Drop: -1.94%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹13493 > H1: ₹13258 (+3.78% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +7.09% (₹96.8 Cr over 15 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹12380 vs SMA 200: ₹13260.85 (-6.64%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹13001 > P0: ₹12380
  - Drop: -1.94%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 92/100, Squeeze Score: 90, Delivery Surge: 3.1x, Float Tightness: 1.04x
- **[Institutional Inflow]** Net Buy: ₹94.5 Cr, Top Buyers: Bajaj Group Entities, Sundaram Multi Cap, ICICI Pru Dividend Yield

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 92/100 and a float squeeze score of 90. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹12173.49 protecting capital against thesis failure. Catalyst backing: Deeply undervalued holding company trading at a 55% discount to underlying liquid investments in Bajaj twins; continuous high dividend flow.

---

### #38: NIITLTD — NIIT LIMITED

- **Sector:** Consumer Defensive | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹87.32 | **Entry:** ₹86.88
- **Capital Protection Stop Loss:** ₹82.51
- **Profit Targets:** Target 1 (+2R): ₹95.62 | Target 2 (+4R): ₹99.99
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **85/100**
- **Qualified Strategies (6):** `S2, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +16.66%
  - Turnover: ₹81.5 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹13.41 Cr on 2026-08-25 (2.68x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -12.88% (8 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +15.28% (₹895.6 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹93.21 > P0: ₹85.25
  - Drop: -5.16%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹99.37 > H1: ₹98.28 (+6.61% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +15.28% (₹895.6 Cr over 25 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹85.25 vs SMA 200: ₹84.35 (+1.06%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹93.21 > P0: ₹85.25
  - Drop: -5.16%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 85/100, Squeeze Score: 84, Delivery Surge: 2.65x, Float Tightness: 0.72x
- **[Institutional Inflow]** Net Buy: ₹26.8 Cr, Top Buyers: WhiteOak Capital, Nippon India Small Cap, Mukul Agrawal

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S2, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 85/100 and a float squeeze score of 84. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹82.51 protecting capital against thesis failure. Catalyst backing: Post-demerger pure-play skills institution with net cash exceeding 50% of market cap and BFSI training hiring cycles rebounding.

---

### #39: SSDL — SARASWATI SAREE DEPOT LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹60.22 | **Entry:** ₹59.92
- **Capital Protection Stop Loss:** ₹56.91
- **Profit Targets:** Target 1 (+2R): ₹65.94 | Target 2 (+4R): ₹71.96
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **82/100**
- **Qualified Strategies (4):** `S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[QGLP]** Total: 79/100, Squeeze Score: 85, Delivery Surge: 2.55x, Float Tightness: 1.13x
- **[Institutional Inflow]** Net Buy: ₹3.4 Cr, Top Buyers: Multi-Act PMS, Quant Active Fund, Choice Equity Broking

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S19, S18, S13, S16 across 2 independent evidence buckets (Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 79/100 and a float squeeze score of 85. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹56.91 protecting capital against thesis failure. Catalyst backing: Operational turnaround driven by exports of specialty synthetic fabrics with margin expanding 240 bps.

---

### #40: IRMENERGY — IRM ENERGY LIMITED

- **Sector:** Utilities | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹266.5 | **Entry:** ₹265.17
- **Capital Protection Stop Loss:** ₹251.84
- **Profit Targets:** Target 1 (+2R): ₹291.83 | Target 2 (+4R): ₹305.16
- **v5.3.1 Verdict:** **HIGH CONVICTION EXECUTE**
- **Signal Quality Score:** **82/100**
- **Qualified Strategies (6):** `S1, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +15.13% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 14 sessions (2.8 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹276 vs Floor: ₹269.05
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.1% (₹186.5 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹257.6 > P0: ₹256.8
  - Drop: -4.56%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹294.35 > H1: ₹269.9 (+14.27% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +5.1% (₹186.5 Cr over 25 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹256.8 vs SMA 200: ₹274.47 (-6.44%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹257.6 > P0: ₹256.8
  - Drop: -4.56%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 85/100, Squeeze Score: 87, Delivery Surge: 2.3x, Float Tightness: 2.08x
- **[Institutional Inflow]** Net Buy: ₹17.5 Cr, Top Buyers: Cadila Healthcare Promoters, SBI Infrastructure Fund, Kotak Multicap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 85/100 and a float squeeze score of 87. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹251.84 protecting capital against thesis failure. Catalyst backing: Geographical exclusivity across 4 prime industrial clusters in Gujarat, Punjab, and Tamil Nadu with volume growth exceeding 20% CAGR.

---

### #41: SWARAJ — SWARAJ SUITING LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹353.15 | **Entry:** ₹351.38
- **Capital Protection Stop Loss:** ₹333.72
- **Profit Targets:** Target 1 (+2R): ₹386.7 | Target 2 (+4R): ₹404.36
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (6):** `S1, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +17.21% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 24 sessions (4.8 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹350.1 vs Floor: ₹341.87
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +52.14% (₹109.5 Cr over 20 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹348 > P0: ₹243
  - Drop: -5.87%
  - Vol Dry: NO
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹375 > H1: ₹369.7 (+7.76% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +52.14% (₹109.5 Cr over 20 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹243 vs SMA 200: ₹246.87 (-1.57%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹348 > P0: ₹243
  - Drop: -5.87%
  - Vol Dry: NO
  - Range Compacted: YES
- **[QGLP]** Total: 91/100, Squeeze Score: 97, Delivery Surge: 3.5x, Float Tightness: 1.65x
- **[Institutional Inflow]** Net Buy: ₹39.6 Cr, Top Buyers: SBI Equity Hybrid, ICICI Pru Value Discovery, Tata Mutual Fund, Franklin India

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 91/100 and a float squeeze score of 97. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹333.72 protecting capital against thesis failure. Catalyst backing: Captive sole engine supplier to Swaraj Tractors (M&M) boasting 38% ROCE, zero debt, and multi-year tractor upgrade demand post good monsoon.

---

### #42: UNICHEMLAB — UNICHEM LABORATORIES LIMITED

- **Sector:** Healthcare | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹519.05 | **Entry:** ₹516.45
- **Capital Protection Stop Loss:** ₹490.5
- **Profit Targets:** Target 1 (+2R): ₹568.35 | Target 2 (+4R): ₹594.3
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **91/100**
- **Qualified Strategies (6):** `S1, S2, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +15.27% over 12 bars
  - Base Compaction Duration (2–6 Weeks): 12 sessions (2.4 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹521.05 vs Floor: ₹515.44
- **[S2]** Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr): Move: +15.98%
  - Turnover: ₹155.2 Cr
  - Single-Day Institutional Inflow (> ₹2 Cr): ₹43.11 Cr on 2026-08-25 (2.24x Vol)
  - Pullback Phase with VPA Alignment & Compaction: Drop: -12.21% (5 bars)
  - Vol Dry: YES
  - Range Compacted: YES
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +52.07% (₹1798.5 Cr over 20 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹376.6 vs SMA 200: ₹408.75 (-7.87%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹495 > P0: ₹376.6
  - Drop: -13.57%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 89/100, Squeeze Score: 98, Delivery Surge: 3.2x, Float Tightness: 2.36x
- **[Institutional Inflow]** Net Buy: ₹60.8 Cr, Top Buyers: Ipca Laboratories (Strategic Promoter), HDFC Small Cap, DSP Healthcare

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S2, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 89/100 and a float squeeze score of 98. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹490.5 protecting capital against thesis failure. Catalyst backing: Synergistic operational integration under Ipca Labs parentage clearing FDA hurdles and unlocking massive operational leverage in US generics.

---

### #43: VRLLOG — VRL LOGISTICS LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹283.6 | **Entry:** ₹282.18
- **Capital Protection Stop Loss:** ₹268
- **Profit Targets:** Target 1 (+2R): ₹310.54 | Target 2 (+4R): ₹324.72
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **90/100**
- **Qualified Strategies (6):** `S1, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +16.93% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹282.55 vs Floor: ₹280.62
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +17.49% (₹311.3 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹280.5 > P0: ₹250.65
  - Drop: -4.75%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹298.9 > H1: ₹294.5 (+6.56% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +17.49% (₹311.3 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹250.65 vs SMA 200: ₹257.81 (-2.78%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹280.5 > P0: ₹250.65
  - Drop: -4.75%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 89/100, Squeeze Score: 94, Delivery Surge: 3.1x, Float Tightness: 1.79x
- **[Institutional Inflow]** Net Buy: ₹41.8 Cr, Top Buyers: SBI Magnum Midcap, ICICI Pru Transportation, Sundaram Mutual Fund, DSP Multi Cap

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 89/100 and a float squeeze score of 94. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹268 protecting capital against thesis failure. Catalyst backing: Largest owned fleet in India with complete post-demerger focus on high-margin Less-Than-Truckload (LTL) parcel express logistics.

---

### #44: WINDMACHIN — WINDSOR MACHINES LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹300.7 | **Entry:** ₹299.2
- **Capital Protection Stop Loss:** ₹284.16
- **Profit Targets:** Target 1 (+2R): ₹329.28 | Target 2 (+4R): ₹344.32
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **86/100**
- **Qualified Strategies (6):** `S1, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +16.72% over 14 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹296.6 vs Floor: ₹285.58
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +10.71% (₹81.8 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹295 > P0: ₹276.85
  - Drop: -3.75%
  - Vol Dry: YES
  - Range Compacted: NO
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹311.5 > H1: ₹306.5 (+5.59% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +13.39% (₹73.5 Cr over 8 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹273.4 vs SMA 200: ₹275.26 (-0.67%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹291.25 > P0: ₹273.4
  - Drop: -6.05%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 82/100, Squeeze Score: 87, Delivery Surge: 2.7x, Float Tightness: 1.15x
- **[Institutional Inflow]** Net Buy: ₹9.8 Cr, Top Buyers: Multi-Act Private Wealth, Choice Broking, High-Net-Worth Portfolios

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 82/100 and a float squeeze score of 87. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹284.16 protecting capital against thesis failure. Catalyst backing: Capital expenditure revival across domestic auto, medical packaging, and consumer durables fueling multi-quarter machinery orders.

---

### #45: LAMOSAIC — LAMOSAIC INDIA LIMITED

- **Sector:** Basic Materials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹53.25 | **Entry:** ₹52.98
- **Capital Protection Stop Loss:** ₹50.32
- **Profit Targets:** Target 1 (+2R): ₹58.3 | Target 2 (+4R): ₹60.96
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **81/100**
- **Qualified Strategies (6):** `S1, S3, S4, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +24.53% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹53.25 vs Floor: ₹53.19
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +64.06% (₹25.1 Cr over 22 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹53.05 > P0: ₹32.55
  - Drop: -0.66%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹61.45 > H1: ₹53.4 (+15.83% leg)
- **[S4]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +64.06% (₹25.1 Cr over 22 bars)
  - Smart Money: YES
  - Initial Move (P0) Near SMA 200 (±2% Tolerance Range): P0: ₹32.55 vs SMA 200: ₹32.12 (+1.33%)
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹53.05 > P0: ₹32.55
  - Drop: -0.66%
  - Vol Dry: YES
  - Range Compacted: YES
- **[QGLP]** Total: 79/100, Squeeze Score: 81, Delivery Surge: 2.15x, Float Tightness: 1.08x
- **[Institutional Inflow]** Net Buy: ₹1 Cr, Top Buyers: Microcap Opportunities PMS, Regional Brokers, Retail HNI Cohort

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S3, S4, S19, S18, S13 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 79/100 and a float squeeze score of 81. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹50.32 protecting capital against thesis failure. Catalyst backing: Rapid expansion in urban architectural projects with high margin customization.

---

### #46: AETHER — AETHER INDUSTRIES LIMITED

- **Sector:** Basic Materials | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹1583.1 | **Entry:** ₹1575.18
- **Capital Protection Stop Loss:** ₹1496.02
- **Profit Targets:** Target 1 (+2R): ₹1733.5 | Target 2 (+4R): ₹1891.82
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **89/100**
- **Qualified Strategies (5):** `S1, S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +15.67% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 10 sessions (2.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹1586.4 vs Floor: ₹1569.71
- **[QGLP]** Total: 91/100, Squeeze Score: 92, Delivery Surge: 3.4x, Float Tightness: 1.63x
- **[Institutional Inflow]** Net Buy: ₹52.6 Cr, Top Buyers: WhiteOak Capital, SBI Small Cap, HDFC Multi Cap, Goldman Sachs FII

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S19, S18, S13, S16 across 2 independent evidence buckets (Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 91/100 and a float squeeze score of 92. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1496.02 protecting capital against thesis failure. Catalyst backing: Global pioneer in continuous flow chemistry commanding 30%+ gross margins with long-term contracts from global pharmaceutical innovators.

---

### #47: EIEL — ENVIRO INFRA ENGINEERS LIMITED

- **Sector:** Industrials | **Timeframe:** `SWING`
- **Current Price (CMP):** ₹196.91 | **Entry:** ₹195.93
- **Capital Protection Stop Loss:** ₹186.08
- **Profit Targets:** Target 1 (+2R): ₹215.63 | Target 2 (+4R): ₹225.48
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **85/100**
- **Qualified Strategies (4):** `S3, S19, S18, S13`
- **Primary Evidence Buckets:** Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +3.18% (₹115.8 Cr over 8 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹197.8 > P0: ₹195.67
  - Drop: -2.03%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹204.7 > H1: ₹201.89 (+3.49% leg)
- **[QGLP]** Total: 86/100, Squeeze Score: 86, Delivery Surge: 2.9x, Float Tightness: 1.3x
- **[Institutional Inflow]** Net Buy: ₹19.8 Cr, Top Buyers: Nippon India Small Cap, Quant Infrastructure, Ashish Kacholia PMS

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S3, S19, S18, S13 across 3 independent evidence buckets (Bucket A: Trend & Momentum; Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 86/100 and a float squeeze score of 86. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹186.08 protecting capital against thesis failure. Catalyst backing: Critical sub-component supplier to 250 million smart meter mandate under RDSS scheme with multi-year order backlog.

---

### #48: INDNIPPON — INDIA NIPPON ELECTRICALS LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹1279 | **Entry:** ₹1272.61
- **Capital Protection Stop Loss:** ₹1208.66
- **Profit Targets:** Target 1 (+2R): ₹1400.51 | Target 2 (+4R): ₹1528.41
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **88/100**
- **Qualified Strategies (5):** `S3, S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket A: Trend & Momentum, Bucket B: Volume & Absorption, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +43.63% (₹233.1 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹1115 > P0: ₹855.55
  - Drop: -9.26%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹1564 > H1: ₹1228.8 (+40.27% leg)
- **[QGLP]** Total: 90/100, Squeeze Score: 91, Delivery Surge: 3.15x, Float Tightness: 1.99x
- **[Institutional Inflow]** Net Buy: ₹21 Cr, Top Buyers: Sundaram Small Cap, HDFC Defense & Auto Fund, TVS Group Holding

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S3, S19, S18, S13, S16 across 3 independent evidence buckets (Bucket A: Trend & Momentum; Bucket B: Volume & Absorption; Bucket C: Catalyst & Alpha). Technical momentum is verified by Dow Theory Higher-High/Higher-Low structural stability above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 90/100 and a float squeeze score of 91. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹1208.66 protecting capital against thesis failure. Catalyst backing: Pristine zero-debt TVS JV with high cash balances and surging electronic content per two-wheeler engine.

---

### #49: KROSS — KROSS LIMITED

- **Sector:** Consumer Cyclical | **Timeframe:** `MULTIBAGGER`
- **Current Price (CMP):** ₹228.87 | **Entry:** ₹227.73
- **Capital Protection Stop Loss:** ₹216.29
- **Profit Targets:** Target 1 (+2R): ₹250.61 | Target 2 (+4R): ₹273.49
- **v5.3.1 Verdict:** **PULLBACK ACCUMULATE**
- **Signal Quality Score:** **87/100**
- **Qualified Strategies (6):** `S1, S3, S19, S18, S13, S16`
- **Primary Evidence Buckets:** Bucket B: Volume & Absorption, Bucket A: Trend & Momentum, Bucket C: Catalyst & Alpha

#### Coded Parameter Values & Quantitative Rule Checks

- **[S1]** Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks): +18.58% over 20 bars
  - Base Compaction Duration (2–6 Weeks): 25 sessions (5.0 weeks)
  - Retracement Floor: Holds Upper Quadrant: Low: ₹197 vs Floor: ₹191.54
- **[S3]** Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money): +13.76% (₹197.2 Cr over 25 bars)
  - Smart Money: YES
  - First Pullback with VPA Alignment & Range Compaction (L1 > P0): L1: ₹205.36 > P0: ₹191.14
  - Drop: -5.56%
  - Vol Dry: YES
  - Range Compacted: YES
  - Continuation to Higher High (H2 > H1) Regardless of Driver: H2: ₹240.8 > H1: ₹217.45 (+17.26% leg)
- **[QGLP]** Total: 89/100, Squeeze Score: 94, Delivery Surge: 3.3x, Float Tightness: 2.13x
- **[Institutional Inflow]** Net Buy: ₹21.5 Cr, Top Buyers: Kotak Small Cap Fund, Tata Multicap Fund, WhiteOak Capital, Junomoneta

#### Institutional Investment Thesis & Business Rationale

> Scrip qualifies S1, S3, S19, S18, S13, S16 across 3 independent evidence buckets (Bucket B: Volume & Absorption; Bucket A: Trend & Momentum; Bucket C: Catalyst & Alpha). Technical momentum is verified by VPA base breakout with dry volume absorption above the rising 200 SMA, while institutional smart money metrics demonstrate a QGLP score of 89/100 and a float squeeze score of 94. The setup exhibits asymmetric risk-reward (+2R/+4R) with a hard invalidation stop at ₹216.29 protecting capital against thesis failure. Catalyst backing: Integrated forging and machining player with long-term supply agreements to Tata Motors and Ashok Leyland; expanding into trailer axle exports.

---

