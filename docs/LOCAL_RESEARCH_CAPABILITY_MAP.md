# WealthOS Local Research & Selection Lifecycle
## Phase 1: Local Capability Inventory

This document maps the existing local capabilities required to run the stock discovery, research, QGLP, backtesting, paper-trading, alerting, and reporting lifecycle completely offline (bypassing Google AI Studio modules for now).

| Capability | Current Service / File | Data Source | Status | What Blocks Product Use |
|------------|------------------------|-------------|--------|-------------------------|
| **7 Alphanumeric Strategies** | `src/server/services/SevenStrategiesCandidatesService.ts` | Local DB (`strategy_scan_cache`) | PARTIAL | UI wiring may be incomplete; requires robust parameter UI inputs. |
| **Technical Scan Engine** | `src/server/services/PureTechnicalStrategiesEngine.ts`, `TechnicalAnalysisEngine.ts` | DuckDB OHLCV / Local DB | EXISTS_NEEDS_VALIDATION | - |
| **Technical Indicators** | `src/server/services/TechnicalMomentumEngine.ts`, `TechnicalAnalysisEngine.ts` | DuckDB OHLCV | EXISTS_NEEDS_VALIDATION | - |
| **OHLCV / DuckDB Bridge** | `src/server/services/DuckDbAdjustedOhlcvService.ts` | DuckDB / Stooq Data | EXISTS_NEEDS_VALIDATION | - |
| **Sector/Index OHLCV** | `src/server/services/SectorMomentumService.ts`, `SectorFlowService.ts` | DuckDB OHLCV | EXISTS_NEEDS_VALIDATION | - |
| **Sector Momentum** | `src/server/services/SectorMomentumService.ts` | Sector indices | EXISTS_NEEDS_VALIDATION | Missing symbol-to-sector mappings can cause dropouts. |
| **Trendlyne Facts** | `src/server/services/TrendlyneIntelligenceService.ts` | Trendlyne APIs / Local DB cache | EXISTS_NEEDS_VALIDATION | Data can become stale; requires deterministic reingestion job. |
| **FERE/XBRL Canonical Facts** | `src/server/services/FereEvidenceService.ts`, `XbrlIngestionService.ts` | XBRL / FERE Database | EXISTS_NEEDS_VALIDATION | - |
| **QGLP Engine** | `src/server/services/intelligence/engines/QglpEngine.ts`, `QglpScoringRules.ts` | FERE & Trendlyne Evidence | WORKING | Needs strict null checks and blocking rules in UI for DATA_INSUFFICIENT cases. |
| **Fundamental Analysis Builder**| `src/server/services/intelligence/builders/FundamentalAnalysisBuilder.ts` | QGLP Engine | EXISTS_NEEDS_VALIDATION | - |
| **Scrip Intelligence Dossier** | `src/server/services/ScripIntelligenceDossierService.ts` | Multiple Services (Promise.all) | WORKING | Was modified to fail-closed successfully, preventing hallucination. |
| **Backtesting** | `src/server/services/QuantitativeBacktestScheduler.ts`, `PriceActionBacktestEngine.ts` | Local OHLCV | EXISTS_NEEDS_VALIDATION | UI for running deterministic strategy backtests from Discover. |
| **Paper Trading** | `src/server/services/PaperTradingPotService.ts` | Simulated Pot | PARTIAL | Needs Sandbox connection directly from Discover/Analyze flow. |
| **Alerting** | `src/server/services/AlertEngine.ts` | Local Events / Technicals | PARTIAL | Requires UI components for alert rule definition and polling worker active. |
| **Excel Dossier Generation** | `src/server/services/ExcelExportService.ts` | Dossier output | PARTIAL | Currently tailored to strategy scan summary (Phase D). Needs to be expanded to full executive summary, pivot-style candidate views, missingness sheets, etc. |

---
**Review Summary**
The backend architectural foundation for the entire local lifecycle exists and is highly functional. The primary blockers for local usage revolve around:
1. End-to-end UI orchestration (wiring Discover -> Analyze -> Backtest -> Paper Trade -> Alerting).
2. Expanding the Excel Export logic to include the requested 5 sheets for full 360 dossiers.
3. Constructing the Data Completeness Dashboard to visualize "what is missing" transparently.
