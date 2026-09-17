# Full App Review — Gap Analysis vs Spec Documents
**Generated:** 2026-09-09  
**Reviewed Specs (chronological):** master_app_specification_v4_addendum.md (9/5), MASTER_APPLICATION_SPECIFICATION.md (9/6), dev_spec_opportunity_engine.md (9/5), opportunity_engine_specifications.md (9/7), opportunity_engine_critical_review_and_v4_spec.md (9/7), implementation_plan_v2_enhanced.md (9/7), master_app_specification.md (9/8), SPECS_DATA_PIPELINE_AND_PARAMETERIZATION.md (9/9), SPECS_UNIFIED_10_STRATEGY_PARAMETERIZATION.md (9/9)

---

## Section 1: Spec Summary

| Doc | Covers |
|---|---|
| `MASTER_APPLICATION_SPECIFICATION.md` v5 (9/6) | Complete 12-hub architecture, UI design tokens, multi-entity PAN model, all engine inventory |
| `master_app_specification_v4_addendum.md` (9/5) | Phase 7 — external intelligence & sentiment fusion (news, social, F&O deep analytics, SRC-1 through SRC-8), data source registry |
| `dev_spec_opportunity_engine.md` (9/5) | Phase 0 INFRA-1 through INFRA-6 foundations (calendar, decimal precision, staleness, dedup, calibration, audit), Phases 1–6 opportunity engine build plan |
| `opportunity_engine_specifications.md` v4.0 (9/7) | Zero-fabrication mandate, official sourced data (NSE/BSE/AMFI/SEBI/CDSL), 7-stage pipeline, provenance tagging, adverse event auto-suppression |
| `opportunity_engine_critical_review_and_v4_spec.md` (9/7) | Critical review identifying 5 disqualifying flaws: synthetic turnover, no news pipeline, no derivatives sourcing, no macro lens, no validation loop |
| `implementation_plan_v2_enhanced.md` (9/7) | Calibrated tiering (Top 5/10/25), FilterSelectivityAuditor, tier_calibration_ledger, hysteresis/rank-stability rules |
| `master_app_specification.md` v8.0 (9/8) | Most recent canonical spec — Ledoit-Wolf shrinkage Kelly, Student-t fat-tail, PCA factor orthogonalization, 5+4 high-alpha setups, INFRA-7/8 |
| `SPECS_DATA_PIPELINE_AND_PARAMETERIZATION.md` (9/9) | New data pipeline — DailyOHLCV, Upstox-first, NSE Bhavcopy backfill, universe expansion |
| `SPECS_UNIFIED_10_STRATEGY_PARAMETERIZATION.md` (9/9) | 10-strategy parameterization, 9 parameter families, TypeScript interfaces, DB schemas |

---

## Section 2: ✅ Implemented Features (confirmed in code)

### Core Financial Engine
- **FIFO Capital Gains Engine** (`src/server/services/`)  — exists, handles lot-matching, corporate actions
- **Post-Tax XIRR** (`PostTaxXirrService.ts`) — implemented
- **Corporate Actions Engine** (`CorporateActionsEngine`) — exists with Section 94(7)/94(8) stripping disallowances
- **Multi-Broker Reconciliation** (`MultiBrokerReconService`) — implemented
- **Tax Harvesting Engine** (`TaxHarvestingEngine.ts`) — implemented
- **NRI Wealth & FEMA** (`NriWealthService.ts`) — implemented
- **Risk Analytics Engine** (`RiskAnalyticsEngine.ts`) — implemented

### Infrastructure (INFRA-1 through INFRA-6)
- **INFRA-1: Trading Calendar** (`tradingCalendar.ts`) — implemented
- **INFRA-2: Decimal Precision** (`decimalUtils.ts`) — implemented
- **INFRA-3: Feed Staleness** (`infraServices.ts`) — implemented
- **INFRA-4: Idempotent Dedup** (`fill_registry` table + `TransactionDeduplicationService`) — implemented
- **INFRA-5: Calibration Ledger** (`ScoringModelVersion`, `SignalBrierScoreLog` tables) — exists
- **INFRA-6: Audit Ledger** (`ActionHistory`, `DataChangeLog` tables) — implemented

