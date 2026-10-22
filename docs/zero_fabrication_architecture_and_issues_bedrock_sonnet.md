# ZERO-FABRICATION ARCHITECTURE (ZFA) & GROUND-UP REWRITE SPECIFICATION
## Autonomous Wealth Operating System, Transparent Backtesting & Quantitative Signal Platform

**Ratification Date:** September 8, 2026  
**Authoritative Engine:** AWS Bedrock Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`)  
**Mandate:** Zero-Fabrication, Absolute Falsifiability, Institutional Quantitative Rigor & Statutory Compliance  
**Scope:** Complete issues audit, fundamental architectural redesign, data contracts, and implementation blueprints.

---



# Part 1: Exhaustive Codebase Audit — Fabrications, Synthetic Seeds, Lookahead Biases & Math Flaws

# FORENSIC AUDIT REPORT: NRI WealthOS Opportunity Engine & Backtesting Subsystem

## CLASSIFICATION: CRITICAL — SYSTEMIC DATA FABRICATION & REGULATORY VIOLATION

**Audit Reference:** WOS-AUDIT-2025-001
**Auditor Role:** Chief Risk Officer / Principal Financial Systems Architect
**Scope:** Complete forensic examination of 6 core subsystems
**Regulatory Framework:** SEBI (Research Analyst) Regulations 2014, SEBI Circular SEBI/HO/MIRSD/MIRSD-PoD-1/P/CIR/2024/113, FEMA 1999, Income Tax Act 1961 (NRI provisions)

---

## EXECUTIVE SUMMARY OF FINDINGS

This codebase contains **systemic, deliberate data fabrication** that constitutes:
1. **Fraudulent performance representation** under SEBI RA Regulations Section 15
2. **Misleading advertisement** under SEBI (Prohibition of Fraudulent and Unfair Trade Practices) Regulations 2003
3. **Statistical malpractice** rendering all backtested metrics mathematically meaningless
4. **Lookahead bias** that inflates strategy returns by an estimated 15–40% absolute
5. **Survivorship bias** that inflates universe returns by an estimated 20–60% absolute

**Total fabricated accuracy inflation estimate: 83% displayed vs. ~45–52% statistically defensible baseline for momentum strategies on NSE.**

---

## PART I: EXHAUSTIVE ITEMIZED FINDINGS

---

### MODULE 1: `PredictionAccuracyEngine.ts`

#### FINDING PAE-001 [CRITICAL]: Synthetic Seed Data Presented as Historical Performance

**Exact Fabrication:**
```typescript
// FABRICATED — these trades never occurred in any real portfolio
const SEEDED_HISTORICAL_WINS = [
  { symbol: 'BEL',   entryDate: '2024-01-15', exitDate: '2024-02-28', returnPct: +20.00 },
  { symbol: 'HAL',   entryDate: '2024-02-01', exitDate: '2024-03-15', returnPct: +15.18 },
  { symbol: 'TRENT', entryDate: '2024-03-01', exitDate: '2024-04-10', returnPct: +16.72 },
  // ... 5 additional fabricated wins
];
```

**Mathematical Damage:**

The displayed accuracy metric is:

$$\text{Accuracy}_{\text{displayed}} = \frac{N_{\text{seeded\_wins}} + N_{\text{real\_wins}}}{N_{\text{seeded}} + N_{\text{real}}} = \frac{8 + 0}{8 + 0} = 1.00 \rightarrow \text{clamped to } 0.83$$

For a new user with zero real trades, the denominator is entirely fabricated. The true accuracy is **undefined** (0/0), not 83%.

The correct formulation requires:

$$\text{Accuracy}_{\text{true}} = \frac{\sum_{i=1}^{N_{\text{real}}} \mathbf{1}[\hat{y}_i = y_i]}{N_{\text{real}}} \quad \text{where } N_{\text{real}} \geq 30 \text{ (minimum statistical threshold)}$$

With $N_{\text{real}} = 0$, no accuracy figure may be displayed. Period.

**Brier Score Contamination:**

The Brier Score is computed as:

$$BS = \frac{1}{N} \sum_{i=1}^{N} (f_i - o_i)^2$$

Where $f_i$ is the predicted probability and $o_i \in \{0,1\}$ is the actual outcome. When all $N = 8$ observations are fabricated wins ($o_i = 1$ for all $i$) with artificially high $f_i$ (e.g., 0.85), the result is:

$$BS_{\text{fake}} = \frac{1}{8} \sum_{i=1}^{8} (0.85 - 1.0)^2 = \frac{8 \times 0.0225}{8} = 0.0225$$

This is an **excellent** Brier Score (lower is better, perfect = 0, random = 0.25). It is entirely fabricated. A real system with no calibration history would have $BS \approx 0.20$–$0.25$.

**Log-Loss Contamination:**

$$\mathcal{L}_{\text{log}} = -\frac{1}{N} \sum_{i=1}^{N} \left[ o_i \log(f_i) + (1-o_i)\log(1-f_i) \right]$$

With fabricated $o_i = 1$, $f_i = 0.85$:

$$\mathcal{L}_{\text{log,fake}} = -\log(0.85) \approx 0.163$$

Excellent log-loss. Real uncalibrated system: $\mathcal{L}_{\text{log}} \approx 0.55$–$0.70$.

**Regulatory Violation:** SEBI RA Regulation 23(1): "A research analyst shall not make any statement which is false or misleading or which is likely to mislead or confuse the clients."

**Remediation Requirement PAE-001:**
- Delete all `SEEDED_HISTORICAL_WINS` arrays immediately
- Implement cold-start state machine (see Part II)
- Display "Insufficient data — accuracy metrics available after 30 closed recommendations" until $N_{\text{real}} \geq 30$
- Store all predictions with timestamps in append-only audit log before outcome is known

---

#### FINDING PAE-002 [CRITICAL]: Accuracy Metric Computed Without Confidence Interval

Even if real data existed, displaying a point estimate of 83% without a confidence interval is statistically fraudulent for small samples.

**Mathematical Requirement:**

For $N$ trials with $k$ successes, the Wilson score interval is:

$$\left[\frac{\hat{p} + \frac{z^2}{2N} \pm z\sqrt{\frac{\hat{p}(1-\hat{p})}{N} + \frac{z^2}{4N^2}}}{1 + \frac{z^2}{N}}\right]$$

Where $z = 1.96$ for 95% confidence. For $N=8$, $k=8$ (all wins):

$$\hat{p} = 1.0, \quad \text{Wilson CI}_{95\%} = [0.631, 1.000]$$

The lower bound is **63.1%**, not 83%. Displaying 83% without this interval is misleading.

For $N=30$, $k=25$ ($\hat{p} = 0.833$):

$$\text{Wilson CI}_{95\%} = [0.655, 0.934]$$

**Remediation:** Always display `[lower_bound, point_estimate, upper_bound]` with sample size.

---

#### FINDING PAE-003 [HIGH]: No Separation Between In-Sample and Out-of-Sample Accuracy

The engine computes accuracy on the same data used to tune signal thresholds. This is **in-sample overfitting**.

**Mathematical Damage:**

Let $\theta^*$ be parameters optimized on dataset $\mathcal{D}$:

$$\theta^* = \arg\max_\theta \text{Accuracy}(\theta, \mathcal{D})$$

Then $\text{Accuracy}(\theta^*, \mathcal{D}) \geq \text{Accuracy}(\theta^*, \mathcal{D}_{\text{OOS}})$ almost surely.

The overfitting gap for small $N$ can be 15–25 percentage points.

**Remediation:** Implement walk-forward validation with minimum 6-month out-of-sample holdout. Never report in-sample accuracy to users.

---

### MODULE 2: `RecommendationOutcomeAuditor.ts`

#### FINDING ROA-001 [CRITICAL]: Hardcoded Fallback Metrics Are Fabricated Performance Claims

**Exact Fabrication:**
```typescript
function getFallbackMetrics(): AuditMetrics {
  return {
    winRate:        0.769,   // 76.9% — FABRICATED
    profitFactor:   3.85,    // FABRICATED
    sharpeRatio:    2.15,    // FABRICATED
    realizedPnL:    0.248,   // 24.8% — FABRICATED
    totalCalls:     0,
    closedCalls:    0,
  };
}
```

**Mathematical Damage — Win Rate:**

A 76.9% win rate for equity momentum strategies on NSE is in the **top 1% of all documented systematic strategies globally**. Academic literature (Jegadeesh & Titman 1993, Rouwenhorst 1998) documents momentum win rates of 55–62% before costs. The fabricated 76.9% is:

$$\Delta_{\text{win\_rate}} = 0.769 - 0.580 = +18.9\% \text{ absolute fabrication}$$

**Mathematical Damage — Profit Factor:**

Profit Factor is defined as:

$$PF = \frac{\sum_{i: r_i > 0} r_i}{\left|\sum_{i: r_i < 0} r_i\right|}$$

A PF of 3.85 implies that for every ₹1 lost, ₹3.85 is gained. This is **exceptional** — hedge funds with PF > 2.0 are considered elite. The fabricated 3.85 is implausible for a retail-facing recommendation engine.

For a win rate $w = 0.769$ and average win/loss ratio $\rho$:

$$PF = \frac{w \cdot \rho}{(1-w)} \implies \rho = \frac{PF \cdot (1-w)}{w} = \frac{3.85 \times 0.231}{0.769} = 1.157$$

This claims average wins are only 15.7% larger than average losses — which is internally inconsistent with the claimed 24.8% PnL unless position sizing is non-uniform. The numbers are not self-consistent, confirming fabrication.

**Mathematical Damage — Sharpe Ratio:**

$$SR = \frac{\bar{r} - r_f}{\sigma_r}$$

A Sharpe of 2.15 annualized is **world-class** (Medallion Fund: ~2.0–2.5, but with $10B+ in infrastructure). For a retail recommendation engine, a defensible Sharpe is 0.4–0.8. The fabricated 2.15 represents:

$$\Delta_{SR} = 2.15 - 0.60 = +1.55 \text{ Sharpe units of fabrication}$$

**Mathematical Damage — Zero-Call Override:**
```typescript
if (closedCalls === 0) {
  return { ...getFallbackMetrics(), winRate: 0.685 };
}
```

This is a **second fabrication layer**: when there are literally zero closed calls, the system displays 68.5% win rate. This is the definition of fraudulent performance representation.

**Regulatory Violation:** SEBI PFUTP Regulations 2003, Regulation 4(2)(k): "Disseminating information or advice through any media, whether physical or digital, which the disseminator knows to be false or misleading."

**Remediation Requirement ROA-001:**
- Delete `getFallbackMetrics()` entirely
- Replace with explicit null state: `{ status: 'NO_DATA', message: 'Performance metrics unavailable — no closed recommendations' }`
- Implement the audit schema defined in Part II
- All metrics must be computed from real closed trades only

---

#### FINDING ROA-002 [CRITICAL]: Sharpe Ratio Annualization Is Incorrect

---



# Part 2: Ground-Up Zero-Fabrication Architecture (ZFA) — System Topology, Core Principles & Data Contracts

# WealthOS Zero-Fabrication Architecture (ZFA) — Complete System Specification

## Preamble: Architectural Philosophy

This document constitutes the authoritative technical specification for WealthOS v3.0 under the Zero-Fabrication Architecture paradigm. Every design decision flows from a single axiom:

> **The system must be incapable of producing a number it cannot prove.**

Fabrication is not merely a software bug — it is an epistemic crime against users who make real financial decisions. The architecture below makes fabrication structurally impossible, not merely discouraged.

---

# PART I: CORE INVIOLABLE PRINCIPLES

## Principle 1: Falsifiability & Strict Nullability

### Formal Statement

For any computed quantity Q with associated confidence interval [L, U] and sample size n:

```
Q is DISPLAYABLE if and only if:
  (1) n ≥ n_min(Q)          -- statistical minimum satisfied
  (2) p_value(Q) < α(Q)     -- significance threshold met
  (3) data_completeness ≥ δ -- no gaps exceeding tolerance
  (4) audit_hash verified    -- cryptographic provenance intact

