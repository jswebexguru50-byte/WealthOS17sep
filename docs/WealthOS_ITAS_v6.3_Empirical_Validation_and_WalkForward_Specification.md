# WealthOS / ITAS v6.3: Empirical Validation Engine & Walk-Forward Research Specification
## Quantitative Research, Point-in-Time Backtesting, Dual-Mode Ablation Architecture, and Challenger Falsification Protocol

---

### Executive Sign-Off & Baseline State

| Attribute | Official Specification Value |
| :--- | :--- |
| **Document Version** | **v6.3.0-SPEC (Phase R1 Integrated)** |
| **Immediate Engineering Milestone** | **`v6.3.0-R1` — Research Infrastructure & PIT Validation** |
| **Preceding Milestone** | `v6.2.0-FROZEN` (Code Remediation Accepted; 36/36 Unit Tests Passing) |
| **Static Review Status** | Substantially Remediated; TypeScript Verification Reported Passing |
| **Audit Mechanism** | **Tamper-evident cryptographic hash chaining with durable append-only persistence** |
| **Trading Validation Status** | **Contingent on Walk-Forward Research (Not Yet Established)** |
| **Core Strategy Invariant** | **S1–S20 Core Engines, NEoWave, Double Momentum, FERE, QGLP, 10-Gate: 100% FROZEN** |
| **Challenger Status** | **S8B, S21–S26 Isolated behind feature flags (Evaluation Mode Only)** |
| **Primary Research Goal** | **Falsify whether v6.2 risk/overlay architecture delivers net after-friction incremental alpha** |

---

## 1. Executive Summary & Senior Review Consensus

The v6.2 software remediation successfully established rigorous code-level guardrails, passed all 36 specified unit tests, rectified concentration limits to $\le 8\%$, isolated research overrides, enforced opening-candle time windows (09:15–09:30 IST), eliminated fallback hallucinations in live ORB feeds, and implemented tamper-evident cryptographic hash chaining (`signal_audit_ledger.jsonl`).

However, as emphasized by institutional quantitative review:
> **Unit verification (36/36 PASS) verifies software specification compliance; it does not verify predictive edge, robustness, or production execution safety.**

Milestone **v6.3** transitions the engineering focus from software construction to **empirical validation and walk-forward research**. Under v6.3:
1. **Zero New Indicators**: The strategy library is completely frozen (`v6.2.0-FROZEN`). No technical patterns, indicators, or filters will be added.
2. **Zero In-Sample Tuning**: S1–S20 core parameters, the 65 setup quality score cutoff, the 8% concentration ceiling, and Kelly fractions will not be curve-fitted.
3. **Phased Research Sequence**: Engineering follows a strict linear sequence:
   $$\text{PIT Data} \to \text{Timestamps} \to \text{Execution} \to \text{Costs} \to \text{Trade Ledger} \to \text{Ablation} \to \text{Statistics} \to \text{Walk-Forward} \to \text{Lockbox}$$
4. **Core Scientific Question**: Does the v6.2 risk/overlay architecture improve risk-adjusted, post-cost outcomes relative to the unconstrained baseline?
5. **Opportunity Cost Quantification**: Every basis point of drawdown eliminated must be weighed against returns sacrificed and capital efficiency lost.

---

## 2. Milestone v6.3.0-R1: Research Infrastructure & PIT Validation

Before building the portfolio simulator or generating any backtest performance figures, the research harness must establish **Milestone v6.3.0-R1**. This milestone constructs the Point-In-Time data layer and enforces zero lookahead violations.

### 2.1 The 10 Mandatory PIT Hard Gates
Zero lookahead violations is a non-negotiable research gate. The PIT engine must pass all 10 verification tests before any equity curve is generated:

