# Unified 10-Strategy Parameterization & Comparison Framework

## Spec Document — NRI WealthOS Independent Technical Strategies Engine v2

---

## 1. Executive Summary

This spec defines a **parameter-driven strategy framework** that unifies 10 independent technical strategies (4 existing in-app + 6 new) into a single configurable engine. Every hardcoded threshold becomes a named, typed parameter organized into **parameter families**. Users can:

- Run any combination of the 10 built-in strategies from a dropdown
- Compare/contrast results side-by-side for any N strategies
- Clone a built-in template, adjust parameters, and save as a custom strategy
- Backtest any custom parameter combination against historical data
- View a radar-chart overlay of strategy characteristics

**Strategies covered:**

| ID | Short Name | Category | Source |
|----|-----------|----------|--------|
| S1 | VPA Base Breakout | BREAKOUT | In-App |
| S2 | Institutional FVG/CE | PULLBACK | In-App |
| S3 | HH/HL Compaction | BREAKOUT | In-App |
| S4 | HH/HL + SMA200 + VPA | BREAKOUT | In-App |
| S5 | 50 EMA Pullback VCP | PULLBACK | New |
| S6 | RS Breakout (Nifty 500) | BREAKOUT | New |
| S7 | RSI Mean-Reversion Dip | MEAN_REVERSION | New |
| S8 | High-Tight Flag | MOMENTUM | New |
| S9 | Volume Dry-Up RS | MOMENTUM | New |
| S10 | Trendline ORB | INTRADAY_HYBRID | New |

---

## 2. Parameter Family Taxonomy

All ~95 parameters across 10 strategies are organized into **9 families**. Each family groups parameters that control the same conceptual dimension of a strategy.

### Family 1: Universe & Liquidity (`universe`)

Controls which stocks are eligible for scanning.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `marketCapFloorCr` | number | Cr | 0 | 0 | 100000 | 100 | Minimum market capitalization | S5(2000), S7(implied large-cap) |
| `adtvFloorCr` | number | Cr | 0 | 0 | 500 | 1 | Minimum 20-day avg daily traded value | S5(10), S10(15) |
| `closePriceFloor` | number | INR | 0 | 0 | 1000 | 5 | Minimum close price | S5(50) |
| `indexMembership` | enum | — | 'ANY' | — | — | — | Index filter: 'ANY', 'NIFTY_50', 'NIFTY_500', 'NIFTY_NEXT_50' | S6('NIFTY_500') |
| `circuitBandMinPct` | number | % | 0 | 0 | 20 | 1 | Minimum daily circuit limit band | S6(10) |
| `freeFloatMaxPct` | number | % | 100 | 1 | 100 | 1 | Maximum free float % (low float filter) | S9(25) |
| `promoterHoldingMinPct` | number | % | 0 | 0 | 100 | 1 | Minimum promoter holding % | S8(65) |
| `publicFloatMaxShares` | number | M shares | 999999 | 1 | 999999 | 1 | Maximum public float in million shares | S8(50) |
| `adrMinPct` | number | % | 0 | 0 | 20 | 0.5 | Minimum 20-day Average Daily Range % | S8(5), S9(5), S10(5) |

### Family 2: Trend Alignment (`trend`)

Controls how macro trend is validated.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `priceAboveSma200` | boolean | — | false | — | — | — | Close must be above 200-day SMA | S5, S7, S10 |
| `emaShortAboveSmaLong` | boolean | — | false | — | — | — | Short EMA must be above long SMA (e.g., 50 EMA > 200 SMA) | S5 |
| `emaShortPeriod` | number | bars | 9 | 3 | 100 | 1 | Short-term EMA period | S1(9), S5(50) |
| `emaLongPeriod` | number | bars | 21 | 5 | 200 | 1 | Long-term EMA/SMA period | S1(21), S5(200) |
| `emaProximityMultiplier` | number | ratio | 0.985 | 0.90 | 1.00 | 0.005 | EMA alignment tolerance (EMA_short >= EMA_long * X) | S1(0.985) |
| `sma200TolerancePct` | number | % | 2.0 | 0.5 | 10.0 | 0.5 | P0 must be within ±X% of SMA 200 | S3(2), S4(2) |
| `sma200SlopeRising` | boolean | — | false | — | — | — | 200 SMA must have a rising slope | S7 |
| `priceAboveSma50` | boolean | — | false | — | — | — | Close must be above 50-day SMA | S9 |
| `rsiPeriod` | number | bars | 14 | 5 | 30 | 1 | RSI calculation period | S1(14), S5(14), S6(14), S7(14) |
| `rsiBullishFloor` | number | — | 50.0 | 20 | 80 | 1 | Minimum RSI for bullish territory | S1(50) |
| `rsiPullbackLow` | number | — | 42 | 20 | 60 | 1 | RSI lower bound for pullback range | S5(42) |
| `rsiPullbackHigh` | number | — | 55 | 40 | 80 | 1 | RSI upper bound for pullback range | S5(55) |
| `rsiBreakoutLow` | number | — | 60 | 40 | 80 | 1 | RSI lower bound for breakout zone | S6(60) |
| `rsiBreakoutHigh` | number | — | 78 | 60 | 95 | 1 | RSI upper bound for breakout zone | S6(78) |
| `rsiOversoldThreshold` | number | — | 32 | 10 | 45 | 1 | RSI threshold for oversold signal | S7(32) |

### Family 3: Impulse / Momentum (`impulse`)

Controls how the initial thrust or momentum leg is qualified.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `impulseGainMinPct` | number | % | 15.0 | 5 | 100 | 1 | Minimum % gain for impulse qualification | S1(15), S2(20), S3(20), S4(20), S8(50) |
| `impulseGainIsOrWithTurnover` | boolean | — | false | — | — | — | Allow turnover alternative (true = gain OR turnover) | S2(true), S3(true), S4(true) |
| `cumulativeTurnoverFloorCr` | number | Cr | 50.0 | 5 | 500 | 5 | Cumulative turnover alternative threshold | S2(50), S3(50), S4(50) |
| `impulseDurationMinBars` | number | bars | 4 | 2 | 50 | 1 | Minimum impulse leg duration | S1(4), S3(8), S4(8), S8(20-implied) |
| `impulseDurationMaxBars` | number | bars | 25 | 5 | 100 | 1 | Maximum impulse leg duration | S1(25) |
| `flagPoleGainMinPct` | number | % | 50.0 | 20 | 200 | 5 | High-Tight Flag: min gain over N bars | S8(50) |
| `flagPoleLookbackBars` | number | bars | 20 | 5 | 60 | 1 | Bars to look back for flag pole gain | S8(20) |
| `rsConsecutiveSessionsMin` | number | bars | 20 | 5 | 60 | 1 | Mansfield RS must outperform for N consecutive sessions | S6(20) |
| `rsOutperformanceMinPct` | number | % | 15.0 | 5 | 50 | 1 | Stock 1-month return minus index return | S9(15) |
| `near52wHighPct` | number | % | 95.0 | 80 | 100 | 1 | Close >= 52W High * X% (proximity to 52W high) | S6(95) |

### Family 4: Pullback / Retracement (`pullback`)

Controls how pullback/base/consolidation phases are evaluated.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `baseDurationMinBars` | number | bars | 10 | 3 | 60 | 1 | Minimum base/consolidation duration | S1(10) |
| `baseDurationMaxBars` | number | bars | 30 | 5 | 120 | 1 | Maximum base/consolidation duration | S1(30) |
| `retracementFloorMultiplier` | number | ratio | 0.45 | 0.20 | 0.80 | 0.05 | P0 + X * (Peak - P0): base must hold above this | S1(0.45) |
| `pullbackDropMinPct` | number | % | 1.5 | 0.5 | 15 | 0.5 | Minimum pullback drop to qualify | S2(1.5) |
| `emaPullbackProximityLow` | number | ratio | 0.98 | 0.90 | 1.00 | 0.01 | Close >= EMA * X (lower pullback band) | S5(0.98) |
| `emaPullbackProximityHigh` | number | ratio | 1.02 | 1.00 | 1.10 | 0.01 | Close <= EMA * X (upper pullback band) | S5(1.02) |
| `entryZoneLowerBand` | number | ratio | 0.985 | 0.95 | 1.00 | 0.005 | CMP >= L2 * X for entry zone | S3(0.985), S4(0.985) |
| `entryZoneUpperBand` | number | ratio | 1.045 | 1.00 | 1.10 | 0.005 | CMP <= L2 * X for entry zone | S3(1.045), S4(1.045) |
| `consolidationRangeMaxPct` | number | % | 12.0 | 3 | 25 | 1 | Max peak-to-trough range over N days (tight base) | S6(12), S8(15) |
| `consolidationRangeLookback` | number | bars | 20 | 5 | 40 | 1 | Days to measure consolidation range | S6(20), S8(10) |
| `bbPeriod` | number | bars | 20 | 10 | 50 | 1 | Bollinger Band period | S7(20) |
| `bbStdDev` | number | — | 2.0 | 1.0 | 3.0 | 0.5 | Bollinger Band standard deviations | S7(2) |
| `lowerHighsMinCount` | number | bars | 3 | 2 | 10 | 1 | Consecutive lower highs for trendline compression | S10(3) |
| `trendlineCompressionBars` | number | bars | 15 | 5 | 30 | 1 | Lookback for declining linear regression trendline | S10(15) |