Otherwise: Q := NULL, displayed as "N/A — insufficient data"
```

### Statistical Minimums Table

```
┌─────────────────────────────────┬──────────┬───────────┬──────────────────────────────────┐
│ Metric                          │ n_min    │ α         │ Rationale                        │
├─────────────────────────────────┼──────────┼───────────┼──────────────────────────────────┤
│ Annualized Return               │ 252      │ 0.10      │ 1 full trading year              │
│ Sharpe Ratio                    │ 252      │ 0.05      │ Lo (2002) minimum variance       │
│ Sortino Ratio                   │ 252      │ 0.05      │ Same as Sharpe                   │
│ Maximum Drawdown                │ 63       │ N/A       │ 1 quarter minimum                │
│ Beta                            │ 60       │ 0.05      │ OLS minimum degrees of freedom   │
│ Alpha (Jensen's)                │ 252      │ 0.05      │ Requires full market cycle       │
│ Information Ratio               │ 252      │ 0.05      │ Requires benchmark comparison    │
│ Calmar Ratio                    │ 756      │ 0.05      │ 3-year minimum (drawdown cycle)  │
│ Win Rate                        │ 30       │ 0.10      │ Binomial CLT approximation       │
│ Profit Factor                   │ 30       │ 0.10      │ Minimum trade count              │
│ Correlation (Pearson)           │ 30       │ 0.05      │ t-distribution df=n-2            │
│ Correlation (Spearman)          │ 30       │ 0.05      │ Same                             │
│ VaR (Historical)                │ 504      │ N/A       │ 2 years for 99th percentile      │
│ CVaR / Expected Shortfall       │ 504      │ N/A       │ Tail stability requirement       │
│ Brier Score                     │ 100      │ N/A       │ Calibration minimum              │
│ Factor Loading                  │ 252      │ 0.05      │ Fama-French minimum              │
│ Hurst Exponent                  │ 512      │ 0.10      │ R/S analysis minimum             │
│ Covariance Matrix (d assets)    │ 5d       │ N/A       │ Ledoit-Wolf requirement          │
└─────────────────────────────────┴──────────┴───────────┴──────────────────────────────────┘
```

### Nullability Enforcement — Python Type Contract

```python
from __future__ import annotations
from decimal import Decimal, ROUND_HALF_EVEN
from typing import Optional, TypeVar, Generic, Callable
from dataclasses import dataclass, field
from enum import Enum, auto
import hashlib
import json

T = TypeVar('T')

class NullReason(Enum):
    INSUFFICIENT_OBSERVATIONS = auto()
    SIGNIFICANCE_NOT_MET = auto()
    DATA_GAPS_EXCEED_TOLERANCE = auto()
    AUDIT_HASH_MISMATCH = auto()
    LOOKAHEAD_CONTAMINATION_DETECTED = auto()
    CORPORATE_ACTION_UNADJUSTED = auto()
    EXECUTION_MODEL_UNAVAILABLE = auto()
    CALIBRATION_WINDOW_INCOMPLETE = auto()

@dataclass(frozen=True)
class Provable(Generic[T]):
    """
    A value that either exists with full provenance or is explicitly null.
    There is no third state. Fabrication is a type error.
    """
    value: Optional[T]
    null_reason: Optional[NullReason]
    n_observations: int
    computation_timestamp_utc: int  # Unix nanoseconds
    input_data_hash: str            # SHA-256 of all input data
    formula_version: str            # Semantic version of computation code
    
    def __post_init__(self):
        # Invariant: exactly one of (value, null_reason) must be set
        if (self.value is None) == (self.null_reason is None):
            raise ValueError(
                "Provable must have exactly one of value or null_reason. "
                "This is a type-level enforcement of Zero-Fabrication."
            )
    
    @classmethod
    def of(cls, value: T, n: int, ts: int, 
           data_hash: str, formula_ver: str) -> 'Provable[T]':
        return cls(
            value=value,
            null_reason=None,
            n_observations=n,
            computation_timestamp_utc=ts,
            input_data_hash=data_hash,
            formula_version=formula_ver
        )
    
    @classmethod
    def null(cls, reason: NullReason, n: int, ts: int,
             data_hash: str, formula_ver: str) -> 'Provable[T]':
        return cls(
            value=None,
            null_reason=reason,
            n_observations=n,
            computation_timestamp_utc=ts,
            input_data_hash=data_hash,
            formula_version=formula_ver
        )
    
    def map(self, f: Callable[[T], T]) -> 'Provable[T]':
        """Functor map — null propagates, never silently becomes a value."""
        if self.value is None:
            return self
        return Provable.of(
            f(self.value), self.n_observations,
            self.computation_timestamp_utc,
            self.input_data_hash, self.formula_version
        )
    
    def display(self) -> str:
        if self.value is None:
            return f"N/A ({self.null_reason.name})"
        return str(self.value)
```

---

## Principle 2: Point-in-Time (PIT) Temporal Isolation

### Formal Definition

Let `T_signal` be the timestamp at which a signal is generated.
Let `D(t)` be the data universe available at time `t`.

**PIT Invariant:**
```
∀ signal s generated at T_signal:
  inputs(s) ⊆ D(T_signal - ε)
  
where ε > 0 is the minimum causal delay (≥ 1 trading session for daily data)
```

### Temporal Contamination Taxonomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CONTAMINATION TYPE          │ MECHANISM              │ ZFA PREVENTION         │
├──────────────────────────────────────────────────────────────────────────────┤
│ Direct Lookahead            │ Using T+1 close to     │ Strict as-of-date      │
│                             │ generate T signal      │ query enforcement      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Survivorship Bias           │ Universe contains only │ PIT universe snapshots │
│                             │ survivors at T_backtest│ with delisting records │
├──────────────────────────────────────────────────────────────────────────────┤
│ Hindsight Corporate Actions │ Applying split factors │ Unadjusted PIT prices  │
│                             │ known only after event │ + forward-only adj.    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Index Reconstitution Bias   │ Using current index    │ Historical constituent │
│                             │ composition for past   │ snapshots required     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Earnings Announcement Bias  │ Using reported EPS     │ Original filing date   │
│                             │ before filing date     │ + revision history     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Analyst Revision Bias       │ Using revised estimates│ Point-in-time estimate │
│                             │ retroactively          │ snapshots              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Parameter Snooping          │ Optimizing params on   │ CPCV + OOS holdout     │
│                             │ full history           │ enforced by engine     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Volatility Regime Leakage   │ Using full-sample vol  │ Expanding window only  │
│                             │ for early-period sizing│ from T_start           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### PIT Query Enforcement — Database Layer

```sql
-- Every data access MUST go through this view, never the raw table
-- The as_of_timestamp parameter is MANDATORY — no default allowed

CREATE OR REPLACE FUNCTION get_pit_price(
    p_symbol        TEXT,
    p_as_of_date    DATE,        -- The date for which we want data
    p_knowledge_date DATE        -- The date we "know" this data (≤ p_as_of_date)
) RETURNS TABLE (
    symbol              TEXT,
    trade_date          DATE,
    open_unadjusted     NUMERIC(20,6),
    high_unadjusted     NUMERIC(20,6),
    low_unadjusted      NUMERIC(20,6),
    close_unadjusted    NUMERIC(20,6),
    volume              BIGINT,
    adj_factor_cumulative NUMERIC(20,10),
    data_vendor_id      INTEGER,
    ingestion_timestamp TIMESTAMPTZ
) AS $$
BEGIN
    -- CRITICAL: p_knowledge_date must be ≤ p_as_of_date
    -- This prevents any future-knowledge contamination
    IF p_knowledge_date > p_as_of_date THEN
        RAISE EXCEPTION 
            'PIT VIOLATION: knowledge_date % > as_of_date %. '
            'This query would introduce lookahead bias.',
            p_knowledge_date, p_as_of_date;
    END IF;
    
    RETURN QUERY
    SELECT 
        ms.symbol,
        ms.trade_date,
        ms.open_unadjusted,
        ms.high_unadjusted,
        ms.

---



# Part 3: Institutional Backtesting & Walk-Forward Cross-Validation Engine Specification

# WealthOS Backtesting & Cross-Validation Engine
## Complete Mathematical Specification v1.0

---

# PART I: WALK-FORWARD & COMBINATORIAL PURGED CROSS-VALIDATION

## 1.1 Formal Problem Statement

Let $\mathcal{D} = \{(x_t, y_t)\}_{t=1}^{T}$ be a time-ordered dataset of feature-label pairs where:
- $x_t \in \mathbb{R}^d$ is the feature vector at time $t$
- $y_t \in \mathbb{R}$ is the forward return label
- Labels are constructed over horizon $h$: $y_t = \frac{P_{t+h} - P_t}{P_t}$

**Core Problem**: Standard k-fold cross-validation is invalid for financial time series because:
1. Future information leaks into training sets (look-ahead bias)
2. Overlapping label horizons create serial correlation between train/test splits
3. Embargo violations allow near-future information to contaminate training

---

## 1.2 Walk-Forward Evaluation Protocol

### 1.2.1 Rolling Window (Fixed-Size Training)

**Definition**: At each fold $k$, the training window has fixed size $W_{train}$ observations.

$$\text{Train}_k = [t_k - W_{train}, t_k - 1], \quad \text{Test}_k = [t_k, t_k + W_{test} - 1]$$

**Formal Split Generator**:

```
ALGORITHM: RollingWindowSplits
INPUT:
    T          : total number of bars
    W_train    : training window size (bars)
    W_test     : test window size (bars)
    step       : step size between folds (bars), default = W_test
    
OUTPUT:
    splits : List of (train_indices, test_indices) tuples

PROCEDURE:
    splits ← []
    t_start ← W_train
    
    WHILE t_start + W_test <= T:
        train_start ← t_start - W_train
        train_end   ← t_start - 1
        test_start  ← t_start
        test_end    ← t_start + W_test - 1
        
        train_indices ← [train_start, train_start+1, ..., train_end]
        test_indices  ← [test_start,  test_start+1,  ..., test_end]
        
        splits.append((train_indices, test_indices))
        t_start ← t_start + step
    
    RETURN splits
```

**Invariant**: $\forall k$: $\max(\text{Train}_k) < \min(\text{Test}_k)$

### 1.2.2 Expanding Window (Anchored Training)

**Definition**: Training set grows with each fold; origin is fixed at $t=1$.

$$\text{Train}_k = [1, t_k - 1], \quad \text{Test}_k = [t_k, t_k + W_{test} - 1]$$

```
ALGORITHM: ExpandingWindowSplits
INPUT:
    T          : total number of bars
    W_train_min: minimum initial training window
    W_test     : test window size (bars)
    step       : step size between folds

OUTPUT:
    splits : List of (train_indices, test_indices) tuples

PROCEDURE:
    splits ← []
    t_start ← W_train_min
    
    WHILE t_start + W_test <= T:
        train_indices ← [0, 1, ..., t_start - 1]
        test_start    ← t_start
        test_end      ← t_start + W_test - 1
        test_indices  ← [test_start, ..., test_end]
        
        splits.append((train_indices, test_indices))
        t_start ← t_start + step
    
    RETURN splits
```

**Selection Criterion**:
- Use **Rolling** when regime stationarity is assumed (mean-reversion strategies)
- Use **Expanding** when cumulative learning is beneficial (trend-following, factor models)
- **Default for WealthOS**: Rolling with $W_{train} = 252 \times 2$ trading days, $W_{test} = 63$ trading days (one quarter), $\text{step} = 21$ trading days

---

## 1.3 Purging Algorithm (de Prado Methodology)

### 1.3.1 Label Overlap Problem

When label $y_t$ is computed over horizon $h$, the label at time $t$ uses prices $[P_t, P_{t+h}]$. If a training observation at time $t'$ has $t' < t_{test\_start}$ but $t' + h > t_{test\_start}$, then the training label **overlaps** with the test period.

**Formal Overlap Condition**:

$$\text{Overlap}(t', t_{test}) = \mathbf{1}[t' + h > t_{test}]$$

### 1.3.2 Purging Algorithm

```
ALGORITHM: PurgeTrainingSet
INPUT:
    train_indices  : array of training bar indices
    test_start     : first bar index of test set
    label_horizon  : h (bars forward used to construct label)
    
OUTPUT:
    purged_train   : training indices with overlapping labels removed

PROCEDURE:
    purged_train ← []
    
    FOR EACH t IN train_indices:
        label_end_bar ← t + label_horizon
        
        IF label_end_bar < test_start:
            // Label does not touch test period
            purged_train.append(t)
        ELSE:
            // Label overlaps test period — PURGE this observation
            DISCARD t
    
    RETURN purged_train
```

**Mathematical Guarantee**: After purging, $\forall t \in \text{purged\_train}$:
$$t + h < t_{test\_start}$$

### 1.3.3 Embargo Algorithm

Even after purging, serial correlation in features (e.g., moving averages computed over $W_{ma}$ bars) means that training observations immediately before the test set may share feature information with early test observations.

**Embargo Period**: $e = \lceil \rho \cdot h \rceil$ bars, where $\rho \in [0.01, 0.10]$ is the embargo fraction (default $\rho = 0.01$).

```
ALGORITHM: EmbargoTrainingSet
INPUT:
    purged_train   : already-purged training indices
    test_start     : first bar index of test set
    embargo_bars   : e (number of bars to embargo before test_start)
    
OUTPUT:
    embargoed_train : training indices after embargo removal

PROCEDURE:
    embargo_boundary ← test_start - embargo_bars
    embargoed_train  ← []
    
    FOR EACH t IN purged_train:
        IF t < embargo_boundary:
            embargoed_train.append(t)
        ELSE:
            // Within embargo zone — DISCARD
            DISCARD t
    
    RETURN embargoed_train
```

**Combined Purge + Embargo**:

```
FUNCTION GetCleanTrainIndices(train_indices, test_start, h, e):
    step1 ← PurgeTrainingSet(train_indices, test_start, h)
    step2 ← EmbargoTrainingSet(step1, test_start, e)
    RETURN step2
```

---

## 1.4 Combinatorial Purged Cross-Validation (CPCV)

### 1.4.1 Motivation

Standard walk-forward produces only **one** backtest path. CPCV generates $\binom{N}{k}$ paths, enabling:
- Distribution of Sharpe ratios across paths (not a single point estimate)
- Probability of backtest overfitting (PBO) computation
- Deflated Sharpe Ratio calculation

### 1.4.2 CPCV Formal Construction

**Parameters**:
- $N$ = number of total groups (splits of the full dataset)
- $k$ = number of test groups per combination (typically $k=2$)
- Total combinations: $\binom{N}{k}$

```
ALGORITHM: CPCVSplits
INPUT:
    T              : total bars
    N              : number of groups
    k              : test groups per combination
    h              : label horizon (for purging)
    e              : embargo bars
    
OUTPUT:
    all_splits     : List of (train_indices, test_indices) for each combination

PROCEDURE:
    // Step 1: Partition T bars into N equal groups
    group_size ← floor(T / N)
    groups ← []
    FOR i IN [0, N-1]:
        start ← i * group_size
        end   ← (i+1) * group_size - 1  // last group absorbs remainder
        IF i == N-1: end ← T - 1
        groups.append(range(start, end+1))
    
    // Step 2: Generate all C(N,k) combinations of test groups
    all_splits ← []
    FOR EACH test_combo IN Combinations(range(N), k):
        test_groups  ← [groups[i] for i in test_combo]
        train_groups ← [groups[i] for i in range(N) if i NOT IN test_combo]
        
        test_indices  ← flatten(test_groups)   // sorted
        train_indices ← flatten(train_groups)  // sorted
        
        // Step 3: Apply purge and embargo for each contiguous test block
        clean_train ← train_indices
        FOR EACH test_block IN GetContiguousBlocks(test_indices):
            test_block_start ← min(test_block)
            clean_train ← GetCleanTrainIndices(
                clean_train, test_block_start, h, e
            )
        
        all_splits.append((clean_train, test_indices))
    
    RETURN all_splits

FUNCTION GetContiguousBlocks(indices):
    // Split sorted index array into contiguous runs
    blocks ← []
    current_block ← [indices[0]]
    FOR i IN [1, len(indices)-1]:
        IF indices[i] == indices[i-1] + 1:
            current_block.append(indices[i])
        ELSE:
            blocks.append(current_block)
            current_block ← [indices[i]]
    blocks.append(current_block)
    RETURN blocks
```

### 1.4.3 Probability of Backtest Overfitting (PBO)

From each CPCV combination $c \in \{1, \ldots, \binom{N}{k}\}$, extract the **in-sample Sharpe** $SR^{IS}_c$ and **out-of-sample Sharpe** $SR^{OOS}_c$.

**Rank the strategies** (if testing $M$ parameter sets):

$$\hat{n}^* = \arg\max_{m} SR^{IS}_{c,m}$$

**PBO Estimate**:

$$\hat{\lambda}_c = SR^{OOS}_{c, \hat{n}^*}$$

$$\text{PBO} = \Pr[\hat{\lambda}_c < \text{median}(\{SR^{OOS}_{c,m}\}_{m=1}^{M})]$$

$$\widehat{\text{PBO}} = \frac{1}{\binom{N}{k}} \sum_{c=1}^{\binom{N}{k}} \mathbf{1}[\hat{\lambda}_c < \text{median rank}]$$

**Invariant Rule**: If $\widehat{\text{PBO}} > 0.50$, the strategy is flagged as **OVERFIT** and blocked from live deployment.

---

## 1.5 Database Schema: Cross-

---



# Part 4: Autonomous Calibration, Outcome Tracking & Self-Learning System Specification

# WealthOS Autonomous Calibration, Outcome Tracking, and Self-Learning System

## Complete Architectural Specification v1.0

---

## PREAMBLE: FOUNDATIONAL PRINCIPLES

This specification governs a system where **every number displayed to a user must be derivable from real, timestamped, immutable market events**. There are no exceptions. Any code path that returns a synthetic accuracy metric, a hardcoded fallback probability, or a fabricated track record is a critical defect equivalent to financial fraud. This document provides the complete mathematical, architectural, and implementation specification to make fabrication structurally impossible.

---

## PART 1: RECOMMENDATION LIFECYCLE & FINITE STATE MACHINE

### 1.1 Formal State Definition

```
States S = {
    PENDING_ENTRY,
    ACTIVE_IN_POSITION,
    HIT_TARGET_T1,
    HIT_TARGET_T2,
    HIT_TARGET_RUNNER,
    HIT_STOP_LOSS,
    TIME_EXPIRED,
    CANCELLED_INVALIDATED
}

Terminal States S_terminal = {
    HIT_TARGET_T1,      -- partial or full exit at first target
    HIT_TARGET_T2,      -- partial exit at second target
    HIT_TARGET_RUNNER,  -- runner position closed
    HIT_STOP_LOSS,      -- stop triggered
    TIME_EXPIRED,       -- holding period elapsed without trigger
    CANCELLED_INVALIDATED -- fundamental invalidation event
}

Initial State: PENDING_ENTRY
```

### 1.2 Complete State Transition Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │                  SIGNAL GENERATED                   │
                    │         (SHA-256 hash computed at this instant)     │
                    └─────────────────────┬───────────────────────────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │   PENDING_ENTRY      │
                              │                      │
                              │  Waiting for price   │
                              │  to reach entry zone │
                              └──────────┬───────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                     │
                    ▼                    ▼                     ▼
         [Entry zone hit]    [Stop hit before entry]  [Time window expires
                              OR gap through entry     before entry]
                    │         zone unfavorably]               │
                    │                    │                     │
                    ▼                    ▼                     ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │ ACTIVE_IN_       │  │ CANCELLED_        │  │  TIME_EXPIRED    │
         │ POSITION         │  │ INVALIDATED       │  │  (PENDING)       │
         │                  │  │                   │  │                  │
         │ Position is open │  │ Terminal State    │  │  Terminal State  │
         │ Monitoring T1,   │  │ R = 0 (no trade   │  │  R = 0 (no trade │
         │ T2, Runner, Stop │  │ taken)            │  │  taken)          │
         └────────┬─────────┘  └──────────────────┘  └──────────────────┘
                  │
     ┌────────────┼──────────────────────────────────┐
     │            │                                  │
     ▼            ▼                                  ▼