### Opportunity Engine
- **ConsolidatedOpportunityEngine** — 7-stage pipeline exists
- **SmartMoneyFlowEngine** — real bulk/block deals from NSE, not synthetic
- **InstitutionalBuyersService** — sourced data from NSE filings
- **FnOIntelligenceService** — PCR, max pain, IV (non-fabricating fallback confirmed)
- **MacroRegimeClassifierService** — exists (though macro inputs need richer sourcing)
- **FilterSelectivityAuditor** (`FilterSelectivityAuditor.ts`) — exists (per implementation_plan spec)
- **tier_calibration_ledger** table — exists in database.ts
- **tier_membership_history** table — exists in database.ts
- **Zero-fabrication discipline** — confirmed: "No synthetic fabricated" comments throughout engine

### Data Pipeline (new — built this session)
- **DailyOHLCV** table — ✅ created
- **IndexOHLCV + IndexConstituents** tables — ✅ created
- **FundamentalData** table — ✅ created
- **IntradayCandles** table — ✅ created
- **CustomStrategies + CustomStrategyBacktests** tables — ✅ created
- **NseBhavcopyService.backfillHistoricalData()** — ✅ built
- **MarketDataIngestorService** Upstox daily + intraday fetcher — ✅ built
- **UniverseManagerService** (NSE EQUITY_L → full 2100+ universe) — ✅ built

### Strategy Framework (new — built this session)
- **S1-S4** existing strategies + 52w low filter corrected (S3/S4 turnover OR removed) — ✅
- **S5-S10** new strategies implemented as config-driven evaluators — ✅
- **StrategyParameterConfig** with 9 families, ~95 parameters — ✅
- **CustomStrategies save/load** routes — ✅
- **Strategy comparison UI** (10-strategy tabs/matrix) — ✅
- **StrategyParameterEditorView** (family-grouped sliders, save/load) — ✅

### UI
- **12-hub screen architecture** — confirmed (FamilyOfficeCommandCenter, PortfolioHub, AnalyticsHub, ReportStudio, TaxCenter, CorporateActions, NRIWealth, Opportunities, ScripIntelligence, Imports, Settings, CommandCenter)
- **Dark Midnight Obsidian theme** — implemented (bg-slate-900, emerald/rose accents)
- **PaperTradingPotService** — exists with paper positions ledger
- **PredictionAccuracyEngine** — Brier scoring, Wilson CIs implemented

---

## Section 3: ❌ Missing / Not Yet Built

### Phase 7: External Intelligence & Sentiment (master_app_spec_v4_addendum.md)
1. **SRC-1: Source Adapter Framework** — `data_sources` and `source_adapter_runs` tables do NOT exist. No adapter registry.
2. **SRC-2: Fundamental Cross-Validation** — `fundamental_metric_conflicts` table does NOT exist. No multi-source cross-check of PE/ROE/promoter holding. Currently single-source (Screener.in scrape).
3. **SRC-3: News & Event Ingestion Pipeline** — `news_events` table does NOT exist. No NSE/BSE corporate announcement feed integration. No NLP event classification. No adverse event auto-suppression feeding from news.
4. **SRC-4: Social/Retail Sentiment Engine** — `social_sentiment_daily` table does NOT exist. No sentiment ingestion.
5. **SRC-6: F&O Chain Deep Analytics** — `options_chain_snapshot` and `derived_options_metrics` tables do NOT exist. `FnOIntelligenceService` has schema columns but no scheduled ingestion of NSE participant-wise OI or daily F&O bhavcopy.
6. **SRC-7/SRC-8: Macro indicators sourced** — RBI DBIE, MOSPI, US Treasury feeds not ingested. MacroRegimeClassifier runs but on limited data.

### Backtesting (comprehensive_5y spec)
7. **5-year walk-forward backtester** against DailyOHLCV — the existing `PriceActionBacktestEngine` takes an OHLCV array but has no integration with the new DailyOHLCV table. The `RegimeBacktestEngine` queries `MarketSnapshots` (only 200 days). Neither can do a proper 5-year backtest yet.
8. **Strategy-specific backtesting for S5-S10** — S5-S10 evaluators are implemented but have no backtesting integration.

### Sunrise Industrial Universe (sunrise_industrial_growth_universe_specification.md)
9. **Sunrise sectors / thematic universe** (`sunrise_industrial_growth_universe_specification.md`) — specification exists but no dedicated sunrise-sector filter/universe service found in codebase.

### Institutional Light Theme
10. **Institutional Light (default) theme** — spec mandates this as the PRIMARY theme (`#F7F8FA` canvas, `#0B3D91` sovereign navy). The app is currently fully dark (Midnight Obsidian). The `ui_ux_design_specification_v5_light.md` specifies the light theme but it does not appear to be the default — `index.html` has `class="dark"` hardcoded.

