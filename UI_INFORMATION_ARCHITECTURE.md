# WealthOS UI Information Architecture

## 1. OVERVIEW (System Status & Context)
- **Routes:** `/overview`, `/dashboard`
- **Components:** `CommandCenterRightDrawer`, `RealTimeAlertBanner`, `DashboardView`, `QuantEngineDashboardV5`
- **Purpose:** System Status, Market Context, Qualified Opportunities, Watchlist Changes, Portfolio Risk, Data / Audit Warnings.

## 2. DISCOVER (Opportunity Generation)
- **Routes:** `/discover`
- **Components:** `DiscoverWorkspace` (consolidates `MultibaggerScreenerView`, `OpportunityEngineMasterView`, `SunriseIndustrialUniverseView`)
- **Purpose:** Screener, Opportunity Engine, Strategy discovery, Comparison Tray.

## 3. ANALYZE (Stock Intelligence)
- **Routes:** `/analyze/:symbol`
- **Components:** `StockIntelligenceView`, `MasterQuantDossier11TabsView`, `StockDossierView`
- **Purpose:** Canonical reusable stock-analysis workspace (StockHeader, AnalystSummary, SignalOverview, EvidenceSpine, TenGateAnalysis).

## 4. PORTFOLIO (Risk & Exposure)
- **Routes:** `/portfolio`
- **Components:** `PortfolioHubView`, `AdvancedPortfolioAnalyticsDashboard`, `RiskAnalyticsModal`
- **Purpose:** Portfolio Risk, Exposure, Concentration, Liquidity, Gap Risk, Capital Protection, Positions.

## 5. RESEARCH (Thematic & Strategy)
- **Routes:** `/research`
- **Components:** `ResearchAgentDossierView`, `KnowledgeLabView`, `StrategyBuilderPanel`
- **Purpose:** Strategy health, Backtesting comparisons, Institutional Hub.

## 6. AUDIT & SYSTEM
- **Routes:** `/audit`, `/settings`
- **Components:** `ReconciliationView`, `DatabaseSizeInspector`, `SettingsHubView`, `SettingsView`
- **Purpose:** Provenance logs, Data verification, System settings, Telemetry pipeline.