### Family 5: Volume Signatures (`volume`)

Controls volume-based filters: drying, surging, VPA asymmetry.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `volumeDryingRatio` | number | ratio | 0.80 | 0.20 | 1.00 | 0.05 | Mean base vol / mean impulse vol must be <= X | S1(0.80), S2(0.75), S3(0.90), S4(0.90) |
| `vpaAsymmetryRatioMin` | number | ratio | 1.15 | 1.00 | 2.00 | 0.05 | Up-day vol / down-day vol must be >= X | S1(1.15) |
| `volumeSurgeMultiplier` | number | ratio | 2.0 | 1.2 | 5.0 | 0.1 | Breakout volume >= X * 20-day SMA(Volume) | S6(2.0), S8(1.5), S9(2.0-prev day) |
| `volumeDryUpThreshold` | number | ratio | 0.40 | 0.10 | 0.80 | 0.05 | VDU: Volume < X * 20-day SMA(Volume) | S9(0.40) |
| `volumeBelowAverage` | boolean | — | false | — | — | — | Volume must be below 20-day SMA(Volume) | S5(true) |
| `entryVolDryingRatio` | number | ratio | 0.85 | 0.40 | 1.00 | 0.05 | Entry vol / 20-DMA vol must be <= X | S2(0.85), S4(0.85) |
| `entryVolImpulseRatio` | number | ratio | 0.80 | 0.40 | 1.00 | 0.05 | Entry vol <= impulse vol * X | S2(0.80), S4(0.80) |
| `rvolIntradayMin` | number | ratio | 3.0 | 1.5 | 10.0 | 0.5 | Relative Volume minimum for intraday ORB entry | S10(3.0) |
| `pullbackVolDryingRatio` | number | ratio | 0.90 | 0.40 | 1.00 | 0.05 | Pullback mean vol < impulse mean vol * X | S3(0.90), S4(0.90) |

### Family 6: Volatility Compression (`volatility`)

Controls ATR contraction, NR patterns, range compression, ADR.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `atrContractionRatioMax` | number | ratio | 0.85 | 0.30 | 1.00 | 0.05 | ATR5(base)/ATR14(peak) must be <= X | S1(0.85) |
| `atrShortPeriod` | number | bars | 5 | 3 | 14 | 1 | Short ATR period for contraction check | S1(5) |
| `atrLongPeriod` | number | bars | 14 | 10 | 30 | 1 | Long ATR period for reference | S1(14) |
| `nrLookbackWindow` | number | bars | 5 | 3 | 10 | 1 | Last N bars to check for NR4/NR7 | S1(5) |
| `nr4Enabled` | boolean | — | true | — | — | — | Check for Narrow Range 4 candle | S1 |
| `nr7Enabled` | boolean | — | true | — | — | — | Check for Narrow Range 7 candle | S1 |
| `entryRangeContractionRatio` | number | ratio | 0.85 | 0.40 | 1.00 | 0.05 | Entry range / 20-DMA range must be <= X | S2(0.85), S4(0.85) |
| `atrBelowAverage` | boolean | — | false | — | — | — | ATR(14) must be below 20-day SMA(ATR) | S5(true) |
| `capitulationAtrMultiplier` | number | ratio | 1.5 | 1.0 | 3.0 | 0.1 | (High-Low) > X * ATR(14) for capitulation candle | S7(1.5) |
| `atrTrailingStopMultiplier` | number | ratio | 2.0 | 1.0 | 4.0 | 0.5 | ATR-based trailing stop = X * ATR | S10(2.0) |

### Family 7: Entry Triggers (`entry`)

Controls what specific condition fires the entry signal.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `entryTriggerType` | enum | — | 'CLOSE_ABOVE_PREV_HIGH' | — | — | — | Entry type (see enum below) | All |
| `breakoutLookbackBars` | number | bars | 20 | 3 | 60 | 1 | N-day high break lookback | S6(20), S8(5) |
| `fvgDetectionEnabled` | boolean | — | false | — | — | — | Scan for Fair Value Gaps | S2 |
| `ceEntryEnabled` | boolean | — | false | — | — | — | Entry at Consequent Encroachment (50% FVG) | S2 |
| `fvgLookbackBars` | number | bars | 35 | 10 | 60 | 1 | Bars to scan for FVG | S2(35) |
| `orbEnabled` | boolean | — | false | — | — | — | Opening Range Breakout (intraday) | S10 |
| `orbTimeframeMinutes` | number | min | 15 | 5 | 60 | 5 | ORB candle timeframe | S10(15) |
| `reversalCandleRequired` | boolean | — | false | — | — | — | Require hammer/engulfing reversal candle | S7 |
| `flagEmaSupport` | number | bars | 10 | 5 | 50 | 1 | EMA that flag consolidation must hold above | S8(10 or 20) |
| `vpaContractionAtEntryRequired` | boolean | — | false | — | — | — | Both vol drying AND range contraction at entry | S4(true) |

**`entryTriggerType` enum values:**

| Value | Description | Used By |
|---|---|---|
| `CLOSE_ABOVE_PREV_HIGH` | Close > High[1] | S5, S7, S9 |
| `N_DAY_HIGH_BREAK` | Close > Highest High(N) | S6, S8 |
| `FVG_CE_REENTRY` | Price enters FVG zone at CE level | S2 |
| `L2_COMPACTION_ZONE` | CMP within L2 proximity band | S3, S4 |
| `VPA_BASE_BREAKOUT` | NR + EMA cross + RSI alignment | S1 |
| `ORB_15MIN` | 15-min close > first 15-min candle high | S10 |
| `REVERSAL_CANDLE` | Hammer/engulfing after oversold | S7 |

### Family 8: Smart Money Detection (`smartMoney`)

Controls institutional footprint detection.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `institutionalTurnoverFloorCr` | number | Cr | 2.0 | 0.5 | 50 | 0.5 | Single-day turnover threshold for institutional flag | S2(2.0), S3(2.0), S4(2.0) |
| `smartMoneyVolRatio` | number | ratio | 1.3 | 1.0 | 3.0 | 0.1 | Volume / avg volume for smart money flag | S3(1.3), S4(1.3) |
| `absorptionClosePctMin` | number | ratio | 0.60 | 0.40 | 0.80 | 0.05 | Close in upper X% of candle range (absorption) | S3(0.60), S4(0.60) |
| `adtMultiplier` | number | ratio | 2.5 | 1.0 | 5.0 | 0.5 | Turnover >= max(floor, X * ADT20) | S3(2.5), S4(2.5) |
| `adtFloorCr` | number | Cr | 1.0 | 0.1 | 10 | 0.1 | Minimum absolute institutional turnover | S3(1.0), S4(1.0) |
| `smartMoneyEnabled` | boolean | — | false | — | — | — | Enable smart money detection rules | S3(true), S4(true) |

### Family 9: Risk Management (`risk`)

Controls stop-loss, targets, and position sizing.