### Kelly & Factor Models
11. **Ledoit-Wolf Shrinkage covariance** — referenced in master_app_specification.md v8.0 (`INV-COV-1`) as approved. Not found in codebase (existing `OpportunityEnginePhase4to6` uses a simpler half-Kelly).
12. **Fat-tail Student-t Kelly with EWMA volatility** — specified in v8.0, not implemented.
13. **PCA Factor Orthogonalization with Brier weights** (`INV-FUSION-1`) — not found.

### Data Provenance Registry
14. **`data_sources` table** — specified in v4_addendum §2, needed for ToS tracking, reliability tiers. Not in database.ts.

---

## Section 4: 🐛 Known Bugs / Data Integrity Issues

### Pre-existing TypeScript Errors (5 files)

**Bug 1: `ConsolidatedOpportunity` frontend interface missing fields**
- **File:** `src/components/OpportunityEngineMasterView.tsx`, lines 3422, 3424, 3426, 3430, 3720, 3722, 3724, 3729
- **Error:** `Property 'dataFreshnessLabel' does not exist on type 'ConsolidatedOpportunity'`
- **Root cause:** `ConsolidatedOpportunityEngine.ts` sets `dataFreshnessLabel` (line 2778) and defines it in the backend type (line 324), but the **frontend** `ConsolidatedOpportunity` interface in `OpportunityEngineMasterView.tsx` (line 72) is missing this field.
- **Fix:** Add `dataFreshnessLabel?: 'LIVE' | 'CACHED' | 'ESTIMATED';` to the `ConsolidatedOpportunity` interface in `OpportunityEngineMasterView.tsx` around line 150.

**Bug 2: `ConsolidatedOpportunity.quarterlyResults` missing `latestSalesCr`**
- **File:** `src/server/services/ConsolidatedOpportunityEngine.ts`, lines 928-929
- **Error:** `Property 'latestSalesCr' does not exist on type '{ latestQuarter: string; revenueGrowthYoY: ... }'`
- **Root cause:** `screenerService.ts` returns `latestSalesCr` in its quarterly result (line 42, 436), but `ConsolidatedOpportunityEngine`'s local `quarterlyResults` type definition doesn't include this field.
- **Fix:** Add `latestSalesCr?: number;` to the `quarterlyResults` inline type in `ConsolidatedOpportunityEngine.ts` around line 920.

**Bug 3: `FlexibleTelemetryPipelineService.ts` using non-existent `sma200` and `p0` fields**
- **File:** `src/server/services/FlexibleTelemetryPipelineService.ts`, line 389
- **Error:** `Property 'sma200' / 'p0' does not exist on type 'ConsolidatedOpportunity'`
- **Root cause:** The code accesses `opp.sma200` and `opp.p0` which were previously valid fields on `ConsolidatedOpportunity` but appear to have been renamed or removed from the interface.
- **Fix:** Check what these fields are called in the current `ConsolidatedOpportunity` interface and update line 389 accordingly. The relevant technical fields in the current interface may be `atrContractionRatio` or other technical fields.

**Bug 4: `YouTubeResearchIntelligenceEngine.ts` — `exec` not found + `synthesis_json` missing**
- **File:** `src/server/services/YouTubeResearchIntelligenceEngine.ts`, lines 184, 386
- **Error 1:** `Cannot find name 'exec'` at line 184 — likely missing `import { exec } from 'child_process'`
- **Error 2:** `Property 'synthesis_json' does not exist on type 'unknown'` at lines 386 — DB query result needs explicit casting
- **Fix:** Add `import { exec } from 'child_process';` at the top of the file. For line 386, cast the DB result as `any` before accessing `.synthesis_json`.

### Data Integrity Issues (from opportunity_engine_critical_review spec)
5. **Synthetic turnover tiers still possible elsewhere** — while `SmartMoneyFlowEngine` has "Never fabricate" comments, verify `OpportunityScannerEngine.ts` does not still have hardcoded tier bands (the critical review flagged `"Tier 1: ₹1,450–1,850 Cr"` patterns).
6. **`InstitutionalBuyersService` provenance labeling** — the critical review noted it was labeling synthetic data as `SOURCED`. Current code at line 356 has `// Never fabricate or extrapolate block deals` — verify this is complete.

---

## Section 5: ⚠️ Partial / Needs Work

1. **MacroRegimeClassifier** — exists but macro input sourcing is incomplete. Spec requires RBI DBIE, MOSPI IIP/CPI, Brent crude, DXY, India VIX as inputs. Currently relies on limited data.

