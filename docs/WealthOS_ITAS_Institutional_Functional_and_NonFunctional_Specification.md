# WealthOS / ITAS Institutional Architecture Specification
## Complete Functional & Non-Functional Specifications, Signal Quality Layer, Capital Protection & Test Audit Dossier

**Document ID:** `WEALTHOS-ITAS-SPEC-v6.1-INSTITUTIONAL`  
**Target Universe:** Indian Equities (NSE/BSE) with Global Multi-Asset Framework Compatibility  
**Author / Engineering Review:** Google Antigravity Advanced Agentic Engineering  
**Reference Document:** `C:\Users\gopal\Downloads\gpt reveiw.txt` (Senior Quant & Market Veteran Review)  
**Execution Verification:** **28 / 28 Specified Unit Tests Passed (100% Green)**  
**Production Readiness Statement:** Logic verified against institutional specification; operational production trading readiness remains contingent on point-in-time walk-forward statistical backtesting, latency profiling, and forward paper-trading acceptance criteria.

---

## 1. Executive Summary & Architectural Invariants

### 1.1 Core Invariant: Non-Destructive Layering over S1–S20
The foundational S1–S20 core strategy algorithms represent proven quantitative momentum, structural, fundamental, and forensic filters. In accordance with the Senior Quantitative Review:
- **Zero rewrite of S1–S20 core logic**: Core triggers remain strictly unmodified.
- **Signal Quality Overlay (`SignalQualityOverlay.ts`)**: Sits above raw triggers, evaluating 6 independent evidence buckets, empirical redundancy discounting, macro regime gates, forensic clearance, adaptive liquidity, and gap-risk boundaries.
- **Capital Protection Engine (`CapitalProtectionEngine.ts`)**: Enforces multi-constraint position sizing, subordinating Fractional Kelly to strict risk, liquidity, and overnight gap limits.
- **Execution State Machine**: Restricts capital allocation dynamically across 5 distinct portfolio drawdown tiers.

```
                  DATA INTEGRITY (Point-in-Time, Survival-Bias-Free)
                                          │
                                          ▼
                                 S1–S20 RAW SIGNALS
                                          │
                     ┌────────────────────┼────────────────────┐
                     │                    │                    │
                     ▼                    ▼                    ▼
                  NEoWave          Double Momentum           FERE
                     │                    │                    │
                     └────────────────────┼────────────────────┘
                                          ▼
                              INDEPENDENT EVIDENCE (6 BUCKETS)
                                          +
                             EMPIRICAL REDUNDANCY DISCOUNT
                                          │
                                          ▼
                                SIGNAL QUALITY OVERLAY
                           (Canonical Weights & Profiles)
                                          │
                     ┌────────────────────┼────────────────────┐
                     │                    │                    │
                     ▼                    ▼                    ▼
                   REGIME             EVENT RISK           LIQUIDITY
                     │                    │                    │
                     └────────────────────┼────────────────────┘
                                          ▼
                                CAPITAL RISK POLICY
                      (1.5% Target / 2.0% Hard Max Ceiling)
                                          │
                     ┌────────────────────┼────────────────────┐
                     │                    │                    │
                     ▼                    ▼                    ▼
                Multi-Tier Gap       Concentration          Median ADV
                 Stress Sizing        Guardrails            Liquidity
                     │                    │                    │
                     └────────────────────┼────────────────────┘
                                          ▼
                               POSITION SIZING ENGINE
                                          │
                                          ▼
                                   EXECUTION ENGINE
                                          │
                                          ▼
                                  POSITION MONITOR
                                          │
                     ┌────────────────────┼────────────────────┐
                     │                    │                    │
                     ▼                    ▼                    ▼
                 HARD STOP           THESIS EXIT          PROFIT EXIT
                     │                    │                    │
                     └────────────────────┼────────────────────┘
                                          ▼
                                5-TIER STRATEGY HEALTH
                                          │
                                          ▼
                               RESEARCH & RETRAINING
```

