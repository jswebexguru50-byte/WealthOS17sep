# NRI WealthOS — Full-Universe Regime Ledger: 2,250-Row Backtest Matrix

## Part I: Institutional Diagnosis — Why You Saw ~100 Rows

---

### 1.1 Root Cause Taxonomy with Mathematical Proof

**The Survivorship Bias Problem:**

Let $\mathcal{U}$ = universe of 750 equities, $\mathcal{R}$ = {BULLISH, BEARISH, SIDEWAYS}, $\mathcal{S}$ = {S1, S2, S3}

The **required output cardinality** is:
$$|\mathcal{O}_{required}| = |\mathcal{U}| \times |\mathcal{R}| = 750 \times 3 = 2{,}250 \text{ rows}$$

The **previous engine produced**:
$$|\mathcal{O}_{actual}| = |\{(u, r, s) \in \mathcal{U} \times \mathcal{R} \times \mathcal{S} : \text{signal}(u,r,s) = \text{TRIGGERED}\}|$$

This is a **strict subset** — only triggered trades were materialized. The missing rows:
$$|\mathcal{O}_{missing}| = 2{,}250 - |\mathcal{O}_{actual}|$$

represent stocks with `NO_SETUP` or `INSUFFICIENT_DATA` — **silently dropped**, creating survivorship bias where the backtest appears to show only winning/active setups.

**The Three Failure Modes:**

| Root Cause | Mathematical Expression | Rows Lost |
|---|---|---|
| A: Signal-gate filter | `if (trade) push(trade)` → only $P(\text{signal}=1)$ rows | ~60-70% |
| B: SQL LIMIT clause | `LIMIT 100` hard cap | Caps at 100 regardless |
| C: Partial candle coverage | $\|H_i\| < \theta_{min}$ → scrip dropped | ~15-20% of SME |

---

## Part II: Mathematical Formulation of the Full-Matrix Ledger

### 2.1 Regime Definitions

$$\text{Regime}(t) = \begin{cases} \text{BULLISH\_2023\_2024} & t \in [2023\text{-}01\text{-}01,\ 2024\text{-}03\text{-}31] \\ \text{BEARISH\_2024\_2025} & t \in [2024\text{-}04\text{-}01,\ 2024\text{-}12\text{-}31] \\ \text{SIDEWAYS\_2025} & t \in [2025\text{-}01\text{-}01,\ 2025\text{-}06\text{-}30] \end{cases}$$

### 2.2 Strategy Signal Functions

**Strategy 1 — VPA Base Compaction & Breakout:**
$$\text{S1\_Signal}(i, r) = \begin{cases} \text{TRIGGERED} & \text{if } \exists\ t^* \in r : V_{t^*} > \mu_V \cdot \lambda_V \land C_{t^*} > \max(C_{t^*-n..t^*-1}) \\ \text{NO\_SETUP} & \text{if candles exist but conditions unmet} \\ \text{INSUFFICIENT\_DATA} & \text{if } |H_i \cap r| < \theta_{min} \end{cases}$$

where $\lambda_V = 1.5$ (volume multiplier), $\theta_{min} = 10$ candles minimum.

**Strategy 2 — Institutional Inflow + FVG 50% CE Retest:**
$$\text{S2\_Signal}(i, r) = \begin{cases} \text{TRIGGERED} & \text{if } \exists\ \text{FVG}_{t} \land \text{Price retest} \leq \text{FVG}_{50\%} \land \Delta\text{OI} > 0 \\ \text{NO\_SETUP} & \text{otherwise with data} \\ \text{INSUFFICIENT\_DATA} & \text{if } |H_i \cap r| < \theta_{min} \end{cases}$$

**Strategy 3 — Sequential HH/HL Momentum:**
$$\text{S3\_Signal}(i, r) = \begin{cases} \text{TRIGGERED} & \text{if } H_{t} > H_{t-1} \land L_{t} > L_{t-1}\ \forall\ t \in [t^*, t^*+3] \\ \text{NO\_SETUP} & \text{otherwise} \\ \text{INSUFFICIENT\_DATA} & \text{if } |H_i \cap r| < \theta_{min} \end{cases}$$

### 2.3 Trade Outcome Metrics

