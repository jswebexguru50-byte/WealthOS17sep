# V6.5 DELIVERY 2.2 — REPOSITORY ARCHITECTURE & DISCOVERY MAP

## 1. Actual Strategy Engine Entry Points
- **Frozen Pure Engine**: `src/server/services/PureTechnicalStrategiesEngine.ts`
  - Class: `PureTechnicalStrategiesEngine` (Singleton instance via `.getInstance()`)
  - Evaluators: `evaluateStrategy1` through `evaluateStrategy11`.
  - Signature: `(candles: Candle[], symbol: string, companyName?: string, options?: StrategyEvaluationOptions) => StrategyResult`
  - Input: Array of `Candle { date, open, high, low, close, volume, turnover }`.
- **Frozen New Technical Engine**: `src/server/services/NewTechnicalStrategiesEngine.ts`
  - Standalone functions: `evaluateS8B_ClassicalBullFlag`, `evaluateS21_CupAndHandle`, `evaluateS22_VolatilitySqueeze`, `evaluateS23_DoubleBottom`, `evaluateS24_DoubleTopExit`, `evaluateS25_InverseHeadAndShoulders`, `evaluateS26_HeadAndShouldersTopExit`.

## 2. Strategy Registry S1–S20 Status & Implementation Mapping
| ID | Code | Name | Implementation Source | Historical Data Requirement | Status |
|---|---|---|---|---|---|
| **S1** | `S1_VPA_BASE_BREAKOUT` | VPA Base Breakout | `PureTechnicalStrategiesEngine.evaluateStrategy1` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S2** | `S2_INSTITUTIONAL_FVG_CE` | Institutional FVG/CE Pullback | `PureTechnicalStrategiesEngine.evaluateStrategy2` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S3** | `S3_HH_HL_COMPACTION` | HH/HL L2 Compaction | `PureTechnicalStrategiesEngine.evaluateStrategy3` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S4** | `S4_HH_HL_SMA200_VPA` | HH/HL + SMA200 + VPA | `PureTechnicalStrategiesEngine.evaluateStrategy4` | Daily OHLCV (>= 200 bars) | COMPLETE |
| **S5** | `S5_50EMA_PULLBACK_VCP` | 50 EMA Pullback VCP | `PureTechnicalStrategiesEngine.evaluateStrategy5` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S6** | `S6_RS_BREAKOUT` | Relative Strength Breakout | `PureTechnicalStrategiesEngine.evaluateStrategy6` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S7** | `S7_RSI_MEAN_REVERSION` | RSI Mean-Reversion Dip | `PureTechnicalStrategiesEngine.evaluateStrategy7` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S8** | `S8_HIGH_TIGHT_FLAG` | High-Tight Flag | `PureTechnicalStrategiesEngine.evaluateStrategy8` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S9** | `S9_VOLUME_DRYUP_RS` | Volume Dry-Up RS | `PureTechnicalStrategiesEngine.evaluateStrategy9` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S10** | `S10_TRENDLINE_ORB` | 15-Min Trendline ORB Intraday | `PureTechnicalStrategiesEngine.evaluateStrategy10` | 15-min Intraday bars | DATA_INSUFFICIENT (Intraday required) |
| **S11** | `S11_INSTITUTIONAL_SPRING` | Institutional Spring Accumulation | `PureTechnicalStrategiesEngine.evaluateStrategy11` | Daily OHLCV (>= 60 bars) | COMPLETE |
| **S12** | `S12_EPISODIC_PIVOT` | Episodic Pivot Gap-Up | Catalyst engine | News / earnings feeds | DATA_INSUFFICIENT |
| **S13** | `S13_EARNINGS_ACCEL` | Earnings Acceleration Momentum | Fundamental engine | Quarterly filings | DATA_INSUFFICIENT |
| **S14** | `S14_BEARISH_HEDGE` | Bearish Short Futures Hedge | Derivatives engine | NSE F&O contracts | DATA_INSUFFICIENT |
| **S15** | `S15_CREDIT_SPREADS` | Option Credit Spreads Harvest | Derivatives engine | NSE Options chain | DATA_INSUFFICIENT |
| **S16** | `S16_OPERATING_LEVERAGE` | Operating Leverage Inflection | Fundamental engine | P&L / balance sheets | DATA_INSUFFICIENT |
| **S17** | `S17_PROMOTER_SAST` | Promoter SAST Creeping Squeeze | Governance engine | SAST filings | DATA_INSUFFICIENT |
| **S18** | `S18_BLOCK_ACCUMULATION` | Institutional Block Accumulation | Microstructure engine | Bulk/block deals | COMPLETE (Daily proxy / volume) |
| **S19** | `S19_DELIVERY_SPIKE` | Delivery Volume Spike Threshold | Microstructure engine | NSE Delivery % | COMPLETE (Daily delivery data) |
| **S20** | `S20_NEOWAVE_STRUCTURAL` | NEoWave Structural Pattern | Structural engine | Complex wave rules | DATA_INSUFFICIENT |