---

## 2. Functional Specifications (FS)

### FS-01: Independent Evidence Buckets & Empirical Redundancy Discounting
Strategy consensus requires signals to originate from at least two **statistically distinct, non-correlated phenomena**. Merely stacking two volume indicators (e.g., S1 VPA Breakout + S9 Volume Dry-Up) constitutes false consensus.

| Evidence Bucket | Theoretical Pillar | Primary Strategies |
| :--- | :--- | :--- |
| **Bucket A: Trend & Momentum** | Moving average alignment, relative strength, trend persistence | `S2`, `S3`, `S4`, `S5`, `S6`, `S8`, `S8B`, `S10` |
| **Bucket B: Volume & Absorption** | Volume Price Analysis (VPA), institutional dry-ups, delivery spikes | `S1`, `S9`, `S18`, `S19` |
| **Bucket C: Catalyst & Fundamental Alpha** | Earnings acceleration, episodic pivots, operating leverage, promoter SAST | `S12`, `S13`, `S16`, `S17` |
| **Bucket D: Mean Reversion** | Oversold capitulation, Wyckoff springs, structural reversal double bottoms | `S7`, `S11`, `S23` |
| **Bucket E: Macro & Regime** | Market breadth, liquidity cycles, Nifty regime gates, futures hedging | `S14`, `S15`, `MACRO_REGIME` |
| **Bucket F: Structural Geometry** | NEoWave patterns, Volatility Squeezes, Cup & Handle, Head & Shoulders | `S20`, `S21`, `S22`, `S24`, `S25`, `S26` |

> [!IMPORTANT]
> **S20 Classification Correction**: In compliance with the senior review finding, S20 (NEoWave) is strictly allocated to **Bucket F (Structural Geometry)**. It does not double-count in Bucket A (Trend), eliminating artificial consensus inflation.

#### Empirical Redundancy Discount
To prevent false consensus across conceptually different but statistically co-occurring strategies, the system applies an empirical discount:
$$\text{Discount} = \max(0.75, 1.0 - (\rho_{\text{signal}} - 0.65)) \quad \text{for } \rho_{\text{signal}} > 0.65$$

---

### FS-02: Single Canonical Signal Quality Weights & Strategy Profiles
All system components consume exactly one canonical scoring configuration, totaling exactly 100 points:

$$\text{Score} = w_{\text{buckets}} + w_{\text{RS}} + w_{\text{vol}} + w_{\text{delv}} + w_{\text{regime}} + w_{\text{liq}} + w_{\text{event}} + w_{\text{forensic}} + w_{\text{val}} + w_{\text{RR}}$$

| Parameter | Balanced (Canonical) | Momentum Profile | Structural Profile | Catalyst / Fundamental |
| :--- | :---: | :---: | :---: | :---: |
| **Independent Evidence Buckets** | 15 | 20 | 20 | 15 |
| **Relative Strength (RS vs Nifty 500)** | 15 | 20 | 15 | 10 |
| **Volume Ratio (vs 20D VMA)** | 10 | 15 | 15 | 10 |
| **Delivery Quality (90D Z-Score)** | 10 | 10 | 10 | 5 |
| **Macro Regime Alignment** | 10 | 10 | 10 | 10 |
| **Liquidity & ADV Participation** | 10 | 10 | 10 | 5 |
| **Event Risk Clearance** | 5 | 5 | 5 | 5 |
| **Forensic Solvency (FERE Score)** | 10 | 5 | 5 | 20 |
| **Valuation / Margin of Safety** | 5 | **0** | 5 | **15** |
| **Risk / Reward Ratio ($\ge 2.5:1$)** | 10 | 5 | 5 | 5 |
| **Total Maximum Points** | **100** | **100** | **100** | **100** |