| PIT Test ID | Test Name | Required Deterministic Behavior |
| :--- | :--- | :--- |
| **PIT-001** | **Delisted Stock Preservation** | Securities delisted, merged, or suspended remain in the historical universe prior to their delisting date. |
| **PIT-002** | **Historical Index Membership** | Queries for index constituents (e.g. Nifty 500) use the exact membership active at simulation date $t$, not current constituents. |
| **PIT-003** | **Split/Bonus Backward Adjustment** | Stock splits and bonus issues adjust historical prices strictly backward in time; zero future price information is leaked. |
| **PIT-004** | **Dividend Ex-Date Treatment** | Cash dividends are credited to capital reserves on the exact ex-dividend date, never on the announcement or record date. |
| **PIT-005** | **Filing Timestamp Hierarchy** | Exact exchange filing timestamps are authoritative. Quarter-end + 45 days is strictly a conservative fallback when filing timestamps are missing. |
| **PIT-006** | **Shareholding PIT Availability** | Quarterly promoter, FII, and DII shareholding pattern filings cannot be queried before their verified exchange dissemination timestamp. |
| **PIT-007** | **OHLCV Availability Anchor** | Day $t$ daily OHLCV is strictly available only after 15:35 IST on day $t$. Next-day orders cannot execute before 09:15 IST on day $t+1$. |
| **PIT-008** | **Corporate Action Sequencing** | Actions effective on date $t_{\text{ex}}$ are never applied to market sessions occurring prior to $t_{\text{ex}}$. |
| **PIT-009** | **Suspended / Illiquid Handling** | Trading halts, circuit freezes, and suspended scrips fail closed and reject simulated order fills. |
| **PIT-010** | **Fail-Closed Missing Data** | Missing or corrupted price/volume bars return `DATA_UNAVAILABLE` rather than forward-filling unknowable values. |

---

## 3. Four-Portfolio Research Architecture

The research engine executes identical raw strategy triggers across four parallel portfolios:

```
                          HISTORICAL POINT-IN-TIME MARKET DATA
                     (Survivorship-Free, Split/Dividend Adjusted)
                                          │
                                          ▼
                         RAW S1–S20 SIGNAL GENERATION
                     (Unmodified Core Engine: Zero Overlays)
                                          │
        ┌───────────────────┬─────────────┴───────┬───────────────────┐
        │                   │                     │                   │
        ▼                   ▼                     ▼                   ▼
  [PORTFOLIO A]       [PORTFOLIO B]         [PORTFOLIO C]       [PORTFOLIO D]
  Raw Baseline        v6.2 Overlay          Challengers         Idealized Risk Oracle
  - Raw S1–S20        - Raw S1–S20          - S8B, S21–S26      - Perfect MAE oracle
  - 5% Equal Weight   - Quality Overlay       Isolated          - Upper-bound benchmark
  - Fixed Price Stop  - Redundancy Disc.    - Incremental to    - Diagnoses signal vs
  - Zero Overlay      - ADV & Gap Sizing      Portfolio B         sizing vs exit flaws
  - Zero Cap          - 8% Stock Cap        - Strictly Gated
                      - 5-State Capital
                      - 4-Tier Exits
        │                   │                     │                   │
        └───────────────────┼─────────────────────┴───────────────────┘
                            │
                            ▼
                      IDENTICAL EXECUTOR (Next-Day Open Queue)
                            │
                            ▼
                     ALL-IN TRANSACTION COST & SLIPPAGE SCHEDULE
                            │
                            ▼
                      TRADE IDENTITY LEDGER (25+ Fields)
```

### 3.1 The Invariant Principle of Signal Identity
> **Rule of Signal Identity:** Portfolio A, Portfolio B, and Portfolio D **must receive the exact same raw signal candidates** generated on day $t$. Portfolio B then applies the v6.2 evidence buckets, redundancy discounts, sizing, and exit logic. Any performance divergence between A and B is strictly and mathematically attributable to the v6.2 architecture.

### 3.2 Portfolio D: Idealized Risk Oracle (Diagnostic Benchmark)
Portfolio D is a **research-only diagnostic benchmark** (never production). It simulates what the system would look like if the risk-control layer had perfect knowledge of the eventual Maximum Adverse Excursion (MAE). This establishes an upper bound on potential risk recovery, isolating whether performance bottlenecks stem from:
- A **signal problem** (poor predictive edge),
- An **entry problem** (adverse timing),
- A **sizing problem** (poor liquidity/volatility adjustment), or
- An **exit problem** (premature stops or profit give-back).