[T1 hit]    [Stop hit]                    [Max hold time expires]
     │            │                                  │
     ▼            ▼                                  ▼
┌─────────┐  ┌──────────────┐                ┌──────────────┐
│HIT_     │  │HIT_STOP_LOSS │                │TIME_EXPIRED  │
│TARGET_T1│  │              │                │(ACTIVE)      │
│         │  │Terminal State│                │              │
│Partial  │  │R = -1.0      │                │Terminal State│
│exit;    │  │(full loss)   │                │R = close-    │
│runner   │  │OR gap-adj R  │                │based calc    │
│continues│  └──────────────┘                └──────────────┘
└────┬────┘
     │
     │  [Remaining position continues]
     │
     ├──────────────────────────────────┐
     │                                  │
     ▼                                  ▼
[T2 hit]                          [Stop hit on runner]
     │                                  │
     ▼                                  ▼
┌─────────────┐                  ┌──────────────┐
│HIT_TARGET_T2│                  │HIT_STOP_LOSS │
│             │                  │(runner)      │
│Partial exit;│                  │Terminal State│
│runner       │                  └──────────────┘
│continues    │
└──────┬──────┘
       │
       │  [Runner position continues]
       │
       ├──────────────────────────────────┐
       │                                  │
       ▼                                  ▼
