# WealthOS Strategy Capability Map
**Generated via Phase Zero / Wave 1 Repository Code Inspection**  
**Source Authorities:** `src/server/services/StrategyParameterConfig.ts`, `docs/strategies/`, `AGENTS.md`, `src/server/services/PureTechnicalStrategiesEngine.ts`

---

## 1. Canonical Strategies (S1 through S10)

WealthOS defines a 10-strategy institutional technical library configured in `StrategyParameterConfig.ts`:

| Strategy ID | Canonical Name | Short Identifier | Category | Production Implementation | Engine / Service | Active Status | MCP Tool Mapping |
|---|---|---|---|---|---|---|---|
| **S1** | VPA Base Breakout | `S1` | BREAKOUT | `StrategyParameterConfig.ts` (`S1_VPA_BASE_BREAKOUT`) | `PureTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S1'] })` |
| **S2** | Institutional FVG/CE | `S2` | PULLBACK | `StrategyParameterConfig.ts` (`S2_INSTITUTIONAL_FVG_CE`) | `PureTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S2'] })` |
| **S3** | HH/HL Compaction | `S3` | BREAKOUT | `StrategyParameterConfig.ts` (`S3_HH_HL_COMPACTION`) | `PureTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S3'] })` |
| **S4** | HH/HL + SMA200 + VPA | `S4` | BREAKOUT | `StrategyParameterConfig.ts` (`S4_HH_HL_SMA200_VPA`) | `PureTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S4'] })` |
| **S5** | 50 EMA Pullback VCP | `S5` | PULLBACK | `StrategyParameterConfig.ts` (`S5_50EMA_PULLBACK_VCP`) | `PureTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S5'] })` |
| **S6** | RS Breakout (Nifty 500) | `S6` | BREAKOUT | `StrategyParameterConfig.ts` (`S6_RS_BREAKOUT`) | `NewTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S6'] })` |
| **S7** | RSI Mean-Reversion Dip | `S7` | MEAN_REVERSION | `StrategyParameterConfig.ts` (`S7_RSI_MEAN_REVERSION`) | `NewTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S7'] })` |
| **S8** | High-Tight Flag | `S8` | MOMENTUM | `StrategyParameterConfig.ts` (`S8_HIGH_TIGHT_FLAG`) | `NewTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S8'] })` |
| **S9** | Volume Dry-Up RS | `S9` | MOMENTUM | `StrategyParameterConfig.ts` (`S9_VOLUME_DRYUP_RS`) | `NewTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S9'] })` |
| **S10** | Trendline ORB | `S10` | INTRADAY_HYBRID | `StrategyParameterConfig.ts` (`S10_TRENDLINE_ORB`) | `NewTechnicalStrategiesEngine` | ACTIVE | `evaluate_strategies({ strategies: ['S10'] })` |

---

## 2. Specialized & User-Defined Strategy Variants

In addition to S1–S10, WealthOS contains specific, specialized production setups documented in `docs/strategies/` and `AGENTS.md`:

| Strategy Variant | Full Name | Specification Source | Production Service / Engine | Active Data Coverage | MCP Mapping | Notes |
|---|---|---|---|---|---|---|
| **S1A** | VPA 3-Leg Swing Setup | `docs/strategies/S1A/S1A.original.txt` | `PureTechnicalStrategiesEngine.ts` | 90-day scan in `reports/readiness/vpa_three_leg/` | `evaluate_strategies({ strategies: ['S1A'] })` | **CRITICAL:** Distinct from S1 Base Breakout. Do NOT substitute S1 for S1A. |
| **S1B** | VPA Trough-Reversal Setup | `docs/strategies/S1B/S1B.original.txt` | `PureTechnicalStrategiesEngine.ts` | 90-day scan (`s1b_full_universe_90_20260929_*.json`) | `evaluate_strategies({ strategies: ['S1B'] })` | Validated reversal setup |
| **S2A** | Institutional FVG / Consequent Encroachment | `docs/strategies/S2A/S2A.original.txt` | `PureTechnicalStrategiesEngine.ts` | 90-day scan (`s2a_full_universe_90_20260929_*.json`) | `evaluate_strategies({ strategies: ['S2A'] })` | Fair Value Gap mid-point retest |
| **S3A** | HH/HL ATR Compression | `src/server/services/S3aStrategy.ts` | `S3aStrategy.ts` | 90-day scan (`s3a_full_universe_90_20260929_*.json`) | `evaluate_strategies({ strategies: ['S3A'] })` | Strict 50-EMA floor + ATR squeeze |
| **S4A** | Gap Running Stocks | `src/server/services/S4aGapRunningStrategy.ts` | `S4aGapRunningStrategy.ts` | 90-day scan (`s4a_full_universe_90_20260929_*.json`) | `evaluate_strategies({ strategies: ['S4A'] })` | Weekly pivot-5 + gap breakout |
| **S4B** | Gap Pullback Contraction | `src/server/services/PureTechnicalStrategiesEngine.ts` | `PureTechnicalStrategiesEngine.ts` | 90-day scan (`s4b_full_universe_90_20260929_*.json`) | `evaluate_strategies({ strategies: ['S4B'] })` | Gap-up pullback with VPA contraction |
| **S5A** | Minervini Winning Stocks | `src/server/services/S5aMinerviniStrategy.ts` | `S5aMinerviniStrategy.ts` | 90-day scan (`s5a_full_universe_90_20260929_*.json`) | `evaluate_strategies({ strategies: ['S5A'] })` | 52-week VCP qualification + ATR stop |

---

## 3. Discrepancy & Verification Rules

1. **S1 vs S1A Distinction:** As required by `AGENTS.md`, `S1A` refers specifically to the user's Volume Price Alignment 3-leg swing setup and must not be conflated with `S1_VPA_BASE_BREAKOUT`.
2. **Scan Result Ground-Truth:** Full-universe candidates for `S1B`, `S2A`, `S3A`, `S4A`, `S4B`, and `S5A` are persisted as immutable scan artifacts in `reports/readiness/vpa_three_leg/`.
3. **No Synthetic Strategy Passing:** If a security does not meet the exact mathematical conditions on daily candle closes, `evaluate_strategies` must report `matched: false`.