## 3. Entry Resolution Engine
- Reused from Delivery 2.1: `src/server/services/phase2fasttrack/EntryResolutionEngine.ts`.
- Evaluates rules:
  - `DAILY_CLOSE_BOUND`: Uses decision bar close price.
  - `NEXT_OPEN`: Uses next tradable session open price.
  - `INTRADAY_ORB_BREAKOUT`: Uses verified 15-minute breakout bar for S10.
  - Lookahead guard: strictly enforces `availableAt <= decisionTimestamp < entryTimestamp`.

## 4. Exit Resolution Engine
- Candle traversal after entry: `ExitResolutionEngine.ts`.
- Traverses sequential historical candles starting at `entryDate + 1`.
- Identifies first candle meeting stop-loss, target, trailing stop, or maximum holding period.
- Collision Policy: `CONSERVATIVE_STOP_FIRST`. If both stop and target fall within the same day's [Low, High] range, stop loss is triggered.

## 5. PIT Data Source & APIs
- **Membership**: `data/v6.4/v642_historical_membership.jsonl`
  - Records: `{ securityId, symbolAtTime, membershipStart, membershipEnd, sourceType }`.
  - Invariant: A symbol is eligible on `decisionDate` iff `membershipStart <= decisionDate <= membershipEnd`.
- **Trading Calendar**: `src/server/services/research/TradingCalendarService.ts`
  - Validates trading days, weekend exclusion (Sat/Sun), and official NSE holidays (e.g., Republic Day, Independence Day, Diwali).

## 6. Historical OHLCV Schema
- Table: `DailyOHLCV` in `portfolio.db`
  - Fields: `symbol TEXT, trade_date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL, turnover REAL`.
  - Date range: 2020-01-01 to 2024-12-31.
  - Ordered ascending by `trade_date`.

## 7. Date-Effective Statutory Cost Schedule
- **Brokerage**: Flat ₹20 per executed leg (buy and sell).
- **Securities Transaction Tax (STT)**: 0.10% on purchase and 0.10% on sale (delivery).
- **Stamp Duty**: 0.015% on purchase effective from July 1, 2020 onwards; 0.0% prior to 2020-07-01.
- **SEBI Turnover Fee**: 0.0001% of turnover.
- **Exchange Transaction Charges**: 0.00345% of turnover.
- **GST**: 18% applied to (Brokerage + Exchange Charges).
- **Market Impact**: $10.0 \times \sqrt{\text{Participation Rate}} \times (\frac{\sigma_{\text{PIT}}}{0.02}) \times \text{Multiplier}$.
- **Slippage**: Baseline 5.0 bps.

## 8. Current v6.5 Deficiencies & Required Remediation
1. **Loop Synthesis (S2–S19)**: In legacy runner, strategies S2–S19 did not invoke strategy engines and instead generated synthetic alternating wins on "RELIANCE" and "TCS".
   - *Remediation*: Execute actual strategy evaluation functions (`evaluateStrategy2` to `evaluateStrategy11`) against genuine historical candle slices. Strategies lacking required inputs (S12–S17, S20) will be transparently marked `DATA_INSUFFICIENT`, not fabricated.
2. **Formulaic Metrics**: Legacy code used `0.15 + (strategyNumber % 7) * 0.015` for CAGR, Sharpe, etc.
   - *Remediation*: Compute all portfolio and strategy metrics directly from the empirical closed trades in `CanonicalTradeLedger`.
3. **OOS Multiplier**: Legacy code approximated OOS performance as an expectancy multiplier.
   - *Remediation*: Partition trade dates into In-Sample (2020–2022), OOS 2023, and OOS 2024, re-calculating independent statistics from the partition trade subsets.
4. **Algebraic Sensitivity**: Legacy code applied mathematical multipliers to base CAGR for the 36-cell table.
   - *Remediation*: Replay every trade through all 36 friction $\times$ impact parameter cells.
5. **Metadata-Only Bootstrap & Hardcoded P-Values**:
   - *Remediation*: Execute Politis-Romano stationary block bootstrap over empirical trade R-multiples and run BH-FDR over empirical p-values.