$$\text{Net\_Return}_{j}(i,r) = \begin{cases} \frac{T_j - E_j}{E_j} \times 100 & \text{if HIT\_TARGET} \\ \frac{SL_j - E_j}{E_j} \times 100 & \text{if STOP\_LOSS\_HIT} \\ \frac{X_j - E_j}{E_j} \times 100 & \text{if CLOSED\_PERIOD\_END} \\ 0 & \text{if N/A} \end{cases}$$

$$\text{Combined\_Signal\_Agreement}(i,r) = \sum_{j=1}^{3} \mathbf{1}[\text{S}j\text{\_Status}(i,r) = \text{TRIGGERED}]$$

$$\text{Best\_Performing\_Strategy}(i,r) = \arg\max_{j \in \{1,2,3\}} \text{Net\_Return}_j(i,r)$$

---

## Part III: Complete Production Code

### 3.1 Database Schema

```sql
-- ============================================================
-- FILE: migrations/001_full_universe_regime_ledger.sql
-- NRI WealthOS — Full 2,250-Row Backtest Schema
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Universe Master ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS universe_master (
    symbol          TEXT PRIMARY KEY,
    company_name    TEXT NOT NULL,
    tier            TEXT NOT NULL CHECK(tier IN ('NIFTY500','SME250')),
    isin            TEXT UNIQUE,
    sector          TEXT,
    market_cap_cr   REAL,
    listing_date    TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_universe_tier ON universe_master(tier);
CREATE INDEX IF NOT EXISTS idx_universe_active ON universe_master(is_active);

-- ── Regime Definitions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS regime_definitions (
    regime_id       TEXT PRIMARY KEY,
    regime_label    TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    regime_type     TEXT NOT NULL CHECK(regime_type IN ('BULLISH','BEARISH','SIDEWAYS')),
    nifty_return_pct REAL,
    description     TEXT
);

INSERT OR REPLACE INTO regime_definitions VALUES
    ('BULLISH_2023_2024', 'Bull Run 2023-2024', '2023-01-01', '2024-03-31', 'BULLISH',  28.5, 'Post-COVID recovery bull phase'),
    ('BEARISH_2024_2025', 'Correction 2024-2025','2024-04-01', '2024-12-31', 'BEARISH', -12.3, 'FII outflow correction phase'),
    ('SIDEWAYS_2025',     'Consolidation 2025',  '2025-01-01', '2025-06-30', 'SIDEWAYS',  2.1, 'Range-bound consolidation');

-- ── Historical Prices ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS historical_prices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL,
    trade_date      TEXT NOT NULL,
    open_price      REAL NOT NULL,
    high_price      REAL NOT NULL,
    low_price       REAL NOT NULL,
    close_price     REAL NOT NULL,
    volume          INTEGER NOT NULL,
    delivery_pct    REAL,
    vwap            REAL,
    FOREIGN KEY (symbol) REFERENCES universe_master(symbol),
    UNIQUE(symbol, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_hp_symbol_date ON historical_prices(symbol, trade_date);
CREATE INDEX IF NOT EXISTS idx_hp_date ON historical_prices(trade_date);

-- ── Core Backtest Ledger — THE 2,250-ROW MATRIX ──────────────
CREATE TABLE IF NOT EXISTS backtest_regime_ledger (
    -- Primary Key
    ledger_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Identity (3 rows per symbol)
    symbol              TEXT NOT NULL,
    company_name        TEXT NOT NULL,
    tier                TEXT NOT NULL,
    regime_id           TEXT NOT NULL,
    regime_type         TEXT NOT NULL,
    regime_start        TEXT NOT NULL,
    regime_end          TEXT NOT NULL,
    candle_count        INTEGER NOT NULL DEFAULT 0,
    data_quality_score  REAL NOT NULL DEFAULT 0.0,  -- 0.0 to 1.0

    -- ── Strategy 1: VPA Base Compaction & Breakout ────────────
    s1_status           TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA'
                            CHECK(s1_status IN ('TRIGGERED','NO_SETUP','INSUFFICIENT_DATA')),
    s1_signal_date      TEXT,
    s1_entry_price      REAL,
    s1_stop_loss        REAL,
    s1_target_price     REAL,
    s1_exit_price       REAL,
    s1_exit_date        TEXT,
    s1_trade_outcome    TEXT CHECK(s1_trade_outcome IN (
                            'HIT_TARGET','STOP_LOSS_HIT','CLOSED_PERIOD_END','N/A')),
    s1_net_return_pct   REAL NOT NULL DEFAULT 0.0,
    s1_reentries_count  INTEGER NOT NULL DEFAULT 0,
    s1_max_drawdown_pct REAL,
    s1_holding_days     INTEGER,
    s1_risk_reward      REAL,
    s1_volume_at_signal REAL,
    s1_volume_avg_20d   REAL,
    s1_compaction_bars  INTEGER,  -- number of low-vol base bars

    -- ── Strategy 2: Institutional Inflow + FVG 50% CE Retest ──
    s2_status           TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA'
                            CHECK(s2_status IN ('TRIGGERED','NO_SETUP','INSUFFICIENT_DATA')),
    s2_signal_date      TEXT,
    s2_entry_price      REAL,
    s2_stop_loss        REAL,
    s2_target_price     REAL,
    s2_exit_price       REAL,
    s2_exit_date        TEXT,
    s2_trade_outcome    TEXT CHECK(s2_trade_outcome IN (
                            'HIT_TARGET','STOP_LOSS_HIT','CLOSED_PERIOD_END','N/A')),
    s2_net_return_pct   REAL NOT NULL DEFAULT 0.0,
    s2_reentries_count  INTEGER NOT NULL DEFAULT 0,
    s2_max_drawdown_pct REAL,
    s2_holding_days     INTEGER,
    s2_risk_reward      REAL,
    s2_fvg_high         REAL,
    s2_fvg_low          REAL,
    s2_fvg_midpoint     REAL,
    s2_oi_change_pct    REAL,

    -- ── Strategy 3: Sequential HH/HL Momentum ─────────────────
    s3_status           TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA'
                            CHECK(s3_status IN ('TRIGGERED','NO_SETUP','INSUFFICIENT_DATA')),
    s3_signal_date      TEXT,
    s3_entry_price      REAL,
    s3_stop_loss        REAL,
    s3_target_price     REAL,
    s3_exit_price       REAL,
    s3_exit_date        TEXT,
    s3_trade_outcome    TEXT CHECK(s3_trade_outcome IN (
                            'HIT_TARGET','STOP_LOSS_HIT','CLOSED_PERIOD_END','N/A')),
    s3_net_return_pct   REAL NOT NULL DEFAULT 0.0,
    s3_reentries_count  INTEGER NOT NULL DEFAULT 0,
    s3_max_drawdown_pct REAL,
    s3_holding_days     INTEGER,
    s3_risk_reward      REAL,
    s3_hh_count         INTEGER,  -- consecutive HH count
    s3_hl_count         INTEGER,  -- consecutive HL count
    s3_momentum_score   REAL,

    -- ── Summary Columns ───────────────────────────────────────
    best_performing_strategy    TEXT CHECK(best_performing_strategy IN ('S1','S2','S3','NONE')),
    max_strategy_return_pct     REAL NOT NULL DEFAULT 0.0,
    combined_signal_agreement   TEXT NOT NULL DEFAULT '0/3',  -- '3/3','2/3','1/3','0/3'
    agreement_count             INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    computed_at         TEXT DEFAULT (datetime('now')),
    engine_version      TEXT DEFAULT '2.0.0',
    
    FOREIGN KEY (symbol) REFERENCES universe_master(symbol),
    FOREIGN KEY (regime_id) REFERENCES regime_definitions(regime_id),
    UNIQUE(symbol, regime_id)
);

CREATE INDEX IF NOT EXISTS idx_brl_symbol ON backtest_regime_ledger(symbol);
CREATE INDEX IF NOT EXISTS idx_brl_regime ON backtest_regime_ledger(regime_id);
CREATE INDEX IF NOT EXISTS idx_brl_tier ON backtest_regime_ledger(tier);
CREATE INDEX IF NOT EXISTS idx_brl_agreement ON backtest_regime_ledger(agreement_count DESC);
CREATE INDEX IF NOT EXISTS idx_brl_best_return ON backtest_regime_ledger(max_strategy_return_pct DESC);
CREATE INDEX IF NOT EXISTS idx_brl_s1_status ON backtest_regime_ledger(s1_status);
CREATE INDEX IF NOT EXISTS idx_brl_s2_status ON backtest_regime_ledger(s2_status);
CREATE INDEX IF NOT EXISTS idx_brl_s3_status ON backtest_regime_ledger(s3_status);

-- ── Validation View: Row Count Guard ─────────────────────────
CREATE VIEW IF NOT EXISTS v_ledger_completeness AS
SELECT
    COUNT(*)                                        AS total_rows,
    COUNT(*) = 2250                                 AS is_complete,
    COUNT(DISTINCT symbol)                          AS unique_symbols,
    COUNT(DISTINCT regime_id)                       AS unique_regimes,
    SUM(CASE WHEN tier='NIFTY500' THEN 1 ELSE 0 END) AS nifty500_rows,
    SUM(CASE WHEN tier='SME250'   THEN 1 ELSE 0 END) AS sme250_rows,
    SUM(CASE WHEN s1_status='TRIGGERED' THEN 1 ELSE 0 END) AS s1_triggered,
    SUM(CASE WHEN s2_status='TRIGGERED' THEN 1 ELSE 0 END) AS s2_triggered,
    SUM(CASE WHEN s3_status='TRIGGERED' THEN 1 ELSE 0 END) AS s3_triggered,
    SUM(CASE WHEN s1_status='NO_SETUP'  THEN 1 ELSE 0 END) AS s1_no_setup,
    SUM(CASE WHEN s1_status='INSUFFICIENT_DATA' THEN 1 ELSE 0 END) AS s1_insufficient,
    ROUND(AVG(max_strategy_return_pct), 4)          AS avg_best_return,
    ROUND(AVG(agreement_count), 4)                  AS avg_signal_agreement
FROM backtest_regime_ledger;

-- ── Regime Summary Pivot ──────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_regime_summary AS
SELECT
    regime_id,
    regime_type,
    COUNT(*)                                                    AS total_scrips,
    SUM(CASE WHEN s1_status='TRIGGERED' THEN 1 ELSE 0 END)     AS s1_triggered_count,
    SUM(CASE WHEN s2_status='TRIGGERED' THEN 1 ELSE 0 END)     AS s2_triggered_count,
    SUM(CASE WHEN s3_status='TRIGGERED' THEN 1 ELSE 0 END)     AS s3_triggered_count,
    ROUND(AVG(CASE WHEN s1_status='TRIGGERED' THEN s1_net_return_pct END), 4) AS s1_avg_return,
    ROUND(AVG(CASE WHEN s2_status='TRIGGERED' THEN s2_net_return_pct END), 4) AS s2_avg_return,
    ROUND(AVG(CASE WHEN s3_status='TRIGGERED' THEN s3_net_return_pct END), 4) AS s3_avg_return,
    SUM(CASE WHEN agreement_count=3 THEN 1 ELSE 0 END)         AS triple_confluence,
    SUM(CASE WHEN agreement_count=2 THEN 1 ELSE 0 END)         AS double_confluence,
    ROUND(AVG(max_strategy_return_pct), 4)                     AS avg_best_return
FROM backtest_regime_ledger
GROUP BY regime_id, regime_type;
```

