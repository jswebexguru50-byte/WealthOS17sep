# WEALTHOS — MASTER DATA DEPENDENCY MAP (STREAM B)

## OVERVIEW
This document provides the exhaustive, code-level data dependency map across all 20 strategy engines (S1–S20), technical indicators, index benchmarks, F&O metrics, fundamental financial statements, shareholding patterns, and signal quality overlays.

---

## 1. TECHNICAL DATA DEPENDENCIES
| Dataset | Source Provider | Historical Range | Frequency | PIT Requirement | Freshness SLA | Production Tables / Code Files |
| --- | --- | --- | --- | --- | --- | --- |
| **OHLCV Daily** | NSE / Upstox / Yahoo | 15 years (2011–2026) | Daily EOD | Mandatory | T+0 (18:00 IST) | `daily_ohlcv`, `PureTechnicalStrategiesEngine.ts` |
| **Intraday 15m / 1m Candles** | Upstox WebSocket / API | 2 years (2024–2026) | Real-Time / 15m | Mandatory | Real-Time / < 5s | `UpstoxIntradayIngestor.ts`, `NewTechnicalStrategiesEngine.ts` |
| **Previous Close & Traded Value** | NSE EOD Bhavcopy | 15 years | Daily | Mandatory | T+0 (18:00 IST) | `daily_ohlcv`, `database.ts` |
| **Delivery Quantity & %** | NSE Delivery Reports | 10 years | Daily | Mandatory | T+0 (19:00 IST) | `delivery_data`, `SignalQualityOverlay.ts` |
| **Corporate Actions (Splits/Bonus/Div)** | NSE Official Filings | 15 years | Event-Driven | Mandatory | Immediate | `corporate_actions`, `database.ts` |
| **Security Master & ISIN Mapping** | NSE Security Master | Current & Historical | Daily | Mandatory | T+0 (08:00 IST) | `MasterTicker`, `database.ts` |

---

## 2. INDEX DATA DEPENDENCIES
| Index Dataset | Source Provider | Coverage | PIT Requirement | Downstream Consumers |
| --- | --- | --- | --- | --- |
| **Nifty 50 Index OHLC** | NSE Indices | 2011–2026 | Mandatory | Market Regime Filter, Sector Rotation, S1-S20 Benchmarking |
| **Nifty 500 Index OHLC** | NSE Indices | 2011–2026 | Mandatory | Universe Definition, Double Momentum Engine |
| **Sectoral Indices (Bank, IT, Auto, Pharma, FMCG, Metal)** | NSE Indices | 2011–2026 | Mandatory | Sector Rotation Engine, S14/S16 Strategy Engines |
| **Historical Index Constituents & Weights** | NSE Index Governance | 2011–2026 Point-in-Time | Mandatory | Survival-bias-free universe filtering |

---

## 3. FUTURES & OPTIONS (F&O) DATA DEPENDENCIES
| F&O Metric | Source Provider | PIT Requirement | Downstream Strategy Engine |
| --- | --- | --- | --- |
| **Open Interest (OI) & OI Change** | NSE Derivatives | Real-Time / EOD | S18 Derivatives Breakout, Signal Quality Overlay |
| **Put-Call Ratio (PCR) & Max Pain** | NSE Derivatives | Real-Time / EOD | Market Sentiment Overlay, Capital Protection Engine |
| **MWPL & Ban List Status** | NSE F&O Ban List | Daily Pre-Market | Exclusion Filter (Prevents illiquid order intents) |

---

## 4. FUNDAMENTAL DATA DEPENDENCIES
| Fundamental Dataset | Source Authority | Publication Evidence | Downstream Consumer |
| --- | --- | --- | --- |
| **Revenue, PAT, EBITDA, CFO** | Issuer Filings (BSE/NSE) | Regulatory Filing Date + Hash | QGLP Filter, FERE Strategy Engine, Valuation Snapshots |
| **ROCE, Balance Sheet Ratios** | Issuer Filings (BSE/NSE) | Regulatory Filing Date + Hash | Fundamental Filter, Valuation Snapshots |
| **Shareholding Pattern (Promoter/DII/FII)** | Issuer Filings (BSE/NSE) | Quarterly BSE Filings + Hash | S19 Institutional Accumulation Engine |
| **SAST & Insider Trading** | Regulatory Disclosure | Event-Driven + Hash | Governance Exclusion Overlay |

---

## 5. STRATEGY ENGINE MAP (S1–S20)
| Engine | Strategy Name | Core Data Inputs | Execution Boundary | Risk Engine Overlay |
| --- | --- | --- | --- | --- |
| `S1–S5` | Trend Following & Breakout | Daily OHLCV, 200 SMA, ATR | Daily EOD | `CapitalProtectionEngine` |
| `S6–S10` | Intraday & Swing Momentum | 15m Intraday Candles, VWAP | Real-Time | `CapitalProtectionEngine` |
| `S11–S15` | Sector Rotation & Relative Strength | Sector Index OHLC, Nifty 500 | Daily EOD | `CapitalProtectionEngine` |
| `S16–S20` | Fundamental & Derivatives Overlay | F&O OI, Shareholding, QGLP | Daily/Weekly | `CapitalProtectionEngine` |