| Parameter Key | Type | Unit | Default | Min | Max | Step | Description | Used By |
|---|---|---|---|---|---|---|---|---|
| `stopLossMethod` | enum | — | 'FIXED_PCT_BELOW_P0' | — | — | — | How stop loss is calculated (see enum) | All |
| `stopLossPct` | number | % | 2.0 | 0.5 | 10 | 0.5 | Fixed % below reference point | S1(2), S3(2), S4(2), S10(1) |
| `stopLossFvgMultiplier` | number | ratio | 0.985 | 0.95 | 1.00 | 0.005 | SL = FVG_bottom * X | S2(0.985) |
| `target1RRMultiplier` | number | ratio | 2.0 | 1.0 | 5.0 | 0.5 | Target 1 = CMP + risk * X | S1(2.0) |
| `target2RRMultiplier` | number | ratio | 3.5 | 1.5 | 10.0 | 0.5 | Target 2 = CMP + risk * X | S1(3.5) |
| `target1Method` | enum | — | 'RR_MULTIPLE' | — | — | — | How T1 is calculated | All |
| `target2FibExtension` | number | ratio | 0.618 | 0.382 | 1.618 | 0.01 | Fibonacci extension for T2 | S3(0.618), S4(0.618) |
| `target2PeakMultiplier` | number | ratio | 1.10 | 1.05 | 1.30 | 0.01 | T2 = peak * X | S2(1.10) |
| `trailingStopMethod` | enum | — | 'EMA_CLOSE' | — | — | — | Trailing stop: 'EMA_CLOSE', 'ATR_TRAIL', 'NONE' | S5/S6/S8(EMA), S10(ATR) |
| `trailingStopEmaPeriod` | number | bars | 20 | 5 | 50 | 1 | EMA period for trailing stop | S5(20), S6(20), S8(10 or 20) |
| `partialExitPct` | number | % | 50 | 25 | 75 | 5 | % of position to exit at T1 | S5(50), S6(50), S8(50), S9(50) |
| `maxPortfolioRiskPct` | number | % | 1.0 | 0.25 | 5.0 | 0.25 | Max % of portfolio equity risked per trade | All |
| `passedOpportunityThreshold` | number | ratio | 1.15 | 1.05 | 1.50 | 0.05 | CMP > peak * X → PASSED_OPPORTUNITY | S1(1.15) |

**`stopLossMethod` enum:**

| Value | Formula | Used By |
|---|---|---|
| `FIXED_PCT_BELOW_P0` | SL = P0 * (1 - pct/100) | S1 |
| `FIXED_PCT_BELOW_L2` | SL = L2 * (1 - pct/100) | S3, S4 |
| `FVG_BOTTOM_OFFSET` | SL = FVG_bottom * multiplier | S2 |
| `SWING_LOW` | SL = lowest low of entry/consolidation bar | S5, S6, S7, S8, S9 |
| `FIXED_PCT_BELOW_ENTRY` | SL = entry * (1 - pct/100) | S10 |
| `ORB_CANDLE_LOW` | SL = low of first 15-min candle | S10 |

**`target1Method` enum:**

| Value | Formula | Used By |
|---|---|---|
| `RR_MULTIPLE` | T1 = CMP + risk * multiplier | S1, S6, S8, S9 |
| `PEAK_RETEST` | T1 = impulse peak high | S2 |
| `H2_RETEST` | T1 = H2 level | S3, S4 |
| `PRIOR_SWING_HIGH` | T1 = previous swing high | S5, S10 |
| `MEAN_REVERSION_SMA` | T1 = 20-period SMA (middle BB) | S7 |

### Optional Filters Family (`filters`)

| Parameter Key | Type | Default | Description | Used By |
|---|---|---|---|---|
| `filterPreceding52wLow` | boolean | false | P0 must be at 52-week low with 20%+ impulse | S1-S4 |
| `preceding52wTolerancePct` | number | 2.5 | Tolerance for 52-week low proximity | S1-S4 |
| `preceding52wLookbackBars` | number | 252 | Trading sessions in 52 weeks | S1-S4 |
| `preceding52wImpulseMinPct` | number | 20.0 | Minimum impulse from 52-week low | S1-S4 |
| `filterSma200Proximity` | boolean | false | P0 must be near SMA 200 | S3, S4 |
| `secondaryRuleMinCount` | number | 3 | Min secondary rules that must pass (out of N) | S1(3 of 5) |

### Time Parameters (embedded in relevant families above)

| Parameter Key | Family | Default | Description | Used By |
|---|---|---|---|---|
| `moveWindowBars` | impulse | 15 | Bars to look back for impulse move | S2(15) |
| `p0SearchExtensionBars` | impulse | 10 | Extra bars before window to find swing low | S2(10) |
| `swingGapMinBars` | pullback | 2 | Minimum bars between swing points | S3(2), S4(2) |
| `l2SearchWindow` | pullback | 10 | Recent bars to search for L2 | S3(10), S4(10) |
| `meanReversionMaxDays` | risk | 7 | Max holding period for mean-reversion exit | S7(7) |
| `entrySliceBars` | entry | 3 | Last N bars for entry contraction check | S2(3), S4(3) |

---

## 3. Strategy Categorization Matrix

Which parameter families each strategy uses (X = used, - = not applicable):

| Family | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|--------|----|----|----|----|----|----|----|----|----|----|
| **Universe** | - | - | - | - | X | X | - | X | X | X |
| **Trend** | X | - | X | X | X | X | X | - | X | X |
| **Impulse** | X | X | X | X | - | X | - | X | X | - |
| **Pullback** | X | X | X | X | X | X | X | X | - | X |
| **Volume** | X | X | X | X | X | X | - | X | X | X |
| **Volatility** | X | X | - | X | X | - | X | - | - | X |
| **Entry** | X | X | X | X | X | X | X | X | X | X |
| **Smart Money** | - | X | X | X | - | - | - | - | - | - |
| **Risk** | X | X | X | X | X | X | X | X | X | X |

**Strategy characteristic vectors** (for radar chart, 1-5 scale):

| Dimension | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|-----------|----|----|----|----|----|----|----|----|----|----|
| Trend Strength Req. | 3 | 2 | 4 | 5 | 4 | 5 | 3 | 2 | 3 | 4 |
| Volume Sensitivity | 4 | 4 | 4 | 5 | 3 | 4 | 1 | 3 | 5 | 4 |
| Volatility Compression | 5 | 3 | 3 | 4 | 4 | 3 | 1 | 4 | 2 | 4 |
| Institutional Footprint | 2 | 5 | 5 | 5 | 1 | 2 | 1 | 1 | 1 | 1 |
| Mean-Reversion | 1 | 1 | 1 | 1 | 2 | 1 | 5 | 1 | 1 | 1 |
| Momentum Strength | 3 | 4 | 4 | 4 | 2 | 5 | 1 | 5 | 5 | 4 |
| Holding Period | 4 | 3 | 4 | 4 | 3 | 4 | 1 | 3 | 3 | 2 |
| Filter Strictness | 4 | 5 | 5 | 5 | 3 | 4 | 3 | 3 | 3 | 4 |

---

## 4. TypeScript Interface Design

### 4.1 Core Parameter Interfaces