[Runner target hit]              [Stop hit on runner]
       │                                  │
       ▼                                  ▼
┌──────────────────┐             ┌──────────────┐
│HIT_TARGET_RUNNER │             │HIT_STOP_LOSS │
│                  │             │(runner final)│
│Terminal State    │             │Terminal State│
└──────────────────┘             └──────────────┘
```

### 1.3 Formal Transition Function

```
δ: S × E → S

Where E (Events) = {
    E_ENTRY_TRIGGERED,
    E_T1_TRIGGERED,
    E_T2_TRIGGERED,
    E_RUNNER_TRIGGERED,
    E_STOP_TRIGGERED,
    E_GAP_STOP_TRIGGERED,
    E_TIME_EXPIRED_PENDING,
    E_TIME_EXPIRED_ACTIVE,
    E_FUNDAMENTAL_INVALIDATION,
    E_MANUAL_CANCEL
}

Transition Table:
┌──────────────────────┬──────────────────────────┬──────────────────────────┐
│ Current State        │ Event                    │ Next State               │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ PENDING_ENTRY        │ E_ENTRY_TRIGGERED        │ ACTIVE_IN_POSITION       │
│ PENDING_ENTRY        │ E_STOP_TRIGGERED         │ CANCELLED_INVALIDATED    │
│ PENDING_ENTRY        │ E_GAP_STOP_TRIGGERED     │ CANCELLED_INVALIDATED    │
│ PENDING_ENTRY        │ E_TIME_EXPIRED_PENDING   │ TIME_EXPIRED             │
│ PENDING_ENTRY        │ E_FUNDAMENTAL_INVALIDATION│ CANCELLED_INVALIDATED   │
│ PENDING_ENTRY        │ E_MANUAL_CANCEL          │ CANCELLED_INVALIDATED    │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ ACTIVE_IN_POSITION   │ E_T1_TRIGGERED           │ HIT_TARGET_T1            │
│ ACTIVE_IN_POSITION   │ E_STOP_TRIGGERED         │ HIT_STOP_LOSS            │
│ ACTIVE_IN_POSITION   │ E_GAP_STOP_TRIGGERED     │ HIT_STOP_LOSS            │
│ ACTIVE_IN_POSITION   │ E_TIME_EXPIRED_ACTIVE    │ TIME_EXPIRED             │
│ ACTIVE_IN_POSITION   │ E_FUNDAMENTAL_INVALIDATION│ CANCELLED_INVALIDATED   │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ HIT_TARGET_T1        │ E_T2_TRIGGERED           │ HIT_TARGET_T2            │
│ HIT_TARGET_T1        │ E_STOP_TRIGGERED         │ HIT_STOP_LOSS            │
│ HIT_TARGET_T1        │ E_TIME_EXPIRED_ACTIVE    │ TIME_EXPIRED             │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ HIT_TARGET_T2        │ E_RUNNER_TRIGGERED       │ HIT_TARGET_RUNNER        │
│ HIT_TARGET_T2        │ E_STOP_TRIGGERED         │ HIT_STOP_LOSS            │
│ HIT_TARGET_T2        │ E_TIME_EXPIRED_ACTIVE    │ TIME_EXPIRED             │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ All terminal states  │ ANY                      │ UNCHANGED (absorbing)    │
└──────────────────────┴──────────────────────────┴──────────────────────────┘
```

### 1.4 Trigger Invariant Rules

#### 1.4.1 Intraday High/Low vs. Close Trigger Logic

```
INVARIANT RULE TR-001: INTRADAY TRIGGER PRECEDENCE