> [!NOTE]
> **Profile Specificity**: Pure momentum breakouts are evaluated via `MOMENTUM` profile, eliminating the 0-valuation penalty so that high-conviction trades are not rejected merely because they trade at all-time highs.

---

### FS-03: Capital Risk Policy & Multi-Constraint Position Sizing
Explicit canonical risk policy:
```typescript
const RISK_POLICY = {
  defaultTargetRiskPct: 0.015, // 1.5% target risk per trade
  hardMaximumRiskPct: 0.020,   // 2.0% absolute hard ceiling
  maxStockEquityPct: 0.080,    // 8.0% single stock cap
  maxSectorEquityPct: 0.250,   // 25.0% sector cap
  maxClusterEquityPct: 0.300   // 30.0% correlated cluster cap
};
```

Position sizing evaluates five independent boundaries:
$$\text{Shares} = \min \left( S_{\text{Risk}}, S_{\text{Concentration}}, S_{\text{Liquidity}}, S_{\text{Kelly}}, S_{\text{GapRisk}} \right)$$

1. **Risk Cap ($S_{\text{Risk}}$)**: Target 1.5%, clamped at 2.0% hard ceiling:
   $$S_{\text{Risk}} = \left\lfloor \frac{\text{Equity} \times 0.015}{|\text{Entry} - \text{Stop}|} \right\rfloor$$
2. **Portfolio Concentration Cap ($S_{\text{Concentration}}$)**: Single stock max exposure $\le 8.0\%$:
   $$S_{\text{Concentration}} = \left\lfloor \frac{\text{Equity} \times 0.08}{\text{Entry}} \right\rfloor$$
3. **Adaptive Liquidity Cap ($S_{\text{Liquidity}}$)**: Evaluates $\min(\text{mean ADV}, \text{median ADV})$ to eliminate volume skew:
   $$S_{\text{Liquidity}} = \left\lfloor \frac{\min(\text{mean ADV}, \text{median ADV}) \times 0.05}{\text{Entry}} \right\rfloor$$
4. **Fractional Kelly Guideline ($S_{\text{Kelly}}$)**: Calculated as half-Kelly ($0.5 \times K$), used as a theoretical ceiling.
5. **Multi-Tier Gap Stress Framework ($S_{\text{GapRisk}}$)**:
   - **NORMAL**: $G_{95} \le \text{StopDistance}\% \implies \text{Scale} = 1.0$
   - **REDUCED**: $G_{95} > \text{StopDistance}\% \implies \text{Scale} = \max\left(0.3, \frac{\text{StopDistance}\%}{G_{95}}\right)$
   - **RESTRICTED**: $G_{99} > 1.5 \times \text{StopDistance}\% \implies \text{Scale} = \max\left(0.2, \frac{\text{StopDistance}\%}{G_{99}}\right)$
   - **NO_NEW_POSITION**: $G_{99} > 2.5 \times \text{StopDistance}\% \land \text{ADV} < ₹10\text{ Cr} \implies \text{Scale} = 0$

---

### FS-04: 5-State Capital Preservation State Machine

| State | Trigger Conditions | Position Risk Multiplier | Exposure Cap | Hedging / Cash Buffer |
| :--- | :--- | :---: | :---: | :--- |
| **1. NORMAL** | Drawdown $< 3.0\%$, Daily Loss $< 2.0\%$ | $1.00\times$ (1.5% risk) | 100% | Normal operations |
| **2. CAUTION** | Drawdown $3.0\% - 6.0\%$ or Daily Loss $\ge 2.0\%$ | $0.75\times$ (1.1% risk) | 75% | Tighten trailing stops to 20 EMA |
| **3. DEFENSIVE** | Drawdown $6.0\% - 10.0\%$ or Daily Loss $\ge 3.0\%$ | $0.50\times$ (0.75% risk) | 50% | Derivatives hedge enabled |
| **4. CAPITAL_PRESERVATION** | Drawdown $8.0\% - 15.0\%$ | $0.25\times$ (0.375% risk) | 25% | Mandatory 50% cash buffer |
| **5. MODEL_REVIEW / HALT** | Drawdown $\ge 15.0\%$ or Daily Loss $\ge 4.0\%$ | $0.00\times$ (Zero entries) | 0% | Full trading halt & retraining |