```typescript
// ─── Parameter Metadata ─────────────────────────────────────────────────

export interface ParameterMeta {
  key: string;
  type: 'number' | 'boolean' | 'enum';
  family: ParameterFamily;
  label: string;
  description: string;
  unit?: string;          // '%', 'Cr', 'bars', 'ratio', 'INR', 'M shares', 'min'
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  enumValues?: string[];
  usedByStrategies: StrategyId[];
}

export type ParameterFamily =
  | 'universe'
  | 'trend'
  | 'impulse'
  | 'pullback'
  | 'volume'
  | 'volatility'
  | 'entry'
  | 'smartMoney'
  | 'risk'
  | 'filters';

export type StrategyId =
  | 'S1_VPA_BASE_BREAKOUT'
  | 'S2_INSTITUTIONAL_FVG_CE'
  | 'S3_HH_HL_COMPACTION'
  | 'S4_HH_HL_SMA200_VPA'
  | 'S5_50EMA_PULLBACK_VCP'
  | 'S6_RS_BREAKOUT'
  | 'S7_RSI_MEAN_REVERSION'
  | 'S8_HIGH_TIGHT_FLAG'
  | 'S9_VOLUME_DRYUP_RS'
  | 'S10_TRENDLINE_ORB';

export type StrategyCategory =
  | 'BREAKOUT'
  | 'PULLBACK'
  | 'MEAN_REVERSION'
  | 'MOMENTUM'
  | 'INTRADAY_HYBRID';

export type EntryTriggerType =
  | 'CLOSE_ABOVE_PREV_HIGH'
  | 'N_DAY_HIGH_BREAK'
  | 'FVG_CE_REENTRY'
  | 'L2_COMPACTION_ZONE'
  | 'VPA_BASE_BREAKOUT'
  | 'ORB_15MIN'
  | 'REVERSAL_CANDLE';

export type StopLossMethod =
  | 'FIXED_PCT_BELOW_P0'
  | 'FIXED_PCT_BELOW_L2'
  | 'FVG_BOTTOM_OFFSET'
  | 'SWING_LOW'
  | 'FIXED_PCT_BELOW_ENTRY'
  | 'ORB_CANDLE_LOW';

export type Target1Method =
  | 'RR_MULTIPLE'
  | 'PEAK_RETEST'
  | 'H2_RETEST'
  | 'PRIOR_SWING_HIGH'
  | 'MEAN_REVERSION_SMA';

export type TrailingStopMethod =
  | 'EMA_CLOSE'
  | 'ATR_TRAIL'
  | 'NONE';

export type QualificationLogic =
  | 'ALL_REQUIRED'
  | 'CORE_PLUS_N_OF_M';

// ─── Parameter Config (grouped by family) ────────────────────────────

export interface UniverseParams {
  marketCapFloorCr: number;
  adtvFloorCr: number;
  closePriceFloor: number;
  indexMembership: 'ANY' | 'NIFTY_50' | 'NIFTY_500' | 'NIFTY_NEXT_50';
  circuitBandMinPct: number;
  freeFloatMaxPct: number;
  promoterHoldingMinPct: number;
  publicFloatMaxShares: number;
  adrMinPct: number;
}

export interface TrendParams {
  priceAboveSma200: boolean;
  priceAboveSma50: boolean;
  emaShortAboveSmaLong: boolean;
  emaShortPeriod: number;
  emaLongPeriod: number;
  emaProximityMultiplier: number;
  sma200TolerancePct: number;
  sma200SlopeRising: boolean;
  rsiPeriod: number;
  rsiBullishFloor: number;
  rsiPullbackLow: number;
  rsiPullbackHigh: number;
  rsiBreakoutLow: number;
  rsiBreakoutHigh: number;
  rsiOversoldThreshold: number;
}

export interface ImpulseParams {
  impulseGainMinPct: number;
  impulseGainIsOrWithTurnover: boolean;
  cumulativeTurnoverFloorCr: number;
  impulseDurationMinBars: number;
  impulseDurationMaxBars: number;
  flagPoleGainMinPct: number;
  flagPoleLookbackBars: number;
  rsConsecutiveSessionsMin: number;
  rsOutperformanceMinPct: number;
  near52wHighPct: number;
  moveWindowBars: number;
  p0SearchExtensionBars: number;
}

export interface PullbackParams {
  baseDurationMinBars: number;
  baseDurationMaxBars: number;
  retracementFloorMultiplier: number;
  pullbackDropMinPct: number;
  emaPullbackProximityLow: number;
  emaPullbackProximityHigh: number;
  entryZoneLowerBand: number;
  entryZoneUpperBand: number;
  consolidationRangeMaxPct: number;
  consolidationRangeLookback: number;
  bbPeriod: number;
  bbStdDev: number;
  lowerHighsMinCount: number;
  trendlineCompressionBars: number;
  swingGapMinBars: number;
  l2SearchWindow: number;
}

export interface VolumeParams {
  volumeDryingRatio: number;
  vpaAsymmetryRatioMin: number;
  volumeSurgeMultiplier: number;
  volumeDryUpThreshold: number;
  volumeBelowAverage: boolean;
  entryVolDryingRatio: number;
  entryVolImpulseRatio: number;
  rvolIntradayMin: number;
  pullbackVolDryingRatio: number;
}

export interface VolatilityParams {
  atrContractionRatioMax: number;
  atrShortPeriod: number;
  atrLongPeriod: number;
  nrLookbackWindow: number;
  nr4Enabled: boolean;
  nr7Enabled: boolean;
  entryRangeContractionRatio: number;
  atrBelowAverage: boolean;
  capitulationAtrMultiplier: number;
  atrTrailingStopMultiplier: number;
}

export interface EntryParams {
  entryTriggerType: EntryTriggerType;
  breakoutLookbackBars: number;
  fvgDetectionEnabled: boolean;
  ceEntryEnabled: boolean;
  fvgLookbackBars: number;
  orbEnabled: boolean;
  orbTimeframeMinutes: number;
  reversalCandleRequired: boolean;
  flagEmaSupport: number;
  vpaContractionAtEntryRequired: boolean;
  entrySliceBars: number;
}

export interface SmartMoneyParams {
  smartMoneyEnabled: boolean;
  institutionalTurnoverFloorCr: number;
  smartMoneyVolRatio: number;
  absorptionClosePctMin: number;
  adtMultiplier: number;
  adtFloorCr: number;
}

export interface RiskParams {
  stopLossMethod: StopLossMethod;
  stopLossPct: number;
  stopLossFvgMultiplier: number;
  target1Method: Target1Method;
  target1RRMultiplier: number;
  target2RRMultiplier: number;
  target2FibExtension: number;
  target2PeakMultiplier: number;
  trailingStopMethod: TrailingStopMethod;
  trailingStopEmaPeriod: number;
  partialExitPct: number;
  maxPortfolioRiskPct: number;
  passedOpportunityThreshold: number;
  meanReversionMaxDays: number;
}

export interface FilterParams {
  filterPreceding52wLow: boolean;
  preceding52wTolerancePct: number;
  preceding52wLookbackBars: number;
  preceding52wImpulseMinPct: number;
  filterSma200Proximity: boolean;
  secondaryRuleMinCount: number;
}

// ─── Full Parameter Config (all families) ─────────────────────────────

export interface StrategyParameterConfig {
  universe: UniverseParams;
  trend: TrendParams;
  impulse: ImpulseParams;
  pullback: PullbackParams;
  volume: VolumeParams;
  volatility: VolatilityParams;
  entry: EntryParams;
  smartMoney: SmartMoneyParams;
  risk: RiskParams;
  filters: FilterParams;
}

// ─── Strategy Template ────────────────────────────────────────────────

export interface StrategyTemplate {
  id: StrategyId;
  name: string;
  shortName: string;
  category: StrategyCategory;
  description: string;
  version: number;
  parameters: StrategyParameterConfig;
  qualificationLogic: QualificationLogic;
  coreRuleIds: string[];
  secondaryRuleIds: string[];
  secondaryMinCount: number;
  activeFamilies: ParameterFamily[];
  radarVector: Record<string, number>;  // characteristic scores 1-5
}

// ─── Custom (User-Saved) Strategy ─────────────────────────────────────

export interface CustomStrategy {
  id: string;                           // UUID
  name: string;
  baseTemplateId: StrategyId;
  parameters: StrategyParameterConfig;  // user-modified copy
  createdAt: string;                    // ISO date
  updatedAt: string;
  lastBacktestAt: string | null;
  backtestWinRate: number | null;
  backtestSharpe: number | null;
  backtestMaxDrawdown: number | null;
  isActive: boolean;
}
```

### 4.2 Built-In Strategy Template Defaults

Each built-in strategy is a frozen `StrategyTemplate` object. Below is the S1 example. The remaining 9 follow the same shape.