For any bar B = (open_B, high_B, low_B, close_B, timestamp_B):

LONG POSITION:
  Stop trigger condition:
    low_B <= stop_price
    → Event: E_STOP_TRIGGERED
    → Execution price: stop_price (limit stop) OR open_B (if gap)
    
  Target trigger condition:
    high_B >= target_price
    → Event: E_T{n}_TRIGGERED
    → Execution price: target_price

CONFLICT RESOLUTION (same bar hits both stop and target):
  IF open_B <= stop_price:
    → Gap open through stop; stop takes precedence
    → Execution price: open_B (gap fill, not stop_price)
    → Event: E_GAP_STOP_TRIGGERED
    
  ELSE IF open_B >= target_price:
    → Gap open through target; target takes precedence
    → Execution price: open_B
    → Event: E_T{n}_TRIGGERED
    
  ELSE (intraday both hit):
    → Conservative rule: STOP TAKES PRECEDENCE
    → Rationale: We cannot know intraday sequence without tick data
    → If tick data available: use actual sequence
    → Execution price: stop_price
    → Event: E_STOP_TRIGGERED
    → AUDIT NOTE: "Intraday conflict resolved conservatively"

SHORT POSITION (mirror logic):
  Stop trigger: high_B >= stop_price
  Target trigger: low_B <= target_price
  Conflict: same conservative rule applies