---

### FS-05: 4-Tier Exit Architecture & Time-to-Resolution Windows

1. **Tier 1: Hard Stop Loss**: Absolute technical invalidation price. Immediate execution.
2. **Tier 2: Thesis Failure**:
   - Configurable mode: `mode: 'EITHER'` (OR semantics) vs `'STRICT_DUAL'` (AND semantics).
   - Triggers on 50 EMA breach or RS collapsing below 50th percentile.
3. **Tier 3: Trailing ATR Profit Protection**: Chandelier stop ($3.0 \times \text{ATR}_{14}$) once position achieves $+2.0\text{R}$.
4. **Tier 4: Parabolic Climax Scale-Out**:
   - Extension $\ge 18\%$ above 20 EMA or $\ge 25\%$ above 50 EMA with RSI $\ge 80$.
   - Scale out 50% immediately to lock windfalls.
5. **Tier 5: Strategy-Specific Time-to-Resolution Stop**:
   - S6 / S8 / S8B / S10 (Momentum): **10 sessions**
   - S1 / S5 / S22 (Squeeze / VCP): **15 sessions**
   - S12 / S13 / S16 / S17 (Catalysts): **20–25 sessions**
   - S20 / S21 / S23 (Structural geometry): **30–45 sessions**
   - Stagnant positions below $+3\%$ at max window are tactically liquidated to free capital.

---

### FS-06: Modular Challenger Technical Strategies
All newly cataloged chart patterns are classified as **CHALLENGER STRATEGIES**:
- **S8B (Bull Flag)**: 20%+ pole, tight flag consolidation holding 20 EMA, breakout on volume $\ge 1.5\times$.
- **S21 (Cup & Handle)**: U-shaped cup 12%–40% depth, right rim alignment within $\pm 8\%$, handle retracement $\le 33\%$, rim breakout.
- **S22 (TTM Squeeze)**: Bollinger Bands inside Keltner Channel for $\ge 3$ bars, firing on expansion with positive momentum.
- **S23 (Double Bottom)**: W-bottom with trough symmetry within 5%, confirmed on neckline close breakout.
- **S24 (Double Top Distribution Exit)**: Bearish M-pattern. Under SEBI cash shorting rules, triggers long liquidation or derivatives hedge only.
- **S25 (Inverse Head & Shoulders)**: Multi-month reversal with symmetric shoulders (within 10%), confirmed on neckline breakout.
- **S26 (Head & Shoulders Distribution Exit)**: Classical distribution top. Daily close below neckline triggers tactical exit or derivatives hedge.

---

### FS-07: Intraday 15-Minute ORB Confirmation (S10 Integration)
- **Session Date Filter**: Strictly isolates candles matching the current trading date (`timestamp LIKE YYYY-MM-DD%`), preventing historical candle leakage into `candles[0]`.
- **Opening Range Isolation**: 09:15–09:30 IST opening bar establishes opening range high and low.
- **Time-of-Day Normalized RVOL**: Compares subsequent 15m candle volume against the specific historical intraday volume for that time slot (e.g., 09:45 vs historical 09:45 median volume).
- **Confirmation Rule**: 15m Close $>$ Opening Range High **AND** Time-of-Day RVOL $\ge 1.5\times$.

---

### FS-08: Versioned Indian Statutory Transaction Cost Schedule
```typescript
interface CostSchedule {
  effectiveFrom: string;
  effectiveTo?: string;
  brokeragePerLegCap: number; // ₹20
  brokerageRate: number;      // 0.03%
  sttDeliveryRate: number;    // 0.1% (Buy & Sell)
  exchangeRate: number;       // 0.00345%
  sebiTurnoverRate: number;   // 0.0001%
  stampDutyRate: number;      // 0.015% (Buy only)
  gstRate: number;            // 18% on (Brokerage + Exchange + SEBI)
}
```