```typescript
export const STRATEGY_TEMPLATES: Record<StrategyId, StrategyTemplate> = {
  S1_VPA_BASE_BREAKOUT: {
    id: 'S1_VPA_BASE_BREAKOUT',
    name: 'VPA Alignment & Base Compaction Breakout',
    shortName: 'VPA Base Breakout',
    category: 'BREAKOUT',
    description: 'Identifies stocks with a strong impulse move followed by a tight consolidation base with volume drying, VPA asymmetry, and narrow range compression.',
    version: 1,
    qualificationLogic: 'CORE_PLUS_N_OF_M',
    coreRuleIds: ['S1_IMPULSE_MOVE', 'S1_BASE_DURATION', 'S1_RETRACEMENT_FLOOR', 'S1_EMA_CROSS'],
    secondaryRuleIds: ['S1_ATR_CONTRACTION', 'S1_VOLUME_DRYING', 'S1_VPA_ASYMMETRY', 'S1_NR4_NR7_COMPRESSION', 'S1_RSI_BULLISH'],
    secondaryMinCount: 3,
    activeFamilies: ['trend', 'impulse', 'pullback', 'volume', 'volatility', 'entry', 'risk', 'filters'],
    radarVector: {
      trendStrength: 3, volumeSensitivity: 4, volatilityCompression: 5,
      institutionalFootprint: 2, meanReversion: 1, momentumStrength: 3,
      holdingPeriod: 4, filterStrictness: 4
    },
    parameters: {
      universe: {
        marketCapFloorCr: 0, adtvFloorCr: 0, closePriceFloor: 0,
        indexMembership: 'ANY', circuitBandMinPct: 0, freeFloatMaxPct: 100,
        promoterHoldingMinPct: 0, publicFloatMaxShares: 999999, adrMinPct: 0
      },
      trend: {
        priceAboveSma200: false, priceAboveSma50: false, emaShortAboveSmaLong: false,
        emaShortPeriod: 9, emaLongPeriod: 21, emaProximityMultiplier: 0.985,
        sma200TolerancePct: 2.0, sma200SlopeRising: false,
        rsiPeriod: 14, rsiBullishFloor: 50, rsiPullbackLow: 42, rsiPullbackHigh: 55,
        rsiBreakoutLow: 60, rsiBreakoutHigh: 78, rsiOversoldThreshold: 32
      },
      impulse: {
        impulseGainMinPct: 15.0, impulseGainIsOrWithTurnover: false,
        cumulativeTurnoverFloorCr: 50.0, impulseDurationMinBars: 4, impulseDurationMaxBars: 25,
        flagPoleGainMinPct: 50, flagPoleLookbackBars: 20,
        rsConsecutiveSessionsMin: 20, rsOutperformanceMinPct: 15.0, near52wHighPct: 95.0,
        moveWindowBars: 15, p0SearchExtensionBars: 10
      },
      pullback: {
        baseDurationMinBars: 10, baseDurationMaxBars: 30, retracementFloorMultiplier: 0.45,
        pullbackDropMinPct: 1.5, emaPullbackProximityLow: 0.98, emaPullbackProximityHigh: 1.02,
        entryZoneLowerBand: 0.985, entryZoneUpperBand: 1.045,
        consolidationRangeMaxPct: 12, consolidationRangeLookback: 20,
        bbPeriod: 20, bbStdDev: 2.0, lowerHighsMinCount: 3, trendlineCompressionBars: 15,
        swingGapMinBars: 2, l2SearchWindow: 10
      },
      volume: {
        volumeDryingRatio: 0.80, vpaAsymmetryRatioMin: 1.15, volumeSurgeMultiplier: 2.0,
        volumeDryUpThreshold: 0.40, volumeBelowAverage: false,
        entryVolDryingRatio: 0.85, entryVolImpulseRatio: 0.80, rvolIntradayMin: 3.0,
        pullbackVolDryingRatio: 0.90
      },
      volatility: {
        atrContractionRatioMax: 0.85, atrShortPeriod: 5, atrLongPeriod: 14,
        nrLookbackWindow: 5, nr4Enabled: true, nr7Enabled: true,
        entryRangeContractionRatio: 0.85, atrBelowAverage: false,
        capitulationAtrMultiplier: 1.5, atrTrailingStopMultiplier: 2.0
      },
      entry: {
        entryTriggerType: 'VPA_BASE_BREAKOUT', breakoutLookbackBars: 20,
        fvgDetectionEnabled: false, ceEntryEnabled: false, fvgLookbackBars: 35,
        orbEnabled: false, orbTimeframeMinutes: 15, reversalCandleRequired: false,
        flagEmaSupport: 10, vpaContractionAtEntryRequired: false, entrySliceBars: 3
      },
      smartMoney: {
        smartMoneyEnabled: false, institutionalTurnoverFloorCr: 2.0,
        smartMoneyVolRatio: 1.3, absorptionClosePctMin: 0.60,
        adtMultiplier: 2.5, adtFloorCr: 1.0
      },
      risk: {
        stopLossMethod: 'FIXED_PCT_BELOW_P0', stopLossPct: 2.0, stopLossFvgMultiplier: 0.985,
        target1Method: 'RR_MULTIPLE', target1RRMultiplier: 2.0, target2RRMultiplier: 3.5,
        target2FibExtension: 0.618, target2PeakMultiplier: 1.10,
        trailingStopMethod: 'EMA_CLOSE', trailingStopEmaPeriod: 20,
        partialExitPct: 50, maxPortfolioRiskPct: 1.0, passedOpportunityThreshold: 1.15,
        meanReversionMaxDays: 7
      },
      filters: {
        filterPreceding52wLow: false, preceding52wTolerancePct: 2.5,
        preceding52wLookbackBars: 252, preceding52wImpulseMinPct: 20.0,
        filterSma200Proximity: false, secondaryRuleMinCount: 3
      }
    }
  },
  // ... S2 through S10 follow same shape with their respective defaults
};
```

---

## 5. Database Schema

### 5.1 CustomStrategies Table

```sql
CREATE TABLE IF NOT EXISTS CustomStrategies (
  id              TEXT PRIMARY KEY,        -- UUID
  name            TEXT NOT NULL,
  base_template_id TEXT NOT NULL,          -- StrategyId enum value
  parameters_json TEXT NOT NULL,           -- JSON: StrategyParameterConfig
  qualification_logic TEXT NOT NULL DEFAULT 'ALL_REQUIRED',
  core_rule_ids   TEXT,                    -- JSON array of rule IDs
  secondary_rule_ids TEXT,                 -- JSON array of rule IDs
  secondary_min_count INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_backtest_at TEXT,
  backtest_win_rate REAL,
  backtest_sharpe  REAL,
  backtest_max_drawdown REAL,
  backtest_total_signals INTEGER,
  notes           TEXT
);

CREATE INDEX idx_custom_strategies_template ON CustomStrategies(base_template_id);
CREATE INDEX idx_custom_strategies_active ON CustomStrategies(is_active);
```

### 5.2 CustomStrategyBacktests Table

```sql
CREATE TABLE IF NOT EXISTS CustomStrategyBacktests (
  id              TEXT PRIMARY KEY,        -- UUID
  strategy_id     TEXT NOT NULL,           -- FK to CustomStrategies.id or StrategyId for built-ins
  strategy_name   TEXT NOT NULL,
  is_builtin      INTEGER DEFAULT 0,      -- 1 if built-in template, 0 if custom
  run_at          TEXT NOT NULL DEFAULT (datetime('now')),
  period_start    TEXT NOT NULL,           -- YYYY-MM-DD
  period_end      TEXT NOT NULL,           -- YYYY-MM-DD
  universe_size   INTEGER,
  total_signals   INTEGER DEFAULT 0,
  wins            INTEGER DEFAULT 0,
  losses          INTEGER DEFAULT 0,
  win_rate        REAL,
  avg_gain_pct    REAL,
  avg_loss_pct    REAL,
  avg_rr          REAL,
  sharpe_ratio    REAL,
  max_drawdown_pct REAL,
  profit_factor   REAL,
  avg_holding_days REAL,
  parameters_json TEXT NOT NULL,           -- Snapshot of params used for this run
  signals_json    TEXT,                    -- JSON array of individual signals with outcomes
  FOREIGN KEY (strategy_id) REFERENCES CustomStrategies(id) ON DELETE CASCADE
);

CREATE INDEX idx_backtests_strategy ON CustomStrategyBacktests(strategy_id);
CREATE INDEX idx_backtests_run_at ON CustomStrategyBacktests(run_at DESC);
```

### 5.3 StrategyComparisonSets Table (optional — saved comparisons)

```sql
CREATE TABLE IF NOT EXISTS StrategyComparisonSets (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  strategy_ids    TEXT NOT NULL,           -- JSON array of strategy IDs (built-in or custom)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  notes           TEXT
);
```

---

## 6. UI Architecture