```

#### 1.4.2 Gap-Down Stop-Loss Handling

```
INVARIANT RULE TR-002: GAP STOP EXECUTION

Definition: A gap stop occurs when the opening price of the next bar
violates the stop level without trading at the stop level.

For LONG position with stop at S:
  IF open_{t+1} < S:
    gap_magnitude = S - open_{t+1}
    gap_slippage_R = gap_magnitude / initial_risk_per_share
    
    actual_exit_price = open_{t+1}
    
    -- R-multiple calculation uses ACTUAL exit, not stop level
    R_actual = (actual_exit_price - entry_price)

---



# Part 5: Point-in-Time Data Sanctity, Multi-Broker Ingestion & Statutory Tax Invariants

# WealthOS: Data Sanctity, Multi-Broker Ingestion, Corporate Action Reconciliation & Tax Lot Matching Engine

## Complete Architectural Specification

---

# PART I: POINT-IN-TIME MARKET DATA PIPELINE

## 1.1 Foundational Principle: The Immutability Axiom

Every price observation is a fact about a specific moment in time. Corporate actions do not retroactively change what a stock traded at — they change the *interpretation* of that price for comparative purposes. The system enforces this as a hard architectural invariant:

**Axiom PIT-1 (Price Immutability):** Once a raw OHLCV record is written to the canonical store, it is never modified. All adjustments exist exclusively in a separate adjustment factor layer.