---

### FS-09: 5-Tier Strategy Health Lifecycle & False Breakout Metric
- **5-Tier Lifecycle**: `ACTIVE` $\to$ `WATCH` $\to$ `DEGRADED` $\to$ `RESEARCH_ONLY` $\to$ `QUARANTINED`
  - Auto-quarantine: $\ge 6$ consecutive losses or drawdown $> 1.5\times$ historical expected max drawdown.
  - Relegated to Research: Expectancy $< -0.10\text{R}$ across $\ge 20$ trades.
  - Degraded (50% sizing): Expectancy $< 0$ or Profit Factor $< 1.0$.
- **False Breakout Metric with Intrabar Ambiguity Resolution**:
  - Detects if $+1\text{R}$ target and $-1\text{R}$ stop occur on the same daily bar (`hasIntrabarAmbiguity = true`).
  - Resolves conservatively (assumes stop hit first) to prevent optimistic backtest bias.

---

## 3. Non-Functional Specifications (NFS)

### NFS-01: Performance & Throughput
- **Signal Overlay Evaluation**: $< 20\text{ ms}$ per candidate scrip.
- **Intraday ORB Evaluation**: $< 5\text{ ms}$ response time per scrip during 09:15–09:30 IST market open.

### NFS-02: Cryptographic Audit Immutability
Every approved or rejected signal produces an immutable record with SHA-256 hash chaining:
$$\text{recordHash} = \text{SHA256}(\text{auditId} + \text{timestamp} + \text{rawSignalHash} + \text{inputSnapshotHash} + \text{previousRecordHash})$$

### NFS-03: SEBI Cash Shorting Compliance
Under Indian SEBI statutory regulations, naked short selling in the cash equity segment is strictly prohibited. Bearish patterns (S24, S26) are programmatically designated as **Holding Exits / Warning Alerts / Derivatives Hedges Only**.

---

## 4. Complete Verification & Unit Test Audit Matrix (28 / 28 Passing)