### 6.1 Strategy Selector Dropdown

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚡ Strategy Engine v2                         [+ New Custom]       │
│                                                                      │
│  ┌─ Select Strategies to Compare ─────────────────────────────────┐ │
│  │  ☑ S1: VPA Base Breakout              [BREAKOUT]     In-App    │ │
│  │  ☑ S2: Institutional FVG/CE           [PULLBACK]     In-App    │ │
│  │  ☐ S3: HH/HL Compaction              [BREAKOUT]     In-App    │ │
│  │  ☐ S4: HH/HL + SMA200 + VPA          [BREAKOUT]     In-App    │ │
│  │  ☑ S5: 50 EMA Pullback VCP           [PULLBACK]     New       │ │
│  │  ☐ S6: RS Breakout (Nifty 500)       [BREAKOUT]     New       │ │
│  │  ☐ S7: RSI Mean-Reversion Dip        [MEAN_REV]     New       │ │
│  │  ☐ S8: High-Tight Flag               [MOMENTUM]     New       │ │
│  │  ☐ S9: Volume Dry-Up RS              [MOMENTUM]     New       │ │
│  │  ☐ S10: Trendline ORB                [INTRADAY]     New       │ │
│  │  ─────────────────────────────────────────────────────────────  │ │
│  │  ☑ My Custom S1 (Tight)              [CUSTOM]       Saved     │ │
│  │  ☐ My Custom S3 (Relaxed)            [CUSTOM]       Saved     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [▶ Run Selected Scan]  [📊 Compare Parameters]  [⏱ Backtest All]  │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Parameter Comparison View (by Family)

```
┌──────────────────────────────────────────────────────────────────────┐
│  📊 Parameter Comparison: S1 vs S5 vs S6                            │
│                                                                      │
│  ┌─ Family: Impulse ──────────────────────────────────────────────┐ │
│  │  Parameter             │   S1        │   S5       │   S6       │ │
│  │  ─────────────────────┼─────────────┼────────────┼────────────│ │
│  │  Impulse Gain Min %   │   15.0%     │   N/A      │   N/A      │ │
│  │  Impulse Duration Min │   4 bars    │   N/A      │   N/A      │ │
│  │  Impulse Duration Max │   25 bars   │   N/A      │   N/A      │ │
│  │  RS Consec Sessions   │   N/A       │   N/A      │   20       │ │
│  │  Near 52W High %      │   N/A       │   N/A      │   95%      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Family: Volume ───────────────────────────────────────────────┐ │
│  │  Parameter             │   S1        │   S5       │   S6       │ │
│  │  ─────────────────────┼─────────────┼────────────┼────────────│ │
│  │  Volume Drying Ratio  │   0.80      │   N/A      │   N/A      │ │
│  │  VPA Asymmetry Min    │   1.15      │   N/A      │   N/A      │ │
│  │  Volume Below Avg     │   No        │   Yes      │   N/A      │ │
│  │  Volume Surge X       │   N/A       │   N/A      │   2.0x     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Family: Risk ─────────────────────────────────────────────────┐ │
│  │  Parameter             │   S1        │   S5       │   S6       │ │
│  │  ─────────────────────┼─────────────┼────────────┼────────────│ │
│  │  Stop Loss Method     │   % < P0    │  Swing Low │  Swing Low │ │
│  │  Stop Loss %          │   2.0%      │   N/A      │   N/A      │ │
│  │  Target 1 Method      │   RR Mult   │  Swing Hi  │   3:1 RR   │ │
│  │  T1 R:R Multiplier    │   2.0       │   N/A      │   3.0      │ │
│  │  Trailing Stop        │  20 EMA     │  20 EMA    │  20 EMA    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Highlight Differences Only]  [Export CSV]  [Save as Comparison]    │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 Backtest Results Comparison

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⏱ Backtest Results: 2021-01-01 → 2026-09-09                       │
│                                                                      │
│  ┌─ Summary ──────────────────────────────────────────────────────┐ │
│  │  Metric            │  S1      │  S5      │  S6      │  Best   │ │
│  │  ─────────────────┼──────────┼──────────┼──────────┼─────────│ │
│  │  Total Signals     │  142     │  87      │  63      │  S1     │ │
│  │  Win Rate          │  58.5%   │  62.1%   │  71.4%   │  S6 ★  │ │
│  │  Avg R:R           │  2.1     │  1.8     │  2.7     │  S6 ★  │ │
│  │  Sharpe Ratio      │  1.42    │  1.58    │  1.89    │  S6 ★  │ │
│  │  Max Drawdown      │  -12.3%  │  -8.7%   │  -6.2%   │  S6 ★  │ │
│  │  Profit Factor     │  1.85    │  1.92    │  2.41    │  S6 ★  │ │
│  │  Avg Hold (days)   │  18      │  12      │  22      │  S5     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Radar Chart ──────────────────────────────────────────────────┐ │
│  │                                                                │ │
│  │              Win Rate                                          │ │
│  │                 ▲                                              │ │
│  │            ╱    │    ╲         ── S1 (green)                   │ │
│  │        ╱        │        ╲    ── S5 (blue)                    │ │
│  │  Signals ───────┼───────── Sharpe    ── S6 (amber)            │ │
│  │        ╲        │        ╱                                    │ │
│  │            ╲    │    ╱                                        │ │
│  │                 ▼                                              │ │
│  │             Drawdown                                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [View Signal-Level Detail]  [Export Report]  [Save Comparison]      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.4 Custom Strategy Editor

```
┌──────────────────────────────────────────────────────────────────────┐
│  ✏️ Strategy Editor: My Custom S1 (Tight)                           │
│  Base Template: S1 VPA Base Breakout         [Reset to Defaults]    │
│                                                                      │
│  ┌─ Family: Impulse ──────────────────────────────────────────────┐ │
│  │                                                                │ │
│  │  Impulse Gain Min %    ●━━━━━━━━━━━━━━━○━━━━━━━━━━ [  20  ] % │ │
│  │  (Default: 15%)              ▲ changed from 15% to 20%        │ │
│  │                                                                │ │
│  │  Impulse Duration Min  ━━━━━━━━●━━━━━━━━━━━━━━━━━━ [   6  ] b │ │
│  │  (Default: 4 bars)           ▲ changed from 4 to 6            │ │
│  │                                                                │ │
│  │  Impulse Duration Max  ━━━━━━━━━━━━━━━●━━━━━━━━━━━ [  20  ] b │ │
│  │  (Default: 25 bars)          ▲ changed from 25 to 20          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Family: Volume ───────────────────────────────────────────────┐ │
│  │                                                                │ │
│  │  Volume Drying Ratio   ━━━━━━━━━●━━━━━━━━━━━━━━━━━ [ 0.70 ]   │ │
│  │  (Default: 0.80)             ▲ tightened from 0.80 to 0.70    │ │
│  │                                                                │ │
│  │  VPA Asymmetry Min     ━━━━━━━━━━━━━━━━━●━━━━━━━━━ [ 1.30 ]   │ │
│  │  (Default: 1.15)             ▲ raised from 1.15 to 1.30       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ 3 parameters changed from default ───────────────────────────┐ │
│  │  impulse.impulseGainMinPct: 15% → 20%                         │ │
│  │  volume.volumeDryingRatio: 0.80 → 0.70                        │ │
│  │  volume.vpaAsymmetryRatioMin: 1.15 → 1.30                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Save Strategy]  [Run Live Scan]  [Backtest 2021-Present]          │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.5 Unified Scan Results (Multi-Strategy Tags)

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 Scan Results: 4,872 stocks scanned │ 5 strategies selected      │
│                                                                      │
│  Symbol    │ CMP    │ Strategies Matched  │ Conv │ Best R:R │ Action │
│  ─────────┼────────┼─────────────────────┼──────┼──────────┼────────│
│  TRENT     │ ₹6,240 │ [S1][S3][S5]        │  3   │   2.8    │ [→]   │
│  BEL       │ ₹  328 │ [S1][S5][S6]        │  3   │   3.1    │ [→]   │
│  HAL       │ ₹5,120 │ [S3][S4]            │  2   │   2.4    │ [→]   │
│  ZOMATO    │ ₹  289 │ [S8][S9]            │  2   │   3.5    │ [→]   │
│  IRFC      │ ₹  187 │ [S1]                │  1   │   2.0    │ [→]   │
│  COCHINSHIP│ ₹1,840 │ [S5]                │  1   │   1.8    │ [→]   │
│  ...       │        │                     │      │          │        │
│                                                                      │
│  Filter: [All] [≥2 Conv] [BREAKOUT only] [MOMENTUM only]           │
│  Sort:   [Convergence ▼] [R:R] [CMP] [Symbol]                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. Implementation Approach

### Phase 1: Parameter Extraction & Template Registry (3-4 days)

**Goal:** Move all 65+ hardcoded constants from `PureTechnicalStrategiesEngine.ts` into the `StrategyParameterConfig` structure.