**Axiom PIT-2 (Temporal Honesty):** No computation consuming data as-of date T may reference any fact that was not knowable at time T. This includes corporate action announcements, index reconstitutions, and earnings releases.

**Axiom PIT-3 (Adjustment Reversibility):** Given any adjusted price series and the complete adjustment factor ledger, the original unadjusted series must be exactly recoverable with zero floating-point error (using rational arithmetic).

---

## 1.2 Schema DDL: Raw Unadjusted Price Store

```sql
-- ============================================================
-- SCHEMA: market_data_raw
-- PURPOSE: Immutable canonical store of exchange-reported prices
-- NEVER UPDATE OR DELETE — append-only with audit trail
-- ============================================================

CREATE SCHEMA market_data_raw;

-- Primary OHLCV table: one row per instrument per trading session
CREATE TABLE market_data_raw.bhavcopy_ohlcv (
    -- Surrogate key
    bhavcopy_id             BIGSERIAL PRIMARY KEY,
    
    -- Instrument identification (exchange-canonical)
    exchange_code           VARCHAR(10)     NOT NULL,  -- 'NSE', 'BSE'
    segment                 VARCHAR(10)     NOT NULL,  -- 'EQ', 'BE', 'SM', 'IL'
    isin                    CHAR(12)        NOT NULL,
    exchange_symbol         VARCHAR(20)     NOT NULL,  -- e.g. 'RELIANCE', 'INFY'
    series                  VARCHAR(5)      NOT NULL,  -- 'EQ', 'BE', 'N1', etc.
    
    -- Trading session identification
    trading_date            DATE            NOT NULL,
    
    -- Raw unadjusted OHLCV (stored as NUMERIC for exact decimal arithmetic)
    open_price              NUMERIC(18,4)   NOT NULL,
    high_price              NUMERIC(18,4)   NOT NULL,
    low_price               NUMERIC(18,4)   NOT NULL,
    close_price             NUMERIC(18,4)   NOT NULL,
    last_traded_price       NUMERIC(18,4),             -- LTP may differ from close
    prev_close_price        NUMERIC(18,4),             -- Exchange-reported prev close
    
    -- Volume and value
    total_traded_quantity   BIGINT          NOT NULL DEFAULT 0,
    total_traded_value      NUMERIC(22,4)   NOT NULL DEFAULT 0,  -- In INR
    total_trades            INTEGER,
    
    -- Delivery data (available T+2 from exchange)
    deliverable_quantity    BIGINT,
    delivery_pct            NUMERIC(6,4),              -- 0.0000 to 100.0000
    
    -- 52-week range (exchange-reported, unadjusted)
    week52_high             NUMERIC(18,4),
    week52_low              NUMERIC(18,4),
    
    -- Source provenance
    source_file_name        VARCHAR(255)    NOT NULL,  -- e.g. 'cm01JAN2024bhav.csv.zip'
    source_file_hash        CHAR(64)        NOT NULL,  -- SHA-256 of source file
    source_file_url         TEXT,
    ingestion_timestamp     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    ingestion_batch_id      UUID            NOT NULL,
    
    -- Data quality flags
    is_ex_date              BOOLEAN         NOT NULL DEFAULT FALSE,  -- Corporate action ex-date
    is_circuit_hit          BOOLEAN         NOT NULL DEFAULT FALSE,
    circuit_type            VARCHAR(5),                -- 'UPPER', 'LOWER'
    data_quality_score      SMALLINT        NOT NULL DEFAULT 100,   -- 0-100
    
    -- Constraints
    CONSTRAINT bhavcopy_unique_daily 
        UNIQUE (exchange_code, isin, series, trading_date),
    CONSTRAINT price_ohlc_valid 
        CHECK (high_price >= low_price 
               AND high_price >= open_price 
               AND high_price >= close_price
               AND low_price <= open_price 
               AND low_price <= close_price),
    CONSTRAINT price_positive 
        CHECK (open_price > 0 AND high_price > 0 
               AND low_price > 0 AND close_price > 0),
    CONSTRAINT quantity_non_negative 
        CHECK (total_traded_quantity >= 0)
);

-- Immutability enforcement: no updates allowed
CREATE RULE bhavcopy_no_update AS ON UPDATE TO market_data_raw.bhavcopy_ohlcv
    DO INSTEAD NOTHING;

CREATE RULE bhavcopy_no_delete AS ON DELETE TO market_data_raw.bhavcopy_ohlcv
    DO INSTEAD NOTHING;

-- Indexes for common access patterns
CREATE INDEX idx_bhavcopy_isin_date 
    ON market_data_raw.bhavcopy_ohlcv (isin, trading_date DESC);
CREATE INDEX idx_bhavcopy_symbol_date 
    ON market_data_raw.bhavcopy_ohlcv (exchange_code, exchange_symbol, trading_date DESC);
CREATE INDEX idx_bhavcopy_date 
    ON market_data_raw.bhavcopy_ohlcv (trading_date DESC);
CREATE INDEX idx_bhavcopy_batch 
    ON market_data_raw.bhavcopy_ohlcv (ingestion_batch_id);

-- ============================================================
-- Intraday tick data (for real-time and backtesting at tick level)
-- ============================================================
CREATE TABLE market_data_raw.intraday_ticks (
    tick_id                 BIGSERIAL PRIMARY KEY,
    exchange_code           VARCHAR(10)     NOT NULL,
    isin                    CHAR(12)        NOT NULL,
    exchange_symbol         VARCHAR(20)     NOT NULL,
    
    -- Microsecond precision timestamp (exchange-reported)
    tick_timestamp          TIMESTAMPTZ     NOT NULL,
    exchange_timestamp      TIMESTAMPTZ     NOT NULL,  -- Exchange's own clock
    
    -- Tick data
    last_price              NUMERIC(18,4)   NOT NULL,
    last_quantity           INTEGER         NOT NULL,
    total_buy_quantity      BIGINT,
    total_sell_quantity     BIGINT,
    
    -- Best bid/ask
    best_bid_price          NUMERIC(18,4),
    best_bid_quantity       INTEGER,
    best_ask_price          NUMERIC(18,4),
    best_ask_quantity       INTEGER,
    
    -- Running totals
    volume_cumulative       BIGINT          NOT NULL DEFAULT 0,
    value_cumulative        NUMERIC(22,4)   NOT NULL DEFAULT 0,
    
    -- Source
    feed_source             VARCHAR(20)     NOT NULL,  -- 'NSE_LIVE', 'BSE_LIVE', 'VENDOR_X'
    sequence_number         BIGINT,                    -- Exchange sequence number
    
    CONSTRAINT tick_price_positive CHECK (last_price > 0),
    CONSTRAINT tick_quantity_positive CHECK (last_quantity > 0)
) PARTITION BY RANGE (tick_timestamp);

-- Create monthly partitions (example for 2024)
CREATE TABLE market_data_raw.intraday_ticks_2024_01 
    PARTITION OF market_data_raw.intraday_ticks
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- (Additional partitions created by automated partition management job)

CREATE INDEX idx_ticks_isin_ts 
    ON market_data_raw.intraday_ticks (isin, tick_timestamp DESC);
```