| Test ID | Module / Service | Specific Assertion Verified | Result |
| :--- | :--- | :--- | :---: |
| `TC-SQ-001` | `SignalQualityOverlay` | Independent Evidence Buckets: Correlated strategies in same bucket receive 1 credit | **PASS** |
| `TC-SQ-002` | `SignalQualityOverlay` | Canonical Composite Quality Score: 100-point canonical weights, multi-pillar evaluation | **PASS** |
| `TC-SQ-003` | `SignalQualityOverlay` | False Consensus Gatekeeper: Rejects candidate signals with < 2 independent buckets | **PASS** |
| `TC-SQ-004` | `SignalQualityOverlay` | High-Conviction Approval: Approves >= 2 buckets with score >= 70 | **PASS** |
| `TC-PS-001` | `CapitalProtection` | Multi-Constraint Adaptive Sizing: Clamps at min(risk 2%, concentration 8%, ADV 5%, Kelly) | **PASS** |
| `TC-PS-002` | `CapitalProtection` | Overnight Gap Risk Down-Scaling: Multi-tier downscaling when G95 > planned stop | **PASS** |
| `TC-CP-001` | `CapitalProtection` | 5-State Capital Preservation Machine: Transitions NORMAL -> CAUTION -> DEFENSIVE -> PRESERVATION -> MODEL_REVIEW | **PASS** |
| `TC-EX-001` | `CapitalProtection` | 4-Tier Exit & Parabolic Exhaustion: Evaluates hard stop, thesis failure, parabolic 50% scale-out | **PASS** |
| `TC-DELV-001` | `SignalQualityOverlay` | 90-Day Delivery Z-Score Normalization: Delivery spike > 2.5 std devs classified EXCEPTIONAL | **PASS** |
| `TC-CORR-001` | `CapitalProtection` | Portfolio Correlation Guardrails: Enforces 8% stock, 25% sector, 30% cluster ceiling | **PASS** |
| `TC-ORB-001` | `NewTechnical` | S10 15-Minute Intraday ORB: 15-min Close > Opening High AND RVOL >= 1.5x | **PASS** |
| `TC-AUD-001` | `SignalQualityOverlay` | Machine-Readable Audit Record: Produces structured compliance object for every decision | **PASS** |
| `TC-KILL-001` | `CapitalProtection` | 5-Tier Strategy Health & Kill Switch: Quarantines strategy upon 6 losses or 1.5x max drawdown | **PASS** |
| `TC-COST-001` | `CapitalProtection` | Indian Statutory Cost & Slippage Model: Computes exact post-friction net realized PnL | **PASS** |
| `TC-FLS-001` | `CapitalProtection` | False Breakout Metric: Identifies breakouts failing to reach +1R before hitting -1R | **PASS** |
| `TC-ING-001` | `UpstoxIngestor` | Live 15m ORB Status Retrieval: Queries SQLite and executes session-filtered confirmation | **PASS** |
| `TC-FLS-002` | `CapitalProtection` | Intrabar Ambiguity Resolution: Detects both +1R and -1R on same bar; applies conservative ordering | **PASS** |
| `TC-GAP-002` | `CapitalProtection` | Multi-Tier Gap Stress Framework: Evaluates G50, G90, G95, G99 for NORMAL/REDUCED/RESTRICTED tiers | **PASS** |
| `TC-AUD-002` | `SignalQualityOverlay` | SHA-256 Hash Chain Immutability: Verifies recordHash -> previousRecordHash cryptographic chain | **PASS** |
| `TC-PRF-001` | `SignalQualityOverlay` | Strategy-Specific Quality Profiles: Momentum profile eliminates valuation penalty for breakouts | **PASS** |
| `TC-S8B-001` | `NewTechnical` | S8B Classical Bull Flag: Validates 25% pole, tight flag, volume dry-up, and rim breakout | **PASS** |
| `TC-S21-001` | `NewTechnical` | S21 Cup & Handle Pivot Structure: Depth 15-40%, right rim alignment, dry handle, rim breakout | **PASS** |
| `TC-S22-001` | `NewTechnical` | S22 TTM Volatility Squeeze: BB inside Keltner Channel coiling >= 3 bars and momentum fire | **PASS** |
| `TC-S23-001` | `NewTechnical` | S23 Classical Double Bottom: Neckline breakout required; holds in WATCH when unbroken | **PASS** |
| `TC-S24-001` | `NewTechnical` | S24 Double Top Distribution Exit: Volume divergence warning, SCALE_OUT on neckline breakdown | **PASS** |
| `TC-S25-001` | `NewTechnical` | S25 Inverse Head & Shoulders: Structural multi-month reversal with symmetric shoulders | **PASS** |
| `TC-S26-001` | `NewTechnical` | S26 H&S Distribution Exit: Triggers EXIT_OR_HEDGE upon neckline support breakdown | **PASS** |
| `TC-ORB-002` | `NewTechnical` | Time-of-Day Normalized RVOL: Compares 09:45 volume against historical 09:45 intraday bucket | **PASS** |

---

## 5. Production Readiness Statement

**Unit Test Verification**: 28 / 28 unit tests pass with 100% green coverage.  
**Live Trading Sign-Off**: Production trading readiness remains contingent on:
1. Out-of-sample walk-forward backtesting across bull, bear, and high-volatility regimes.
2. Point-in-time corporate action adjustments (splits, bonuses, rights) with zero survival bias.
3. Latency benchmarking under live order execution conditions.
4. Forward paper-trading acceptance over a minimum 60-session incubation window.
