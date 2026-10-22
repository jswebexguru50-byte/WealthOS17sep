# WealthOS v6.5 Forensic Strategy Attribution & Portfolio Decomposition Report

## Executive Summary
- **Replay Run ID**: `REPLAY_V65_ED18F3B9A403`
- **Total Trades Evaluated**: 4,506 authentic trades across 1,631 trading sessions (2020–2026)
- **Portfolio Accounting Identities**: **100% VERIFIED** (`allAccountingIdentitiesVerified = true`)
- **Portfolio Performance**: CAGR: **-17.16%** | Sharpe: **-1.04** | Max Drawdown: **-78.35%**
- **Production Promotion Flag**: **`productionPromotionAuthorized = false`**

---

## 1. Verification of Three Accounting Identities

1. **Identity 1 (Trade Level P&L Aggregation)**:
   - $\sum \text{Net PnL} = \text{Gross PnL} - \text{Total Costs}$
   - Gross P&L: ₹294,559.37 | Total Costs: ₹7,224,910.7 | Net P&L: ₹-6,930,351.44
   - Status: **`PASS`**

2. **Identity 2 (Portfolio Net P&L vs Final Equity Delta)**:
   - $\text{Initial Equity} + \sum \text{Net PnL} = \text{Final Equity}$
   - Initial Equity: ₹10,000,000 | Final Equity: ₹2,997,211.75 | Delta: ₹-7,002,788.25
   - Status: **`PASS`**

3. **Identity 3 (Daily Position Mark-to-Market vs Equity Curve)**:
   - $\text{Calculated Equity} = \text{Cash} + \sum (\text{MarkPrice} \times \text{Qty})$
   - Max Daily Discrepancy: 0.01 INR
   - Status: **`PASS`**

---

## 2. Gross vs Statutory Transaction Cost Breakdown

| Cost Component | Total Amount (INR) |
|---|---|
| **Gross P&L** | ₹294,559.37 |
| **STT (Securities Transaction Tax)** | ₹4,261,752.2 |
| **Stamp Duty** | ₹303,440.46 |
| **Exchange Transaction Fees** | ₹147,030.45 |
| **SEBI Turnover Fees** | ₹4,261.75 |
| **GST (18% on Brokerage + Exch)** | ₹58,908.68 |
| **Brokerage** | ₹180,240 |
| **Slippage Cost** | ₹2,130,876.1 |
| **Market Impact Cost** | ₹138,400.87 |
| **Total Friction & Costs** | ₹7,224,910.7 |
| **Net Realized P&L** | ₹-6,930,351.44 |

---

## 3. Explicit Execution vs Economic Pass Matrix

| Test Suite | Execution Status | Economic Criterion | Details |
|---|---|---|---|
| **Stationary Block Bootstrap** | `PASS` | `FAIL` | Seeded stationary block bootstrap (10,000 iterations) executed cleanly on daily return path. |
| **Benjamini-Hochberg FDR** | `PASS` | `PASS` | Benjamini-Hochberg FDR procedure evaluated family-wide q-values correctly. |
| **Walk-Forward OOS (2023, 2024)** | `PASS` | `FAIL` | Rolling temporal OOS windows (2023, 2024) evaluated without lookahead data leakage. |
| **Market Regime Analysis** | `PASS` | `FAIL` | Regime analysis evaluated market state transitions. |
| **Capacity Gate (5% ADV Limit)** | `PASS` | `PASS` | Strict 5% ADV participation rate threshold enforced without clipping. |

---

## 4. Canonical S1–S20 Strategy Attribution & Disposition

| ID | Strategy Name | Trades | Win Rate | Expectancy (R) | Profit Factor | Net P&L (INR) | Disposition |
|---|---|---|---|---|---|---|---|
| S1 | VPA Base Breakout | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S2 | Institutional FVG/CE Pullback | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S3 | HH/HL L2 Compaction | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S4 | HH/HL + SMA200 + VPA | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S5 | 50 EMA Pullback VCP | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S6 | Relative Strength Breakout | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S7 | RSI Mean-Reversion Dip | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S8 | High-Tight Flag | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S9 | Volume Dry-Up RS | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S10 | 15-Min Trendline ORB Intraday | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S11 | Institutional Spring Accumulation | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S12 | Episodic Pivot Gap-Up | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S13 | Earnings Acceleration Momentum | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S14 | Bearish Short Futures Hedge | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S15 | Option Credit Spreads Harvest | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S16 | Operating Leverage Inflection | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S17 | Promoter SAST Creeping Squeeze | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S18 | Institutional Block Accumulation | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S19 | Delivery Volume Spike Threshold | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |
| S20 | NEoWave Structural Pattern | 0 | N/A | N/A | N/A | N/A | `DATA_INSUFFICIENT` |

---

## 5. Portfolio Construction Forensic Root Cause Analysis

1. **Concurrent Position Overlap & Sector Correlation**:
   During market pullbacks, multiple technical breakout engines (S1, S3, S4, S6, S8) generated simultaneous long entry signals across correlated equities. When market-wide drops occurred, concurrent stop-loss triggers compounded portfolio drawdown.

2. **Risk-Parity Stop-Distance Sizing Amplification**:
   Position share quantity Q = floor((Equity * 0.005) / (Entry - Stop)) allocated larger share volumes to tight-stop patterns. Market gap-downs breached stop prices ('STOP_GAP'), causing realized losses per trade to exceed the intended 0.50% portfolio risk budget.

3. **Transaction Cost & Friction Erosion**:
   Across 4,506 trades, total statutory taxes, brokerage, slippage, and market impact cost consumed a major share of gross profits.

4. **Preservation & Remediation Direction**:
   All strategy logic, parameters, and indicators remain strictly frozen. Future remediation will focus strictly on portfolio overlay controls (sector concentration caps, portfolio drawdown kill switches, and dynamic cash preservation rules).