---

## 1.3 Schema DDL: Corporate Action Adjustment Factor Ledger

```sql
-- ============================================================
-- SCHEMA: corporate_actions
-- PURPOSE: Complete ledger of all corporate actions and their
--          computed price/quantity adjustment factors
-- ============================================================

CREATE SCHEMA corporate_actions;

-- Master corporate action event table
CREATE TABLE corporate_actions.ca_events (
    ca_event_id             BIGSERIAL PRIMARY KEY,
    
    -- Instrument
    isin                    CHAR(12)        NOT NULL,
    exchange_code           VARCHAR(10)     NOT NULL,
    exchange_symbol         VARCHAR(20)     NOT NULL,
    
    -- Event classification
    ca_type                 VARCHAR(30)     NOT NULL,
    -- Allowed values:
    -- 'SPLIT'           : Stock split (e.g., 10:1 face value reduction)
    -- 'BONUS'           : Bonus share issuance
    -- 'RIGHTS'          : Rights issue
    -- 'DIVIDEND_CASH'   : Cash dividend
    -- 'DIVIDEND_SPECIAL': Special dividend
    -- 'MERGER_ABSORB'   : Company absorbed into acquirer
    -- 'MERGER_SWAP'     : Share swap merger
    -- 'DEMERGER'        : Demerger/spin-off
    -- 'BUYBACK'         : Share buyback
    -- 'FACE_VALUE_CHANGE': Face value change without split ratio change
    -- 'NAME_CHANGE'     : Symbol/name change only
    -- 'DELISTING'       : Voluntary or compulsory delisting
    
    -- Key dates
    announcement_date       DATE,           -- Board announcement date
    record_date             DATE,           -- Record date (who gets the action)
    ex_date                 DATE            NOT NULL,  -- Ex-date (price adjusts from here)
    effective_date          DATE,           -- When shares actually credited
    
    -- Action parameters (stored as exact rationals)
    -- For SPLIT: new_shares = old_shares * (split_numerator / split_denominator)
    -- e.g., 2:1 split: numerator=2, denominator=1
    -- e.g., 1:10 consolidation: numerator=1, denominator=10
    action_numerator        NUMERIC(18,0),  -- New quantity units
    action_denominator      NUMERIC(18,0),  -- Old quantity units
    
    -- For DIVIDEND: amount per share
    dividend_per_share      NUMERIC(18,4),
    face_value_old          NUMERIC(10,4),
    face_value_new          NUMERIC(10,4),
    
    -- For DEMERGER/MERGER: related ISIN
    related_isin            CHAR(12),
    related_exchange_symbol VARCHAR(20),
    
    -- Demerger cost allocation ratio (fraction of original cost allocated to this entity)
    -- Must satisfy: sum of all demerger_cost_ratio for a given ca_event_id group = 1.0
    demerger_cost_ratio     NUMERIC(10,8),  -- e.g., 0.75000000 for parent, 0.25000000 for spinoff
    
    -- Computed adjustment factors (derived, stored for performance)
    -- price_adjustment_factor: multiply historical prices by this to get adjusted prices
    -- quantity_adjustment_factor: multiply historical quantities by this
    -- These are INVERSES of each other for splits/bonus
    price_adjustment_factor     NUMERIC(20,10) NOT NULL,
    quantity_adjustment_factor  NUMERIC(20,10) NOT NULL,
    
    -- Invariant check: for splits and bonus

---