**Files to create:**
- `src/server/services/StrategyParameterRegistry.ts` — Contains `STRATEGY_TEMPLATES`, `ParameterMeta` definitions, default configs for all 10 strategies, and helper functions (`getDefaultConfig(strategyId)`, `mergeWithDefaults(partial, strategyId)`, `diffFromDefault(config, strategyId)`).

**Files to modify:**
- `src/server/services/PureTechnicalStrategiesEngine.ts` — Refactor `evaluateStrategy1-4` to accept `StrategyParameterConfig` instead of using inline literals. Each hardcoded number becomes `config.family.paramKey`.
- `src/server/database.ts` — Add `CustomStrategies`, `CustomStrategyBacktests`, `StrategyComparisonSets` table creation.

**Migration approach:** Start by defining the 4 existing templates with their exact current values. Run existing tests to verify zero behavioral change. Then replace hardcoded numbers one family at a time.

### Phase 2: Implement 6 New Strategies (5-7 days)

**Goal:** Add S5-S10 as config-driven evaluator functions.

**New file:** `src/server/services/ConfigDrivenStrategyEvaluator.ts`

This is a SINGLE generic evaluator function that takes `(candles, config: StrategyParameterConfig, template: StrategyTemplate)` and executes a rule pipeline based on the `activeFamilies` and `entryTriggerType`. This avoids 6 more copy-pasted methods.

**Rule pipeline architecture:**
```
evaluateStrategy(candles, config, template) {
  const results: RuleCheck[] = [];

  // 1. Universe gate (if 'universe' in activeFamilies)
  if (template.activeFamilies.includes('universe'))
    results.push(checkUniverse(tickerMeta, config.universe));

  // 2. Trend gate
  if (template.activeFamilies.includes('trend'))
    results.push(checkTrend(candles, config.trend));

  // 3. Impulse gate
  if (template.activeFamilies.includes('impulse'))
    results.push(checkImpulse(candles, config.impulse));

  // ... etc for each family

  // Qualification
  const coresPassed = template.coreRuleIds
    .every(id => results.find(r => r.id === id)?.passed);
  const secondaryPassed = template.secondaryRuleIds
    .filter(id => results.find(r => r.id === id)?.passed).length;

  const qualified = coresPassed &&
    (template.qualificationLogic === 'ALL_REQUIRED'
      ? secondaryPassed === template.secondaryRuleIds.length
      : secondaryPassed >= template.secondaryMinCount);

  return { qualified, ruleChecks: results, ... };
}
```

**Implementation complexity per new strategy:**

| Strategy | Complexity | New Indicators Needed | Est. Days |
|----------|-----------|----------------------|-----------|
| S5: 50 EMA VCP | Low | None (EMA, SMA, RSI, ATR all exist) | 0.5 |
| S6: RS Breakout | Medium | Mansfield Relative Strength (new) | 1.0 |
| S7: RSI Mean-Rev | Low | Bollinger Bands (exists), slope (new) | 0.5 |
| S8: High-Tight Flag | Medium | ADR (new), Promoter/Float data query | 1.0 |
| S9: VDU-RS | Medium | Relative Strength vs index (new) | 1.0 |
| S10: Trendline ORB | High | Linear Regression (new), Intraday data | 1.5 |

**New technical indicators needed:**
1. **Mansfield Relative Strength** — `(stockPrice / indexPrice) / SMA(stockPrice / indexPrice, 52)` — simple to compute given index data
2. **Average Daily Range (ADR%)** — `SMA( (High-Low)/Close * 100, 20 )` — trivial
3. **SMA Slope** — `(SMA[0] - SMA[N]) / N` — trivial
4. **Linear Regression Trendline** — `linearRegression(highs, period)` — available in `technicalindicators` library or simple least-squares
5. **Relative Strength vs Index** — `(stockReturn1m - indexReturn1m)` — requires Nifty 500 benchmark data

### Phase 3: Strategy Editor UI (3-4 days)

**New file:** `src/components/StrategyEditorModal.tsx`

Features:
- Select base template from dropdown
- Parameters displayed by family with sliders/inputs
- Changed params highlighted with diff from default
- Save as custom strategy (POST `/api/strategies/custom`)
- Load existing custom strategy for editing

**New file:** `src/components/StrategyComparisonView.tsx`

Features:
- Multi-select strategies (built-in + custom) from checkbox dropdown
- Side-by-side parameter comparison table grouped by family
- "Differences Only" toggle
- CSV export of comparison

### Phase 4: Unified Comparison & Backtest View (2-3 days)

**Modify:** `src/components/IndependentTechnicalStrategiesView.tsx`

Replace the current single-strategy tabs with:
- Multi-strategy selector dropdown (Section 6.1 wireframe)
- Unified scan results table with strategy tags per match (Section 6.5)
- Strategy comparison modal (Section 6.2)
- Backtest comparison view (Section 6.3)
- Radar chart overlay

### API Routes (add to `src/server/routes/infra.ts`)

```
GET  /api/strategies/templates              — List all 10 built-in templates
GET  /api/strategies/templates/:id          — Get single template with full params
GET  /api/strategies/custom                 — List user's custom strategies
POST /api/strategies/custom                 — Save new custom strategy
PUT  /api/strategies/custom/:id             — Update custom strategy
DEL  /api/strategies/custom/:id             — Delete custom strategy
POST /api/strategies/scan                   — Run scan with selected strategy IDs + optional overrides
POST /api/strategies/backtest               — Backtest selected strategies against historical data
GET  /api/strategies/backtest/:id           — Get backtest results
POST /api/strategies/compare                — Compare N strategies (params + backtest)
```

---

## 8. Timeline Summary

| Phase | Scope | Estimated Days |
|-------|-------|---------------|
| Phase 1 | Parameter extraction + template registry + DB schema | 3-4 |
| Phase 2 | 6 new strategies as config-driven evaluators | 5-7 |
| Phase 3 | Strategy editor UI + comparison view | 3-4 |
| Phase 4 | Unified scan + backtest comparison + radar chart | 2-3 |
| **Total** | **Full 10-strategy parameterized framework** | **13-18 days** |

---

## 9. Key Design Decisions

1. **Family-first organization** — Parameters grouped by what they control, not which strategy uses them. The UI organizes by family. The DB stores by family. When a user changes `volume.volumeDryingRatio`, they immediately see which strategies are affected.

2. **Config-driven evaluator** — A single generic `evaluateStrategy()` function replaces 10 separate methods. Each strategy is defined by its `StrategyTemplate` (which families are active, which rules are core vs secondary, what entry trigger type). This eliminates code duplication and makes adding strategy #11 trivial.

3. **Qualification logic types** — Two modes: `ALL_REQUIRED` (every rule must pass) and `CORE_PLUS_N_OF_M` (core rules must pass + at least N of M secondary rules). This handles S1's "3 of 5 secondary" pattern and S2-S10's "all required" pattern.

4. **Frozen defaults, mutable customs** — Built-in templates are immutable code constants. Users clone to create custom strategies. The diff from default is always computable, keeping the UI clean.

5. **Backward compatibility** — Phase 1 must produce zero behavioral change in existing S1-S4. The refactored code must pass all existing tests before any new strategies are added.

---

## 10. Data Pipeline Requirements by Strategy

### 10.1 Data Requirements Matrix

| Data Field | Source | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Standard OHLCV** | DailyOHLCV | X | X | X | X | X | X | X | X | X | X |
| **Turnover (INR)** | NSE Bhavcopy `turnover_lacs` | - | X | X | X | - | - | - | - | - | - |
| **Delivery Qty** | NSE Bhavcopy `deliv_qty` | - | - | X | X | - | - | - | - | - | - |
| **Delivery %** | NSE Bhavcopy `deliv_per` | - | - | X | X | - | - | - | - | - | - |
| **No. of Trades** | NSE Bhavcopy `no_of_trades` | - | - | X | X | - | - | - | - | - | - |
| **Market Cap (Cr)** | MasterTickers | - | - | - | - | X | - | - | - | - | - |
| **Promoter Holding %** | FundamentalData (quarterly) | - | - | - | - | - | - | - | X | - | - |
| **Free Float % / Shares** | FundamentalData (quarterly) | - | - | - | - | - | - | - | X | X | - |
| **Index Membership** | IndexConstituents | - | - | - | - | - | X | - | - | - | - |
| **Circuit Band Limit** | NSE circuit limits file | - | - | - | - | - | X | - | - | - | - |
| **Nifty 500 Daily Close** | IndexOHLCV | - | - | - | - | - | X | - | - | X | - |
| **Nifty 50 Daily Close** | IndexOHLCV | - | - | - | - | - | - | - | - | - | - |
| **52-Week High** | Computed from DailyOHLCV | X | - | - | - | - | X | - | - | - | - |
| **52-Week Low** | Computed from DailyOHLCV | X | X | X | X | - | - | - | - | - | - |
| **15-min Intraday Candles** | Live Upstox WebSocket | - | - | - | - | - | - | - | - | - | X |