---

## 4. Dual-Mode Ablation Protocol

To prove whether each component of v6.2 earns its complexity, the research engine executes both **Cumulative Ablation** and **Leave-One-Layer-Out Ablation**:

### 4.1 Mode 1: Cumulative Ablation
| Run Layer | Architecture Added | Key Question Answered |
| :--- | :--- | :--- |
| **Layer A** | **Raw S1–S20 Baseline** | What is the unconstrained edge of the raw price-action patterns? |
| **Layer B** | **+ Signal Quality Overlay** | Do the 5 evidence buckets & redundancy discount improve win rate and expectancy? |
| **Layer C** | **+ Position & ADV Sizing** | Does liquidity-constrained sizing reduce tail loss without curbing returns? |
| **Layer D** | **+ Gap Risk & 8% Cap** | Does multi-tier overnight gap sizing protect against black-swan open gaps? |
| **Layer E** | **+ Capital Preservation** | Do the 5 drawdown states throttle exposure before equity drawdowns breach 15%? |
| **Layer F** | **+ 4-Tier Exit Rules** | Do trailing ATR, time-decay, and regime exits harvest more profit than fixed stops? |
| **Layer G** | **= Full v6.2 System** | What is the total combined risk-adjusted performance of all layers operating together? |

### 4.2 Mode 2: Leave-One-Layer-Out Ablation
To verify whether components operate independently or only through interactions with other layers:
- **`FULL - B`**: Complete v6.2 system without Signal Quality Overlay.
- **`FULL - C`**: Complete v6.2 system without Position & ADV Sizing.
- **`FULL - D`**: Complete v6.2 system without Gap Protection & 8% Cap.
- **`FULL - E`**: Complete v6.2 system without 5-State Capital Preservation.
- **`FULL - F`**: Complete v6.2 system without 4-Tier Dynamic Exits.

### 4.3 Opportunity Cost & Efficiency Ratios
For every ablation run, report:
$$\Delta \text{Expectancy} = \text{Expectancy}_{\text{test}} - \text{Expectancy}_{\text{base}}$$
$$\Delta \text{MaxDD} = \text{MaxDD}_{\text{test}} - \text{MaxDD}_{\text{base}}$$
$$\text{Efficiency Ratio} = \frac{\Delta \text{Expectancy}}{\Delta \text{MaxDD}}$$
$$\text{Capital-at-Risk Yield} = \frac{\text{Net Annualized Return}}{\text{Average Daily Gross Exposure}}$$

---

## 5. Granular Trade Identity Ledger

Every simulated trade is assigned a permanent, auditable record with 25+ structured fields:

```typescript
export interface TradeIdentityRecord {
  tradeId: string;                     // e.g. "TRD-20240315-S01-RELIANCE"
  strategyId: string;                  // e.g. "S1", "S8B", "S21"
  symbol: string;                      // NSE Ticker
  signalTimestamp: string;             // ISO-8601 (day t EOD)
  decisionTimestamp: string;           // ISO-8601 (day t+1 09:15)
  rawEntry: number;                    // Planned entry price
  rawStop: number;                     // Planned hard stop
  rawTarget: number;                   // Planned target
  
  // Overlay Decisions
  baselineAccepted: boolean;           // True for Portfolio A
  overlayAccepted: boolean;            // True if Portfolio B passed all gates
  overlayDecision: 'APPROVE' | 'REJECT' | 'QUARANTINE';
  overlayReasonCodes: string[];        // e.g. ["EV_BUCKETS_GE_2", "RED_DISCOUNT_0.82"]
  
  // Sizing Comparison
  positionSizeA: number;               // Portfolio A units (flat 5%)
  positionSizeB: number;               // Portfolio B units (risk/ADV/gap constrained)
  
  // Actual Simulated Execution
  actualEntry: number;                 // Filled entry price (with slippage)
  actualExit: number;                  // Filled exit price (with slippage)
  entryTimestamp: string;
  exitTimestamp: string;
  exitReason: string;                  // "HARD_STOP", "TRAILING_ATR", "PROFIT_TARGET"
  
  // Economics
  grossPnL: number;
  transactionCost: number;             // Indian statutory taxes + fees
  slippageCost: number;
  netPnL: number;
  rMultiple: number;                   // (actualExit - actualEntry) / |actualEntry - rawStop|
  mae: number;                         // Maximum Adverse Excursion (%)
  mfe: number;                         // Maximum Favorable Excursion (%)
  holdingDays: number;
  
  // Regimes & Context
  macroRegime: 'BULL' | 'NEUTRAL' | 'BEAR';
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH';
  marketCapBucket: 'LARGE' | 'MID' | 'SMALL';
  liquidityBucket: 'HIGH' | 'MEDIUM' | 'LOW';
  gapRiskBucket: 'G50' | 'G90' | 'G95' | 'G99';
}
```