---

### 3.2 Core Type Definitions

```typescript
// ============================================================
// FILE: src/types/backtest.types.ts
// NRI WealthOS — Full Backtest Type System
// ============================================================

export type RegimeId =
  | 'BULLISH_2023_2024'
  | 'BEARISH_2024_2025'
  | 'SIDEWAYS_2025';

export type RegimeType = 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
export type Tier = 'NIFTY500' | 'SME250';
export type SignalStatus = 'TRIGGERED' | 'NO_SETUP' | 'INSUFFICIENT_DATA';
export type TradeOutcome =
  | 'HIT_TARGET'
  | 'STOP_LOSS_HIT'
  | 'CLOSED_PERIOD_END'
  | 'N/A';
export type BestStrategy = 'S1' | 'S2' | 'S3' | 'NONE';
export type SignalAgreement = '3/3' | '2/3' | '1/3' | '0/3';

// ── Candle ───────────────────────────────────────────────────
export interface Candle {
  symbol: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  deliveryPct?: number;
  vwap?: number;
}

// ── Universe Entry ────────────────────────────────────────────
export interface UniverseEntry {
  symbol: string;
  companyName: string;
  tier: Tier;
  isin?: string;
  sector?: string;
  marketCapCr?: number;
  listingDate?: string;
}

// ── Regime Definition ─────────────────────────────────────────
export interface RegimeDefinition {
  regimeId: RegimeId;
  regimeLabel: string;
  startDate: string;
  endDate: string;
  regimeType: RegimeType;
  niftyReturnPct: number;
}

// ── Strategy Result ───────────────────────────────────────────
export interface StrategyResult {
  status: SignalStatus;
  signalDate?: string;
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  exitPrice?: number;
  exitDate?: string;
  tradeOutcome: TradeOutcome;
  netReturnPct: number;
  reEntriesCount: number;
  maxDrawdownPct?: number;
  holdingDays?: number;
  riskReward?: number;
  // Strategy-specific fields
  [key: string]: unknown;
}

// ── S1 Specific ───────────────────────────────────────────────
export interface S1Result extends StrategyResult {
  volumeAtSignal?: number;
  volumeAvg20d?: number;
  compactionBars?: number;
}

// ── S2 Specific ───────────────────────────────────────────────
export interface S2Result extends StrategyResult {
  fvgHigh?: number;
  fvgLow?: number;
  fvgMidpoint?: number;
  oiChangePct?: number;
}

// ── S3 Specific ───────────────────────────────────────────────
export interface S3Result extends StrategyResult {
  hhCount?: number;
  hlCount?: number;
  momentumScore?: number;
}

// ── Full Ledger Row — THE ATOMIC UNIT ─────────────────────────
export interface LedgerRow {
  // Identity
  symbol: string;
  companyName: string;
  tier: Tier;
  regimeId: RegimeId;
  regimeType: RegimeType;
  regimeStart: string;
  regimeEnd: string;
  candleCount: number;
  dataQualityScore: number;

  // Strategy Results
  s1: S1Result;
  s2: S2Result;
  s3: S3Result;

  // Summary
  bestPerformingStrategy: BestStrategy;
  maxStrategyReturnPct: number;
  combinedSignalAgreement: SignalAgreement;
  agreementCount: number;

  // Metadata
  computedAt: string;
  engineVersion: string;
}

// ── Backtest Run Config ───────────────────────────────────────
export interface BacktestConfig {
  minCandleThreshold: number;       // θ_min = 10
  volumeMultiplier: number;         // λ_V = 1.5
  volumeLookbackDays: number;       // 20
  hhhlSequenceLength: number;       // 3 consecutive
  fvgRetestTolerance: number;       // 0.5% tolerance
  compactionMaxVolRatio: number;    // 0.7 (70% of avg = compaction)
  compactionMinBars: number;        // 5 bars minimum
  stopLossAtrMultiplier: number;    // 1.5x ATR
  targetRiskRewardRatio: number;    // 2.0 R:R
  maxHoldingDays: number;           // 45 days
  awsBedrock: {
    region: string;
    modelId: string;
  };
}

export const DEFAULT_CONFIG: BacktestConfig = {
  minCandleThreshold: 10,
  volumeMultiplier: 1.5,
  volumeLookbackDays: 20,
  hhhlSequenceLength: 3,
  fvgRetestTolerance: 0.005,
  compactionMaxVolRatio: 0.7,
  compactionMinBars: 5,
  stopLossAtrMultiplier: 1.5,
  targetRiskRewardRatio: 2.0,
  maxHoldingDays: 45,
  awsBedrock: {
    region: 'ap-south-1',
    modelId: 'anthropic.claude-sonnet-4-5',
  },
};

// ── Validation Result ─────────────────────────────────────────
export interface MatrixValidationResult {
  totalRows: number;
  isComplete: boolean;
  uniqueSymbols: number;
  uniqueRegimes: number;
  nifty500Rows: number;
  sme250Rows: number;
  missingSymbols: string[];
  missingRegimes: string[];
  rowCountByRegime: Record<RegimeId, number>;
  errors: string[];
}
```