2. **FnOIntelligenceService** — schema exists for PCR/OI but no scheduled ingestion of NSE daily F&O participant-wise OI. Returns non-fabricated empty snapshots when data unavailable — correct behavior, but the ingestion pipeline to actually populate it needs to be built.

3. **NSE FII/DII Daily Report ingestion** — `opportunity_engine_specifications.md` requires `SOURCED: NSE_FII_DII_DAILY` data. Currently NseBhavcopyService handles equity bhavcopy but the separate FII/DII CSV download from nseindia.com/reports/fii-dii is not automated.

4. **Walk-forward backtest integration with DailyOHLCV** — `RegimeBacktestEngine` still queries `MarketSnapshots` (only 200 days). Now that `DailyOHLCV` has 5 years of data, `RegimeBacktestEngine.getDailyCandlesForScrip()` should prefer `DailyOHLCV`.

5. **Brier score calibration gate** — `SignalBrierScoreLog` and `ScoringModelVersion` tables exist and `PredictionAccuracyEngine` is implemented, but the minimum sample gate ($N \ge 15$) enforcement — blocking promotion from `Informational` to `Actionable` — needs to be verified as active, not just logging.

6. **AMFI Monthly MF Portfolio ingestion** — spec requires monthly AMC portfolio disclosures for "DII Mutual Fund buyer" data. Not currently automated (requires AMFI website parsing).

7. **`StrategyComparisonSets` UI** — the DB table was created but no UI for saved comparison sets was wired up.

8. **Sunrise Industrial/Thematic Universe** — `sunrise_industrial_growth_universe_specification.md` specifies a thematic sector universe (Defense, Green Energy, AI, EVs — relevant for S8 HTF strategy). The universe manager only tiers by market cap; no sector/theme tagging.

---

## Section 6: 🔧 Pre-existing TS Errors — Root Cause & Fix

### Fix 1: `OpportunityEngineMasterView.tsx` — `dataFreshnessLabel`
**File:** `src/components/OpportunityEngineMasterView.tsx`  
**Location:** ~line 150 (after `lastUpdated: string;`)  
**Add:**
```typescript
dataFreshnessLabel?: 'LIVE' | 'CACHED' | 'ESTIMATED';
```

### Fix 2: `ConsolidatedOpportunityEngine.ts` — `latestSalesCr` 
**File:** `src/server/services/ConsolidatedOpportunityEngine.ts`  
**Location:** Around line 915-920, find the inline type for `quarterlyResults`  
**Add** `latestSalesCr?: number;` to the quarterlyResults type definition.

### Fix 3: `FlexibleTelemetryPipelineService.ts` — `sma200` / `p0`
**File:** `src/server/services/FlexibleTelemetryPipelineService.ts`  
**Location:** Line 389  
**Action:** Determine current field names — `opp.sma200` likely maps to a different field in `ConsolidatedOpportunity`. Either add `sma200?: number; p0?: number;` to the frontend interface, or update the pipeline service to use the correct field names.

### Fix 4: `YouTubeResearchIntelligenceEngine.ts` — `exec` + `synthesis_json`
**File:** `src/server/services/YouTubeResearchIntelligenceEngine.ts`  
**Line 184:** Add `import { exec } from 'child_process';`  
**Lines 386:** Change `row.synthesis_json` to `(row as any).synthesis_json`

---

## Priority Execution Order

| Priority | Item | Effort | Impact |
|---|---|---|---|
| P0 | Fix 4 pre-existing TS errors (Section 6) | 30 min | Unblocks build |
| P0 | Wire RegimeBacktestEngine → DailyOHLCV (5yr data) | 2hr | Unlocks real backtesting |
| P1 | SRC-3: NSE corporate announcement feed + adverse event filter | 3-4 days | Core zero-fabrication requirement |
| P1 | FnOIntelligenceService daily NSE F&O participant OI ingestion | 1-2 days | Completes derivatives sourcing |
| P1 | NSE FII/DII daily report automated ingestion | 1 day | Real institutional flow data |
| P2 | Institutional Light theme as default | 2-3 days | Spec mandates it as primary |
| P2 | `data_sources` registry table + SRC-1 adapter framework | 1-2 days | Foundation for Phase 7 |
| P2 | Sunrise thematic sector tagging in universe | 1 day | Required for S8 High-Tight Flag |
| P3 | Ledoit-Wolf + Student-t Kelly | 3-4 days | Higher-fidelity position sizing |
| P3 | Social sentiment pipeline (official API only) | 2-3 days | Phase 7 completion |