This ledger allows instant deterministic forensic queries:
- *"Show every trade that Run A accepted but Run B rejected."*
- *"Show every trade where the overlay reduced position size."*
- *"Did the trades rejected by the overlay subsequently produce negative expectancy?"*

---

## 6. Statistical Uncertainty & Sample-Size Discipline

To prevent treating noisy point estimates as immutable laws, the research engine computes **bootstrap statistical distributions**:

### 6.1 Statistical Metrics
- **Observed Expectancy $E(R)$**: Standard point estimate in $R$-multiples.
- **Bootstrap 95% Confidence Interval**: Derived from 2,000 bootstrap resamples.
- **Median Bootstrap Expectancy**: Non-parametric central tendency.
- **Probability of Positive Edge $P(E > 0)$**: Percentage of bootstrap resamples where $E(R) > 0$.
- **Probability of Institutional Edge $P(E > +0.20R)$**: Percentage of bootstrap resamples where $E(R) \ge +0.20R$.

### 6.2 Sample Size Tiers
- **Core S1–S20 Combined System**: Target $\ge 300$ out-of-sample trades.
- **Individual Strategy**: Target $\ge 100$ out-of-sample trades.
- **Challengers (S8B, S21–S26)**: Target $\ge 100$ standalone trades + meaningful incremental observations.
- **Inconclusive Threshold**: Any strategy generating $< 50$ trades is labeled:  
  **`INCONCLUSIVE — Insufficient Statistical Evidence`** (not labeled a failure).

---

## 7. Indian Transaction Cost & Slippage Sensitivity Distribution

Post-friction performance must not rely on a single optimistic slippage number. The engine executes a 5-tier sensitivity distribution:

$$\text{Friction} = \text{STT} + \text{Exchange Fee} + \text{SEBI Fee} + \text{Stamp Duty} + \text{Brokerage} + \text{GST} + k_{\text{slip}} \times \text{Slippage Model}$$

| Multiplier ($k_{\text{slip}}$) | Test Scenario | Large-Cap Slippage | Small-Cap Slippage |
| :--- | :--- | :--- | :--- |
| **$0.75\times$** | High Liquidity / Best Execution | 0.075% | 0.187% |
| **$1.00\times$ (Baseline)** | Normal Market Conditions | 0.100% | 0.250% |
| **$1.25\times$** | Elevated Market Volatility | 0.125% | 0.312% |
| **$1.50\times$** | Wide Bid-Ask Spread Stress | 0.150% | 0.375% |
| **$2.00\times$** | Extreme Market Fragility | 0.200% | 0.500% |

The engine reports the **Break-Even Friction Threshold**: the exact slippage multiplier at which net post-cost expectancy collapses to zero.

---

## 8. Empirical Redundancy Research Protocol