---

### 3.3 Strategy Engine

```typescript
// ============================================================
// FILE: src/engine/strategy-engine.ts
// NRI WealthOS — Three-Strategy Backtest Engine
// ============================================================

import {
  Candle,
  S1Result,
  S2Result,
  S3Result,
  SignalStatus,
  TradeOutcome,
  BacktestConfig,
  DEFAULT_CONFIG,
} from '../types/backtest.types';

// ── Mathematical Utilities ────────────────────────────────────
export class MathUtils {
  /**
   * ATR(n) = (1/n) Σ TR_i
   * TR_i = max(H-L, |H-C_{i-1}|, |L-C_{i-1}|)
   */
  static atr(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) return 0;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      trs.push(Math.max(hl, hc, lc));
    }
    const slice = trs.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  /**
   * Simple Moving Average
   */
  static sma(values: number[], period: number): number {
    const slice = values.slice(-period);
    if (slice.length === 0) return 0;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  /**
   * Volume SMA over lookback
   */
  static volumeSma(candles: Candle[], lookback: number): number {
    const vols = candles.slice(-lookback).map((c) => c.volume);
    return this.sma(vols, vols.length);
  }

  /**
   * Net return percentage
   * R = (exit - entry) / entry × 100
   */
  static netReturn(entry: number, exit: number): number {
    if (entry === 0) return 0;
    return ((exit - entry) / entry) * 100;
  }

  /**
   * Risk:Reward ratio
   * RR = (target - entry) / (entry - stopLoss)
   */
  static riskReward(entry: number, target: number, stopLoss: number): number {
    const risk = entry - stopLoss;
    if (risk <= 0) return 0;
    return (target - entry) / risk;
  }

  /**
   * Maximum drawdown from peak within candle window
   */
  static maxDrawdown(candles: Candle[], entryPrice: number): number {
    let peak = entryPrice;
    let maxDD = 0;
    for (const c of candles) {
      if (c.high > peak) peak = c.high;
      const dd = ((peak - c.low) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  /**
   * Data quality score: ratio of actual candles to expected trading days
   */
  static dataQualityScore(
    actualCandles: number,
    startDate: string,
    endDate: string
  ): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const calendarDays =
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    // Approximate trading days = calendar days × (5/7) × 0.95 (holidays)
    const expectedTradingDays = Math.floor(calendarDays * (5 / 7) * 0.95);
    if (expectedTradingDays === 0) return 0;
    return Math.min(1.0, actualCandles / expectedTradingDays);
  }
}

// ── Trade Simulator ───────────────────────────────────────────
export class TradeSimulator {
  /**
   * Simulate trade forward from signal date
   * Returns exit price, date, outcome
   */
  static simulate(
    candles: Candle[],
    signalIdx: number,
    entryPrice: number,
    stopLoss: number,
    targetPrice: number,
    maxHoldingDays: number
  ): {
    exitPrice: number;
    exitDate: string;
    outcome: TradeOutcome;
    holdingDays: number;
    maxDrawdownPct: number;
  } {
    const forwardCandles = candles.slice(
      signalIdx + 1,
      signalIdx + 1 + maxHoldingDays
    );

    let maxDD = 0;
    let peak = entryPrice;

    for (let i = 0; i < forwardCandles.length; i++) {
      const c = forwardCandles[i];

      // Track drawdown
      if (c.high > peak) peak = c.high;
      const dd = ((peak - c.low) / peak) * 100;
      if (dd > maxDD) maxDD = dd;

      // Check stop loss (intraday low)
      if (c.low <= stopLoss) {
        return {
          exitPrice: stopLoss,
          exitDate: c.tradeDate,
          outcome: 'STOP_LOSS_HIT',
          holdingDays: i + 1,
          maxDrawdownPct: maxDD,
        };
      }

      // Check target (intraday high)
      if (c.high >= targetPrice) {
        return {
          exitPrice: targetPrice,
          exitDate: c.tradeDate,
          outcome: 'HIT_TARGET',
          holdingDays: i + 1,
          maxDrawdownPct: maxDD,
        };
      }
    }

    // Period end — close at last available close
    const lastCandle = forwardCandles[forwardCandles.length - 1];
    if (!lastCandle) {
      return {
        exitPrice: entryPrice,
        