### 10.2 Derived Indicators (computed from OHLCV — on-the-fly or cached)

| Indicator | Library | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SMA(200) | technicalindicators | - | - | X | X | X | - | X | - | - | X |
| SMA(50) | technicalindicators | - | - | - | - | - | - | - | - | X | - |
| EMA(9), EMA(21) | technicalindicators | X | - | - | - | - | - | - | - | - | - |
| EMA(50) | technicalindicators | - | - | - | - | X | - | - | - | - | - |
| EMA(10), EMA(20) | technicalindicators | - | - | - | - | - | - | - | X | - | - |
| RSI(14) | technicalindicators | X | - | - | - | X | X | X | - | - | - |
| ATR(14) | technicalindicators | X | - | - | - | X | - | X | - | - | X |
| Bollinger Bands(20,2) | technicalindicators | - | - | - | - | - | - | X | - | - | - |
| ADR(20) % | Custom: `SMA((H-L)/C*100, 20)` | - | - | - | - | - | - | - | X | X | X |
| Mansfield RS | Custom: `(price/index)/SMA(price/index,52)` | - | - | - | - | - | X | - | - | - | - |
| Relative Strength vs Index | Custom: `stock1mReturn - index1mReturn` | - | - | - | - | - | - | - | - | X | - |
| Linear Regression Trendline | Custom or `technicalindicators` | - | - | - | - | - | - | - | - | - | X |
| NR4 / NR7 | Custom (range comparison) | X | - | - | - | - | - | - | - | - | - |

### 10.3 Recommended DailyOHLCV Schema (expanded for all strategies)

```sql
CREATE TABLE IF NOT EXISTS DailyOHLCV (
  symbol          TEXT NOT NULL,
  trade_date      TEXT NOT NULL,           -- YYYY-MM-DD
  open            REAL NOT NULL,
  high            REAL NOT NULL,
  low             REAL NOT NULL,
  close           REAL NOT NULL,
  volume          INTEGER NOT NULL,
  turnover_lacs   REAL,                    -- INR lakhs (from NSE Bhavcopy) — S2, S3, S4
  delivery_qty    INTEGER,                 -- Delivery quantity — S3, S4
  delivery_pct    REAL,                    -- Delivery % of traded volume — S3, S4
  no_of_trades    INTEGER,                 -- Number of trades — S3, S4
  avg_price       REAL,                    -- VWAP proxy from Bhavcopy
  prev_close      REAL,                    -- Previous day close
  data_source     TEXT DEFAULT 'NSE_BHAVCOPY',  -- 'NSE_BHAVCOPY', 'UPSTOX', 'YAHOO'
  created_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (symbol, trade_date)
);

CREATE INDEX idx_dailyohlcv_symbol ON DailyOHLCV(symbol);
CREATE INDEX idx_dailyohlcv_date ON DailyOHLCV(trade_date);
CREATE INDEX idx_dailyohlcv_symbol_date ON DailyOHLCV(symbol, trade_date DESC);
```

### 10.4 IndexOHLCV Table (for Nifty 50 / Nifty 500 benchmark data)

```sql
CREATE TABLE IF NOT EXISTS IndexOHLCV (
  index_symbol    TEXT NOT NULL,           -- '^NSEI', '^CNX500', '^NSEBANK'
  trade_date      TEXT NOT NULL,
  open            REAL,
  high            REAL,
  low             REAL,
  close           REAL NOT NULL,
  volume          INTEGER,
  data_source     TEXT DEFAULT 'YAHOO',
  PRIMARY KEY (index_symbol, trade_date)
);
```

Required index data:
- `^NSEI` (Nifty 50) — regime classification, general benchmark
- `^CNX500` (Nifty 500) — Mansfield RS for S6, relative strength for S9

### 10.5 IndexConstituents Table

```sql
CREATE TABLE IF NOT EXISTS IndexConstituents (
  index_name      TEXT NOT NULL,           -- 'NIFTY_50', 'NIFTY_500', 'NIFTY_NEXT_50'
  symbol          TEXT NOT NULL,
  isin            TEXT,
  company_name    TEXT,
  weight_pct      REAL,
  sector          TEXT,
  as_of_date      TEXT NOT NULL,           -- Date this constituent list was fetched
  PRIMARY KEY (index_name, symbol)
);
```

Source: NSE publishes index constituent CSVs (free download). Refresh monthly.

### 10.6 FundamentalData Table

```sql
CREATE TABLE IF NOT EXISTS FundamentalData (
  symbol              TEXT NOT NULL,
  as_of_quarter       TEXT NOT NULL,       -- 'Q1FY26', 'Q2FY26', etc.
  promoter_holding_pct REAL,               -- S8: Promoter > 65%
  public_holding_pct   REAL,
  free_float_pct       REAL,               -- S9: Free Float <= 25%
  public_float_shares_m REAL,              -- S8: < 50M shares (in millions)
  total_shares_m       REAL,
  market_cap_cr        REAL,               -- S5: > 2000 Cr
  data_source          TEXT DEFAULT 'NSE',
  updated_at           TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (symbol, as_of_quarter)
);
```

Sources:
- NSE quarterly shareholding pattern disclosures (free, available per stock)
- BSE corporate filings
- NSE EQUITY_L.csv for basic float data

### 10.7 Strategy S10 — Intraday Data Handling

**S10 (Parabolic Trendline + ORB) is flagged as INTRADAY_HYBRID.** It requires:
- 15-minute candle data (first 15-min candle high, RVOL)
- This is fundamentally different from EOD strategies

**Recommended approach (phased):**

1. **Phase 1 (EOD scan only):** The daily scan identifies S10 candidates using the trendline compression + price above declining regression line criteria. These candidates go into a **live watchlist**.

2. **Phase 2 (live monitoring):** On the next trading day, use Upstox WebSocket to stream 15-min candles for watchlist stocks only. When a stock's 15-min close > first 15-min candle high with RVOL > 3.0, fire the entry alert.

3. **No historical 15-min storage needed initially.** For backtesting S10, approximate: assume entry at daily open + 1% if the daily candle closes above the trendline with volume > 3x. This is a reasonable proxy for intraday ORB backtesting at the daily level.

This keeps the data pipeline simple (daily only) while still supporting S10 in live scanning.

### 10.8 Data Pipeline ↔ Strategy Integration

The `ConfigDrivenStrategyEvaluator` must read from:

| Strategy Needs | Data Source | Access Pattern |
|---|---|---|
| OHLCV + Turnover + Delivery | `DailyOHLCV` table | `SELECT * FROM DailyOHLCV WHERE symbol = ? ORDER BY trade_date DESC LIMIT ?` |
| Index benchmark data | `IndexOHLCV` table | `SELECT close FROM IndexOHLCV WHERE index_symbol = ? AND trade_date >= ?` |
| Index membership | `IndexConstituents` table | `SELECT 1 FROM IndexConstituents WHERE index_name = ? AND symbol = ?` |
| Promoter/Float data | `FundamentalData` table | `SELECT * FROM FundamentalData WHERE symbol = ? ORDER BY as_of_quarter DESC LIMIT 1` |
| Market cap | `MasterTickers` or `FundamentalData` | Existing table, already populated |
| 52W High / Low | Computed from `DailyOHLCV` | `SELECT MAX(high), MIN(low) FROM DailyOHLCV WHERE symbol = ? AND trade_date >= date(?, '-1 year')` |

**Critical requirement:** The strategy engine must switch from calling `fetchTickerData()` (Yahoo Finance HTTP on-demand) to querying `DailyOHLCV` (local SQLite). This eliminates the current bottleneck of 150 HTTP calls per scan and enables scanning 5,000+ stocks in seconds.