Rather than treating the v6.2 correlation table ($r(S1, S9) = 0.74$) or independence formula ($\Phi = 1 - \max(0, r_{\text{cond}} \times C)$) as unalterable truth, Milestone v6.3 empirically evaluates alternative formulations:
1. Signal Coincidence $C(S_i, S_j)$,
2. Pearson & Spearman Return Correlation,
3. Conditional Return Correlation $r_{\text{cond}}$,
4. Drawdown Coincidence & Portfolio Contribution Correlation.

The engine determines whether $\Phi$ improves out-of-sample portfolio Sharpe and Sortino ratios relative to equal-weighted evidence, publishing the empirical matrix as `empirical_redundancy_matrix_v1.json`.

---

## 9. Untouched Final Lockbox Protocol

To eliminate subtle iterative curve-fitting (`research → observe → tweak → research`), the historical data is partitioned into three strictly segregated segments:

```
Historical Dataset
  ├── 1. In-Sample Training & Calibration Window (60%)
  ├── 2. Rolling Walk-Forward Out-of-Sample Window (25%)
  └── 3. UNTOUCHED FINAL LOCKBOX (15%)
```

### Invariant Rules for the Lockbox:
1. The Final Lockbox is **completely sealed** during all strategy development, ablation runs, and threshold selections.
2. Once the final candidate configuration is frozen, it is executed **exactly once** against the Lockbox.
3. If the Lockbox test fails, the configuration is disqualified. No re-tuning is permitted; the system enters a new research cycle.

---

## 10. The 15-Step Execution Roadmap

```
STEP 0:  Freeze v6.2 Baseline (Tagged v6.2.0-FROZEN with SHA-256 Manifest)
   │
STEP 1:  Construct Point-in-Time Data Engine & Availability Anchors
   │
STEP 2:  Pass 10/10 PIT Automated Integrity Tests (Hard Research Gate)
   │
STEP 3:  Implement Deterministic Event-Driven Executor & Trade Identity Ledger
   │
STEP 4:  Execute Run A: S1–S20 Raw Unconstrained Baseline
   │
STEP 5:  Execute Run B: S1–S20 + v6.2 Overlay Treatment (Identical Signals)
   │
STEP 6:  Execute Run D: Idealized Risk Oracle (Diagnostic Benchmark)
   │
STEP 7:  Execute Dual-Mode Ablation Studies (Cumulative A–G + Leave-One-Out)
   │
STEP 8:  Compute Bootstrap Confidence Intervals & Sample Size Statistics
   │
STEP 9:  Run 5-Tier Transaction Cost & Slippage Sensitivity Stress Tests
   │
STEP 10: Perform Regime, Sector, Market Cap & Liquidity Attribution
   │
STEP 11: Execute Multi-Window Rolling Walk-Forward OOS Testing
   │
STEP 12: Validate Empirical Strategy Redundancy Correlation Matrix
   │
STEP 13: Evaluate Challengers S8B & S21–S26 on Incremental Alpha Hurdle
   │
STEP 14: Execute Single-Pass Evaluation Against Untouched Final Lockbox
   │
STEP 15: Forward Paper Trading Reconciliation vs Simulated Execution
```

---

## 11. Final Tri-State Decision Matrix

At the conclusion of the research cycle, every strategy and overlay component is assigned one of three immutable operational states:

| Status | Exact Decision Criteria | Operational Action |
| :--- | :--- | :--- |
| **`PROMOTE`** | Positive post-cost OOS expectancy ($E_{\text{net}} \ge +0.20R$), PF $\ge 1.40$, statistically significant ($P(E>0) \ge 95\%$), survives $2\times$ slippage stress, incremental alpha proven over baseline. | Eligible for production capital allocation. |
| **`RETAIN AS RISK CONTROL`** | Does not increase returns, but materially reduces maximum drawdown ($\Delta \text{MaxDD} \le -20\%$) and tail loss (CVaR) with acceptable efficiency ratio ($> 1.2$). | Retained as portfolio-level risk guardrail. |
| **`REJECT / REVISE`** | Fails positive OOS expectancy, excessive turnover/fee drag, or over-filtering without commensurate downside protection. | Quarantined; prohibited from live execution. |
