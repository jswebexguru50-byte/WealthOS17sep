# WealthOS / ITAS: Master Strategy Parameters & Business Definitions Dictionary

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

WealthOS / ITAS operates on a **10-Gate Sequential Elimination Pipeline** backed by **6 Independent Evidence Buckets** (Trend, Volume, Catalyst, Mean Reversion, Macro, Structural).

To eliminate false consensus (e.g. counting two volume indicators as independent confirmations), no strategy is permitted to execute without passing through the **Signal Quality Overlay** requiring at least two independent evidence buckets.

Below is the definitive, parameter-by-parameter delineation of all strategies coded in the WealthOS application engine.

---

# Table of Contents
1. [Strategy S1 — VPA Base Compaction Breakout](#strategy-s1--vpa-base-compaction-breakout)
2. [Strategy S2 — Institutional Inflow & FVG / CE Pullback](#strategy-s2--institutional-inflow--fvg--ce-pullback)
3. [Strategy S3 — Higher High & Higher Low Sequential Compaction](#strategy-s3--higher-high--higher-low-sequential-compaction)
4. [Strategy S4 — Stage 2 Transition (HH/HL + SMA200 + VPA)](#strategy-s4--stage-2-transition-hhhl--sma200--vpa)
5. [Strategy S5 — 50 EMA Pullback Volatility Contraction Pattern (VCP)](#strategy-s5--50-ema-pullback-volatility-contraction-pattern-vcp)
6. [Strategy S6 — Nifty 500 Relative Strength (RS) Breakout](#strategy-s6--nifty-500-relative-strength-rs-breakout)
7. [Strategy S7 — RSI Capitulation Reversal Dip](#strategy-s7--rsi-capitulation-reversal-dip)
8. [Strategy S8 — High-Tight Flag (HTF Momentum)](#strategy-s8--high-tight-flag-htf-momentum)
9. [Strategy S8B — Classical Bull Flag (New Addition)](#strategy-s8b--classical-bull-flag-new-addition)
10. [Strategy S9 — Volume Dry-Up (VDU) with RS Stability](#strategy-s9--volume-dry-up-vdu-with-rs-stability)
11. [Strategy S10 — Trendline Opening Range Breakout (ORB)](#strategy-s10--trendline-opening-range-breakout-orb)
12. [Strategy S11 — Institutional Wyckoff Spring Accumulation](#strategy-s11--institutional-wyckoff-spring-accumulation)
13. [Strategy S12 — Episodic Pivot Institutional Gap-Up](#strategy-s12--episodic-pivot-institutional-gap-up)
14. [Strategy S13 — Earnings Acceleration Momentum](#strategy-s13--earnings-acceleration-momentum)
15. [Strategy S14 — Bearish Beta-Weighted Portfolio Futures Hedge](#strategy-s14--bearish-beta-weighted-portfolio-futures-hedge)
16. [Strategy S15 — Option Credit Spreads Harvest](#strategy-s15--option-credit-spreads-harvest)
17. [Strategy S16 — Operating Leverage Inflection](#strategy-s16--operating-leverage-inflection)
18. [Strategy S17 — Promoter SAST Creeping Squeeze](#strategy-s17--promoter-sast-creeping-squeeze)
19. [Strategy S18 — Abnormal Volume Absorption (Block Deals)](#strategy-s18--abnormal-volume-absorption-block-deals)
20. [Strategy S19 — Z-Score Delivery Volume Spike](#strategy-s19--z-score-delivery-volume-spike)
21. [Strategy S20 — Glenn Neely NEoWave Structural Engine](#strategy-s20--glenn-neely-neowave-structural-engine)
22. [New Modular Strategies (S21 to S26)](#new-modular-strategies-s21-to-s26)

---

## Strategy S1 — VPA Base Compaction Breakout

- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy1`)
- **Category:** `BREAKOUT`
- **Purpose / Description:**  
  Identifies stocks that have undergone an institutional impulse thrust, followed by a tight price consolidation base where selling volume dries up significantly. The strategy triggers on an expansion breakout candle with asymmetric buying volume, indicating that overhead supply has been absorbed and the stock is ready for mark-up.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `impulseGainMinPct` | `≥ 20.0%` | **Initial Thrust Magnitude:** Measures the price percentage gain during the initial upward impulse. Ensures strong prior institutional buying interest. |
| `impulseDurationMaxBars` | `≤ 40 sessions` | **Thrust Velocity:** Limits the maximum number of trading sessions for the impulse move. Prevents sluggish trends from qualifying. |
| `baseDurationMinBars` | `≥ 10 sessions` | **Minimum Base Duration:** The consolidation base must digest gains for at least 10 sessions so short-term flippers exit. |
| `baseDurationMaxBars` | `≤ 120 sessions` | **Maximum Base Duration:** Bases older than 120 sessions suffer from stale momentum and overhead supply fatigue. |
| `retracementFloorMultiplier`| `≥ 0.50` (50%) | **Shallow Retracement Floor:** Price during the base must not retrace more than 50% of the prior impulse height. Proves buyers defend higher levels. |
| `volumeDryingRatio` | `≤ 0.85` (85%) | **Supply Dry-Up Ratio:** Average volume during the final 5 sessions of the base divided by the 20-day Volume Moving Average (VMA). Measures seller exhaustion. |
| `vpaAsymmetryRatioMin` | `≥ 1.25x` | **Volume-Price Asymmetry:** Ratio of up-day volume to down-day volume during the base. Values > 1.25 prove accumulation over distribution. |
| `nr4Enabled` / `nr7Enabled` | `true` | **Narrow Range Compression:** Identifies if the candle prior to breakout is the narrowest range of the last 4 or 7 sessions (volatility coiling). |
| `breakoutLookbackBars` | `20 sessions` | **Resistance Ceiling:** The breakout candle's daily close must exceed the highest high of the preceding 20 consolidation sessions. |
| `stopLossMethod` | `FIXED_PCT_BELOW_L2` (`-1.5%`) | **Structural Invalidation:** Initial hard stop is pegged 1.5% below the lowest trough of the consolidation base ($L_2$). |

---

## Strategy S2 — Institutional Inflow & FVG / CE Pullback

- **Evidence Bucket:** `Bucket B: Volume & Absorption` / `Bucket A: Trend`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy2`)
- **Category:** `PULLBACK`
- **Purpose / Description:**  
  Detects institutional algorithmic footprints that create Fair Value Gaps (FVG) / price imbalances. The strategy waits for price to retrace into the Consequent Encroachment (CE — exact 50% midpoint of the gap) on contracting volume, providing an asymmetric entry before trend resumption.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `cumulativeTurnoverFloorCr` | `≥ ₹25.0 Cr` | **Institutional Scale Gate:** Minimum rupee turnover accumulated during the impulse leg. Filters out illiquid penny stocks. |
| `institutionalVolumeRatio` | `≥ 2.0x` | **Algorithmic Surge Multiplier:** Volume on the day of gap creation must be at least 200% of the 20-day average, confirming large institution participation. |
| `fvgLookbackBars` | `≤ 30 sessions` | **Imbalance Freshness:** The Fair Value Gap must have formed within the last 30 sessions. Stale gaps lose predictive validity. |
| `ceLevel` | `50.0% Midpoint` | **Consequent Encroachment (CE):** The exact midpoint between Candle $i-1$ High and Candle $i+1$ Low. Represents equilibrium retest. |
| `entryRangeContractionRatio` | `≤ 0.80` | **Volatility Contraction at Entry:** Range of the entry candle must be less than 80% of average True Range, proving selling momentum has halted. |
| `entryVolumeDryingRatio` | `≤ 0.70` | **Volume Exhaustion at Retest:** Trading volume at the CE touch must be < 70% of average volume, confirming no institutional dump. |
| `stopLossFvgMultiplier` | `0.985` (`-1.5%`) | **Gap Invalidation Stop:** Stop-loss is set 1.5% below the absolute bottom of the Fair Value Gap. Gap invalidation kills the thesis. |
| `target1RRMultiplier` | `2.5x` | **Reward-to-Risk Minimum:** Target 1 is pegged to at least 2.5 times the dollar risk per share. |

---

## Strategy S3 — Higher High & Higher Low Sequential Compaction

- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy3`)
- **Category:** `MOMENTUM`
- **Purpose / Description:**  
  Tracks Dow Theory structural uptrends where price forms an orderly sequence of Higher Highs ($H_1, H_2$) and Higher Lows ($L_1, L_2$) with volatility contracting between swings. Catches early continuation entries before public retail breakout chasing.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `swingGapMinBars` | `≥ 5 sessions` | **Swing Independence:** Minimum trading sessions separating consecutive pivot highs and lows to prevent microscopic noise. |
| `l2SearchWindow` | `10–40 sessions` | **Trough Search Window:** Time window over which the secondary higher low ($L_2$) must form relative to primary low ($L_1$). |
| `h2OverH1Pct` | `> 0.0%` | **Structural Expansion:** Proves that $H_2$ exceeds $H_1$, confirming primary uptrend progression. |
| `l2OverL1Pct` | `> 0.0%` | **Rising Floor Confirmation:** Proves that $L_2$ is strictly above $L_1$, confirming sellers are unable to push price to prior lows. |
| `atrContractionRatioMax` | `≤ 0.85` | **Range Dampening Ratio:** ATR during the $L_2$ pullback divided by ATR during the $H_1 \to L_1$ pullback. Proves volatility is compacting. |
| `priceAboveSma50` | `true` | **Institutional Benchmark Filter:** The entire compaction structure must rest above the rising 50-day Simple Moving Average. |
| `stopLossMethod` | `FIXED_PCT_BELOW_L2` | **Pivot Invalidation:** Hard stop placed 1.0% below the $L_2$ swing low. If $L_2$ breaks, Higher-Low structure is dead. |

---

## Strategy S4 — Stage 2 Transition (HH/HL + SMA200 + VPA)

- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy4`)
- **Category:** `BREAKOUT`
- **Purpose / Description:**  
  Identifies Stan Weinstein Stage 2 breakout transitions. A stock completes a Stage 1 base, crosses above the rising 200-day Simple Moving Average, and establishes a Higher-High / Higher-Low pivot structure confirmed by Volume Price Analysis.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `priceAboveSma200` | `true` | **Stage 2 Regime Baseline:** Daily close must be strictly above the 200-day Simple Moving Average. |
| `sma200TolerancePct` | `Within ±5.0%` | **Proximity to 200 SMA:** Stock must not be extended > 5% above the 200 SMA when the base forms (avoids buying late-stage rallies). |
| `sma200SlopeRising` | `true` | **Moving Average Trajectory:** 200 SMA value today must be higher than 20 days ago, confirming long-term trend has reversed up. |
| `volumeSurgeMultiplier` | `≥ 1.5x` | **Stage 2 Breakout Volume:** Breakout session volume must exceed 150% of the 50-day average daily turnover. |
| `rsiBullishFloor` | `≥ 52.0` | **Momentum Polarity:** 14-period Relative Strength Index must be above 52, indicating bulls control momentum. |

---

## Strategy S5 — 50 EMA Pullback Volatility Contraction Pattern (VCP)

- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy5`)
- **Category:** `PULLBACK`
- **Purpose / Description:**  
  Mark Minervini VCP archetype. The stock experiences progressive contractions in volatility (Contraction 1 > Contraction 2 > Contraction 3) while respecting the rising 50-day Exponential Moving Average, followed by an explosive pivot breakout.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `emaShortPeriod` / `emaLongPeriod` | `20 EMA / 50 EMA` | **Trend Alignment:** 20 EMA must be strictly stacked above the 50 EMA, and both sloping upward. |
| `emaPullbackProximity` | `≤ 2.0%` | **Support Proximity:** Trough of the final contraction must touch or come within 2% of the rising 50 EMA. |
| `consolidationRangeMaxPct` | `≤ 12.0%` | **Contraction Depth Ceiling:** The final consolidation wave must contract to a depth under 12% from high to low. |
| `volumeBelowAverage` | `true` | **Supply Exhaustion:** Volume on down-days during the contraction must drop below the 20-day VMA. |
| `target1RRMultiplier` | `3.0x` | **Asymmetric Payoff Target:** Because entry stop is exceptionally tight at the 50 EMA, Target 1 demands a 3:1 reward-to-risk ratio. |

---

## Strategy S6 — Nifty 500 Relative Strength (RS) Breakout

- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy6`)
- **Category:** `MOMENTUM`
- **Purpose / Description:**  
  Identifies market-leading stocks that outperform 80% or more of the broader Nifty 500 universe. Exploits the academic Jegadeesh-Titman momentum anomaly over intermediate 3–12 month horizons. RS line reaches new highs before nominal price does.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `rsPercentileFloor` | `≥ 80th Percentile` | **Relative Strength Rank:** Stock must perform in the top 20% of all NSE-listed stocks over a rolling 126-session (6-month) lookback. |
| `rsSlopePeriod` | `21 sessions` | **RS Momentum Acceleration:** The slope of the Mansfield Relative Strength line must be positive over the last 21 sessions. |
| `near52wHighPct` | `Within 15.0%` | **Price Leadership:** CMP must be within 15% of its 52-week nominal price high (rejects laggards trading at lows). |
| `volumeSurgeMultiplier` | `≥ 1.4x` | **Institutional Thrust:** Breakout into new relative strength high must be supported by at least 1.4x average volume. |
| `trailingStopEmaPeriod` | `20 EMA` | **Trend Ride Mechanism:** Dynamic trailing stop rides the daily 20 EMA until a daily close below triggers a partial scale-out. |

---

## Strategy S7 — RSI Capitulation Reversal Dip

- **Evidence Bucket:** `Bucket D: Mean Reversion & Exhaustion`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy7`)
- **Category:** `MEAN_REVERSION`
- **Purpose / Description:**  
  Exploits temporary panic sell-offs in structurally sound compounders. Stock drops into extreme oversold territory (RSI < 30) due to broad market liquidations, but halts at key multi-month support and forms a high-volume bullish reversal bar.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `rsiOversoldThreshold` | `≤ 32.0` | **Capitulation Floor:** 14-period RSI must plunge below 32, representing widespread retail panic liquidation. |
| `priceAboveSma200` | `true` | **Structural Bull Sanity Gate:** The stock's long-term trend must remain intact (price above rising 200 SMA). **Never buy a downtrend.** |
| `reversalCandleRequired`| `true` | **Reversal Confirmation:** Daily candle must close in the upper 40% of its range (hammer, bullish engulfing, or pinbar). |
| `meanReversionMaxDays` | `10 sessions` | **Holding Window:** Tactical holding cap. If price fails to mean-revert to the 20 EMA within 10 sessions, exit the position. |
| `targetMethod` | `MEAN_REVERSION_SMA` | **Target Benchmark:** Initial profit target is set exactly at the 20-day Exponential Moving Average. |

---

## Strategy S8 — High-Tight Flag (HTF Momentum)

- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy8`)
- **Category:** `MOMENTUM`
- **Purpose / Description:**  
  The rarest and most explosive momentum pattern in equity markets (Thomas Bulkowski specification). Requires a vertical +50% to +100% price explosion ("pole") in under 8 weeks, followed by a tight flag consolidation retracing no more than 25%.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `flagPoleGainMinPct` | `≥ 50.0%` | **Extreme Impulse Pole:** Stock must surge at least +50% from its launching base within 40 trading sessions. |
| `flagPoleLookbackBars` | `≤ 40 sessions` | **Pole Speed Ceiling:** Maximum lookback window for the 50% surge. Proves overwhelming institutional demand shock. |
| `flagRetracementMaxPct`| `≤ 25.0%` | **Tight Flag Retracement:** Flag consolidation must not retrace more than 25% of the pole's vertical gain. |
| `flagDurationBars` | `5 to 20 sessions` | **Flag Longevity:** Flags lasting less than 5 days are premature; flags lasting more than 20 days risk losing momentum. |
| `breakoutVolumeRatio` | `≥ 1.5x` | **Flag Resolution Volume:** Breakout above the flag's highest horizontal boundary requires >= 1.5x volume surge. |

---

## Strategy S8B — Classical Bull Flag (New Addition)

- **Evidence Bucket:** `Bucket A: Trend & Momentum`
- **Script Location:** `src/server/services/NewTechnicalStrategiesEngine.ts` (`evaluateS8B_ClassicalBullFlag`)
- **Category:** `MOMENTUM`
- **Purpose / Description:**  
  Captures standard everyday momentum flags that do not meet S8's vertical +50% threshold. Requires a solid 15% to 40% pole over 5–30 sessions, followed by a tight flag holding above the rising 20 EMA with progressive volume dry-up.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `poleGainPct` | `15.0% to 40.0%` | **Standard Momentum Pole:** Captures realistic institutional swing surges without waiting for extreme parabolic 50% runs. |
| `poleDurationBars` | `5 to 30 sessions` | **Pole Formation Window:** Time taken to generate the 15–40% price surge. |
| `flagDurationBars` | `5 to 20 sessions` | **Flag Consolidation Window:** Optimal digestion period for short-term profit-takers to clear out. |
| `flagRetracementPct` | `≤ 50.0%` | **Flag Retracement Ceiling:** Flag depth must not exceed 50% of the pole height; price must hold above rising 20 EMA. |
| `flagVolumeRatio` | `≤ 0.85` | **Flag Volume Contraction:** Average volume during flag must dry up to < 85% of 20-day VMA. |
| `breakoutVolumeRatio` | `≥ 1.40x` | **Breakout Expansion:** Decisive close above flag resistance with volume surge >= 1.4x VMA. |
| `rsPercentile` | `≥ 70th Percentile` | **Relative Strength Sanity:** Stock must outperform at least 70% of the market. |

---

## Strategy S9 — Volume Dry-Up (VDU) with RS Stability

- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy9`)
- **Category:** `BREAKOUT`
- **Purpose / Description:**  
  Identifies institutional drying of supply in leading stocks. When a stock pauses near 52-week highs and volume shrinks to historic lows while price refuses to fall, it proves floating supply is exhausted. The next minor demand burst triggers mark-up.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `volumeDryUpThreshold` | `≤ 50.0%` of VMA | **Absolute Supply Drought:** Daily volume drops below 50% of the 50-day average. Sellers are completely gone. |
| `consolidationRangeMaxPct`| `≤ 8.0%` over 10d | **Price Tightness:** Stock trades in a razor-thin 8% range over 10 sessions (tight closes signify absorption). |
| `near52wHighPct` | `Within 10.0%` | **Upper Quadrant Requirement:** VDU must happen near tops (within 10% of 52W high), NOT at the bottom of a downtrend. |
| `rsConsecutiveSessionsMin`| `≥ 10 sessions` | **RS Stability:** Relative Strength line must hold steady or rise during the volume dry-up phase. |

---

## Strategy S10 — Trendline Opening Range Breakout (ORB)

- **Evidence Bucket:** `Bucket A: Trend & Momentum` / `Execution Confirmation`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy10`)
- **Category:** `INTRADAY_HYBRID`
- **Purpose / Description:**  
  Execution-timing engine combining daily multi-week trendline compression with 15-minute Opening Range Breakout (09:15–09:30 IST). Prevents chasing gap-ups by requiring opening high confirmation with high Relative Volume (RVOL).

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `trendlineCompressionBars`| `≥ 15 sessions` | **Daily Compression:** Symmetrical or descending trendline containing price for at least 15 daily sessions. |
| `orbTimeframeMinutes` | `15 Minutes` | **Opening Range Window:** High and low established between 09:15 IST and 09:30 IST on the NSE cash market. |
| `rvolIntradayMin` | `≥ 1.50x` | **Relative Volume Surge:** 15-minute opening volume must exceed 1.5x of the 20-day historical opening average. |
| `entryTriggerType` | `15m Close > Opening High`| **True Breakout Confirmation:** Daily/15m bar must CLOSE above the 15-minute high (brief wicks do not count). |
| `stopLossMethod` | `ORB_CANDLE_LOW` | **Opening Low Invalidation:** Hard stop is pegged at the 15-minute candle opening low (09:15 low). |

---

## Strategy S11 — Institutional Wyckoff Spring Accumulation

- **Evidence Bucket:** `Bucket D: Mean Reversion & Exhaustion`
- **Script Location:** `src/server/services/PureTechnicalStrategiesEngine.ts` (`evaluateStrategy11`)
- **Category:** `MEAN_REVERSION`
- **Purpose / Description:**  
  Wyckoff Phase C Spring archetype. Smart money drives price temporarily below a major, well-defined horizontal support line to trigger retail stop-loss orders and absorb liquidity, followed by an immediate high-volume reclaim back into the trading range.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `supportLookbackBars` | `30 to 90 sessions` | **Support Significance:** A horizontal support level tested at least twice over 30 to 90 trading sessions. |
| `undercutMagnitudePct` | `0.5% to 3.5%` | **Spring Undercut Depth:** Price must pierce below support by between 0.5% and 3.5% (deeper breaks risk true breakdown). |
| `undercutDurationBars` | `1 to 3 sessions` | **Immediate Reclaim:** Price must reclaim the broken support line within 1 to 3 trading sessions. |
| `reclaimVolumeRatio` | `≥ 1.50x` | **Absorption Reclaim Volume:** Volume on the day support is reclaimed must spike to >= 1.5x VMA, proving accumulation. |
| `stopLossMethod` | `SWING_LOW` (`-1.0%`) | **Spring Low Invalidation:** Hard stop pegged 1% below the lowest point of the undercut wick. |

---

## Strategy S12 — Episodic Pivot Institutional Gap-Up

- **Evidence Bucket:** `Bucket C: Catalyst & Fundamental Alpha`
- **Script Location:** `src/server/services/RegimeBacktestEngine.ts` (`evaluateS12_EpisodicPivot`)
- **Category:** `MOMENTUM`
- **Purpose / Description:**  
  Exploits fundamental catalyst shocks (earnings explosion, unexpected regulatory clearance, mega-order win). Stock gaps up decisively out of a base with historic volume and holds the opening price, initiating a multi-month institutional re-rating cycle.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `gapMagnitudeMinPct` | `≥ 5.0%` (or opening gap) | **Catalyst Gap Floor:** Stock must gap up at least 5% or open above multi-week resistance on market open. |
| `volumeSurgeMultiplier` | `≥ 3.0x` (300% VMA) | **Institutional Re-Rating Volume:** Daily volume must explode to > 300% of 50-day average daily volume. |
| `gapLowRetention` | `Low ≥ Gap Day Open * 0.985` | **Gap Low Retention Rule:** Price must NOT breach below the gap candle low. Breaching the low kills the catalyst thesis. |
| `earningsSurpriseFloor` | `≥ +25.0% YoY` | **Fundamental Catalyst:** Quarterly PAT or Revenue must beat consensus or prior year by at least 25%. |

---

## Strategy S13 — Earnings Acceleration Momentum

- **Evidence Bucket:** `Bucket C: Catalyst & Fundamental Alpha`
- **Script Location:** `src/server/services/RegimeBacktestEngine.ts` (`evaluateS13_EarningsAccel`)
- **Category:** `BREAKOUT`
- **Purpose / Description:**  
  Identifies economic acceleration where EPS and EBITDA growth rates expand sequentially over 2–3 consecutive quarters (e.g., Q1 +15%, Q2 +30%, Q3 +55%). Backed by positive cash flow conversion to eliminate paper earnings.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `sequentialEpsGrowth` | `Q0 > Q-1 > Q-2` | **Acceleration Derivative:** The growth rate itself must be accelerating (positive second derivative $\frac{d^2E}{dt^2} > 0$). |
| `operatingMarginExpansion`| `≥ +150 bps YoY` | **Operating Margin Leverage:** Operating margins must expand by at least 150 basis points, proving pricing power. |
| `cfoToPatRatio` | `≥ 0.70` (70%) | **Quality of Accrual Gate:** Cash Flow from Operations (CFO) divided by Operating PAT must exceed 70% (no receivables stuffing). |
| `promoterPledgePct` | `≤ 10.0%` | **Promoter Hygiene Gate:** Promoter encumbrance must not exceed 10% of their holding. |

---

## Strategy S14 — Bearish Beta-Weighted Portfolio Futures Hedge

- **Evidence Bucket:** `Bucket E: Macro & Regime Risk`
- **Script Location:** `src/server/quantEngine.ts` (`evaluateS14_BearishHedge`)
- **Category:** `HEDGE`
- **Purpose / Description:**  
  Defensive hedging engine. When broader market regime gates breach (Nifty 50 closes below 50 EMA, market breadth < 40%, VIX spikes > 22), S14 calculates beta-weighted short Nifty/Bank Nifty index futures exposure to protect equity equity against drawdowns. **Never used to short cash equities.**

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `niftyRegimeGate` | `Nifty 50 < 50 EMA` | **Market Breadth Degradation:** Benchmark index confirms loss of intermediate bull trend. |
| `indiaVixSpikeFloor` | `> 20.0` | **Volatility Shock Warning:** India VIX surging above 20 signals widening options implied tail risks. |
| `advanceDeclineRatio` | `< 0.60` | **Market Breadth Failure:** Declining stocks outnumber advancing stocks by more than 1.6 to 1. |
| `portfolioBeta` | `Calculated (e.g. 1.15)` | **Beta Sensitivity:** Sensitivity of equity portfolio relative to Nifty 50 index movements. |
| `hedgeNotionalFormula`| $\text{Equity} \times \beta \times \text{Frac}$ | **Hedge Allocation:** Computes exact short index futures contracts required to neutralize portfolio delta. |

---

## Strategy S15 — Option Credit Spreads Harvest

- **Evidence Bucket:** `Bucket E: Macro & Regime Risk`
- **Script Location:** `src/server/quantEngine.ts` (`evaluateS15_CreditSpreads`)
- **Category:** `HEDGE`
- **Purpose / Description:**  
  Harvests volatility risk premium (IV crush and theta decay) in high-conviction sideways/rangebound regimes. Uses Bull Put or Bear Call credit spreads on high-liquidity F&O constituents with strict margin risk capping.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `ivPercentileFloor` | `≥ 65th Percentile` | **Implied Volatility Rank:** IV must be elevated relative to its 1-year range so sold options are richly priced. |
| `mwplLimit` | `< 60.0%` | **Market-Wide Position Limit (MWPL):** Total open interest must be under 60% to avoid F&O ban risk. |
| `deltaStrikeTarget` | `0.15 to 0.20 Delta` | **Statistical Probability of OTM:** Sells out-of-the-money strikes with ~80–85% mathematical probability of expiring worthless. |
| `maxLossDefined` | `Fixed Wing Width` | **Defined Risk Guarantee:** Mandates buying an outer wing option so maximum theoretical loss is strictly capped. |

---

## Strategy S16 — Operating Leverage Inflection

- **Evidence Bucket:** `Bucket C: Catalyst & Fundamental Alpha`
- **Script Location:** `src/server/services/FundamentalAlphaEngine.ts` (`evaluateS16_OperatingLeverage`)
- **Category:** `BREAKOUT`
- **Purpose / Description:**  
  Identifies manufacturing or capital-intensive companies crossing their operational breakeven threshold. Because fixed depreciation and interest costs are covered, small incremental revenue gains generate disproportionately explosive EBITDA and PAT surges.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `revenueGrowthMin` | `≥ +15.0% YoY` | **Topline Revenue Threshold:** Minimum annual revenue expansion rate. |
| `ebitdaGrowthMin` | `≥ +45.0% YoY` | **Operating Leverage Multiplier:** EBITDA must grow at least 3.0x faster than revenue (+45% EBITDA vs +15% revenue). |
| `ebitdaMarginExpansion`| `≥ +300 bps` | **Margin Accretion:** EBITDA margins must jump by at least 300 basis points over the trailing two quarters. |
| `assetTurnover` | `Rising YoY` | **Capacity Utilization:** Fixed asset turnover must accelerate, proving higher plant utilization. |

---

## Strategy S17 — Promoter SAST Creeping Squeeze

- **Evidence Bucket:** `Bucket C: Catalyst & Fundamental Alpha`
- **Script Location:** `src/server/services/FundamentalAlphaEngine.ts` (`evaluateS17_PromoterSqueeze`)
- **Category:** `MOMENTUM`
- **Purpose / Description:**  
  Monitors statutory SEBI SAST (Substantial Acquisition of Shares and Takeovers) Regulation 29 filings. Detects instances where company founders/promoters aggressively purchase shares from the open market, signaling high insider confidence in impending corporate turnaround.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `promoterAcquisitionPct`| `≥ 1.0% to 5.0%` | **Creeping Acquisition Scale:** Promoters acquire >= 1% stake within a single regulatory quarter. |
| `promoterPledgeDelta` | `≤ 0.0%` (Zero increase)| **Clean Balance Sheet Rule:** Promoter pledging must NOT increase (eliminates circular debt refinancing). |
| `openMarketExecution` | `100% Cash Market` | **Genuine Purchase:** Purchases must occur via open-market exchange trades, not gifted shares or warrants. |
| `accumulationDays` | `≥ 7 of 10 up-days` | **Price Footprint Proxy:** Stock experiences steady up-day accumulation with volume >= 2.0x average. |

---

## Strategy S18 — Abnormal Volume Absorption (Block Deals)

- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Script Location:** `src/server/services/SmartMoneyEngine.ts` (`evaluateS18_BlockAccumulation`)
- **Category:** `BREAKOUT`
- **Purpose / Description:**  
  Isolates massive institutional block deals and delivery absorption footprints where a single day's volume surges past 5x–10x normal turnover and price closes in the upper 20% of the session's range, proving aggressive supply absorption by institutional desks.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `volumeSpikeMultiplier`| `≥ 10.0x` (1000% VMA) | **Extreme Volume Anomaly:** Daily traded volume exceeds 10 times the 20-day historical average. |
| `closeRangeLocationPct`| `≥ 80.0%` | **Closing Range Absorption:** Candle close must occur in the top 20% of the day's high-low range (no selling tail). |
| `turnoverFloorCr` | `≥ ₹50.0 Cr` | **Institutional Capital Sizing:** Total single-day turnover must exceed ₹50 Crore to ensure genuine institution participation. |

---

## Strategy S19 — Z-Score Delivery Volume Spike

- **Evidence Bucket:** `Bucket B: Volume & Absorption`
- **Script Location:** `src/server/services/SmartMoneyEngine.ts` (`evaluateS19_DeliverySpike`)
- **Category:** `BREAKOUT`
- **Purpose / Description:**  
  Identifies stealth accumulation where market participants take physical delivery of shares (demat transfer) rather than intraday trading. Normalizes delivery data using a 90-day Z-Score to compare a stock against its own historical baseline.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `deliveryZScore` | `Z ≥ 2.0` | **Delivery Standard Score:** Current delivery volume is at least 2 standard deviations above its 90-day mean. |
| `consecutiveSpikeDays` | `≥ 3 sessions` | **Multi-Day Persistence:** At least 3 consecutive days of delivery volume exceeding 300% of the 20-day average. |
| `priceAcceptance` | `All 3 days close > open`| **Accumulation Price Confirmation:** All spike days must be green candles (eliminates institutional dumping). |

---

## Strategy S20 — Glenn Neely NEoWave Structural Engine

- **Evidence Bucket:** `Bucket F: Structural Geometry`
- **Script Location:** `src/server/quant/NEoWaveEngine.ts`
- **Category:** `MOMENTUM`
- **Purpose / Description:**  
  Implements advanced Glenn Neely NEoWave extensions to Elliott Wave theory: Monowave decomposition, rule of retracement, Touchstone timing, and Wave-3 impulse identification. Serves as a macro scenario and structural confirmation filter.

### Parameters Looked For & Business Definitions

| Parameter Name (Code) | Benchmark / Threshold | Business Language Definition |
| :--- | :--- | :--- |
| `monowaveSegmentation` | `Price-Time Vectors` | **Monowave Decomposition:** Decomposes price into distinct directional monowaves without candlestick noise. |
| `wave3ImpulseLength` | `≥ 1.618x Wave 1` | **Wave 3 Extension:** The third impulse wave must be at least 161.8% of Wave 1, confirming genuine motive power. |
| `touchstoneTiming` | `Time ≤ 1.0x Wave 1` | **Touchstone Confirmation:** Wave 3 must consume equal or less time than Wave 1 to cover a greater distance. |
| `alternationRule` | `Wave 2 vs Wave 4` | **Wave Alternation:** Wave 2 and Wave 4 must alternate in structure (one sharp zigzag, one complex flat). |

---

## New Modular Strategies (S21 to S26)

All new strategies are added incrementally behind feature flags and operate as non-destructive overlays.

### S8B — Classical Bull Flag
- **Bucket:** `Bucket A: Trend`
- **Parameters:** Pole gain 15–40%, duration 5–30 sessions, flag retracement $\le 50\%$, price holds rising 20 EMA, volume contraction $< 85\%$, breakout volume $\ge 1.4\text{x}$.

### S21 — Cup & Handle (Pivot-Based Structural)
- **Bucket:** `Bucket F: Structural Geometry`
- **Parameters:** Cup duration 35–325 sessions, Left Rim swing high, Cup depth 12–40%, Right Rim within $\pm 8\%$ of Left Rim, Handle 5–30 sessions retracing $\le 35\%$ of cup depth, handle volume $< 70\%$ of 50D average, breakout volume $\ge 1.4\text{x}$, R:R $\ge 2.5:1$.

### S22 — John Carter TTM Volatility Squeeze
- **Bucket:** `Bucket F: Structural Geometry`
- **Parameters:** Bollinger Bands (20, 2.0) inside Keltner Channel (20, 1.5) for $\ge 3$ consecutive bars, breakout above 10-bar consolidation high with momentum $> 0$, breakout volume $\ge 1.35\text{x}$, RS Percentile $\ge 70$.

### S23 — Classical Double Bottom
- **Bucket:** `Bucket D: Mean Reversion`
- **Parameters:** Trough 1 to intermediate peak recovery $\ge 7.5\%$, Trough 2 within $\pm 5.5\%$ of Trough 1 low, entry **strictly on daily close above neckline** with volume $\ge 1.35\text{x}$. No entry without breakout confirmation.

### S24 — Double Top Distribution Exit (Existing Holdings Only)
- **Bucket:** `Holding Exit Ratchet (Not Cash Short)`
- **Parameters:** Peak 2 within $\pm 4.5\%$ of Peak 1 on volume $< 85\%$ of Peak 1 (volume divergence). Level 1 warning tightens trailing stop; Level 2 neckline breakdown with volume $\ge 1.25\text{x}$ scales out 25–50% of holding.

### S25 — Inverse Head & Shoulders
- **Bucket:** `Bucket F: Structural Geometry`
- **Parameters:** Left Shoulder low, Head deeper low, Right Shoulder higher than Head and symmetric to Left Shoulder, neckline breakout required on volume $\ge 1.4\text{x}$.

### S26 — Head & Shoulders Top Exit
- **Bucket:** `Holding Exit Ratchet`
- **Parameters:** Classic top distribution; triggers defensive stop ratchet and scale-out on neckline breakdown.

---

## Summary Matrix: All Strategies by Evidence Bucket

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        INDEPENDENT EVIDENCE BUCKETS MATRIX                        │
├───────────────────────────────┬───────────────────────────────────────────────────┤
│ Bucket A: Trend & Momentum    │ S3, S4, S5, S6, S8, S8B                           │
│ Bucket B: Volume & Absorption │ S1, S9, S18, S19                                  │
│ Bucket C: Catalyst & Alpha    │ S12, S13, S16, S17                                │
│ Bucket D: Mean Reversion      │ S7, S11, S23                                      │
│ Bucket E: Macro & Regime Risk │ S14 (Index Hedge), S15 (Credit Spreads), MACRO    │
│ Bucket F: Structural Geometry │ S20 (NEoWave), S21 (Cup & Handle), S22 (Squeeze)  │
│ Holding Exit Ratchets         │ S24 (Double Top Exit), S26 (H&S Exit)             │
└───────────────────────────────┴───────────────────────────────────────────────────┘
```

**Golden Rule of Execution:**  
$$\text{Executable Trade} = \text{Raw Strategy Signal} \land (\ge 2 \text{ Independent Buckets}) \land (\text{Quality Score} \ge 65) \land (\text{Capital Protection Guardrails})$$
